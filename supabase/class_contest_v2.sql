-- Moreh Derech NEXT — concours de la classe, v2 : un tableau PAR CLASSE (code de classe, ex. « יובל-2026 »).
-- À exécuter UNE FOIS dans Supabase > SQL Editor > Run, APRÈS class_contest.sql. Ré-exécutable sans risque.
-- N'efface rien : ajoute une colonne et trois fonctions ; les fonctions v1 restent (anciens téléphones).
-- Code vide = tableau « général » (les scores déjà envoyés y restent).

alter table mdl.class_scores add column if not exists class_code text not null default '';
create index if not exists class_scores_class_rank on mdl.class_scores (class_code, points desc, updated_at);

-- Normalisation du code : minuscules, espaces retirés aux bords, lettres (latin, hébreu, cyrillique), chiffres, tiret ; 0 à 24 caractères.
create or replace function mdl.class_code_norm(p text)
returns text language sql immutable
set search_path = ''
as $$ select lower(btrim(coalesce(p, ''))) $$;

create or replace function public.class_submit(
  p_token text, p_name text, p_points int, p_stars int, p_gold int, p_answered int, p_class text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_code text := mdl.class_code_norm(p_class); v_res jsonb;
begin
  if char_length(v_code) > 24 or v_code !~ '^[a-z0-9א-תа-яё-]*$'
  then return jsonb_build_object('error','invalid_class'); end if;
  v_res := public.class_score_submit(p_token, p_name, p_points, p_stars, p_gold, p_answered);
  if v_res ? 'ok' then
    update mdl.class_scores set class_code = v_code
     where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex');
  end if;
  return v_res;
end;
$$;

create or replace function public.class_board(p_class text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('class', mdl.class_code_norm(p_class), 'items', coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name, 'points', s.points, 'stars', s.stars, 'gold', s.gold, 'updated_at', s.updated_at)
      order by s.points desc, s.updated_at), '[]'::jsonb))
  from (select * from mdl.class_scores
         where class_code = mdl.class_code_norm(p_class) and points > 0
         order by points desc, updated_at limit 100) s;
$$;

-- Remise à zéro d'UNE classe (nouvelle promo) : réservée à l'admin connecté.
create or replace function public.admin_class_reset_code(p_token text, p_class text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_n int;
begin
  perform mdl.check_admin(p_token);
  delete from mdl.class_scores where class_code = mdl.class_code_norm(p_class);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_n);
end;
$$;

revoke all on function mdl.class_code_norm(text) from public;
revoke all on function public.class_submit(text,text,int,int,int,int,text) from public;
revoke all on function public.class_board(text) from public;
revoke all on function public.admin_class_reset_code(text,text) from public;
grant execute on function public.class_submit(text,text,int,int,int,int,text) to anon, authenticated;
grant execute on function public.class_board(text) to anon, authenticated;
grant execute on function public.admin_class_reset_code(text,text) to anon, authenticated;

notify pgrst, 'reload schema';
