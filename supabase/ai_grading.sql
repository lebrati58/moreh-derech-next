-- Moreh Derech NEXT — corrections des réponses ouvertes par Claude (Worker Cloudflare /api/grade).
-- À exécuter UNE FOIS dans Supabase > SQL Editor > Run (après install.sql).
-- Table privée : seul le Worker écrit (fonctions réservées au rôle service_role) ; l'élève relit SES corrections
-- avec son identifiant de joueur (le même que pour la progression), jamais celles des autres.
create schema if not exists mdl;
revoke all on schema mdl from public;

create table if not exists mdl.ai_grades (
  id uuid primary key default gen_random_uuid(),
  sender_hash text not null,
  region text not null check (char_length(region) <= 40),
  mission text not null check (char_length(mission) <= 40),
  slot text not null check (char_length(slot) <= 40),
  site text not null check (char_length(site) <= 40),
  kind text not null check (kind in ('short','long')),
  answer text not null check (char_length(answer) <= 3500),
  score int not null check (score between 0 and 10),
  result jsonb not null,
  model text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_grades_by_sender on mdl.ai_grades (sender_hash, created_at desc);
create index if not exists ai_grades_by_time on mdl.ai_grades (created_at desc);
revoke all on mdl.ai_grades from public, anon, authenticated;

-- compteurs pour les plafonds journaliers (appelé par le Worker avant chaque correction)
create or replace function public.ai_grade_quota(p_sender text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'player_today', (select count(*) from mdl.ai_grades where sender_hash = encode(sha256(convert_to(coalesce(p_sender,''),'UTF8')),'hex') and created_at > now() - interval '1 day'),
    'all_today', (select count(*) from mdl.ai_grades where created_at > now() - interval '1 day'));
$$;

create or replace function public.ai_grade_save(
  p_sender text, p_region text, p_mission text, p_slot text, p_site text, p_kind text,
  p_answer text, p_score int, p_result jsonb, p_model text default '')
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_sender is null or p_sender !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_sender'); end if;
  insert into mdl.ai_grades (sender_hash, region, mission, slot, site, kind, answer, score, result, model)
  values (encode(sha256(convert_to(p_sender,'UTF8')),'hex'), left(p_region,40), left(p_mission,40), left(p_slot,40), left(p_site,40),
          p_kind, left(p_answer,3500), greatest(0, least(10, p_score)), coalesce(p_result,'{}'::jsonb), left(coalesce(p_model,''),80))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- l'élève relit ses dernières corrections (identifiant de joueur gardé dans son téléphone)
create or replace function public.ai_grades_mine(p_sender text, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'region', region, 'mission', mission, 'slot', slot, 'site', site,
    'kind', kind, 'score', score, 'summary', result->>'summary') order by created_at desc), '[]'::jsonb)
  from (select * from mdl.ai_grades
        where p_sender ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and sender_hash = encode(sha256(convert_to(p_sender,'UTF8')),'hex')
        order by created_at desc limit least(greatest(coalesce(p_limit,20),1),50)) g;
$$;

revoke all on function public.ai_grade_quota(text) from public, anon, authenticated;
revoke all on function public.ai_grade_save(text,text,text,text,text,text,text,int,jsonb,text) from public, anon, authenticated;
grant execute on function public.ai_grade_quota(text) to service_role;
grant execute on function public.ai_grade_save(text,text,text,text,text,text,text,int,jsonb,text) to service_role;
revoke all on function public.ai_grades_mine(text,int) from public;
grant execute on function public.ai_grades_mine(text,int) to anon, authenticated;
