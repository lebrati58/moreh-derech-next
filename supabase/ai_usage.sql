-- Quota du correcteur IA : par appareil et par jour + plafond global (protège ta facture). Ré-exécutable.
-- À lancer dans Supabase > SQL Editor. Seule l'Edge Function (service_role) peut l'appeler.
create schema if not exists mdl;
create table if not exists mdl.ai_usage (day date not null default (now() at time zone 'Asia/Jerusalem')::date, device text not null, n int not null default 0, primary key (day, device));
revoke all on mdl.ai_usage from public, anon, authenticated;
create or replace function public.ai_take_quota(p_device text, p_per_device int, p_global int)
returns text language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; g int; n int;
begin
  select coalesce(sum(u.n),0) into g from mdl.ai_usage u where u.day = d;
  if g >= p_global then return 'global_limit'; end if;
  insert into mdl.ai_usage (day, device, n) values (d, p_device, 1)
    on conflict (day, device) do update set n = mdl.ai_usage.n + 1 returning mdl.ai_usage.n into n;
  if n > p_per_device then return 'device_limit'; end if;
  return 'ok';
end $$;
revoke all on function public.ai_take_quota(text,int,int) from public, anon, authenticated;
grant execute on function public.ai_take_quota(text,int,int) to service_role;
