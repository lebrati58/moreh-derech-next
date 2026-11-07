CREATE OR REPLACE FUNCTION mdl.active_game()
 RETURNS mdl.games
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select * from mdl.games where is_active limit 1 $function$;


CREATE OR REPLACE FUNCTION mdl.bump(p_game bigint)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ update mdl.games set version = version + 1 where id = p_game $function$;


CREATE OR REPLACE FUNCTION mdl.calc_points(p_correct boolean, p_elapsed_ms integer, p_base integer, p_max_bonus integer, p_window_sec numeric, p_grace_sec numeric)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when not p_correct then 0
    when p_elapsed_ms <= p_grace_sec * 1000 or p_window_sec <= p_grace_sec then p_base + p_max_bonus
    else p_base + round(p_max_bonus * greatest(0,
           1 - (p_elapsed_ms - p_grace_sec * 1000) / ((p_window_sec - p_grace_sec) * 1000.0)))::int
  end
$function$;


CREATE OR REPLACE FUNCTION mdl.check_admin(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_token is null or not exists (
      select 1 from mdl.admin_sessions
       where token::text = p_token and expires_at > clock_timestamp()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $function$;


CREATE OR REPLACE FUNCTION mdl.check_host(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_token is null or not (
       exists (select 1 from mdl.admin_sessions a where a.token::text = p_token and a.expires_at > clock_timestamp())
    or exists (select 1 from mdl.access_sessions s join mdl.access_people p on p.tz_hash = s.tz_hash
                where s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and s.expires_at > now()))
  then raise exception 'not_authorized' using errcode = '42501'; end if;
end $function$;


CREATE OR REPLACE FUNCTION mdl.class_code_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select lower(btrim(coalesce(p, ''))) $function$;


CREATE OR REPLACE FUNCTION mdl.final_stats(p_game bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION mdl.leaderboard(p_game bigint)
 RETURNS TABLE(rank integer, player_id bigint, name text, score integer, correct integer, answered integer, correct_ms bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION mdl.pub_i18n(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object(
           'text', v->'text', 'options', v->'options', 'explanation', v->'explanation', 'category', v->'category'))),
         '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e(k, v)
   where k in ('he','fr','en','ru') and jsonb_typeof(v) = 'object'
$function$;


CREATE OR REPLACE FUNCTION mdl.set_admin_password(p_password text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION mdl.tick(p_game bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update mdl.game_questions gq set status = 'closed', closed_at = gq.closes_at
   from mdl.games g
   where g.id = p_game and gq.game_id = g.id and gq.question_id = g.current_question
     and g.phase = 'open' and gq.closes_at is not null
     and clock_timestamp() > gq.closes_at + make_interval(secs => g.grace_sec);
  if found then
    update mdl.games set phase = 'closed', version = version + 1 where id = p_game;
  end if;
end $function$;


CREATE OR REPLACE FUNCTION mdl.too_early_ms(g mdl.games)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case when g.phase = 'open' and g.opened_at is not null
              then greatest(0, ceil(extract(epoch from (g.opened_at + make_interval(secs => g.min_answer_sec)
                                                         - clock_timestamp())) * 1000))::int
              else 0 end
$function$;


CREATE OR REPLACE FUNCTION mdl.tz_hash(p_tz text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select encode(sha256(convert_to((select pepper from mdl.access_secret where id = 1) || '|' || p_tz, 'UTF8')), 'hex') $function$;


CREATE OR REPLACE FUNCTION mdl.tz_loose(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select case when char_length(d) between 5 and 9 and d !~ '^0+$' then lpad(d, 9, '0') end
        from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x $function$;


CREATE OR REPLACE FUNCTION mdl.tz_norm(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION mdl.tz_pick(p_line text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION mdl.valid_lang(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select case when p in ('he','fr','en','ru') then p end $function$;


CREATE OR REPLACE FUNCTION public.access_check(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('ok', exists (
    select 1 from mdl.access_sessions s join mdl.access_people p on p.tz_hash = s.tz_hash
     where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and s.expires_at > now())
    or exists (select 1 from mdl.admin_sessions a where a.token::text = p_token and a.expires_at > clock_timestamp()),
    'required', exists (select 1 from mdl.access_people))
$function$;


CREATE OR REPLACE FUNCTION public.access_login(p_tz text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.access_required()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select jsonb_build_object('required', exists (select 1 from mdl.access_people)) $function$;


CREATE OR REPLACE FUNCTION public.admin_access_list(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform mdl.check_admin(p_token);
  return jsonb_build_object('allowed', (select count(*) from mdl.access_people));
end $function$;


CREATE OR REPLACE FUNCTION public.admin_access_set(p_token text, p_list text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_bank_questions(p_token text, p_bank text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin
  perform mdl.check_host(p_token);
  return jsonb_build_object('bank', p_bank,
    'questions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order, x.id), '[]'::jsonb)
                    from mdl.questions x where x.bank = p_bank));
end $function$;


CREATE OR REPLACE FUNCTION public.admin_class_reset(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                             begin
                                                                               perform mdl.check_admin(p_token);
                                                                                 delete from mdl.class_scores;
                                                                                   return jsonb_build_object('ok', true);
                                                                                   end;
                                                                                   $function$;


CREATE OR REPLACE FUNCTION public.admin_class_reset_code(p_token text, p_class text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                         declare v_n int;
                                                         begin
                                                           perform mdl.check_admin(p_token);
                                                             delete from mdl.class_scores where class_code = mdl.class_code_norm(p_class);
                                                               get diagnostics v_n = row_count;
                                                                 return jsonb_build_object('ok', true, 'deleted', v_n);
                                                                 end;
                                                                 $function$;


CREATE OR REPLACE FUNCTION public.admin_close_question(p_token text, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games; v_left int;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_delete_question(p_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin
  perform mdl.check_admin(p_token);
  delete from mdl.questions where id = p_id;   -- les parties gardent leur copie figée
  return jsonb_build_object('ok', true);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_export(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_feedback_list(p_token text, p_status text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                           begin
                                                                                             perform mdl.check_admin(p_token);
                                                                                               return jsonb_build_object(
                                                                                                   'items', coalesce((select jsonb_agg(jsonb_build_object(
                                                                                                           'id', f.id, 'kind', f.kind, 'message', f.message, 'author', f.author,
                                                                                                                   'page', f.page, 'context', f.context, 'status', f.status, 'created_at', f.created_at)
                                                                                                                           order by f.created_at desc)
                                                                                                                                 from (select * from mdl.feedback
                                                                                                                                             where p_status = 'all' or status = p_status
                                                                                                                                                         order by created_at desc limit 500) f), '[]'::jsonb),
                                                                                                                                                             'counts', jsonb_build_object(
                                                                                                                                                                   'new', (select count(*) from mdl.feedback where status = 'new'),
                                                                                                                                                                         'done', (select count(*) from mdl.feedback where status = 'done')));
                                                                                                                                                                         end;
                                                                                                                                                                         $function$;


CREATE OR REPLACE FUNCTION public.admin_feedback_set_status(p_token text, p_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                         begin
                                                                                                                                                                           perform mdl.check_admin(p_token);
                                                                                                                                                                             if p_status not in ('new','done') then return jsonb_build_object('error','invalid_status'); end if;
                                                                                                                                                                               update mdl.feedback set status = p_status where id = p_id;
                                                                                                                                                                                 if not found then return jsonb_build_object('error','not_found'); end if;
                                                                                                                                                                                   return jsonb_build_object('ok', true);
                                                                                                                                                                                   end;
                                                                                                                                                                                   $function$;


CREATE OR REPLACE FUNCTION public.admin_finish(p_token text, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games; r jsonb;
begin
  r := public.admin_reveal(p_token, p_force);
  if r ? 'error' then return r; end if;          -- question ouverte depuis moins du minimum
  g := mdl.active_game();
  update mdl.games set status = 'finished', paused = false, finished_at = clock_timestamp(),
         version = version + 1 where id = g.id;
  return jsonb_build_object('ok', true);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_import_route(p_token text, p_label jsonb, p_route jsonb, p_questions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_login(p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_new_game(p_token text, p_title text DEFAULT NULL::text, p_bank text DEFAULT 'V1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare v_id bigint; old mdl.games; b mdl.question_banks; v_time int; v_min int;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_open_question(p_token text, p_question_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games; x mdl.questions; v_now timestamptz := clock_timestamp(); v_seq int; v_limit int;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_pause(p_token text, p_paused boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games;
begin
  perform mdl.check_host(p_token);
  g := mdl.active_game();
  if p_paused and g.phase = 'open' then return jsonb_build_object('error', 'question_open'); end if;
  update mdl.games set paused = p_paused, version = version + 1 where id = g.id;
  return jsonb_build_object('ok', true);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_photos(p_token text, p_collection text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare c mdl.route_collections;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_remove_community_document(p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin
 if not exists (select 1 from mdl.admin_sessions s
   where s.token::text=p_token and s.expires_at>now())
 then return jsonb_build_object('error','not_authorized'); end if;
 delete from mdl.tour_documents where id=p_id;
 return jsonb_build_object('ok',true);
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_remove_player(p_token text, p_player_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin
  perform mdl.check_host(p_token);
  update mdl.players set removed = true where id = p_player_id
   and game_id = (select id from mdl.games where is_active);
  perform mdl.bump((select id from mdl.games where is_active));
  return jsonb_build_object('ok', true);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_reorder(p_token text, p_ids bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin
  perform mdl.check_admin(p_token);
  update mdl.questions q set sort_order = t.pos
    from unnest(p_ids) with ordinality t(id, pos) where q.id = t.id;
  return jsonb_build_object('ok', true);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_resume_game(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin  -- annule un "terminer" fait par erreur
  perform mdl.check_host(p_token);
  update mdl.games set status = 'live', finished_at = null, version = version + 1
   where is_active and status = 'finished';
  return jsonb_build_object('ok', true);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_reveal(p_token text, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games; v_now timestamptz := clock_timestamp(); v_left int;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_save_question(p_token text, p_q jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_set_solo(p_token text, p_bank text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
begin
  perform mdl.check_admin(p_token);
  update mdl.question_banks set solo = coalesce(p_on, false) where code = p_bank and route is not null;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('code', p_bank, 'solo', coalesce(p_on, false));
end $function$;


CREATE OR REPLACE FUNCTION public.admin_settings(p_token text, p_s jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare v_min int;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_state(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games; q mdl.game_questions; v_cur jsonb := null; v_counts jsonb; v_bank text;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.admin_toggle_spare(p_token text, p_question_id bigint, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare g mdl.games; x mdl.questions;
begin
  perform mdl.check_host(p_token);
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
end $function$;


CREATE OR REPLACE FUNCTION public.class_board(p_class text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                         select jsonb_build_object('class', mdl.class_code_norm(p_class), 'items', coalesce(jsonb_agg(jsonb_build_object(
                               'name', s.name, 'points', s.points, 'stars', s.stars, 'gold', s.gold, 'updated_at', s.updated_at)
                                     order by s.points desc, s.updated_at), '[]'::jsonb))
                                       from (select * from mdl.class_scores
                                                where class_code = mdl.class_code_norm(p_class) and points > 0
                                                         order by points desc, updated_at limit 100) s;
                                                         $function$;


CREATE OR REPLACE FUNCTION public.class_leaderboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                               select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
                                                                     'name', s.name, 'points', s.points, 'stars', s.stars, 'gold', s.gold, 'updated_at', s.updated_at)
                                                                           order by s.points desc, s.updated_at), '[]'::jsonb))
                                                                             from (select * from mdl.class_scores where points > 0 order by points desc, updated_at limit 100) s;
                                                                             $function$;


CREATE OR REPLACE FUNCTION public.class_score_delete(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                       begin
                                                         if p_token is null then return jsonb_build_object('error','invalid_token'); end if;
                                                           delete from mdl.class_scores where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex');
                                                             return jsonb_build_object('ok', true);
                                                             end;
                                                             $function$;


CREATE OR REPLACE FUNCTION public.class_score_submit(p_token text, p_name text, p_points integer, p_stars integer, p_gold integer, p_answered integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                                       $function$;


CREATE OR REPLACE FUNCTION public.class_submit(p_token text, p_name text, p_points integer, p_stars integer, p_gold integer, p_answered integer, p_class text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                       $function$;


CREATE OR REPLACE FUNCTION public.community_catalog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
 select jsonb_build_object(
  'routes', coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'place_name', r.place_name, 'lat', r.lat, 'lon', r.lon
  ) order by r.created_at desc) from mdl.community_routes r), '[]'::jsonb),
  'documents', coalesce((select jsonb_agg(jsonb_build_object(
    'id', d.id, 'tour_id', d.tour_id, 'title', d.title, 'author', d.author,
    'file_name', d.file_name, 'source_url', d.source_url,
    'excerpt', left(d.body, 200), 'created_at', d.created_at
  ) order by d.created_at desc) from
   (select * from mdl.tour_documents order by created_at desc limit 1500) d), '[]'::jsonb)
 );
$function$;


CREATE OR REPLACE FUNCTION public.community_delete_quiz(p_id uuid, p_owner_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_owner_token is null or
     p_owner_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_token'); end if;
  update mdl.community_quizzes set state='deleted'
  where id=p_id and owner_hash=encode(sha256(convert_to(p_owner_token,'UTF8')),'hex')
    and state='published';
  if not found then return jsonb_build_object('error','not_authorized_or_missing'); end if;
  return jsonb_build_object('ok',true);
end;
$function$;


CREATE OR REPLACE FUNCTION public.community_document(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare d mdl.tour_documents;
begin
 select * into d from mdl.tour_documents where id=p_id;
 if not found then return jsonb_build_object('error','not_found'); end if;
 return jsonb_build_object('id',d.id,'tour_id',d.tour_id,'title',d.title,
  'author',d.author,'file_name',d.file_name,'body',d.body,
  'source_url',d.source_url,'created_at',d.created_at);
end;
$function$;


CREATE OR REPLACE FUNCTION public.community_get_quiz(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(
  (select q.payload from mdl.community_quizzes q
   where q.id=p_id and q.state='published'),
  jsonb_build_object('error','not_found')
 );
$function$;


CREATE OR REPLACE FUNCTION public.community_list_quizzes(p_search text DEFAULT ''::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',x.id,
      'from',x.from_place,
      'to',x.to_place,
      'count',x.question_count,
      'created_at',x.created_at
    ) order by x.created_at desc)
    from (
      select q.id,q.from_place,q.to_place,q.question_count,q.created_at
      from mdl.community_quizzes q
      where q.state='published'
        and (char_length(btrim(coalesce(p_search,'')))=0
          or q.from_place ilike '%'||left(btrim(p_search),70)||'%'
          or q.to_place ilike '%'||left(btrim(p_search),70)||'%')
      order by q.created_at desc
      limit least(greatest(coalesce(p_limit,24),1),40)
      offset least(greatest(coalesce(p_offset,0),0),10000)
    ) x
  ),'[]'::jsonb)
 );
$function$;


CREATE OR REPLACE FUNCTION public.community_publish_quiz(p_payload jsonb, p_owner_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner text;
  v_fingerprint text;
  v_from text;
  v_to text;
  v_questions jsonb;
  v_q jsonb;
  v_o jsonb;
  v_n int;
  v_id uuid;
begin
  if p_owner_token is null or
     p_owner_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_owner_token'); end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text)>45000
  then return jsonb_build_object('error','invalid_payload'); end if;
  if p_payload->>'v' <> '1'
  then return jsonb_build_object('error','invalid_version'); end if;

  v_from:=btrim(coalesce(p_payload->>'from',''));
  v_to:=btrim(coalesce(p_payload->>'to',''));
  if char_length(v_from) not between 2 and 100 or char_length(v_to) not between 2 and 100
  then return jsonb_build_object('error','invalid_route'); end if;

  v_questions:=p_payload->'questions';
  if v_questions is null or jsonb_typeof(v_questions)<>'array'
  then return jsonb_build_object('error','invalid_questions'); end if;
  v_n:=jsonb_array_length(v_questions);
  if v_n<1 or v_n>25
  then return jsonb_build_object('error','invalid_question_count'); end if;

  for v_q in select value from jsonb_array_elements(v_questions)
  loop
    if jsonb_typeof(v_q)<>'object'
    then return jsonb_build_object('error','invalid_question'); end if;
    if jsonb_typeof(v_q->'t')<>'string' or char_length(btrim(v_q->>'t')) not between 4 and 240
    then return jsonb_build_object('error','invalid_question_text'); end if;
    if jsonb_typeof(v_q->'o')<>'array'
    then return jsonb_build_object('error','invalid_options'); end if;
    if jsonb_array_length(v_q->'o')<>4
    then return jsonb_build_object('error','invalid_options'); end if;
    for v_o in select value from jsonb_array_elements(v_q->'o')
    loop
      if jsonb_typeof(v_o)<>'string' or char_length(btrim(v_o #>> '{}')) not between 1 and 220
      then return jsonb_build_object('error','invalid_option'); end if;
    end loop;
    if jsonb_typeof(v_q->'c')<>'number' or (v_q->>'c') !~ '^[0-3]$'
    then return jsonb_build_object('error','invalid_correct'); end if;
    if jsonb_typeof(v_q->'e')<>'string' or char_length(v_q->>'e')>600
    then return jsonb_build_object('error','invalid_explanation'); end if;
    if jsonb_typeof(v_q->'p')<>'string' or char_length(v_q->>'p')>100
    then return jsonb_build_object('error','invalid_place'); end if;
    if jsonb_typeof(v_q->'s')<>'string' or char_length(v_q->>'s')>500
    then return jsonb_build_object('error','invalid_script'); end if;
    if jsonb_typeof(v_q->'u')<>'string' or char_length(v_q->>'u')>400
    then return jsonb_build_object('error','invalid_source'); end if;
    if v_q->>'u'<>'' and v_q->>'u' !~* '^https://[^[:space:]<>]+$'
    then return jsonb_build_object('error','invalid_source'); end if;
  end loop;

  v_owner:=encode(sha256(convert_to(p_owner_token,'UTF8')),'hex');
  v_fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');

  select id into v_id from mdl.community_quizzes
  where fingerprint=v_fingerprint and state='published';
  if found then return jsonb_build_object('ok',true,'id',v_id,'existing',true); end if;

  -- Limites basiques : une clé d'auteur et un plafond de création global.
  -- Des visiteurs malveillants peuvent générer de nouvelles clés ; voir commentaire ci-dessus.
  if (select count(*) from mdl.community_quizzes where owner_hash=v_owner
      and created_at>now()-interval '1 hour')>=3
  then return jsonb_build_object('error','author_hour_limit'); end if;
  if (select count(*) from mdl.community_quizzes where owner_hash=v_owner
      and created_at>now()-interval '1 day')>=10
  then return jsonb_build_object('error','author_day_limit'); end if;
  if (select count(*) from mdl.community_quizzes where created_at>now()-interval '1 hour')>=40
  then return jsonb_build_object('error','site_hour_limit'); end if;

  insert into mdl.community_quizzes(from_place,to_place,payload,question_count,owner_hash,fingerprint)
  values(v_from,v_to,p_payload,v_n,v_owner,v_fingerprint)
  on conflict(fingerprint) do nothing returning id into v_id;
  if v_id is null
  then return jsonb_build_object('error','duplicate_or_unavailable'); end if;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;


CREATE OR REPLACE FUNCTION public.community_report_quiz(p_id uuid, p_reporter_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash text;
  v_count integer;
begin
  if p_reporter_token is null or
     p_reporter_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return jsonb_build_object('error','invalid_token'); end if;
  v_hash:=encode(sha256(convert_to(p_reporter_token,'UTF8')),'hex');
  if (select count(*) from mdl.community_quiz_reports
      where reporter_hash=v_hash and at>now()-interval '1 day')>=6
  then return jsonb_build_object('error','report_limit'); end if;
  perform 1 from mdl.community_quizzes where id=p_id and state='published' for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  insert into mdl.community_quiz_reports(quiz_id,reporter_hash)
    values(p_id,v_hash) on conflict do nothing;
  select count(*) into v_count from mdl.community_quiz_reports where quiz_id=p_id;
  if v_count>=5 then
    update mdl.community_quizzes set state='reported' where id=p_id and state='published';
  end if;
  return jsonb_build_object('ok',true,'hidden',v_count>=5);
end;
$function$;


CREATE OR REPLACE FUNCTION public.community_submit_document(p_tour_id text, p_title text, p_author text, p_body text, p_source_url text DEFAULT ''::text, p_file_name text DEFAULT ''::text, p_new_route_title text DEFAULT ''::text, p_place_name text DEFAULT ''::text, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare
 v_tour text := btrim(coalesce(p_tour_id,''));
 v_title text := btrim(coalesce(p_title,''));
 v_author text := btrim(coalesce(nullif(p_author,''),'אורח'));
 v_body text := btrim(coalesce(p_body,''));
 v_url text := btrim(coalesce(p_source_url,''));
 v_file text := btrim(coalesce(p_file_name,''));
 v_new text := btrim(coalesce(p_new_route_title,''));
 v_place text := btrim(coalesce(p_place_name,''));
 v_hash text;
 v_id uuid;
begin
 if char_length(v_title) not between 3 and 140 or char_length(v_author)>80
    or char_length(v_body)>120000 or char_length(v_file)>220
    or char_length(v_url)>1500 or (char_length(v_body)<40 and v_url='')
 then return jsonb_build_object('error','invalid_document'); end if;
 if v_url<>'' and v_url !~* '^https://[^[:space:]<>]+$'
 then return jsonb_build_object('error','invalid_link'); end if;
 -- Plafond global de secours pour une fonction publique anonyme.
 if (select count(*) from mdl.tour_documents where created_at > now()-interval '1 hour')>=120
 then return jsonb_build_object('error','busy_retry_later'); end if;
 if v_new<>'' then
   if char_length(v_new) not between 3 and 120 or char_length(v_place) not between 2 and 120
      or p_lat is null or p_lon is null or p_lat not between 29 and 34 or p_lon not between 34 and 36.8
   then return jsonb_build_object('error','invalid_location'); end if;
   insert into mdl.community_routes(title,place_name,lat,lon)
   values (v_new,v_place,p_lat,p_lon) returning id into v_tour;
 elsif not (v_tour ~ '^(0[1-9]|1[0-9]|2[0-2]|road67)$'
    or exists (select 1 from mdl.community_routes where id=v_tour))
 then return jsonb_build_object('error','invalid_tour'); end if;
 v_hash:=md5(v_title||chr(10)||v_body||chr(10)||v_url);
 insert into mdl.tour_documents(tour_id,title,author,file_name,body,source_url,content_hash)
 values(v_tour,v_title,v_author,v_file,v_body,v_url,v_hash)
 on conflict(tour_id,content_hash) do update set title=excluded.title
 returning id into v_id;
 return jsonb_build_object('ok',true,'tour_id',v_tour,'id',v_id);
end;
$function$;


CREATE OR REPLACE FUNCTION public.feedback_submit(p_kind text, p_message text, p_author text DEFAULT ''::text, p_page text DEFAULT ''::text, p_context jsonb DEFAULT '{}'::jsonb, p_sender text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                      declare v_msg text; v_sender text; v_ctx jsonb; v_id uuid;
                      begin
                        if p_kind is null or p_kind not in ('idea','bug','question','other')
                          then return jsonb_build_object('error','invalid_kind'); end if;
                            v_msg := btrim(coalesce(p_message,''));
                              if char_length(v_msg) < 5 then return jsonb_build_object('error','too_short'); end if;
                                if char_length(v_msg) > 2000 then return jsonb_build_object('error','too_long'); end if;
                                  if p_sender is null or p_sender !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                    then return jsonb_build_object('error','invalid_sender'); end if;
                                      v_sender := encode(sha256(convert_to(p_sender,'UTF8')),'hex');
                                        -- contexte : uniquement quelques champs courts connus (jamais de coordonnées)
                                          v_ctx := '{}'::jsonb;
                                            if p_context is not null and jsonb_typeof(p_context) = 'object' then
                                                select coalesce(jsonb_object_agg(key, left(value #>> '{}', 80)), '{}'::jsonb) into v_ctx
                                                    from jsonb_each(p_context)
                                                        where key in ('tour','level','mode','question','stop','lang') and jsonb_typeof(value) in ('string','number');
                                                          end if;
                                                            if exists (select 1 from mdl.feedback where sender_hash = v_sender and message = v_msg
                                                                         and created_at > now() - interval '1 day')
                                                                           then return jsonb_build_object('ok', true, 'duplicate', true); end if;
                                                                             if (select count(*) from mdl.feedback where sender_hash = v_sender and created_at > now() - interval '1 hour') >= 10
                                                                               then return jsonb_build_object('error','sender_hour_limit'); end if;
                                                                                 if (select count(*) from mdl.feedback where created_at > now() - interval '1 hour') >= 300
                                                                                   then return jsonb_build_object('error','site_hour_limit'); end if;
                                                                                     insert into mdl.feedback(kind, message, author, page, context, sender_hash)
                                                                                       values (p_kind, v_msg, left(btrim(coalesce(p_author,'')),60), left(coalesce(p_page,''),300), v_ctx, v_sender)
                                                                                         returning id into v_id;
                                                                                           return jsonb_build_object('ok', true, 'id', v_id);
                                                                                           end;
                                                                                           $function$;


CREATE OR REPLACE FUNCTION public.get_state(p_token text, p_since bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.join_game(p_name text, p_token text DEFAULT NULL::text, p_code text DEFAULT NULL::text, p_new_name_ok boolean DEFAULT false, p_lang text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;


CREATE OR REPLACE FUNCTION public.set_language(p_token text, p_lang text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare v_lang text := mdl.valid_lang(p_lang); v_id bigint;
begin
  if v_lang is null then return jsonb_build_object('error', 'bad_lang'); end if;
  update mdl.players set lang = v_lang
   where token::text = p_token and not removed and game_id = (select id from mdl.games where is_active)
  returning id into v_id;
  if v_id is null then return jsonb_build_object('error', 'unknown_player'); end if;
  return jsonb_build_object('ok', true, 'lang', v_lang);
end $function$;


CREATE OR REPLACE FUNCTION public.solo_route(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
declare b mdl.question_banks;
begin
  select * into b from mdl.question_banks where code = upper(btrim(coalesce(p_code, ''))) and solo and route is not null;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('code', b.code, 'label', b.label, 'route', b.route,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', split_part(x.ext_key, ':', 2), 'text', x.text, 'options', x.options, 'correct_index', x.correct_index,
        'explanation', x.explanation, 'i18n', x.i18n, 'guide_i18n', x.guide_i18n) order by x.sort_order, x.id), '[]'::jsonb)
      from mdl.questions x where x.bank = b.code));
end $function$;


CREATE OR REPLACE FUNCTION public.submit_answer(p_token text, p_question_id bigint, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mdl', 'public'
AS $function$
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
end $function$;
