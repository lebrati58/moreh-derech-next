// Génère supabase/questions_route.sql et supabase/install.sql à partir de content/.
// Usage : node tools/build-route-sql.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { ROUTE } from '../content/index.mjs';

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

const install = [
  '-- INSTALLATION COMPLÈTE : à coller en entier dans Supabase > SQL Editor > Run ("Run without RLS").',
  '-- Ré-exécutable sans risque : rien n\'est supprimé, aucune question n\'est dupliquée.',
  '-- Contient : schéma + 34 questions du trajet avec fiches de guidage (+ démo seulement si la banque est vide).',
  readFileSync(new URL('supabase/schema.sql', root), 'utf8'),
  sql,
  readFileSync(new URL('supabase/seed_demo.sql', root), 'utf8')
].join('\n');
writeFileSync(new URL('supabase/install.sql', root), install);
console.log(`${ROUTE.length} questions → supabase/questions_route.sql + supabase/install.sql`);
