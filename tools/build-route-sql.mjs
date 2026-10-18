// Génère supabase/questions_route.sql et supabase/install.sql à partir de content/.
// Usage : node tools/build-route-sql.mjs
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { ROUTE } from '../content/index.mjs';
import { buildV2Sql } from './build-v2-sql.mjs';
import { buildV3Sql } from './build-v3-sql.mjs';

const root = new URL('../', import.meta.url);
const Q = s => {
  const v = String(s ?? '');
  if (v.includes('$mdl$')) throw new Error('délimiteur interdit dans le texte');
  return '$mdl$' + v + '$mdl$';
};

const rows = ROUTE.map(q => `(${[
  Q(q.key), Q(q.kind || 'mcq'), Q(q.text), Q(JSON.stringify(q.options)) + '::jsonb', q.correct,
  Q(q.explanation), Q(q.category), q.difficulty || 2, q.time == null ? 'null' : q.time, q.sort,
  Q(q.short), Q(q.long), Q(q.location), Q(q.practical), Q(JSON.stringify(q.sources)) + '::jsonb',
  Q(q.fact), Q(q.visibility)
].join(', ')})`);

const sql = `-- =====================================================================
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
${rows.join(',\n')}
on conflict (ext_key) do update set
  kind = excluded.kind, text = excluded.text, options = excluded.options,
  correct_index = excluded.correct_index, explanation = excluded.explanation,
  category = excluded.category, difficulty = excluded.difficulty, time_limit_sec = excluded.time_limit_sec,
  sort_order = excluded.sort_order, guide_short = excluded.guide_short, guide_long = excluded.guide_long,
  guide_location = excluded.guide_location, guide_practical = excluded.guide_practical,
  guide_sources = excluded.guide_sources, guide_fact = excluded.guide_fact,
  guide_visibility = excluded.guide_visibility, is_demo = false, updated_at = clock_timestamp();
`;
writeFileSync(new URL('supabase/questions_route.sql', root), sql);

const v2sql = buildV2Sql();
writeFileSync(new URL('supabase/questions_v2.sql', root), v2sql);
const v3sql = buildV3Sql();
writeFileSync(new URL('supabase/questions_v3.sql', root), v3sql);
const schema = readFileSync(new URL('supabase/schema.sql', root), 'utf8');

const install = [
  '-- INSTALLATION COMPLÈTE : à coller en entier dans Supabase > SQL Editor > Run ("Run without RLS").',
  '-- Ré-exécutable sans risque : rien n\'est supprimé, aucune question n\'est dupliquée.',
  '-- Contient : schéma + banque V1 (34 questions du trajet avec fiches de guidage) + banque V2 (parcours',
  '-- photographié : 6 + 2 questions en 4 langues, 32 fiches photo) + banque V3 (route 67, sans photo,',
  '-- 4 langues) (+ démo seulement si la banque est vide).',
  schema,
  sql,
  v2sql,
  v3sql,
  readFileSync(new URL('supabase/seed_demo.sql', root), 'utf8')
].join('\n');
writeFileSync(new URL('supabase/install.sql', root), install);

// Mise à jour d'une base DÉJÀ installée : schéma (migration incrémentale) + V2 uniquement.
// Ne réimporte PAS la V1 : les modifications faites dans l'admin sur les 34 questions sont conservées.
const migration = [
  '-- MISE À JOUR V2 d\'une installation existante : coller en entier dans Supabase > SQL Editor > Run.',
  '-- Ré-exécutable. Ne supprime rien, ne touche pas aux 34 questions V1, conserve parties, joueurs et réponses.',
  schema,
  v2sql
].join('\n');
writeFileSync(new URL('supabase/migration_v2.sql', root), migration);

// Mise à jour V3 d'une base déjà installée (avec ou sans V2) : schéma (incrémental) + banque V3 seule.
// Ne réimporte ni V1 ni V2 ; n'écrase pas les questions V3 modifiées dans l'admin.
writeFileSync(new URL('supabase/migration_v3.sql', root), [
  '-- MISE À JOUR V3 d\'une installation existante : coller en entier dans Supabase > SQL Editor > Run.',
  '-- Ré-exécutable. Ne supprime rien. Ne touche ni aux questions V1/V2, ni aux photos V2, ni aux parties,',
  '-- joueurs et réponses. Autorise les prénoms identiques (sessions existantes conservées).',
  schema,
  v3sql
].join('\n'));
// Installation depuis le téléphone (public/update.html) : après un mini-script collé dans Supabase,
// la page envoie ces deux fichiers via la RPC temporaire mdl_bootstrap, qui s'auto-supprime à la fin.
mkdirSync(new URL('public/update/', root), { recursive: true });
writeFileSync(new URL('public/update/1-schema.sql', root), schema);
writeFileSync(new URL('public/update/2-data.sql', root), v2sql + v3sql +
  "\n-- fin de l'installation : suppression de la fonction temporaire\ndrop function if exists public.mdl_bootstrap(text, text);\nnotify pgrst, 'reload schema';\n");
console.log(`V1 : ${ROUTE.length} questions → supabase/questions_route.sql`);
console.log('V2 : 8 questions + 32 photos → supabase/questions_v2.sql');
console.log('V3 : route 67 → supabase/questions_v3.sql');
console.log('→ supabase/install.sql (installation complète) + supabase/migration_v2.sql + supabase/migration_v3.sql (mises à jour)');
