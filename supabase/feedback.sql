-- Moreh Derech NEXT — boîte à idées / signalements des élèves.
-- À exécuter UNE FOIS dans Supabase > SQL Editor > Run, APRÈS install.sql (utilise mdl.check_admin).
-- Ne touche à aucune banque de questions existante.
-- Table privée : les élèves écrivent uniquement via feedback_submit ; seul l'admin (jeton de session) lit.
-- Aucune position GPS n'est collectée. Le nom est facultatif.
create schema if not exists mdl;
revoke all on schema mdl from public;

create table if not exists mdl.feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('idea','bug','question','other')),
  message text not null check (char_length(message) between 5 and 2000),
  author text not null default '' check (char_length(author) <= 60),
  page text not null default '' check (char_length(page) <= 300),
  context jsonb not null default '{}'::jsonb,
  sender_hash text not null,
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_by_time on mdl.feedback (created_at desc);
create index if not exists feedback_by_sender on mdl.feedback (sender_hash, created_at desc);
revoke all on mdl.feedback from public, anon, authenticated;

create or replace function public.feedback_submit(
  p_kind text, p_message text, p_author text default '', p_page text default '',
  p_context jsonb default '{}'::jsonb, p_sender text default '')
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_msg text; v_sender text; v_ctx jsonb; v_id uuid;
begin
  if p_kind is null or p_kind not in ('idea','bug','question','other')
  then return jsonb_build_object('error','invalid_kind'); end if;
  v_msg := btrim(coalesce(p_message,''));
  if char_length(v_msg) < 5 then return jsonb_build_object('error','too_short'); end if;
  if char_length(v_msg) > 2000 then return jsonb_build_object('error','too_long'); end if;
  if p_sender is null or p_sender !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_sender'); end if;
  v_sender := encode(sha256(convert_to(p_sender,'UTF8')),'hex');
  -- contexte : uniquement quelques champs courts connus (jamais de coordonnées)
  v_ctx := '{}'::jsonb;
  if p_context is not null and jsonb_typeof(p_context) = 'object' then
    select coalesce(jsonb_object_agg(key, left(value #>> '{}', 80)), '{}'::jsonb) into v_ctx
    from jsonb_each(p_context)
    where key in ('tour','level','mode','question','stop','lang') and jsonb_typeof(value) in ('string','number');
  end if;
  if exists (select 1 from mdl.feedback where sender_hash = v_sender and message = v_msg
             and created_at > now() - interval '1 day')
  then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if (select count(*) from mdl.feedback where sender_hash = v_sender and created_at > now() - interval '1 hour') >= 10
  then return jsonb_build_object('error','sender_hour_limit'); end if;
  if (select count(*) from mdl.feedback where created_at > now() - interval '1 hour') >= 300
  then return jsonb_build_object('error','site_hour_limit'); end if;
  insert into mdl.feedback(kind, message, author, page, context, sender_hash)
  values (p_kind, v_msg, left(btrim(coalesce(p_author,'')),60), left(coalesce(p_page,''),300), v_ctx, v_sender)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_feedback_list(p_token text, p_status text default 'all')
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'message', f.message, 'author', f.author,
        'page', f.page, 'context', f.context, 'status', f.status, 'created_at', f.created_at)
        order by f.created_at desc)
      from (select * from mdl.feedback
            where p_status = 'all' or status = p_status
            order by created_at desc limit 500) f), '[]'::jsonb),
    'counts', jsonb_build_object(
      'new', (select count(*) from mdl.feedback where status = 'new'),
      'done', (select count(*) from mdl.feedback where status = 'done')));
end;
$$;

create or replace function public.admin_feedback_set_status(p_token text, p_id uuid, p_status text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform mdl.check_admin(p_token);
  if p_status not in ('new','done') then return jsonb_build_object('error','invalid_status'); end if;
  update mdl.feedback set status = p_status where id = p_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.feedback_submit(text,text,text,text,jsonb,text) from public;
revoke all on function public.admin_feedback_list(text,text) from public;
revoke all on function public.admin_feedback_set_status(text,uuid,text) from public;
grant execute on function public.feedback_submit(text,text,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.admin_feedback_list(text,text) to anon, authenticated;
grant execute on function public.admin_feedback_set_status(text,uuid,text) to anon, authenticated;
