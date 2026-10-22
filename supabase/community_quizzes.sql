-- Moreh Derech NEXT — bibliothèque publique de quiz indépendants.
-- À exécuter UNE FOIS dans le projet Supabase NEXT (SQL Editor), APRÈS les installations LIVE.
-- Aucun mot de passe de guide n'est requis pour les contributeurs.
-- Tables privées, accès public uniquement via des RPC avec validation serveur.
-- IMPORTANT : limites anti-spam de base. Pour un site très fréquenté, ajouter un CAPTCHA
-- vérifié côté serveur et une protection anti-abus au niveau Edge / réseau.

create schema if not exists mdl;
revoke all on schema mdl from public;

create table if not exists mdl.community_quizzes (
  id uuid primary key default gen_random_uuid(),
  from_place text not null check (char_length(from_place) between 2 and 100),
  to_place text not null check (char_length(to_place) between 2 and 100),
  payload jsonb not null,
  question_count smallint not null check (question_count between 1 and 25),
  owner_hash text not null,
  fingerprint text not null unique,
  state text not null default 'published' check (state in ('published','reported','deleted')),
  created_at timestamptz not null default now()
);
create index if not exists community_quizzes_live_time
 on mdl.community_quizzes (created_at desc) where state = 'published';
create index if not exists community_quizzes_author_time
 on mdl.community_quizzes (owner_hash,created_at desc);

create table if not exists mdl.community_quiz_reports (
  quiz_id uuid not null references mdl.community_quizzes(id) on delete cascade,
  reporter_hash text not null,
  at timestamptz not null default now(),
  primary key (quiz_id, reporter_hash)
);
create index if not exists community_reports_by_author
 on mdl.community_quiz_reports (reporter_hash,at desc);
revoke all on mdl.community_quizzes, mdl.community_quiz_reports from public,anon,authenticated;

create or replace function public.community_publish_quiz(p_payload jsonb, p_owner_token text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, mdl
as $$
declare
  v_owner text;
  v_fingerprint text;
  v_from text;
  v_to text;
  v_questions jsonb;
  v_q jsonb;
  v_o jsonb;
  v_n int;
  v_id uuid;
begin
  if p_owner_token is null or
     p_owner_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_owner_token'); end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text)>45000
  then return jsonb_build_object('error','invalid_payload'); end if;
  if p_payload->>'v' <> '1'
  then return jsonb_build_object('error','invalid_version'); end if;

  v_from:=btrim(coalesce(p_payload->>'from',''));
  v_to:=btrim(coalesce(p_payload->>'to',''));
  if char_length(v_from) not between 2 and 100 or char_length(v_to) not between 2 and 100
  then return jsonb_build_object('error','invalid_route'); end if;

  v_questions:=p_payload->'questions';
  if v_questions is null or jsonb_typeof(v_questions)<>'array'
  then return jsonb_build_object('error','invalid_questions'); end if;
  v_n:=jsonb_array_length(v_questions);
  if v_n<1 or v_n>25
  then return jsonb_build_object('error','invalid_question_count'); end if;

  for v_q in select value from jsonb_array_elements(v_questions)
  loop
    if jsonb_typeof(v_q)<>'object'
    then return jsonb_build_object('error','invalid_question'); end if;
    if jsonb_typeof(v_q->'t')<>'string' or char_length(btrim(v_q->>'t')) not between 4 and 240
    then return jsonb_build_object('error','invalid_question_text'); end if;
    if jsonb_typeof(v_q->'o')<>'array'
    then return jsonb_build_object('error','invalid_options'); end if;
    if jsonb_array_length(v_q->'o')<>4
    then return jsonb_build_object('error','invalid_options'); end if;
    for v_o in select value from jsonb_array_elements(v_q->'o')
    loop
      if jsonb_typeof(v_o)<>'string' or char_length(btrim(v_o #>> '{}')) not between 1 and 220
      then return jsonb_build_object('error','invalid_option'); end if;
    end loop;
    if jsonb_typeof(v_q->'c')<>'number' or (v_q->>'c') !~ '^[0-3]$'
    then return jsonb_build_object('error','invalid_correct'); end if;
    if jsonb_typeof(v_q->'e')<>'string' or char_length(v_q->>'e')>600
    then return jsonb_build_object('error','invalid_explanation'); end if;
    if jsonb_typeof(v_q->'p')<>'string' or char_length(v_q->>'p')>100
    then return jsonb_build_object('error','invalid_place'); end if;
    if jsonb_typeof(v_q->'s')<>'string' or char_length(v_q->>'s')>500
    then return jsonb_build_object('error','invalid_script'); end if;
    if jsonb_typeof(v_q->'u')<>'string' or char_length(v_q->>'u')>400
    then return jsonb_build_object('error','invalid_source'); end if;
    if v_q->>'u'<>'' and v_q->>'u' !~* '^https://[^[:space:]<>]+$'
    then return jsonb_build_object('error','invalid_source'); end if;
  end loop;

  v_owner:=encode(sha256(convert_to(p_owner_token,'UTF8')),'hex');
  v_fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');

  select id into v_id from mdl.community_quizzes
  where fingerprint=v_fingerprint and state='published';
  if found then return jsonb_build_object('ok',true,'id',v_id,'existing',true); end if;

  -- Limites basiques : une clé d'auteur et un plafond de création global.
  -- Des visiteurs malveillants peuvent générer de nouvelles clés ; voir commentaire ci-dessus.
  if (select count(*) from mdl.community_quizzes where owner_hash=v_owner
      and created_at>now()-interval '1 hour')>=3
  then return jsonb_build_object('error','author_hour_limit'); end if;
  if (select count(*) from mdl.community_quizzes where owner_hash=v_owner
      and created_at>now()-interval '1 day')>=10
  then return jsonb_build_object('error','author_day_limit'); end if;
  if (select count(*) from mdl.community_quizzes where created_at>now()-interval '1 hour')>=40
  then return jsonb_build_object('error','site_hour_limit'); end if;

  insert into mdl.community_quizzes(from_place,to_place,payload,question_count,owner_hash,fingerprint)
  values(v_from,v_to,p_payload,v_n,v_owner,v_fingerprint)
  on conflict(fingerprint) do nothing returning id into v_id;
  if v_id is null
  then return jsonb_build_object('error','duplicate_or_unavailable'); end if;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.community_list_quizzes(p_search text default '', p_limit int default 24, p_offset int default 0)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, mdl
as $$
 select jsonb_build_object(
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',x.id,
      'from',x.from_place,
      'to',x.to_place,
      'count',x.question_count,
      'created_at',x.created_at
    ) order by x.created_at desc)
    from (
      select q.id,q.from_place,q.to_place,q.question_count,q.created_at
      from mdl.community_quizzes q
      where q.state='published'
        and (char_length(btrim(coalesce(p_search,'')))=0
          or q.from_place ilike '%'||left(btrim(p_search),70)||'%'
          or q.to_place ilike '%'||left(btrim(p_search),70)||'%')
      order by q.created_at desc
      limit least(greatest(coalesce(p_limit,24),1),40)
      offset least(greatest(coalesce(p_offset,0),0),10000)
    ) x
  ),'[]'::jsonb)
 );
