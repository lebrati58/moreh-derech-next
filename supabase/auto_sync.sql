-- Moreh Derech NEXT — עדכונים אוטומטיים (synchronisation automatique du Drive de l'école).
-- À exécuter UNE FOIS dans Supabase > SQL Editor > Run, APRÈS install.sql (utilise mdl.check_admin).
-- Ré-exécutable sans perte. Ne touche à aucune banque de questions existante.
--
-- Tables privées (aucun accès direct) :
--   sync_config   réglages (pause, publication auto ou revue, empreinte du secret du robot)
--   sync_runs     une ligne par synchronisation, avec le rapport en hébreu (דוח עדכון)
--   sync_files    fichiers du Drive déjà analysés (identifiant, version, empreinte du contenu) → pas de réimport
--   sync_items    tout ce qui a été généré : publié, en attente de validation, refusé, annulé
--   sync_requests demandes manuelles (« סנכרן עכשיו », publication, annulation)
-- Deux portes d'entrée :
--   * le robot (workflow GitHub) : fonctions sync_bot_*, protégées par un secret dont seule l'empreinte est stockée ;
--   * l'admin (page sync.html) : fonctions admin_sync_*, protégées par le jeton de session admin habituel.
create schema if not exists mdl;
revoke all on schema mdl from public;

create table if not exists mdl.sync_config (
  id boolean primary key default true check (id),
  secret_hash text,
  paused boolean not null default false,
  publish_mode text not null default 'auto' check (publish_mode in ('auto','review')),
  end_date date not null default '2027-07-31',
  updated_at timestamptz not null default now()
);
insert into mdl.sync_config default values on conflict do nothing;

create table if not exists mdl.sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('courses','tours','all','publish','rollback')),
  trigger text not null default 'cron' check (trigger in ('cron','manual','fallback','test')),
  status text not null default 'running' check (status in ('running','success','partial','failed','skipped','rolled_back')),
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  docs_scanned int not null default 0,
  docs_new int not null default 0,
  docs_changed int not null default 0,
  sites_added int not null default 0,
  questions_created int not null default 0,
  questions_corrected int not null default 0,
  pending_count int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  report_he text not null default '',
  commit_sha text,
  branch text,
  github_run_url text,
  request_id uuid
);
create index if not exists sync_runs_by_time on mdl.sync_runs (started_at desc);

create table if not exists mdl.sync_files (
  file_id text primary key,
  title text not null default '',
  path text not null default '',
  mime text not null default '',
  category text not null default 'other',
  tour_id text,
  modified_time timestamptz,
  version text,
  content_hash text,
  status text not null default 'new' check (status in ('new','processed','skipped','audio_only','error')),
  attempts int not null default 0,
  last_error text,
  last_run uuid,
  outputs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists mdl.sync_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references mdl.sync_runs(id) on delete set null,
  kind text not null check (kind in ('question','open_question','site','event','route','correction','contradiction','concept')),
  status text not null default 'pending' check (status in ('published','pending','approved','rejected','rolled_back')),
  tour_id text,
  file_id text,
  fingerprint text,
  payload jsonb not null,
  reason text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  published_run uuid
);
create index if not exists sync_items_by_status on mdl.sync_items (status, created_at desc);
create unique index if not exists sync_items_fp on mdl.sync_items (kind, fingerprint) where fingerprint is not null;

create table if not exists mdl.sync_requests (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('sync','publish','rollback')),
  mode text not null default 'all',
  run_target uuid,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  requested_at timestamptz not null default now(),
  done_at timestamptz
);

revoke all on mdl.sync_config, mdl.sync_runs, mdl.sync_files, mdl.sync_items, mdl.sync_requests from public, anon, authenticated;

