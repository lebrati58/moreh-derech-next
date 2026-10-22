-- Moreh Derech NEXT : contributions de documents dans les parcours
-- Installer UNE FOIS dans Supabase > SQL Editor > Run.
-- Tables privées : aucun accès direct anonyme ; seul le RPC contrôle les insertions.
create schema if not exists mdl;
revoke all on schema mdl from public;
create table if not exists mdl.community_routes (
 id text primary key default ('user-' || gen_random_uuid()::text),
 title text not null check (char_length(title) between 3 and 120),
 place_name text not null check (char_length(place_name) between 2 and 120),
 lat double precision not null check (lat between 29 and 34),
 lon double precision not null check (lon between 34 and 36.8),
 created_at timestamptz not null default now()
);
create table if not exists mdl.tour_documents (
 id uuid primary key default gen_random_uuid(),
 tour_id text not null,
 title text not null check (char_length(title) between 3 and 140),
 author text not null default 'אורח' check (char_length(author) between 1 and 80),
 file_name text not null default '' check (char_length(file_name) <= 220),
 body text not null default '' check (char_length(body) <= 120000),
 source_url text not null default '' check (char_length(source_url) <= 1500),
 content_hash text not null,
 created_at timestamptz not null default now(),
 check (char_length(body) >= 40 or source_url <> '')
);
create unique index if not exists tour_documents_dedupe on mdl.tour_documents (tour_id,content_hash);
create index if not exists tour_documents_lookup on mdl.tour_documents (tour_id, created_at desc);
revoke all on mdl.community_routes, mdl.tour_documents from public, anon, authenticated;

create or replace function public.community_catalog()
returns jsonb language sql stable security definer set search_path=mdl,public as $$
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
$$;

create or replace function public.community_document(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=mdl,public as $$
declare d mdl.tour_documents;
begin
 select * into d from mdl.tour_documents where id=p_id;
 if not found then return jsonb_build_object('error','not_found'); end if;
 return jsonb_build_object('id',d.id,'tour_id',d.tour_id,'title',d.title,
  'author',d.author,'file_name',d.file_name,'body',d.body,
  'source_url',d.source_url,'created_at',d.created_at);
end;
$$;

create or replace function public.community_submit_document(
 p_tour_id text, p_title text, p_author text, p_body text,
 p_source_url text default '', p_file_name text default '',
 p_new_route_title text default '', p_place_name text default '',
 p_lat double precision default null, p_lon double precision default null
) returns jsonb language plpgsql security definer set search_path=mdl,public as $$
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
$$;

-- Un responsable peut supprimer une contribution abusive avec un jeton ADMIN valide.
create or replace function public.admin_remove_community_document(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path=mdl,public as $$
begin
 if not exists (select 1 from mdl.admin_sessions s
   where s.token::text=p_token and s.expires_at>now())
 then return jsonb_build_object('error','not_authorized'); end if;
 delete from mdl.tour_documents where id=p_id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.community_catalog() from public;
revoke all on function public.community_document(uuid) from public;
revoke all on function public.community_submit_document(text,text,text,text,text,text,text,text,double precision,double precision) from public;
revoke all on function public.admin_remove_community_document(text,uuid) from public;
grant execute on function public.community_catalog() to anon, authenticated;
grant execute on function public.community_document(uuid) to anon, authenticated;
grant execute on function public.community_submit_document(text,text,text,text,text,text,text,text,text,double precision,double precision) to anon, authenticated;
grant execute on function public.admin_remove_community_document(text,uuid) to anon, authenticated;
