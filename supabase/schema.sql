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