-- ---------------------------------------------------------------- robot (secret)
create or replace function mdl.check_sync(p_secret text) returns void
language plpgsql security definer set search_path = mdl, public as $$
declare h text;
begin
  select secret_hash into h from mdl.sync_config where id;
  if h is null or p_secret is null or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> h then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.sync_bot_config(p_secret text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare c mdl.sync_config;
begin
  perform mdl.check_sync(p_secret);
  select * into c from mdl.sync_config where id;
  return jsonb_build_object('paused', c.paused, 'publish_mode', c.publish_mode, 'end_date', c.end_date,
    'last_success', (select jsonb_object_agg(kind, d) from (select kind, max(started_at)::date as d from mdl.sync_runs
                      where status in ('success','partial') and not dry_run group by kind) x));
end $$;

create or replace function public.sync_bot_begin(p_secret text, p_kind text, p_trigger text, p_dry boolean, p_request uuid, p_url text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v uuid;
begin
  perform mdl.check_sync(p_secret);
  insert into mdl.sync_runs (kind, trigger, dry_run, request_id, github_run_url)
  values (p_kind, coalesce(p_trigger,'cron'), coalesce(p_dry,false), p_request, p_url) returning id into v;
  if p_request is not null then update mdl.sync_requests set status = 'running' where id = p_request; end if;
  -- une synchronisation interrompue (plus de 3 h) est marquée en échec pour ne pas rester « en cours »
  update mdl.sync_runs set status = 'failed', finished_at = now(), errors = errors || '["interrompue (délai dépassé)"]'::jsonb
   where status = 'running' and started_at < now() - interval '3 hours';
  return jsonb_build_object('id', v);
end $$;

create or replace function public.sync_bot_files(p_secret text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_sync(p_secret);
  return coalesce((select jsonb_object_agg(file_id, jsonb_build_object('version', version, 'modified_time', modified_time,
     'content_hash', content_hash, 'status', status, 'attempts', attempts)) from mdl.sync_files), '{}'::jsonb);
end $$;

create or replace function public.sync_bot_save_files(p_secret text, p_run uuid, p_files jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare f jsonb; n int := 0;
begin
  perform mdl.check_sync(p_secret);
  for f in select * from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    insert into mdl.sync_files (file_id, title, path, mime, category, tour_id, modified_time, version, content_hash, status, attempts, last_error, last_run, outputs, updated_at)
    values (f->>'file_id', coalesce(f->>'title',''), coalesce(f->>'path',''), coalesce(f->>'mime',''), coalesce(f->>'category','other'), f->>'tour_id',
            (f->>'modified_time')::timestamptz, f->>'version', f->>'content_hash', coalesce(f->>'status','processed'),
            coalesce((f->>'attempts')::int, 0), f->>'last_error', p_run, coalesce(f->'outputs','{}'::jsonb), now())
    on conflict (file_id) do update set title = excluded.title, path = excluded.path, mime = excluded.mime, category = excluded.category,
      tour_id = excluded.tour_id, modified_time = excluded.modified_time, version = excluded.version, content_hash = excluded.content_hash,
      status = excluded.status, attempts = excluded.attempts, last_error = excluded.last_error, last_run = excluded.last_run,
      outputs = excluded.outputs, updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('saved', n);
end $$;

-- Empreintes déjà connues (questions publiées ou en attente) : évite de reproposer une question déjà vue.
create or replace function public.sync_bot_fingerprints(p_secret text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_sync(p_secret);
  return coalesce((select jsonb_agg(kind || ':' || fingerprint) from mdl.sync_items where fingerprint is not null), '[]'::jsonb);
end $$;

create or replace function public.sync_bot_items(p_secret text, p_run uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare i jsonb; n int := 0;
begin
  perform mdl.check_sync(p_secret);
  for i in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into mdl.sync_items (run_id, kind, status, tour_id, file_id, fingerprint, payload, reason, published_run)
    values (p_run, i->>'kind', coalesce(i->>'status','pending'), i->>'tour_id', i->>'file_id', i->>'fingerprint', i->'payload',
            coalesce(i->>'reason',''), case when i->>'status' = 'published' then p_run end)
    on conflict (kind, fingerprint) where fingerprint is not null do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('saved', n);
end $$;

create or replace function public.sync_bot_approved(p_secret text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_sync(p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'tour_id', tour_id, 'file_id', file_id, 'fingerprint', fingerprint, 'payload', payload, 'note', note)
                    order by created_at) from mdl.sync_items where status = 'approved'), '[]'::jsonb);
end $$;

create or replace function public.sync_bot_mark(p_secret text, p_ids uuid[], p_status text, p_run uuid)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_sync(p_secret);
  if p_status not in ('published','rolled_back','pending') then return jsonb_build_object('error','bad_status'); end if;
  update mdl.sync_items set status = p_status, published_run = case when p_status = 'published' then p_run else published_run end
   where id = any(p_ids);
  return jsonb_build_object('ok', true);
end $$;

-- Annulation : toutes les questions publiées par une synchronisation passent à « annulée ».
create or replace function public.sync_bot_rollback(p_secret text, p_target uuid, p_run uuid)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare c text;
begin
  perform mdl.check_sync(p_secret);
  select commit_sha into c from mdl.sync_runs where id = p_target;
  update mdl.sync_items set status = 'rolled_back' where published_run = p_target and status = 'published';
  update mdl.sync_runs set status = 'rolled_back' where id = p_target;
  return jsonb_build_object('commit_sha', c);
end $$;

create or replace function public.sync_bot_finish(p_secret text, p_run uuid, p_r jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_sync(p_secret);
  update mdl.sync_runs set
    status = coalesce(p_r->>'status','success'), finished_at = now(),
    docs_scanned = coalesce((p_r->>'docs_scanned')::int,0), docs_new = coalesce((p_r->>'docs_new')::int,0),
    docs_changed = coalesce((p_r->>'docs_changed')::int,0), sites_added = coalesce((p_r->>'sites_added')::int,0),
    questions_created = coalesce((p_r->>'questions_created')::int,0), questions_corrected = coalesce((p_r->>'questions_corrected')::int,0),
    pending_count = coalesce((p_r->>'pending_count')::int,0), errors = coalesce(p_r->'errors','[]'::jsonb),
    summary = coalesce(p_r->'summary','{}'::jsonb), report_he = coalesce(p_r->>'report_he',''),
    commit_sha = p_r->>'commit_sha', branch = p_r->>'branch'
  where id = p_run;
  update mdl.sync_requests set status = case when p_r->>'status' = 'failed' then 'failed' else 'done' end, done_at = now()
   where id = (select request_id from mdl.sync_runs where id = p_run);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- administration (jeton admin)
-- Crée (ou remplace) le secret du robot. Il n'est montré qu'UNE fois : à copier dans GitHub (secret SYNC_SECRET).
create or replace function public.admin_sync_new_secret(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare s text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform mdl.check_admin(p_token);
  update mdl.sync_config set secret_hash = encode(sha256(convert_to(s, 'UTF8')), 'hex'), updated_at = now() where id;
  return jsonb_build_object('secret', s);
end $$;

create or replace function public.admin_sync_overview(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object(
    'config', (select jsonb_build_object('paused', paused, 'publish_mode', publish_mode, 'end_date', end_date, 'has_secret', secret_hash is not null) from mdl.sync_config where id),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) - 'summary' order by r.started_at desc) from (select * from mdl.sync_runs order by started_at desc limit 30) r), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'status', status, 'tour_id', tour_id, 'payload', payload, 'reason', reason, 'created_at', created_at, 'run_id', run_id) order by created_at desc)
                         from (select * from mdl.sync_items where status in ('pending','approved') order by created_at desc limit 200) i), '[]'::jsonb),
    'files', jsonb_build_object('total', (select count(*) from mdl.sync_files),
                                'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from mdl.sync_files group by status) x), '{}'::jsonb),
                                'errors', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'path', path, 'error', last_error, 'attempts', attempts))
                                                     from (select * from mdl.sync_files where status = 'error' order by updated_at desc limit 30) e), '[]'::jsonb)),
    'requests', coalesce((select jsonb_agg(to_jsonb(q) order by q.requested_at desc) from (select * from mdl.sync_requests order by requested_at desc limit 10) q), '[]'::jsonb),
    'now', now());
