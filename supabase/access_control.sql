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
update mdl.access_people set label = null where label is not null; -- numéros seulement : aucun prénom gardé

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

-- Trouver le numéro dans une ligne collée (Excel, WhatsApp, Word…) :
--  • caractères invisibles (sens d'écriture, espace insécable) retirés ;
--  • on prend le premier groupe de 5 à 9 chiffres VALIDE (un n° de téléphone ou de ligne à côté est ignoré) ;
--  • numérotation de liste en début de ligne (« 3. ») retirée ;
--  • sinon on recolle les chiffres séparés par des espaces, tirets ou points (« 012-345-678 », « 012 345 678 ») ;
--  • en dernier recours, premier groupe de 5 à 9 chiffres même si le chiffre de contrôle ne tombe pas juste.
create or replace function mdl.tz_pick(p_line text)
returns text language plpgsql immutable
set search_path = ''
as $$
declare v text := regexp_replace(coalesce(p_line, ''), '[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff\u00ad]', '', 'g'); v0 text; m text; r text;
begin
  v := regexp_replace(v, '[\u00a0\u2007\u202f]', ' ', 'g');
  if v ~* '\d[.,]\d*e\+?\d' then return null; end if;          -- « 1.23457E+08 » d'Excel : chiffres perdus, on refuse
  v := regexp_replace(v, '^\s*\d{1,3}[.)]\s+', '');            -- liste numérotée « 3. » ou « 3) »
  v0 := v;
  for pass in 1..2 loop
    if pass = 2 then v := regexp_replace(v, '(\d)[ .\-]+(?=\d)', '\1', 'g'); end if;
    for m in select (regexp_matches(v, '\d+', 'g'))[1] loop
      if char_length(m) between 5 and 9 then r := mdl.tz_norm(m); if r is not null then return r; end if; end if;
    end loop;
  end loop;
  -- aucun numéro au chiffre de contrôle juste : on prend quand même le premier groupe de 5 à 9 chiffres
  for m in select (regexp_matches(v0, '\d+', 'g'))[1] union all select (regexp_matches(v, '\d+', 'g'))[1] loop
    r := mdl.tz_loose(m); if r is not null then return r; end if;
  end loop;
  return null;
end $$;

-- Numéro accepté même si le chiffre de contrôle ne tombe pas juste (demande du guide : « si c'est le bon numéro,
-- accepte-le ») : 5 à 9 chiffres, complété par des zéros à gauche (Excel efface souvent le 0 du début).
create or replace function mdl.tz_loose(p text)
returns text language sql immutable
set search_path = ''
as $$ select case when char_length(d) between 5 and 9 and d !~ '^0+$' then lpad(d, 9, '0') end
        from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x $$;

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
declare v_tz text := mdl.tz_loose(p_tz); v_hash text; v_token text;
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
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

-- Session encore valable ? (et l'élève toujours dans la liste)
-- Le guide connecté avec son mot de passe (session admin) entre aussi, SANS numéro.
-- L'inverse reste impossible : une session élève n'ouvre jamais l'administration (mdl.check_admin).
create or replace function public.access_check(p_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', exists (
    select 1 from mdl.access_sessions s join mdl.access_people p on p.tz_hash = s.tz_hash
     where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and s.expires_at > now())
    or exists (select 1 from mdl.admin_sessions a where a.token::text = p_token and a.expires_at > clock_timestamp()),
    'required', exists (select 1 from mdl.access_people))
$$;

-- Admin : remplacer toute la liste. Une ligne par numéro (s'il y a du texte autour, copié d'Excel, il est ignoré et JAMAIS enregistré).
-- Les élèves retirés perdent l'accès tout de suite. Renvoie les lignes refusées (numéros invalides), sans les stocker.
create or replace function public.admin_access_set(p_token text, p_list text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare v_line text; v_tz text; v_label text; v_ok int := 0; v_bad jsonb := '[]'::jsonb; v_n int := 0; v_dup int := 0; v_warn jsonb := '[]'::jsonb;
begin
  perform mdl.check_admin(p_token);
  create temporary table if not exists pg_temp.new_people (tz_hash text primary key, label text) on commit drop;
  truncate pg_temp.new_people;
  foreach v_line in array regexp_split_to_array(coalesce(p_list, ''), '\r?\n') loop
    v_line := btrim(v_line);
    continue when v_line = '';
    v_n := v_n + 1;
    v_tz := mdl.tz_pick(v_line);
    v_label := null; -- numéro seulement : aucun prénom n'est jamais enregistré, même s'il est collé
    if v_tz is null then v_bad := v_bad || to_jsonb(v_n); continue; end if;
    if mdl.tz_norm(v_tz) is null then v_warn := v_warn || to_jsonb(v_n); end if;  -- accepté, mais à vérifier
    if exists (select 1 from pg_temp.new_people where tz_hash = mdl.tz_hash(v_tz)) then v_dup := v_dup + 1; continue; end if;
    insert into pg_temp.new_people values (mdl.tz_hash(v_tz), v_label);
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
  return jsonb_build_object('ok', true, 'allowed', v_ok, 'bad_lines', v_bad, 'duplicates', v_dup, 'check_lines', v_warn);
end $$;

-- Admin : combien d'élèves autorisés (ni numéros ni prénoms).
create or replace function public.admin_access_list(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object('allowed', (select count(*) from mdl.access_people));
end $$;

revoke all on function mdl.tz_norm(text), mdl.tz_loose(text), mdl.tz_pick(text), mdl.tz_hash(text) from public;
revoke all on function public.access_required(), public.access_login(text), public.access_check(text),
  public.admin_access_set(text, text), public.admin_access_list(text) from public;
grant execute on function public.access_required(), public.access_login(text), public.access_check(text),
  public.admin_access_set(text, text), public.admin_access_list(text) to anon, authenticated;

notify pgrst, 'reload schema';