$$;

create or replace function public.community_get_quiz(p_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, mdl
as $$
 select coalesce(
  (select q.payload from mdl.community_quizzes q
   where q.id=p_id and q.state='published'),
  jsonb_build_object('error','not_found')
 );
$$;

create or replace function public.community_delete_quiz(p_id uuid,p_owner_token text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, mdl
as $$
begin
  if p_owner_token is null or
     p_owner_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_token'); end if;
  update mdl.community_quizzes set state='deleted'
  where id=p_id and owner_hash=encode(sha256(convert_to(p_owner_token,'UTF8')),'hex')
    and state='published';
  if not found then return jsonb_build_object('error','not_authorized_or_missing'); end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.community_report_quiz(p_id uuid,p_reporter_token text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, mdl
as $$
declare
  v_hash text;
  v_count integer;
begin
  if p_reporter_token is null or
     p_reporter_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_token'); end if;
  v_hash:=encode(sha256(convert_to(p_reporter_token,'UTF8')),'hex');
  if (select count(*) from mdl.community_quiz_reports
      where reporter_hash=v_hash and at>now()-interval '1 day')>=6
  then return jsonb_build_object('error','report_limit'); end if;
  perform 1 from mdl.community_quizzes where id=p_id and state='published' for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  insert into mdl.community_quiz_reports(quiz_id,reporter_hash)
    values(p_id,v_hash) on conflict do nothing;
  select count(*) into v_count from mdl.community_quiz_reports where quiz_id=p_id;
  if v_count>=5 then
    update mdl.community_quizzes set state='reported' where id=p_id and state='published';
  end if;
  return jsonb_build_object('ok',true,'hidden',v_count>=5);
end;
$$;

revoke all on function public.community_publish_quiz(jsonb,text) from public;
revoke all on function public.community_list_quizzes(text,int,int) from public;
revoke all on function public.community_get_quiz(uuid) from public;
revoke all on function public.community_delete_quiz(uuid,text) from public;
revoke all on function public.community_report_quiz(uuid,text) from public;
grant execute on function public.community_publish_quiz(jsonb,text) to anon,authenticated;
grant execute on function public.community_list_quizzes(text,int,int) to anon,authenticated;
grant execute on function public.community_get_quiz(uuid) to anon,authenticated;
grant execute on function public.community_delete_quiz(uuid,text) to anon,authenticated;
grant execute on function public.community_report_quiz(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