end $$;

create or replace function public.admin_sync_run(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object('run', (select to_jsonb(r) from mdl.sync_runs r where id = p_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'status', status, 'tour_id', tour_id, 'payload', payload, 'reason', reason) order by created_at)
                       from mdl.sync_items where run_id = p_id), '[]'::jsonb));
end $$;

create or replace function public.admin_sync_decide(p_token text, p_ids uuid[], p_decision text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  if p_decision not in ('approved','rejected','pending') then return jsonb_build_object('error','bad_decision'); end if;
  update mdl.sync_items set status = p_decision, note = left(coalesce(p_note,''), 500), decided_at = now()
   where id = any(p_ids) and status in ('pending','approved','rejected');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_sync_settings(p_token text, p_paused boolean, p_publish_mode text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  update mdl.sync_config set paused = coalesce(p_paused, paused),
    publish_mode = case when p_publish_mode in ('auto','review') then p_publish_mode else publish_mode end, updated_at = now() where id;
  return jsonb_build_object('ok', true);
end $$;

-- Appelée par le Worker (bouton « סנכרן עכשיו ») : vérifie l'admin et trace la demande.
create or replace function public.admin_sync_request(p_token text, p_action text, p_mode text, p_run uuid default null)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v uuid;
begin
  perform mdl.check_admin(p_token);
  if p_action not in ('sync','publish','rollback') then return jsonb_build_object('error','bad_action'); end if;
  if exists (select 1 from mdl.sync_requests where status in ('queued','running') and requested_at > now() - interval '20 minutes') then
    return jsonb_build_object('error','already_running');
  end if;
  insert into mdl.sync_requests (action, mode, run_target) values (p_action, coalesce(p_mode,'all'), p_run) returning id into v;
  return jsonb_build_object('id', v);
end $$;

revoke all on function mdl.check_sync(text) from public, anon, authenticated;
grant execute on function public.sync_bot_config(text), public.sync_bot_begin(text,text,text,boolean,uuid,text), public.sync_bot_files(text),
  public.sync_bot_save_files(text,uuid,jsonb), public.sync_bot_fingerprints(text), public.sync_bot_items(text,uuid,jsonb),
  public.sync_bot_approved(text), public.sync_bot_mark(text,uuid[],text,uuid), public.sync_bot_rollback(text,uuid,uuid),
  public.sync_bot_finish(text,uuid,jsonb), public.admin_sync_new_secret(text), public.admin_sync_overview(text),
  public.admin_sync_run(text,uuid), public.admin_sync_decide(text,uuid[],text,text), public.admin_sync_settings(text,boolean,text),
  public.admin_sync_request(text,text,text,uuid) to anon, authenticated;
