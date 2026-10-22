-- MISE À JOUR V3 d'une installation existante : coller en entier dans Supabase > SQL Editor > Run.
-- Ré-exécutable. Ne supprime rien. Ne touche ni aux questions V1/V2, ni aux photos V2, ni aux parties,
-- joueurs et réponses. Autorise les prénoms identiques (sessions existantes conservées).
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
    'admin_import_route(text,jsonb,jsonb,jsonb)',
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
