-- Issue #76: reviewed qualified references; existing access sessions are preserved.
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
    values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_hash, now() + interval '30 days');
  return jsonb_build_object('ok', true, 'token', v_token);
end $function$;


CREATE OR REPLACE FUNCTION public.admin_login(p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

