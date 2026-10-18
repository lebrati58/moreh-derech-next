-- INSTALLATION COMPLÈTE : à coller en entier dans Supabase > SQL Editor > Run ("Run without RLS").
-- Ré-exécutable sans risque : rien n'est supprimé, aucune question n'est dupliquée.
-- Contient : schéma + 34 questions du trajet avec fiches de guidage (+ démo seulement si la banque est vide).
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
create unique index if not exists players_name_per_game on mdl.players (game_id, lower(name));

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
  select (row_number() over w)::int, id, name, score, correct, answered, correct_ms
    from s window w as (order by score desc, correct desc, correct_ms asc, joined_at asc, id asc)
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

-- Rejoindre la partie active.
--  * p_token : jeton stocké sur le téléphone → reconnexion transparente.
--  * nom déjà pris : on demande le code personnel (même élève sur un autre
--    navigateur) ou on propose un nom libre ; p_new_name_ok = true l'accepte.
create or replace function public.join_game(
  p_name text, p_token text default null, p_code text default null, p_new_name_ok boolean default false)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare
  g mdl.games; p mdl.players; v_name text; v_try text; i int := 2;
begin
  g := mdl.active_game();
  if g.id is null then return jsonb_build_object('error', 'no_game'); end if;

  -- 1) reconnexion par jeton
  if p_token is not null then
    select * into p from mdl.players
     where token::text = p_token and game_id = g.id and not removed;
    if found then
      update mdl.players set last_seen_at = clock_timestamp() where id = p.id;
      return jsonb_build_object('player_id', p.id, 'token', p.token, 'name', p.name, 'code', p.code, 'reconnected', true);
    end if;
  end if;

  -- 2) nettoyage du nom (pas de caractères de contrôle, 1 à 24 caractères)
  v_name := regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := left(v_name, 24);
  if char_length(v_name) = 0 then return jsonb_build_object('error', 'empty_name'); end if;

  if g.status = 'finished' then return jsonb_build_object('error', 'finished'); end if;
  if (select count(*) from mdl.players where game_id = g.id) >= 300 then
    return jsonb_build_object('error', 'full');
  end if;

  -- 3) nom déjà utilisé
  select * into p from mdl.players where game_id = g.id and lower(name) = lower(v_name);
  if found then
    if p_code is not null and not p.removed then
      if p.code_failures >= 8 then return jsonb_build_object('error', 'code_locked'); end if;
      if p.code = btrim(p_code) then
        update mdl.players set last_seen_at = clock_timestamp(), code_failures = 0 where id = p.id;
        return jsonb_build_object('player_id', p.id, 'token', p.token, 'name', p.name, 'code', p.code, 'reconnected', true);
      end if;
      update mdl.players set code_failures = code_failures + 1 where id = p.id;
      return jsonb_build_object('error', 'bad_code');
    end if;
    loop
      v_try := v_name || ' ' || i;
      exit when not exists (select 1 from mdl.players where game_id = g.id and lower(name) = lower(v_try));
      i := i + 1;
    end loop;
    if not p_new_name_ok then
      return jsonb_build_object('error', 'name_taken', 'suggestion', v_try);
    end if;
    v_name := v_try;
  end if;

  insert into mdl.players (game_id, name, code)
  values (g.id, v_name, lpad((floor(random() * 10000))::int::text, 4, '0'))
  returning * into p;
  perform mdl.bump(g.id);
  return jsonb_build_object('player_id', p.id, 'token', p.token, 'name', p.name, 'code', p.code, 'reconnected', false);
exception when unique_violation then
  return jsonb_build_object('error', 'name_taken', 'suggestion', v_name || ' ' || (i + 1));
end $$;

