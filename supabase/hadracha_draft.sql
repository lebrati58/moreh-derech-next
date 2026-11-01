-- ⚠️ BROUILLON — NE PAS EXÉCUTER sans validation de Lionel.
-- « הדרכת דרך — מדריך באוטובוס » : structure réutilisable pour tous les corridors depuis Savidor.
-- Le JSON du dépôt (content/hadracha → public/hadracha) reste la source ; ces tables recevront un export
-- quand le mode multi-élèves ou les relevés de repérage partagés en auront besoin. Ne supprime ni ne modifie rien d'existant.
-- Règle Google : aucune géométrie, aucun nom ni coordonnée venant de Google n'est stocké ici (seulement des pano_id).

create table if not exists mdl.hd_educational_sources (
  id text primary key,                               -- ex. 'T01', 'R05'
  kind text not null check (kind in ('transcript','course-doc','student-notes','ai-edited','author-script','external')),
  title text not null, url text, note text
);

create table if not exists mdl.hd_routes (
  id text primary key,                               -- 'savidor-jerusalem'
  corridor text not null,                            -- 'jerusalem', 'north-coast'…
  title_he text not null, title_fr text,
  status text not null default 'a_verifier' check (status in ('a_importer','en_analyse','a_verifier','pret')),
  published boolean not null default false,
  length_m integer, geometry_source text,           -- 'OSRM © OpenStreetMap (ODbL)'
  built_at timestamptz
);

-- Tronçon physique, sans sens : partagé par plusieurs parcours (ex. Ayalon sud pour Jérusalem et la Côte sud)
create table if not exists mdl.hd_route_segments (
  id bigserial primary key,
  road_ref text,                                     -- '1', '20'
  geom jsonb not null,                               -- [[lat, lon], …] (OSM)
  length_m integer not null,
  fingerprint text unique not null                   -- hash de la géométrie arrondie : évite d'analyser deux fois
);
create table if not exists mdl.hd_route_segment_order (
  route_id text references mdl.hd_routes(id), seq integer, segment_id bigint references mdl.hd_route_segments(id),
  from_s integer not null, to_s integer not null, primary key (route_id, seq)
);

create table if not exists mdl.hd_points_of_interest (
  id text primary key,                               -- 'latrunpolice'
  name_he text not null, name_fr text,
  category text not null check (category in ('landscape','site','near')),
  lat double precision, lon double precision,
  coord_source text not null,                        -- 'he.wikipedia: יד לשריון' / 'sur le tracé…'
  wikidata text, prio smallint default 2, themes text[] default '{}'
);

-- Observation = un lieu vu depuis un tronçon, dans un sens
create table if not exists mdl.hd_route_observations (
  id bigserial primary key,
  segment_id bigint references mdl.hd_route_segments(id),
  poi_id text references mdl.hd_points_of_interest(id),
  direction text not null check (direction in ('fwd','rev')),
  side text check (side in ('right','left','ahead','along')),
  side_from text check (side_from in ('teacher','computed','field')),
  visibility text not null default 'estimated' check (visibility in ('estimated','terrain_los','photo_checked','verified','not_visible')),
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  pano_id text,                                      -- seul identifiant Google qu'on peut garder
  source_id text references mdl.hd_educational_sources(id),
  verified_by text, verified_at timestamptz,
  unique (segment_id, poi_id, direction)
);

create table if not exists mdl.hd_guide_commentaries (
  id bigserial primary key,
  poi_id text references mdl.hd_points_of_interest(id),
  direction text not null default 'both' check (direction in ('both','fwd','rev')),
  intro_he text not null, cue_he text, look_he text, short_he text,   -- jetons {LOOK} / {SIDE}
  intro_sec real, cue_sec real, look_sec real, short_sec real,
  status text not null default 'a_verifier', version integer not null default 1,
  updated_at timestamptz default now()
);

create table if not exists mdl.hd_trigger_points (
  route_id text references mdl.hd_routes(id),
  poi_id text references mdl.hd_points_of_interest(id),
  direction text not null check (direction in ('fwd','rev')),
  s_abeam integer not null, off_road_m integer,
  vis_before_m integer, vis_after_m integer,        -- fenêtre de visibilité
  trigger_s_80 integer, observation_s_80 integer,   -- référence ; le temps réel recalcule avec la vitesse
  primary key (route_id, poi_id, direction)
);

create table if not exists mdl.hd_poi_sources (
  poi_id text references mdl.hd_points_of_interest(id), source_id text references mdl.hd_educational_sources(id),
  quote text, certainty text check (certainty in ('firm','approx','anecdote','check')),
  primary key (poi_id, source_id)
);

-- Suivi : « analysé » seulement si toutes les observations sont vérifiées sur le terrain
create or replace view mdl.hd_route_coverage as
select r.id, r.title_he,
  count(o.*) as observations,
  count(*) filter (where o.visibility = 'verified') as verified,
  case when count(o.*) = 0 then 'non_traite'
       when count(*) filter (where o.visibility not in ('verified','not_visible')) = 0 then 'analyse'
       else 'partiel' end as analysis
from mdl.hd_routes r
left join mdl.hd_route_segment_order so on so.route_id = r.id
left join mdl.hd_route_observations o on o.segment_id = so.segment_id
group by r.id, r.title_he;

-- Sécurité : lecture publique des seuls parcours publiés ; écriture uniquement par RPC admin (comme mdl.*)
alter table mdl.hd_routes enable row level security;
alter table mdl.hd_route_segments enable row level security;
alter table mdl.hd_route_segment_order enable row level security;
alter table mdl.hd_points_of_interest enable row level security;
alter table mdl.hd_route_observations enable row level security;
alter table mdl.hd_guide_commentaries enable row level security;
alter table mdl.hd_trigger_points enable row level security;
alter table mdl.hd_educational_sources enable row level security;
alter table mdl.hd_poi_sources enable row level security;
create policy hd_routes_read on mdl.hd_routes for select using (published and status = 'pret');
