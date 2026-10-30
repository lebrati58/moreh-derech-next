-- Moreh Derech NEXT — concours de la classe (tableau des scores).
-- À exécuter UNE FOIS dans Supabase > SQL Editor > Run, APRÈS install.sql (utilise mdl.check_admin).
-- Ne touche à aucune banque de questions.
-- Seuls les élèves qui ont donné leur ACCORD envoient un prénom et un score.
-- Chaque téléphone a un jeton secret : seul ce téléphone peut modifier ou retirer sa ligne.
-- Les scores sont calculés sur le téléphone (concours amical) : les bornes ci-dessous empêchent les valeurs absurdes.
create schema if not exists mdl;
revoke all on schema mdl from public;

create table if not exists mdl.class_scores (
  token_hash text primary key,
  name text not null check (char_length(name) between 1 and 20),
  points int not null default 0 check (points between 0 and 500000),
  stars smallint not null default 0 check (stars between 0 and 75),
  gold smallint not null default 0 check (gold between 0 and 25),
  answered int not null default 0 check (answered between 0 and 5000),
  updated_at timestamptz not null default now()
);
create index if not exists class_scores_rank on mdl.class_scores (points desc, updated_at);
revoke all on mdl.class_scores from public, anon, authenticated;

create or replace function public.class_score_submit(
  p_token text, p_name text, p_points int, p_stars int, p_gold int, p_answered int)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_hash text; v_name text; v_last timestamptz;
begin
  if p_token is null or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_token'); end if;
  v_name := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
  if char_length(v_name) not between 1 and 20 or v_name !~ '^[A-Za-zÀ-ɏЀ-ӿא-ת؀-ۿ][A-Za-zÀ-ɏЀ-ӿא-ת؀-ۿ׳ ''.-]*$'
  then return jsonb_build_object('error','invalid_name'); end if;
  if p_points not between 0 and 500000 or p_stars not between 0 and 75 or p_gold not between 0 and 25
     or p_answered not between 0 and 5000 or p_points > p_answered * 300
  then return jsonb_build_object('error','invalid_score'); end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select updated_at into v_last from mdl.class_scores where token_hash = v_hash;
  if v_last is null and (select count(*) from mdl.class_scores) >= 400
  then return jsonb_build_object('error','board_full'); end if;
  insert into mdl.class_scores(token_hash, name, points, stars, gold, answered)
  values (v_hash, v_name, p_points, p_stars, p_gold, p_answered)
  on conflict (token_hash) do update set name = excluded.name, points = excluded.points,
    stars = excluded.stars, gold = excluded.gold, answered = excluded.answered, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.class_score_delete(p_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if p_token is null then return jsonb_build_object('error','invalid_token'); end if;
  delete from mdl.class_scores where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.class_leaderboard()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name, 'points', s.points, 'stars', s.stars, 'gold', s.gold, 'updated_at', s.updated_at)
      order by s.points desc, s.updated_at), '[]'::jsonb))
  from (select * from mdl.class_scores where points > 0 order by points desc, updated_at limit 100) s;
$$;

-- Remise à zéro (nouvelle session / nouvelle promo) : réservée à l'admin connecté.
create or replace function public.admin_class_reset(p_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform mdl.check_admin(p_token);
  delete from mdl.class_scores;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.class_score_submit(text,text,int,int,int,int) from public;
revoke all on function public.class_score_delete(text) from public;
revoke all on function public.class_leaderboard() from public;
revoke all on function public.admin_class_reset(text) from public;
grant execute on function public.class_score_submit(text,text,int,int,int,int) to anon, authenticated;
grant execute on function public.class_score_delete(text) to anon, authenticated;
grant execute on function public.class_leaderboard() to anon, authenticated;
grant execute on function public.admin_class_reset(text) to anon, authenticated;