-- État du jeu vu par un participant. Appelée toutes les ~1,5 s.
-- Si rien n'a changé depuis p_since, renvoie une réponse minuscule.
create or replace function public.get_state(p_token text, p_since bigint default 0)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare
  g mdl.games; p mdl.players; q mdl.game_questions; a mdl.answers;
  v_me jsonb; v_q jsonb := null; v_lb jsonb; v_extra jsonb := '{}'::jsonb; v_total int;
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
                            'code', p.code, 'total', v_total)
    into v_me from mdl.leaderboard(g.id) l where l.player_id = p.id;

  if g.current_question is not null then
    select * into q from mdl.game_questions where game_id = g.id and question_id = g.current_question;
    select * into a from mdl.answers
     where game_id = g.id and question_id = q.question_id and player_id = p.id;
    v_q := jsonb_build_object(
      'id', q.question_id, 'seq', q.seq, 'kind', q.kind, 'text', q.text, 'options', q.options,
      'category', q.category, 'time_limit', q.time_limit_sec,
      'opened_at', q.opened_at, 'closes_at', q.closes_at,
      'my_choice', a.choice);
    if q.status = 'revealed' then
      v_q := v_q || jsonb_build_object(
        'correct_index', q.correct_index, 'explanation', q.explanation,
        'my_correct', a.is_correct, 'my_points', a.points,
        'counts', (select jsonb_agg(coalesce(c.n, 0) order by o.i)
                     from generate_series(0, jsonb_array_length(q.options) - 1) o(i)
                     left join (select choice, count(*) n from mdl.answers
                                 where game_id = g.id and question_id = q.question_id group by choice) c
                       on c.choice = o.i));
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'score', score, 'correct', correct)
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
declare g mdl.games; q mdl.game_questions; v_cur jsonb := null; v_counts jsonb;
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
      'counts', v_counts);
  end if;
  return jsonb_build_object(
    'now', clock_timestamp(),
    'game', case when g.id is null then null else to_jsonb(g) end,
    'players', (select count(*) from mdl.players where game_id = g.id and not removed),
    'online',  (select count(*) from mdl.players where game_id = g.id and not removed
                  and last_seen_at > clock_timestamp() - interval '20 seconds'),
    'current', v_cur,
    'questions', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
                     'used', exists(select 1 from mdl.game_questions gq where gq.game_id = g.id and gq.question_id = x.id))
                   order by x.sort_order, x.id), '[]'::jsonb) from mdl.questions x),
    'leaderboard', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
                       'online', pl.last_seen_at > clock_timestamp() - interval '20 seconds') order by l.rank), '[]'::jsonb)
                      from mdl.leaderboard(g.id) l join mdl.players pl on pl.id = l.player_id),
    'stats', case when g.id is null then null else mdl.final_stats(g.id) end);
end $$;

