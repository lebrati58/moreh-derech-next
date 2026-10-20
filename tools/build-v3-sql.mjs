// Génère supabase/questions_v3.sql à partir de content/v3/road67_questions.json (données faisant foi)
// et vérifie la cohérence avec public/v3/road67-route.json (lieux, ordre, question finale).
// Banque V3 « זכרון יעקב → יקנעם, כביש 67 » : sans photo, 4 langues, publication manuelle uniquement.
// Import ré-exécutable : clé stable ext_key = 'v3:<id>' ; une question modifiée dans l'admin
// (admin_edited) n'est jamais écrasée ; l'ordre choisi dans l'admin est conservé.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
export const LANGS = ['he', 'fr', 'en', 'ru'];
const FIELDS = ['question', 'explanation', 'script', 'long', 'fact', 'cue', 'caution'];
const HEBREW = /[֐-׿]/;

export function loadV3() {
  return { v3: read('content/v3/road67_questions.json'), route: read('public/v3/road67-route.json') };
}

export function validateV3({ v3, route }) {
  const err = m => { throw new Error('V3 : ' + m); };
  const qs = v3.questions;
  if (v3.bank !== 'V3') err('bank doit valoir V3');
  if (v3.photoCount !== 0) err('la V3 ne contient aucune photo');
  const main = qs.filter(q => q.selection === 'MAIN');
  if (main.length < 5 || main.length > 20) err(`5 à 20 questions MAIN attendues (${main.length})`);
  if (new Set(qs.map(q => q.id)).size !== qs.length) err('identifiants en double');
  if (qs.filter(q => q.final).length !== 1) err('exactement une question finale attendue');
  const stops = new Map(route.stops.map(s => [s.id, s]));
  for (const q of qs) {
    if (q.autoPublish) err('autoPublish interdit : ' + q.id);
    if (q.photo || q.photos || q.photoFiles) err('photo interdite en V3 : ' + q.id);
    if (!(q.correctIndex >= 0 && q.correctIndex < 4)) err('correctIndex ' + q.id);
    if (!(q.timeLimitSec >= 30)) err('durée < 30 s : ' + q.id);
    const st = stops.get(q.stop);
    if (!st || st.question !== q.id) err(`lieu ${q.stop} incohérent avec ${q.id}`);
    if (!!st.main !== (q.selection === 'MAIN')) err(`MAIN/SPARE incohérent entre question et parcours : ${q.id}`);
    if (!!st.final !== !!q.final) err('question finale incohérente : ' + q.id);
    for (const l of LANGS) {
      const t = q.i18n[l];
      if (!t) err(`langue ${l} absente : ${q.id}`);
      for (const f of FIELDS) {
        if (!String(t[f] || '').trim()) err(`${f} ${l} manquant : ${q.id}`);
        // garde-fou : un texte hébreu recopié dans une autre langue = traduction manquante
        if (l !== 'he' && HEBREW.test(t[f])) err(`${f} ${l} contient de l'hébreu (traduction manquante) : ${q.id}`);
      }
      if (!Array.isArray(t.options) || t.options.length !== 4) err(`4 réponses attendues (${l}) : ${q.id}`);
      if (new Set(t.options).size !== 4) err(`réponses en double (${l}) : ${q.id}`);
      if (l !== 'he' && t.options.some(o => HEBREW.test(o))) err(`réponse ${l} en hébreu : ${q.id}`);
      if (!q.category[l]) err(`catégorie ${l} manquante : ${q.id}`);
    }
    if (!Array.isArray(q.sources) || !q.sources.length) err('sources manquantes : ' + q.id);
  }
  // ordre des lieux principaux = ordre du trajet
  const order = route.stops.filter(s => s.main).map(s => s.question);
  const qOrder = main.slice().sort((a, b) => a.order - b.order).map(q => q.id);
  if (JSON.stringify(order) !== JSON.stringify(qOrder)) err('ordre des questions ≠ ordre du trajet');
  if (!route.stops[route.stops.filter(s => s.main).length ? 0 : 0]) err('parcours vide');
  return true;
}

const Q = s => {
  const v = String(s ?? '');
  if (v.includes('$v3$')) throw new Error('délimiteur interdit');
  return '$v3$' + v + '$v3$';
};
const J = o => Q(JSON.stringify(o)) + '::jsonb';

export function buildV3Sql() {
  const data = loadV3();
  validateV3(data);
  const { v3 } = data;
  const rows = v3.questions.map(q => {
    const he = q.i18n.he;
    const i18n = {}, guide = {};
    for (const l of LANGS) {
      const t = q.i18n[l];
      if (l !== 'he') i18n[l] = { text: t.question, options: t.options, explanation: t.explanation, category: q.category[l] };
      guide[l] = { script: t.script, long: t.long, fact: t.fact, cue: t.cue, caution: t.caution };
    }
    const meta = { stop: q.stop, final: !!q.final, topic: q.topic, docs: q.docs };
    return `(${[
      Q('v3:' + q.id), Q('V3'), Q(q.selection), Q('mcq'), Q(he.question), J(he.options), q.correctIndex,
      Q(he.explanation), Q(q.category.he), 2, q.timeLimitSec, q.order,
      Q(he.script), Q(he.long), Q(he.cue), Q(q.docs), J(q.sources), Q(he.fact), Q(q.visibility || 'check'),
      J(i18n), J(guide), J(meta)
    ].join(', ')})`;
  });
  return `-- =====================================================================
--  BANQUE V3 — זכרון יעקב → יקנעם, כביש 67 (sans photo, 4 langues)
--  Fichier GÉNÉRÉ par tools/build-v3-sql.mjs à partir de content/v3/ — ne pas éditer à la main.
--  Ré-exécutable : aucune suppression ; une question modifiée dans l'admin n'est pas écrasée ;
--  l'ordre choisi dans l'admin est conservé. Ne touche ni à V1 ni à V2 ni aux parties.
-- =====================================================================
insert into mdl.question_banks (code, label, sort, default_time_sec)
values ('V3', ${J(v3.label)}, 3, 45)
on conflict (code) do update set label = excluded.label, sort = excluded.sort,
  default_time_sec = coalesce(mdl.question_banks.default_time_sec, excluded.default_time_sec);

insert into mdl.questions (ext_key, bank, selection, kind, text, options, correct_index, explanation, category,
  difficulty, time_limit_sec, sort_order, guide_short, guide_long, guide_location, guide_practical, guide_sources,
  guide_fact, guide_visibility, i18n, guide_i18n, route_meta)
values
${rows.join(',\n')}
on conflict (ext_key) do update set
  bank = excluded.bank, selection = excluded.selection, kind = excluded.kind, text = excluded.text,
  options = excluded.options, correct_index = excluded.correct_index, explanation = excluded.explanation,
  category = excluded.category, difficulty = excluded.difficulty, time_limit_sec = excluded.time_limit_sec,
  guide_short = excluded.guide_short, guide_long = excluded.guide_long, guide_location = excluded.guide_location,
  guide_practical = excluded.guide_practical, guide_sources = excluded.guide_sources, guide_fact = excluded.guide_fact,
  guide_visibility = excluded.guide_visibility, i18n = excluded.i18n, guide_i18n = excluded.guide_i18n,
  route_meta = excluded.route_meta, is_demo = false, updated_at = clock_timestamp()
where not mdl.questions.admin_edited;
`;
}
