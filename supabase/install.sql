-- INSTALLATION COMPLÈTE : à coller en entier dans Supabase > SQL Editor > Run ("Run without RLS").
-- Ré-exécutable sans risque : rien n'est supprimé, aucune question n'est dupliquée.
-- Contient : schéma + banque V1 (34 questions du trajet avec fiches de guidage) + banque V2 (parcours
-- photographié : 6 + 2 questions en 4 langues, 32 fiches photo) + banque V3 (route 67, sans photo,
-- 4 langues) (+ démo seulement si la banque est vide).
-- =====================================================================
--  מורה דרך LIVE — schéma de base de données et logique serveur
--  Cible : Supabase (PostgreSQL 15+). À exécuter une fois dans le SQL Editor.
--
--  Principes de sécurité
--  * Toutes les tables vivent dans le schéma privé "mdl", que l'API publique
--    (rôles anon / authenticated) ne peut ni lire ni écrire.
--  * Le navigateur n'appelle QUE les fonctions public.* ci-dessous (RPC).
--    Elles sont SECURITY DEFINER et vérifient chaque appel.
--  * Les bonnes réponses ne sortent jamais vers un participant avant la
--    révélation. Les points sont calculés ici, avec l'horloge du serveur.
--  * Le mot de passe admin est stocké haché (sha256 + sel), jamais dans le code.
-- =====================================================================

create schema if not exists mdl;
revoke all on schema mdl from public;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------
create table if not exists mdl.settings (
  id            int primary key default 1 check (id = 1),
  admin_salt    text,
  admin_hash    text
);
insert into mdl.settings (id) values (1) on conflict do nothing;

create table if not exists mdl.admin_sessions (
  token       uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default clock_timestamp(),
  expires_at  timestamptz not null default clock_timestamp() + interval '14 hours'
);

create table if not exists mdl.login_failures (
  at timestamptz not null default clock_timestamp()
);

create table if not exists mdl.questions (
  id              bigserial primary key,
  kind            text not null default 'mcq' check (kind in ('mcq','tf')),
  text            text not null check (char_length(text) between 1 and 600),
  options         jsonb not null,
  correct_index   int  not null,
  explanation     text not null default '',
  category        text not null default 'כללי',
  difficulty      int  not null default 2 check (difficulty between 1 and 3),
  time_limit_sec  int  check (time_limit_sec is null or time_limit_sec between 5 and 600),
  sort_order      int  not null default 0,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp()
);

create table if not exists mdl.games (
  id                bigserial primary key,
  title             text not null default 'מורה דרך LIVE',
  is_active         boolean not null default true,
  status            text not null default 'lobby' check (status in ('lobby','live','finished')),
  phase             text not null default 'waiting' check (phase in ('waiting','open','closed','revealed')),
  paused            boolean not null default false,
  current_question  bigint,
  opened_at         timestamptz,
  closes_at         timestamptz,
  base_points       int not null default 100,
  max_bonus         int not null default 100,
  bonus_window_sec  int not null default 20,
  grace_sec         numeric not null default 1.5,
  version           bigint not null default 1,
  created_at        timestamptz not null default clock_timestamp(),
  finished_at       timestamptz
);
-- Fiches de guidage oral (PRIVÉES : jamais copiées dans game_questions, donc jamais
-- envoyées aux élèves ; seules les fonctions admin les lisent).
alter table mdl.questions add column if not exists guide_short     text  not null default '';
alter table mdl.questions add column if not exists guide_long      text  not null default '';
alter table mdl.questions add column if not exists guide_location  text  not null default '';
alter table mdl.questions add column if not exists guide_practical text  not null default '';
alter table mdl.questions add column if not exists guide_sources   jsonb not null default '[]'::jsonb;
alter table mdl.questions add column if not exists guide_fact      text  not null default '';
-- Identifiant stable des questions importées (permet de réimporter sans doublons)
alter table mdl.questions add column if not exists ext_key text;
create unique index if not exists questions_ext_key on mdl.questions (ext_key);
-- visible = vu depuis le bus (confirmé) · check = probablement visible, à confirmer
-- nearby = site proche, NON visible · topic = sujet général, pas un lieu
alter table mdl.questions add column if not exists guide_visibility text not null default 'topic';

-- Durée appliquée aux questions qui n'ont pas leur propre durée (0 = sans limite).
alter table mdl.games add column if not exists default_time_limit_sec int not null default 30;

-- Une seule partie active à la fois : c'est elle que rejoint le lien élèves.
create unique index if not exists games_one_active on mdl.games (is_active) where is_active;

-- Copie figée de la question au moment de sa publication (on peut ensuite
-- modifier ou supprimer la question de la banque sans fausser la partie).
create table if not exists mdl.game_questions (
  game_id       bigint not null references mdl.games(id) on delete cascade,
  question_id   bigint not null,
  seq           int    not null,
  kind          text   not null,
  text          text   not null,
  options       jsonb  not null,
  correct_index int    not null,
  explanation   text   not null,
  category      text   not null,
  time_limit_sec int,
  status        text   not null check (status in ('open','closed','revealed')),
  opened_at     timestamptz not null,
  closes_at     timestamptz,
  closed_at     timestamptz,
  revealed_at   timestamptz,
  primary key (game_id, question_id)
);

create table if not exists mdl.players (
  id            bigserial primary key,
  game_id       bigint not null references mdl.games(id) on delete cascade,
  name          text not null,
  token         uuid not null unique default gen_random_uuid(),
  code          text not null,             -- code personnel à 4 chiffres (reconnexion depuis un autre navigateur)
  code_failures int not null default 0,
  removed       boolean not null default false,
  joined_at     timestamptz not null default clock_timestamp(),
  last_seen_at  timestamptz not null default clock_timestamp()
);
-- V3 : deux élèves peuvent porter le même prénom (identifiants internes distincts ;
-- le classement ajoute un petit numéro d'affichage). L'ancienne contrainte d'unicité est retirée.
drop index if exists mdl.players_name_per_game;
create index if not exists players_game_name on mdl.players (game_id, lower(name));

create table if not exists mdl.answers (
  game_id      bigint not null,
  question_id  bigint not null,
  player_id    bigint not null references mdl.players(id) on delete cascade,
  choice       int    not null,
  received_at  timestamptz not null,
  elapsed_ms   int    not null,
  is_correct   boolean not null,
  points       int    not null,
  primary key (game_id, question_id, player_id),       -- une seule réponse par élève et par question
  foreign key (game_id, question_id) references mdl.game_questions(game_id, question_id) on delete cascade
);

-- ---------------------------------------------------------------------
--  V2 — banques de questions (versions), multilingue, parcours photographié
--  Migration incrémentale : ré-exécutable, ne supprime aucune donnée.
--  Toutes les questions / parties existantes deviennent la banque V1.
-- ---------------------------------------------------------------------
create table if not exists mdl.question_banks (
  code   text primary key check (code ~ '^[A-Z0-9_]{1,32}$'),
  label  jsonb not null default '{}'::jsonb,       -- {"he": …, "fr": …, "en": …, "ru": …}
  sort   int   not null default 0
);
insert into mdl.question_banks (code, label, sort) values
  ('V1', '{"he":"V1 — קורס","fr":"V1 — Cours","en":"V1 — Course","ru":"V1 — Курс"}', 1),
  ('V2', '{"he":"V2 — מסלול התמונות — הלוך","fr":"V2 — Parcours photographié (aller)","en":"V2 — Photographed outbound route","ru":"V2 — Маршрут по фотографиям (туда)"}', 2),
  ('V3', '{"he":"V3 — זכרון יעקב → יקנעם, כביש 67","fr":"V3 — Zikhron Yaakov → Yokneam, route 67","en":"V3 — Zikhron Ya''akov → Yokneam, Road 67","ru":"V3 — Зихрон-Яаков → Йокнеам, шоссе 67"}', 3)
on conflict (code) do update set label = excluded.label, sort = excluded.sort;
-- Durée de réponse par défaut d'une nouvelle partie de cette banque (null = reprendre la précédente).
-- Une future V4, V5… s'ajoute par une simple ligne ici + sa propre banque de questions.
alter table mdl.question_banks add column if not exists default_time_sec int;
update mdl.question_banks set default_time_sec = 45 where code in ('V2', 'V3') and default_time_sec is null;

-- Parcours généré automatiquement (V4 : départ/arrivée → lieux le long de la route → questions) :
-- tracé + lieux au format de public/v3/road67-route.json. Lu par l'admin seulement (admin_state).
alter table mdl.question_banks add column if not exists route jsonb;
alter table mdl.question_banks add column if not exists created_at timestamptz not null default clock_timestamp();
-- Mode SOLO : le créateur peut partager un parcours V4 pour que chacun joue seul, avec son propre GPS.
-- Partager = rendre lisibles (par lien) les questions ET leurs réponses : jamais par défaut.
alter table mdl.question_banks add column if not exists solo boolean not null default false;

alter table mdl.questions add column if not exists bank text not null default 'V1' references mdl.question_banks(code);
-- Traductions PUBLIQUES (texte, 4 réponses dans le MÊME ordre, explication, catégorie) :
--   {"fr": {"text", "options", "explanation", "category"}, "en": …, "ru": …}  — l'hébreu reste dans text/options/explanation
alter table mdl.questions add column if not exists i18n       jsonb not null default '{}'::jsonb;
-- Textes PRIVÉS du guide par langue : {"he": {"script", "caution", "trigger"}, "fr": …}
alter table mdl.questions add column if not exists guide_i18n jsonb not null default '{}'::jsonb;
-- PRIVÉ : photo(s) de repérage, heure indicative, côté, fiabilité…
alter table mdl.questions add column if not exists route_meta jsonb not null default '{}'::jsonb;
-- MAIN = question principale ; SPARE = question de remplacement, désactivée tant que le guide ne l'active pas
alter table mdl.questions add column if not exists selection text not null default 'MAIN';
do $$ begin
  alter table mdl.questions add constraint questions_selection_chk check (selection in ('MAIN','SPARE'));
exception when duplicate_object then null; end $$;
create index if not exists questions_bank_sort on mdl.questions (bank, sort_order);
-- Question modifiée dans l'admin : les réimports (migration V3) ne l'écrasent plus.
alter table mdl.questions add column if not exists admin_edited boolean not null default false;

-- Une partie = UNE banque, choisie à sa création et jamais modifiée ensuite.
alter table mdl.games add column if not exists bank text not null default 'V1' references mdl.question_banks(code);
-- Temps de réponse minimal garanti (secondes, compté depuis la publication par le serveur).
alter table mdl.games add column if not exists min_answer_sec int not null default 30;
do $$ begin
  alter table mdl.games add constraint games_min_answer_chk check (min_answer_sec between 0 and 600);
exception when duplicate_object then null; end $$;
-- Questions de remplacement activées par le guide pour CETTE partie.
alter table mdl.games add column if not exists enabled_spares bigint[] not null default '{}';

-- Copie figée des traductions PUBLIQUES au moment de la publication.
alter table mdl.game_questions add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table mdl.game_questions add column if not exists forced_close boolean not null default false;

-- Langue d'affichage de l'élève (n'a AUCUN effet sur le jeu : même question, même chrono, même score).
alter table mdl.players add column if not exists lang text not null default 'he';
do $$ begin
  alter table mdl.players add constraint players_lang_chk check (lang in ('he','fr','en','ru'));
exception when duplicate_object then null; end $$;

-- Parcours photographiés (galerie admin). Une collection par trajet : ALLER_V2 aujourd'hui,
-- un futur RETOUR pourra être ajouté comme collection séparée.
create table if not exists mdl.route_collections (
  code      text primary key check (code ~ '^[A-Z0-9_]{1,32}$'),
  bank      text references mdl.question_banks(code),
  label     jsonb not null default '{}'::jsonb,
  direction text  not null default 'outbound',
  notes     jsonb not null default '[]'::jsonb,       -- repères facultatifs (note WhatsApp du guide), NON certifiés
  cautions  jsonb not null default '[]'::jsonb,
  sort      int   not null default 0
);
create table if not exists mdl.route_photos (
  collection    text not null references mdl.route_collections(code) on delete cascade,
  ord           int  not null,
  file          text not null,                        -- photo recadrée servie par le site (sans bandeau du téléphone)
  source_file   text not null default '',             -- nom de la capture d'origine
  taken_at      text not null default '',             -- heure INDICATIVE (capture d'écran, pas de GPS EXIF)
  subject       text not null default '',
  side          text not null default 'uncertain',
  confidence    text not null default 'low',
  anecdote      jsonb not null default '{}'::jsonb,   -- {"he","fr","en","ru"} — PRIVÉ (admin)
  question_keys text[] not null default '{}',         -- questions liées (une photo n'est PAS forcément une question)
  primary key (collection, ord)
);

revoke all on all tables in schema mdl from public;
revoke all on all sequences in schema mdl from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema mdl from anon, authenticated';
    execute 'revoke usage on schema mdl from anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Fonctions internes (schéma mdl, non exposées)
-- ---------------------------------------------------------------------

-- Calcul des points : pur et déterministe.
--   bonne réponse  = base + bonus
--   bonus          = max_bonus si la réponse arrive pendant la "grâce",
--                    puis décroît linéairement jusqu'à 0 à la fin de la fenêtre.
--   mauvaise / absente = 0
create or replace function mdl.calc_points(
  p_correct boolean, p_elapsed_ms int, p_base int, p_max_bonus int,
  p_window_sec numeric, p_grace_sec numeric)
returns int language sql immutable as $$
  select case
    when not p_correct then 0
    when p_elapsed_ms <= p_grace_sec * 1000 or p_window_sec <= p_grace_sec then p_base + p_max_bonus
    else p_base + round(p_max_bonus * greatest(0,
           1 - (p_elapsed_ms - p_grace_sec * 1000) / ((p_window_sec - p_grace_sec) * 1000.0)))::int
  end
$$;

create or replace function mdl.bump(p_game bigint) returns void
language sql as $$ update mdl.games set version = version + 1 where id = p_game $$;

-- Fermeture automatique quand la durée maximale est dépassée (pas de cron :
-- appelée à chaque lecture d'état).
create or replace function mdl.tick(p_game bigint) returns void
language plpgsql as $$
begin
  update mdl.game_questions gq set status = 'closed', closed_at = gq.closes_at
   from mdl.games g
   where g.id = p_game and gq.game_id = g.id and gq.question_id = g.current_question
     and g.phase = 'open' and gq.closes_at is not null
     and clock_timestamp() > gq.closes_at + make_interval(secs => g.grace_sec);
  if found then
    update mdl.games set phase = 'closed', version = version + 1 where id = p_game;
  end if;
end $$;

create or replace function mdl.check_admin(p_token text) returns void
language plpgsql as $$
begin
  if p_token is null or not exists (
      select 1 from mdl.admin_sessions
       where token::text = p_token and expires_at > clock_timestamp()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;

create or replace function mdl.active_game() returns mdl.games
language sql stable as $$ select * from mdl.games where is_active limit 1 $$;

-- Classement : seules les questions RÉVÉLÉES comptent (sinon un élève verrait
-- son score monter et devinerait la bonne réponse avant la révélation).
-- Départage, dans l'ordre : score ↓, bonnes réponses ↓, temps cumulé des
-- bonnes réponses ↑, heure d'arrivée dans le jeu ↑, identifiant ↑.
create or replace function mdl.leaderboard(p_game bigint)
returns table(rank int, player_id bigint, name text, score int, correct int, answered int, correct_ms bigint)
language sql stable as $$
  with s as (
    select p.id, p.name, p.joined_at,
           coalesce(sum(a.points), 0)::int                              as score,
           count(a.*) filter (where a.is_correct)::int                  as correct,
           count(a.*)::int                                              as answered,
           coalesce(sum(a.elapsed_ms) filter (where a.is_correct), 0)::bigint as correct_ms
      from mdl.players p
      left join (mdl.answers a join mdl.game_questions gq
                   on gq.game_id = a.game_id and gq.question_id = a.question_id
                  and gq.status = 'revealed')
        on a.player_id = p.id
     where p.game_id = p_game and not p.removed
     group by p.id)
  , d as (   -- homonymes : « David », « David (2) »… dans l'ordre d'arrivée (même affichage pour tous)
    select s.*, row_number() over (partition by lower(s.name) order by s.joined_at, s.id) as k from s)
  select (row_number() over w)::int, id,
         case when k > 1 then name || ' (' || k || ')' else name end,
         score, correct, answered, correct_ms
    from d window w as (order by score desc, correct desc, correct_ms asc, joined_at asc, id asc)
   order by 1
$$;

create or replace function mdl.final_stats(p_game bigint) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'players',   (select count(*) from mdl.players where game_id = p_game and not removed),
    'questions', (select count(*) from mdl.game_questions where game_id = p_game and status = 'revealed'),
    'answers',   (select count(*) from mdl.answers a join mdl.game_questions gq using (game_id, question_id)
                   where a.game_id = p_game and gq.status = 'revealed'),
    'correct_pct', (select round(100.0 * avg(case when a.is_correct then 1 else 0 end))
                      from mdl.answers a join mdl.game_questions gq using (game_id, question_id)
                     where a.game_id = p_game and gq.status = 'revealed'),
    'fastest', (select jsonb_build_object('name', p.name, 'ms', a.elapsed_ms)
                  from mdl.answers a join mdl.players p on p.id = a.player_id
                  join mdl.game_questions gq on gq.game_id = a.game_id and gq.question_id = a.question_id
                 where a.game_id = p_game and a.is_correct and gq.status = 'revealed' and not p.removed
                 order by a.elapsed_ms, a.player_id limit 1)
  )
$$;

-- Ne garde QUE les champs publics d'un objet de traductions (liste blanche) :
-- même si un texte privé était glissé par erreur dans questions.i18n, il ne serait
-- jamais copié dans game_questions, donc jamais envoyé aux élèves.
create or replace function mdl.pub_i18n(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object(
           'text', v->'text', 'options', v->'options', 'explanation', v->'explanation', 'category', v->'category'))),
         '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e(k, v)
   where k in ('he','fr','en','ru') and jsonb_typeof(v) = 'object'
$$;

create or replace function mdl.valid_lang(p text) returns text
language sql immutable as $$ select case when p in ('he','fr','en','ru') then p end $$;

-- Configuration du mot de passe admin (à lancer à la main dans le SQL Editor,
-- jamais exposée à l'API).
create or replace function mdl.set_admin_password(p_password text) returns text
language plpgsql as $$
declare v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if char_length(p_password) < 8 then
    raise exception 'Le mot de passe doit contenir au moins 8 caractères';
  end if;
  update mdl.settings
     set admin_salt = v_salt,
         admin_hash = encode(sha256(convert_to(v_salt || p_password, 'UTF8')), 'hex')
   where id = 1;
  delete from mdl.admin_sessions;
  return 'OK';
end $$;

-- ---------------------------------------------------------------------
--  API PARTICIPANT (exposée)
-- ---------------------------------------------------------------------

-- Rejoindre la partie active. L'élève ne donne QUE son prénom (et sa langue).
--  * p_token : jeton aléatoire gardé sur le téléphone → reconnexion transparente (rechargement,
--    changement de langue, coupure réseau). C'est la seule « clé » : 122 bits aléatoires, jamais
--    affichés, impossibles à deviner à partir d'un prénom.
--  * prénom déjà utilisé : AUCUNE question n'est posée — un nouveau joueur est créé (identifiant
--    interne distinct) ; le classement ajoute un petit numéro d'affichage aux homonymes.
--  * p_code (ancien code à 4 chiffres, plus affiché) : accepté pour compatibilité seulement,
--    avec 8 essais maximum par joueur.
--  * p_lang : langue d'affichage (he/fr/en/ru) — purement visuelle.
--  * Rejoindre ne publie JAMAIS de question : seul le guide le fait.
drop function if exists public.join_game(text, text, text, boolean);   -- ancienne signature (sans langue)
create or replace function public.join_game(
  p_name text, p_token text default null, p_code text default null, p_new_name_ok boolean default false,
  p_lang text default null)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare
  g mdl.games; p mdl.players; v_name text; v_lang text := mdl.valid_lang(p_lang);
begin
  g := mdl.active_game();
  if g.id is null then return jsonb_build_object('error', 'no_game'); end if;

  -- 1) reconnexion par jeton
  if p_token is not null then
    select * into p from mdl.players
     where token::text = p_token and game_id = g.id and not removed;
    if found then
      update mdl.players set last_seen_at = clock_timestamp(), lang = coalesce(v_lang, lang)
       where id = p.id returning * into p;
      return jsonb_build_object('player_id', p.id, 'token', p.token, 'name', p.name,
                                'lang', p.lang, 'reconnected', true);
    end if;
  end if;

  -- 2) nettoyage du prénom (pas de caractères de contrôle, 1 à 24 caractères)
  v_name := regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := left(v_name, 24);
  if char_length(v_name) = 0 then return jsonb_build_object('error', 'empty_name'); end if;

  if g.status = 'finished' then return jsonb_build_object('error', 'finished'); end if;

  -- 3) compatibilité : ancien retour « prénom + code » (l'interface ne le propose plus)
  if p_code is not null and btrim(p_code) <> '' then
    select * into p from mdl.players
     where game_id = g.id and lower(name) = lower(v_name) and not removed and code = btrim(p_code)
       and code_failures < 8
     order by joined_at limit 1;
    if found then
      update mdl.players set last_seen_at = clock_timestamp(), code_failures = 0, lang = coalesce(v_lang, lang)
       where id = p.id returning * into p;
      return jsonb_build_object('player_id', p.id, 'token', p.token, 'name', p.name,
                                'lang', p.lang, 'reconnected', true);
    end if;
    update mdl.players set code_failures = code_failures + 1
     where game_id = g.id and lower(name) = lower(v_name) and not removed;
    if found then return jsonb_build_object('error', 'bad_code'); end if;
  end if;

  if (select count(*) from mdl.players where game_id = g.id) >= 300 then
    return jsonb_build_object('error', 'full');
  end if;

  -- 4) nouveau joueur — même si le prénom existe déjà
  insert into mdl.players (game_id, name, code, lang)
  values (g.id, v_name, lpad((floor(random() * 10000))::int::text, 4, '0'), coalesce(v_lang, 'he'))
  returning * into p;
  perform mdl.bump(g.id);
  return jsonb_build_object('player_id', p.id, 'token', p.token, 'name', p.name,
                            'lang', p.lang, 'reconnected', false);
end $$;

-- Changement de langue en cours de partie : le joueur, ses réponses et son score sont inchangés.
create or replace function public.set_language(p_token text, p_lang text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_lang text := mdl.valid_lang(p_lang); v_id bigint;
begin
  if v_lang is null then return jsonb_build_object('error', 'bad_lang'); end if;
  update mdl.players set lang = v_lang
   where token::text = p_token and not removed and game_id = (select id from mdl.games where is_active)
  returning id into v_id;
  if v_id is null then return jsonb_build_object('error', 'unknown_player'); end if;
  return jsonb_build_object('ok', true, 'lang', v_lang);
end $$;

-- État du jeu vu par un participant. Appelée toutes les ~1,5 s.
-- Si rien n'a changé depuis p_since, renvoie une réponse minuscule.
create or replace function public.get_state(p_token text, p_since bigint default 0)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare
  g mdl.games; p mdl.players; q mdl.game_questions; a mdl.answers;
  v_me jsonb; v_q jsonb := null; v_lb jsonb; v_extra jsonb := '{}'::jsonb; v_total int; v_tr jsonb;
begin
  g := mdl.active_game();
  if g.id is null then return jsonb_build_object('error', 'no_game', 'now', clock_timestamp()); end if;
  select * into p from mdl.players where token::text = p_token and game_id = g.id;
  if not found or p.removed then
    return jsonb_build_object('error', 'unknown_player', 'now', clock_timestamp());
  end if;
  if p.last_seen_at < clock_timestamp() - interval '8 seconds' then
    update mdl.players set last_seen_at = clock_timestamp() where id = p.id;
  end if;

  perform mdl.tick(g.id);
  select * into g from mdl.games where id = g.id;
  if p_since = g.version then
    return jsonb_build_object('v', g.version, 'same', true, 'now', clock_timestamp());
  end if;

  select count(*) into v_total from mdl.players where game_id = g.id and not removed;
  select jsonb_build_object('name', l.name, 'score', l.score, 'correct', l.correct, 'rank', l.rank,
                            'total', v_total, 'lang', p.lang)
    into v_me from mdl.leaderboard(g.id) l where l.player_id = p.id;

  if g.current_question is not null then
    select * into q from mdl.game_questions where game_id = g.id and question_id = g.current_question;
    select * into a from mdl.answers
     where game_id = g.id and question_id = q.question_id and player_id = p.id;
    -- Traduction dans la langue de l'élève (copie figée publique) ; sinon hébreu.
    -- Les réponses gardent le MÊME ordre (même index) dans toutes les langues.
    v_tr := case when p.lang <> 'he' then q.i18n -> p.lang end;
    if v_tr is not null and (jsonb_typeof(v_tr->'options') is distinct from 'array'
                             or jsonb_array_length(v_tr->'options') <> jsonb_array_length(q.options)) then
      v_tr := null;
    end if;
    v_q := jsonb_build_object(
      'id', q.question_id, 'seq', q.seq, 'kind', q.kind,
      'text', coalesce(v_tr->>'text', q.text), 'options', coalesce(v_tr->'options', q.options),
      'lang', case when v_tr is null then 'he' else p.lang end,
      'category', coalesce(v_tr->>'category', q.category), 'time_limit', q.time_limit_sec,
      'opened_at', q.opened_at, 'closes_at', q.closes_at,
      'my_choice', a.choice);
    if q.status = 'revealed' then
      v_q := v_q || jsonb_build_object(
        'correct_index', q.correct_index, 'explanation', coalesce(v_tr->>'explanation', q.explanation),
        'my_correct', a.is_correct, 'my_points', a.points,
        'counts', (select jsonb_agg(coalesce(c.n, 0) order by o.i)
                     from generate_series(0, jsonb_array_length(q.options) - 1) o(i)
                     left join (select choice, count(*) n from mdl.answers
                                 where game_id = g.id and question_id = q.question_id group by choice) c
                       on c.choice = o.i));
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'score', score, 'correct', correct,
                                              'me', player_id = p.id)
                  order by rank), '[]'::jsonb)
    into v_lb from mdl.leaderboard(g.id) where rank <= 10;
  if g.status = 'finished' then v_extra := jsonb_build_object('stats', mdl.final_stats(g.id)); end if;

  return jsonb_build_object(
    'v', g.version, 'now', clock_timestamp(),
    'game', jsonb_build_object('title', g.title, 'status', g.status, 'phase', g.phase, 'paused', g.paused),
    'me', v_me, 'question', v_q, 'leaderboard', v_lb) || v_extra;
end $$;

-- Envoi d'une réponse. Heure de réception = horloge du SERVEUR.
create or replace function public.submit_answer(p_token text, p_question_id bigint, p_choice int)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare
  v_now timestamptz := clock_timestamp();
  g mdl.games; p mdl.players; q mdl.game_questions; v_ms int; v_ok boolean; v_pts int; v_existing int;
begin
  g := mdl.active_game();
  select * into p from mdl.players where token::text = p_token and game_id = g.id and not removed;
  if not found then return jsonb_build_object('status', 'unknown_player'); end if;

  select * into q from mdl.game_questions where game_id = g.id and question_id = p_question_id;
  if not found then return jsonb_build_object('status', 'not_open'); end if;

  select choice into v_existing from mdl.answers
   where game_id = g.id and question_id = q.question_id and player_id = p.id;
  if found then return jsonb_build_object('status', 'duplicate', 'choice', v_existing); end if;

  if g.current_question is distinct from q.question_id or g.phase <> 'open' or q.status <> 'open' then
    return jsonb_build_object('status', 'closed');
  end if;
  if q.closes_at is not null and v_now > q.closes_at + make_interval(secs => g.grace_sec) then
    return jsonb_build_object('status', 'late');
  end if;
  if p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(q.options) then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_ms  := greatest(0, round(extract(epoch from (v_now - q.opened_at)) * 1000))::int;
  v_ok  := (p_choice = q.correct_index);
  v_pts := mdl.calc_points(v_ok, v_ms, g.base_points, g.max_bonus,
                           coalesce(q.time_limit_sec, g.bonus_window_sec), g.grace_sec);

  insert into mdl.answers (game_id, question_id, player_id, choice, received_at, elapsed_ms, is_correct, points)
  values (g.id, q.question_id, p.id, p_choice, v_now, v_ms, v_ok, v_pts)
  on conflict do nothing;
  if not found then  -- deux envois simultanés : le premier gagne
    select choice into v_existing from mdl.answers
     where game_id = g.id and question_id = q.question_id and player_id = p.id;
    return jsonb_build_object('status', 'duplicate', 'choice', v_existing);
  end if;
  update mdl.players set last_seen_at = v_now where id = p.id;
  -- On ne renvoie NI la justesse NI les points : ils seront visibles à la révélation.
  return jsonb_build_object('status', 'ok', 'choice', p_choice, 'elapsed_ms', v_ms);
end $$;

-- ---------------------------------------------------------------------
--  API ADMINISTRATEUR (exposée, protégée par jeton de session)
-- ---------------------------------------------------------------------

create or replace function public.admin_login(p_password text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare s mdl.settings; v_token uuid;
begin
  delete from mdl.login_failures where at < clock_timestamp() - interval '15 minutes';
  if (select count(*) from mdl.login_failures) >= 10 then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;
  select * into s from mdl.settings where id = 1;
  if s.admin_hash is null then return jsonb_build_object('error', 'no_password_set'); end if;
  if encode(sha256(convert_to(s.admin_salt || coalesce(p_password, ''), 'UTF8')), 'hex') <> s.admin_hash then
    insert into mdl.login_failures default values;
    return jsonb_build_object('error', 'bad_password');
  end if;
  delete from mdl.admin_sessions where expires_at < clock_timestamp();
  insert into mdl.admin_sessions default values returning token into v_token;
  return jsonb_build_object('token', v_token);
end $$;

create or replace function public.admin_state(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; q mdl.game_questions; v_cur jsonb := null; v_counts jsonb; v_bank text;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  if g.id is not null then
    perform mdl.tick(g.id);
    select * into g from mdl.games where id = g.id;
  end if;
  if g.current_question is not null then
    select * into q from mdl.game_questions where game_id = g.id and question_id = g.current_question;
    select jsonb_agg(coalesce(c.n, 0) order by o.i) into v_counts
      from generate_series(0, jsonb_array_length(q.options) - 1) o(i)
      left join (select choice, count(*) n from mdl.answers
                  where game_id = g.id and question_id = q.question_id group by choice) c on c.choice = o.i;
    v_cur := to_jsonb(q) || jsonb_build_object(
      'answers', (select count(*) from mdl.answers where game_id = g.id and question_id = q.question_id),
      'counts', v_counts,
      -- heure à partir de laquelle la fermeture normale est autorisée (minimum de réponse)
      'can_close_at', q.opened_at + make_interval(secs => g.min_answer_sec));
  end if;
  v_bank := coalesce(g.bank, 'V1');
  return jsonb_build_object(
    'now', clock_timestamp(),
    'game', case when g.id is null then null else to_jsonb(g) end,
    'bank', v_bank,
    -- tracé du parcours généré (banques V4) ; null pour V1/V2/V3 (V3 : fichier statique)
    'route', (select b.route from mdl.question_banks b where b.code = v_bank),
    'banks', (select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label,
                'main', (select count(*) from mdl.questions x where x.bank = b.code and x.selection = 'MAIN'),
                'spare', (select count(*) from mdl.questions x where x.bank = b.code and x.selection = 'SPARE'))
              order by b.sort, b.code), '[]'::jsonb) from mdl.question_banks b),
    'players', (select count(*) from mdl.players where game_id = g.id and not removed),
    'online',  (select count(*) from mdl.players where game_id = g.id and not removed
                  and last_seen_at > clock_timestamp() - interval '20 seconds'),
    'langs',   (select coalesce(jsonb_object_agg(lang, n), '{}'::jsonb) from
                  (select lang, count(*) n from mdl.players where game_id = g.id and not removed group by lang) t),
    'current', v_cur,
    -- UNIQUEMENT les questions de la banque de la partie (V1 et V2 ne se mélangent jamais)
    'questions', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
                     'used', exists(select 1 from mdl.game_questions gq where gq.game_id = g.id and gq.question_id = x.id),
                     'enabled', x.selection = 'MAIN' or x.id = any(coalesce(g.enabled_spares, '{}')))
                   order by x.sort_order, x.id), '[]'::jsonb) from mdl.questions x where x.bank = v_bank),
    'leaderboard', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
                       'online', pl.last_seen_at > clock_timestamp() - interval '20 seconds') order by l.rank), '[]'::jsonb)
                      from mdl.leaderboard(g.id) l join mdl.players pl on pl.id = l.player_id),
    'stats', case when g.id is null then null else mdl.final_stats(g.id) end);
end $$;

create or replace function public.admin_save_question(p_token text, p_q jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_kind text; v_opts jsonb; v_correct int; v_id bigint; v_bank text;
begin
  perform mdl.check_admin(p_token);
  v_kind := coalesce(p_q->>'kind', 'mcq');
  if v_kind = 'tf' then
    v_opts := '["נכון","לא נכון"]'::jsonb;
  else
    select coalesce(jsonb_agg(to_jsonb(btrim(o)) order by n), '[]'::jsonb) into v_opts
      from jsonb_array_elements_text(coalesce(p_q->'options', '[]'::jsonb)) with ordinality t(o, n)
     where btrim(o) <> '';
    if jsonb_array_length(v_opts) < 2 or jsonb_array_length(v_opts) > 4 then
      return jsonb_build_object('error', 'options');
    end if;
  end if;
  v_correct := (p_q->>'correct_index')::int;
  if v_correct is null or v_correct < 0 or v_correct >= jsonb_array_length(v_opts) then
    return jsonb_build_object('error', 'correct_index');
  end if;
  if btrim(coalesce(p_q->>'text', '')) = '' then return jsonb_build_object('error', 'text'); end if;

  if (p_q->>'id') is not null then
    update mdl.questions set
      kind = v_kind, text = btrim(p_q->>'text'), options = v_opts, correct_index = v_correct,
      explanation = coalesce(p_q->>'explanation', ''), category = coalesce(nullif(btrim(p_q->>'category'), ''), 'כללי'),
      difficulty = coalesce((p_q->>'difficulty')::int, 2),
      time_limit_sec = nullif((p_q->>'time_limit_sec'), '')::int,
      is_demo = coalesce((p_q->>'is_demo')::boolean, is_demo),
      guide_short     = coalesce(p_q->>'guide_short', guide_short),
      guide_long      = coalesce(p_q->>'guide_long', guide_long),
      guide_location  = coalesce(p_q->>'guide_location', guide_location),
      guide_practical = coalesce(p_q->>'guide_practical', guide_practical),
      guide_sources   = coalesce(p_q->'guide_sources', guide_sources),
      guide_fact      = coalesce(p_q->>'guide_fact', guide_fact),
      guide_visibility = coalesce(p_q->>'guide_visibility', guide_visibility),
      admin_edited = true,
      updated_at = clock_timestamp()
     where id = (p_q->>'id')::bigint returning id into v_id;
    if v_id is null then return jsonb_build_object('error', 'not_found'); end if;
  else
    -- une nouvelle question va dans la banque de la partie active (V1 par défaut)
    v_bank := coalesce((select bank from mdl.games where is_active), 'V1');
    insert into mdl.questions (bank, kind, text, options, correct_index, explanation, category, difficulty, time_limit_sec, sort_order, is_demo,
                               guide_short, guide_long, guide_location, guide_practical, guide_sources,
                               guide_fact, guide_visibility)
    values (v_bank, v_kind, btrim(p_q->>'text'), v_opts, v_correct, coalesce(p_q->>'explanation', ''),
            coalesce(nullif(btrim(p_q->>'category'), ''), 'כללי'), coalesce((p_q->>'difficulty')::int, 2),
            nullif((p_q->>'time_limit_sec'), '')::int,
            coalesce((p_q->>'sort_order')::int, (select coalesce(max(sort_order), 0) + 1 from mdl.questions where bank = v_bank)),
            coalesce((p_q->>'is_demo')::boolean, false),
            coalesce(p_q->>'guide_short', ''), coalesce(p_q->>'guide_long', ''), coalesce(p_q->>'guide_location', ''),
            coalesce(p_q->>'guide_practical', ''), coalesce(p_q->'guide_sources', '[]'::jsonb),
            coalesce(p_q->>'guide_fact', ''), coalesce(p_q->>'guide_visibility', 'topic'))
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.admin_delete_question(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  delete from mdl.questions where id = p_id;   -- les parties gardent leur copie figée
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reorder(p_token text, p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  update mdl.questions q set sort_order = t.pos
    from unnest(p_ids) with ordinality t(id, pos) where q.id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- Nouvelle partie : c'est le SEUL moment où l'on choisit la banque (V1, V2, V3…).
-- Les anciennes parties, leurs joueurs et leurs réponses sont conservés (seulement désactivés).
drop function if exists public.admin_new_game(text, text);   -- ancienne signature (sans banque)
create or replace function public.admin_new_game(p_token text, p_title text default null, p_bank text default 'V1')
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_id bigint; old mdl.games; b mdl.question_banks; v_time int; v_min int;
begin
  perform mdl.check_admin(p_token);
  select * into b from mdl.question_banks where code = coalesce(p_bank, 'V1');
  if not found then return jsonb_build_object('error', 'bad_bank'); end if;
  old := mdl.active_game();
  v_min := greatest(30, coalesce(old.min_answer_sec, 30));
  -- V2/V3 : 45 s par défaut (question_banks.default_time_sec) ; V1 : durée précédente,
  -- jamais sous le minimum (0 = sans limite)
  v_time := coalesce(b.default_time_sec, old.default_time_limit_sec, 30);
  if v_time > 0 then v_time := greatest(v_time, v_min); end if;
  update mdl.games set is_active = false,
         status = case when status = 'finished' then status else 'finished' end,
         finished_at = coalesce(finished_at, clock_timestamp())
   where is_active;
  insert into mdl.games (title, bank, base_points, max_bonus, bonus_window_sec, grace_sec, default_time_limit_sec, min_answer_sec)
  values (coalesce(nullif(btrim(p_title), ''), 'מורה דרך LIVE'), b.code,
          coalesce(old.base_points, 100), coalesce(old.max_bonus, 100),
          coalesce(old.bonus_window_sec, 20), coalesce(old.grace_sec, 1.5),
          v_time, v_min)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'bank', b.code);
end $$;

-- Active / désactive une question de remplacement (SPARE) pour la partie en cours.
create or replace function public.admin_toggle_spare(p_token text, p_question_id bigint, p_on boolean)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; x mdl.questions;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  if g.id is null then return jsonb_build_object('error', 'no_game'); end if;
  select * into x from mdl.questions where id = p_question_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if x.bank <> g.bank then return jsonb_build_object('error', 'wrong_bank'); end if;
  if x.selection <> 'SPARE' then return jsonb_build_object('error', 'not_spare'); end if;
  update mdl.games set enabled_spares = case
      when p_on then (select array_agg(distinct e) from unnest(enabled_spares || x.id) e)
      else array_remove(enabled_spares, x.id) end
   where id = g.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_open_question(p_token text, p_question_id bigint)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; x mdl.questions; v_now timestamptz := clock_timestamp(); v_seq int; v_limit int;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  if g.id is null then return jsonb_build_object('error', 'no_game'); end if;
  perform 1 from mdl.games where id = g.id for update;           -- évite deux publications simultanées
  select * into g from mdl.games where id = g.id;
  if g.status = 'finished' then return jsonb_build_object('error', 'finished'); end if;
  if g.phase = 'open' then return jsonb_build_object('error', 'question_open'); end if;
  select * into x from mdl.questions where id = p_question_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  -- une partie ne joue QUE sa banque
  if x.bank is distinct from g.bank then return jsonb_build_object('error', 'wrong_bank'); end if;
  -- question de remplacement : seulement si le guide l'a activée pour cette partie
  if x.selection = 'SPARE' and not (x.id = any(g.enabled_spares)) then
    return jsonb_build_object('error', 'spare_disabled');
  end if;
  if exists (select 1 from mdl.game_questions where game_id = g.id and question_id = x.id) then
    return jsonb_build_object('error', 'already_used');
  end if;
  -- question précédente fermée mais pas révélée → on la révèle
  update mdl.game_questions set status = 'revealed', revealed_at = v_now
   where game_id = g.id and status = 'closed';
  select coalesce(max(seq), 0) + 1 into v_seq from mdl.game_questions where game_id = g.id;
  -- durée propre à la question, sinon durée par défaut de la partie (0 = sans limite),
  -- jamais inférieure au temps de réponse minimal de la partie
  v_limit := coalesce(x.time_limit_sec, nullif(g.default_time_limit_sec, 0));
  if v_limit is not null then v_limit := greatest(v_limit, g.min_answer_sec); end if;
  insert into mdl.game_questions (game_id, question_id, seq, kind, text, options, correct_index, explanation,
                                  category, time_limit_sec, status, opened_at, closes_at, i18n)
  values (g.id, x.id, v_seq, x.kind, x.text, x.options, x.correct_index, x.explanation, x.category,
          v_limit, 'open', v_now,
          case when v_limit is null then null else v_now + make_interval(secs => v_limit) end,
          mdl.pub_i18n(x.i18n));                       -- liste blanche : aucun texte privé
  update mdl.games set status = 'live', phase = 'open', paused = false, current_question = x.id,
         opened_at = v_now, closes_at = case when v_limit is null then null
                                             else v_now + make_interval(secs => v_limit) end,
         version = version + 1
   where id = g.id;
  return jsonb_build_object('ok', true, 'seq', v_seq);
end $$;

-- Temps de réponse minimal : renvoie les ms restantes avant de pouvoir fermer (0 = autorisé).
create or replace function mdl.too_early_ms(g mdl.games) returns int
language sql stable as $$
  select case when g.phase = 'open' and g.opened_at is not null
              then greatest(0, ceil(extract(epoch from (g.opened_at + make_interval(secs => g.min_answer_sec)
                                                         - clock_timestamp())) * 1000))::int
              else 0 end
$$;

-- Fermeture : refusée avant le temps minimal, sauf urgence explicite (p_force, confirmée dans l'admin).
drop function if exists public.admin_close_question(text);
create or replace function public.admin_close_question(p_token text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; v_left int;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  perform 1 from mdl.games where id = g.id for update;
  select * into g from mdl.games where id = g.id;
  v_left := mdl.too_early_ms(g);
  if v_left > 0 and not coalesce(p_force, false) then
    return jsonb_build_object('error', 'too_early', 'remaining_ms', v_left);
  end if;
  update mdl.game_questions set status = 'closed', closed_at = clock_timestamp(), forced_close = (v_left > 0)
   where game_id = g.id and question_id = g.current_question and status = 'open';
  update mdl.games set phase = 'closed', version = version + 1 where id = g.id and phase = 'open';
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.admin_reveal(text);
create or replace function public.admin_reveal(p_token text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; v_now timestamptz := clock_timestamp(); v_left int;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  perform 1 from mdl.games where id = g.id for update;
  select * into g from mdl.games where id = g.id;
  v_left := mdl.too_early_ms(g);
  if v_left > 0 and not coalesce(p_force, false) then
    return jsonb_build_object('error', 'too_early', 'remaining_ms', v_left);
  end if;
  if g.phase = 'open' then  -- révéler implique fermer
    update mdl.game_questions set status = 'closed', closed_at = v_now, forced_close = (v_left > 0)
     where game_id = g.id and question_id = g.current_question and status = 'open';
  end if;
  update mdl.game_questions set status = 'revealed', revealed_at = v_now
   where game_id = g.id and question_id = g.current_question and status = 'closed';
  update mdl.games set phase = 'revealed', version = version + 1
   where id = g.id and phase in ('open','closed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_pause(p_token text, p_paused boolean)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  if p_paused and g.phase = 'open' then return jsonb_build_object('error', 'question_open'); end if;
  update mdl.games set paused = p_paused, version = version + 1 where id = g.id;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.admin_finish(text);
create or replace function public.admin_finish(p_token text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; r jsonb;
begin
  r := public.admin_reveal(p_token, p_force);
  if r ? 'error' then return r; end if;          -- question ouverte depuis moins du minimum
  g := mdl.active_game();
  update mdl.games set status = 'finished', paused = false, finished_at = clock_timestamp(),
         version = version + 1 where id = g.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_resume_game(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin  -- annule un "terminer" fait par erreur
  perform mdl.check_admin(p_token);
  update mdl.games set status = 'live', finished_at = null, version = version + 1
   where is_active and status = 'finished';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_settings(p_token text, p_s jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_min int;
begin
  perform mdl.check_admin(p_token);
  -- temps de réponse minimal : réglable, mais jamais sous 30 s depuis l'admin
  select least(600, greatest(30, coalesce((p_s->>'min_answer_sec')::int, min_answer_sec)))
    into v_min from mdl.games where is_active;
  update mdl.games set
    min_answer_sec   = v_min,
    title            = coalesce(nullif(btrim(p_s->>'title'), ''), title),
    base_points      = least(1000, greatest(0, coalesce((p_s->>'base_points')::int, base_points))),
    max_bonus        = least(1000, greatest(0, coalesce((p_s->>'max_bonus')::int, max_bonus))),
    bonus_window_sec = least(600, greatest(1, coalesce((p_s->>'bonus_window_sec')::int, bonus_window_sec))),
    grace_sec        = least(10, greatest(0, coalesce((p_s->>'grace_sec')::numeric, grace_sec))),
    default_time_limit_sec = case when (p_s->>'default_time_limit_sec') is null then default_time_limit_sec
                                  when (p_s->>'default_time_limit_sec')::int <= 0 then 0
                                  else least(600, greatest(v_min, (p_s->>'default_time_limit_sec')::int)) end,
    version          = version + 1
   where is_active;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_player(p_token text, p_player_id bigint)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  update mdl.players set removed = true where id = p_player_id
   and game_id = (select id from mdl.games where is_active);
  perform mdl.bump((select id from mdl.games where is_active));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_export(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  return jsonb_build_object(
    'game', to_jsonb(g),
    'leaderboard', (select coalesce(jsonb_agg(to_jsonb(l) order by l.rank), '[]') from mdl.leaderboard(g.id) l),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'text', text, 'options', options,
                     'correct_index', correct_index, 'status', status, 'forced_close', forced_close) order by seq), '[]')
                    from mdl.game_questions where game_id = g.id),
    'answers', (select coalesce(jsonb_agg(jsonb_build_object('seq', gq.seq, 'player', p.name, 'lang', p.lang, 'choice', a.choice,
                     'correct', a.is_correct, 'points', a.points, 'elapsed_ms', a.elapsed_ms,
                     'received_at', a.received_at) order by gq.seq, a.elapsed_ms), '[]')
                  from mdl.answers a join mdl.players p on p.id = a.player_id
                  join mdl.game_questions gq on gq.game_id = a.game_id and gq.question_id = a.question_id
                 where a.game_id = g.id));
end $$;

-- Galerie des parcours photographiés : fiches + anecdotes PRIVÉES (admin uniquement).
-- p_collection null → collection liée à la banque de la partie active, sinon la première.
create or replace function public.admin_photos(p_token text, p_collection text default null)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare c mdl.route_collections;
begin
  perform mdl.check_admin(p_token);
  select * into c from mdl.route_collections
   where code = p_collection
      or (p_collection is null and bank = (select bank from mdl.games where is_active))
   order by (code = p_collection) desc nulls last, sort, code limit 1;
  if not found then select * into c from mdl.route_collections order by sort, code limit 1; end if;
  return jsonb_build_object(
    'collections', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'bank', bank,
                       'direction', direction, 'count', (select count(*) from mdl.route_photos p where p.collection = x.code))
                     order by sort, code), '[]'::jsonb) from mdl.route_collections x),
    'collection', case when c.code is null then null else to_jsonb(c) end,
    'photos', (select coalesce(jsonb_agg(to_jsonb(p) order by p.ord), '[]'::jsonb)
                 from mdl.route_photos p where p.collection = c.code));
end $$;

-- Lecture d'une banque quelconque (admin) : sert à la SIMULATION de trajet, qui peut se faire
-- depuis chez soi sans changer la partie en cours. Ne modifie rien et n'envoie rien aux élèves.
create or replace function public.admin_bank_questions(p_token text, p_bank text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object('bank', p_bank,
    'questions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order, x.id), '[]'::jsonb)
                    from mdl.questions x where x.bank = p_bank));
end $$;

-- V4 : enregistre un parcours généré (tracé + questions) comme une NOUVELLE banque.
-- Une banque par parcours (code A + date) : rien n'est écrasé ni supprimé, les anciennes parties restent intactes.
create or replace function public.admin_import_route(p_token text, p_label jsonb, p_route jsonb, p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_code text; q jsonb; i int := 0; v_n int;
begin
  perform mdl.check_admin(p_token);
  if jsonb_typeof(p_questions) <> 'array' then return jsonb_build_object('error', 'bad_questions'); end if;
  v_n := jsonb_array_length(p_questions);
  if v_n < 1 or v_n > 40 then return jsonb_build_object('error', 'bad_count'); end if;
  if jsonb_typeof(p_route) <> 'object' or jsonb_typeof(p_route->'geometry') <> 'array'
     or jsonb_array_length(p_route->'geometry') < 2 or jsonb_array_length(p_route->'geometry') > 3000
     or pg_column_size(p_route) > 900000 then
    return jsonb_build_object('error', 'bad_route');
  end if;
  for q in select * from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(q->'options') <> 'array' or jsonb_array_length(q->'options') <> 4
       or (q->>'correct_index')::int not between 0 and 3
       or char_length(coalesce(q->>'text', '')) not between 1 and 600
       or coalesce(q->>'key', '') !~ '^[A-Za-z0-9_-]{1,40}$' then
      return jsonb_build_object('error', 'bad_question', 'key', q->>'key');
    end if;
  end loop;
  v_code := 'A' || to_char(clock_timestamp(), 'YYMMDDHH24MISS');
  while exists (select 1 from mdl.question_banks where code = v_code) loop
    v_code := v_code || '_';
  end loop;
  insert into mdl.question_banks (code, label, sort, default_time_sec, route)
  values (v_code, coalesce(p_label, '{}'::jsonb), 100, 45, p_route || jsonb_build_object('bank', v_code));
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    insert into mdl.questions (ext_key, bank, selection, kind, text, options, correct_index, explanation, category,
      difficulty, time_limit_sec, sort_order, guide_short, guide_long, guide_location, guide_practical, guide_sources,
      guide_fact, guide_visibility, i18n, guide_i18n, route_meta)
    values (lower(v_code) || ':' || (q->>'key'), v_code, 'MAIN', 'mcq', q->>'text', q->'options', (q->>'correct_index')::int,
      coalesce(q->>'explanation', ''), left(coalesce(nullif(q->>'category', ''), 'מסלול'), 60), 2, 45, i * 10,
      coalesce(q->>'guide_short', ''), coalesce(q->>'guide_long', ''), coalesce(q->>'guide_location', ''), '',
      coalesce(q->'guide_sources', '[]'::jsonb), coalesce(q->>'guide_fact', ''), 'nearby',
      coalesce(q->'i18n', '{}'::jsonb), coalesce(q->'guide_i18n', '{}'::jsonb), coalesce(q->'route_meta', '{}'::jsonb));
  end loop;
  return jsonb_build_object('code', v_code, 'questions', v_n);
end $$;

-- Solo : le créateur autorise (ou retire) le jeu individuel de ce parcours.
create or replace function public.admin_set_solo(p_token text, p_bank text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
begin
  perform mdl.check_admin(p_token);
  update mdl.question_banks set solo = coalesce(p_on, false) where code = p_bank and route is not null;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('code', p_bank, 'solo', coalesce(p_on, false));
end $$;

-- Solo : n'importe qui avec le lien lit le parcours partagé (tracé + questions + réponses + textes).
-- Aucune écriture, aucune donnée de joueur, et seulement les parcours que le créateur a partagés.
create or replace function public.solo_route(p_code text)
returns jsonb language plpgsql stable security definer set search_path = mdl, public as $$
declare b mdl.question_banks;
begin
  select * into b from mdl.question_banks where code = upper(btrim(coalesce(p_code, ''))) and solo and route is not null;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('code', b.code, 'label', b.label, 'route', b.route,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', split_part(x.ext_key, ':', 2), 'text', x.text, 'options', x.options, 'correct_index', x.correct_index,
        'explanation', x.explanation, 'i18n', x.i18n, 'guide_i18n', x.guide_i18n) order by x.sort_order, x.id), '[]'::jsonb)
      from mdl.questions x where x.bank = b.code));
end $$;

-- ---------------------------------------------------------------------
--  Droits : seules les fonctions public.* ci-dessus sont appelables
-- ---------------------------------------------------------------------
revoke execute on all functions in schema mdl from public;
do $$
declare f text;
begin
  foreach f in array array[
    'join_game(text,text,text,boolean,text)', 'get_state(text,bigint)', 'submit_answer(text,bigint,int)',
    'set_language(text,text)',
    'admin_login(text)', 'admin_state(text)', 'admin_save_question(text,jsonb)', 'admin_delete_question(text,bigint)',
    'admin_reorder(text,bigint[])', 'admin_new_game(text,text,text)', 'admin_open_question(text,bigint)',
    'admin_toggle_spare(text,bigint,boolean)', 'admin_photos(text,text)', 'admin_bank_questions(text,text)',
    'admin_import_route(text,jsonb,jsonb,jsonb)', 'admin_set_solo(text,text,boolean)', 'solo_route(text)',
    'admin_close_question(text,boolean)', 'admin_reveal(text,boolean)', 'admin_pause(text,boolean)', 'admin_finish(text,boolean)',
    'admin_resume_game(text)', 'admin_settings(text,jsonb)', 'admin_remove_player(text,bigint)', 'admin_export(text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;

-- Première partie créée automatiquement (si aucune n'existe)
insert into mdl.games (title)
select 'מורה דרך LIVE' where not exists (select 1 from mdl.games);

-- Supabase : recharger le cache de l'API après un changement de signature de fonction
notify pgrst, 'reload schema';

-- =====================================================================
--  34 questions du trajet Zikhron Ya'akov → Haïfa (route côtière, sans tunnels)
--  + fiches de guidage oral PRIVÉES (visibles uniquement dans l'admin).
--  Fichier GÉNÉRÉ par tools/build-route-sql.mjs à partir de content/ — ne pas éditer à la main.
--  Ré-exécutable : chaque question est identifiée par ext_key ; une nouvelle exécution
--  met à jour le contenu (et écrase les modifications faites dans l'admin sur ces 34 questions).
-- =====================================================================

-- Les questions de démonstration éventuelles passent en fin de liste (elles ne sont pas supprimées)
update mdl.questions set sort_order = 1000 + sort_order where is_demo and sort_order < 1000;

insert into mdl.questions (ext_key, kind, text, options, correct_index, explanation, category, difficulty,
  time_limit_sec, sort_order, guide_short, guide_long, guide_location, guide_practical, guide_sources,
  guide_fact, guide_visibility)
values
($mdl$q30-taninim-dam$mdl$, $mdl$mcq$mdl$, $mdl$איזה מתקן הנדסי קדום ניתן לראות בשמורת נחל תנינים?$mdl$, $mdl$["סכר מים","רכבל","מעלית הרים","תחנת חלל"]$mdl$::jsonb, 0, $mdl$הרומאים חסמו בסכר את המעבר של נחל תנינים ברכס הכורכר ויצרו אגם שהזין את אמת המים לקיסריה.$mdl$, $mdl$ארכאולוגיה$mdl$, 1, null, 1, $mdl$עכשיו אנחנו חוצים את נחל תנינים. ממש קרוב לכאן, בתוך שמורת נחל תנינים, עומד אחד ממפעלי המים המרשימים של העולם העתיק: סכר רומי באורך של כמאתיים מטר.

הרומאים חסמו בו את הפרצה שהנחל פרץ ברכס הכורכר, ויצרו מאחוריו אגם. מהאגם הזה יצאה אמת המים הנמוכה, שהובילה מים לקיסריה. ומאוחר יותר, בתקופה הביזנטית, המים שעברו דרך הסכר גם סובבו גלגלים של טחנות קמח.$mdl$, $mdl$עכשיו אנחנו חוצים שני נחלים קטנים שנראים תמימים: נחל תנינים ונחל עדה. אבל דווקא כאן, קצת משמאלנו, הסתתר פעם אחד ממפעלי ההנדסה המרשימים של הארץ.

תדמיינו את מישור החוף לפני אלפיים שנה. הנחלים יורדים מהכרמל ומרמות מנשה, ונתקלים ברכס הכורכר שלאורך החוף. בנקודה אחת הם פרצו בו מעבר צר אל הים. ומה עשו הרומאים? חסמו את הפרצה בסכר אבן באורך של כמאה תשעים וארבעה מטרים. מאחורי הסכר נוצר אגם גדול, בשטח של כששת אלפים דונם.

למה הם טרחו כל כך? בגלל קיסריה. העיר הגדולה של הורדוס הייתה צמאה למים, ומהאגם הזה יצאה "אמת המים הנמוכה" שהובילה מים דרומה, אל העיר. יש באזור גם תעלה שנייה, גבוהה יותר, שנחצבה בסלע אבל מעולם לא הובילה מים — פרויקט שנשאר באמצע.

בתקופה הביזנטית מצאו למים שימוש נוסף: הם עברו דרך פתחי הסכר והניעו גלגלים אנכיים של טחנות קמח. וטחנות פעלו כאן, עם הפסקות, עד סוף התקופה העות׳מאנית.

ומה עם השם — תנינים? תנינים באמת חיו כאן. יש אגדה על שני אחים, שהרשע מביניהם הביא תנינים לנחל כדי שיטרפו את אחיו החולה ויישאר שליט יחיד. הזואולוגים מציעים הסבר פחות דרמטי: כנראה שריד לחי טרופית קדומה.

בשנות העשרים של המאה העשרים ייבשו את הביצות של כבארה, שהברון רוטשילד מימן את רכישתן, ובמקומן קמו שדות ובריכות דגים. ועכשיו תסתכלו ימינה — מעל המישור כבר מתרומם רכס הכרמל, ובקצהו הדרומי מחכה לנו זכרון יעקב.$mdl$, $mdl$כשחוצים את נחל תנינים ונחל עדה בכביש 2, ליד ג׳סר א־זרקא (משמאל). הסכר עצמו אינו נראה מהכביש — זו שאלת "אתר בסביבה".$mdl$, $mdl$שמורת נחל תנינים (רשות הטבע והגנים) — טלפון 04-6265151.
חניון בכניסה; לפי מפת השמורה יש שירותים ליד החניון. מסלול נגיש (מסומן בכתום) של כחצי שעה.
אכילה ושתייה רק בחניון. אסור לרחוץ, לדוג, להבעיר אש ולקמפל.
שעות הפתיחה ותנאי חניית אוטובוס לא מופיעים בעלון — לוודא ברשות לפני ביקור.$mdl$, $mdl$[{"title":"רשות הטבע והגנים — עלון שמורת נחל תנינים","url":"https://static.parks.org.il/wp-content/uploads/2025/04/nachal-Taninim.pdf"},{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"}]$mdl$::jsonb, $mdl$יש הסבורים שהרומאים הביאו את התנינים לקרבות זירה בקיסריה. רשות הטבע והגנים מציינת שהזואולוגים רואים בהם דווקא שריד לחי טרופית מלפני כשני מיליון שנה.$mdl$, $mdl$nearby$mdl$),
($mdl$q01-zichron-year$mdl$, $mdl$mcq$mdl$, $mdl$באיזו שנה נוסדה המושבה זכרון יעקב?$mdl$, $mdl$["1870","1882","1909","1948"]$mdl$::jsonb, 1, $mdl$זכרון יעקב נוסדה בדצמבר 1882 על ידי כמאה חלוצים מרומניה, בימי העלייה הראשונה.$mdl$, $mdl$היסטוריה$mdl$, 1, null, 2, $mdl$תסתכלו ימינה, למעלה על הרכס — זו זכרון יעקב. היא נוסדה בדצמבר 1882, באותה שנה שבה נוסדו גם ראשון לציון וראש פינה. זו השנה שבה מתחילה העלייה הראשונה.

את זכרון הקימו כמאה חלוצים יהודים מרומניה, אנשי תנועת חיבת ציון. הם הגיעו עם הרבה התלהבות וכמעט בלי ניסיון בחקלאות. ובחורף הראשון הם גילו כמה קשה לעבד אדמה טרשית על הרכס.$mdl$, $mdl$תסתכלו ימינה, אל ראש הרכס. הבתים שאתם רואים שם הם זכרון יעקב, אחת המושבות הראשונות של העלייה הראשונה.

השנה היא 1882. ברומניה מתארגנות קבוצות של יהודים מחיבת ציון, ומחליטות לעלות לארץ ישראל ולהיות חקלאים. כמאה מהם קונים אדמות משני מקומות: כששת אלפים דונם בכפר הערבי זמארין, על הרכס, וכחמש מאות דונם בטנטורה, על החוף. בדצמבר 1882 הם עולים על הגבעה.

החורף הראשון היה קשה מאוד. הם לא היו חקלאים, האדמה הייתה טרשית, והכסף נגמר מהר. בתוך שנה המושבה עמדה על סף התמוטטות. ואז נכנס לתמונה אדם אחד, שלא גר כאן ואפילו לא היה כאן: הברון אדמונד דה רוטשילד מפריז. ב-1883 הוא לקח את המושבה תחת חסותו, שלח פקידים ואגרונומים, ומימן את מה שהמתיישבים לא יכלו לממן לבד.

הברון ידע להמר על הכרם. על המדרונות האלה ניטעו גפנים, ובזכרון קם יקב שהפך לאחד הסמלים של המושבה עד היום. מכאן, אגב, צמחה גם משפחת אהרונסון, וממנה מחתרת ניל"י, אבל לזה נגיע כשנתקרב לעתלית.

שימו לב גם למיקום: לא במישור הביצתי למטה, אלא למעלה, על הרכס. אוויר טוב יותר, פחות קדחת, ותצפית על כל המישור. ועל השם "זכרון יעקב", ועל השם שהיה כאן קודם, נדבר בשאלות הבאות.$mdl$, $mdl$כשזכרון יעקב נראית מימין, על ראש רכס הכרמל (לפי סיפור הדרך של הקורס, אחרי מעגן מיכאל ובריכות הדגים).$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Zikhron Ya'akov","url":"https://en.wikipedia.org/wiki/Zikhron_Ya%27akov"},{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"}]$mdl$::jsonb, $mdl$זכרון יעקב, ראשון לציון וראש פינה נוסדו כולן ב-1882. השנה הזו נחשבת לתחילת העלייה הראשונה.$mdl$, $mdl$visible$mdl$),
($mdl$q02-zamarin$mdl$, $mdl$mcq$mdl$, $mdl$מה היה שמה הראשון של זכרון יעקב?$mdl$, $mdl$["זמארין","עתלית","שפיה","דור"]$mdl$::jsonb, 0, $mdl$המתיישבים קנו אדמות בכפר זמארין, והמושבה נקראה תחילה על שמו, עד שהברון שינה את שמה.$mdl$, $mdl$היסטוריה$mdl$, 2, null, 3, $mdl$לפני שהיא נקראה זכרון יעקב, למושבה היה שם אחר: זמארין. זה היה שמו של הכפר הערבי שעמד על הגבעה, ושמאדמותיו קנו המתיישבים מרומניה.

רק אחרי שהברון רוטשילד לקח את המושבה תחת חסותו, היא קיבלה את שמה החדש. ותשובה לשאלה "על שם מי?" — בשאלה הבאה.$mdl$, $mdl$את השם זמארין כמעט אף אחד כבר לא זוכר, אבל זה היה השם הראשון של המושבה.

כשהחלוצים מרומניה הגיעו ב-1882, הם לא בנו על אדמה ריקה. הם קנו קרקעות מהכפר זמארין, שעמד על ראש הגבעה, וכך המושבה נקראה בהתחלה פשוט "זמארין".

העסקה עצמה מעניינת: הם קנו כששת אלפים דונם בזמארין, ועוד כחמש מאות דונם בטנטורה, על החוף, ושילמו בסך הכול כארבעים ושישה אלף פרנקים. על הנייר זה נשמע הרבה אדמה. בפועל, רובה הייתה טרשית ומלאה סלעים, וחלק מהחלומות של החורף הראשון התנפצו על הסלעים האלה. זה דפוס מוכר בעלייה הראשונה: המושבות נקראו בהתחלה על שם הכפר או המקום, ורק אחר כך קיבלו שם עברי.

שם עברי היה עניין חשוב. הוא סימן שינוי: זה כבר לא עוד כפר, זו מושבה יהודית חדשה עם זהות משלה. ב-1883, כשהברון אדמונד דה רוטשילד לקח את המושבה תחת חסותו, הוא נתן לה שם חדש, עם משמעות אישית מאוד בשבילו.

חשוב לזכור שבאותן שנים, מסביב, עמדו כפרים ערביים שהמשיכו להתקיים לצד המושבה. אחד מהם, פוריידיס, עדיין כאן, על המורדות המערביים של הכרמל. נראה אותו מימין בעוד כמה רגעים.

אז זמארין זה השם הראשון. ועל השם השני, זכרון יעקב, מיד בשאלה הבאה.$mdl$, $mdl$ממשיכים מהשאלה הקודמת, כשזכרון יעקב עדיין נראית מימין על הרכס.$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Zikhron Ya'akov","url":"https://en.wikipedia.org/wiki/Zikhron_Ya%27akov"},{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"}]$mdl$::jsonb, $mdl$גם הכפר פוריידיס, שנראה מימין על מורדות הכרמל, קיים עד היום. שמו מזכיר את המילה "פרדס" או "פרדייז", גן עדן.$mdl$, $mdl$visible$mdl$),
($mdl$q03-named-after$mdl$, $mdl$mcq$mdl$, $mdl$על שם מי נקראה המושבה זכרון יעקב?$mdl$, $mdl$["יעקב אבינו","אביו של הברון רוטשילד","יעקב דורי","יעקב חזן"]$mdl$::jsonb, 1, $mdl$הברון אדמונד דה רוטשילד קרא למושבה על שם אביו, ג׳יימס (יעקב) מאיר דה רוטשילד.$mdl$, $mdl$היסטוריה$mdl$, 1, null, 4, $mdl$"זכרון יעקב" — זיכרון למי? לא ליעקב אבינו, כמו שרבים חושבים, אלא לאבא של הברון.

הברון אדמונד דה רוטשילד קרא למושבה על שם אביו, ג׳יימס, ובעברית יעקב, מאיר דה רוטשילד, שייסד את הענף הצרפתי של משפחת הבנקאים. כך מושבה קטנה על הכרמל הפכה לאנדרטה משפחתית.$mdl$, $mdl$רוב האנשים בטוחים שזכרון יעקב נקראת על שם יעקב אבינו. זה נשמע הגיוני: מושבה עברית, שם מקראי. אבל התשובה היא דווקא משפחתית.

הברון אדמונד דה רוטשילד היה הבן הצעיר של ג׳יימס מאיר דה רוטשילד, ובעברית יעקב, שייסד את הענף הצרפתי של משפחת רוטשילד. אדמונד נולד בפריז, ובשנות השמונים של המאה התשע עשרה התחיל לתמוך במושבות העלייה הראשונה. הוא תמך בהן בכסף, אבל גם ניהל אותן בפועל, באמצעות פקידים ששלח מצרפת.

ב-1883 הוא לקח את זמארין תחת חסותו, ונתן לה שם לזכר אביו. גם מושבות אחרות קיבלו שמות מבני המשפחה: בנימינה, שכנתה של זכרון, נקראת על שמו של הברון עצמו, בשמו העברי, בנימין.

אז למה אנשים רבים מכנים אותו "הנדיב הידוע"? כי הוא נתן הרבה, אבל העדיף לעשות את זה מבלי שיגידו בכל מקום את שמו. ויש כאן פרט יפה: את השם של עצמו הוא לא נתן לזכרון יעקב, אלא את שם אביו.

והקשר של הברון לזכרון לא נגמר בחייו. ממש מעל המושבה, ברמת הנדיב, הוא קבור יחד עם אשתו. על זה נדבר בעוד כמה שאלות.$mdl$, $mdl$כשזכרון יעקב עדיין מימין. מתאים לשאול מיד אחרי שאלת "זמארין".$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Zikhron Ya'akov","url":"https://en.wikipedia.org/wiki/Zikhron_Ya%27akov"}]$mdl$::jsonb, $mdl$גם בנימינה, השכנה של זכרון יעקב, קרויה על שם הברון: בנימין הוא שמו העברי של אדמונד.$mdl$, $mdl$visible$mdl$),
($mdl$q04-chotem-carmel$mdl$, $mdl$mcq$mdl$, $mdl$באיזה אזור גאוגרפי נמצאת זכרון יעקב?$mdl$, $mdl$["הגלבוע","הרי יהודה","חוטם הכרמל","הרי נפתלי"]$mdl$::jsonb, 2, $mdl$זכרון יעקב שוכנת בקצה הדרומי של רכס הכרמל, באזור חוטם הכרמל, השלוחה הדרומית של הרכס.$mdl$, $mdl$גאוגרפיה$mdl$, 2, null, 5, $mdl$זכרון יעקב לא יושבת סתם על גבעה. היא בקצה הדרומי של רכס הכרמל, באזור שנקרא "חוטם הכרמל".

השם בא מהצורה: השלוחה הדרומית של הכרמל בולטת קדימה כמו אף. בצד המערבי שלה יש מצוק, ומלמעלה רואים את כל מישור חוף הכרמל, עד הים.$mdl$, $mdl$תסתכלו על קו הרכס מימין. הכרמל הוא לא גוש אחד אחיד. הוא משתרע מחיפה בצפון-מערב ועד כאן, אל הקצה הדרומי שלו. והקצה הזה, השלוחה הדרומית, נקרא "חוטם הכרמל".

למה חוטם? כי במבט מהצד, השלוחה בולטת כמו אף. בצד המערבי שלה, זה שפונה אלינו, יש מצוק. ומלמעלה, מהמצפורים של רמת הנדיב, נשקף כל מישור חוף הכרמל: רכסי הכורכר, בריכות הדגים, וקו החוף.

הכרמל עצמו הוא חלק משדרת ההר המרכזית של הארץ, כמו שלמדנו בסיור הגיאולוגיה. הוא בנוי בעיקר מסלעי גיר ודולומיט קשים. הוא גם הר אסימטרי: המדרון המזרחי תלול, והמדרון המערבי, זה שמולנו, מתון יותר ויורד בהדרגה אל מישור החוף.

למה בנו את המושבה דווקא כאן למעלה? כי למטה, במישור, היו ביצות וקדחת. על הרכס היה אוויר טוב יותר, ותצפית שולטת על הסביבה.

ובשמורת חוטם הכרמל ובסביבתה עובר גם שביל ישראל. אז אם מישהו מכם הלך בשביל, יש סיכוי טוב שהוא כבר עמד על המצוק הזה והסתכל משם למטה, בדיוק אל הכביש שאנחנו נוסעים בו עכשיו.$mdl$, $mdl$כשהרכס של זכרון יעקב נראה מימין, ומצוק הכרמל המערבי מתנשא מעל מישור החוף.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קק\"ל — חוטם הכרמל, חומרי לימוד","url":"https://www.kkl.org.il/education/youth-and-education/study-materials-for-teachers/geography_of_israel/chotem_ha_karmel/"},{"title":"Wikipedia — Zikhron Ya'akov","url":"https://en.wikipedia.org/wiki/Zikhron_Ya%27akov"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$שביל ישראל עובר לאורך המצוק המערבי של חוטם הכרמל, וממנו נשקף כל מישור חוף הכרמל.$mdl$, $mdl$visible$mdl$),
($mdl$q29-ramat-hanadiv$mdl$, $mdl$mcq$mdl$, $mdl$איזה אתר ליד זכרון יעקב משלב גני זיכרון ופארק טבע?$mdl$, $mdl$["רמת הנדיב","גן השלושה","מצדה","פארק תמנע"]$mdl$::jsonb, 0, $mdl$ברמת הנדיב, ליד זכרון יעקב, נמצאים גני הזיכרון וקבר הברון רוטשילד ורעייתו, ולידם פארק טבע עם מסלולים.$mdl$, $mdl$אתרי ביקור$mdl$, 1, null, 6, $mdl$ממש מעל זכרון יעקב נמצאת רמת הנדיב. במרכזה גני הזיכרון, ובהם קבורים הברון אדמונד דה רוטשילד ורעייתו, במערת קבורה שהדלתות שלה עשויות בסגנון תלמודי.

מסביב לגנים יש פארק טבע עם מסלולי הליכה: מעיין עין צור, חורבת עקב עם וילה מהתקופה הביזנטית, ומערת כבארה, שבה נמצאו שרידים של אדם קדמון.$mdl$, $mdl$הנדיב הידוע, הברון אדמונד דה רוטשילד, נפטר בצרפת ב-1934. אבל הבקשה שלו הייתה להיקבר בארץ ישראל, בין המושבות שבנה. ב-1954, אחרי קום המדינה, הועברו עצמותיו ועצמות אשתו, אדלייד, ונקברו כאן, על הרכס מעל זכרון יעקב.

סביב הקבר תוכננו גני הזיכרון: גן מפלים, גן ורדים, גן דקלים וגן ריחות. קבר הברון ורעייתו נמצא במערת קבורה במרכז הגנים. הדלתות שלה עשויות בסגנון שמזכיר מערות קבורה מתקופת התלמוד. זה מקום שקט מאוד, והרבה ישראלים שמגיעים לאזור עוצרים בו.

אבל רמת הנדיב היא לא רק גן. מסביב יש פארק טבע של חורש ים תיכוני, עם מסלולי הליכה מעגליים. בדרך פוגשים את מעיין עין צור, את חורבת עקב, שבה וילה חקלאית מהתקופה הביזנטית, ואת מערת כבארה, שבה נמצאו שרידים של בני אדם קדמונים. הגנים נגישים לכיסאות גלגלים ולעגלות, ויש מרכז מבקרים שנבנה בתקני בנייה ירוקה.

ויש כאן משהו סמלי. הברון רצה שיזכרו את המושבות, לא אותו. ובכל זאת המקום שלו נקרא "רמת הנדיב": הוא אולי לא חתם בשמו, אבל הכינוי שלו נשאר על המפה. מכאן ממשיכים צפונה, והנוף משתנה: אנחנו נכנסים לאזור החקלאות של מישור חוף הכרמל.$mdl$, $mdl$כשזכרון יעקב וחוטם הכרמל מימין. רמת הנדיב נמצאת על הרכס ואינה נראית מכביש 2 — זו שאלת "אתר בסביבה".$mdl$, $mdl$רמת הנדיב — גני זיכרון ופארק טבע ליד זכרון יעקב.
חניון ליד השער הראשי, מרכז מבקרים ומסעדה. הגנים נגישים לכיסאות גלגלים ולעגלות. כלבים מותרים במסלולים המעגליים אבל לא בגנים.
בתחבורה ציבורית: רכבת לבנימינה, ואחריה אוטובוס לכיוון זכרון יעקב; כמה קווים עוצרים בכביש 652, כ-1.5 ק"מ הליכה מהאתר.
שעות פתיחה, שירותים וחניית אוטובוס לא מפורטים במקור שנבדק — לוודא באתר הרשמי של רמת הנדיב לפני ביקור.$mdl$, $mdl$[{"title":"טיולי — רמת הנדיב","url":"https://www.tiuli.com/tracks/6/%D7%A8%D7%9E%D7%AA-%D7%94%D7%A0%D7%93%D7%99%D7%91"},{"title":"קק\"ל — חוטם הכרמל, חומרי לימוד","url":"https://www.kkl.org.il/education/youth-and-education/study-materials-for-teachers/geography_of_israel/chotem_ha_karmel/"}]$mdl$::jsonb, $mdl$קרוב לרמת הנדיב נמצאת מערת כבארה, שבה נמצאו שרידים של בני אדם קדמונים. הקשר לאדם הקדום של הכרמל ממשיך צפונה, לנחל מערות.$mdl$, $mdl$nearby$mdl$),
($mdl$q05-carmel-right$mdl$, $mdl$mcq$mdl$, $mdl$כשנוסעים צפונה בכביש החוף, באיזה צד נמצא בדרך כלל רכס הכרמל?$mdl$, $mdl$["ימין","שמאל","מאחור","משני הצדדים"]$mdl$::jsonb, 0, $mdl$בנסיעה צפונה, הים משמאל (מערב) ורכס הכרמל מימין (מזרח).$mdl$, $mdl$גאוגרפיה$mdl$, 1, null, 7, $mdl$כשנוסעים צפונה, הים תמיד משמאל, והכרמל מימין. תסתכלו עכשיו ימינה: זה הקיר הירוק שילווה אותנו עד חיפה.

וטיפ קטן למורי דרך: באוטובוס, המטיילים לא רואים קדימה. לכן תמיד מכוונים לפני שמסבירים: "בצד ימין רואים…". כך כולם מספיקים להסתכל לפני שהנוף נעלם.$mdl$, $mdl$תסתכלו ימינה. הרכס הירוק הזה הוא הכרמל, והוא יהיה מימיננו לאורך כל הנסיעה, עד שנגיע לחיפה. משמאל — הים. בין שניהם, הרצועה הצרה שבה אנחנו נוסעים: מישור חוף הכרמל.

ומיד, טיפ מקצועי מהקורס. באוטובוס, הקבוצה לא רואה את מה שלפנים. הם רואים רק את מה שבצדדים. לכן מורה דרך טוב מכוון לפני שהוא מסביר: "בצד ימין רואים…", או "בעוד רגע, בצד שמאל, נראה…". כך כולם מספיקים להסתובב לפני שהנוף חולף.

ועכשיו לכרמל עצמו. "ככרמל בים יבוא", כתוב בספר ירמיהו. והביטוי הזה מדויק: הכרמל הוא הרכס שממש יורד אל הים, בחיפה. לאורך הנסיעה תראו איך הוא מתקרב אלינו לאט לאט, והמישור שבינו לבין הים הולך ונעשה צר.

שימו לב גם לכיוון שלו. הכרמל לא משתרע בדיוק מצפון לדרום, אלא מדרום-מזרח לצפון-מערב, באלכסון. לכן נדמה לנו שהוא "מתקרב" ככל שנוסעים צפונה. ובסוף הדרך, בחיפה, הוא יפגוש את הים.

אז כלל הזהב לנסיעה של היום: ים משמאל, כרמל מימין. ובשאלה הבאה נראה מה קורה לרצועה שבאמצע.$mdl$, $mdl$בכל קטע פתוח שבו הכרמל נראה בבירור מימין. סיפור הדרך של הקורס מציין "מבט על רכס הכרמל" מימין אחרי מעגן מיכאל.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$"ככרמל בים יבוא" (ירמיהו מ"ו, י"ח) — הכרמל הוא הרכס היורד אל הים בחיפה, כפי שהודגש בסיור הכרמל של הקורס.$mdl$, $mdl$visible$mdl$),
($mdl$q11-bananas$mdl$, $mdl$mcq$mdl$, $mdl$איזה גידול חקלאי אופייני למישור חוף הכרמל?$mdl$, $mdl$["קפה","בננות","אורז מוצף","קקאו"]$mdl$::jsonb, 1, $mdl$במישור חוף הכרמל יש מטעי בננות רבים, בזכות מיקרו-אקלים נוח ומים זמינים.$mdl$, $mdl$חקלאות$mdl$, 1, null, 8, $mdl$תסתכלו ימינה — המבנים הגדולים המכוסים ברשתות הם מטעי בננות. מישור חוף הכרמל הוא אחד מאזורי הבננות המרכזיים בארץ.

למה דווקא כאן? בגלל מיקרו-אקלים נוח: הים ממתן את הקור בחורף, ויש מים זמינים, כי מי התהום במישור הזה גבוהים. ובננה צריכה הרבה מאוד מים.$mdl$, $mdl$בצד ימין, המבנים הענקיים שנראים כמו אוהלים ירוקים או אפורים הם מטעי בננות. אם תסתכלו טוב, תראו מתחת לרשתות את העלים הגדולים.

הבננה היא צמח טרופי. היא אוהבת חום, לחות והרבה מים, והיא שונאת קור, רוח חזקה וברד. אז מה היא עושה כאן, בים התיכון? התשובה היא מיקרו-אקלים. מישור חוף הכרמל הוא רצועה צרה בין ההר לים. הים ממתן את הטמפרטורות: הלילות בחורף פחות קרים מאשר בפנים הארץ. ובמישור הזה מי התהום גבוהים, כמו שראינו בבריכות הדגים וכמו שלמדנו על הביצות שהיו כאן בעבר.

הבננות בארץ גדלות בכמה אזורים: בעמק הירדן וליד הכנרת, בגליל המערבי, ופה, במישור חוף הכרמל. בעבר היה נהוג לגדל אותן בשטח פתוח. היום רוב המטעים מכוסים ברשת או ביריעה, וזה כבר נושא לשאלה הבאה.

ומשהו קטן לחידון בבית: הבננה היא לא עץ. היא צמח עשבוני ענק. ה"גזע" שלה בנוי מבסיסי עלים שעוטפים זה את זה.

לסיכום, כשאתם רואים בננות ממשמאל לים ומימין לכרמל, אתם בעצם רואים את כל הסיפור של המקום: חום של חוף, מים של מישור נמוך, ומחסה טבעי בין הר לים.$mdl$, $mdl$כשמטעי הבננות מכוסי הרשתות נראים מימין (לפי סיפור הדרך של הקורס, בקטע שאחרי מעגן מיכאל).$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"}]$mdl$::jsonb, $mdl$הבננה היא צמח עשבוני ענק ולא עץ. ה"גזע" שלה בנוי מבסיסי עלים שעוטפים זה את זה.$mdl$, $mdl$visible$mdl$),
($mdl$q12-banana-nets$mdl$, $mdl$mcq$mdl$, $mdl$למה משתמשים ברשתות מעל מטעי בננות?$mdl$, $mdl$["כדי למנוע כל גשם","כדי להגן על הגידול מפגעי סביבה שונים","כדי להמליח את הקרקע","כדי למנוע פוטוסינתזה"]$mdl$::jsonb, 1, $mdl$הרשתות מגינות על הבננות מפני ציפורים ומזיקים, רוח, ברד, קרינה וקור, ומשפרות את המיקרו-אקלים.$mdl$, $mdl$חקלאות$mdl$, 1, null, 9, $mdl$הרשתות הן כמו מעיל לבננות. הן שומרות על הצמח מפני ציפורים ומזיקים, מפני רוח שקורעת את העלים הגדולים, מפני ברד ומפני שמש חזקה מדי.

והן לא עוצרות את הגשם ולא את האור. הן רק מסננות אותם. בתוך המבנה נשאר אוויר לח וחמים יותר, בדיוק מה שהבננה אוהבת.$mdl$, $mdl$אז למה כל המטעים האלה מכוסים? בסיפור הדרך של הקורס כתוב: הגנה מפני מזיקים, ובעיקר ציפורים. וזה נכון, אבל זה רק חלק מהתמונה.

תחשבו על עלה בננה. הוא ענק, רחב ודק. רוח חזקה קורעת אותו לרצועות, וצמח עם עלים קרועים מייצר פחות. ברד יכול לפצוע את הפרי. שמש קיצית חזקה עלולה לשרוף אותו. ובלילות קרים, הצמח הטרופי סובל.

הרשת פותרת הרבה מהבעיות האלה בבת אחת. היא שוברת את הרוח, עוצרת ציפורים וחרקים גדולים, ממתנת את הקרינה, ושומרת בתוך המבנה על אוויר לח וחמים יותר. אפשר לחשוב על זה כמעין חממה פתוחה: הגשם עובר דרכה, האור עובר דרכה, אבל המכות הקשות של מזג האוויר נבלמות.

והתוצאה מבחינת החקלאי: יבול גדול יותר, פירות נקיים יותר, ואפשרות לגדל בננות גם במקומות שבהם בשטח פתוח זה כמעט לא היה מצליח.

אז התשובה הנכונה היא הגנה מפגעי סביבה שונים. הרשתות לא מונעות גשם ולא פוטוסינתזה. להפך, הן עוזרות לצמח לעשות פוטוסינתזה בתנאים נוחים יותר. ובצד השני של הכביש, משמאל, מחכה לנו ענף חקלאי אחר לגמרי, שגדל במים.$mdl$, $mdl$מיד אחרי שאלת הבננות, כשהמטעים המכוסים עדיין נראים מימין.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"}]$mdl$::jsonb, $mdl$הרשת לא עוצרת את הגשם ולא את האור. היא שוברת רוח, עוצרת ציפורים וברד, וממתנת קרינה וקור.$mdl$, $mdl$visible$mdl$),
($mdl$q13-fishponds$mdl$, $mdl$mcq$mdl$, $mdl$מה מגדלים בבריכות הדגים באזור חוף הכרמל?$mdl$, $mdl$["דגים","עצי זית","גפנים","חיטה"]$mdl$::jsonb, 0, $mdl$בבריכות הדגים של חוף הכרמל, למשל ליד מעגן מיכאל, מגדלים דגים. האזור מתאים להן בזכות מי התהום הגבוהים.$mdl$, $mdl$חקלאות$mdl$, 1, null, 10, $mdl$משמאל — המלבנים של המים הם בריכות דגים. זו לא שאלה קשה, אבל הסיפור מאחוריה מעניין.

בבריכות האלה מגדלים דגים. האזור מתאים להן במיוחד: המישור נמוך, מי התהום גבוהים, ורכסי הכורכר חוסמים את הניקוז אל הים. מה שהיה פעם ביצות, הפך למשק דגים.$mdl$, $mdl$תסתכלו שמאלה. המלבנים המסודרים, מלאי המים, הם בריכות דגים. מעליהם, על רכס הכורכר, יושב קיבוץ מעגן מיכאל. בריכות הדגים היו ועדיין הן אחד ממקורות הפרנסה של האזור.

למה דווקא כאן? בואו נחבר את מה שכבר למדנו. מישור חוף הכרמל הוא נמוך. מי התהום בו קרובים לפני השטח. ובין המישור לים עומדים רכסי כורכר, שחוסמים את הנחלים ומקשים על המים להגיע לים. לפני מאה שנה, התוצאה של כל זה הייתה ביצות, כמו ביצות כבארה ליד נחל תנינים, שייבשו אותן בשנות העשרים.

כשהביצות יובשו, נשארה אדמה כבדה ורוויה במים. במקום להילחם במים, למדו לנצל אותם: חפרו בריכות ומילאו אותן. בבריכות כאלה בארץ מגדלים בדרך כלל דגים כמו קרפיון ואמנון.

ויש לבריכות האלה עוד תפקיד, לא מתוכנן: הן תחנת עצירה לציפורים. ישראל נמצאת על אחד מנתיבי הנדידה הגדולים בעולם, ובריכות דגים מושכות שקנאים, קורמורנים ואנפות. למגדלי הדגים זה כאב ראש. לחובבי הציפורים זה גן עדן.

אז מה ראינו בחמש הדקות האחרונות? מימין, הכרמל והבננות. משמאל, הכורכר ובריכות הדגים. עכשיו נבין איך נוצר הנוף הזה מלכתחילה.$mdl$, $mdl$כשבריכות הדגים נראות משמאל (לפי סיפור הדרך של הקורס), סמוך למעגן מיכאל שעל רכס הכורכר.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"},{"title":"רשות הטבע והגנים — עלון שמורת נחל תנינים","url":"https://static.parks.org.il/wp-content/uploads/2025/04/nachal-Taninim.pdf"}]$mdl$::jsonb, $mdl$בריכות הדגים מושכות ציפורים נודדות, כמו שקנאים וקורמורנים. זה כאב ראש למגדלים, וגן עדן לחובבי ציפורים.$mdl$, $mdl$visible$mdl$),
($mdl$q06-plain-narrows$mdl$, $mdl$mcq$mdl$, $mdl$מה קורה לרוחב מישור חוף הכרמל ככל שמתקדמים צפונה לעבר חיפה?$mdl$, $mdl$["הוא מתרחב","הוא נשאר זהה","הוא הולך ומצטמצם","הוא הופך למדבר"]$mdl$::jsonb, 2, $mdl$הכרמל מתקרב לים, ולכן המישור שביניהם הולך ונעשה צר, עד שבחיפה כמעט לא נשאר ממנו דבר.$mdl$, $mdl$גאוגרפיה$mdl$, 2, null, 11, $mdl$תסתכלו ימינה, ואחר כך שמאלה. המרחק בין הכרמל לים הולך ונעשה קצר יותר ככל שנוסעים צפונה.

בדרום יש כמה רכסי כורכר במקביל לחוף. צפונה מספרם קטן ל-2, אחר כך ל-1, ובסוף הם נעלמים. ובחיפה, ליד ראש הכרמל, ההר כמעט נוגע בים, ונשאר רק מעבר צר.$mdl$, $mdl$בואו נשחק משחק. תסתכלו ימינה אל הכרמל, ואחר כך שמאלה אל הים, ותנסו להעריך את המרחק ביניהם. ובעוד עשר דקות, תעשו את זה שוב.

מישור חוף הכרמל הוא רצועה צרה בהרבה ממישור החוף של השרון, שאותו עברנו לפני כן. וככל שנוסעים צפונה, הוא הולך ומצטמצם. הסיבה היא הכיוון של הכרמל: הוא לא מקביל לחוף, אלא נוטה באלכסון מדרום-מזרח לצפון-מערב. לכן כשאנחנו נוסעים צפונה בקו ישר, ההר מתקרב אלינו כל הזמן.

בסיור הכרמל של הקורס ראינו את זה גם ברכסי הכורכר. בדרום המישור יש כמה רכסים מקבילים לחוף. צפונה, הם מצטמצמים לשניים, אחר כך לאחד, ובסוף נעלמים. וכשמגיעים לראש הכרמל בחיפה, ההר כמעט נוגע בים, ונשאר רק מעבר צר לכביש ולמסילה.

למעבר הצר הזה הייתה חשיבות אסטרטגית לאורך כל ההיסטוריה. כל מי שרצה לעבור לאורך החוף, צבאות, שיירות ועולי רגל, נאלץ לעבור דרכו. לכן הוקמו כאן מבצרים, ולכן בנו הצלבנים מצודה אדירה בעתלית, שנגיע אליה בהמשך.

אז הנה הסיכום: ההר מתקרב, המישור מצטמצם, והכביש שלנו נלחץ ביניהם. ועכשיו נסתכל על החומר שממנו עשויים הרכסים הנמוכים שמשמאלנו.$mdl$, $mdl$בקטע פתוח שבו רואים גם את הכרמל מימין וגם את רצועת המישור. כדאי לחזור על הנושא בכניסה לחיפה, כשההר כמעט נוגע בים.$mdl$, $mdl$$mdl$, $mdl$[{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"},{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$בדרום מישור חוף הכרמל יש כמה רכסי כורכר מקבילים. צפונה הם מצטמצמים לשניים, אחר כך לאחד, ובסוף נעלמים.$mdl$, $mdl$visible$mdl$),
($mdl$q07-kurkar$mdl$, $mdl$mcq$mdl$, $mdl$מהו סלע כורכר?$mdl$, $mdl$["סלע געשי","אבן חול שהתלכדה בחומר גירי","סלע קרחוני","גרניט"]$mdl$::jsonb, 1, $mdl$כורכר הוא אבן חול גירית: גרגירי חול (בעיקר קוורץ) שהתלכדו בעזרת קלציט שהומס ושקע מחדש.$mdl$, $mdl$גאולוגיה$mdl$, 2, null, 12, $mdl$הרכסים הנמוכים שמשמאל, לאורך החוף, עשויים כורכר. כורכר הוא בעצם דיונה שהפכה לסלע.

הרוח ערמה חול לאורך החוף. מי גשמים המיסו את הגיר שבחול, שבא משברי צדפים, והוא שקע מחדש בין הגרגירים והדביק אותם יחד. התוצאה היא אבן חול גירית: שבירה, נקבובית, וקלה לחציבה.$mdl$, $mdl$הרכסים הנמוכים שמשמאלנו, אלה שעליהם יושבים מעגן מיכאל ויישובים אחרים, הם רכסי כורכר. ובסיור הגיאולוגיה שלנו, ליד מחלף עתלית, מוטי זיק נתן לנו להחזיק את הכורכר ביד. בואו נזכר מה ראינו.

אם מסתכלים מקרוב, רואים גרגירים נוצצים. אלה גרגירי קוורץ, החול עצמו. בין הגרגירים יש שברים קטנים של צדפים, שעשויים קלציט. ויש גם קצת מינרלים כהים.

איך זה הופך לסלע? בשלבים. גלי הים מביאים חול אל החוף. החול מתייבש, והרוח מקפיצה אותו הלאה, עד שנוצרת ערימה ארוכה, מקבילה לחוף: דיונה. בחורף, מי הגשם חודרים לדיונה ומיסים מעט מהקלציט של שברי הצדפים. המים מחלחלים מטה, ובקיץ, כשהם מתאדים, הקלציט שוקע מחדש ומדביק את הגרגירים זה לזה, כמו מלט. שנה אחרי שנה, הדיונה מתקשה והופכת לרכס.

ויש עוד פרט מפתיע. בים, מול החוף, יש איים קטנים של כורכר. איך דיונה נוצרה בתוך הים? בתקופת הקרח האחרונה, לפני כעשרים אלף שנה, פני הים היו נמוכים בכמאה ועשרים מטרים, וקו החוף היה רחוק יותר מערבה. הדיונות נוצרו אז על יבשה, והים כיסה אותן אחר כך.

והאדם? כורכר הוא סלע רך וקל לחציבה. מחצבות כורכר, כמו זו שבשמורת דור-הבונים, סיפקו אבן בנייה לאורך הדורות. אז מה מחזיק את כל הסלע הזה יחד? זה בדיוק נושא השאלה הבאה.$mdl$, $mdl$כשרכס כורכר נראה בבירור, למשל מעגן מיכאל שיושב על רכס כורכר משמאל, או קטע שבו הכביש חוצה את הרכס (בסיור הגיאולוגיה עצרנו ליד מחלף עתלית). לאמת בנסיעת הכנה איפה רואים את הסלע עצמו.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"},{"title":"טיולי — שמורת טבע חוף דור-הבונים","url":"https://www.tiuli.com/tracks/28"}]$mdl$::jsonb, $mdl$לפני כעשרים אלף שנה פני הים היו נמוכים בכ-120 מטר, וקו החוף היה רחוק יותר מערבה. איי הכורכר שבים הם דיונות מאותה תקופה.$mdl$, $mdl$check$mdl$),
($mdl$q08-calcite$mdl$, $mdl$mcq$mdl$, $mdl$איזה מינרל משמש כחומר מלכד נפוץ בסלע הכורכר?$mdl$, $mdl$["מלח בישול","ברזל","קלציט","גופרית"]$mdl$::jsonb, 2, $mdl$הקלציט (פחמת סידן), שמקורו בשברי צדפים, מומס במי הגשם ושוקע מחדש בין גרגירי החול, ומדביק אותם יחד.$mdl$, $mdl$גאולוגיה$mdl$, 2, null, 13, $mdl$הדבק של הכורכר הוא קלציט, פחמת סידן. זה אותו מינרל שממנו עשויים הצדפים.

מי הגשם, שהם חומציים מעט, ממיסים את הקלציט בדיונה. בקיץ המים מתאדים, והקלציט שוקע מחדש בין גרגירי החול, כמו מלט שמחזיק לבנים. בלי קלציט, הכורכר היה נשאר ערימת חול.$mdl$, $mdl$אז מה מחזיק את הכורכר? התשובה היא קלציט, פחמת סידן. וזה מעגל יפה של הטבע: הדבק של הסלע בא מבעלי חיים.

הצדפים והחלזונות בים בונים את השלד שלהם מפחמת סידן. כשהם מתים, הגלים שוברים את השלדים לפירורים, ומערבבים אותם עם החול שמגיע לחוף. בדיונה יש אז תערובת: הרבה גרגירי קוורץ, וביניהם פירורי צדפים.

מי הגשם הם חומציים מעט, כי הם סופגים פחמן דו-חמצני מהאוויר. כשהם מחלחלים לתוך הדיונה, הם ממיסים חלק מהקלציט. המים ממשיכים לרדת, וכשהם מתאדים או משנים את הרכב שלהם, הקלציט שוקע מחדש, הפעם כציפוי דק סביב הגרגירים ובנקודות המגע ביניהם. וכך הגרגירים נדבקים.

זה בדיוק כמו בנייה: הקוורץ הוא הלבנים, הקלציט הוא המלט. ומכיוון שהמלט הזה לא ממלא את כל החללים, הכורכר נשאר נקבובי: מים ואוויר עוברים דרכו. זו גם הסיבה שהים ומי הגשם שוחקים אותו בקלות, ויוצרים בו מערות, מפרצונים ונישות, כמו אלה שנראה בשמורת דור-הבונים.

ואיך גיאולוג בודק בשטח שיש בסלע קלציט? יש לזה מבחן פשוט מאוד, עם כמה טיפות. זו השאלה הבאה.$mdl$, $mdl$מיד אחרי שאלת הכורכר, באותו קטע של רכסי הכורכר משמאל.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$הדבק של הכורכר בא מבעלי חיים: הקלציט מגיע משלדי צדפים וחלזונות ימיים שנשחקו לחול.$mdl$, $mdl$topic$mdl$),
($mdl$q16-hcl-test$mdl$, $mdl$mcq$mdl$, $mdl$איזו בדיקה מסייעת לזהות סלע המכיל קלציט?$mdl$, $mdl$["מגנט","בדיקת ריח","תגובה לחומצה מלחית","בדיקת חשמל"]$mdl$::jsonb, 2, $mdl$טיפת חומצה מלחית מדוללת על קלציט גורמת לתסיסה, כי משתחררות בועות של פחמן דו-חמצני.$mdl$, $mdl$גאולוגיה$mdl$, 2, null, 14, $mdl$הבדיקה הקלאסית של גיאולוג בשטח: טיפה של חומצה מלחית מדוללת. אם הסלע מכיל קלציט, הוא "תוסס" ומשחרר בועות קטנות של פחמן דו-חמצני.

עשינו את זה בסיור הגיאולוגיה בכרמל: הקרקע תססה, וזה הוכיח שיש בה פחמת סידן. גיר תוסס חזק. דולומיט, כמעט שלא, אלא אם שוחקים אותו קודם לאבקה.$mdl$, $mdl$בסיור הגיאולוגיה בכרמל, מוטי זיק הוציא בקבוקון קטן וטפטף על הקרקע. וכמה מכם אולי זוכרים את הרגע: הקרקע תססה. כתבנו במחברת "תוסס". אז מה בעצם קרה שם?

בקבוקון כזה מכיל חומצה מלחית מדוללת, זו הבדיקה הקלאסית של גיאולוג בשטח. כשהחומצה פוגשת פחמת סידן, כלומר קלציט, מתרחשת תגובה כימית: הקלציט מתפרק, ומשתחרר פחמן דו-חמצני. הגז יוצא בבועות קטנות, שנראות ונשמעות כמו תסיסה. זה כמו לפתוח בקבוק סודה, רק בגודל של טיפה.

ומה אפשר ללמוד מזה? גיר, שהוא כמעט קלציט טהור, תוסס חזק. קירטון, שבנוי משלדים מיקרוסקופיים של יצורים ימיים, גם הוא תוסס. וכורכר תוסס בגלל הקלציט שמדביק את הגרגירים. לעומת זאת, דולומיט, פחמת סידן ומגנזיום, כמעט לא מגיב בטיפה על הסלע השלם, אלא רק אם מגרדים אותו קודם לאבקה. וזו בדיוק הדרך להבחין בשטח בין גיר לדולומיט, שני הסלעים העיקריים של הכרמל.

אז מגנט? זה לברזל. ריח וחשמל לא עוזרים כאן. אם רוצים לדעת אם יש קלציט — שמים טיפה ומקשיבים.

ובואו נשאר רגע בגיאולוגיה. בין רכסי הכורכר שמשמאלנו יש שקעים מוארכים, ולהם יש שם מיוחד.$mdl$, $mdl$בהמשך לשאלות הכורכר והקלציט. אפשר גם לשמור אותה לרגע שהכרמל הגירי מתקרב מימין.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$גיר תוסס חזק בחומצה. דולומיט כמעט לא מגיב, אלא אם מגרדים אותו קודם לאבקה. כך מבחינים בשטח בין שני הסלעים העיקריים של הכרמל.$mdl$, $mdl$topic$mdl$),
($mdl$q09-marzeva$mdl$, $mdl$mcq$mdl$, $mdl$מהי מרזבה במישור החוף?$mdl$, $mdl$["אזור נמוך ומוארך בין רכסים","פסגת הר","לוע הר געש","מצודה עתיקה"]$mdl$::jsonb, 0, $mdl$מרזבה היא שקע מוארך בין רכסי כורכר. מים מצטברים בה, ובעבר נוצרו בה ביצות.$mdl$, $mdl$גאולוגיה$mdl$, 2, null, 15, $mdl$מרזבה היא השקע הארוך שבין שני רכסי כורכר. השם בא מ"מרזב": זה הערוץ שבו המים מתנקזים.

והבעיה: רכסי הכורכר חוסמים את הדרך לים. לכן המים נתקעו במרזבות, ונוצרו ביצות וקדחת. רק אחרי ניקוז, ולפעמים חציבה של פרצה ברכס, השקעים האלה הפכו לשדות ולבריכות דגים.$mdl$, $mdl$השם "מרזבה" נשמע מסובך, אבל הוא בעצם מאוד פשוט. תחשבו על מרזב בגג: ערוץ ארוך ונמוך שבו המים זורמים. מרזבה במישור החוף היא אותו דבר בגדול: שקע מוארך בין שני רכסי כורכר, מקביל לחוף.

ובסיור השרון כבר נסענו בתוך מרזבה כזאת: רכס כורכר מימין, רכס מערבי משמאל, ואנחנו באמצע. כאן, בחוף הכרמל, הנוף דומה, רק צר יותר.

מה קורה במרזבה בחורף? הנחלים יורדים מהכרמל אל הים, ונתקלים ברכס הכורכר. הרכס עוצר אותם, והמים מתפשטים בשקע. יחד עם מי תהום גבוהים, התוצאה היא ביצות. מאות שנים היו כאן ביצות וקדחת, ולכן יושבים העדיפו לגור על הרכסים.

והאדם התחיל לפתור את הבעיה כבר בעת העתיקה. בסיור הכרמל דיברנו על חציבת מעברים ברכס הכורכר כדי לנקז מים, ועל הוויכוח לגבי התאריך שלהם. וליד נחל תנינים ראינו פתרון הפוך: הרומאים חסמו בכוונה את הפרצה בסכר, כדי לאגור מים לקיסריה.

בעת החדשה, הניקוז של המאה העשרים הפך את המרזבות לאדמה חקלאית. במקום ביצה יש שדות, מטעים ובריכות דגים.

אז הנה מילת המפתח לבחינה: מרזבה, שקע מוארך בין רכסים. ומאיפה בכלל הגיע כל החול שממנו נוצרו הרכסים? זו שאלה עם תשובה מפתיעה, מאפריקה.$mdl$, $mdl$בקטע שבו הכביש עובר בין רכסי כורכר. אפשר לחבר לבריכות הדגים ולשדות שבשקעים. לאמת בנסיעת הכנה איפה רואים את השקע בבירור.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"},{"title":"רשות הטבע והגנים — עלון שמורת נחל תנינים","url":"https://static.parks.org.il/wp-content/uploads/2025/04/nachal-Taninim.pdf"}]$mdl$::jsonb, $mdl$בסיור השרון נסענו בתוך מרזבה: רכס כורכר מזרחי מימין, רכס מערבי משמאל, והכביש בשקע שביניהם.$mdl$, $mdl$check$mdl$),
($mdl$q10-nile-sand$mdl$, $mdl$mcq$mdl$, $mdl$מהו אחד המקורות ההיסטוריים המרכזיים לחולות חופי ישראל?$mdl$, $mdl$["נהר הנילוס","נהר הדנובה","נהר האמזונס","נהר הירדן"]$mdl$::jsonb, 0, $mdl$החול של חופי ישראל מגיע ברובו מהנילוס: הנהר הביא סחף לים, וזרם ימי לאורך החוף הסיע אותו צפונה.$mdl$, $mdl$גאולוגיה$mdl$, 2, null, 16, $mdl$החול שעל החוף משמאל עשה דרך ארוכה: הוא בא מהנילוס.

במשך עשרות אלפי שנים, הנילוס נשא סחף מאפריקה אל הים, וזרם לאורך החוף הסיע אותו צפונה, לאורך חופי סיני וישראל. ככל שמתרחקים צפונה מהדלתא, כמות החול הולכת וקטנה. וכשסכר אסואן תפס חלק גדול מהסחף, החופים התחילו לקבל פחות חול.$mdl$, $mdl$תסתכלו על החוף משמאל. כל גרגר חול שם, ועל כל רכס כורכר שדיברנו עליו, עבר מסע של אלפי קילומטרים.

רוב חול החוף בישראל הוא גרגירי קוורץ, ומקורם בהרים של אפריקה. הנילוס שחק אותם, נשא אותם צפונה לאורך כל מצרים, ושפך אותם לים בדלתא. משם, זרם ימי לאורך החוף הסיע אותם מזרחה וצפונה: לאורך חופי סיני, עזה, ישראל, ועד מפרץ חיפה.

זה מסביר כמה דברים שאנחנו רואים בנוף. בדרום הארץ החופים רחבים והדיונות גדולות. ככל שמתקדמים צפונה, ומתרחקים מהדלתא, כמות החול הולכת וקטנה. החוף נעשה צר יותר, ויותר סלעי כורכר נחשפים בו, כמו בדור ובהבונים.

ואז האדם התערב. בשנות השישים והשבעים של המאה העשרים נבנה סכר אסואן הגבוה, וחלק גדול מהסחף נעצר מאחוריו, בתוך האגם. התוצאה מורגשת עד אלינו: החופים מקבלים פחות חול חדש, ובמקומות רבים הים "אוכל" את החוף, ומצוקי הכורכר מתמוטטים.

זה אחד הדברים הכי יפים בגיאוגרפיה: הסלע מתחת לבתים של מעגן מיכאל התחיל את דרכו בנהר באפריקה. ועם המסע הזה בראש, נעבור מהגאולוגיה להיסטוריה, אל עיר נמל עתיקה שנמצאת ממש משמאלנו.$mdl$, $mdl$בכל רגע שהים נראה משמאל. מתאים כסיכום של רצף שאלות הכורכר.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$סכר אסואן הגבוה עוצר חלק גדול מסחף הנילוס, ולכן חופי ישראל מקבלים היום פחות חול חדש, וצפונה מתרבה הסחיפה.$mdl$, $mdl$topic$mdl$),
($mdl$q17-dor-port$mdl$, $mdl$mcq$mdl$, $mdl$במה הייתה ידועה העיר דור בעת העתיקה?$mdl$, $mdl$["עיר נמל","בירת ממלכת יהודה","עיר מדברית","מרכז לכריית נחושת"]$mdl$::jsonb, 0, $mdl$דור הייתה עיר נמל חשובה על חוף הכרמל, מתקופת הברונזה ועד התקופה הרומית.$mdl$, $mdl$היסטוריה$mdl$, 1, null, 17, $mdl$קרוב אלינו, משמאל, על החוף, נמצאת דור, אחת מערי הנמל החשובות של העולם העתיק.

מפרצונים טבעיים בכורכר נתנו לספינות מחסה. כאן ישבו "אנשי הים", אחריהם הפיניקים, ואחר כך היוונים והרומאים. ובים, מול החוף של דור, נמצאו יותר מעשרים ספינות טרופות. החוף הזה מלא ממצאים, גם מתחת למים.$mdl$, $mdl$משמאלנו, על החוף, קצת אחרי נחשולים, יושב תל דור. היום זה גבעה שקטה מול הים, אבל במשך יותר מאלף שנים זה היה אחד הנמלים החשובים בחוף הזה.

למה דווקא כאן? רוב חוף ישראל ישר וחולי, בלי מקום טוב לעגון. בדור, רכסי הכורכר והמפרצונים יוצרים מעגן מוגן. ועיר נמל מושכת אליה את כולם.

בסוף תקופת הברונזה התיישבו כאן התֶּכֶּר, אחד מ"עמי הים". במסע של ון-אמון, פקיד מצרי שהפליג ללבנון לקנות עצי ארזים, מסופר שבדור קיבל אותו נסיך מקומי בשם בֶּדֶר. אחר כך באו הפיניקים, שהיו עם של יורדי ים. בתקופת שלמה המלך, דור מופיעה כאחד ממחוזות המלוכה.

ומשם, כל אימפריה רצתה את דור. בתקופה הפרסית היא נמסרה לצידון. בסביבות 460 לפני הספירה אתונה תפסה אותה, והיא הייתה המוצב הרחוק ביותר של הצי האתונאי. בתקופה ההלניסטית היא עמדה במצור של אנטיוכוס השלישי ב-219 לפני הספירה, ואחר כך כבש אותה אלכסנדר ינאי לממלכה החשמונאית. ב-63 לפני הספירה פומפיוס צירף אותה לפרובינקיה סוריה, ובתקופה הרומית נבנו בה מקדשים ותיאטרון.

אז מה קרה לה? בעיקר קיסריה. כשהורדוס בנה נמל ענק כמה קילומטרים דרומה, דור הלכה ודעכה. בסוף המאה הרביעית לספירה תיאר אותה הירונימוס כעיר נטושה.

החפירות הגדולות כאן נמשכו עשרים עונות, מ-1980 עד 2000. ובשאלה הבאה נדבר על מה שאפשר לראות שם היום.$mdl$, $mdl$כשעוברים בגובה נחשולים ודור (משמאל, בין הכביש לים). התל עצמו לא אומת כנראה מכביש 2 — לציין "קרוב אלינו, משמאל, על החוף".$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Tel Dor","url":"https://en.wikipedia.org/wiki/Tel_Dor"},{"title":"טיולי — גן לאומי תל דור","url":"https://www.tiuli.com/points-of-interest/707"}]$mdl$::jsonb, $mdl$בסביבות 460 לפני הספירה אתונה כבשה את דור מידי צידון, ודור הפכה למוצב הרחוק ביותר של הצי האתונאי.$mdl$, $mdl$nearby$mdl$),
($mdl$q31-tel-dor-np$mdl$, $mdl$mcq$mdl$, $mdl$איזה גן לאומי באזור דור מציג שרידים של עיר נמל קדומה?$mdl$, $mdl$["תל דור","תל ערד","תל באר שבע","תל דן"]$mdl$::jsonb, 0, $mdl$גן לאומי תל דור, ליד נחשולים, מציג שרידים של עיר הנמל: מקדשים רומיים, תיאטרון ונקודות תצפית לים.$mdl$, $mdl$אתרי ביקור$mdl$, 1, null, 18, $mdl$את דור אפשר לבקר היום בגן לאומי תל דור, ליד קיבוץ נחשולים, והכניסה חינם.

יש שם יסודות של מקדשים רומיים גדולים מהמאה השנייה לספירה, ותיאטרון רומי בקוטר של כשישים מטר. שביל הרכס נגיש לכיסאות גלגלים לאורך כ-850 מטר, וממנו רואים את המפרצים שבהם עגנו פעם הספינות.$mdl$, $mdl$אז איך מבקרים היום בעיר הנמל העתיקה? בגן לאומי תל דור, ממש ליד קיבוץ נחשולים.

מגיעים מכביש 4, פונים מערבה לכיוון נחשולים, ממשיכים צפונה בדרך עפר לפי השילוט, ומגיעים למרכז מבקרים קטן עם רחבה מוצלת ושירותים. משם יוצאים שני שבילים.

הראשון הוא שביל הרכס. הוא נגיש לכיסאות גלגלים ולעגלות לאורך כ-850 מטר, עם נקודות תצפית ושילוט. הוא עובר ליד היסודות של מקדשים גדולים מהמאה השנייה לספירה, ולידם תיאטרון רומי בקוטר של כשישים מטר. השני הוא שביל החוף, מאתגר יותר, שיורד אל המפרצונים. חשוב לדעת: החוף שם אינו חוף רחצה מוכרז, והרחצה בו אסורה.

ומה מיוחד במקום? אתם עומדים על תל שהצטבר במשך אלפי שנים: שכבה כנענית, שכבה של עמי הים, שכבה פיניקית, יוונית ורומית. ומתחת לים, מול החוף, נמצאו יותר מעשרים ספינות טרופות. דור היא אחד האתרים החשובים בארץ גם לארכיאולוגיה ימית.

ואם יש זמן, כחצי קילומטר דרומה, בנחשולים, נמצא מוזיאון בבית החרושת לזכוכית ההיסטורי, שם מוצגים ממצאים מתל דור.

וטיפ למורה דרך: בתל דור, הקבוצה צריכה לדמיין את הנמל. אין שם רציפים גדולים כמו בקיסריה. אז תעמידו אותם מול המפרצון, ותספרו להם על ון-אמון ועל עמי הים.$mdl$, $mdl$מיד אחרי שאלת "דור עיר נמל", בגובה נחשולים ודור. אתר בסביבה, לא נראה מהכביש.$mdl$, $mdl$גן לאומי תל דור — כניסה ללא תשלום (לפי טיולי).
שעות (לפי טיולי): קיץ — א׳–ה׳ ושבת 8:00–17:00, שישי וערבי חג 8:00–16:00. חורף — א׳–ה׳ ושבת 8:00–16:00, שישי וערבי חג 8:00–15:00. ערבי ראש השנה, יום כיפור ופסח: 8:00–13:00. כניסה אחרונה שעה לפני הסגירה.
בימים א׳–ו׳ נדרשת הרשמה מראש; בשבתות ובחגים לפי סדר הגעה.
מרכז מבקרים עם רחבה מוצלת ושירותים; חניון קטן (כ-5 מקומות) — לאוטובוס יש לבדוק מראש.
שביל הרכס נגיש לאורך 850 מ׳. החוף אינו מוכרז, והרחצה בו אסורה.
גישה: מכביש 4 מערבה לכיוון נחשולים, ואחרי הכניסה לקיבוץ צפונה בדרך עפר לפי השילוט.$mdl$, $mdl$[{"title":"טיולי — גן לאומי תל דור","url":"https://www.tiuli.com/points-of-interest/707"},{"title":"Wikipedia — Tel Dor","url":"https://en.wikipedia.org/wiki/Tel_Dor"}]$mdl$::jsonb, $mdl$מול חוף דור נמצאו יותר מעשרים ספינות טרופות, ולכן דור היא אחד האתרים החשובים בארץ לארכיאולוגיה ימית.$mdl$, $mdl$nearby$mdl$),
($mdl$q18-dor-habonim-coast$mdl$, $mdl$mcq$mdl$, $mdl$מה מאפיין את חוף דור-הבונים?$mdl$, $mdl$["פיורדים קרחוניים","מפרצונים סלעיים ורכסי כורכר","דיונות שלג","הרי געש פעילים"]$mdl$::jsonb, 1, $mdl$לאורך חוף דור-הבונים, הגלים שחקו את רכס הכורכר ויצרו מפרצונים, מערות קטנות, נישות ואיים.$mdl$, $mdl$גאולוגיה$mdl$, 1, null, 19, $mdl$חוף דור-הבונים הוא אחד החופים היפים בארץ, וכולו כורכר. הגלים שוחקים את רכס הכורכר הרך, ויוצרים בו מפרצונים קטנים, מערות, נישות ואיים קטנים.

וליד החוף, משמאל, עומד גם מבצר הבונים. הוא נבנה בתקופה המוסלמית הקדומה, במאות השמינית-התשיעית, כדי לשמור על החוף מפני פשיטות של הצי הביזנטי.$mdl$, $mdl$כל מה שלמדנו על כורכר מתחבר עכשיו לנוף אחד. בין דור להבונים, הים פוגש את רכס הכורכר המערבי ממש בקו החוף. והים הוא פסל סבלני מאוד.

הכורכר סלע רך ונקבובי, והדבק הגירי שלו מתמוסס לאט. הגלים פוגעים בנקודות החלשות, חופרים בהן, ויוצרים מפרצונים קטנים, מערות, נישות וגומות. במקומות מסוימים הים כבר הפריד חלקים מהרכס, ונשארו איים קטנים קרוב לחוף. בשמורה יש מפרצון שהחוף שלו מכוסה כולו צדפים, ומערה שנקראת "המערה הכחולה".

וזה גם חוף שמספר על האדם: יש בו שרידים של מחצבת כורכר עתיקה, ומול החוף שוכבת על צדה ספינת משא טבועה.

ועכשיו להיסטוריה. בסיפור הדרך של הקורס מופיע כאן, משמאל, מבצר הבונים, שנקרא גם קפרלט. הוא נבנה בתקופה המוסלמית הקדומה, במאות השמינית והתשיעית לספירה, כחלק משרשרת של מבצרי חוף. התפקיד שלו היה לשמור מפני פשיטות של הצי הביזנטי, שעדיין שלט בים. כלומר, עוד לפני הצלבנים, החוף הזה כבר היה קו גבול מבוצר.

אז אם תשאלו מה מאפיין את החוף הזה, התשובה כפולה: בטבע, כורכר שהים פיסל. ובהיסטוריה, חוף שתמיד היה צריך להגן עליו. ובשאלה הבאה נראה איך הופכים את החוף הזה לשמורה, ומה צריך לדעת כדי לבקר בה.$mdl$, $mdl$בגובה הבונים, כשהים והחוף נראים משמאל. סיפור הדרך מציין משמאל את מבצר הבונים (קפרלט). לאמת בנסיעת הכנה מה רואים מהחלון.$mdl$, $mdl$$mdl$, $mdl$[{"title":"טיולי — שמורת טבע חוף דור-הבונים","url":"https://www.tiuli.com/tracks/28"},{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$מבצר הבונים נבנה כ-300 שנה לפני הצלבנים, כדי לשמור על החוף מפני הצי הביזנטי.$mdl$, $mdl$check$mdl$),
($mdl$q34-dor-habonim-reserve$mdl$, $mdl$mcq$mdl$, $mdl$איזו שמורת טבע באזור הבונים מפורסמת במפרצונים וברכסי כורכר?$mdl$, $mdl$["חוף דור-הבונים","חוף ים המלח","חוף הכנרת","חוף אילת"]$mdl$::jsonb, 0, $mdl$שמורת טבע חוף דור-הבונים מגינה על קטע חוף של כורכר מפוסל, עם מפרצונים, מערות ואיים קטנים.$mdl$, $mdl$שמורות טבע$mdl$, 1, null, 20, $mdl$השמורה היא חוף דור-הבונים. יש בה שביל של כשלושה קילומטרים לאורך רכס הכורכר, מחוף הבונים עד חוף דור.

בדרך עוברים מפרצון מכוסה צדפים, את "המערה הכחולה", משטח של סלע צדפים, אי קטן וספינת משא שטבעה. וזה מסלול קל, מתאים למשפחות, ויפה במיוחד בשקיעה.$mdl$, $mdl$אז אחרי שהבנו איך הים פיסל את הכורכר, בואו נדבר על השמורה עצמה: שמורת טבע חוף דור-הבונים.

המסלול המוכר עובר לאורך רכס הכורכר, בין חוף הבונים בצפון לחוף דור בדרום, באורך של כשלושה קילומטרים, ברמת קושי קלה. כמאתיים מטרים מהחניון מגיעים למפרצון שהחוף שלו כולו צדפים. עוד כמאתיים מטרים, פונים ימינה למפרץ קטן שנקרא "המערה הכחולה". ומשם ממשיכים למשטח של סלע עתיק עשוי צדפים וחול. בהמשך רואים אי קטן, וספינת משא טבועה ששוכבת על צדה בים.

מה חי כאן? סרטנים, צבי ים, דגים, רכיכות, עופות ים ושועלים. וגם צמחיית חוף, כולל פרחים שפורחים בלילה בקיץ, ביולי ובאוגוסט.

למה זו שמורה? כי חוף כורכר מפוסל, עם מפרצונים, מערות ואיים, הוא נוף נדיר, שנפגע בקלות מבנייה, מתנועה של רכבים ומטיילים. כשמכריזים עליו כשמורה, אפשר לשמור עליו ולנהל את הביקורים.

ולסיום משהו מעשי. אם הקבוצה לא נכנסת לשמורה, זה עדיין מקום מצוין להמליץ עליו לחזור אליו בשקיעה. ומכאן נעבור מהים אל ההר: הכרמל מתקרב אלינו מימין, ושם הסלעים שונים לגמרי.$mdl$, $mdl$מיד אחרי השאלה על מאפייני החוף, בגובה הבונים. השמורה עצמה בין המושב לים, לא נראית בבירור מכביש 2.$mdl$, $mdl$שמורת טבע חוף דור-הבונים (לפי טיולי) — טלפון 04-8252266.
מסלול של כ-3 ק"מ, קל, חד-כיווני (או הלוך ושוב).
כניסה לחניון שמורת חוף הבונים: 36 ₪ לרכב פרטי (לבדוק תעריף לאוטובוס). החניה בחוף דור ללא תשלום.
גישה: מכביש החוף למחלף עתלית או לצומת פוריידיס, ומשם לכביש 4; לפי השילוט למושב הבונים, ומקיפים אותו מצפון אל החוף. בוויז: "שמורת טבע חוף דור הבונים".
מוזיאון "המזגגה" (נחשולים): א׳–ה׳ 9:00–14:00, שישי 9:00–13:00, שבת לקבוצות בתיאום מראש — טלפון 04-6390950.
שעות פתיחה ושירותים בשמורה לא פורטו במקור — לוודא ברשות הטבע והגנים.$mdl$, $mdl$[{"title":"טיולי — שמורת טבע חוף דור-הבונים","url":"https://www.tiuli.com/tracks/28"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"}]$mdl$::jsonb, $mdl$ליד חניון חוף דור יש מוזיאון בבית חרושת לבקבוקים שהקים הברון רוטשילד ב-1891, ובו מוצגים ממצאים שהוצאו מהים.$mdl$, $mdl$nearby$mdl$),
($mdl$q14-carmel-rocks$mdl$, $mdl$mcq$mdl$, $mdl$אילו סלעים נפוצים ברכס הכרמל?$mdl$, $mdl$["גרניט בלבד","גיר ודולומיט","מלח וקרח","פחם"]$mdl$::jsonb, 1, $mdl$רוב הכרמל בנוי מסלעי גיר ודולומיט קשים שיוצרים מצוקים, ובחלקים ממנו יש גם קירטון, חוואר וכתמים של סלעים געשיים.$mdl$, $mdl$גאולוגיה$mdl$, 1, null, 21, $mdl$תסתכלו על המצוקים מימין. הכרמל בנוי בעיקר מגיר ודולומיט, סלעי משקע קשים שנוצרו בים קדום.

הם קשים, ולכן יוצרים מדרונות תלולים ומצוקים. אבל יש בכרמל גם קירטון רך, וחוואר, ואפילו כתמים של סלעים געשיים, עקבות של התפרצויות עתיקות. לכן זה הר מגוון מאוד, מבחינה גיאולוגית וגם מבחינת הצמחייה.$mdl$, $mdl$עכשיו בואו נסתכל ימינה, על ההר עצמו. ממה הוא בנוי?

התשובה הבסיסית: גיר ודולומיט. שניהם סלעי משקע שנוצרו בקרקעית ים חמים ורדודים, לפני עשרות מיליוני שנים. הגיר נבנה בעיקר משלדים של יצורים ימיים, כמו חלזונות וצדפות. הדולומיט דומה, אבל בחלק מהסידן שלו התחלף מגנזיום. והתוצאה היא סלעים קשים, שיוצרים מצוקים ומדרונות תלולים, כמו אלה שאתם רואים עכשיו.

אבל בסיור הגיאולוגיה גילינו שהכרמל הוא לא רק גיר ודולומיט. בחורבת רקית, בגובה של כשלוש מאות ושבעים מטר, מצאנו קירטון, סלע רך שבנוי משלדים מיקרוסקופיים. והוא לא מחלחל מים, ולכן חצבו בו בורות מים. ומתחת יש חוואר, תערובת של קירטון וחרסית, שעליו גדלים עצי קטלב בעלי הגזע האדום.

ויש גם הפתעה: כתמים של סלעים געשיים, עקבות של התפרצויות עתיקות. הכרמל נוצר כגוש שהורם לאורך שברים, והצד המזרחי שלו, שפונה לעמק יזרעאל, שבור ותלול.

ולמה זה חשוב למורה דרך? כי כל סוג סלע מוביל לסיפור אחר. גיר סדוק מחלחל מים, ולכן אין בכרמל הרבה מעיינות. קירטון שומר מים, ולכן עליו בנו כפרים ובורות. ואם תשאלו מה מבדיל גיר מדולומיט בשטח, זוכרים? טיפה של חומצה.$mdl$, $mdl$כשמצוקי הכרמל נראים מימין, לאורך הקטע שבין הבונים לעתלית. חוזרים לנושא כשעולים לכביש נחל אורן.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"}]$mdl$::jsonb, $mdl$בחורבת רקית שבכרמל חצבו בורות מים דווקא בקירטון, כי הסלע הרך והצפוף הזה אינו מחלחל מים.$mdl$, $mdl$visible$mdl$),
($mdl$q15-north-slope$mdl$, $mdl$mcq$mdl$, $mdl$באיזה מפנה בכרמל נמצאת בדרך כלל צמחייה צפופה יותר, בתנאים דומים?$mdl$, $mdl$["דרומי","צפוני","אין הבדל","רק מערבי"]$mdl$::jsonb, 1, $mdl$המפנה הצפוני מקבל פחות קרינת שמש, ולכן הוא לח יותר והצמחייה בו צפופה וגבוהה יותר מבמפנה הדרומי.$mdl$, $mdl$טבע$mdl$, 2, null, 22, $mdl$בכרמל, וגם בכל הארץ, המפנה הצפוני ירוק וצפוף יותר. זה המדרון שפונה צפונה.

הסיבה היא השמש. אנחנו בחצי הכדור הצפוני, ולכן השמש מאירה בעיקר מדרום. המפנה הדרומי חשוף לקרינה חזקה, הוא מתייבש מהר, והצמחייה בו דלילה. המפנה הצפוני מוצל יותר, הקרקע שומרת על לחות, ולכן החורש בו צפוף וגבוה.$mdl$, $mdl$זה אחד הדברים שמורה דרך יכול להראות בכל נחל בארץ, ואחרי שרואים את זה פעם אחת, רואים את זה בכל מקום.

כשנחל חוצה הר ממזרח למערב, כמו נחל אורן, יש לו שתי גדות: אחת פונה צפונה ואחת פונה דרומה. ומי שמסתכל טוב רואה שהן שונות לגמרי. בסיור הכרמל, בכביש נחל אורן, הראו לנו בדיוק את זה: מימין מפנה צפוני ירוק וצפוף, ומשמאל מפנה דרומי דליל יותר.

למה? אנחנו בחצי הכדור הצפוני, ולכן השמש עוברת בשמים בעיקר בצד הדרומי. מדרון שפונה דרומה מקבל אותה ישר, כל היום. הוא מתחמם, המים מתאדים ממנו מהר, והצמחים שגדלים עליו צריכים להתמודד עם יובש. מדרון שפונה צפונה מקבל את השמש בזווית חדה. הוא קריר יותר, הקרקע לחה יותר, והחורש הים תיכוני, אלון מצוי, אלה ובר, צפוף וגבוה יותר.

וההבדל הזה לא רק יפה, יש לו השלכות. במדרון היבש האש מתפשטת מהר יותר. החקלאים והבנאים בחרו בכל דור את הצד המתאים להם. ואפילו בעלי החיים מעדיפים צד אחד על פני השני, לפי העונה.

וטריק קטן להוראה: אל תגידו "צפוני" ו"דרומי" בלי להסביר. מפנה צפוני זה לא המדרון שבצפון, אלא המדרון שפונה צפונה. ותבקשו מהקבוצה לנחש איזה צד ירוק יותר לפני שאתם עונים. כך זה נשאר להם בראש.$mdl$, $mdl$בדרך כלל מסבירים את זה בכביש נחל אורן (721): לפי סיפור הדרך, מפנה צפוני מימין ומפנה דרומי משמאל. מכביש 2 — כשרואים ערוץ שיורד מהכרמל. לאמת בנסיעת הכנה.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"קורס יובל — סיור גיאולוגיה כרמל וחוף, מוטי זיק (2.7.26)","url":"https://drive.google.com/file/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"}]$mdl$::jsonb, $mdl$המפנה הצפוני הוא לא "המדרון שבצפון", אלא המדרון שפונה צפונה. בחצי הכדור הצפוני הוא מוצל ולח יותר.$mdl$, $mdl$check$mdl$),
($mdl$q19-nahal-mearot$mdl$, $mdl$mcq$mdl$, $mdl$איזו שמורת טבע באזור הכרמל מפורסמת במערות האדם הקדמון?$mdl$, $mdl$["נחל עמוד","נחל מערות","נחל פרת","נחל דוד"]$mdl$::jsonb, 1, $mdl$במערות נחל מערות, במורד המערבי של הכרמל, יש עדויות להתפתחות האדם לאורך כחצי מיליון שנה. ב-2012 הן הוכרזו כאתר מורשת עולמית של אונסק"ו.$mdl$, $mdl$ארכאולוגיה$mdl$, 1, null, 23, $mdl$במצוק הכרמל מימין, לא רחוק מאיתנו, נמצאת שמורת נחל מערות. יש בה ארבע מערות: התנור, הגמל, הנחל והגדי.

במשך כחצי מיליון שנה חיו בהן בני אדם, וזה אחד הרצפים הארוכים בעולם. ב-2012 אונסק"ו הכריז על המערות האלה כאתר מורשת עולמית, בזכות מה שהן מלמדות אותנו על התפתחות האדם.$mdl$, $mdl$ממש מימיננו, במצוק של הכרמל, בפתח של נחל קטן, נמצאים כמה מהחדרים הכי חשובים בהיסטוריה של המין האנושי. אלה המערות של נחל מערות.

יש שם ארבע מערות: מערת התנור, מערת הגמל, מערת הנחל, ומערת הגדי, שנקראת בערבית סחול. בכל אחת מהן הצטברו שכבות של אדמה, אבנים, עצמות וכלים. במערת התנור, השכבות מגיעות לעומק של עד עשרים וחמישה מטרים. ובתוך השכבות האלה יש תיעוד של כחצי מיליון שנה של נוכחות אנושית.

מה מיוחד בזה? באותו מקום, ובאותו אזור, חיו לאורך הזמן גם ניאנדרטלים וגם בני אדם מודרניים. במערת הגדי נמצאו קבורות של אדם מודרני קדום, ובמערת התנור נמצא שלד של אישה ניאנדרטלית. ובמערת הנחל יש עדויות לקבורות מוקדמות מאוד, ולתרבות הנטופית, האנשים שהתחילו לעבור מציד ולקט להתיישבות קבע, ממש לפני המהפכה החקלאית.

לכן ב-2012 הכריז אונסק"ו על המערות האלה כאתר מורשת עולמית, בזכות ערכן לחקר האבולוציה של האדם.

והמערות נראות כמעט כמו חלונות בתוך המצוק. מי שעולה למעלה רואה בדיוק מה שראו האנשים שחיו בהן: את מישור החוף, ואת הים, שבתקופות הקרח היה רחוק הרבה יותר מערבה.

ומי גילתה את כל זה? אישה אחת, שבזכותה כל החוקרים של התחום מגיעים לכאן. זו השאלה הבאה.$mdl$, $mdl$בקטע שבין הבונים לעתלית, כשמצוק הכרמל מימין. השמורה נמצאת על כביש 4. המערות עצמן לא אומתו כנראות מכביש 2 — "אתר בסביבה".$mdl$, $mdl$שמורת נחל מערות (רשות הטבע והגנים) — טלפון 04-9841750/2.
שעות (לפי עלון הרשות): א׳–ה׳, שבת וחג 8:00–16:00. שישי וערבי חג 8:00–15:00. בשעון קיץ — שעה מאוחר יותר. כניסה אחרונה שעה לפני הסגירה.
חניון בכניסה, ואכילה רק בחניון.
מסלולים: שביל גיאולוגי (כשעה, מעגלי, שחור), שביל בוטני (כ-2.5 שעות, כחול), מצפה עופר (כ-5 שעות, ירוק), ושביל ישראל לאורך המצוק.
דמי כניסה, שירותים, נגישות וחניית אוטובוס לא פורטו בעלון — לוודא ברשות לפני ביקור.$mdl$, $mdl$[{"title":"רשות הטבע והגנים — עלון שמורת נחל מערות","url":"https://static.parks.org.il/wp-content/uploads/2025/04/mearot.pdf"},{"title":"Wikipedia — Nahal Me'arot Nature Reserve","url":"https://en.wikipedia.org/wiki/Nahal_Me%27arot_Nature_Reserve"},{"title":"Wikipedia — Tabun Cave","url":"https://en.wikipedia.org/wiki/Tabun_Cave"}]$mdl$::jsonb, $mdl$בשמורה עובר גם שביל ישראל, לאורך המצוק. מסלול "המצפור" שם הוא מסלול של כחמש שעות.$mdl$, $mdl$nearby$mdl$),
($mdl$q20-garrod$mdl$, $mdl$mcq$mdl$, $mdl$איזו ארכאולוגית החלה לחפור במערות הכרמל בשנת 1929?$mdl$, $mdl$["קתלין קניון","דורותי גארוד","מרגרט מיד","ג'יין גודול"]$mdl$::jsonb, 1, $mdl$דורותי גארוד ניהלה את חפירות מערות הכרמל, ובהן מערת התנור, החל מ-1929. (בגרסה המקורית של השאלה הופיעה השנה 1927, והיא תוקנה.)$mdl$, $mdl$ארכאולוגיה$mdl$, 2, null, 24, $mdl$דורותי גארוד, ארכאולוגית בריטית, התחילה לחפור במערות הכרמל ב-1929.

גארוד הובילה צוות שבו עבדו נשים רבות, גם מהכפרים בסביבה. ואחד הממצאים המפורסמים, גולגולת ניאנדרטלית ממערת התנור, נמצא בזכות פועלת מקומית בשם יוסרה. כעשר שנים אחר כך, גארוד הפכה לאישה הראשונה שקיבלה תואר פרופסור באוניברסיטת קיימברידג׳.$mdl$, $mdl$תיקון קטן לפני שמתחילים: גארוד התחילה לחפור בכרמל ב-1929, לא ב-1927.

דורותי גארוד הייתה ארכאולוגית בריטית, מומחית לתקופת האבן. בשנות העשרים כבר חפרה באירופה ובמזרח. ב-1929 היא הגיעה לכרמל, לראש משלחת בריטית-אמריקאית. החפירות שלה נמשכו כמה עונות, בשנים 1929–1934, וכללו את מערת התנור ומערת הנחל.

מה שמיוחד במשלחת שלה הוא האנשים. גארוד גייסה צוות שבו עבדו הרבה נשים, גם חוקרות מאירופה וגם פועלות מהכפרים הסמוכים. ובמערת התנור, אחד הממצאים החשובים, גולגולת ניאנדרטלית, מיוחס לפועלת מקומית צעירה בשם יוסרה. השם שלה כמעט לא הוזכר במשך עשרות שנים, וחזר רק לאחרונה לסיפור של החפירות.

ומה גארוד מצאה? שכבה על גבי שכבה של עדויות לחיים אנושיים. כלי אבן מסוגים שונים, עצמות של בעלי חיים שניצודו, קבורות. היא הצליחה לבנות מזה רצף כרונולוגי שהפך לבסיס של המחקר על תקופת האבן במזרח הקרוב. ובמערת הנחל נמצאו שרידים עשירים של התרבות הנטופית, תרבות שגארוד עצמה נתנה לה את שמה.

וכעשר שנים אחרי שהגיעה לכרמל, ב-1939, גארוד הפכה לאישה הראשונה שקיבלה תואר פרופסור באוניברסיטת קיימברידג׳.

אז בפעם הבאה שאתם עומדים מול מערת התנור, תזכרו שהיא לא רק מקום של ניאנדרטלים. היא גם מקום שבו שתי נשים, ארכאולוגית מקיימברידג׳ ופועלת מכפר בכרמל, שינו את ההבנה שלנו לגבי האדם הקדמון.$mdl$, $mdl$מיד אחרי השאלה על נחל מערות, באותו קטע של מצוק הכרמל מימין.$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Tabun Cave","url":"https://en.wikipedia.org/wiki/Tabun_Cave"},{"title":"רשות הטבע והגנים — עלון שמורת נחל מערות","url":"https://static.parks.org.il/wp-content/uploads/2025/04/mearot.pdf"}]$mdl$::jsonb, $mdl$ב-1939 דורותי גארוד הפכה לאישה הראשונה שקיבלה תואר פרופסור באוניברסיטת קיימברידג׳.$mdl$, $mdl$nearby$mdl$),
($mdl$q32-tabun-neanderthal$mdl$, $mdl$mcq$mdl$, $mdl$מה נמצא במערת התנור שבנחל מערות?$mdl$, $mdl$["שלד של אישה ניאנדרטלית","ספינה רומית","מטמון מטבעות של חצי שקל","כתובת צלבנית"]$mdl$::jsonb, 0, $mdl$במערת התנור נמצא שלד כמעט שלם של אישה ניאנדרטלית, המכונה Tabun C1, אחד הממצאים החשובים מהכרמל.$mdl$, $mdl$ארכאולוגיה$mdl$, 2, null, 25, $mdl$במערת התנור נמצא שלד כמעט שלם של אישה ניאנדרטלית, שנקרא בספרות "Tabun C1".

הניאנדרטלים היו מין אנושי אחר, קרוב אלינו, שחי באירופה ובמזרח הקרוב עד לפני כארבעים אלף שנה. ובכרמל, כמה מאות מטרים בלבד ממערת התנור, במערת הגדי, נמצאו קבורות של בני אדם מודרניים. שני מינים, שכנים באותו נחל.$mdl$, $mdl$השאלה הזו מנוסחת קצת אחרת מהמקור, כדי לא לשאול שוב "איזו שמורה". אבל היא עונה בדיוק על מה שרציתם ללמוד: האדם הניאנדרטלי בכרמל.

במערת התנור, הגדולה מבין ארבע המערות, נמצא שלד כמעט שלם של אישה ניאנדרטלית. בספרות המדעית קוראים לו Tabun C1. התיארוך שלו שנוי במחלוקת, והטווח שמופיע במקורות רחב מאוד, בין כ-120 אלף לכ-50 אלף שנה לפני זמננו. אבל כך או כך, זה אחד הממצאים הניאנדרטליים החשובים במזרח הקרוב.

מי היו הניאנדרטלים? מין אנושי אחר, קרוב מאוד אלינו. הם היו חסונים, עם מוח גדול, השתמשו בכלי אבן מתוחכמים, שלטו באש וקברו את מתיהם. הם חיו באירופה ובמזרח הקרוב, ונעלמו לפני כארבעים אלף שנה.

והחלק המרתק באמת: במערת הגדי, באותו נחל ממש, נמצאו קבורות של בני אדם מודרניים קדומים, מלפני כמאה אלף שנה. כלומר, הכרמל הוא אחד המקומות היחידים בעולם שבהם רואים את שני המינים באותו אזור, באותן תקופות פחות או יותר. האם הם נפגשו? האם התחתנו ביניהם? המחקר הגנטי מראה שבכולנו, אנשים שמוצאם מחוץ לאפריקה, יש אחוזים בודדים של דנ"א ניאנדרטלי. ויכול להיות שחלק מהמפגשים האלה קרו כאן, באזור שלנו.

אז כשנסתכל עכשיו על המצוק מימין, תחשבו על זה: לפני עשרות אלפי שנים, שני סוגים של בני אדם הסתכלו מכאן על אותו מישור חוף. ועכשיו, קדימה, לעתלית.$mdl$, $mdl$כשאלה שלישית ברצף של נחל מערות, באותו קטע של המצוק מימין. (השאלה נוסחה מחדש כדי לא לחזור על התשובה של "נחל מערות".)$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Nahal Me'arot Nature Reserve","url":"https://en.wikipedia.org/wiki/Nahal_Me%27arot_Nature_Reserve"},{"title":"Wikipedia — Tabun Cave","url":"https://en.wikipedia.org/wiki/Tabun_Cave"},{"title":"רשות הטבע והגנים — עלון שמורת נחל מערות","url":"https://static.parks.org.il/wp-content/uploads/2025/04/mearot.pdf"}]$mdl$::jsonb, $mdl$לרוב בני האדם שמוצאם מחוץ לאפריקה יש אחוזים בודדים של דנ"א ניאנדרטלי. המזרח הקרוב הוא אחד המקומות שבהם, ככל הנראה, נפגשו שני המינים.$mdl$, $mdl$nearby$mdl$),
($mdl$q21-atlit-camp$mdl$, $mdl$mcq$mdl$, $mdl$למה שימש מחנה המעפילים בעתלית בתקופת המנדט הבריטי?$mdl$, $mdl$["מחנה אימונים רומי","מחנה מעצר למעפילים","ארמון עות׳מאני","בסיס צלבני"]$mdl$::jsonb, 1, $mdl$הבריטים כלאו בעתלית עולים יהודים שהגיעו בלי היתר עלייה. ב-10 באוקטובר 1945 הפלמ"ח פרץ למחנה ושחרר 208 עצורים.$mdl$, $mdl$היסטוריה$mdl$, 1, null, 26, $mdl$אנחנו מתקרבים לעתלית, ולמחנה המעפילים. בסוף שנות השלושים הבריטים הקימו כאן מחנה מעצר לעולים שהגיעו בלי היתר עלייה. עשרות אלפי אנשים עברו בו, חלקם ניצולי שואה, מאחורי גדרות תיל.

ב-10 באוקטובר 1945 הפלמ"ח פרץ למחנה ושחרר 208 עצורים. את הפעולה תכנן יצחק רבין, ופיקד עליה נחום שריג. היום זה אתר מורשת לאומי ומוזיאון.$mdl$, $mdl$אנחנו נכנסים לאזור עתלית, ואחד הסיפורים החזקים של התקופה הזאת מחכה לנו כאן: מחנה המעפילים.

תדמיינו את סוף שנות השלושים. בריטניה, שלטה בארץ, מגבילה מאוד את העלייה היהודית, בדיוק כשבאירופה המצב הולך ומחמיר. יהודים מנסים להגיע בכל זאת, באוניות רעועות, בלי סרטיפיקטים. זו ה"עלייה הבלתי לגאלית", ההעפלה. ומה עושים הבריטים עם מי שנתפס? מביאים אותו לכאן, למחנה מעצר בעתלית.

כשהעצורים הגיעו, הם עברו תהליך שמזכיר לרבים מהם את מה שברחו ממנו: הפרדה בין גברים לנשים, ריסוס בדי.די.טי, ואז הוראה להתפשט ולהיכנס למקלחות. לניצולי שואה, זה היה רגע קשה מנשוא. חלקם ישבו כאן חודשים ארוכים.

ובנובמבר 1940 אירע אחד האסונות הקשים של ההעפלה: האונייה "פטריה", שעליה העבירו הבריטים מעפילים כדי לגרשם, פוצצה ושקעה בנמל חיפה, ומאות אנשים טבעו. הניצולים הובאו לעתלית.

ואז, בלילה של ה-10 באוקטובר 1945, הפלמ"ח פרץ למחנה. את הפעולה תכנן יצחק רבין, ופיקד עליה נחום שריג. 208 עצורים שוחררו והוברחו לקיבוצים בסביבה. זה היה אחד המבצעים הראשונים של המאבק בבריטים אחרי מלחמת העולם השנייה.

ב-1987 הוכרז המחנה כאתר מורשת לאומי, והיום יש בו מוזיאון שמספר את סיפור ההעפלה והמעפילים. ממש לידו, על החוף, יש אתר עתיק בהרבה, עם סיפור אחר לגמרי.$mdl$, $mdl$בהתקרבות לעתלית. לפי הקורס, הסבר על המחנה ניתן באזור עתלית. לא אומת שצריפי המחנה נראים מכביש 2 — לבדוק בנסיעת הכנה לפני שאומרים "תסתכלו".$mdl$, $mdl$מחנה המעפילים עתלית — אתר מורשת לאומי (הוכרז ב-1987), ובו מוזיאון.
שעות פתיחה, תיאום ביקור קבוצתי, שירותים וחניית אוטובוס לא אומתו במקורות שנבדקו — לבדוק מול הגוף המפעיל (המועצה לשימור אתרי מורשת) לפני ביקור.$mdl$, $mdl$[{"title":"Wikipedia — Atlit detainee camp","url":"https://en.wikipedia.org/wiki/Atlit_detainee_camp"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"}]$mdl$::jsonb, $mdl$אחרי מלחמת העצמאות, ושוב אחרי מלחמת ששת הימים, שימש המחנה גם להחזקת שבויי מלחמה.$mdl$, $mdl$check$mdl$),
($mdl$q22-chateau-pelerin$mdl$, $mdl$mcq$mdl$, $mdl$לאיזו תקופה שייכת מצודת עתלית, שאטו פלרן?$mdl$, $mdl$["התקופה הפרסית","תקופת ממלכת ישראל","התקופה הצלבנית","תקופת המנדט הבריטי"]$mdl$::jsonb, 2, $mdl$מצודת עתלית נבנתה ב-1218 על ידי מסדר הטמפלרים, ונטשה רק ב-1291, אחרי נפילת עכו. היא מעולם לא נכבשה במצור.$mdl$, $mdl$היסטוריה$mdl$, 1, null, 27, $mdl$על הכף של עתלית, משמאל, בתוך בסיס של חיל הים, עומדת מצודת עתלית. הצלבנים קראו לה שאטו פלרן, מצודת עולי הרגל.

הטמפלרים בנו אותה ב-1218. החומה הפנימית שלה הייתה בגובה של כשלושים מטר ובעובי של כשנים עשר מטר. היא מעולם לא נכבשה במצור, ונטשה רק ב-1291, אחרי שעכו נפלה. מהכביש לא רואים אותה, ואי אפשר לבקר בה.$mdl$, $mdl$חשוב להגיד את זה מיד: את המצודה לא נראה מהחלון. היא נמצאת על הכף, משמאלנו, בתוך בסיס של חיל הים, ואי אפשר לבקר בה. אבל זו אחת המצודות הצלבניות הגדולות שנבנו בארץ, ולכן היא שווה את הסיפור.

השנה היא 1218, ימי מסע הצלב החמישי. מסדר אבירי המקדש, הטמפלרים, מחליט לבנות מצודה על הכף הסלעי של עתלית. השם, Castrum Peregrinorum, "מצודת עולי הרגל", כנראה בא מעולי הרגל שהתנדבו לעבוד בבנייה.

ומה הם בנו? חומה חיצונית בגובה של כחמישה עשר מטר. ומאחוריה חומה פנימית בגובה של כשלושים מטר ובעובי של כשנים עשר מטר. בסיפור הדרך של הקורס מוזכר שמרכבות סוסים נסעו על החומות שלה, וזה נותן תחושה של הגודל. והמיקום מושלם: ים משלושה צדדים, ואספקה שמגיעה בספינות.

התוצאה: המצודה מעולם לא נכבשה במצור. האיובים ניסו ב-1220 ולא הצליחו. הממלוכים בהנהגת בייברס הגיעו ב-1265, והחריבו את העיירה שמסביב, אבל המצודה המשיכה לעמוד. היא ננטשה רק באוגוסט 1291, אחרי שעכו נפלה. היא הייתה אחד המעוזים האחרונים של הצלבנים בארץ.

ומה הרס אותה? רעידת האדמה של 1837. וב-1840 נלקחו ממנה אבנים לבנייה בעכו.

ודבר מפתיע לסיום: מתחת לים, מול עתלית, יש כפר שקוע מהתקופה הניאוליתית, בעומק של שמונה עד שנים עשר מטר. אז בעתלית יש היסטוריה גם מעל הים וגם מתחתיו.$mdl$, $mdl$בגובה עתלית. לפי סיפור הדרך של הקורס, המצודה לא נראית מהכביש, ואי אפשר לבקר בה כי היא בתוך בסיס צבאי — לומר "קרוב אלינו, על הכף, משמאל".$mdl$, $mdl$המצודה נמצאת בשטח צבאי סגור (בסיס חיל הים), ואין בה ביקור ציבורי.$mdl$, $mdl$[{"title":"Wikipedia — Château Pèlerin","url":"https://en.wikipedia.org/wiki/Ch%C3%A2teau_P%C3%A8lerin"},{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"Wikipedia — Atlit Yam","url":"https://en.wikipedia.org/wiki/Atlit_Yam"}]$mdl$::jsonb, $mdl$מול חוף עתלית, בעומק של 8–12 מטר, נמצא "עתלית ים", כפר שקוע מהתקופה הניאוליתית, בן יותר מ-8,000 שנה.$mdl$, $mdl$nearby$mdl$),
($mdl$q23-route-721$mdl$, $mdl$mcq$mdl$, $mdl$באיזה כביש נוסעים מאזור עתלית לכיוון נחל אורן ופארק הכרמל?$mdl$, $mdl$["כביש 721","כביש 90","כביש 1","כביש 10"]$mdl$::jsonb, 0, $mdl$כביש 721 יוצא מאזור עתלית מזרחה, חוצה את כביש 4, ועולה בנחל אורן אל לב פארק הכרמל.$mdl$, $mdl$גאוגרפיה$mdl$, 2, null, 28, $mdl$כאן, בעתלית, יוצא מזרחה כביש 721, אחד הכבישים היפים של הכרמל. הוא חוצה את כביש 4 ועולה בתוך נחל אורן אל פארק הכרמל.

בדרך אפשר לראות שדרת דקלי וושינגטוניה, את חוות אהרונסון, שהייתה הבסיס של ניל"י, את רכס מערת אצבע, ואת ההבדל בין המפנה הצפוני הירוק למפנה הדרומי הדליל.$mdl$, $mdl$אנחנו ממשיכים צפונה לחיפה, אבל כדאי שתכירו את הדרך שאנחנו לא לוקחים היום, כי היא אחת היפות בכרמל: כביש 721.

הוא יוצא מעתלית מזרחה. בסיור הכרמל שלנו נסענו בו, ובסיפור הדרך כתבנו: מימין, שדרה של דקלי וושינגטוניה. הדקלים הגבוהים האלה הם סימן היכר של כניסות ליישובים מסוף המאה התשע עשרה ותחילת העשרים. כאן הם סימנו את הדרך בין חוות אהרונסון לעתלית.

ובחווה הזו עצמה מסתתר סיפור גדול. אהרון אהרונסון, האגרונום מזכרון יעקב, שגילה את אם החיטה, הקים כאן תחנת ניסויים חקלאית. במלחמת העולם הראשונה היא הפכה לבסיס של מחתרת ניל"י, שריגלה למען הבריטים נגד העות׳מאנים. באוקטובר 1917 נחשפה המחתרת, ושרה אהרונסון נעצרה בזכרון יעקב.

הכביש ממשיך, חוצה את כביש 4, ונכנס לנחל אורן. מימין, רכס מערת אצבע. ושם רואים יפה את מה שלמדנו על מפנים: מימין המפנה הצפוני, ירוק וצפוף. משמאל המפנה הדרומי, דליל יותר. ובסלע רואים "צנירים", רצועות אופקיות ארוכות, שנוצרו מהמסה של שכבות דולומיט.

ולמעלה, הדרך מובילה לחוות משמר הכרמל, לאנדרטת אסון הכרמל, ולכיוון דליית אל-כרמל ועוספיא. אז אם תצטרכו פעם מסלול נוף לקבוצה, תזכרו: 721.$mdl$, $mdl$בגובה עתלית, כשיציאת כביש 721 מזרחה (ימינה) מתקרבת. אנחנו לא פונים אליו בנסיעה הזו — מציינים אותו כדרך הנוף של הכרמל.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור 2 כרמל, סיפור דרך (21.5.26)","url":"https://drive.google.com/file/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"},{"title":"טיולי — נחל אורן: ממחצבות קדומים לחניון האגם","url":"https://www.tiuli.com/tracks/112/%D7%A0%D7%97%D7%9C-%D7%90%D7%95%D7%A8%D7%9F-%D7%9E%D7%9E%D7%97%D7%A6%D7%91%D7%95%D7%AA-%D7%A7%D7%93%D7%95%D7%9E%D7%99%D7%9D-%D7%9C%D7%97%D7%A0%D7%99%D7%95%D7%9F-%D7%94%D7%90%D7%92%D7%9D"},{"title":"Wikipedia — Zikhron Ya'akov","url":"https://en.wikipedia.org/wiki/Zikhron_Ya%27akov"}]$mdl$::jsonb, $mdl$דקלי הוושינגטוניה הגבוהים היו סימן היכר של דרכי כניסה ליישובים בסוף המאה ה-19 ובתחילת המאה ה-20.$mdl$, $mdl$check$mdl$),
($mdl$q33-oren-parking$mdl$, $mdl$mcq$mdl$, $mdl$איזה חניון ליד כביש 721 מתאים להפסקת דרך באזור נחל אורן, בכפוף לבדיקת גישה ושירותים?$mdl$, $mdl$["חניון פתחת נחל אורן","חניון בארות","חניון מצדה מערב","חניון עין עבדת"]$mdl$::jsonb, 0, $mdl$חניון פתחת נחל אורן נמצא למרגלות הכרמל, ליד המפגש של כביש 721 עם כביש 4. יש בו שולחנות פיקניק, ברזיות ושירותים נגישים.$mdl$, $mdl$אתרי ביקור$mdl$, 2, null, 29, $mdl$בפתח של נחל אורן, איפה שהנחל יוצא מהכרמל אל מישור החוף, יש חניון יום מוצל: חניון פתחת נחל אורן.

הוא ליד המפגש של כביש 721 עם כביש 4, בין עצי זית, אלון וחרוב. יש בו שולחנות פיקניק, ברזיות ושירותים נגישים, ושביל ישראל עובר לידו. לפני שמביאים קבוצה, בודקים מראש גישה לאוטובוס ותשלום.$mdl$, $mdl$השאלה הזו מעשית, וכל מורה דרך צריך לשאול אותה כל הזמן: איפה עוצרים?

"פתחת" זה המקום שבו נחל יוצא מבין ההרים אל המישור. וחניון פתחת נחל אורן נמצא בדיוק שם: למרגלות המדרון המערבי של הכרמל, בין עצי זית, אלון וחרוב, ליד המפגש של כביש 721 עם כביש 4, סמוך לצומת אורן.

מה יש שם? שולחנות פיקניק, ברזיות, צל, ושירותים נגישים. יש שביל נגיש מהחניה אל אזור הישיבה. ושביל ישראל עובר באזור, כך שאפשר לשלב הפסקה עם הליכה קצרה.

ועכשיו המלצה למורה דרך, כי זה בדיוק מה שהשאלה מבקשת: "בכפוף לבדיקת גישה ושירותים". המידע שמצאתי על החניון מ-2019, והוא מציין כמה נקודות שחשוב לבדוק. הדרך מחניית האוטובוס אל השביל הנגיש ארוכה ולא סלולה. ובסופי שבוע נגבה תשלום על חניה. לכן, לפני שמביאים לכאן קבוצה, מתקשרים למשרדי פארק הכרמל, ובודקים: האם האוטובוס יכול להיכנס, האם השירותים פתוחים, והאם צריך לשלם.

וזה בדיוק ההבדל בין מורה דרך טוב למורה דרך מצוין. לא רק לדעת את ההיסטוריה של המקום, אלא גם לדעת איפה יש שירותים, צל ומים, ואיך מכניסים אוטובוס של חמישים אנשים בלי הפתעות.

ומכאן ממשיכים צפונה. הכרמל מתקרב לים, ובעוד כמה דקות נגיע לעיר שבנויה עליו.$mdl$, $mdl$בגובה עתלית, יחד עם שאלת כביש 721. החניון נמצא ליד צומת אורן (כביש 4) — לא על כביש 2.$mdl$, $mdl$חניון פתחת נחל אורן — חניון יום (עם שטח לפיקניק), למרגלות הכרמל, ליד המפגש של כביש 721 וכביש 4 (צומת אורן).
לפי נגישות ישראל (2019): שירותים נגישים, ברזיות, שולחנות פיקניק, צל, שביל נגיש מהחניה אל הישיבה. הדרך מחניית האוטובוס ארוכה ולא סלולה. דמי חניה 36 ₪ לרכב בסופי שבוע (מנויי מטמון — חינם).
משרדי פארק הכרמל: 04-8228983.
המידע מ-2019 — לוודא גישה לאוטובוס, תשלום ושירותים לפני כל ביקור.$mdl$, $mdl$[{"title":"נגישות ישראל — חניון פתחת נחל אורן, פארק הכרמל (2019)","url":"https://www.aisrael.org/?CategoryID=3505&ArticleID=63547"},{"title":"עמוד ענן — חניון פתחת נחל אורן","url":"https://amudanan.co.il/w/P658713"},{"title":"טיולי — נחל אורן: ממחצבות קדומים לחניון האגם","url":"https://www.tiuli.com/tracks/112/%D7%A0%D7%97%D7%9C-%D7%90%D7%95%D7%A8%D7%9F-%D7%9E%D7%9E%D7%97%D7%A6%D7%91%D7%95%D7%AA-%D7%A7%D7%93%D7%95%D7%9E%D7%99%D7%9D-%D7%9C%D7%97%D7%A0%D7%99%D7%95%D7%9F-%D7%94%D7%90%D7%92%D7%9D"}]$mdl$::jsonb, $mdl$"פתחת" היא המקום שבו נחל יוצא מבין ההרים אל המישור. נחל אורן מסתיים בים, לא רחוק ממחנה המעפילים ומהמצודה של עתלית.$mdl$, $mdl$nearby$mdl$),
($mdl$q24-haifa-carmel$mdl$, $mdl$mcq$mdl$, $mdl$על איזה רכס הרים בנויה חיפה?$mdl$, $mdl$["הרי השומרון","הכרמל","החרמון","הגלבוע"]$mdl$::jsonb, 1, $mdl$חיפה בנויה על המורדות הצפוניים של הכרמל ולמרגלותיהם, במקום שבו הרכס פוגש את הים.$mdl$, $mdl$גאוגרפיה$mdl$, 1, null, 30, $mdl$הגענו לחיפה, והיא בנויה על הכרמל. תסתכלו ימינה ולמעלה: הבתים מטפסים על הרכס, מהחוף ועד לפסגה.

כאן הכרמל פוגש את הים, "ככרמל בים יבוא". ובגלל זה חיפה היא עיר של מדרגות, שבילים ושכונות שבנויות בשכבות. ובראש הכרמל, מעל הים, נמצאים מנזר סטלה מאריס ומערת אליהו, שקדושה ליהודים, לנוצרים ולמוסלמים.$mdl$, $mdl$תסתכלו ימינה ולמעלה. כל מה שאתם רואים, מהכביש ועד לקו הרקיע, הוא חיפה, והיא בנויה על הכרמל.

זו נקודת הסיום של הסיפור שהתחלנו בזכרון יעקב. הכרמל מתקרב לים כל הדרך, ומישור החוף מצטמצם. וכאן, בראש הכרמל, ההר כמעט נוגע בים. נשאר רק מעבר צר, ובו עוברים הכביש והמסילה. "ככרמל בים יבוא".

למה לבנות עיר על הר תלול? בהתחלה, בכלל לא בנו עליו. בסיור חיפה שמענו שעל הכרמל לא ישבו אנשים כמעט לאורך ההיסטוריה. ההר עשוי גיר, מחלחל, בלי מעיינות, ועד מלחמת העולם הראשונה כמעט שלא היו בו דרכים. חיפה העתיקה ישבה למטה, על החוף. רק במאה העשרים, עם הנמל, הרכבת והאוכלוסייה הגדלה, העיר התחילה לטפס.

ובראש הכרמל, מעל הים, יש שני מקומות שכדאי להכיר. מנזר סטלה מאריס, של המסדר הכרמליתי, מסדר שלקח את שמו מההר. ולמטה, מערת אליהו, שקדושה לשלוש דתות: ליהודים זה אליהו הנביא, לנוצרים הוא קשור ליוחנן המטביל, ולמוסלמים הוא אל-ח׳דר.

וגם לנו כמורי דרך יש כאן הזדמנות: חיפה היא עיר של עדות ודתות. יהודים, מוסלמים, נוצרים, בהאים, אחמדים ודרוזים בסביבה. ההר הזה מחבר את כולם. ובשאלה הבאה נבין איך הטופוגרפיה קבעה את צורת העיר.$mdl$, $mdl$בכניסה לחיפה מהדרום (בלי מנהרות הכרמל), כשהשכונות על הרכס נראות מימין, מעל הכביש.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור אתרים חיפה, גלי נחום (25.6.26)","url":"https://drive.google.com/file/d/1UZYrjBBQEXMFzOvz907hFzvtsSCgL4yB/view"},{"title":"סיכומי סיורי הכרמל (מסמך אישי)","url":"https://docs.google.com/document/d/16EmYqkhUG__qSK_Q9iXcS52o6Mcg1ZGUFoE_wj80yMU/edit"}]$mdl$::jsonb, $mdl$המסדר הכרמליתי, מסדר נזירים קתולי שפועל ברחבי העולם, נקרא על שם הר הכרמל.$mdl$, $mdl$visible$mdl$),
($mdl$q26-haifa-wadis$mdl$, $mdl$mcq$mdl$, $mdl$מה מפריד לעיתים בין השכונות הבנויות על שלוחות הכרמל?$mdl$, $mdl$["קרחונים","ואדיות","מכתשים","סכרים"]$mdl$::jsonb, 1, $mdl$בחיפה השכונות בנויות על השלוחות של הכרמל, וביניהן יורדים ואדיות (ערוצים) מיוערים.$mdl$, $mdl$גאוגרפיה$mdl$, 1, null, 31, $mdl$תסתכלו על מבנה העיר: שכונות על הגב של השלוחות, וביניהן ערוצים ירוקים ועמוקים. אלה הוואדיות.

בגלל הוואדיות, אין לחיפה מרכז עירוני אחד ברור. כל שכונה היא כמעט אי, ומה שמחבר ביניהן הם כבישים מתפתלים, מדרגות ושבילים. וזה גם מה שהופך את חיפה לירוקה כל כך: חורש טבעי בתוך העיר.$mdl$, $mdl$תסתכלו על חיפה מלמטה, ותראו שהיא בנויה כמו כף יד. מקו הרכס יורדות שלוחות לכיוון הים והמפרץ, כמו אצבעות. על הגב של כל שלוחה יש שכונה. וביניהן, ערוצים עמוקים וירוקים: הוואדיות.

בסיור חיפה ראינו את זה מקרוב. מהרכס יוצאות שלוחות, וביניהן גאיות, ובחלקם יש חורש טבעי. ולמה דווקא ערוצים? כי מי הגשם יורדים מהרכס אל הים, ובמשך זמן רב הם חותרים לעצמם דרך בסלע. וכך נוצרו הוואדיות.

ומה זה עשה לעיר? קודם כל, אין לה מרכז אחד ברור. בתל אביב יש רחובות ישרים וכיכרות. בחיפה, כל שכונה היא כמעט אי, ומה שמחבר ביניהן הם כבישים מתפתלים, מדרגות ושבילים. בסיור שמענו שזו אחת הסיבות שאין בחיפה "מרכז עירוני מובהק", אלא אוסף של שכונות.

אבל יש לזה גם צד יפה מאוד: הוואדיות הן ריאות ירוקות. בתוך העיר יש חורש ים תיכוני, מסלולי הליכה, ולפעמים אפילו מעיינות קטנים. חזירי בר מטיילים בחלק מהשכונות, כי הוואדיות מחברות את העיר לטבע של הכרמל.

ושם של ואדי מוכר: ואדי סאליב, בעיר התחתית, שכונה שקשורה לאירועים חברתיים חשובים בתולדות המדינה. אז התשובה פשוטה, ואדיות, אבל מאחוריה כל צורת החיים בעיר. ובשאלה הבאה נעלה במדרגות של חיפה.$mdl$, $mdl$בכניסה לחיפה, כשרואים מימין שלוחות בנויות עם ערוצים ירוקים ביניהן. לאמת בנסיעת הכנה.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור אתרים חיפה, גלי נחום (25.6.26)","url":"https://drive.google.com/file/d/1UZYrjBBQEXMFzOvz907hFzvtsSCgL4yB/view"}]$mdl$::jsonb, $mdl$בגלל הוואדיות, חזירי בר מגיעים לחלק משכונות חיפה: הערוצים המיוערים מחברים את העיר לטבע של הכרמל.$mdl$, $mdl$check$mdl$),
($mdl$q25-haifa-levels$mdl$, $mdl$mcq$mdl$, $mdl$מהם שלושת המפלסים העירוניים המוכרים של חיפה?$mdl$, $mdl$["חוף, מדבר ובקעה","העיר התחתית, הדר הכרמל ומרכז הכרמל","נגב, שפלה והר","עמק, מכתש וים"]$mdl$::jsonb, 1, $mdl$חיפה בנויה בשלוש מדרגות: העיר התחתית ליד הנמל, הדר הכרמל באמצע המדרון, ומרכז הכרמל למעלה.$mdl$, $mdl$גאוגרפיה$mdl$, 1, null, 32, $mdl$חיפה בנויה בשלוש קומות: העיר התחתית ליד הנמל, הדר הכרמל באמצע המדרון, ומרכז הכרמל למעלה.

ובסיור חיפה למדנו שהגובה הזה גם מספר סיפור חברתי. מי שהצליח, עבר בדרך כלל למעלה. היום העיר התחתית עוברת התחדשות, ומושכת אליה צעירים, אמנים ובתי קפה. ובחיפה יש גם רכבת תחתית, הכרמלית, שמחברת את המפלסים.$mdl$, $mdl$תסתכלו על המדרון ותספרו את המדרגות. חיפה בנויה בשלושה מפלסים עיקריים, וכל אחד מהם הוא תקופה וסיפור.

למטה, העיר התחתית. כאן הייתה חיפה של דאהר אל-עומר, עם החומה, השוק והנמל. כאן התרכזו המסחר, הנמל והתחבורה. והאזור הזה נבנה בחלקו על שטח שייבשו הבריטים מהים כשבנו את הנמל.

באמצע, הדר הכרמל. זו השכונה העברית שהתחילה לקום בשנות העשרים, ליד הבניין של הטכניון, שבו התחילו הלימודים ב-1924. הדר הייתה פעם הלב היהודי של חיפה, מרכז של מסחר ותרבות.

למעלה, מרכז הכרמל, עם שכונות מגורים, מוסדות ונוף לים ולמפרץ.

ועכשיו לפן החברתי, שעליו דיברנו בסיור. בחיפה יש התאמה בין גובה טופוגרפי לגובה חברתי-כלכלי. מי שהצליח, "דילג" בדרך כלל מדרגה אחת למעלה. בשנים מסוימות, כשמשפחות עלו לכרמל, הדר התאכלסה בעולים חדשים. והעיר התחתית ירדה, ועכשיו היא מתחדשת: אמנות רחוב, בתי קפה וקמפוס של אוניברסיטה.

ואיך עוברים בין המפלסים? במדרגות, ויש בחיפה הרבה, וגם בכרמלית, הרכבת התחתית של חיפה, שעולה בתוך ההר. וזה יכול להיות טריק נחמד בסיור עירוני: עולים בכרמלית, ויורדים ברגל במדרגות.

אז שלוש מדרגות, שלוש תקופות. ועכשיו נחזור אחורה בזמן, אל האיש שבנה את חיפה החדשה.$mdl$, $mdl$בכניסה לחיפה או בסמוך לעיר התחתית, כשרואים מימין את המדרון הבנוי בשכבות. לאמת בנסיעת הכנה.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור אתרים חיפה, גלי נחום (25.6.26)","url":"https://drive.google.com/file/d/1UZYrjBBQEXMFzOvz907hFzvtsSCgL4yB/view"},{"title":"Wikipedia — History of Haifa","url":"https://en.wikipedia.org/wiki/History_of_Haifa"}]$mdl$::jsonb, $mdl$בחיפה פועלת הכרמלית, רכבת תחתית על כבל שעולה בתוך ההר ומחברת בין העיר התחתית לבין מרכז הכרמל.$mdl$, $mdl$check$mdl$),
($mdl$q27-daher$mdl$, $mdl$mcq$mdl$, $mdl$מי הקים את חיפה החדשה במאה ה-18?$mdl$, $mdl$["הורדוס","דאהר אל-עומר","סלאח א-דין","הברון רוטשילד"]$mdl$::jsonb, 1, $mdl$השליט המקומי דאהר אל-עומר החריב את חיפה הישנה ובנה עיר חדשה ומוקפת חומה כ-2.5 ק"מ מזרחה, בשנות השישים של המאה ה-18.$mdl$, $mdl$היסטוריה$mdl$, 2, null, 33, $mdl$במאה השמונה עשרה, דאהר אל-עומר, שליט הגליל, החריב את הכפר הישן של חיפה ובנה עיר חדשה ומוקפת חומה, כקילומטרים וחצי מזרחה.

הוא בחר את המקום הצר ביותר בין ההר לים, איפה שנמצאת היום קריית הממשלה. ממגדל השמירה של העיר, "מגדל הטיל", אפשר היה לשלוט במעבר. וזו בעצם הלידה של חיפה המודרנית.$mdl$, $mdl$לחיפה יש היסטוריה ארוכה מאוד. בתלמוד היא מוזכרת יותר ממאה פעמים, ככפר דייגים יהודי. יש שם אפילו הלכה משעשעת: לא מעלים לתורה אנשים מחיפה, בית שאן וטבעון, כי הם מבלבלים בין חי״ת לעי״ן.

אבל חיפה שאנחנו מכירים נולדה במאה השמונה עשרה, בזכות אדם אחד: דאהר אל-עומר. הוא היה שליט מקומי שבנה לעצמו כוח בגליל, ובנה מחדש את עכו כבירה שלו. חיפה הייתה בשבילו בעיה: כפר פתוח על החוף, שכל אחד יכול לנחות בו.

אז בשנות השישים של המאה, המקורות נותנים כמה תאריכים, הנפוץ הוא 1761, הוא החריב את הכפר הישן ובנה עיר חדשה, מוקפת חומה, כקילומטרים וחצי מזרחה. הוא בחר את המקום הצר ביותר בין ההר לים, איפה שנמצאת היום קריית הממשלה, ובנה מגדל שמירה, "מגדל הטיל", ששלט במעבר.

ומשם, העיר התחילה לגדול. במאה התשע עשרה היא יצאה מהחומות, והגיעו אליה הטמפלרים הגרמנים, שבנו את המושבה הגרמנית. בהמשך הגיעו הבהאים, והעבירו לכאן ב-1909 את קבר הבאב. בין 1903 ל-1905 נבנתה שלוחה של רכבת החג׳אז מחיפה. ובספר "אלטנוילנד" של הרצל, מ-1902, חיפה היא עיר המופת של העתיד.

וכשהבריטים כבשו את חיפה בספטמבר 1918, היא כבר הייתה עיר בתנופה. מה שחסר לה היה דבר אחד, נמל גדול באמת. וזה נושא השאלה האחרונה שלנו.$mdl$, $mdl$בכניסה לעיר התחתית, באזור קריית הממשלה של היום, שם עמדה העיר של דאהר. מתאים לכל רגע בחיפה.$mdl$, $mdl$$mdl$, $mdl$[{"title":"קורס יובל — סיור אתרים חיפה, גלי נחום (25.6.26)","url":"https://drive.google.com/file/d/1UZYrjBBQEXMFzOvz907hFzvtsSCgL4yB/view"},{"title":"Wikipedia — History of Haifa","url":"https://en.wikipedia.org/wiki/History_of_Haifa"}]$mdl$::jsonb, $mdl$התלמוד מספר שלא מעלים לתורה אנשים מחיפה, בית שאן וטבעון, כי הם מבלבלים בין חי״ת לעי״ן.$mdl$, $mdl$topic$mdl$),
($mdl$q28-haifa-port$mdl$, $mdl$mcq$mdl$, $mdl$איזה מפעל תשתית תרם במיוחד להתפתחות חיפה בתקופת המנדט הבריטי?$mdl$, $mdl$["הנמל המודרני","רכבת קלה לאילת","נמל התעופה רמון","הקמת מצדה"]$mdl$::jsonb, 0, $mdl$הבריטים בנו בחיפה נמל מודרני עמוק, שנחנך ב-31 באוקטובר 1933, והפך את העיר למרכז כלכלי ותעשייתי.$mdl$, $mdl$היסטוריה$mdl$, 1, null, 34, $mdl$הנמל של חיפה, שנראה לכיוון המפרץ, הוא מה ששינה את העיר. הבריטים בנו כאן נמל מודרני ועמוק, שנחנך ב-31 באוקטובר 1933.

ספינות גדולות, שלא יכלו לעגון בעכו, יכלו להגיע לכאן. יחד עם הרכבת וצינור הנפט, חיפה הפכה לעיר נמל ותעשייה. היום יש בה גם נמל חדש, "נמל המפרץ", שנחנך ב-2021.$mdl$, $mdl$נסיים את הנסיעה שלנו בדבר שהפך את חיפה מעיר קטנה לעיר גדולה: הנמל.

עד המאה התשע עשרה, הנמל החשוב בצפון היה עכו. אבל באותה מאה, ספינות הקיטור נעשו גדולות ועמוקות יותר, והמפרץ הרדוד של עכו כבר לא התאים להן. בצד הדרומי של המפרץ, ליד חיפה, המים עמוקים יותר, וההר מגן מפני הרוחות. העות׳מאנים כבר הביאו לכאן רכבת, אבל את הקפיצה הגדולה עשו הבריטים.

הבריטים רצו בחיפה מרכז אסטרטגי: נמל, רכבת, וצינור נפט מעיראק. הם בנו נמל מודרני עמוק, והוא נחנך ב-31 באוקטובר 1933, בטקס בהשתתפות הנציב העליון. לבנייה ייבשו שטח מהים, ועליו נבנה חלק מהעיר התחתית. בשנות השלושים הגיע לחיפה גם צינור הנפט מכירכוך, ולידו קמו בתי הזיקוק.

והתוצאה? חיפה הפכה לעיר תעשייה, עבודה והגירה. עובדי נמל, מהנדסים, פועלים, יהודים וערבים, הגיעו מכל מקום. גם קהילת סלוניקי, שעובדי נמל רבים באו ממנה, השאירה כאן את חותמה.

אבל לנמל היה גם מחיר: הוא חסם את הקשר הישיר בין העיר לים. היום, בעיר התחתית, מדברים על לפתוח חלק מהנמל הישן לציבור.

ואם תסתכלו לכיוון המפרץ, תראו את הנמל החדש, "נמל המפרץ", שנחנך ב-2021 ומופעל על ידי חברה סינית. מנמל של מנדט ועד נמל גלובלי, זה הסיפור של חיפה. ובזה הגענו לסוף הדרך שלנו מזכרון יעקב. תודה לכולם, ונראה מי ניצח בחידון!$mdl$, $mdl$בהתקרבות לנמל ולעיר התחתית — הנמל משמאל, לכיוון המפרץ. לאמת בנסיעת הכנה מה נראה מהמסלול.$mdl$, $mdl$$mdl$, $mdl$[{"title":"Wikipedia — Port of Haifa","url":"https://en.wikipedia.org/wiki/Port_of_Haifa"},{"title":"קורס יובל — סיור אתרים חיפה, גלי נחום (25.6.26)","url":"https://drive.google.com/file/d/1UZYrjBBQEXMFzOvz907hFzvtsSCgL4yB/view"},{"title":"Wikipedia — History of Haifa","url":"https://en.wikipedia.org/wiki/History_of_Haifa"}]$mdl$::jsonb, $mdl$נמל המפרץ החדש בחיפה נחנך ב-1 בספטמבר 2021, ומופעל על ידי חברת SIPG משנגחאי.$mdl$, $mdl$check$mdl$)
on conflict (ext_key) do update set
  kind = excluded.kind, text = excluded.text, options = excluded.options,
  correct_index = excluded.correct_index, explanation = excluded.explanation,
  category = excluded.category, difficulty = excluded.difficulty, time_limit_sec = excluded.time_limit_sec,
  sort_order = excluded.sort_order, guide_short = excluded.guide_short, guide_long = excluded.guide_long,
  guide_location = excluded.guide_location, guide_practical = excluded.guide_practical,
  guide_sources = excluded.guide_sources, guide_fact = excluded.guide_fact,
  guide_visibility = excluded.guide_visibility, is_demo = false, updated_at = clock_timestamp();

-- =====================================================================
--  Banque V2 « מסלול התמונות — הלוך » — V2 — Parcours photographié (aller)
--  6 questions principales (MAIN) + 2 de remplacement (SPARE, désactivées par défaut),
--  en hébreu / français / anglais / russe, et 32 fiches photo PRIVÉES (galerie admin).
--  Fichier GÉNÉRÉ par tools/build-v2-sql.mjs à partir de content/v2/ — ne pas éditer à la main.
--  Ré-exécutable : aucune suppression, aucun doublon, la banque V1 n'est pas touchée.
--  (Une nouvelle exécution écrase les modifications faites dans l'admin sur ces 8 questions.)
-- =====================================================================

insert into mdl.route_collections (code, bank, label, direction, notes, cautions, sort)
values ($mdl$ALLER_V2$mdl$, 'V2', $mdl${"he":"מסלול התמונות — הלוך","fr":"V2 — Parcours photographié (aller)","en":"V2 — Photographed outbound route","ru":"V2 — Маршрут по фотографиям (туда)"}$mdl$::jsonb, 'outbound', $mdl$[{"he":"קיבוץ נחשולים, דור, מוזיאון המזגגה — צד שמאל","fr":"Nahsholim, Dor et ancienne verrerie Mizgaga — gauche","en":"Nahsholim, Dor and Mizgaga glassworks — left","ru":"Нахшолим, Дор и музей стекольного завода — слева","photoLink":"1000472059.jpg","status":"regional_not_guaranteed_visible","withinPhotographedSection":true},{"he":"מבצר הבונים / כפרלט — צד שמאל","fr":"Fort de HaBonim / Kfarlet — gauche","en":"HaBonim / Kfarlet Fortress — left","ru":"Крепость Ха-Боним / Кфарлет — слева","photoLink":"1000472069.jpg","status":"probable_photo_identity_needs_confirmation","withinPhotographedSection":true},{"he":"מצפה יער עופר על הכרמל — צד ימין","fr":"Belvédère de la forêt Ofer sur le Carmel — droite","en":"Ofer Forest viewpoint on Carmel — right","ru":"Смотровая площадка леса Офер на Кармеле — справа","photoLink":null,"status":"reported_by_course_not_yet_verified_visible","withinPhotographedSection":true},{"he":"מטעי בננות — צד ימין","fr":"Bananeraies — droite","en":"Banana plantations — right","ru":"Банановые плантации — справа","photoLink":"1000472079.jpg","status":"photographed","withinPhotographedSection":true},{"he":"עתלית ומחנה המעפילים; שדרת דקלי הוושינגטוניה — צד שמאל לפי הסיכום","fr":"Atlit, camp d’internement et avenue historique de palmiers — gauche selon la note","en":"Atlit, detention camp and historic palm avenue — left according to note","ru":"Атлит, лагерь и историческая пальмовая аллея — слева по заметке","photoLink":"1000472083.jpg","status":"camp_sign_visible_other_landmarks_not_verified","withinPhotographedSection":true},{"he":"גשר הרכבת מעל כביש החוף","fr":"Pont ferroviaire au-dessus de la route côtière","en":"Railway bridge across the coastal highway","ru":"Железнодорожный мост над прибрежным шоссе","photoLink":"1000472087.jpg","status":"photographed","withinPhotographedSection":true},{"he":"כיסא ענק צהוב מימין, צפונית לעתלית — מיקום ומקור לא מאומתים","fr":"Grande chaise jaune à droite au nord d’Atlit — à vérifier","en":"Large yellow chair on the right north of Atlit — verify","ru":"Большой жёлтый стул справа к северу от Атлита — проверить","photoLink":null,"status":"mentioned_only_unverified","withinPhotographedSection":true},{"he":"מספר פסלים לצד שמאל של הכביש — לא זוהו פרטנית","fr":"Sculptures le long du côté gauche — non identifiées","en":"Several sculptures along the left side — not identified","ru":"Несколько скульптур слева от дороги — не опознаны","photoLink":"1000472065.jpg","status":"mentioned_only_unverified","withinPhotographedSection":true},{"he":"פריחת חצבים — רק אם רואים בפועל","fr":"Floraison des scilles d’automne — seulement si visibles","en":"Autumn squill flowers — only if actually visible","ru":"Цветение морского лука — только если растения действительно видны","photoLink":null,"status":"seasonal_must_confirm_on_day","withinPhotographedSection":true},{"he":"מת״ם, בתי קברות בכניסה לחיפה, שער העיר","fr":"MATAM, cimetières à l’entrée de Haïfa, monument « Porte de la ville »","en":"MATAM, cemeteries at Haifa entrance, “City Gate”","ru":"МАТАМ, кладбища у въезда в Хайфу, «Городские ворота»","photoLink":null,"status":"beyond_last_confirmed_photo_or_route_unverified","withinPhotographedSection":false},{"he":"מסעדת מקסים, הכרמל הצרפתי, טיילת בת גלים, חקר ימים ואגמים, סטלה מאריס, מערת אליהו","fr":"Restaurant Maxim, Carmel français, Bat Galim, institut océanographique, Stella Maris et grotte d’Élie","en":"Maxim Restaurant, French Carmel, Bat Galim, Oceanographic Institute, Stella Maris and Elijah’s Cave","ru":"Ресторан «Максим», Французский Кармель, Бат-Галим, океанографический институт, Стелла Марис и пещера Илии","photoLink":null,"status":"beyond_last_confirmed_photo_or_route_unverified","withinPhotographedSection":false}]$mdl$::jsonb,
        $mdl$["Map image snapshots show approximate locations, not EXIF GPS coordinates.","Do not treat landmarks mentioned in the WhatsApp guide note as photographed.","Some photos may be from the left even if most were taken on the right.","Never claim specific buildings, stone towers or abstract sculptures identified unless verified.","Locations beyond the last photo near Tirat Carmel/Haifa are not automatically in the bus route.","Do not import optional alternatives into the automatic playable sequence unless activated by the admin."]$mdl$::jsonb, 1)
on conflict (code) do update set bank = excluded.bank, label = excluded.label, direction = excluded.direction,
  notes = excluded.notes, cautions = excluded.cautions, sort = excluded.sort;

insert into mdl.questions (ext_key, bank, selection, kind, text, options, correct_index, explanation, category,
  difficulty, time_limit_sec, sort_order, guide_short, guide_long, guide_location, guide_practical, guide_sources,
  guide_fact, guide_visibility, i18n, guide_i18n, route_meta)
values
($mdl$v2:PHOTO-OUT-01$mdl$, 'V2', $mdl$MAIN$mdl$, 'mcq', $mdl$מה אפשר ללמוד מהשכבות הנראות בחשיפת הסלע?$mdl$, $mdl$["שהסלע נוצר ביום אחד","שהצטברו חומרים בתקופות שונות","שזה בהכרח סלע געשי","שהסלע נבנה מבטון"]$mdl$::jsonb, 1, $mdl$השכבות מעידות על שלבי הצטברות ושינוי שונים.$mdl$, $mdl$גאולוגיה$mdl$, 2, 45, 1, $mdl$תסתכלו על המצוק לצד הכביש: אפשר ממש לקרוא בו את ההיסטוריה של הנוף. השכבות נוצרו בשלבים שונים, ולא כולן באותו רגע. כדי לדעת בדיוק מתי נוצרה כל שכבה צריך מחקר גאולוגי, ולא מספיק להסתכל מהחלון.$mdl$, $mdl$$mdl$, $mdl$בצד הדרך מופיע חתך סלע; לזהות לפני השאלה · שעת צילום (משוערת): 11:04$mdl$, $mdl$$mdl$, $mdl$[{"title":"sciencedirect.com","url":"https://www.sciencedirect.com/science/article/pii/S0031018204002408"},{"title":"docs.google.com","url":"https://docs.google.com/document/d/1JLdWbSaqfAeOUd8jUi6ajBc2wORmyGY3/edit"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$check$mdl$, $mdl${"fr":{"text":"Que révèlent les couches visibles dans cette coupe rocheuse ?","options":["La roche s’est formée en un jour","Des matériaux se sont accumulés à différentes périodes","C’est forcément une roche volcanique","La roche est en béton"],"explanation":"Les couches indiquent plusieurs phases de dépôt ou de transformation.","category":"Géologie"},"en":{"text":"What do the visible layers in this rock cutting tell us?","options":["The rock formed in one day","Material accumulated in different periods","It must be volcanic rock","It was built from concrete"],"explanation":"Layers record successive phases of deposition or change.","category":"Geology"},"ru":{"text":"О чём говорят видимые слои в этом скальном разрезе?","options":["Порода образовалась за один день","Материал накапливался в разные периоды","Это обязательно вулканическая порода","Скала сделана из бетона"],"explanation":"Слои отражают разные этапы накопления и изменения материала.","category":"Геология"}}$mdl$::jsonb, $mdl${"he":{"script":"תסתכלו על המצוק לצד הכביש: אפשר ממש לקרוא בו את ההיסטוריה של הנוף. השכבות נוצרו בשלבים שונים, ולא כולן באותו רגע. כדי לדעת בדיוק מתי נוצרה כל שכבה צריך מחקר גאולוגי, ולא מספיק להסתכל מהחלון.","caution":""},"fr":{"script":"Regardez la paroi au bord de la route : elle permet presque de lire l’histoire du paysage. Ses couches se sont formées à différentes étapes. Mais pour dater chaque couche précisément, il faut une étude géologique : une simple photo ne suffit pas.","caution":""},"en":{"script":"Look at the roadside cliff. Its layers are like pages in the history of the landscape, built up over different episodes. To establish the exact age of each layer, however, geologists need more than a view from the bus.","caution":""},"ru":{"script":"Посмотрите на скальный разрез у дороги: его слои словно страницы истории ландшафта. Они формировались в разные периоды. Однако определить точный возраст каждого слоя только по фотографии нельзя — нужны геологические исследования.","caution":""}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-01","photos":["01.jpg"],"photoOrders":[1],"sourcePhotos":["1000472035.jpg"],"routeMarkerTime":"11:04:19","photoLocalTime":"11:04","timeIsIndicative":true,"side":"right_probable","sideNote":"à confirmer (aller principalement côté droit)","confidence":"medium","sectorFr":"Début de la série, coupe rocheuse proche de Dor/Zikhron","triggerHe":"בצד הדרך מופיע חתך סלע; לזהות לפני השאלה","topic":"Exposed coastal layers","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-07$mdl$, 'V2', $mdl$MAIN$mdl$, 'mcq', $mdl$במה הייתה ידועה העיר דור בעת העתיקה?$mdl$, $mdl$["עיר נמל וסחר","מכרה נחושת במדבר","עיר בירה של אשור","אתר סקי"]$mdl$::jsonb, 0, $mdl$דור הייתה עיר נמל חשובה בחוף הכרמל.$mdl$, $mdl$ארכאולוגיה$mdl$, 2, 45, 2, $mdl$אנחנו עוברים באזור דור ונחשולים. על החוף נמצאת דור, עיר נמל קדומה, ובנחשולים שוכן מוזיאון המזגגה. הברון רוטשילד הקים כאן ב־1891 מפעל לבקבוקי יין. מי ניהל אותו? מאיר דיזנגוף, שלימים היה ראש העיר הראשון של תל אביב! המפעל לא הצליח לאורך זמן, אבל הבניין הפך למוזיאון לארכאולוגיה ימית. האתר נמצא באזור, לא מול החלון.$mdl$, $mdl$$mdl$, $mdl$דור/נחשולים — נושא אזורי, לא להבטיח שהתל נראה · שעת צילום (משוערת): 11:07$mdl$, $mdl$$mdl$, $mdl$[{"title":"parks.org.il","url":"https://www.parks.org.il/reserve-park/teldor/"},{"title":"shimur.org","url":"https://shimur.org/mpps/%D7%90%D7%AA%D7%A8%D7%99%D7%9D-%D7%94%D7%9E%D7%92%D7%96%D7%99%D7%9F-%D7%92%D7%99%D7%9C%D7%99%D7%95%D7%9F-10-%D7%93%D7%A6%D7%9E%D7%91%D7%A8-2020/"},{"title":"carmelim.org.il","url":"https://carmelim.org.il/product/%D7%9E%D7%95%D7%96%D7%99%D7%90%D7%95%D7%9F-%D7%94%D7%9E%D7%96%D7%92%D7%92%D7%94-%D7%91%D7%A7%D7%99%D7%91%D7%95%D7%A5-%D7%A0%D7%97%D7%A9%D7%95%D7%9C%D7%99%D7%9D/"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$nearby$mdl$, $mdl${"fr":{"text":"Pourquoi la ville antique de Dor était-elle connue ?","options":["Son port et son commerce","Une mine de cuivre dans le désert","Son rôle de capitale assyrienne","Une station de ski"],"explanation":"Dor était un important port antique du littoral du Carmel.","category":"Archéologie"},"en":{"text":"What was ancient Dor best known for?","options":["Its harbour and trade","A desert copper mine","Being the Assyrian capital","Skiing"],"explanation":"Dor was an important ancient port on the Carmel coast.","category":"Archaeology"},"ru":{"text":"Чем была известна древняя Дор?","options":["Морским портом и торговлей","Медной шахтой в пустыне","Статусом столицы Ассирии","Горнолыжным курортом"],"explanation":"Дор была важным древним портом на побережье Кармеля.","category":"Археология"}}$mdl$::jsonb, $mdl${"he":{"script":"אנחנו עוברים באזור דור ונחשולים. על החוף נמצאת דור, עיר נמל קדומה, ובנחשולים שוכן מוזיאון המזגגה. הברון רוטשילד הקים כאן ב־1891 מפעל לבקבוקי יין. מי ניהל אותו? מאיר דיזנגוף, שלימים היה ראש העיר הראשון של תל אביב! המפעל לא הצליח לאורך זמן, אבל הבניין הפך למוזיאון לארכאולוגיה ימית. האתר נמצא באזור, לא מול החלון.","caution":""},"fr":{"script":"Nous longeons le secteur de Dor, ancien port méditerranéen. À Nahsholim se trouve aussi le musée de la verrerie. En 1891, Rothschild y fit ouvrir une fabrique de bouteilles pour le vin, dirigée par Meir Dizengoff, futur premier maire de Tel-Aviv ! L’usine a fermé après quelques années; son bâtiment est devenu un musée. Le lieu n’est pas forcément visible de la route.","caution":""},"en":{"script":"We are passing the area of Dor, an ancient Mediterranean port. Nahsholim also has a historic glassworks museum. In 1891 Rothschild established a wine-bottle factory here; its manager was Meir Dizengoff, who later became Tel Aviv’s first mayor! The short-lived factory building is now a museum. It is not necessarily visible from the road.","caution":""},"ru":{"script":"Мы проезжаем район древнего порта Дор. В Нахшолим находится музей старинной стекольной фабрики. В 1891 году Ротшильд открыл здесь производство винных бутылок, а руководил им Меир Дизенгоф — будущий первый мэр Тель-Авива! Завод скоро закрылся, а здание стало музеем. Сам музей с дороги может быть не виден.","caution":""}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-07","photos":["13.jpg","14.jpg"],"photoOrders":[13,14],"sourcePhotos":["1000472059.jpg","1000472061.jpg"],"routeMarkerTime":"11:07:23","photoLocalTime":"11:07","timeIsIndicative":true,"side":"nearby_not_visible","sideNote":"à confirmer (aller principalement côté droit)","confidence":"high","sectorFr":"Secteur Dor/Nahsholim à proximité de la route 2","triggerHe":"דור/נחשולים — נושא אזורי, לא להבטיח שהתל נראה","topic":"Ancient Dor harbour","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-08$mdl$, 'V2', $mdl$MAIN$mdl$, 'mcq', $mdl$לאיזו תקופה מתוארכת הקמתו המקורית המשוערת של מבצר כפרלט בהבונים?$mdl$, $mdl$["התקופה הרומית","התקופה המוסלמית הקדומה, כנראה המאות 8–9","המנדט הבריטי","התקופה החשמונאית"]$mdl$::jsonb, 1, $mdl$לפי המחקר, ראשית מבצר כפרלט כנראה בתקופה המוסלמית הקדומה.$mdl$, $mdl$היסטוריה$mdl$, 2, 45, 3, $mdl$ממערב לכביש נמצא מבצר כפרלט, המכונה גם מבצר הבונים. דווקא כאן יש הפתעה: אף שהצלבנים השתמשו במבצר, הקמתו המקורית מיוחסת בדרך כלל לתקופה המוסלמית הקדומה. המגדלים העגולים שלו מסייעים לחוקרים לזהות את סגנון הבנייה.$mdl$, $mdl$$mdl$, $mdl$מבצר כפרלט — מגדל מצולם; זיהוי פרטני לבדיקה · שעת צילום (משוערת): 11:10$mdl$, $mdl$$mdl$, $mdl$[{"title":"makom.hamoreshet.org.il","url":"https://makom.hamoreshet.org.il/landmark/kafrelt-fortress-habonim/"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$check$mdl$, $mdl${"fr":{"text":"À quelle période attribue-t-on probablement l’origine de la forteresse de Kfarlet, à HaBonim ?","options":["Période romaine","Début de la période musulmane, probablement VIIIe–IXe siècles","Mandat britannique","Époque hasmonéenne"],"explanation":"Les chercheurs situent probablement sa construction initiale à l’époque musulmane ancienne.","category":"Histoire"},"en":{"text":"When was Kfarlet Fortress at HaBonim probably first built?","options":["Roman period","Early Muslim period, likely 8th–9th centuries","British Mandate","Hasmonean period"],"explanation":"Its original construction is generally attributed to the early Muslim period.","category":"History"},"ru":{"text":"К какому периоду, вероятно, относится первоначальная постройка крепости Кфарлет у Ха-Боним?","options":["Римский период","Ранний мусульманский период, вероятно VIII–IX века","Британский мандат","Эпоха Хасмонеев"],"explanation":"Первоначальную постройку крепости обычно относят к раннему мусульманскому периоду.","category":"История"}}$mdl$::jsonb, $mdl${"he":{"script":"ממערב לכביש נמצא מבצר כפרלט, המכונה גם מבצר הבונים. דווקא כאן יש הפתעה: אף שהצלבנים השתמשו במבצר, הקמתו המקורית מיוחסת בדרך כלל לתקופה המוסלמית הקדומה. המגדלים העגולים שלו מסייעים לחוקרים לזהות את סגנון הבנייה.","caution":"לא לאשר זיהוי נקודתי או ראות מהכביש ללא בדיקת שטח."},"fr":{"script":"À HaBonim se trouvent les vestiges de la forteresse de Kfarlet. Surprise : même si les croisés l’ont utilisée, sa construction initiale est généralement attribuée aux VIIIe–IXe siècles, au début de la période musulmane. Les tours rondes sont un indice architectural important.","caution":"Ne pas affirmer une identification ou une visibilité précise sans vérification sur le terrain."},"en":{"script":"Near HaBonim stands Kfarlet Fortress. Here is the surprise: although the Crusaders later used the site, researchers generally date its first construction to the early Muslim period, probably the eighth or ninth century. Its round towers are an important clue.","caution":"Do not assert a precise identification or visibility without on-site confirmation."},"ru":{"script":"Рядом с Ха-Боним сохранилась крепость Кфарлет. Неожиданность в том, что крестоносцы лишь позднее использовали её: первоначальную постройку обычно относят к VIII–IX векам. Важная подсказка для историков — круглые башни.","caution":"Не утверждать точную идентификацию или видимость без проверки на месте."}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-08","photos":["18.jpg"],"photoOrders":[18],"sourcePhotos":["1000472069.jpg"],"routeMarkerTime":"11:10:20","photoLocalTime":"11:10","timeIsIndicative":true,"side":"left_from_route_notes","sideNote":"à confirmer (aller principalement côté droit)","confidence":"medium","sectorFr":"11:10 tour ronde à HaBonim; identification très probable mais photo à confirmer","triggerHe":"מבצר כפרלט — מגדל מצולם; זיהוי פרטני לבדיקה","topic":"Kfarlet origin","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-14$mdl$, 'V2', $mdl$MAIN$mdl$, 'mcq', $mdl$מי הובילה את החפירות הגדולות במערות הכרמל החל משנת 1929?$mdl$, $mdl$["קתלין קניון","דורותי גארוד","ג׳יין גודול","מרגרט מיד"]$mdl$::jsonb, 1, $mdl$דורותי גארוד הובילה את החפירות המרכזיות במערות בשנים 1929–1934.$mdl$, $mdl$ארכאולוגיה$mdl$, 2, 45, 4, $mdl$בתקופת המנדט הבריטי החלו חוקרים לבדוק לעומק את מערות הכרמל. דורותי גארוד הובילה כאן משלחות חפירה בשנים 1929 עד 1934. בזכות עבודתה נחשפו ממצאים שהפכו את האזור לאחד מאתרי המפתח בחקר האדם הקדמון.$mdl$, $mdl$$mdl$, $mdl$נחל מערות — אתר אזורי מימין, המערות לא נראות בהכרח · שעת צילום (משוערת): 11:13$mdl$, $mdl$$mdl$, $mdl$[{"title":"sites.harvard.edu","url":"https://sites.harvard.edu/aspr/2024/01/03/mount-carmel-excavations/"},{"title":"whc.unesco.org","url":"https://whc.unesco.org/en/list/1393"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$nearby$mdl$, $mdl${"fr":{"text":"Qui dirigea les grandes fouilles des grottes du Carmel à partir de 1929 ?","options":["Kathleen Kenyon","Dorothy Garrod","Jane Goodall","Margaret Mead"],"explanation":"Dorothy Garrod dirigea les fouilles majeures de 1929 à 1934.","category":"Archéologie"},"en":{"text":"Who led the major Carmel caves excavations starting in 1929?","options":["Kathleen Kenyon","Dorothy Garrod","Jane Goodall","Margaret Mead"],"explanation":"Dorothy Garrod led the major excavations between 1929 and 1934.","category":"Archaeology"},"ru":{"text":"Кто возглавлял крупные раскопки пещер Кармеля с 1929 года?","options":["Кэтлин Кеньон","Дороти Гаррод","Джейн Гудолл","Маргарет Мид"],"explanation":"Дороти Гаррод руководила основными раскопками в 1929–1934 годах.","category":"Археология"}}$mdl$::jsonb, $mdl${"he":{"script":"בתקופת המנדט הבריטי החלו חוקרים לבדוק לעומק את מערות הכרמל. דורותי גארוד הובילה כאן משלחות חפירה בשנים 1929 עד 1934. בזכות עבודתה נחשפו ממצאים שהפכו את האזור לאחד מאתרי המפתח בחקר האדם הקדמון.","caution":"לא לאשר זיהוי נקודתי או ראות מהכביש ללא בדיקת שטח."},"fr":{"script":"Sous le mandat britannique, des chercheurs ont commencé à fouiller systématiquement les grottes du Carmel. Dorothy Garrod a dirigé les grandes campagnes entre 1929 et 1934. Ses travaux ont fait de cette région un site majeur de la recherche sur la préhistoire humaine.","caution":"Ne pas affirmer une identification ou une visibilité précise sans vérification sur le terrain."},"en":{"script":"During the British Mandate, researchers began systematically studying the Carmel caves. Dorothy Garrod led major excavation seasons from 1929 to 1934. The discoveries helped make this area one of the key places for understanding early human history.","caution":"Do not assert a precise identification or visibility without on-site confirmation."},"ru":{"script":"Во времена британского мандата начались систематические исследования пещер Кармеля. Дороти Гаррод руководила крупными раскопками с 1929 по 1934 год. Находки сделали этот район одним из ключевых мест изучения древней истории человека.","caution":"Не утверждать точную идентификацию или видимость без проверки на месте."}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-14","photos":["22.jpg"],"photoOrders":[22],"sourcePhotos":["1000472077.jpg"],"routeMarkerTime":"11:13:29","photoLocalTime":"11:13","timeIsIndicative":true,"side":"nearby_not_visible","sideNote":"à confirmer (aller principalement côté droit)","confidence":"high","sectorFr":"11:13 Nahal Me’arot, question de niveau avancé","triggerHe":"נחל מערות — אתר אזורי מימין, המערות לא נראות בהכרח","topic":"Dorothy Garrod","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-16$mdl$, 'V2', $mdl$MAIN$mdl$, 'mcq', $mdl$למה שימש מחנה המעפילים בעתלית בתקופת המנדט הבריטי?$mdl$, $mdl$["מחנה צבאי רומי","מחנה מעצר למעפילים","מפעל מלח","נמל מסחרי"]$mdl$::jsonb, 1, $mdl$הבריטים החזיקו במחנה מעפילים שנכנסו לארץ ללא אישור השלטונות.$mdl$, $mdl$היסטוריה$mdl$, 2, 45, 5, $mdl$אתם יכולים לראות שלט למחנה המעפילים בעתלית. בתקופת המנדט הבריטי נכלאו כאן יהודים שהגיעו לארץ בדרך של העפלה, בניגוד להגבלות העלייה שהטילו הבריטים. כיום המקום הוא אתר מורשת שמספר את סיפורם של המעפילים.$mdl$, $mdl$$mdl$, $mdl$שלט מחנה המעפילים על שם משה סנה, עתלית · שעת צילום (משוערת): 11:16$mdl$, $mdl$$mdl$, $mdl$[{"title":"shimur.org","url":"https://shimur.org/sites/atlit-detention-camp/?lang=en"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$check$mdl$, $mdl${"fr":{"text":"À quoi servait le camp d’Atlit sous le mandat britannique ?","options":["À loger une légion romaine","À détenir des immigrants juifs arrivés clandestinement","À produire du sel","De port commercial"],"explanation":"Les Britanniques y détenaient des immigrants entrés sans autorisation.","category":"Histoire"},"en":{"text":"What was the Atlit camp used for under the British Mandate?","options":["Housing Roman soldiers","Detaining unauthorized Jewish immigrants","Producing salt","Operating a commercial port"],"explanation":"The British detained Jewish immigrants who arrived without official authorization.","category":"History"},"ru":{"text":"Для чего использовался лагерь Атлит во время британского мандата?","options":["Для римских легионеров","Для содержания еврейских нелегальных иммигрантов","Для производства соли","Как торговый порт"],"explanation":"Британские власти содержали там евреев, прибывших без разрешения.","category":"История"}}$mdl$::jsonb, $mdl${"he":{"script":"אתם יכולים לראות שלט למחנה המעפילים בעתלית. בתקופת המנדט הבריטי נכלאו כאן יהודים שהגיעו לארץ בדרך של העפלה, בניגוד להגבלות העלייה שהטילו הבריטים. כיום המקום הוא אתר מורשת שמספר את סיפורם של המעפילים.","caution":""},"fr":{"script":"Le panneau indique le camp des immigrants clandestins d’Atlit. Sous le mandat britannique, des Juifs arrivant malgré les restrictions de l’immigration étaient détenus ici. Aujourd’hui, le site est un lieu de mémoire consacré à leur histoire et à celle de l’Aliyah Bet.","caution":""},"en":{"script":"The sign points to the Atlit detention camp. During the British Mandate, Jews arriving despite immigration restrictions could be held there. Today the site is a heritage museum telling the story of those immigrants and the Aliyah Bet movement.","caution":""},"ru":{"script":"На указателе обозначен лагерь Атлит. Во времена британского мандата здесь удерживали евреев, прибывавших вопреки иммиграционным ограничениям. Сегодня это исторический музей, посвящённый их судьбам и движению «Алия Бет».","caution":""}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-16","photos":["25.jpg"],"photoOrders":[25],"sourcePhotos":["1000472083.jpg"],"routeMarkerTime":"11:16:13","photoLocalTime":"11:16","timeIsIndicative":true,"side":"right_probable","sideNote":"à confirmer (aller principalement côté droit)","confidence":"high","sectorFr":"11:16 panneau brun visible depuis la route","triggerHe":"שלט מחנה המעפילים על שם משה סנה, עתלית","topic":"Atlit detention camp","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-20$mdl$, 'V2', $mdl$MAIN$mdl$, 'mcq', $mdl$איזה רכס מתרומם מאחורי הבניינים באזור טירת כרמל?$mdl$, $mdl$["החרמון","רכס הכרמל","הרי אילת","הר הגלבוע"]$mdl$::jsonb, 1, $mdl$הבניינים נראים למרגלות רכס הכרמל.$mdl$, $mdl$גאוגרפיה$mdl$, 2, 45, 6, $mdl$אנחנו מתקרבים למרחב העירוני של טירת כרמל וחיפה. מאחורי הבניינים מתרומם רכס הכרמל, והפער בין אזור החוף למורדות ההר בולט מאוד. הטופוגרפיה הזאת השפיעה על מיקום השכונות, הכבישים והשטחים הפתוחים.$mdl$, $mdl$$mdl$, $mdl$בניינים מול מורדות הכרמל, לקראת טירת כרמל/חיפה · שעת צילום (משוערת): 11:19$mdl$, $mdl$$mdl$, $mdl$[{"title":"docs.google.com","url":"https://docs.google.com/document/d/1pYeoQ39mjYQKREK59NG1uhSuUW_Zvs79/edit"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$check$mdl$, $mdl${"fr":{"text":"Quel massif s’élève derrière les immeubles du secteur de Tirat Carmel ?","options":["Le mont Hermon","Le massif du Carmel","Les montagnes d’Eilat","Le mont Gilboa"],"explanation":"Les immeubles se trouvent au pied du Carmel.","category":"Géographie"},"en":{"text":"Which mountain range rises behind the buildings near Tirat Carmel?","options":["Mount Hermon","The Carmel range","The Eilat Mountains","Mount Gilboa"],"explanation":"The buildings stand at the foot of the Carmel range.","category":"Geography"},"ru":{"text":"Какие горы поднимаются за домами в районе Тират-Кармель?","options":["Хермон","Горы Кармель","Горы Эйлата","Гильбоа"],"explanation":"Дома расположены у подножия гор Кармель.","category":"География"}}$mdl$::jsonb, $mdl${"he":{"script":"אנחנו מתקרבים למרחב העירוני של טירת כרמל וחיפה. מאחורי הבניינים מתרומם רכס הכרמל, והפער בין אזור החוף למורדות ההר בולט מאוד. הטופוגרפיה הזאת השפיעה על מיקום השכונות, הכבישים והשטחים הפתוחים.","caution":""},"fr":{"script":"Nous approchons du secteur urbain de Tirat Carmel et de Haïfa. Derrière les immeubles se dressent les pentes du Carmel. Ce contraste entre la bande côtière et la montagne explique une grande partie de l’organisation des quartiers, des routes et des espaces naturels.","caution":""},"en":{"script":"We are approaching the urban area of Tirat Carmel and Haifa. Behind the buildings rise the Carmel slopes. The contrast between the coastal strip and the mountains has shaped the location of neighbourhoods, roads and green spaces.","caution":""},"ru":{"script":"Мы приближаемся к городской зоне Тират-Кармель и Хайфы. За многоэтажными домами поднимаются склоны Кармеля. Контраст между узкой прибрежной полосой и горами определил размещение кварталов, дорог и зелёных зон.","caution":""}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-20","photos":["32.jpg"],"photoOrders":[32],"sourcePhotos":["1000472097.jpg"],"routeMarkerTime":"11:19:38","photoLocalTime":"11:19","timeIsIndicative":true,"side":"right_probable","sideNote":"à confirmer (aller principalement côté droit)","confidence":"high","sectorFr":"11:19 dernier cliché près Tirat Carmel","triggerHe":"בניינים מול מורדות הכרמל, לקראת טירת כרמל/חיפה","topic":"Urban Carmel","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-15$mdl$, 'V2', $mdl$SPARE$mdl$, 'mcq', $mdl$איזה גידול נראה מתחת לרשתות באזור חוף הכרמל?$mdl$, $mdl$["תפוחים","בננות","קפה","אורז"]$mdl$::jsonb, 1, $mdl$במישור חוף הכרמל מגדלים בננות, לעיתים בתוך בתי רשת.$mdl$, $mdl$חקלאות$mdl$, 2, 45, 7, $mdl$שימו לב לעלים הרחבים שמתחת לרשתות: אלה מטעי בננות. חוף הכרמל הוא אזור גידול מוכר של הפרי הזה. בתי הרשת משמשים לחקלאות מוגנת ועוזרים למגדלים להתמודד עם תנאי הסביבה ולשמור על היבול.$mdl$, $mdl$$mdl$, $mdl$בננות תחת רשת — חלופה אם דילגת על נחל מערות · שעת צילום (משוערת): 11:14$mdl$, $mdl$$mdl$, $mdl$[{"title":"docs.google.com","url":"https://docs.google.com/document/d/1CyzgobiGT9vaCNIrvObS8uGKD6zknNvD/edit"},{"title":"gov.il","url":"https://www.gov.il/he/pages/calculation-878"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$check$mdl$, $mdl${"fr":{"text":"Quelle culture voit-on sous les filets dans le secteur du Carmel ?","options":["Pommes","Bananes","Café","Riz"],"explanation":"La côte du Carmel possède des bananeraies cultivées sous filets.","category":"Agriculture"},"en":{"text":"Which crop grows under these nets on the Carmel coast?","options":["Apples","Bananas","Coffee","Rice"],"explanation":"Bananas are commonly grown under protective netting on the Carmel coast.","category":"Agriculture"},"ru":{"text":"Какая культура растёт под сетками на побережье Кармеля?","options":["Яблоки","Бананы","Кофе","Рис"],"explanation":"На побережье Кармеля выращивают бананы, часто под защитной сеткой.","category":"Сельское хозяйство"}}$mdl$::jsonb, $mdl${"he":{"script":"שימו לב לעלים הרחבים שמתחת לרשתות: אלה מטעי בננות. חוף הכרמל הוא אזור גידול מוכר של הפרי הזה. בתי הרשת משמשים לחקלאות מוגנת ועוזרים למגדלים להתמודד עם תנאי הסביבה ולשמור על היבול.","caution":""},"fr":{"script":"Regardez les grandes feuilles sous les filets : ce sont des bananiers. La côte du Carmel est une région bien connue pour cette production. Les filets participent à la protection des cultures face aux conditions extérieures et aident les agriculteurs à préserver leur récolte.","caution":""},"en":{"script":"Look at the broad leaves under the nets: those are banana plants. The Carmel coast is known for this crop. Protective net houses help growers manage environmental conditions and reduce some of the risks facing their harvest.","caution":""},"ru":{"script":"Посмотрите на большие листья под сетками: это банановые плантации. Прибрежная полоса Кармеля известна выращиванием бананов. Защитные сетки помогают регулировать воздействие внешних условий и сохранять урожай.","caution":""}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-15","photos":["23.jpg"],"photoOrders":[23],"sourcePhotos":["1000472079.jpg"],"routeMarkerTime":"11:14:31","photoLocalTime":"11:14","timeIsIndicative":true,"side":"right_from_route_notes","sideNote":"à confirmer (aller principalement côté droit)","confidence":"high","sectorFr":"11:14 photo de bananiers sous filets","triggerHe":"בננות תחת רשת — חלופה אם דילגת על נחל מערות","topic":"Banana netting","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb),
($mdl$v2:PHOTO-OUT-18$mdl$, 'V2', $mdl$SPARE$mdl$, 'mcq', $mdl$איזה סוג תשתית חוצה את כביש החוף על הגשר המצולם?$mdl$, $mdl$["אמת מים רומית","מסילת רכבת","מסלול סקי","מנהרת רכבת תת־ימית"]$mdl$::jsonb, 1, $mdl$בתמונה נראית רכבת על גשר מעל הכביש.$mdl$, $mdl$תחבורה$mdl$, 2, 45, 8, $mdl$מעלינו עוברת רכבת על גשר. הרכבת והכביש הם חלק מאותה מערכת תחבורה שמחברת את ערי החוף. כדי לשמור על זרימת התנועה ועל הבטיחות, מסילות וכבישים מצטלבים לעיתים במפלסים נפרדים.$mdl$, $mdl$$mdl$, $mdl$רכבת על גשר — חלופה אם דילגת על מחנה המעפילים · שעת צילום (משוערת): 11:17$mdl$, $mdl$$mdl$, $mdl$[{"title":"en.wikipedia.org","url":"https://en.wikipedia.org/wiki/Coastal_railway_line,_Israel"}]$mdl$::jsonb, $mdl$$mdl$, $mdl$check$mdl$, $mdl${"fr":{"text":"Quel type d’infrastructure franchit la route sur ce pont ?","options":["Un aqueduc romain","Une voie ferrée","Une piste de ski","Un tunnel ferroviaire sous-marin"],"explanation":"La photo montre un train traversant un pont au-dessus de la route.","category":"Transports"},"en":{"text":"What kind of infrastructure crosses above the highway here?","options":["A Roman aqueduct","A railway","A ski slope","An underwater rail tunnel"],"explanation":"The photograph shows a train crossing a bridge over the road.","category":"Transport"},"ru":{"text":"Какая инфраструктура проходит над шоссе по этому мосту?","options":["Римский акведук","Железная дорога","Лыжная трасса","Подводный железнодорожный тоннель"],"explanation":"На фотографии поезд идёт по мосту над автодорогой.","category":"Транспорт"}}$mdl$::jsonb, $mdl${"he":{"script":"מעלינו עוברת רכבת על גשר. הרכבת והכביש הם חלק מאותה מערכת תחבורה שמחברת את ערי החוף. כדי לשמור על זרימת התנועה ועל הבטיחות, מסילות וכבישים מצטלבים לעיתים במפלסים נפרדים.","caution":""},"fr":{"script":"Au-dessus de la chaussée passe un train. La voie ferrée et l’autoroute appartiennent au même grand corridor de transport du littoral. Les faire passer à des niveaux différents permet d’éviter les passages à niveau et de fluidifier les déplacements.","caution":""},"en":{"script":"A passenger train is crossing above the road. The railway and highway form part of the same coastal transport corridor. Separating their crossing onto different levels helps avoid road–rail conflicts and keeps traffic moving.","caution":""},"ru":{"script":"Над шоссе проходит пассажирский поезд. Железная дорога и трасса образуют единый прибрежный транспортный коридор. Разделение потоков по высоте помогает избежать опасных пересечений и ускоряет движение.","caution":""}}$mdl$::jsonb, $mdl${"dataset":"PHOTO_ALLER_V2_2026_10_21","sourceId":"PHOTO-OUT-18","photos":["27.jpg"],"photoOrders":[27],"sourcePhotos":["1000472087.jpg"],"routeMarkerTime":"11:17:20","photoLocalTime":"11:17","timeIsIndicative":true,"side":"side_uncertain","sideNote":"à confirmer (aller principalement côté droit)","confidence":"high","sectorFr":"11:17 train rouge sur pont, près Atlit/Megadim","triggerHe":"רכבת על גשר — חלופה אם דילגת על מחנה המעפילים","topic":"Red coastal passenger train","answerTimeSec":45,"minAnswerTimeSec":30}$mdl$::jsonb)
on conflict (ext_key) do update set
  bank = excluded.bank, selection = excluded.selection, kind = excluded.kind, text = excluded.text,
  options = excluded.options, correct_index = excluded.correct_index, explanation = excluded.explanation,
  category = excluded.category, difficulty = excluded.difficulty, time_limit_sec = excluded.time_limit_sec,
  sort_order = excluded.sort_order, guide_short = excluded.guide_short, guide_long = excluded.guide_long,
  guide_location = excluded.guide_location, guide_practical = excluded.guide_practical,
  guide_sources = excluded.guide_sources, guide_fact = excluded.guide_fact, guide_visibility = excluded.guide_visibility,
  i18n = excluded.i18n, guide_i18n = excluded.guide_i18n, route_meta = excluded.route_meta,
  is_demo = false, updated_at = clock_timestamp();

insert into mdl.route_photos (collection, ord, file, source_file, taken_at, subject, side, confidence, anecdote, question_keys)
values
($mdl$ALLER_V2$mdl$, 1, $mdl$01.jpg$mdl$, $mdl$1000472035.jpg$mdl$, $mdl$11:04:19$mdl$, $mdl$Déblai rocheux stratifié$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"כשסוללים כביש דרך גבעה, חותכים בסלע ונחשפות שכבות שבדרך כלל מסתתרות מתחת לצמחייה. ממש חלון קטן להיסטוריה הגאולוגית.","fr":"Une tranchée routière révèle des couches normalement cachées sous la végétation : un petit livre ouvert sur le passé géologique.","en":"A road cutting exposes layers usually hidden by vegetation: a small open book of geological history.","ru":"Дорожная выемка обнажает слои, обычно скрытые растительностью: словно открытая книга геологической истории."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-01$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 2, $mdl$02.jpg$mdl$, $mdl$1000472037.jpg$mdl$, $mdl$11:04:43$mdl$, $mdl$Pont routier et coupe rocheuse$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"גשר מאפשר להעביר דרך מעל מעבר קיים. לצדו רואים איך המהנדסים חתכו את הגבעה כדי לשמור על תוואי הכביש.","fr":"Le pont franchit un passage existant, tandis que la colline voisine a été entaillée pour tracer la route.","en":"The bridge spans an existing passage, while the adjacent hill was cut to make room for the road.","ru":"Мост пересекает существующий проход, а соседний холм срезали ради строительства дороги."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 3, $mdl$03.jpg$mdl$, $mdl$1000472039.jpg$mdl$, $mdl$11:04:47$mdl$, $mdl$Végétation et route au pied des hauteurs$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"במישור החוף גידולים ודרכים נדחקים לשטח שבין הים להרים. כאן רואים את המפגש בין תשתיות, צומח וטופוגרפיה.","fr":"Sur la plaine littorale, cultures et routes se partagent l’espace entre mer et montagne.","en":"On this coastal plain, roads and farmland share the narrow space between sea and hills.","ru":"На прибрежной равнине дороги и поля делят пространство между морем и холмами."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 4, $mdl$04.jpg$mdl$, $mdl$1000472041.jpg$mdl$, $mdl$11:05:12$mdl$, $mdl$Petite construction de pierre, bâtiment non identifié$mdl$, $mdl$right_probable$mdl$, $mdl$low$mdl$, $mdl${"he":"מבנה האבן שבתמונה מסקרן, אבל בלי זיהוי מדויק אי אפשר לקבוע את גילו או תפקידו. זו גם מיומנות של מורה דרך: לדעת לומר מה לא ידוע.","fr":"Ce bâtiment en pierre intrigue, mais sans identification précise, impossible d’affirmer son âge ou son usage : un guide doit aussi reconnaître l’incertitude.","en":"This stone building is intriguing, but its age and function cannot be asserted without identification. Good guides acknowledge uncertainty.","ru":"Каменное здание любопытно, но без точной идентификации нельзя утверждать его возраст или назначение."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 5, $mdl$05.jpg$mdl$, $mdl$1000472043.jpg$mdl$, $mdl$11:05:19$mdl$, $mdl$Plaine agricole et relief du Carmel$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"מישור חוף הכרמל נמצא בין הים להר. זה מסביר למה כבישים, מסילות ושטחי חקלאות מתרכזים דווקא במסדרון הזה.","fr":"Entre la mer et le Carmel, une bande relativement étroite accueille agriculture, routes et voies ferrées.","en":"Between the sea and Mount Carmel, a relatively narrow strip carries farmland, roads and railway lines.","ru":"Между морем и Кармелем проходит сравнительно узкая полоса с полями, дорогами и железной дорогой."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 6, $mdl$06.jpg$mdl$, $mdl$1000472045.jpg$mdl$, $mdl$11:05:32$mdl$, $mdl$Ligne ferroviaire visible$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"הכביש והרכבת מלווים זה את זה במישור החוף. כשאין הרבה שטח מישורי בין ההר לים, רשתות התחבורה נפגשות באותו מסדרון.","fr":"La route et le rail suivent souvent le même couloir côtier, faute d’espace plat entre la montagne et la mer.","en":"Road and rail often share the coastal corridor because flat land between mountain and sea is limited.","ru":"Автодорога и железная дорога часто идут по одному прибрежному коридору: ровной земли здесь мало."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 7, $mdl$07.jpg$mdl$, $mdl$1000472047.jpg$mdl$, $mdl$11:05:56$mdl$, $mdl$Champs et collines$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"שינוי קטן בגובה הקרקע משנה את הנוף: בשטח המישורי קל יותר לעבד שדות, ובמדרון נשארים לעיתים שיחים וחורש.","fr":"Quelques mètres de relief changent le paysage : les champs occupent les surfaces planes, les buissons restent sur les pentes.","en":"Even modest changes in elevation matter: fields favour flat ground, while scrub often covers slopes.","ru":"Даже небольшой перепад высот важен: поля занимают равнину, а склоны часто покрыты кустарником."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 8, $mdl$08.jpg$mdl$, $mdl$1000472049.jpg$mdl$, $mdl$11:06:27$mdl$, $mdl$Panneaux sombres sur toiture ou structure$mdl$, $mdl$uncertain$mdl$, $mdl$medium$mdl$, $mdl${"he":"על גג המבנה נראים לוחות כהים שעשויים להיות סולאריים. כדי לזהות אותם בוודאות צריך מבט קרוב יותר; אור שמש אפשר להמיר לחשמל בתאים פוטו־וולטאיים.","fr":"Les panneaux sombres pourraient être photovoltaïques, sans certitude sur cette photo. Ces cellules convertissent la lumière en électricité.","en":"The dark panels may be photovoltaic, though the photo is inconclusive. Such cells convert sunlight into electricity.","ru":"Тёмные панели могут быть солнечными, но по снимку это не доказано. Фотоэлементы превращают солнечный свет в электричество."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 9, $mdl$09.jpg$mdl$, $mdl$1000472051.jpg$mdl$, $mdl$11:06:38$mdl$, $mdl$Long bâtiment à toit clair$mdl$, $mdl$uncertain$mdl$, $mdl$low$mdl$, $mdl${"he":"הגג הארוך בולט למרחוק, אך איננו יודעים מה מתרחש במבנה. עדיף להסביר איך מבנים גדולים משנים את הנוף מאשר להמציא לו שימוש.","fr":"Le long toit attire l’œil, mais la fonction du bâtiment n’est pas établie : mieux vaut observer que deviner.","en":"The long roof stands out, but the building’s purpose has not been established: observe rather than guess.","ru":"Длинная крыша заметна издалека, но назначение здания не установлено. Лучше наблюдать, чем гадать."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 10, $mdl$10.jpg$mdl$, $mdl$1000472053.jpg$mdl$, $mdl$11:06:57$mdl$, $mdl$Paysage agricole, drapeau au loin$mdl$, $mdl$uncertain$mdl$, $mdl$low$mdl$, $mdl${"he":"מטעים, שדות ומבנים קטנים מציינים את העבודה החקלאית באזור. דגל שרואים מרחוק לא מספיק כדי לזהות מוסד או אתר.","fr":"Les plantations dessinent le paysage agricole. Un drapeau vu de loin ne permet pas d’identifier précisément le bâtiment voisin.","en":"Plantations shape the rural scenery. A distant flag is not enough to identify a nearby facility.","ru":"Плантации формируют сельский ландшафт. По далёкому флагу нельзя достоверно определить назначение объекта."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 11, $mdl$11.jpg$mdl$, $mdl$1000472055.jpg$mdl$, $mdl$11:07:05$mdl$, $mdl$Ouvrage en béton inachevé ou utilitaire, non identifié$mdl$, $mdl$uncertain$mdl$, $mdl$low$mdl$, $mdl${"he":"את מבנה הבטון אי אפשר לזהות בוודאות מהחלון. אבל הוא מזכיר לנו שכל בנייה משנה את הניקוז ואת השימוש בקרקע.","fr":"Le béton photographié n’est pas identifié. Il rappelle néanmoins que chaque construction modifie le paysage et l’écoulement des eaux.","en":"This concrete structure is unidentified. It still illustrates how construction changes land use and drainage.","ru":"Бетонное сооружение не опознано. Но оно напоминает, как строительство меняет землю и сток воды."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 12, $mdl$12.jpg$mdl$, $mdl$1000472057.jpg$mdl$, $mdl$11:07:12$mdl$, $mdl$Inscription peinte sur une structure lointaine$mdl$, $mdl$uncertain$mdl$, $mdl$low$mdl$, $mdl${"he":"הכיתוב שעל המבנה אינו ברור דיו לזיהוי. בדרך אפשר להשתמש בו כדי לשאול איך נבדיל בין שם מקום, פרסומת וגרפיטי.","fr":"L’inscription est trop lointaine pour être identifiée. Elle peut servir à distinguer nom de lieu, publicité et graffiti.","en":"The writing is too distant to identify reliably. It invites a question about place names, advertising and graffiti.","ru":"Надпись слишком далека для уверенного чтения. Это повод отличить название места от рекламы и граффити."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 13, $mdl$13.jpg$mdl$, $mdl$1000472059.jpg$mdl$, $mdl$11:07:23$mdl$, $mdl$Maison ancienne près de Dor/Nahsholim, non identifiée$mdl$, $mdl$uncertain$mdl$, $mdl$low$mdl$, $mdl${"he":"אנחנו נוסעים באזור דור, עיר נמל עתיקה. יש בו גם מבנים ישנים, אבל הבית שבתמונה לא זוהה ואין לייחס לו סיפור מסוים ללא מקור.","fr":"On traverse le secteur de Dor, ancien port méditerranéen. Mais cette maison précise n’est pas identifiée.","en":"We are passing the Dor area, once an ancient Mediterranean port, but this particular house remains unidentified.","ru":"Мы проезжаем район Дора, древнего средиземноморского порта, но конкретный дом не опознан."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-07$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 14, $mdl$14.jpg$mdl$, $mdl$1000472061.jpg$mdl$, $mdl$11:07:52$mdl$, $mdl$Ridge de kurkar près de Nahsholim$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"רכסי הכורכר הם דיונות חול קדומות שהתלכדו עם חומר גירי. לכן מוצאים בהם לעיתים שכבות נטויות כמו בדיונה פעילה.","fr":"Les cordons de kurkar sont d’anciennes dunes cimentées par le calcaire ; leurs couches peuvent encore révéler l’action du vent.","en":"Kurkar ridges are ancient dunes cemented by lime; their bedding can preserve traces of wind action.","ru":"Гряды куркара — древние дюны, сцементированные известковым веществом; слои хранят следы ветра."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-07$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 15, $mdl$15.jpg$mdl$, $mdl$1000472063.jpg$mdl$, $mdl$11:08:03$mdl$, $mdl$Grande coupe stratifiée, secteur Dor$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"הפסים במצוק מזכירים שכבות של עוגה. בגאולוגיה קוראים את סדר השכבות כדי לשחזר אירועים קדומים, בלי לקבוע גיל לפי צבע בלבד.","fr":"La paroi ressemble à un gâteau de couches successives : leur ordre renseigne sur le passé, pas leur couleur à elle seule.","en":"The cliff resembles a layered cake: the order of layers tells a story, while colour alone cannot date them.","ru":"Обрыв похож на слоёный пирог: порядок слоёв важен, но по одному цвету их возраст не определяют."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 16, $mdl$16.jpg$mdl$, $mdl$1000472065.jpg$mdl$, $mdl$11:09:07$mdl$, $mdl$Découpe rocheuse et sculpture ou silhouette distante non identifiée$mdl$, $mdl$right_probable$mdl$, $mdl$low$mdl$, $mdl${"he":"על הגבעה מופיע פסל או סימן בולט שלא זוהה בוודאות. עובדה שכן רואים: הכביש חושף כאן מצוקי כורכר גבוהים.","fr":"Une silhouette se détache sur la butte, sans identification fiable. En revanche, la haute coupe rocheuse est bien visible.","en":"A silhouette stands on the hill but cannot be reliably identified; the tall roadside rock cut is unmistakable.","ru":"На холме виден силуэт неизвестного объекта. Зато высокий скальный откос у дороги очевиден."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 17, $mdl$17.jpg$mdl$, $mdl$1000472067.jpg$mdl$, $mdl$11:10:16$mdl$, $mdl$Bananeraies/cultures sous filets dans le secteur HaBonim$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"בתי רשת בחוף הכרמל עוזרים להגן על גידולים מפני תנאי סביבה. מהכביש רואים רק את המבנה החיצוני, לא תמיד את הגידול שבתוכו.","fr":"Les filets agricoles protègent les cultures ; depuis la route, on distingue parfois leur couverture mieux que les plantes.","en":"Agricultural nets protect crops; from the road their roofs can be easier to see than the plants beneath.","ru":"Сельскохозяйственные сетки защищают посевы; с дороги покрытие иногда видно лучше самих растений."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 18, $mdl$18.jpg$mdl$, $mdl$1000472069.jpg$mdl$, $mdl$11:10:20$mdl$, $mdl$Tour ronde en pierre vers HaBonim, possible Kfarlet$mdl$, $mdl$left_from_route_notes$mdl$, $mdl$medium$mdl$, $mdl${"he":"המגדל העגול נראה כמו חלק מביצור קדום. באזור הבונים נמצאים שרידי מבצר כפרלט, שנעשה בו שימוש בתקופות שונות; הזיהוי המדויק של המגדל בצילום עוד דורש אימות.","fr":"Cette tour ronde évoque une fortification. Les ruines de Kfarlet se trouvent dans ce secteur, mais l’identification exacte de la tour reste à confirmer.","en":"The round tower suggests a fortification. Kfarlet ruins are nearby, but the exact identification of this photographed tower needs confirmation.","ru":"Круглая башня напоминает укрепление. Рядом находятся руины Кфарлет, однако принадлежность именно этой башни ещё надо проверить."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-08$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 19, $mdl$19.jpg$mdl$, $mdl$1000472071.jpg$mdl$, $mdl$11:10:43$mdl$, $mdl$Rangées d’arbres cultivés$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"כשעצים נטועים בשורות ישרות, זה בדרך כלל סימן למטע חקלאי ולא לחורש טבעי. גם הנוף יודע לספר על עבודת האדם.","fr":"Des arbres alignés en rangées régulières signalent généralement un verger cultivé, plutôt qu’une forêt naturelle.","en":"Trees arranged in regular rows usually indicate a cultivated orchard rather than natural woodland.","ru":"Деревья ровными рядами обычно говорят о саде, посаженном человеком, а не о естественном лесе."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 20, $mdl$20.jpg$mdl$, $mdl$1000472073.jpg$mdl$, $mdl$11:10:54$mdl$, $mdl$Tuyaux et irrigation près des cultures$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"הצינורות מזכירים שהחקלאות כאן תלויה בהובלה מדויקת של מים לשדות. חלק מהמים זורמים לצמחים בצינורות במקום בערוצים פתוחים.","fr":"Les tuyaux montrent combien l’irrigation compte : acheminer l’eau directement aux cultures évite de dépendre uniquement de la pluie.","en":"The pipes show how much irrigation matters: water can be delivered directly to crops rather than left to rainfall alone.","ru":"Трубы показывают значение орошения: воду подают к культурам, не полагаясь только на дождь."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 21, $mdl$21.jpg$mdl$, $mdl$1000472075.jpg$mdl$, $mdl$11:12:00$mdl$, $mdl$Petite tour cylindrique sombre au sommet, non identifiée$mdl$, $mdl$right_probable$mdl$, $mdl$low$mdl$, $mdl${"he":"המבנה השחור בראש הגבעה נראה חריג, אבל ללא סימון אי אפשר לקבוע אם הוא מגדל תצפית, תשתית או מבנה אחר.","fr":"Le cylindre sombre au sommet est intriguant. Sans source précise, impossible d’affirmer s’il s’agit d’une tour de guet ou d’une installation technique.","en":"The dark cylinder on the hill is unusual. Without documentation, it cannot be labelled a watchtower or utility structure.","ru":"Тёмный цилиндр на холме необычен. Без документов нельзя назвать его наблюдательной башней или техническим объектом."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 22, $mdl$22.jpg$mdl$, $mdl$1000472077.jpg$mdl$, $mdl$11:13:29$mdl$, $mdl$Pont et relief près de Nahal Me’arot$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"בסמוך לכאן נמצאת שמורת נחל מערות. במערות הכרמל נמצאו עדויות ארכאולוגיות חשובות לחיי בני אדם קדמונים במשך מאות אלפי שנים.","fr":"Tout près se trouve Nahal Me’arot : ses grottes conservent des traces remarquables de populations préhistoriques sur une très longue durée.","en":"Nearby Nahal Me’arot preserves extraordinary evidence of prehistoric populations over a very long span of time.","ru":"Рядом находится Нахаль-Меарот: его пещеры сохранили свидетельства жизни древних людей за огромный период времени."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-14$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 23, $mdl$23.jpg$mdl$, $mdl$1000472079.jpg$mdl$, $mdl$11:14:31$mdl$, $mdl$Bananiers sous filets$mdl$, $mdl$right_from_route_notes$mdl$, $mdl$high$mdl$, $mdl${"he":"תראו את העלים הגדולים: אלה בננות, גידול מוכר בחוף הכרמל. הרשתות מסייעות בניהול תנאי הגידול ובהגנה מפני פגעי סביבה.","fr":"Voici des bananiers sous filet : une culture emblématique de la côte du Carmel. Les filets contribuent à protéger les plants.","en":"Here are banana plants under netting, a characteristic crop of the Carmel coast. The nets help protect the plants.","ru":"Вот бананы под сеткой — характерная культура побережья Кармеля. Сетки помогают защищать растения."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-15$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 24, $mdl$24.jpg$mdl$, $mdl$1000472082.jpg$mdl$, $mdl$11:15:06$mdl$, $mdl$Passage supérieur à Atlit$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"במחלפים גשרים מפרידים בין זרמי התנועה ומשפרים את הבטיחות. כדאי לזהות את הגשר לפני שמגיעים אליו כדי שהקבוצה תספיק להסתכל.","fr":"Les échangeurs séparent les flux de circulation ; un guide annonce le pont avant son passage pour laisser le temps d’observer.","en":"Interchanges separate traffic flows; a guide should announce a bridge before reaching it so passengers can look.","ru":"Развязки разводят транспортные потоки. Гид должен предупредить о мосте заранее, чтобы пассажиры успели посмотреть."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 25, $mdl$25.jpg$mdl$, $mdl$1000472083.jpg$mdl$, $mdl$11:16:13$mdl$, $mdl$Panneau vers le camp des immigrants d’Atlit (Moshe Sneh)$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"השלט מפנה למחנה המעפילים בעתלית. הבריטים כלאו שם מעפילים שהגיעו לארץ למרות ההגבלות, וב־1945 שחררו לוחמי הפלמ״ח מאות עצורים.","fr":"Le panneau indique le camp d’Atlit, où les Britanniques détenaient des immigrants juifs arrivés malgré les restrictions. Le Palmach y mena une opération de libération en 1945.","en":"The sign points to Atlit’s detention camp, where the British held Jewish immigrants who arrived despite restrictions. The Palmach carried out a liberation operation in 1945.","ru":"Указатель ведёт к лагерю Атлит, где британцы держали еврейских иммигрантов. В 1945 году Пальмах провёл операцию по их освобождению."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-16$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 26, $mdl$26.jpg$mdl$, $mdl$1000472085.jpg$mdl$, $mdl$11:16:19$mdl$, $mdl$Palmiers au bord des cultures et du Carmel$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"עצי הדקל בולטים בנוף, אבל התמונה לבדה לא מוכיחה שמדובר בשדרת הדקלים ההיסטורית של עתלית. עד שנאמת, נספר רק על הנוף הנראה.","fr":"Les palmiers dominent la vue, mais la photo ne suffit pas à les identifier comme l’allée historique d’Atlit.","en":"The palms stand out, but the photo alone cannot identify them as Atlit’s historic palm avenue.","ru":"Пальмы заметны издалека, но по фотографии нельзя уверенно назвать их исторической аллеей Атлита."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 27, $mdl$27.jpg$mdl$, $mdl$1000472087.jpg$mdl$, $mdl$11:17:20$mdl$, $mdl$Train rouge sur pont$mdl$, $mdl$uncertain$mdl$, $mdl$high$mdl$, $mdl${"he":"מעל הכביש נוסעת רכבת. מסילה וכביש במפלסים שונים חוסכים חצייה מסוכנת ומשאירים את שתי התנועות פעילות.","fr":"Un train traverse le pont : séparer route et rail sur deux niveaux évite les passages à niveau et fluidifie le trafic.","en":"A train is crossing the bridge: separating road and rail vertically avoids level crossings and keeps traffic flowing.","ru":"По мосту идёт поезд: разные уровни для дороги и рельсов позволяют избежать опасных переездов."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-18$mdl$]::text[]),
($mdl$ALLER_V2$mdl$, 28, $mdl$28.jpg$mdl$, $mdl$1000472089.jpg$mdl$, $mdl$11:17:35$mdl$, $mdl$Marquage rouge abîmé sur pilier$mdl$, $mdl$uncertain$mdl$, $mdl$low$mdl$, $mdl${"he":"הסימון האדום על העמוד אינו קריא דיו כדי לזהותו. זו תזכורת להימנע מפענוח כתובות מטושטשות כאילו הן עובדה.","fr":"Le panneau rouge est trop effacé pour être lu avec certitude : mieux vaut ne pas inventer une signification.","en":"The red marking is too worn to read reliably. Better not invent a meaning for it.","ru":"Красная отметка стёрлась, и её смысл установить нельзя. Не стоит придумывать объяснение."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 29, $mdl$29.jpg$mdl$, $mdl$1000472091.jpg$mdl$, $mdl$11:17:52$mdl$, $mdl$Talus rocheux bas près de Megadim$mdl$, $mdl$right_probable$mdl$, $mdl$medium$mdl$, $mdl${"he":"הגבעה הנמוכה חושפת שוב שכבות משקע. הצמחייה גדלה בעיקר במקום שבו הצטברה מספיק קרקע בין הסלעים.","fr":"Cette colline laisse voir la roche, tandis que la végétation pousse surtout là où un peu de sol s’est accumulé.","en":"The low hill exposes the rock; plants grow mainly where enough soil has accumulated between stones.","ru":"На холме обнажена порода, а растения растут преимущественно там, где накопилась почва."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 30, $mdl$30.jpg$mdl$, $mdl$1000472093.jpg$mdl$, $mdl$11:18:21$mdl$, $mdl$Grand talus creusé dans la roche$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"כדי לסלול כאן את כביש החוף חתכו ברכס. במחשוף אפשר לראות מרקם ושכבות, אבל זיהוי סוג האבן דורש בדיקה גאולוגית.","fr":"Pour tracer la route, il a fallu entailler le relief. Les couches se voient bien, mais la nature exacte de la roche demande une vérification.","en":"The road required a cutting through the ridge. The layers are clear, but the exact rock type needs testing.","ru":"Чтобы проложить дорогу, гряду разрезали. Слои хорошо видны, но точный тип породы требует проверки."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 31, $mdl$31.jpg$mdl$, $mdl$1000472095.jpg$mdl$, $mdl$11:18:51$mdl$, $mdl$Strates fines / texture des roches$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"פסים דקים בסלע עשויים להעיד על תנאי שקיעה שונים. בלי מדידות לא נקבע אם מדובר בכורכר, גיר או חומר אחר בכל שכבה.","fr":"Les fines bandes traduisent possiblement des dépôts successifs. Une photo ne suffit pas à déterminer chaque roche.","en":"Thin bands may record successive deposits. A photograph alone cannot identify every rock layer.","ru":"Тонкие полосы могут отражать последовательные отложения. По одному снимку нельзя определить каждую породу."}$mdl$::jsonb, array[]::text[]),
($mdl$ALLER_V2$mdl$, 32, $mdl$32.jpg$mdl$, $mdl$1000472097.jpg$mdl$, $mdl$11:19:38$mdl$, $mdl$Bâtiments et collines de Tirat Carmel / Haifa$mdl$, $mdl$right_probable$mdl$, $mdl$high$mdl$, $mdl${"he":"מאחורי הבניינים עולים מורדות הכרמל. באזור חיפה, השלוחות והוואדיות עיצבו את הדרך שבה נבנו שכונות ונסללו כבישים.","fr":"Derrière les immeubles montent les pentes du Carmel : à Haïfa, les vallons et les crêtes ont guidé l’urbanisation.","en":"Carmel slopes rise behind the buildings. Around Haifa, ridges and wadis strongly shaped urban growth.","ru":"За зданиями поднимаются склоны Кармеля. В районе Хайфы хребты и долины сильно повлияли на застройку."}$mdl$::jsonb, array[$mdl$v2:PHOTO-OUT-20$mdl$]::text[])
on conflict (collection, ord) do update set
  file = excluded.file, source_file = excluded.source_file, taken_at = excluded.taken_at, subject = excluded.subject,
  side = excluded.side, confidence = excluded.confidence, anecdote = excluded.anecdote, question_keys = excluded.question_keys;

-- =====================================================================
--  BANQUE V3 — זכרון יעקב → יקנעם, כביש 67 (sans photo, 4 langues)
--  Fichier GÉNÉRÉ par tools/build-v3-sql.mjs à partir de content/v3/ — ne pas éditer à la main.
--  Ré-exécutable : aucune suppression ; une question modifiée dans l'admin n'est pas écrasée ;
--  l'ordre choisi dans l'admin est conservé. Ne touche ni à V1 ni à V2 ni aux parties.
-- =====================================================================
insert into mdl.question_banks (code, label, sort, default_time_sec)
values ('V3', $v3${"he":"V3 — זכרון יעקב → יקנעם, כביש 67","fr":"V3 — Zikhron Yaakov → Yokneam, route 67","en":"V3 — Zikhron Ya'akov → Yokneam, Road 67","ru":"V3 — Зихрон-Яаков → Йокнеам, шоссе 67"}$v3$::jsonb, 3, 45)
on conflict (code) do update set label = excluded.label, sort = excluded.sort,
  default_time_sec = coalesce(mdl.question_banks.default_time_sec, excluded.default_time_sec);

insert into mdl.questions (ext_key, bank, selection, kind, text, options, correct_index, explanation, category,
  difficulty, time_limit_sec, sort_order, guide_short, guide_long, guide_location, guide_practical, guide_sources,
  guide_fact, guide_visibility, i18n, guide_i18n, route_meta)
values
($v3$v3:ROAD67-11$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$המושבה זכרון יעקב נקראה על שם —$v3$, $v3$["הברון רוטשילד עצמו","אחיו של הברון","אביו של הברון, ג'יימס (יעקב)","יעקב אבינו"]$v3$::jsonb, 2, $v3$זכרון יעקב נוסדה ב-1882 ונקראה על שם ג'יימס (יעקב) רוטשילד, אביו של הברון אדמונד דה רוטשילד, שתמך במושבה.$v3$, $v3$היסטוריה$v3$, 2, 45, 1, $v3$נקראה על שם ג׳יימס-יעקב, אביו של הברון רוטשילד. בזכותו — כרמים ויקב.$v3$, $v3$אנחנו יוצאים מזכרון יעקב, אחת המושבות הראשונות של העלייה הראשונה. היא נוסדה ב-1882 בידי עולים מרומניה, והחיים היו קשים מאוד: מחלות, יובש וחובות. הברון אדמונד דה רוטשילד לקח אותה תחת חסותו, והמושבה נקראה על שם אביו — ג'יימס, יעקב בעברית. בזכותו נבנו כאן כרמים ויקב גדול, ועד היום זכרון יעקב מזוהה עם יין ועם המשפחה הזאת.$v3$, $v3$בתחילת הנסיעה, ביציאה מזכרון יעקב (מחלף זכרון יעקב / צומת פוריידיס).$v3$, $v3$יוסי: זכרון יעקב — על שם אביו של הנדיב הידוע (ג'יימס = יעקב), היישוב השני של העלייה הראשונה (טענה זו לא נכללה). אומת: נוסדה ב-1882, נקראה ב-1883 על שם ג'יימס (יעקב) רוטשילד, אביו של הברון אדמונד.$v3$, $v3$[{"title":"Zikhron Ya'akov — Wikipedia","url":"https://en.wikipedia.org/wiki/Zikhron_Ya%27akov"}]$v3$::jsonb, $v3$בהמשך הדרך נפגוש עוד שני דורות של רוטשילדים: מאיר שפיה על שם הסבא, ובת שלמה על שם האמא.$v3$, $v3$check$v3$, $v3${"fr":{"text":"La colonie de Zikhron Yaakov porte le nom…","options":["Le baron Rothschild lui-même","Le frère du baron","Le père du baron, James (Jacob)","Le patriarche Jacob"],"explanation":"Zikhron Yaakov, fondée en 1882, porte le nom de James (Yaakov) de Rothschild, père du baron Edmond de Rothschild qui soutenait la colonie.","category":"Histoire"},"en":{"text":"The colony of Zikhron Ya'akov is named after —","options":["Baron Rothschild himself","The baron's brother","The baron's father, James (Jacob)","The patriarch Jacob"],"explanation":"Zikhron Ya'akov was founded in 1882 and named after James (Ya'akov) de Rothschild, father of Baron Edmond de Rothschild, who supported the colony.","category":"History"},"ru":{"text":"Колония Зихрон-Яаков названа в честь…","options":["Сам барон Ротшильд","Брат барона","Отец барона, Джеймс (Яаков)","Праотец Иаков"],"explanation":"Зихрон-Яаков основан в 1882 году и назван в честь Джеймса (Яакова) Ротшильда — отца барона Эдмона де Ротшильда, поддерживавшего колонию.","category":"История"}}$v3$::jsonb, $v3${"he":{"script":"נקראה על שם ג׳יימס-יעקב, אביו של הברון רוטשילד. בזכותו — כרמים ויקב.","long":"אנחנו יוצאים מזכרון יעקב, אחת המושבות הראשונות של העלייה הראשונה. היא נוסדה ב-1882 בידי עולים מרומניה, והחיים היו קשים מאוד: מחלות, יובש וחובות. הברון אדמונד דה רוטשילד לקח אותה תחת חסותו, והמושבה נקראה על שם אביו — ג'יימס, יעקב בעברית. בזכותו נבנו כאן כרמים ויקב גדול, ועד היום זכרון יעקב מזוהה עם יין ועם המשפחה הזאת.","fact":"בהמשך הדרך נפגוש עוד שני דורות של רוטשילדים: מאיר שפיה על שם הסבא, ובת שלמה על שם האמא.","cue":"בתחילת הנסיעה, ביציאה מזכרון יעקב (מחלף זכרון יעקב / צומת פוריידיס).","caution":"","more":["כאן הקים הברון את יקבי כרמל — מהיקבים הוותיקים והגדולים בארץ.","בזכרון יעקב פעלו משפחת אהרונסון ומחתרת ניל״י במלחמת העולם הראשונה.","המושבה יושבת על חוטם הכרמל — הקצה הדרומי של הרכס."]},"fr":{"script":"Elle porte le nom de James-Yaakov, le père du baron de Rothschild. Grâce à lui : des vignes et une cave.","long":"Nous partons de Zikhron Yaakov, l'une des premières colonies de la première alya. Elle est fondée en 1882 par des immigrants de Roumanie, et la vie y est très dure : maladies, sécheresse et dettes. Le baron Edmond de Rothschild la prend sous sa protection, et la colonie reçoit le nom de son père, James, Yaakov en hébreu. Grâce à lui, on plante des vignes et on construit une grande cave : aujourd'hui encore, Zikhron rime avec vin et avec cette famille.","fact":"Plus loin, nous croiserons deux autres générations de Rothschild : Meir Shfeya pour le grand-père, et Bat Shlomo pour la mère.","cue":"Au début du trajet, en quittant Zikhron Yaakov (échangeur de Zikhron / carrefour de Fureidis).","caution":"","more":["כאן הקים הברון את יקבי כרמל — מהיקבים הוותיקים והגדולים בארץ.","בזכרון יעקב פעלו משפחת אהרונסון ומחתרת ניל״י במלחמת העולם הראשונה.","המושבה יושבת על חוטם הכרמל — הקצה הדרומי של הרכס."]},"en":{"script":"Named after James-Ya'akov, Baron Rothschild's father. Thanks to him: vineyards and a winery.","long":"We're leaving Zikhron Ya'akov, one of the first colonies of the First Aliyah. It was founded in 1882 by immigrants from Romania, and life was very hard: disease, drought and debt. Baron Edmond de Rothschild took it under his wing, and the colony was named after his father — James, Ya'akov in Hebrew. Thanks to him, vineyards and a big winery were built here, and to this day Zikhron is linked with wine and with that family.","fact":"Further along we'll meet two more generations of Rothschilds: Meir Shfeya for the grandfather and Bat Shlomo for the mother.","cue":"At the start of the drive, leaving Zikhron Ya'akov (Zikhron interchange / Fureidis junction).","caution":"","more":["כאן הקים הברון את יקבי כרמל — מהיקבים הוותיקים והגדולים בארץ.","בזכרון יעקב פעלו משפחת אהרונסון ומחתרת ניל״י במלחמת העולם הראשונה.","המושבה יושבת על חוטם הכרמל — הקצה הדרומי של הרכס."]},"ru":{"script":"Названа в честь Джеймса-Яакова, отца барона Ротшильда. Благодаря ему — виноградники и винодельня.","long":"Мы выезжаем из Зихрон-Яакова — одной из первых колоний Первой алии. Её основали в 1882 году выходцы из Румынии, и жизнь здесь была очень тяжёлой: болезни, засуха и долги. Барон Эдмон де Ротшильд взял колонию под опеку, и её назвали в честь его отца — Джеймса, по-еврейски Яакова. Благодаря ему здесь посадили виноградники и построили большую винодельню, и до сих пор Зихрон связан с вином и с этой семьёй.","fact":"Дальше по дороге нас ждут ещё два поколения Ротшильдов: Меир-Шфея — в честь деда, Бат-Шломо — в честь матери.","cue":"В начале поездки, при выезде из Зихрон-Яакова (развязка Зихрон / перекрёсток Фурейдис).","caution":"","more":["כאן הקים הברון את יקבי כרמל — מהיקבים הוותיקים והגדולים בארץ.","בזכרון יעקב פעלו משפחת אהרונסון ומחתרת ניל״י במלחמת העולם הראשונה.","המושבה יושבת על חוטם הכרמל — הקצה הדרומי של הרכס."]}}$v3$::jsonb, $v3${"stop":"S11","final":false,"topic":"Zikhron Yaakov name","docs":"יוסי: זכרון יעקב — על שם אביו של הנדיב הידוע (ג'יימס = יעקב), היישוב השני של העלייה הראשונה (טענה זו לא נכללה). אומת: נוסדה ב-1882, נקראה ב-1883 על שם ג'יימס (יעקב) רוטשילד, אביו של הברון אדמונד."}$v3$::jsonb),
($v3$v3:ROAD67-12$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$מה פירוש השם פוריידיס בערבית?$v3$, $v3$["כפר קטן","גבעה קטנה","מעיין קטן","גן עדן קטן"]$v3$::jsonb, 3, $v3$פוריידיס פירושו 'גן עדן קטן' — מאותו שורש של המילים 'פרדס' בעברית ו-paradise באנגלית.$v3$, $v3$שפה ושמות$v3$, 2, 45, 2, $v3$בערבית ״גן עדן קטן״. מאותה מילה: פרדס, paradise.$v3$, $v3$משמאלנו, לפי שני המסמכים, הכפר פוריידיס, למרגלות הכרמל. לשם יש סיפור יפה: פוריידיס בערבית זה 'גן עדן קטן'. המילה הגיעה מפרסית עתיקה, שם 'פרדס' היה גן מוקף חומה. מאותה מילה נולדו גם 'פרדס' בעברית וגם paradise באנגלית ו-paradis בצרפתית. כלומר — שלוש שפות, מילה אחת, וכולן מתחילות בגן.$v3$, $v3$ליד צומת פוריידיס (כביש 4), בתחילת כביש 67.$v3$, $v3$יאיר: פוריידיס משמאלנו; השם מהמילה הפרסית 'פרדס' — 'גן עדן' (paradise); מרכז מסחרי חדש בכניסה (לא נכלל). יוסי: משמאל; השם = פרדס / גן עדן / הורדוס (הורדוס לא נכלל). אומת: 'פֻרַידִיס' בערבית — 'גן עדן קטן'.$v3$, $v3$[{"title":"Fureidis — Wikipedia","url":"https://en.wikipedia.org/wiki/Fureidis"}]$v3$::jsonb, $v3$'פרדס' מופיע כבר בתנ״ך, בשיר השירים: 'פרדס רימונים עם פרי מגדים'.$v3$, $v3$check$v3$, $v3${"fr":{"text":"Que signifie le nom arabe Fureidis ?","options":["Petit village","Petite colline","Petite source","Petit paradis"],"explanation":"Fureidis signifie « petit paradis » : la même racine que « pardès » en hébreu, « paradis » en français et « paradise » en anglais.","category":"Langue et noms"},"en":{"text":"What does the Arabic name Fureidis mean?","options":["Little village","Little hill","Little spring","Little paradise"],"explanation":"Fureidis means 'little paradise' — the same root as 'pardes' in Hebrew and 'paradise' in English.","category":"Names and language"},"ru":{"text":"Что означает арабское название Фурейдис?","options":["Маленькая деревня","Маленький холм","Маленький родник","Маленький рай"],"explanation":"Фурейдис означает «маленький рай» — тот же корень, что у ивритского «пардес» и английского «paradise».","category":"Названия"}}$v3$::jsonb, $v3${"he":{"script":"בערבית ״גן עדן קטן״. מאותה מילה: פרדס, paradise.","long":"משמאלנו, לפי שני המסמכים, הכפר פוריידיס, למרגלות הכרמל. לשם יש סיפור יפה: פוריידיס בערבית זה 'גן עדן קטן'. המילה הגיעה מפרסית עתיקה, שם 'פרדס' היה גן מוקף חומה. מאותה מילה נולדו גם 'פרדס' בעברית וגם paradise באנגלית ו-paradis בצרפתית. כלומר — שלוש שפות, מילה אחת, וכולן מתחילות בגן.","fact":"'פרדס' מופיע כבר בתנ״ך, בשיר השירים: 'פרדס רימונים עם פרי מגדים'.","cue":"ליד צומת פוריידיס (כביש 4), בתחילת כביש 67.","caution":"","more":["פוריידיס יושבת משמאלנו, למרגלות רכס הכרמל.","הבניין הגדול בכניסה — מרכז מסחרי חדש ענק של היישוב."]},"fr":{"script":"En arabe, « petit paradis ». Le même mot a donné « pardès », « paradise » et « paradis ».","long":"Sur notre gauche, d'après les deux documents, le village de Fureidis, au pied du Carmel. Son nom a une belle histoire : Fureidis, en arabe, veut dire « petit paradis ». Le mot vient du vieux perse, où le « pardès » était un jardin entouré d'un mur. De ce même mot sont nés « pardès » en hébreu, « paradise » en anglais et « paradis » en français. Trois langues, un seul mot, et tout commence par un jardin.","fact":"Le mot « pardès » figure déjà dans la Bible, dans le Cantique des cantiques : « un jardin de grenadiers aux fruits exquis ».","cue":"Près du carrefour de Fureidis (route 4), au début de la route 67.","caution":"","more":["פוריידיס יושבת משמאלנו, למרגלות רכס הכרמל.","הבניין הגדול בכניסה — מרכז מסחרי חדש ענק של היישוב."]},"en":{"script":"In Arabic, 'little paradise'. The same word gave us 'pardes' and 'paradise'.","long":"On our left, according to both guide documents, is the village of Fureidis at the foot of the Carmel. Its name has a lovely story: Fureidis in Arabic means 'little paradise'. The word comes from Old Persian, where a 'pardes' was a walled garden. From that same word came 'pardes' in Hebrew, 'paradise' in English and 'paradis' in French. Three languages, one word — and it all starts with a garden.","fact":"'Pardes' already appears in the Bible, in the Song of Songs: 'an orchard of pomegranates, with pleasant fruits'.","cue":"Near Fureidis junction (Road 4), at the start of Road 67.","caution":"","more":["פוריידיס יושבת משמאלנו, למרגלות רכס הכרמל.","הבניין הגדול בכניסה — מרכז מסחרי חדש ענק של היישוב."]},"ru":{"script":"По-арабски «маленький рай». От того же слова — «пардес» и «paradise».","long":"Слева от нас, по обоим документам, деревня Фурейдис у подножия Кармеля. У названия красивая история: по-арабски Фурейдис значит «маленький рай». Слово пришло из древнеперсидского, где «пардес» — это сад, обнесённый стеной. От этого же слова произошли ивритское «пардес», английское «paradise» и французское «paradis». Три языка, одно слово — и всё начинается с сада.","fact":"Слово «пардес» встречается уже в Библии, в Песни песней: «сад с гранатовыми яблоками, с превосходными плодами».","cue":"У перекрёстка Фурейдис (дорога 4), в начале шоссе 67.","caution":"","more":["פוריידיס יושבת משמאלנו, למרגלות רכס הכרמל.","הבניין הגדול בכניסה — מרכז מסחרי חדש ענק של היישוב."]}}$v3$::jsonb, $v3${"stop":"S12","final":false,"topic":"Fureidis name","docs":"יאיר: פוריידיס משמאלנו; השם מהמילה הפרסית 'פרדס' — 'גן עדן' (paradise); מרכז מסחרי חדש בכניסה (לא נכלל). יוסי: משמאל; השם = פרדס / גן עדן / הורדוס (הורדוס לא נכלל). אומת: 'פֻרַידִיס' בערבית — 'גן עדן קטן'."}$v3$::jsonb),
($v3$v3:ROAD67-01$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$כביש 67 עובר בוואדי מילק (ואדי אל-מילח). מה חשיבותו של המעבר הזה?$v3$, $v3$["מעבר בין החוף לגליל העליון","מעבר בין החוף לעמק יזרעאל","מעבר בין חיפה לרמת הגולן","מעבר בין השרון לבקעת הירדן"]$v3$::jsonb, 1, $v3$ואדי מילח עובר בין הכרמל לרמות מנשה ומחבר את מישור החוף לעמק יזרעאל — אחד המעברים הנוחים בצפון הארץ.$v3$, $v3$גאוגרפיה$v3$, 2, 45, 3, $v3$מעבר טבעי בין הים לעמק יזרעאל — הכרמל מצפון, רמות מנשה מדרום.$v3$, $v3$אנחנו נכנסים עכשיו לוואדי מילק — שיבוש של השם הערבי ואדי אל-מילח, 'ואדי המלח'. מצפון לנו רכס הכרמל, מדרום רמות מנשה, ובאמצע מסדרון טבעי שמוביל מהים אל עמק יזרעאל. הכביש עולה במעלה נחל דליה ונחל תות, ובסוף, ליד יקנעם, נפתח אל העמק. לכן עברו כאן לאורך הדורות שיירות וצבאות — והיום גם אנחנו.$v3$, $v3$בתחילת הנסיעה, אחרי צומת פוריידיס, כשהכביש נכנס בין הכרמל (צפון) לרמות מנשה (דרום). שאלה כללית — אין אתר להצביע עליו.$v3$, $v3$יאיר: ואדי מילק = ואדי אל-מילח, מעבר בין מישור החוף לעמק יזרעאל, 'חלק מדרך הים'. יוסי: עולים בנחל דליה; השם שובש בפי האנגלים; 'הובילו מלח'. תיקון: המעבר הראשי של דרך הים היה בוואדי ערה (נחל עירון); ואדי מילח הוא מעבר משני. הסברי 'האנגלים' ו'שיירות המלח' הם מסורות לא מתועדות.$v3$, $v3$[{"title":"Highway 67 (Israel) — Wikipedia","url":"https://en.wikipedia.org/wiki/Highway_67_(Israel)"},{"title":"נחל תות — המכלול","url":"https://www.hamichlol.org.il/נחל_תות"}]$v3$::jsonb, $v3$המעבר הראשי של 'דרך הים' העתיקה עבר דווקא בוואדי ערה, בנחל עירון. ואדי מילח היה מעבר משני — אבל הוא אחד משני הצירים המרכזיים שחוצים היום את הכרמל (השני: כביש 65 בוואדי ערה).$v3$, $v3$topic$v3$, $v3${"fr":{"text":"La route 67 emprunte le Wadi Milk (Wadi al-Milh). Quel est l'intérêt de ce passage ?","options":["Un passage entre la côte et la Haute-Galilée","Un passage entre la côte et la vallée de Jezreel","Un passage entre Haïfa et le Golan","Un passage entre le Sharon et la vallée du Jourdain"],"explanation":"Le Wadi Milh passe entre le Carmel et les collines de Menashe et relie la plaine côtière à la vallée de Jezréel : l'un des passages les plus faciles du nord du pays.","category":"Géographie"},"en":{"text":"Road 67 runs through Wadi Milk (Wadi al-Milh). Why is this pass important?","options":["A pass between the coast and Upper Galilee","A pass between the coast and the Jezreel Valley","A pass between Haifa and the Golan","A pass between the Sharon and the Jordan Valley"],"explanation":"Wadi Milh runs between Mount Carmel and the Menashe Heights, linking the coastal plain with the Jezreel Valley — one of the easiest passes in northern Israel.","category":"Geography"},"ru":{"text":"Шоссе 67 проходит по Вади-Милк (Вади-эль-Мильх). Чем важен этот проход?","options":["Проход между побережьем и Верхней Галилеей","Проход между побережьем и Изреельской долиной","Проход между Хайфой и Голанами","Проход между Шароном и Иорданской долиной"],"explanation":"Вади-Мильх проходит между Кармелем и возвышенностью Менаше и соединяет прибрежную равнину с Изреельской долиной — один из самых удобных проходов на севере страны.","category":"География"}}$v3$::jsonb, $v3${"he":{"script":"מעבר טבעי בין הים לעמק יזרעאל — הכרמל מצפון, רמות מנשה מדרום.","long":"אנחנו נכנסים עכשיו לוואדי מילק — שיבוש של השם הערבי ואדי אל-מילח, 'ואדי המלח'. מצפון לנו רכס הכרמל, מדרום רמות מנשה, ובאמצע מסדרון טבעי שמוביל מהים אל עמק יזרעאל. הכביש עולה במעלה נחל דליה ונחל תות, ובסוף, ליד יקנעם, נפתח אל העמק. לכן עברו כאן לאורך הדורות שיירות וצבאות — והיום גם אנחנו.","fact":"המעבר הראשי של 'דרך הים' העתיקה עבר דווקא בוואדי ערה, בנחל עירון. ואדי מילח היה מעבר משני — אבל הוא אחד משני הצירים המרכזיים שחוצים היום את הכרמל (השני: כביש 65 בוואדי ערה).","cue":"בתחילת הנסיעה, אחרי צומת פוריידיס, כשהכביש נכנס בין הכרמל (צפון) לרמות מנשה (דרום). שאלה כללית — אין אתר להצביע עליו.","caution":"מסמך יאיר כותב שהמעבר היה 'חלק מדרך הים' — מדויק יותר: אחד ממעברי הכרמל. ההסבר שהאנגלים שיבשו את השם — מסורת, לא עובדה מתועדת.","more":["״ואדי מילק״ הוא שיבוש של ״ואדי אל-מילח״ — ואדי המלח.","לפי המסורת, בדרך הזאת הובילו מלח מהים אל הדרכים שבפנים הארץ.","הכביש פשוט הולך אחרי נחל דליה, שפרץ מעבר בין חוטם הכרמל לרכס הכרמל."]},"fr":{"script":"Un passage naturel entre la mer et la vallée de Jezréel : le Carmel au nord, Menashe au sud.","long":"Nous entrons dans le Wadi Milk, déformation de l'arabe Wadi al-Milh, « la vallée du sel ». Au nord, la chaîne du Carmel ; au sud, les collines de Menashe ; entre les deux, un couloir naturel qui mène de la mer à la vallée de Jezréel. La route remonte le Nahal Dalia puis le Nahal Tut et débouche sur la vallée près de Yokneam. Caravanes et armées l'ont emprunté pendant des siècles — et nous aujourd'hui.","fact":"Le grand passage de l'antique « Via Maris » se trouvait en fait au Wadi Ara (Nahal Iron). Le Wadi Milh était un passage secondaire — mais c'est aujourd'hui l'un des deux grands axes qui traversent le Carmel, avec la route 65 du Wadi Ara.","cue":"Au début du trajet, après le carrefour de Fureidis, quand la route s'engage entre le Carmel (nord) et Menashe (sud). Question générale : rien à montrer du doigt.","caution":"Le document de Yaïr parle de la « Via Maris » : plus exact de dire « l'un des passages du Carmel ». L'explication « ce sont les Britanniques qui ont déformé le nom » est une tradition non documentée.","more":["״ואדי מילק״ הוא שיבוש של ״ואדי אל-מילח״ — ואדי המלח.","לפי המסורת, בדרך הזאת הובילו מלח מהים אל הדרכים שבפנים הארץ.","הכביש פשוט הולך אחרי נחל דליה, שפרץ מעבר בין חוטם הכרמל לרכס הכרמל."]},"en":{"script":"A natural pass from the sea to the Jezreel Valley: the Carmel to the north, Menashe to the south.","long":"We're now entering Wadi Milk — a garbled form of the Arabic Wadi al-Milh, 'the valley of salt'. To the north is the Carmel ridge, to the south the Menashe Heights, and in between a natural corridor from the sea to the Jezreel Valley. The road climbs along Nahal Dalia and Nahal Tut and opens onto the valley near Yokneam. Caravans and armies used it for centuries — and today, so do we.","fact":"The main pass of the ancient 'Way of the Sea' was actually in Wadi Ara, along Nahal Iron. Wadi Milh was a secondary pass — but today it's one of the two main roads across the Carmel, together with Road 65 in Wadi Ara.","cue":"Early in the drive, after Fureidis junction, as the road enters between the Carmel (north) and the Menashe Heights (south). A general question — nothing to point at.","caution":"Yair's notes call it 'part of the Via Maris' — more accurate: one of the Carmel passes. 'The British garbled the name' is a tradition, not a documented fact.","more":["״ואדי מילק״ הוא שיבוש של ״ואדי אל-מילח״ — ואדי המלח.","לפי המסורת, בדרך הזאת הובילו מלח מהים אל הדרכים שבפנים הארץ.","הכביש פשוט הולך אחרי נחל דליה, שפרץ מעבר בין חוטם הכרמל לרכס הכרמל."]},"ru":{"script":"Естественный проход от моря к Изреельской долине: Кармель на севере, Менаше на юге.","long":"Мы въезжаем в Вади-Милк — искажённое арабское Вади-эль-Мильх, «долина соли». На севере — хребет Кармель, на юге — возвышенность Менаше, а между ними естественный коридор от моря к Изреельской долине. Дорога поднимается вдоль ручьёв Далия и Тут и у Йокнеама выходит в долину. Здесь веками шли караваны и армии — а сегодня едем мы.","fact":"Главный проход древней «Приморской дороги» на самом деле шёл через Вади-Ара, по ручью Ирон. Вади-Мильх был второстепенным проходом, но сегодня это одна из двух главных дорог через Кармель — вместе с шоссе 65 в Вади-Ара.","cue":"В начале поездки, после перекрёстка Фурейдис, когда дорога входит между Кармелем (север) и Менаше (юг). Общий вопрос — показывать ничего не нужно.","caution":"В записях Яира сказано «часть Приморской дороги» — точнее: «один из проходов через Кармель». Версия «название исказили британцы» — предание, а не документированный факт.","more":["״ואדי מילק״ הוא שיבוש של ״ואדי אל-מילח״ — ואדי המלח.","לפי המסורת, בדרך הזאת הובילו מלח מהים אל הדרכים שבפנים הארץ.","הכביש פשוט הולך אחרי נחל דליה, שפרץ מעבר בין חוטם הכרמל לרכס הכרמל."]}}$v3$::jsonb, $v3${"stop":"S1","final":false,"topic":"Wadi Milh pass","docs":"יאיר: ואדי מילק = ואדי אל-מילח, מעבר בין מישור החוף לעמק יזרעאל, 'חלק מדרך הים'. יוסי: עולים בנחל דליה; השם שובש בפי האנגלים; 'הובילו מלח'. תיקון: המעבר הראשי של דרך הים היה בוואדי ערה (נחל עירון); ואדי מילח הוא מעבר משני. הסברי 'האנגלים' ו'שיירות המלח' הם מסורות לא מתועדות."}$v3$::jsonb),
($v3$v3:ROAD67-02$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$מי הקים בשנת 1904 בשפיה מוסד לילדים יתומים שניצלו מפרעות קישינב?$v3$, $v3$["אליעזר בן-יהודה","הברון רוטשילד","ישראל בלקינד","מנחם אוסישקין"]$v3$::jsonb, 2, $v3$ישראל בלקינד, ממייסדי ביל״ו, הקים כאן ב-1904 מוסד ליתומי פרעות קישינב — ראשיתו של כפר הנוער מאיר שפיה.$v3$, $v3$היסטוריה$v3$, 2, 45, 4, $v3$ב-1904 ישראל בלקינד הביא לכאן יתומי פרעות קישינב — כנראה כפר הנוער הראשון בארץ.$v3$, $v3$השם מאיר שפיה מחבר שני עולמות: 'מאיר' — על שם מאיר אמשל רוטשילד, סבו של הברון, ו'שפיה' — שם הכפר הערבי שהיה כאן. ב-1904 הביא לכאן ישראל בלקינד, ממייסדי ביל״ו, ילדים יתומים שניצלו מפרעות קישינב. הם למדו, עבדו בחקלאות וחיו יחד — כנראה כפר הנוער הראשון בארץ. גם היום זה כפר נוער עם פנימייה, חקלאות וכרם.$v3$, $v3$כ-4 ק״מ מתחילת כביש 67, באזור צומת שפיה (כביש 652). לספר בלי להצביע.$v3$, $v3$יאיר: 'הסתכלו שמאלה'; על שם מאיר רוטשילד, סבו של הברון; בלקינד 1904, יתומי קישינב, כפר הנוער הראשון. יוסי: 'מצד שמאל'; שיר של ביאליק על בנות שפיה (לא אומת — לא נכלל). אזהרה: לפי קואורדינטות ויקיפדיה (32.590, 34.971) הכפר קרוב מאוד לציר — הצד לא אומת.$v3$, $v3$[{"title":"Meir Shfeya — Wikipedia","url":"https://en.wikipedia.org/wiki/Meir_Shfeya"},{"title":"ישראל בלקינד — ויקיפדיה","url":"https://he.wikipedia.org/wiki/ישראל_בלקינד"}]$v3$::jsonb, $v3$בלקינד היה מורה — והרעיון שלו, 'בית ספר שהוא גם משק', הפך לדגם של כפרי הנוער בישראל: לומדים בבוקר, עובדים בשדה אחר הצהריים.$v3$, $v3$check$v3$, $v3${"fr":{"text":"Qui a fondé à Shfeya, en 1904, une institution pour des orphelins rescapés du pogrom de Kichinev ?","options":["Eliezer Ben-Yehuda","Le baron Rothschild","Israël Belkind","Menahem Ussishkin"],"explanation":"Israel Belkind, l'un des fondateurs du mouvement Bilou, y a créé en 1904 un foyer pour les orphelins du pogrom de Kichinev : le début du village de jeunes Meir Shfeya.","category":"Histoire"},"en":{"text":"Who founded an institution at Shfeya in 1904 for orphans who survived the Kishinev pogrom?","options":["Eliezer Ben-Yehuda","Baron Rothschild","Israel Belkind","Menachem Ussishkin"],"explanation":"Israel Belkind, one of the founders of the Bilu movement, set up a home here in 1904 for orphans of the Kishinev pogrom — the beginning of the Meir Shfeya youth village.","category":"History"},"ru":{"text":"Кто основал в Шфее в 1904 году приют для сирот, переживших Кишинёвский погром?","options":["Элиэзер Бен-Иегуда","Барон Ротшильд","Исраэль Белкинд","Менахем Усышкин"],"explanation":"Исраэль Белкинд, один из основателей движения БИЛУ, открыл здесь в 1904 году приют для сирот Кишинёвского погрома — с него начался молодёжный посёлок Меир-Шфея.","category":"История"}}$v3$::jsonb, $v3${"he":{"script":"ב-1904 ישראל בלקינד הביא לכאן יתומי פרעות קישינב — כנראה כפר הנוער הראשון בארץ.","long":"השם מאיר שפיה מחבר שני עולמות: 'מאיר' — על שם מאיר אמשל רוטשילד, סבו של הברון, ו'שפיה' — שם הכפר הערבי שהיה כאן. ב-1904 הביא לכאן ישראל בלקינד, ממייסדי ביל״ו, ילדים יתומים שניצלו מפרעות קישינב. הם למדו, עבדו בחקלאות וחיו יחד — כנראה כפר הנוער הראשון בארץ. גם היום זה כפר נוער עם פנימייה, חקלאות וכרם.","fact":"בלקינד היה מורה — והרעיון שלו, 'בית ספר שהוא גם משק', הפך לדגם של כפרי הנוער בישראל: לומדים בבוקר, עובדים בשדה אחר הצהריים.","cue":"כ-4 ק״מ מתחילת כביש 67, באזור צומת שפיה (כביש 652). לספר בלי להצביע.","caution":"","more":["השם: ״מאיר״ — סבו של הברון, ו״שפיה״ — שם הכפר הערבי שהיה כאן.","גם היום זה כפר נוער עם פנימייה, חקלאות וכרמים שהתלמידים עובדים בהם.","אחריו, משמאל, המחצבה: ב-2006 תכננו לשקם אותה — ״קיר גלוי, פארק חבוי״. הקיר גלוי… והפארק עדיין חבוי."]},"fr":{"script":"En 1904, Israel Belkind y accueille des orphelins du pogrom de Kichinev : sans doute le premier village de jeunes du pays.","long":"Le nom Meir Shfeya réunit deux mondes : « Meir », pour Mayer Amschel Rothschild, le grand-père du Baron, et « Shfeya », le nom du village arabe qui se trouvait ici. En 1904, Israel Belkind, l'un des fondateurs du Bilou, y amène des orphelins rescapés du pogrom de Kichinev. Ils étudient, travaillent la terre et vivent ensemble : sans doute le premier village de jeunes du pays. C'est encore aujourd'hui un internat avec ferme et vignoble.","fact":"Belkind était enseignant. Son idée — « une école qui est aussi une ferme » — est devenue le modèle des villages de jeunes israéliens : la classe le matin, les champs l'après-midi.","cue":"Environ 4 km après le début de la route 67, vers le carrefour de Shfeya (route 652). Raconter sans montrer du doigt.","caution":"","more":["השם: ״מאיר״ — סבו של הברון, ו״שפיה״ — שם הכפר הערבי שהיה כאן.","גם היום זה כפר נוער עם פנימייה, חקלאות וכרמים שהתלמידים עובדים בהם.","אחריו, משמאל, המחצבה: ב-2006 תכננו לשקם אותה — ״קיר גלוי, פארק חבוי״. הקיר גלוי… והפארק עדיין חבוי."]},"en":{"script":"In 1904 Israel Belkind brought orphans of the Kishinev pogrom here — probably the country's first youth village.","long":"The name Meir Shfeya joins two worlds: 'Meir' after Mayer Amschel Rothschild, the Baron's grandfather, and 'Shfeya', the name of the Arab village that stood here. In 1904 Israel Belkind, one of the Bilu founders, brought orphans who had survived the Kishinev pogrom. They studied, farmed and lived together — probably the first youth village in the country. Today it is still a boarding school with a farm and a vineyard.","fact":"Belkind was a teacher, and his idea — 'a school that is also a farm' — became the model for Israel's youth villages: classes in the morning, fields in the afternoon.","cue":"About 4 km into Road 67, near Shfeya junction (Road 652). Tell the story without pointing.","caution":"","more":["השם: ״מאיר״ — סבו של הברון, ו״שפיה״ — שם הכפר הערבי שהיה כאן.","גם היום זה כפר נוער עם פנימייה, חקלאות וכרמים שהתלמידים עובדים בהם.","אחריו, משמאל, המחצבה: ב-2006 תכננו לשקם אותה — ״קיר גלוי, פארק חבוי״. הקיר גלוי… והפארק עדיין חבוי."]},"ru":{"script":"В 1904 году Исраэль Белкинд привёз сюда сирот Кишинёвского погрома — вероятно, первый молодёжный посёлок страны.","long":"Название Меир-Шфея соединяет два мира: «Меир» — в честь Майера Амшеля Ротшильда, деда барона, а «Шфея» — название арабской деревни, стоявшей здесь. В 1904 году Исраэль Белкинд, один из основателей БИЛУ, привёз сюда сирот, переживших Кишинёвский погром. Они учились, работали на земле и жили вместе — вероятно, первый молодёжный посёлок в стране. И сегодня здесь интернат с фермой и виноградником.","fact":"Белкинд был учителем, и его идея «школа, которая одновременно ферма» стала образцом для израильских молодёжных посёлков: утром уроки, после обеда — поле.","cue":"Примерно через 4 км после начала шоссе 67, у перекрёстка Шфея (дорога 652). Рассказывать, не показывая рукой.","caution":"","more":["השם: ״מאיר״ — סבו של הברון, ו״שפיה״ — שם הכפר הערבי שהיה כאן.","גם היום זה כפר נוער עם פנימייה, חקלאות וכרמים שהתלמידים עובדים בהם.","אחריו, משמאל, המחצבה: ב-2006 תכננו לשקם אותה — ״קיר גלוי, פארק חבוי״. הקיר גלוי… והפארק עדיין חבוי."]}}$v3$::jsonb, $v3${"stop":"S2","final":false,"topic":"Meir Shfeya youth village","docs":"יאיר: 'הסתכלו שמאלה'; על שם מאיר רוטשילד, סבו של הברון; בלקינד 1904, יתומי קישינב, כפר הנוער הראשון. יוסי: 'מצד שמאל'; שיר של ביאליק על בנות שפיה (לא אומת — לא נכלל). אזהרה: לפי קואורדינטות ויקיפדיה (32.590, 34.971) הכפר קרוב מאוד לציר — הצד לא אומת."}$v3$::jsonb),
($v3$v3:ROAD67-07$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$איזה עץ מאפיין את החורש הטבעי הפתוח של אזור אלונה ורמות מנשה?$v3$, $v3$["אלון התבור","אורן ירושלים","חרוב","אקליפטוס"]$v3$::jsonb, 0, $v3$אלון התבור — עץ נשיר-למחצה עם עלים רחבים — יוצר כאן 'יער פארק' פתוח וטבעי.$v3$, $v3$בוטניקה$v3$, 2, 45, 5, $v3$חורש טבעי של אלוני תבור — עצים רחבים ומרווחים, לא יער נטוע.$v3$, $v3$הגבעות האלה הן ממלכת אלון התבור. בניגוד ליערות האורנים שנטעה קק״ל, זה חורש טבעי: עצים רחבים ומרווחים, 'יער פארק', על קרקע רנדזינה בהירה שנוצרה מסלע הקירטון. אלון התבור משיר חלק מעליו בחורף — ולכן בסתיו הגבעות מקבלות גוון צהבהב-חום. לא כל עץ שרואים מהחלון הוא אלון תבור, אבל רוב העצים הגדולים והבודדים כאן — כן.$v3$, $v3$בין צומת שפיה לבת שלמה, כשנראה חורש פתוח על הגבעות.$v3$, $v3$יאיר: 'מצד ימין — יערות אלונה, יער אלונים טבעי עד הר חורשן'; מפנה צפוני: אלון מצוי ואלה; מפנה דרומי: אלון התבור ולבנה. יוסי: 'מצד ימין', חורש אלון התבור, קרטון ורנדזינה. אחרי אליקים: יערות אורן נטועים של קק״ל (לא טבעיים).$v3$, $v3$[{"title":"אלון התבור — ויקיפדיה","url":"https://he.wikipedia.org/wiki/אלון_התבור"}]$v3$::jsonb, $v3$אלוני התבור העתיקים בארץ יכולים להגיע לגיל של מאות שנים. בגללם נקראה המועצה האזורית הסמוכה 'אלונה'.$v3$, $v3$check$v3$, $v3${"fr":{"text":"Quel arbre caractérise les bois naturels clairsemés d'Alona et des collines de Menashe ?","options":["Le chêne du Tabor","Le pin d'Alep","Le caroubier","L'eucalyptus"],"explanation":"Le chêne du Tabor, à feuilles larges et semi-caduques, forme ici une « forêt-parc » naturelle et ouverte.","category":"Botanique"},"en":{"text":"Which tree characterizes the open natural woodland of Alona and the Menashe Heights?","options":["Tabor oak","Aleppo pine","Carob","Eucalyptus"],"explanation":"The Tabor oak, broad-leaved and semi-deciduous, forms an open natural 'park forest' here.","category":"Botany"},"ru":{"text":"Какое дерево характерно для естественного редколесья района Алона и возвышенности Менаше?","options":["Дуб Табор","Алеппская сосна","Рожковое дерево","Эвкалипт"],"explanation":"Таворский дуб — широколиственный, полулистопадный — образует здесь естественный светлый «парковый лес».","category":"Ботаника"}}$v3$::jsonb, $v3${"he":{"script":"חורש טבעי של אלוני תבור — עצים רחבים ומרווחים, לא יער נטוע.","long":"הגבעות האלה הן ממלכת אלון התבור. בניגוד ליערות האורנים שנטעה קק״ל, זה חורש טבעי: עצים רחבים ומרווחים, 'יער פארק', על קרקע רנדזינה בהירה שנוצרה מסלע הקירטון. אלון התבור משיר חלק מעליו בחורף — ולכן בסתיו הגבעות מקבלות גוון צהבהב-חום. לא כל עץ שרואים מהחלון הוא אלון תבור, אבל רוב העצים הגדולים והבודדים כאן — כן.","fact":"אלוני התבור העתיקים בארץ יכולים להגיע לגיל של מאות שנים. בגללם נקראה המועצה האזורית הסמוכה 'אלונה'.","cue":"בין צומת שפיה לבת שלמה, כשנראה חורש פתוח על הגבעות.","caution":"לא להצביע על עץ מסוים כאלון תבור.","more":["יער אלונים טבעי שמלווה אותנו עד הר חורשן.","במדרון המוצל — חורש סבוך של אלון מצוי ואלה; במדרון השמשי — יער פתוח של אלון התבור.","יערות האורן שנראה בהמשך נטעה קק״ל — הם לא חלק מהצומח הטבעי כאן."]},"fr":{"script":"Un bois naturel de chênes du Tabor : de grands arbres espacés, pas une forêt plantée.","long":"Ces collines sont le royaume du chêne du Tabor. Contrairement aux forêts de pins plantées par le KKL, c'est un boisement naturel : de grands arbres espacés, une « forêt-parc », sur une terre claire, la rendzine, issue de la craie. Le chêne du Tabor perd une partie de ses feuilles en hiver : d'où les teintes jaune-brun des collines en automne. Tous les arbres ne sont pas des chênes du Tabor, mais la plupart des grands arbres isolés, oui.","fact":"Les vieux chênes du Tabor peuvent atteindre plusieurs siècles. Ce sont eux qui ont donné son nom au conseil régional voisin : Alona, de « alon », le chêne.","cue":"Entre le carrefour de Shfeya et Bat Shlomo, quand on voit un bois clair sur les collines.","caution":"Ne pas désigner un arbre précis comme chêne du Tabor.","more":["יער אלונים טבעי שמלווה אותנו עד הר חורשן.","במדרון המוצל — חורש סבוך של אלון מצוי ואלה; במדרון השמשי — יער פתוח של אלון התבור.","יערות האורן שנראה בהמשך נטעה קק״ל — הם לא חלק מהצומח הטבעי כאן."]},"en":{"script":"Natural Tabor-oak woodland — broad, widely spaced trees, not a planted forest.","long":"These hills are the kingdom of the Tabor oak. Unlike the pine forests planted by the JNF, this is natural woodland: big, widely spaced trees — a 'park forest' — on pale rendzina soil formed from chalk. The Tabor oak drops some of its leaves in winter, which is why the hills turn yellow-brown in autumn. Not every tree you see is a Tabor oak, but most of the big solitary ones are.","fact":"Old Tabor oaks can live for centuries. They gave the nearby regional council its name: Alona, from 'alon', oak.","cue":"Between Shfeya junction and Bat Shlomo, where open woodland covers the hills.","caution":"Don't point at a specific tree as a Tabor oak.","more":["יער אלונים טבעי שמלווה אותנו עד הר חורשן.","במדרון המוצל — חורש סבוך של אלון מצוי ואלה; במדרון השמשי — יער פתוח של אלון התבור.","יערות האורן שנראה בהמשך נטעה קק״ל — הם לא חלק מהצומח הטבעי כאן."]},"ru":{"script":"Естественная роща таворских дубов — широкие, редко стоящие деревья, а не посаженный лес.","long":"Эти холмы — царство таворского дуба. В отличие от сосновых лесов, посаженных Еврейским национальным фондом, это естественное редколесье: крупные, далеко стоящие друг от друга деревья — «парковый лес» — на светлой почве рендзине, образовавшейся из мела. Зимой таворский дуб сбрасывает часть листьев, поэтому осенью холмы желтовато-бурые. Не каждое дерево за окном — таворский дуб, но большинство крупных одиночных деревьев — да.","fact":"Старые таворские дубы живут сотни лет. Они дали имя соседнему региональному совету — Алона, от «алон», дуб.","cue":"Между перекрёстком Шфея и Бат-Шломо, когда на холмах видно светлое редколесье.","caution":"Не указывать на конкретное дерево как на дуб Табор.","more":["יער אלונים טבעי שמלווה אותנו עד הר חורשן.","במדרון המוצל — חורש סבוך של אלון מצוי ואלה; במדרון השמשי — יער פתוח של אלון התבור.","יערות האורן שנראה בהמשך נטעה קק״ל — הם לא חלק מהצומח הטבעי כאן."]}}$v3$::jsonb, $v3${"stop":"S7","final":false,"topic":"Alona oak woodland","docs":"יאיר: 'מצד ימין — יערות אלונה, יער אלונים טבעי עד הר חורשן'; מפנה צפוני: אלון מצוי ואלה; מפנה דרומי: אלון התבור ולבנה. יוסי: 'מצד ימין', חורש אלון התבור, קרטון ורנדזינה. אחרי אליקים: יערות אורן נטועים של קק״ל (לא טבעיים)."}$v3$::jsonb),
($v3$v3:ROAD67-10$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$למה מכסים לעיתים קרובות את מטעי השסק ברשתות?$v3$, $v3$["כדי להגן מברד","כדי לשמור על חום בלילות החורף","כדי למנוע נשירת פרי ברוח","כדי להגן מציפורים ומעטלפים"]$v3$::jsonb, 3, $v3$פרי השסק המתוק מושך ציפורים ועטלפי פירות; הרשתות שומרות עליו עד הקטיף.$v3$, $v3$חקלאות$v3$, 2, 45, 6, $v3$הרשתות שומרות על הפרי — אחרת הציפורים והעטלפים אוכלים הכול לפנינו.$v3$, $v3$בעמקים לאורך הדרך גדלים מטעים — ובולט ביניהם השסק. השסק מבשיל באביב, כשיש מעט פירות אחרים, ולכן הוא מושך כל ציפור ועטלף פירות באזור. החקלאים פורשים רשתות מעל העצים — ככה גם לנו נשאר משהו לאכול. מסביב תראו גם כרמים וזיתים: האזור הזה מגדל פירות כבר מימי המושבות של הברון.$v3$, $v3$בעמק בין צומת שפיה לבת שלמה, אם רואים מטעים מכוסים ברשתות.$v3$, $v3$יאיר: מטעים — בולטים שסק, אפרסקים, שזיפים ורימונים, כרמים וזיתים. יוסי: 'מצד ימין בעמק מטעי שסק' מכוסים ברשתות בגלל ציפורים ועטלפים. לא אומת איפה בדיוק נראים מטעים מכוסים.$v3$, $v3$[{"title":"שסק יפני — ויקיפדיה","url":"https://he.wikipedia.org/wiki/שסק_יפני"}]$v3$::jsonb, $v3$עטלף הפירות המצוי יכול לעוף עשרות קילומטרים בלילה אחד כדי להגיע למטע — ממש משלוח עד הבית.$v3$, $v3$check$v3$, $v3${"fr":{"text":"Pourquoi couvre-t-on souvent les vergers de néfliers de filets ?","options":["Pour protéger de la grêle","Pour garder la chaleur les nuits d'hiver","Pour éviter que le vent fasse tomber les fruits","Pour protéger des oiseaux et des chauves-souris"],"explanation":"La nèfle sucrée attire les oiseaux et les roussettes ; les filets la protègent jusqu'à la récolte.","category":"Agriculture"},"en":{"text":"Why are loquat orchards often covered with nets?","options":["To protect against hail","To keep warmth in on winter nights","To stop the wind knocking fruit down","To protect against birds and bats"],"explanation":"Sweet loquats attract birds and fruit bats; the nets protect them until harvest.","category":"Agriculture"},"ru":{"text":"Зачем сады мушмулы часто накрывают сетками?","options":["Чтобы защитить от града","Чтобы сохранять тепло зимними ночами","Чтобы ветер не сбивал плоды","Чтобы защитить от птиц и летучих мышей"],"explanation":"Сладкая мушмула привлекает птиц и крыланов; сетки сохраняют урожай до сбора.","category":"Сельское хозяйство"}}$v3$::jsonb, $v3${"he":{"script":"הרשתות שומרות על הפרי — אחרת הציפורים והעטלפים אוכלים הכול לפנינו.","long":"בעמקים לאורך הדרך גדלים מטעים — ובולט ביניהם השסק. השסק מבשיל באביב, כשיש מעט פירות אחרים, ולכן הוא מושך כל ציפור ועטלף פירות באזור. החקלאים פורשים רשתות מעל העצים — ככה גם לנו נשאר משהו לאכול. מסביב תראו גם כרמים וזיתים: האזור הזה מגדל פירות כבר מימי המושבות של הברון.","fact":"עטלף הפירות המצוי יכול לעוף עשרות קילומטרים בלילה אחד כדי להגיע למטע — ממש משלוח עד הבית.","cue":"בעמק בין צומת שפיה לבת שלמה, אם רואים מטעים מכוסים ברשתות.","caution":"לשאול רק אם אכן רואים רשתות מהחלון.","more":["השסק פורח בסתיו ונותן פרי באביב — מהפירות הראשונים של העונה.","לאורך הוואדי גדלים גם אפרסקים, שזיפים, רימונים, כרמים וזיתים."]},"fr":{"script":"Les filets protègent les fruits : sinon les oiseaux et les chauves-souris mangent tout avant nous.","long":"Dans les vallons, le long de la route, poussent des vergers, notamment de néfliers du Japon. La nèfle mûrit au printemps, quand il y a peu d'autres fruits : elle attire donc tous les oiseaux et chauves-souris frugivores du coin. Les agriculteurs tendent des filets au-dessus des arbres — pour qu'il en reste un peu pour nous. Autour, vous verrez aussi des vignes et des oliviers : on cultive des fruits ici depuis l'époque des colonies du Baron.","fact":"La roussette d'Égypte peut parcourir des dizaines de kilomètres en une nuit pour atteindre un verger : une vraie livraison à domicile.","cue":"Dans la vallée entre le carrefour de Shfeya et Bat Shlomo, si l'on voit des vergers sous filets.","caution":"Ne poser la question que si on voit vraiment des filets par la fenêtre.","more":["השסק פורח בסתיו ונותן פרי באביב — מהפירות הראשונים של העונה.","לאורך הוואדי גדלים גם אפרסקים, שזיפים, רימונים, כרמים וזיתים."]},"en":{"script":"The nets protect the fruit — otherwise the birds and bats eat it all before we do.","long":"In the little valleys along the road grow orchards — loquats stand out among them. Loquats ripen in spring, when few other fruits are around, so they attract every bird and fruit bat in the area. Farmers stretch nets over the trees so there's something left for us. You'll also see vineyards and olive groves: fruit has been grown here since the days of the Baron's colonies.","fact":"The Egyptian fruit bat can fly dozens of kilometres in a single night to reach an orchard — true home delivery.","cue":"In the valley between Shfeya junction and Bat Shlomo, if netted orchards are visible.","caution":"Only ask if nets are actually visible from the window.","more":["השסק פורח בסתיו ונותן פרי באביב — מהפירות הראשונים של העונה.","לאורך הוואדי גדלים גם אפרסקים, שזיפים, רימונים, כרמים וזיתים."]},"ru":{"script":"Сетки берегут плоды — иначе птицы и летучие мыши съедят всё раньше нас.","long":"В долинах вдоль дороги растут сады, и среди них выделяется японская мушмула. Она созревает весной, когда других фруктов мало, и поэтому привлекает всех птиц и плодоядных летучих мышей в округе. Фермеры натягивают над деревьями сетки — чтобы и нам что-то осталось. Вокруг вы увидите и виноградники, и оливы: фрукты здесь выращивают ещё со времён колоний барона.","fact":"Египетский крылан может пролететь за ночь десятки километров, чтобы добраться до сада, — настоящая доставка на дом.","cue":"В долине между перекрёстком Шфея и Бат-Шломо, если видны сады под сетками.","caution":"Задавать вопрос, только если из окна действительно видны сетки.","more":["השסק פורח בסתיו ונותן פרי באביב — מהפירות הראשונים של העונה.","לאורך הוואדי גדלים גם אפרסקים, שזיפים, רימונים, כרמים וזיתים."]}}$v3$::jsonb, $v3${"stop":"S10","final":false,"topic":"Loquat orchards","docs":"יאיר: מטעים — בולטים שסק, אפרסקים, שזיפים ורימונים, כרמים וזיתים. יוסי: 'מצד ימין בעמק מטעי שסק' מכוסים ברשתות בגלל ציפורים ועטלפים. לא אומת איפה בדיוק נראים מטעים מכוסים."}$v3$::jsonb),
($v3$v3:ROAD67-03$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$המושבה בת שלמה (1889) נקראה על שם —$v3$, $v3$["אשתו של הברון","אמו של הברון (בתו של שלמה)","בתו של הברון","בתו של המלך שלמה"]$v3$::jsonb, 1, $v3$השם מכבד את בטי (בתיה) רוטשילד — אמו של הברון אדמונד דה רוטשילד ובתו של שלמה (סלומון) רוטשילד. המושבה נוסדה ב-1889.$v3$, $v3$היסטוריה$v3$, 2, 45, 7, $v3$נוסדה ב-1889, על שם אמו של הברון — בתו של שלמה רוטשילד.$v3$, $v3$אנחנו ליד בת שלמה — מהמושבות הקטנות של הברון רוטשילד, שנוסדה ב-1889. השם הוא מחווה משפחתית: אמו של הברון, בטי, הייתה בתו של שלמה רוטשילד — ומכאן 'בת שלמה'. הרחוב הראשי שומר עד היום על בתי האבן של המושבה הוותיקה, ומסביב כרמים, מטעים וחורש של אלוני תבור. זו מושבה קטנה מאוד — וזה בדיוק מה ששמר על הקסם שלה.$v3$, $v3$כ-8 ק״מ, באזור מחלף בת שלמה.$v3$, $v3$יאיר: 'מצד ימין', מושבת ברון מ-1889, 'אחרי קום המדינה הוקם גם מושב של עולי אירופה' (לא אומת — לא נכלל). יוסי: 'מימין ומשמאל — המושבה מימין', על שם בטי, בת שלמה רוטשילד, אמו של הברון; רחוב ראשי בשימור. מחלף בת שלמה: 32.598, 35.005 (ויקיפדיה).$v3$, $v3$[{"title":"Bat Shlomo — Wikipedia","url":"https://en.wikipedia.org/wiki/Bat_Shlomo"},{"title":"מחלף בת שלמה — ויקיפדיה","url":"https://he.wikipedia.org/wiki/מחלף_בת_שלמה"}]$v3$::jsonb, $v3$באזור הזה מסתתרים שלושה דורות של רוטשילדים: זכרון יעקב על שם אביו של הברון (ג'יימס-יעקב), מאיר שפיה על שם סבו, ובת שלמה על שם אמו.$v3$, $v3$check$v3$, $v3${"fr":{"text":"La colonie de Bat Shlomo (1889) doit son nom à…","options":["La femme du baron","La mère du baron (fille de Salomon)","La fille du baron","La fille du roi Salomon"],"explanation":"Le nom honore Betty de Rothschild, mère du baron Edmond de Rothschild et fille de Salomon (Shlomo) de Rothschild. La colonie a été fondée en 1889.","category":"Histoire"},"en":{"text":"The colony of Bat Shlomo (1889) is named after —","options":["The baron's wife","The baron's mother (Salomon's daughter)","The baron's daughter","King Solomon's daughter"],"explanation":"The name honours Betty de Rothschild — mother of Baron Edmond de Rothschild and daughter of Salomon (Shlomo) Rothschild. The colony was founded in 1889.","category":"History"},"ru":{"text":"Колония Бат-Шломо (1889) названа в честь…","options":["Жена барона","Мать барона (дочь Соломона)","Дочь барона","Дочь царя Соломона"],"explanation":"Название в честь Бетти Ротшильд — матери барона Эдмона де Ротшильда и дочери Соломона (Шломо) Ротшильда. Колония основана в 1889 году.","category":"История"}}$v3$::jsonb, $v3${"he":{"script":"נוסדה ב-1889, על שם אמו של הברון — בתו של שלמה רוטשילד.","long":"אנחנו ליד בת שלמה — מהמושבות הקטנות של הברון רוטשילד, שנוסדה ב-1889. השם הוא מחווה משפחתית: אמו של הברון, בטי, הייתה בתו של שלמה רוטשילד — ומכאן 'בת שלמה'. הרחוב הראשי שומר עד היום על בתי האבן של המושבה הוותיקה, ומסביב כרמים, מטעים וחורש של אלוני תבור. זו מושבה קטנה מאוד — וזה בדיוק מה ששמר על הקסם שלה.","fact":"באזור הזה מסתתרים שלושה דורות של רוטשילדים: זכרון יעקב על שם אביו של הברון (ג'יימס-יעקב), מאיר שפיה על שם סבו, ובת שלמה על שם אמו.","cue":"כ-8 ק״מ, באזור מחלף בת שלמה.","caution":"","more":["בטי, אמו של הברון, הייתה גם אחייניתו של אביו — אצל הרוטשילדים התחתנו בתוך המשפחה.","הרחוב הראשי שמור כמו לפני יותר מ-130 שנה — מוזיאון חי של מושבת ברון.","אחרי קום המדינה קם לידה גם מושב — שתי תקופות של התיישבות, זו לצד זו."]},"fr":{"script":"Fondée en 1889, elle porte le nom de la mère du Baron, fille de Salomon de Rothschild.","long":"Nous passons près de Bat Shlomo, l'une des petites colonies du baron de Rothschild, fondée en 1889. Le nom est un hommage familial : la mère du Baron, Betty, était la fille de Salomon de Rothschild — d'où « Bat Shlomo », « la fille de Salomon ». La rue principale garde ses maisons de pierre d'origine, entourées de vignes, de vergers et de chênes du Tabor. Une toute petite colonie, et c'est justement ce qui a préservé son charme.","fact":"Trois générations de Rothschild se cachent dans le paysage : Zikhron Yaakov porte le nom du père du Baron (James-Yaakov), Meir Shfeya celui de son grand-père, et Bat Shlomo celui de sa mère.","cue":"Vers le km 8, à l'échangeur de Bat Shlomo.","caution":"","more":["בטי, אמו של הברון, הייתה גם אחייניתו של אביו — אצל הרוטשילדים התחתנו בתוך המשפחה.","הרחוב הראשי שמור כמו לפני יותר מ-130 שנה — מוזיאון חי של מושבת ברון.","אחרי קום המדינה קם לידה גם מושב — שתי תקופות של התיישבות, זו לצד זו."]},"en":{"script":"Founded in 1889 and named after the Baron's mother, Salomon Rothschild's daughter.","long":"We're passing Bat Shlomo, one of Baron de Rothschild's small colonies, founded in 1889. The name is a family tribute: the Baron's mother, Betty, was the daughter of Salomon Rothschild — hence 'Bat Shlomo', 'Shlomo's daughter'. The main street still keeps the original stone houses, surrounded by vineyards, orchards and Tabor oaks. It's a tiny colony — and that's exactly what kept its charm.","fact":"Three generations of Rothschilds hide in this landscape: Zikhron Ya'akov is named after the Baron's father (James-Yaakov), Meir Shfeya after his grandfather, and Bat Shlomo after his mother.","cue":"Around km 8, at the Bat Shlomo interchange.","caution":"","more":["בטי, אמו של הברון, הייתה גם אחייניתו של אביו — אצל הרוטשילדים התחתנו בתוך המשפחה.","הרחוב הראשי שמור כמו לפני יותר מ-130 שנה — מוזיאון חי של מושבת ברון.","אחרי קום המדינה קם לידה גם מושב — שתי תקופות של התיישבות, זו לצד זו."]},"ru":{"script":"Основана в 1889 году и названа в честь матери барона — дочери Соломона Ротшильда.","long":"Мы проезжаем Бат-Шломо — одну из маленьких колоний барона Ротшильда, основанную в 1889 году. Название — семейный жест: мать барона, Бетти, была дочерью Соломона Ротшильда, отсюда «Бат-Шломо» — «дочь Шломо». Главная улица до сих пор хранит старые каменные дома, вокруг виноградники, сады и рощи таворского дуба. Колония совсем крошечная — именно поэтому она сохранила своё очарование.","fact":"В этом пейзаже спрятаны три поколения Ротшильдов: Зихрон-Яаков назван в честь отца барона (Джеймса-Яакова), Меир-Шфея — в честь деда, а Бат-Шломо — в честь матери.","cue":"Около 8-го км, у развязки Бат-Шломо.","caution":"","more":["בטי, אמו של הברון, הייתה גם אחייניתו של אביו — אצל הרוטשילדים התחתנו בתוך המשפחה.","הרחוב הראשי שמור כמו לפני יותר מ-130 שנה — מוזיאון חי של מושבת ברון.","אחרי קום המדינה קם לידה גם מושב — שתי תקופות של התיישבות, זו לצד זו."]}}$v3$::jsonb, $v3${"stop":"S3","final":false,"topic":"Bat Shlomo","docs":"יאיר: 'מצד ימין', מושבת ברון מ-1889, 'אחרי קום המדינה הוקם גם מושב של עולי אירופה' (לא אומת — לא נכלל). יוסי: 'מימין ומשמאל — המושבה מימין', על שם בטי, בת שלמה רוטשילד, אמו של הברון; רחוב ראשי בשימור. מחלף בת שלמה: 32.598, 35.005 (ויקיפדיה)."}$v3$::jsonb),
($v3$v3:ROAD67-09$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$מדוע הגבעות לאורך הדרך רכות ומעוגלות ולא חדות?$v3$, $v3$["כי הן מבזלת של הר געש","כי הן מגרניט קשה ועתיק","כי הן מקירטון רך שנשחק בקלות","כי הן דיונות חול שנדדו מהים"]$v3$::jsonb, 2, $v3$קירטון הוא סלע גירי רך יחסית; במשך מיליוני שנים הבליה והסחיפה עיגלו את הגבעות.$v3$, $v3$גאולוגיה$v3$, 2, 45, 8, $v3$הגבעות עגולות כי הן מקירטון — סלע רך מקרקעית ים עתיקה.$v3$, $v3$תסתכלו על הגבעות: אין כאן צוקים חדים, רק גבעות רכות ומעוגלות. הסיבה — הסלע. רוב האזור בנוי מקירטון, סלע גירי רך שנוצר בקרקעית ים מיליארדי שלדים זעירים של יצורים ימיים. גשם ורוח שוחקים אותו בקלות, וכך במשך מיליוני שנים הגבעות התעגלו. בחתכי הדרך אפשר לראות לפעמים פסים כהים של צור — סלע קשה מאוד, ממנו עשו בני האדם הקדמונים כלים.$v3$, $v3$בעלייה במעלה נחל תות / באזור חתכי הדרך. אפשר לשאול בכל מקום על כביש 67.$v3$, $v3$יאיר: גבעות רכות ומעוגלות מקירטון רך, בליה וסחיפה. יוסי: 'צד ימין — שכבות סלע קרטון וצור לחלופין' (חתך דרך אחרי עין תות), פלנקטון בעל שלד גיר (חורריות) ובעל שלד צורן (רדיולריות). לא אומת איזה חתך דרך נראה.$v3$, $v3$[{"title":"רמות מנשה — ויקיפדיה","url":"https://he.wikipedia.org/wiki/רמות_מנשה"}]$v3$::jsonb, $v3$הקירטון הוא בעצם 'בית קברות' של יצורים ימיים מיקרוסקופיים — הוכחה לכך שכל האזור הזה היה פעם קרקעית ים.$v3$, $v3$check$v3$, $v3${"fr":{"text":"Pourquoi les collines le long de la route sont-elles douces et arrondies plutôt qu'escarpées ?","options":["Parce qu’elles sont en basalte volcanique","Parce qu’elles sont en granite dur et ancien","Parce qu’elles sont en craie tendre qui s’érode facilement","Parce que ce sont des dunes venues de la mer"],"explanation":"La craie est une roche calcaire assez tendre : en quelques millions d'années, l'altération et l'érosion ont arrondi les collines.","category":"Géologie"},"en":{"text":"Why are the hills along the road soft and rounded rather than sharp?","options":["Because they are volcanic basalt","Because they are hard, ancient granite","Because they are soft chalk that erodes easily","Because they are sand dunes from the sea"],"explanation":"Chalk is a fairly soft limestone; over millions of years weathering and erosion rounded the hills.","category":"Geology"},"ru":{"text":"Почему холмы вдоль дороги мягкие и округлые, а не острые?","options":["Потому что это вулканический базальт","Потому что это твёрдый древний гранит","Потому что это мягкий мел, который легко размывается","Потому что это песчаные дюны с моря"],"explanation":"Мел — довольно мягкая известковая порода; за миллионы лет выветривание и эрозия скруглили холмы.","category":"Геология"}}$v3$::jsonb, $v3${"he":{"script":"הגבעות עגולות כי הן מקירטון — סלע רך מקרקעית ים עתיקה.","long":"תסתכלו על הגבעות: אין כאן צוקים חדים, רק גבעות רכות ומעוגלות. הסיבה — הסלע. רוב האזור בנוי מקירטון, סלע גירי רך שנוצר בקרקעית ים מיליארדי שלדים זעירים של יצורים ימיים. גשם ורוח שוחקים אותו בקלות, וכך במשך מיליוני שנים הגבעות התעגלו. בחתכי הדרך אפשר לראות לפעמים פסים כהים של צור — סלע קשה מאוד, ממנו עשו בני האדם הקדמונים כלים.","fact":"הקירטון הוא בעצם 'בית קברות' של יצורים ימיים מיקרוסקופיים — הוכחה לכך שכל האזור הזה היה פעם קרקעית ים.","cue":"בעלייה במעלה נחל תות / באזור חתכי הדרך. אפשר לשאול בכל מקום על כביש 67.","caution":"לא להבטיח שרואים שכבות צור.","more":["בחתך הסלע ליד הכביש רואים שכבות של קירטון וצור לסירוגין — עדות לים עתיק שהשתנה.","על הקירטון נוצרת אדמה בהירה, רנדזינה, שאלוני התבור אוהבים."]},"fr":{"script":"Les collines sont rondes parce qu'elles sont en craie, une roche tendre née au fond d'une mer ancienne.","long":"Regardez les collines : pas de falaises abruptes, seulement des formes douces et arrondies. La raison, c'est la roche. La région est surtout faite de craie, une roche calcaire tendre formée au fond de la mer par des milliards de minuscules squelettes d'organismes marins. La pluie et le vent l'usent facilement : en quelques millions d'années, les collines se sont arrondies. Dans les tranchées de la route, on voit parfois des bandes sombres de silex, une roche très dure dont les hommes préhistoriques faisaient leurs outils.","fact":"La craie est en réalité un « cimetière » de micro-organismes marins : la preuve que toute la région était autrefois un fond de mer.","cue":"Dans la montée le long du Nahal Tut / près des tranchées de la route. Utilisable partout sur la route 67.","caution":"Ne pas promettre de voir des couches de silex.","more":["בחתך הסלע ליד הכביש רואים שכבות של קירטון וצור לסירוגין — עדות לים עתיק שהשתנה.","על הקירטון נוצרת אדמה בהירה, רנדזינה, שאלוני התבור אוהבים."]},"en":{"script":"The hills are round because they're chalk — a soft rock from an ancient seabed.","long":"Look at the hills: no sharp cliffs, just soft, rounded shapes. The reason is the rock. Most of the area is chalk, a soft limestone formed on the seabed from billions of tiny skeletons of marine creatures. Rain and wind wear it down easily, so over millions of years the hills became rounded. In the road cuts you can sometimes see dark bands of flint — a very hard rock that prehistoric people used for tools.","fact":"Chalk is really a 'graveyard' of microscopic sea creatures — proof that this whole area was once the bottom of the sea.","cue":"On the climb along Nahal Tut / near the road cuts. Usable anywhere on Road 67.","caution":"Don't promise that flint layers are visible.","more":["בחתך הסלע ליד הכביש רואים שכבות של קירטון וצור לסירוגין — עדות לים עתיק שהשתנה.","על הקירטון נוצרת אדמה בהירה, רנדזינה, שאלוני התבור אוהבים."]},"ru":{"script":"Холмы круглые, потому что они из мела — мягкой породы со дна древнего моря.","long":"Посмотрите на холмы: никаких острых скал, только мягкие округлые формы. Причина — в породе. Район сложен в основном мелом — мягким известняком, который образовался на морском дне из миллиардов крошечных скелетов морских организмов. Дождь и ветер легко его стирают, и за миллионы лет холмы скруглились. В дорожных выемках иногда видны тёмные полосы кремня — очень твёрдой породы, из которой древние люди делали орудия.","fact":"Мел — это, по сути, «кладбище» микроскопических морских существ: доказательство того, что весь этот район когда-то был морским дном.","cue":"На подъёме вдоль ручья Тут / у дорожных выемок. Подходит для любого места на шоссе 67.","caution":"Не обещать, что видны слои кремня.","more":["בחתך הסלע ליד הכביש רואים שכבות של קירטון וצור לסירוגין — עדות לים עתיק שהשתנה.","על הקירטון נוצרת אדמה בהירה, רנדזינה, שאלוני התבור אוהבים."]}}$v3$::jsonb, $v3${"stop":"S9","final":false,"topic":"Ramat Menashe geology","docs":"יאיר: גבעות רכות ומעוגלות מקירטון רך, בליה וסחיפה. יוסי: 'צד ימין — שכבות סלע קרטון וצור לחלופין' (חתך דרך אחרי עין תות), פלנקטון בעל שלד גיר (חורריות) ובעל שלד צורן (רדיולריות). לא אומת איזה חתך דרך נראה."}$v3$::jsonb),
($v3$v3:ROAD67-14$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$הכרמל ורמות מנשה, משני צדי הכביש, הוכרזו על ידי אונסק״ו כ…$v3$, $v3$["שמורות ביוספרה","גאופארקים עולמיים","אתרי מורשת חקלאית עולמית","שמורות שמיים חשוכים"]$v3$::jsonb, 0, $v3$הכרמל (1996) ורמות מנשה (2011) הם שמורות ביוספרה של אונסק״ו — אזורים שבהם לומדים איך אנשים וטבע חיים יחד.$v3$, $v3$טבע וסביבה$v3$, 2, 45, 9, $v3$שתיהן שמורות ביוספרה של אונסק״ו — אנשים וטבע חיים יחד.$v3$, $v3$תסתכלו מסביב: משני צדי הכביש יש שני אזורים מיוחדים בעיני העולם. הכרמל מצפון ורמות מנשה מדרום הוכרזו על ידי אונסק״ו כשמורות ביוספרה. זה לא אומר שאסור לגור בהם — להפך: בשמורת ביוספרה בודקים איך אפשר לחיות, לגדל פרות, מטעים וכרמים, ובכל זאת לשמור על החורש, על הנחלים ועל בעלי החיים. הכביש שלנו עובר בדיוק בגבול שביניהם.$v3$, $v3$בקטע האחרון של כביש 67, לפני עין תות — הכרמל משמאל, רמות מנשה מימין.$v3$, $v3$לא מופיע במסמכים. מקור: UNESCO — שמורת הביוספרה הר הכרמל (1996) ושמורת הביוספרה רמות מנשה (2011). הכביש עובר בין שני האזורים.$v3$, $v3$[{"title":"UNESCO — Ramot Menashe Biosphere Reserve","url":"https://www.unesco.org/en/mab/ramot-menashe"},{"title":"UNESCO — Mount Carmel Biosphere Reserve","url":"https://www.unesco.org/en/mab/mount-carmel"}]$v3$::jsonb, $v3$ברמות מנשה רועים עדרי בקר בין אלוני התבור — הבקר עוזר למנוע שריפות, כי הוא אוכל את העשב היבש.$v3$, $v3$topic$v3$, $v3${"fr":{"text":"Le Carmel et les collines de Menashe, de part et d'autre de la route, ont été classés par l'UNESCO comme…","options":["Réserves de biosphère","Géoparcs mondiaux","Sites du patrimoine agricole mondial","Réserves de ciel étoilé"],"explanation":"Le Carmel (1996) et les collines de Menashe (2011) sont des réserves de biosphère de l'UNESCO : des territoires où l'on apprend à faire vivre ensemble l'homme et la nature.","category":"Nature et environnement"},"en":{"text":"Mount Carmel and the Menashe Heights, on either side of the road, were designated by UNESCO as…","options":["Biosphere reserves","Global geoparks","World agricultural heritage sites","Dark-sky reserves"],"explanation":"Mount Carmel (1996) and the Menashe Heights (2011) are UNESCO biosphere reserves — areas where people learn how humans and nature can live together.","category":"Nature and environment"},"ru":{"text":"Кармель и возвышенность Менаше по обе стороны дороги ЮНЕСКО объявила…","options":["Биосферные заповедники","Всемирные геопарки","Объекты мирового сельскохозяйственного наследия","Заповедники тёмного неба"],"explanation":"Кармель (1996) и Менаше (2011) — биосферные заповедники ЮНЕСКО: территории, где учатся тому, как человеку и природе жить вместе.","category":"Природа"}}$v3$::jsonb, $v3${"he":{"script":"שתיהן שמורות ביוספרה של אונסק״ו — אנשים וטבע חיים יחד.","long":"תסתכלו מסביב: משני צדי הכביש יש שני אזורים מיוחדים בעיני העולם. הכרמל מצפון ורמות מנשה מדרום הוכרזו על ידי אונסק״ו כשמורות ביוספרה. זה לא אומר שאסור לגור בהם — להפך: בשמורת ביוספרה בודקים איך אפשר לחיות, לגדל פרות, מטעים וכרמים, ובכל זאת לשמור על החורש, על הנחלים ועל בעלי החיים. הכביש שלנו עובר בדיוק בגבול שביניהם.","fact":"ברמות מנשה רועים עדרי בקר בין אלוני התבור — הבקר עוזר למנוע שריפות, כי הוא אוכל את העשב היבש.","cue":"בקטע האחרון של כביש 67, לפני עין תות — הכרמל משמאל, רמות מנשה מימין.","caution":"לא מופיע במסמכי ההדרכה — המקור הוא אונסק״ו. לא להצביע על גבול מסוים.","more":["נחל תות הוא כאן הגבול הטבעי בין הכרמל לרמות מנשה.","צידו המזרחי של הכרמל תלול, כי הוא נחתך בקו שבר — לכן הירידה ליקנעם חדה."]},"fr":{"script":"Ce sont deux réserves de biosphère de l'UNESCO : l'homme et la nature y vivent ensemble.","long":"Regardez autour de vous : de chaque côté de la route, deux territoires reconnus par le monde entier. Le Carmel au nord et les collines de Menashe au sud sont des réserves de biosphère de l'UNESCO. Cela ne veut pas dire qu'on n'a pas le droit d'y vivre, au contraire : on y cherche comment habiter, élever des vaches, cultiver vergers et vignes, tout en protégeant les bois, les ruisseaux et les animaux. Notre route passe exactement à la frontière entre les deux.","fact":"Dans les collines de Menashe, des troupeaux de vaches pâturent entre les chênes du Tabor : elles aident à prévenir les incendies en mangeant l'herbe sèche.","cue":"Sur la dernière partie de la route 67, avant Ein Tut : le Carmel à gauche, Menashe à droite.","caution":"Absent des documents de guidage : la source est l'UNESCO. Ne pas désigner de frontière précise.","more":["נחל תות הוא כאן הגבול הטבעי בין הכרמל לרמות מנשה.","צידו המזרחי של הכרמל תלול, כי הוא נחתך בקו שבר — לכן הירידה ליקנעם חדה."]},"en":{"script":"Both are UNESCO biosphere reserves — people and nature living together.","long":"Look around: on both sides of the road are two areas recognised by the whole world. Mount Carmel to the north and the Menashe Heights to the south are UNESCO biosphere reserves. That doesn't mean nobody may live there — quite the opposite: they test how people can live, raise cattle and grow orchards and vineyards while still protecting the woodland, the streams and the animals. Our road runs right along the border between them.","fact":"In the Menashe Heights, herds of cattle graze among the Tabor oaks — they help prevent fires by eating the dry grass.","cue":"On the last stretch of Road 67 before Ein Tut: Carmel on the left, Menashe on the right.","caution":"Not in the guide documents — the source is UNESCO. Don't point at a specific boundary.","more":["נחל תות הוא כאן הגבול הטבעי בין הכרמל לרמות מנשה.","צידו המזרחי של הכרמל תלול, כי הוא נחתך בקו שבר — לכן הירידה ליקנעם חדה."]},"ru":{"script":"Оба района — биосферные заповедники ЮНЕСКО: человек и природа живут вместе.","long":"Посмотрите вокруг: по обе стороны дороги — две территории, признанные всем миром. Кармель на севере и возвышенность Менаше на юге — биосферные заповедники ЮНЕСКО. Это не значит, что жить там запрещено, наоборот: здесь ищут способ жить, разводить коров, выращивать сады и виноградники и при этом беречь леса, ручьи и животных. Наша дорога проходит как раз по границе между ними.","fact":"На возвышенности Менаше среди таворских дубов пасутся стада коров — они помогают предотвращать пожары, поедая сухую траву.","cue":"На последнем участке шоссе 67 перед Эйн-Тутом: Кармель слева, Менаше справа.","caution":"Этого нет в документах гидов — источник ЮНЕСКО. Не показывать конкретную границу.","more":["נחל תות הוא כאן הגבול הטבעי בין הכרמל לרמות מנשה.","צידו המזרחי של הכרמל תלול, כי הוא נחתך בקו שבר — לכן הירידה ליקנעם חדה."]}}$v3$::jsonb, $v3${"stop":"S14","final":false,"topic":"Biosphere reserves","docs":"לא מופיע במסמכים. מקור: UNESCO — שמורת הביוספרה הר הכרמל (1996) ושמורת הביוספרה רמות מנשה (2011). הכביש עובר בין שני האזורים."}$v3$::jsonb),
($v3$v3:ROAD67-04$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$תחנת הכוח חגית, ליד מחלף עין תות, מייצרת חשמל בעיקר מ…$v3$, $v3$["פחם","אנרגיית רוח","אנרגיה סולארית","גז טבעי"]$v3$::jsonb, 3, $v3$חגית היא תחנת כוח שפועלת בעיקר על גז טבעי, עם סולר כגיבוי.$v3$, $v3$אנרגיה$v3$, 2, 45, 10, $v3$תחנת הכוח עובדת על גז טבעי מהים התיכון. מכאן — כביש 6 בלי אגרה.$v3$, $v3$אנחנו מגיעים למחלף עין תות — כאן נגמר כביש 67 וממשיכים צפונה בכביש 6, בקטע שאין בו אגרה עד יקנעם. בסביבה נמצאת תחנת הכוח חגית. היא שורפת בעיקר גז טבעי שמגיע ממאגרי הגז בים התיכון, ומסובבת טורבינות שמייצרות חשמל. בטורבינות 'מחזור משולב' מנצלים גם את החום של גזי הפליטה כדי לייצר קיטור ולסובב טורבינה נוספת — יותר חשמל מאותה כמות דלק.$v3$, $v3$בהתקרבות למחלף עין תות, סוף כביש 67. לא להצביע על ארובה מסוימת.$v3$, $v3$יאיר: 'מצד שמאל', מופעלת בגז, שמה שונה לתחנת הכוח דוד לוי (דצמבר 2024), חגית מזרח נמכרה ונקראת 'אורות פנינה' — לא אומת. יוסי: 'משמאל'; הערת הבודק בסוף המסמך: 'תחנת הכוח — הארובות מימין'. התחנה: 32.617, 35.043 (GEO/Wikidata) — צפון-מערבית למחלף עין תות (32.610, 35.048).$v3$, $v3$[{"title":"Hagit power station — Global Energy Monitor","url":"https://www.gem.wiki/Hagit_power_station"},{"title":"מחלף עין תות — ויקיפדיה","url":"https://he.wikipedia.org/wiki/מחלף_עין_תות"}]$v3$::jsonb, $v3$'עין תות' — על שם המעיין שמצפון למחלף. ומתחת לתחנת הכוח נובעת סדרת מעיינות של נחל תות: חשמל וטבע במרחק של כמה מאות מטרים.$v3$, $v3$check$v3$, $v3${"fr":{"text":"La centrale électrique de Hagit, près de l'échangeur d'Ein Tut, produit surtout son électricité à partir…","options":["Charbon","Énergie éolienne","Énergie solaire","Gaz naturel"],"explanation":"Hagit fonctionne principalement au gaz naturel, avec du gazole en secours.","category":"Énergie"},"en":{"text":"The Hagit power station, near the Ein Tut interchange, makes electricity mainly from…","options":["Coal","Wind power","Solar energy","Natural gas"],"explanation":"Hagit runs mainly on natural gas, with diesel as a backup.","category":"Energy"},"ru":{"text":"Электростанция Хагит у развязки Эйн-Тут вырабатывает электричество в основном из…","options":["Уголь","Энергия ветра","Солнечная энергия","Природный газ"],"explanation":"Хагит работает в основном на природном газе, дизельное топливо — резервное.","category":"Энергетика"}}$v3$::jsonb, $v3${"he":{"script":"תחנת הכוח עובדת על גז טבעי מהים התיכון. מכאן — כביש 6 בלי אגרה.","long":"אנחנו מגיעים למחלף עין תות — כאן נגמר כביש 67 וממשיכים צפונה בכביש 6, בקטע שאין בו אגרה עד יקנעם. בסביבה נמצאת תחנת הכוח חגית. היא שורפת בעיקר גז טבעי שמגיע ממאגרי הגז בים התיכון, ומסובבת טורבינות שמייצרות חשמל. בטורבינות 'מחזור משולב' מנצלים גם את החום של גזי הפליטה כדי לייצר קיטור ולסובב טורבינה נוספת — יותר חשמל מאותה כמות דלק.","fact":"'עין תות' — על שם המעיין שמצפון למחלף. ומתחת לתחנת הכוח נובעת סדרת מעיינות של נחל תות: חשמל וטבע במרחק של כמה מאות מטרים.","cue":"בהתקרבות למחלף עין תות, סוף כביש 67. לא להצביע על ארובה מסוימת.","caution":"לא להזכיר את השם החדש ('דוד לוי') ואת מכירת 'חגית מזרח' — לא בטוח.","more":["התחנה עובדת בעיקר על גז, עם סולר כגיבוי — מהגדולות בצפון.","כשהקימו אותה הייתה התנגדות ציבורית, גם של יקנעם.","אם רואים מימין, ליד המחלף, שלדי מכוניות שרופות — זה מיצג לזכר 7 באוקטובר ומסיבת הנובה."]},"fr":{"script":"La centrale fonctionne au gaz naturel de la Méditerranée. À partir d'ici : la route 6, sans péage.","long":"Nous arrivons à l'échangeur d'Ein Tut : ici se termine la route 67, et nous continuons vers le nord sur la route 6, sur la section gratuite jusqu'à Yokneam. Tout près se trouve la centrale de Hagit. Elle brûle surtout du gaz naturel venu des gisements de la Méditerranée et fait tourner des turbines. Dans le « cycle combiné », la chaleur des gaz d'échappement produit aussi de la vapeur qui entraîne une seconde turbine : plus d'électricité avec le même combustible.","fact":"« Ein Tut », « la source du mûrier », doit son nom à une source au nord de l'échangeur. Et sous la centrale jaillissent les sources du Nahal Tut : énergie et nature à quelques centaines de mètres.","cue":"À l'approche de l'échangeur d'Ein Tut, fin de la route 67. Ne pas désigner une cheminée précise.","caution":"Ne pas mentionner le nouveau nom (« David Lévy ») ni la vente de « Hagit Est » — pas sûr.","more":["התחנה עובדת בעיקר על גז, עם סולר כגיבוי — מהגדולות בצפון.","כשהקימו אותה הייתה התנגדות ציבורית, גם של יקנעם.","אם רואים מימין, ליד המחלף, שלדי מכוניות שרופות — זה מיצג לזכר 7 באוקטובר ומסיבת הנובה."]},"en":{"script":"The power station runs on natural gas from the Mediterranean. From here: Road 6, toll-free.","long":"We're reaching the Ein Tut interchange: Road 67 ends here and we continue north on Road 6, on the toll-free section to Yokneam. Close by is the Hagit power station. It burns mostly natural gas from the Mediterranean gas fields and spins turbines that generate electricity. In 'combined-cycle' units the heat of the exhaust gases also makes steam that drives a second turbine — more electricity from the same fuel.","fact":"'Ein Tut' — 'the mulberry spring' — is named after a spring north of the interchange. And below the power station rise the springs of Nahal Tut: power and nature a few hundred metres apart.","cue":"Approaching the Ein Tut interchange, the end of Road 67. Don't point at a specific chimney.","caution":"Don't mention the new name ('David Levy') or the sale of 'Hagit East' — not certain.","more":["התחנה עובדת בעיקר על גז, עם סולר כגיבוי — מהגדולות בצפון.","כשהקימו אותה הייתה התנגדות ציבורית, גם של יקנעם.","אם רואים מימין, ליד המחלף, שלדי מכוניות שרופות — זה מיצג לזכר 7 באוקטובר ומסיבת הנובה."]},"ru":{"script":"Электростанция работает на природном газе из Средиземного моря. Дальше — шоссе 6 без оплаты.","long":"Мы подъезжаем к развязке Эйн-Тут: здесь заканчивается шоссе 67, и дальше мы едем на север по шоссе 6, по бесплатному участку до Йокнеама. Рядом находится электростанция Хагит. Она сжигает в основном природный газ с месторождений в Средиземном море и вращает турбины. В установках «комбинированного цикла» тепло выхлопных газов ещё и превращает воду в пар, который крутит вторую турбину: больше электричества из того же топлива.","fact":"«Эйн-Тут» — «тутовый источник» — назван по роднику к северу от развязки. А под электростанцией бьют родники ручья Тут: энергетика и природа в нескольких сотнях метров друг от друга.","cue":"При подъезде к развязке Эйн-Тут, в конце шоссе 67. Не указывать на конкретную трубу.","caution":"Не упоминать новое название («Давид Леви») и продажу «Хагит-Восток» — не точно.","more":["התחנה עובדת בעיקר על גז, עם סולר כגיבוי — מהגדולות בצפון.","כשהקימו אותה הייתה התנגדות ציבורית, גם של יקנעם.","אם רואים מימין, ליד המחלף, שלדי מכוניות שרופות — זה מיצג לזכר 7 באוקטובר ומסיבת הנובה."]}}$v3$::jsonb, $v3${"stop":"S4","final":false,"topic":"Hagit power station","docs":"יאיר: 'מצד שמאל', מופעלת בגז, שמה שונה לתחנת הכוח דוד לוי (דצמבר 2024), חגית מזרח נמכרה ונקראת 'אורות פנינה' — לא אומת. יוסי: 'משמאל'; הערת הבודק בסוף המסמך: 'תחנת הכוח — הארובות מימין'. התחנה: 32.617, 35.043 (GEO/Wikidata) — צפון-מערבית למחלף עין תות (32.610, 35.048)."}$v3$::jsonb),
($v3$v3:ROAD67-13$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$כביש 6, 'כביש חוצה ישראל', נקרא על שם —$v3$, $v3$["דוד בן-גוריון","יצחק רבין","מנחם בגין","לוי אשכול"]$v3$::jsonb, 1, $v3$כביש 6 נקרא 'דרך יצחק רבין', על שם ראש הממשלה שנרצח ב-1995.$v3$, $v3$ישראל היום$v3$, 2, 45, 11, $v3$״דרך יצחק רבין״ — הכביש הארוך בישראל, בלי קופות: מצלמות.$v3$, $v3$עכשיו עלינו על כביש 6 — כביש חוצה ישראל, שנקרא על שם ראש הממשלה יצחק רבין. זה הכביש הארוך במדינה: מאזור באר שבע בדרום ועד אזור קריית אתא בצפון. רוב הכביש הוא כביש אגרה עם מצלמות במקום קופות, אבל הקטע שאנחנו נוסעים בו עכשיו, מעין תות ליקנעם, הוא בחינם. פעם זה היה כביש 70 צר, והוא הורחב לארבעה נתיבים לכל כיוון.$v3$, $v3$אחרי מחלף עין תות, כשעולים על כביש 6 צפונה.$v3$, $v3$יאיר: מתחברים לכביש 6, כביש יצחק רבין, ראש הממשלה החמישי; מתחיל בצומת שוקת ומסתיים במחלף אלונים. יוסי: כביש אגרה; 'כביש 6 צפון נקרא על שם יצחק שמיר' — לא אומת. אומת: הקטע עין תות–יקנעם ללא אגרה (הורחב ב-2022).$v3$, $v3$[{"title":"Highway 6 (Israel) — Wikipedia","url":"https://en.wikipedia.org/wiki/Highway_6_(Israel)"},{"title":"Bizportal — הקטע עין תות–יקנעם","url":"https://www.bizportal.co.il/car/news/article/20014992"}]$v3$::jsonb, $v3$בכביש 6 אין קופות בכלל: מצלמות מזהות את לוחית הרישוי, והחשבון מגיע הביתה.$v3$, $v3$topic$v3$, $v3${"fr":{"text":"La route 6, « l'autoroute trans-Israël », porte le nom de…","options":["David Ben-Gourion","Yitzhak Rabin","Menahem Begin","Levi Eshkol"],"explanation":"La route 6 s'appelle « route Yitzhak-Rabin », du nom du Premier ministre assassiné en 1995.","category":"Israël aujourd'hui"},"en":{"text":"Road 6, the 'Cross-Israel Highway', is named after —","options":["David Ben-Gurion","Yitzhak Rabin","Menachem Begin","Levi Eshkol"],"explanation":"Road 6 is called the 'Yitzhak Rabin Highway', after the prime minister assassinated in 1995.","category":"Israel today"},"ru":{"text":"Шоссе 6, «Трансизраильское шоссе», названо в честь…","options":["Давид Бен-Гурион","Ицхак Рабин","Менахем Бегин","Леви Эшколь"],"explanation":"Шоссе 6 называется «дорогой Ицхака Рабина» — в честь премьер-министра, убитого в 1995 году.","category":"Израиль сегодня"}}$v3$::jsonb, $v3${"he":{"script":"״דרך יצחק רבין״ — הכביש הארוך בישראל, בלי קופות: מצלמות.","long":"עכשיו עלינו על כביש 6 — כביש חוצה ישראל, שנקרא על שם ראש הממשלה יצחק רבין. זה הכביש הארוך במדינה: מאזור באר שבע בדרום ועד אזור קריית אתא בצפון. רוב הכביש הוא כביש אגרה עם מצלמות במקום קופות, אבל הקטע שאנחנו נוסעים בו עכשיו, מעין תות ליקנעם, הוא בחינם. פעם זה היה כביש 70 צר, והוא הורחב לארבעה נתיבים לכל כיוון.","fact":"בכביש 6 אין קופות בכלל: מצלמות מזהות את לוחית הרישוי, והחשבון מגיע הביתה.","cue":"אחרי מחלף עין תות, כשעולים על כביש 6 צפונה.","caution":"מסמך יוסי טוען שהקטע הצפוני נקרא על שם יצחק שמיר — לא אומת; השאלה עוסקת בשם הכביש כולו.","more":["כביש 6 מתחיל בדרום בצומת שוקת ומסתיים בצפון במחלף אלונים.","יצחק רבין היה ראש הממשלה החמישי של ישראל."]},"fr":{"script":"La « route Yitzhak-Rabin », la plus longue d'Israël, sans péage à barrière : des caméras.","long":"Nous voici sur la route 6, l'autoroute trans-Israël, qui porte le nom du Premier ministre Yitzhak Rabin. C'est la plus longue route du pays, de la région de Beer-Sheva au sud jusqu'à Kiryat Ata au nord. Elle est en grande partie payante, avec des caméras au lieu de péages, mais le tronçon où nous roulons, d'Ein Tut à Yokneam, est gratuit. C'était autrefois l'étroite route 70, élargie à quatre voies dans chaque sens.","fact":"Il n'y a aucune barrière de péage sur la route 6 : des caméras lisent la plaque, et la facture arrive à la maison.","cue":"Après l'échangeur d'Ein Tut, en s'engageant sur la route 6 vers le nord.","caution":"Le document de Yossi dit que la section nord porte le nom d'Yitzhak Shamir : non vérifié. La question porte sur le nom de la route entière.","more":["כביש 6 מתחיל בדרום בצומת שוקת ומסתיים בצפון במחלף אלונים.","יצחק רבין היה ראש הממשלה החמישי של ישראל."]},"en":{"script":"The 'Yitzhak Rabin Highway' — Israel's longest road, no toll booths, just cameras.","long":"We're now on Road 6, the Cross-Israel Highway, named after Prime Minister Yitzhak Rabin. It's the longest road in the country, from the Be'er Sheva area in the south to Kiryat Ata in the north. Most of it is a toll road with cameras instead of booths, but the section we're on now, from Ein Tut to Yokneam, is free. It used to be the narrow Road 70 and was widened to four lanes in each direction.","fact":"Road 6 has no toll booths at all: cameras read your licence plate and the bill arrives at home.","cue":"After the Ein Tut interchange, as we join Road 6 northbound.","caution":"Yossi's notes claim the northern section is named after Yitzhak Shamir — not verified; the question is about the name of the whole road.","more":["כביש 6 מתחיל בדרום בצומת שוקת ומסתיים בצפון במחלף אלונים.","יצחק רבין היה ראש הממשלה החמישי של ישראל."]},"ru":{"script":"«Дорога Ицхака Рабина» — самая длинная в Израиле, без касс: только камеры.","long":"Мы выехали на шоссе 6 — Трансизраильское шоссе, названное в честь премьер-министра Ицхака Рабина. Это самая длинная дорога страны: от района Беэр-Шевы на юге до Кирьят-Аты на севере. Почти вся она платная, с камерами вместо касс, но участок, по которому мы едем, от Эйн-Тута до Йокнеама, бесплатный. Раньше здесь было узкое шоссе 70, а теперь по четыре полосы в каждую сторону.","fact":"На шоссе 6 нет ни одного шлагбаума: камеры считывают номер, и счёт приходит домой.","cue":"После развязки Эйн-Тут, когда выезжаем на шоссе 6 на север.","caution":"По записям Йоси, северный участок назван в честь Ицхака Шамира — не проверено; вопрос о названии всего шоссе.","more":["כביש 6 מתחיל בדרום בצומת שוקת ומסתיים בצפון במחלף אלונים.","יצחק רבין היה ראש הממשלה החמישי של ישראל."]}}$v3$::jsonb, $v3${"stop":"S13","final":false,"topic":"Road 6 Rabin","docs":"יאיר: מתחברים לכביש 6, כביש יצחק רבין, ראש הממשלה החמישי; מתחיל בצומת שוקת ומסתיים במחלף אלונים. יוסי: כביש אגרה; 'כביש 6 צפון נקרא על שם יצחק שמיר' — לא אומת. אומת: הקטע עין תות–יקנעם ללא אגרה (הורחב ב-2022)."}$v3$::jsonb),
($v3$v3:ROAD67-05$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$מושב אליקים הוקם בשנת 1949 על ידי עולים מ…$v3$, $v3$["עיראק","מרוקו","תימן","רומניה"]$v3$::jsonb, 2, $v3$אליקים הוא מושב עובדים שהקימו עולי תימן ב-1949, בתקופת העלייה הגדולה.$v3$, $v3$התיישבות$v3$, 2, 45, 12, $v3$מושב של עולי תימן מ-1949. אליקים — שמו המקורי של המלך יהויקים.$v3$, $v3$אנחנו מתקרבים למחלף אליקים. המושב הוקם ב-1949, שנה אחרי קום המדינה, על ידי עולים מתימן — בתקופת העלייה הגדולה, כשבתוך שנים ספורות הוקמו בארץ מאות יישובים חדשים. השם לקוח מהתנ״ך: אליקים היה שמו המקורי של יהויקים מלך יהודה, עד שפרעה נכה מלך מצרים שינה את שמו. אחרי המושב הכביש מתחיל לרדת בתלילות אל עמק יזרעאל.$v3$, $v3$על כביש 6, לפני מחלף אליקים.$v3$, $v3$יאיר: 'מצד ימין', מושב עובדים של יוצאי תימן, 1949, על שם יהויקים מלך יהודה. יוסי: 'מצד ימין', 1949, יושב על קו פרשת המים של רמות מנשה; הערת הבודק: 'הבתים משמאל'. מושב: 32.633, 35.066; מחלף אליקים: 32.636, 35.065 (ויקיפדיה).$v3$, $v3$[{"title":"Elyakim — Wikipedia","url":"https://en.wikipedia.org/wiki/Elyakim"},{"title":"מלכים ב׳ כג, לד","url":"https://he.wikisource.org/wiki/מלכים_ב_כג_לד"},{"title":"מחלף אליקים — ויקיפדיה","url":"https://he.wikipedia.org/wiki/מחלף_אליקים"}]$v3$::jsonb, $v3$'וימלך פרעה נכה את אליקים בן יאשיהו... ויסב את שמו יהויקים' (מלכים ב׳ כג, לד). ולפי מסמך יוסי, המושב יושב על קו פרשת המים של רמות מנשה — מצד אחד המים זורמים מערבה לנחל דליה, ומהצד השני צפונה אל הקישון.$v3$, $v3$check$v3$, $v3${"fr":{"text":"Le moshav d'Elyakim a été fondé en 1949 par des immigrants venus…","options":["Irak","Maroc","Yémen","Roumanie"],"explanation":"Elyakim est un moshav fondé en 1949 par des immigrants du Yémen, à l'époque de la grande vague d'immigration.","category":"Peuplement"},"en":{"text":"Moshav Elyakim was founded in 1949 by immigrants from…","options":["Iraq","Morocco","Yemen","Romania"],"explanation":"Elyakim is a cooperative moshav founded in 1949 by immigrants from Yemen, during the great wave of immigration.","category":"Settlement"},"ru":{"text":"Мошав Эльяким основали в 1949 году репатрианты из…","options":["Ирака","Марокко","Йемена","Румынии"],"explanation":"Эльяким — мошав, основанный в 1949 году выходцами из Йемена в период массовой алии.","category":"Заселение"}}$v3$::jsonb, $v3${"he":{"script":"מושב של עולי תימן מ-1949. אליקים — שמו המקורי של המלך יהויקים.","long":"אנחנו מתקרבים למחלף אליקים. המושב הוקם ב-1949, שנה אחרי קום המדינה, על ידי עולים מתימן — בתקופת העלייה הגדולה, כשבתוך שנים ספורות הוקמו בארץ מאות יישובים חדשים. השם לקוח מהתנ״ך: אליקים היה שמו המקורי של יהויקים מלך יהודה, עד שפרעה נכה מלך מצרים שינה את שמו. אחרי המושב הכביש מתחיל לרדת בתלילות אל עמק יזרעאל.","fact":"'וימלך פרעה נכה את אליקים בן יאשיהו... ויסב את שמו יהויקים' (מלכים ב׳ כג, לד). ולפי מסמך יוסי, המושב יושב על קו פרשת המים של רמות מנשה — מצד אחד המים זורמים מערבה לנחל דליה, ומהצד השני צפונה אל הקישון.","cue":"על כביש 6, לפני מחלף אליקים.","caution":"","more":["המושב יושב על קו פרשת המים של רמות מנשה.","אליקים שייך למועצה האזורית מגידו."]},"fr":{"script":"Un moshav d'immigrants du Yémen fondé en 1949. Elyakim était le premier nom du roi Joakim.","long":"Nous approchons de l'échangeur d'Elyakim. Le moshav a été fondé en 1949, un an après la création de l'État, par des immigrants du Yémen : c'est l'époque de la grande immigration, où des centaines de nouveaux villages naissent en quelques années. Le nom vient de la Bible : Elyakim était le nom d'origine du roi Joakim de Juda, avant que le pharaon Néko ne le change. Après le moshav, la route descend en pente raide vers la vallée de Jezréel.","fact":"« Le pharaon Néko fit roi Elyakim, fils de Josias… et changea son nom en Joakim » (II Rois 23, 34). Selon le document de Yossi, le moshav se trouve sur la ligne de partage des eaux de Menashe : d'un côté l'eau file vers le Nahal Dalia, de l'autre vers le Kishon.","cue":"Sur la route 6, avant l'échangeur d'Elyakim.","caution":"","more":["המושב יושב על קו פרשת המים של רמות מנשה.","אליקים שייך למועצה האזורית מגידו."]},"en":{"script":"A moshav of Yemenite immigrants from 1949. Eliakim was King Jehoiakim's original name.","long":"We're approaching the Elyakim interchange. The moshav was founded in 1949, a year after the state was established, by immigrants from Yemen — the time of mass immigration, when hundreds of new villages sprang up within a few years. The name comes from the Bible: Eliakim was the original name of King Jehoiakim of Judah, until Pharaoh Necho changed it. After the moshav the road begins its steep descent to the Jezreel Valley.","fact":"'Pharaoh Necho made Eliakim son of Josiah king… and changed his name to Jehoiakim' (2 Kings 23:34). According to Yossi's notes, the moshav sits on the Menashe watershed: on one side water flows west to Nahal Dalia, on the other north to the Kishon.","cue":"On Road 6, before the Elyakim interchange.","caution":"","more":["המושב יושב על קו פרשת המים של רמות מנשה.","אליקים שייך למועצה האזורית מגידו."]},"ru":{"script":"Мошав выходцев из Йемена, основан в 1949 году. Эльяким — первое имя царя Иоакима.","long":"Мы подъезжаем к развязке Эльяким. Мошав основали в 1949 году, через год после создания государства, репатрианты из Йемена — это время массовой алии, когда за несколько лет появились сотни новых посёлков. Название библейское: Эльяким — настоящее имя иудейского царя Иоакима, пока фараон Нехо не переименовал его. За мошавом дорога круто спускается к Изреельской долине.","fact":"«И воцарил фараон Нехо Елиакима, сына Иосии… и переменил имя его на Иоаким» (4 Царств 23:34). По записям Йоси, мошав стоит на водоразделе Менаше: с одной стороны вода стекает на запад к ручью Далия, с другой — на север к Кишону.","cue":"На шоссе 6, перед развязкой Эльяким.","caution":"","more":["המושב יושב על קו פרשת המים של רמות מנשה.","אליקים שייך למועצה האזורית מגידו."]}}$v3$::jsonb, $v3${"stop":"S5","final":false,"topic":"Elyakim","docs":"יאיר: 'מצד ימין', מושב עובדים של יוצאי תימן, 1949, על שם יהויקים מלך יהודה. יוסי: 'מצד ימין', 1949, יושב על קו פרשת המים של רמות מנשה; הערת הבודק: 'הבתים משמאל'. מושב: 32.633, 35.066; מחלף אליקים: 32.636, 35.065 (ויקיפדיה)."}$v3$::jsonb),
($v3$v3:ROAD67-06$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$איזו חברה ישראלית שפעלה ביוקנעם נרכשה על ידי אנבידיה בשנת 2020?$v3$, $v3$["מלאנוקס","מובילאיי","ווייז","אנוביט"]$v3$::jsonb, 0, $v3$אנבידיה השלימה ב-2020 את רכישת מלאנוקס, שפיתחה ביוקנעם טכנולוגיות תקשורת מהירות בין מחשבים ושרתים, בכשבעה מיליארד דולר.$v3$, $v3$הייטק$v3$, 2, 45, 13, $v3$מלאנוקס מיקנעם נקנתה ב-2020 בכ-7 מיליארד דולר. התחלנו ברוטשילד — מסיימים בבינה מלאכותית!$v3$, $v3$אנחנו מתקרבים ליוקנעם, שהפכה מעיירת פיתוח למרכז הייטק חשוב בצפון. חברת מלאנוקס, שפעלה כאן, פיתחה טכנולוגיות תקשורת מהירות שמחברות בין מחשבים ושרתים. בשנת 2020 רכשה אותה אנבידיה בכשבעה מיליארד דולר. ובתחילת 2026 דווח שאנבידיה חתמה על הסכם לשכירת עוד כ-29 אלף מטרים רבועים ביוקנעם. במקביל מתוכנן קמפוס גדול בקריית טבעון. התחלנו במושבות החקלאיות של הברון רוטשילד — ואנחנו מסיימים בעולם הבינה המלאכותית!$v3$, $v3$על כביש 6, לפני מחלף יקנעם.$v3$, $v3$יאיר: אזור התעשייה של יקנעם משמאל, מלאנוקס נקנתה ע״י אנבידיה. יוסי: מלאנוקס, 'נרכשה לפני מספר שנים'. אומת: הרכישה הושלמה ב-27.4.2020 (~6.9 מיליארד דולר). הסכם שכירות של כ-29 אלף מ״ר ביקנעם (מליסרון, פארק עופר) — דווח ב-2026. קמפוס עתידי בקריית טבעון — מקום אחר.$v3$, $v3$[{"title":"NVIDIA completes acquisition of Mellanox (27.4.2020)","url":"https://nvidianews.nvidia.com/news/nvidia-completes-acquisition-of-mellanox-creating-major-force-driving-next-gen-data-centers"},{"title":"Calcalist Tech","url":"https://www.calcalistech.com/ctechnews/article/wrvhykjum"},{"title":"ynet — כלכלה","url":"https://www.ynet.co.il/economy/article/yokra14616608"},{"title":"מרכז הנדל״ן — אנבידיה ביקנעם","url":"https://www.nadlancenter.co.il/article/13866"}]$v3$::jsonb, $v3$מלאנוקס נוסדה ב-1999 ביוקנעם. עשרים שנה אחר כך היא נמכרה באחת העסקאות הגדולות בתולדות ההייטק הישראלי.$v3$, $v3$topic$v3$, $v3${"fr":{"text":"Quelle entreprise israélienne installée à Yokneam a été rachetée par NVIDIA en 2020 ?","options":["Mellanox","Mobileye","Waze","Anobit"],"explanation":"En 2020, NVIDIA a finalisé le rachat de Mellanox, qui développait à Yokneam des technologies de communication ultra-rapide entre ordinateurs et serveurs, pour environ 7 milliards de dollars.","category":"High-tech"},"en":{"text":"Which Israeli company based in Yokneam was acquired by NVIDIA in 2020?","options":["Mellanox","Mobileye","Waze","Anobit"],"explanation":"In 2020 NVIDIA completed its acquisition of Mellanox, which developed high-speed networking between computers and servers in Yokneam, for about 7 billion dollars.","category":"High-tech"},"ru":{"text":"Какую израильскую компанию из Йокнеама купила NVIDIA в 2020 году?","options":["Mellanox","Mobileye","Waze","Anobit"],"explanation":"В 2020 году NVIDIA завершила покупку Mellanox — компании из Йокнеама, создававшей сверхбыструю связь между компьютерами и серверами, — примерно за 7 миллиардов долларов.","category":"Хай-тек"}}$v3$::jsonb, $v3${"he":{"script":"מלאנוקס מיקנעם נקנתה ב-2020 בכ-7 מיליארד דולר. התחלנו ברוטשילד — מסיימים בבינה מלאכותית!","long":"אנחנו מתקרבים ליוקנעם, שהפכה מעיירת פיתוח למרכז הייטק חשוב בצפון. חברת מלאנוקס, שפעלה כאן, פיתחה טכנולוגיות תקשורת מהירות שמחברות בין מחשבים ושרתים. בשנת 2020 רכשה אותה אנבידיה בכשבעה מיליארד דולר. ובתחילת 2026 דווח שאנבידיה חתמה על הסכם לשכירת עוד כ-29 אלף מטרים רבועים ביוקנעם. במקביל מתוכנן קמפוס גדול בקריית טבעון. התחלנו במושבות החקלאיות של הברון רוטשילד — ואנחנו מסיימים בעולם הבינה המלאכותית!","fact":"מלאנוקס נוסדה ב-1999 ביוקנעם. עשרים שנה אחר כך היא נמכרה באחת העסקאות הגדולות בתולדות ההייטק הישראלי.","cue":"על כביש 6, לפני מחלף יקנעם.","caution":"לא להגיד שרואים את בנייני אנבידיה מהאוטובוס. הקמפוס בקריית טבעון — מקום אחר.","more":["יקנעם עילית קמה ב-1950 כמעברה, הייתה עיירת פיתוח — ומ-2006 היא עיר.","מאז שנות ה-90 צמחה כאן תעשיית הייטק ותקשורת — ״סיליקון ואדי״ של הצפון.","רגע לפני הכניסה, למעלה משמאל: המוחרקה — שם, לפי המסורת, אליהו התמודד עם נביאי הבעל."]},"fr":{"script":"Mellanox, de Yokneam, a été rachetée en 2020 pour environ 7 milliards de dollars. Partis de Rothschild, nous finissons avec l'intelligence artificielle !","long":"Nous approchons de Yokneam, ancienne ville de développement devenue un grand pôle high-tech du Nord. La société Mellanox, installée ici, développait des technologies de communication ultra-rapide entre ordinateurs et serveurs. En 2020, NVIDIA l'a rachetée pour environ 7 milliards de dollars. Début 2026, on a appris que NVIDIA louait encore quelque 29 000 m² à Yokneam, et un grand campus est prévu à Kiryat Tivon. Nous sommes partis des colonies agricoles du baron de Rothschild… et nous finissons dans le monde de l'intelligence artificielle !","fact":"Mellanox a été fondée en 1999 à Yokneam. Vingt ans plus tard, elle était vendue lors de l'une des plus grosses transactions de l'histoire de la high-tech israélienne.","cue":"Sur la route 6, avant l'échangeur de Yokneam.","caution":"Ne pas dire qu'on voit les bâtiments NVIDIA depuis le car. Le campus de Kiryat Tivon est un autre lieu.","more":["יקנעם עילית קמה ב-1950 כמעברה, הייתה עיירת פיתוח — ומ-2006 היא עיר.","מאז שנות ה-90 צמחה כאן תעשיית הייטק ותקשורת — ״סיליקון ואדי״ של הצפון.","רגע לפני הכניסה, למעלה משמאל: המוחרקה — שם, לפי המסורת, אליהו התמודד עם נביאי הבעל."]},"en":{"script":"Mellanox from Yokneam was bought in 2020 for about 7 billion dollars. We started with Rothschild — and we end with AI!","long":"We're approaching Yokneam, which grew from a development town into a major high-tech hub of the north. Mellanox, based here, developed high-speed technologies that connect computers and servers. In 2020 NVIDIA bought it for about seven billion dollars. In early 2026 it was reported that NVIDIA signed for about 29,000 more square metres in Yokneam, and a large campus is planned in Kiryat Tivon. We started with Baron Rothschild's farming colonies — and we finish in the world of artificial intelligence!","fact":"Mellanox was founded in Yokneam in 1999. Twenty years later it was sold in one of the biggest deals in Israeli high-tech history.","cue":"On Road 6, before the Yokneam interchange.","caution":"Don't say the NVIDIA buildings can be seen from the bus. The Kiryat Tivon campus is a different place.","more":["יקנעם עילית קמה ב-1950 כמעברה, הייתה עיירת פיתוח — ומ-2006 היא עיר.","מאז שנות ה-90 צמחה כאן תעשיית הייטק ותקשורת — ״סיליקון ואדי״ של הצפון.","רגע לפני הכניסה, למעלה משמאל: המוחרקה — שם, לפי המסורת, אליהו התמודד עם נביאי הבעל."]},"ru":{"script":"Mellanox из Йокнеама купили в 2020 году примерно за 7 миллиардов долларов. Начали с Ротшильда — заканчиваем искусственным интеллектом!","long":"Мы подъезжаем к Йокнеаму — бывшему городу развития, ставшему крупным центром хай-тека на севере. Компания Mellanox, работавшая здесь, разрабатывала сверхбыстрые технологии связи между компьютерами и серверами. В 2020 году NVIDIA купила её примерно за семь миллиардов долларов. В начале 2026 года сообщили, что NVIDIA арендует в Йокнеаме ещё около 29 тысяч квадратных метров, а в Кирьят-Тивоне планируется большой кампус. Мы начали с сельскохозяйственных колоний барона Ротшильда — а заканчиваем в мире искусственного интеллекта!","fact":"Mellanox была основана в Йокнеаме в 1999 году. Через двадцать лет её продали в одной из крупнейших сделок в истории израильского хай-тека.","cue":"На шоссе 6, перед развязкой Йокнеам.","caution":"Не говорить, что здания NVIDIA видны из автобуса. Кампус в Кирьят-Тивоне — другое место.","more":["יקנעם עילית קמה ב-1950 כמעברה, הייתה עיירת פיתוח — ומ-2006 היא עיר.","מאז שנות ה-90 צמחה כאן תעשיית הייטק ותקשורת — ״סיליקון ואדי״ של הצפון.","רגע לפני הכניסה, למעלה משמאל: המוחרקה — שם, לפי המסורת, אליהו התמודד עם נביאי הבעל."]}}$v3$::jsonb, $v3${"stop":"S6","final":true,"topic":"NVIDIA Mellanox","docs":"יאיר: אזור התעשייה של יקנעם משמאל, מלאנוקס נקנתה ע״י אנבידיה. יוסי: מלאנוקס, 'נרכשה לפני מספר שנים'. אומת: הרכישה הושלמה ב-27.4.2020 (~6.9 מיליארד דולר). הסכם שכירות של כ-29 אלף מ״ר ביקנעם (מליסרון, פארק עופר) — דווח ב-2026. קמפוס עתידי בקריית טבעון — מקום אחר."}$v3$::jsonb),
($v3$v3:ROAD67-08$v3$, $v3$V3$v3$, $v3$MAIN$v3$, $v3$mcq$v3$, $v3$באיזה ספר בתנ״ך מופיע הפסוק 'מלך יקנעם לכרמל אחד'?$v3$, $v3$["שופטים","מלכים א׳","שמואל א׳","יהושע"]$v3$::jsonb, 3, $v3$יקנעם מופיעה ברשימת 31 המלכים שהכה יהושע (יהושע יב, כב).$v3$, $v3$תנ״ך$v3$, 2, 45, 14, $v3$מוזכרת בספר יהושע: ״מלך יקנעם לכרמל אחד״.$v3$, $v3$יקנעם היא עיר עתיקה מאוד. בספר יהושע היא מופיעה ברשימת המלכים שנכבשו: 'מלך יקנעם לכרמל אחד'. ועוד קודם, במאה ה-15 לפני הספירה, הפרעה תחותמס השלישי כתב את שמה — 'ענקעם' — ברשימת הערים שעבר בהן במסעו לכנען. תל יקנעם, שנחפר בידי הארכאולוג עמנון בן-תור, מכיל שכבות יישוב מתקופת הברונזה ועד התקופה העות'מאנית.$v3$, $v3$אחרי מחלף יקנעם, בכניסה ליקנעם — אחרי שאלת אנבידיה, אם נשאר זמן.$v3$, $v3$יוסי: 'ומלך יוקנעם לכרמל אחד', מסע תחותמס השלישי ('ענקעם'), תל יוקנעם נחפר בידי עמנון בן-תור. יאיר: יקנעם עילית הוקמה ב-1950 כמעברה, מועצה מקומית 1967, עיר 2006. לא אומת שהתל נראה מהכביש.$v3$, $v3$[{"title":"יהושע יב, כב","url":"https://he.wikisource.org/wiki/יהושע_יב_כב"},{"title":"Tel Yokneam — Wikipedia","url":"https://en.wikipedia.org/wiki/Tel_Yokneam"}]$v3$::jsonb, $v3$בתל יקנעם נמצאו יותר מעשרים שכבות יישוב — כמו עוגת שכבות של היסטוריה, אחת מעל השנייה.$v3$, $v3$nearby$v3$, $v3${"fr":{"text":"Dans quel livre de la Bible trouve-t-on le verset « le roi de Yokneam du Carmel, un » ?","options":["Juges","1 Rois","1 Samuel","Josué"],"explanation":"Yokneam figure dans la liste des 31 rois vaincus par Josué (Josué 12, 22).","category":"Bible"},"en":{"text":"In which book of the Bible do we read 'the king of Jokneam in Carmel, one'?","options":["Judges","1 Kings","1 Samuel","Joshua"],"explanation":"Yokneam appears in the list of the 31 kings defeated by Joshua (Joshua 12:22).","category":"Bible"},"ru":{"text":"В какой книге Библии сказано: «царь Иокнеама при Кармиле — один»?","options":["Судей","3-я Царств (1 Царей)","1-я Царств (1 Самуила)","Иисуса Навина"],"explanation":"Йокнеам входит в список 31 царя, побеждённых Иисусом Навином (Нав. 12:22).","category":"Библия"}}$v3$::jsonb, $v3${"he":{"script":"מוזכרת בספר יהושע: ״מלך יקנעם לכרמל אחד״.","long":"יקנעם היא עיר עתיקה מאוד. בספר יהושע היא מופיעה ברשימת המלכים שנכבשו: 'מלך יקנעם לכרמל אחד'. ועוד קודם, במאה ה-15 לפני הספירה, הפרעה תחותמס השלישי כתב את שמה — 'ענקעם' — ברשימת הערים שעבר בהן במסעו לכנען. תל יקנעם, שנחפר בידי הארכאולוג עמנון בן-תור, מכיל שכבות יישוב מתקופת הברונזה ועד התקופה העות'מאנית.","fact":"בתל יקנעם נמצאו יותר מעשרים שכבות יישוב — כמו עוגת שכבות של היסטוריה, אחת מעל השנייה.","cue":"אחרי מחלף יקנעם, בכניסה ליקנעם — אחרי שאלת אנבידיה, אם נשאר זמן.","caution":"תל יקנעם לא נראה מהכביש — לא להצביע.","more":["יקנעם מוזכרת גם בכתובת של פרעה תחותמס השלישי, יחד עם מגידו.","את תל יקנעם חפר הארכאולוג אמנון בן-תור — שכבות מתקופת הברונזה ועד התקופה העות׳מאנית.","יקנעם המושבה נוסדה בשנות ה-30."]},"fr":{"script":"Elle figure dans le livre de Josué : « le roi de Yokneam du Carmel, un ».","long":"Yokneam est une ville très ancienne. Le livre de Josué la cite parmi les rois vaincus : « le roi de Yokneam du Carmel, un ». Et bien avant, au XVe siècle avant notre ère, le pharaon Thoutmôsis III inscrivit son nom, « Ain-qenaam », parmi les villes traversées pendant sa campagne en Canaan. Le tell de Yokneam, fouillé par l'archéologue Amnon Ben-Tor, contient des niveaux d'occupation de l'âge du Bronze jusqu'à l'époque ottomane.","fact":"On a identifié à Tel Yokneam plus d'une vingtaine de niveaux d'occupation : un vrai mille-feuille d'histoire.","cue":"Après l'échangeur de Yokneam, à l'entrée de la ville — après la question NVIDIA, s'il reste du temps.","caution":"Tel Yokneam n'est pas visible depuis la route — ne pas le montrer.","more":["יקנעם מוזכרת גם בכתובת של פרעה תחותמס השלישי, יחד עם מגידו.","את תל יקנעם חפר הארכאולוג אמנון בן-תור — שכבות מתקופת הברונזה ועד התקופה העות׳מאנית.","יקנעם המושבה נוסדה בשנות ה-30."]},"en":{"script":"It appears in the Book of Joshua: 'the king of Jokneam in Carmel, one'.","long":"Yokneam is a very old city. The Book of Joshua lists it among the conquered kings: 'the king of Jokneam in Carmel, one'. Even earlier, in the 15th century BCE, Pharaoh Thutmose III recorded its name — 'Ain-qenaam' — among the towns of his campaign in Canaan. Tel Yokneam, excavated by archaeologist Amnon Ben-Tor, holds layers of settlement from the Bronze Age to Ottoman times.","fact":"More than twenty layers of settlement were identified at Tel Yokneam — a real layer cake of history.","cue":"After the Yokneam interchange, entering the town — after the NVIDIA question, if there's time.","caution":"Tel Yokneam is not visible from the road — do not point.","more":["יקנעם מוזכרת גם בכתובת של פרעה תחותמס השלישי, יחד עם מגידו.","את תל יקנעם חפר הארכאולוג אמנון בן-תור — שכבות מתקופת הברונזה ועד התקופה העות׳מאנית.","יקנעם המושבה נוסדה בשנות ה-30."]},"ru":{"script":"Упоминается в Книге Иисуса Навина: «царь Иокнеама при Кармиле — один».","long":"Йокнеам — очень древний город. Книга Иисуса Навина называет его среди побеждённых царей: «царь Иокнеама при Кармиле — один». А ещё раньше, в XV веке до н. э., фараон Тутмос III записал его название — «Аин-кенаам» — среди городов своего похода в Ханаан. Тель-Йокнеам, раскопанный археологом Амноном Бен-Тором, хранит слои поселений от бронзового века до османской эпохи.","fact":"На Тель-Йокнеаме выделили больше двадцати слоёв поселений — настоящий слоёный пирог истории.","cue":"После развязки Йокнеам, при въезде в город — после вопроса об NVIDIA, если останется время.","caution":"Тель-Йокнеам с дороги не виден — не указывать.","more":["יקנעם מוזכרת גם בכתובת של פרעה תחותמס השלישי, יחד עם מגידו.","את תל יקנעם חפר הארכאולוג אמנון בן-תור — שכבות מתקופת הברונזה ועד התקופה העות׳מאנית.","יקנעם המושבה נוסדה בשנות ה-30."]}}$v3$::jsonb, $v3${"stop":"S8","final":false,"topic":"Biblical Yokneam","docs":"יוסי: 'ומלך יוקנעם לכרמל אחד', מסע תחותמס השלישי ('ענקעם'), תל יוקנעם נחפר בידי עמנון בן-תור. יאיר: יקנעם עילית הוקמה ב-1950 כמעברה, מועצה מקומית 1967, עיר 2006. לא אומת שהתל נראה מהכביש."}$v3$::jsonb)
on conflict (ext_key) do update set
  bank = excluded.bank, selection = excluded.selection, kind = excluded.kind, text = excluded.text,
  options = excluded.options, correct_index = excluded.correct_index, explanation = excluded.explanation,
  category = excluded.category, difficulty = excluded.difficulty, time_limit_sec = excluded.time_limit_sec,
  guide_short = excluded.guide_short, guide_long = excluded.guide_long, guide_location = excluded.guide_location,
  guide_practical = excluded.guide_practical, guide_sources = excluded.guide_sources, guide_fact = excluded.guide_fact,
  guide_visibility = excluded.guide_visibility, i18n = excluded.i18n, guide_i18n = excluded.guide_i18n,
  route_meta = excluded.route_meta, is_demo = false, updated_at = clock_timestamp()
where not mdl.questions.admin_edited;

-- Questions de DÉMONSTRATION (optionnel). Elles servent uniquement à tester
-- le fonctionnement du jeu. Les réponses NE SONT PAS des faits validés :
-- à vérifier ou remplacer par le guide avant le 21 octobre.
-- Ajoutées seulement si la banque de questions est vide (ré-exécution sans doublons).
insert into mdl.questions (kind, text, options, correct_index, explanation, category, difficulty, time_limit_sec, sort_order, is_demo)
select v.kind, v.text, v.options::jsonb, v.correct_index, v.explanation, v.category, v.difficulty, v.time_limit_sec, v.sort_order, true
from (values
('mcq', '[הדגמה] מימין לאוטובוס אנחנו רואים גבעה. מאיזה סוג סלע היא בנויה?',
 '["גיר","בזלת","גרניט","חול"]', 0,
 'שאלת הדגמה בלבד — התשובה לא אומתה. יש לעדכן לפני הסיור.', 'גאולוגיה', 2, 30, 1),
('mcq', '[הדגמה] איזה מבצר צלבני נמצא על החוף ליד עתלית?',
 '["מבצר עתלית (שאטו פלרן)","מבצר נמרוד","כוכב הירדן","מבצר יחיעם"]', 0,
 'שאלת הדגמה בלבד — יש לאמת את התשובה וההסבר.', 'היסטוריה', 2, 30, 2),
('tf', '[הדגמה] כביש 2 נקרא גם "כביש החוף".',
 '["נכון","לא נכון"]', 0,
 'שאלת הדגמה בלבד — יש לאמת.', 'גאוגרפיה', 1, 20, 3),
('mcq', '[הדגמה] איזה רכס נראה משמאל לאוטובוס בנסיעה צפונה לחיפה?',
 '["הכרמל","הגלבוע","החרמון","רמת מנשה"]', 0,
 'שאלת הדגמה בלבד — יש לאמת.', 'גאוגרפיה', 1, null::int, 4)
) as v(kind, text, options, correct_index, explanation, category, difficulty, time_limit_sec, sort_order)
where not exists (select 1 from mdl.questions);