create or replace function public.admin_save_question(p_token text, p_q jsonb)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_kind text; v_opts jsonb; v_correct int; v_id bigint;
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
      updated_at = clock_timestamp()
     where id = (p_q->>'id')::bigint returning id into v_id;
    if v_id is null then return jsonb_build_object('error', 'not_found'); end if;
  else
    insert into mdl.questions (kind, text, options, correct_index, explanation, category, difficulty, time_limit_sec, sort_order, is_demo,
                               guide_short, guide_long, guide_location, guide_practical, guide_sources,
                               guide_fact, guide_visibility)
    values (v_kind, btrim(p_q->>'text'), v_opts, v_correct, coalesce(p_q->>'explanation', ''),
            coalesce(nullif(btrim(p_q->>'category'), ''), 'כללי'), coalesce((p_q->>'difficulty')::int, 2),
            nullif((p_q->>'time_limit_sec'), '')::int,
            coalesce((p_q->>'sort_order')::int, (select coalesce(max(sort_order), 0) + 1 from mdl.questions)),
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

create or replace function public.admin_new_game(p_token text, p_title text default null)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare v_id bigint; old mdl.games;
begin
  perform mdl.check_admin(p_token);
  old := mdl.active_game();
  update mdl.games set is_active = false,
         status = case when status = 'finished' then status else 'finished' end,
         finished_at = coalesce(finished_at, clock_timestamp())
   where is_active;
  insert into mdl.games (title, base_points, max_bonus, bonus_window_sec, grace_sec, default_time_limit_sec)
  values (coalesce(nullif(btrim(p_title), ''), 'מורה דרך LIVE'),
          coalesce(old.base_points, 100), coalesce(old.max_bonus, 100),
          coalesce(old.bonus_window_sec, 20), coalesce(old.grace_sec, 1.5),
          coalesce(old.default_time_limit_sec, 30))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
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
  if exists (select 1 from mdl.game_questions where game_id = g.id and question_id = x.id) then
    return jsonb_build_object('error', 'already_used');
  end if;
  -- question précédente fermée mais pas révélée → on la révèle
  update mdl.game_questions set status = 'revealed', revealed_at = v_now
   where game_id = g.id and status = 'closed';
  select coalesce(max(seq), 0) + 1 into v_seq from mdl.game_questions where game_id = g.id;
  -- durée propre à la question, sinon durée par défaut de la partie (0 = sans limite)
  v_limit := coalesce(x.time_limit_sec, nullif(g.default_time_limit_sec, 0));
  insert into mdl.game_questions (game_id, question_id, seq, kind, text, options, correct_index, explanation,
                                  category, time_limit_sec, status, opened_at, closes_at)
  values (g.id, x.id, v_seq, x.kind, x.text, x.options, x.correct_index, x.explanation, x.category,
          v_limit, 'open', v_now,
          case when v_limit is null then null else v_now + make_interval(secs => v_limit) end);
  update mdl.games set status = 'live', phase = 'open', paused = false, current_question = x.id,
         opened_at = v_now, closes_at = case when v_limit is null then null
                                             else v_now + make_interval(secs => v_limit) end,
         version = version + 1
   where id = g.id;
  return jsonb_build_object('ok', true, 'seq', v_seq);
end $$;

create or replace function public.admin_close_question(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games;
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  update mdl.game_questions set status = 'closed', closed_at = clock_timestamp()
   where game_id = g.id and question_id = g.current_question and status = 'open';
  update mdl.games set phase = 'closed', version = version + 1 where id = g.id and phase = 'open';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reveal(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games; v_now timestamptz := clock_timestamp();
begin
  perform mdl.check_admin(p_token);
  g := mdl.active_game();
  if g.phase = 'open' then  -- révéler implique fermer
    update mdl.game_questions set status = 'closed', closed_at = v_now
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

create or replace function public.admin_finish(p_token text)
returns jsonb language plpgsql security definer set search_path = mdl, public as $$
declare g mdl.games;
begin
  perform public.admin_reveal(p_token);
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
begin
  perform mdl.check_admin(p_token);
  update mdl.games set
    title            = coalesce(nullif(btrim(p_s->>'title'), ''), title),
    base_points      = least(1000, greatest(0, coalesce((p_s->>'base_points')::int, base_points))),
    max_bonus        = least(1000, greatest(0, coalesce((p_s->>'max_bonus')::int, max_bonus))),
    bonus_window_sec = least(600, greatest(1, coalesce((p_s->>'bonus_window_sec')::int, bonus_window_sec))),
    grace_sec        = least(10, greatest(0, coalesce((p_s->>'grace_sec')::numeric, grace_sec))),
    default_time_limit_sec = case when (p_s->>'default_time_limit_sec') is null then default_time_limit_sec
                                  when (p_s->>'default_time_limit_sec')::int <= 0 then 0
                                  else least(600, greatest(5, (p_s->>'default_time_limit_sec')::int)) end,
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
                     'correct_index', correct_index, 'status', status) order by seq), '[]')
                    from mdl.game_questions where game_id = g.id),
    'answers', (select coalesce(jsonb_agg(jsonb_build_object('seq', gq.seq, 'player', p.name, 'choice', a.choice,
                     'correct', a.is_correct, 'points', a.points, 'elapsed_ms', a.elapsed_ms,
                     'received_at', a.received_at) order by gq.seq, a.elapsed_ms), '[]')
                  from mdl.answers a join mdl.players p on p.id = a.player_id
                  join mdl.game_questions gq on gq.game_id = a.game_id and gq.question_id = a.question_id
                 where a.game_id = g.id));
end $$;

-- ---------------------------------------------------------------------
--  Droits : seules les fonctions public.* ci-dessus sont appelables
-- ---------------------------------------------------------------------
revoke execute on all functions in schema mdl from public;
do $$
declare f text;
begin
  foreach f in array array[
    'join_game(text,text,text,boolean)', 'get_state(text,bigint)', 'submit_answer(text,bigint,int)',
    'admin_login(text)', 'admin_state(text)', 'admin_save_question(text,jsonb)', 'admin_delete_question(text,bigint)',
    'admin_reorder(text,bigint[])', 'admin_new_game(text,text)', 'admin_open_question(text,bigint)',
    'admin_close_question(text)', 'admin_reveal(text)', 'admin_pause(text,boolean)', 'admin_finish(text)',
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
