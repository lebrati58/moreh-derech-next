-- Moreh Derech NEXT — accès réservé à une liste d'élèves (numéro de teoudat zehout).
-- À exécuter UNE FOIS dans Supabase > SQL Editor > Run, APRÈS install.sql (utilise mdl.check_admin). Ré-exécutable.
--
-- Vie privée :
--  • AUCUN numéro n'est stocké en clair : seulement sha256(clé secrète | numéro). La clé secrète est tirée au hasard
--    dans la base à l'installation et n'est jamais lisible par l'application ni par le dépôt GitHub.
--  • Les numéros ne passent jamais par GitHub : l'admin colle la liste dans inbox.html, elle va directement au serveur.
--  • Tant que la liste est VIDE, l'application reste ouverte (personne n'est bloqué avant l'installation).
--  • Tentatives ratées limitées (60 par tranche de 10 minutes, tous téléphones confondus) contre les essais au hasard.

create schema if not exists mdl;
revoke all on schema mdl from public;

create table if not exists mdl.access_secret (id int primary key default 1 check (id = 1), pepper text not null);
insert into mdl.access_secret (pepper)
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where not exists (select 1 from mdl.access_secret);

create table if not exists mdl.access_people (
  tz_hash text primary key,
  label text check (label is null or char_length(label) <= 40),
  created_at timestamptz not null default now()
);
create table if not exists mdl.access_sessions (
  token_hash text primary key,
  tz_hash text not null,
  expires_at timestamptz not null
);
create table if not exists mdl.access_failures (at timestamptz not null default now());
revoke all on mdl.access_secret, mdl.access_people, mdl.access_sessions, mdl.access_failures from public, anon, authenticated;

-- Numéro valide : 5 à 9 chiffres (complété par des zéros à gauche) + chiffre de contrôle israélien.
create or replace function mdl.tz_norm(p text)
returns text language plpgsql immutable
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int := 0; k int; v int;
begin
  if char_length(d) < 5 or char_length(d) > 9 then return null; end if;
  d := lpad(d, 9, '0');
  for k in 1..9 loop
    v := substr(d, k, 1)::int * (case when k % 2 = 1 then 1 else 2 end);
    s := s + (case when v > 9 then v - 9 else v end);
  end loop;
  if s % 10 <> 0 or d = '000000000' then return null; end if;
  return d;
end $$;

create or replace function mdl.tz_hash(p_tz text)
returns text language sql stable
set search_path = ''
as $$ select encode(sha256(convert_to((select pepper from mdl.access_secret where id = 1) || '|' || p_tz, 'UTF8')), 'hex') $$;

-- L'application doit-elle demander un numéro ? (oui dès que la liste contient quelqu'un)
create or replace function public.access_required()
returns jsonb language sql stable security definer
set search_path = ''
as $$ select jsonb_build_object('required', exists (select 1 from mdl.access_people)) $$;

create or replace function public.access_login(p_tz text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_tz text := mdl.tz_norm(p_tz); v_hash text; v_token text;
begin
  delete from mdl.access_failures where at < now() - interval '10 minutes';
  if (select count(*) from mdl.access_failures) >= 60 then return jsonb_build_object('error', 'too_many_attempts'); end if;
  if v_tz is null then insert into mdl.access_failures default values; return jsonb_build_object('error', 'invalid_tz'); end if;
  v_hash := mdl.tz_hash(v_tz);
  if not exists (select 1 from mdl.access_people where tz_hash = v_hash) then
    insert into mdl.access_failures default values; return jsonb_build_object('error', 'not_allowed');
  end if;
  v_token := gen_random_uuid()::text;
  delete from mdl.access_sessions where expires_at < now();
  insert into mdl.access_sessions (token_hash, tz_hash, expires_at)
    values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_hash, now() + interval '180 days');
  return jsonb_build_object('ok', true, 'token', v_token,
    'label', (select label from mdl.access_people where tz_hash = v_hash));
end $$;

-- Session encore valable ? (et l'élève toujours dans la liste)
create or replace function public.access_check(p_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', exists (
    select 1 from mdl.access_sessions s join mdl.access_people p on p.tz_hash = s.tz_hash
     where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and s.expires_at > now()),
    'required', exists (select 1 from mdl.access_people))
$$;

-- Admin : remplacer toute la liste. Une ligne par élève : « numéro », « numéro, prénom » ou « prénom ⇥ numéro » (Excel).
-- Les élèves retirés perdent l'accès tout de suite. Renvoie les lignes refusées (numéros invalides), sans les stocker.
create or replace function public.admin_access_set(p_token text, p_list text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_line text; v_tz text; v_label text; v_ok int := 0; v_bad jsonb := '[]'::jsonb; v_n int := 0;
begin
  perform mdl.check_admin(p_token);
  create temporary table if not exists pg_temp.new_people (tz_hash text primary key, label text) on commit drop;
  truncate pg_temp.new_people;
  foreach v_line in array regexp_split_to_array(coalesce(p_list, ''), '\r?\n') loop
    v_line := btrim(v_line);
    continue when v_line = '';
    v_n := v_n + 1;
    -- copié depuis Excel ou tapé à la main : le numéro est n'importe où dans la ligne, le reste = prénom
    v_tz := mdl.tz_norm(substring(v_line from '(\d{5,9})'));
    v_label := nullif(left(btrim(regexp_replace(v_line, '\d{5,9}', '', 'g'), E' ,;\t-'), 40), '');
    if v_tz is null then v_bad := v_bad || to_jsonb(v_n); continue; end if;
    insert into pg_temp.new_people values (mdl.tz_hash(v_tz), v_label) on conflict (tz_hash) do update set label = excluded.label;
  end loop;
  -- liste collée sans aucun numéro valide (erreur de copier-coller) : on ne touche à rien, sinon l'application se rouvrirait à tous
  if v_n > 0 and not exists (select 1 from pg_temp.new_people) then
    return jsonb_build_object('error', 'no_valid_lines', 'bad_lines', v_bad);
  end if;
  delete from mdl.access_people where tz_hash not in (select tz_hash from pg_temp.new_people);
  insert into mdl.access_people (tz_hash, label) select tz_hash, label from pg_temp.new_people
    on conflict (tz_hash) do update set label = excluded.label;
  delete from mdl.access_sessions where tz_hash not in (select tz_hash from mdl.access_people);
  select count(*) into v_ok from mdl.access_people;
  return jsonb_build_object('ok', true, 'allowed', v_ok, 'bad_lines', v_bad);
end $$;

-- Admin : combien d'élèves autorisés, et leurs prénoms (jamais les numéros).
create or replace function public.admin_access_list(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object('allowed', (select count(*) from mdl.access_people),
    'labels', coalesce((select jsonb_agg(label order by label) from mdl.access_people where label is not null), '[]'::jsonb));
end $$;

revoke all on function mdl.tz_norm(text), mdl.tz_hash(text) from public;
revoke all on function public.access_required(), public.access_login(text), public.access_check(text),
  public.admin_access_set(text, text), public.admin_access_list(text) from public;
grant execute on function public.access_required(), public.access_login(text), public.access_check(text),
  public.admin_access_set(text, text), public.admin_access_list(text) to anon, authenticated;

notify pgrst, 'reload schema';
