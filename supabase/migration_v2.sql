-- MISE À JOUR V2 d'une installation existante : coller en entier dans Supabase > SQL Editor > Run.
-- Ré-exécutable. Ne supprime rien, ne touche pas aux 34 questions V1, conserve parties, joueurs et réponses.
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
