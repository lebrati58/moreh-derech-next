// Génère supabase/questions_v2.sql à partir de content/v2/*.json (données faisant foi).
// Banque V2 « מסלול התמונות — הלוך » : 6 questions MAIN + 2 SPARE, 32 fiches photo.
// Import déterministe et ré-exécutable : clés stables (ext_key = 'v2:<id>', (collection, ord)),
// aucune suppression, aucune modification de la banque V1.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
export const LANGS = ['he', 'fr', 'en', 'ru'];
export const COLLECTION = 'ALLER_V2';

// Catégorie de chaque question (les données source n'en ont pas), dans les 4 langues.
const CAT = {
  'Exposed coastal layers':      { he: 'גאולוגיה', fr: 'Géologie', en: 'Geology', ru: 'Геология' },
  'Ancient Dor harbour':         { he: 'ארכאולוגיה', fr: 'Archéologie', en: 'Archaeology', ru: 'Археология' },
  'Kfarlet origin':              { he: 'היסטוריה', fr: 'Histoire', en: 'History', ru: 'История' },
  'Dorothy Garrod':              { he: 'ארכאולוגיה', fr: 'Archéologie', en: 'Archaeology', ru: 'Археология' },
  'Atlit detention camp':        { he: 'היסטוריה', fr: 'Histoire', en: 'History', ru: 'История' },
  'Urban Carmel':                { he: 'גאוגרפיה', fr: 'Géographie', en: 'Geography', ru: 'География' },
  'Banana netting':              { he: 'חקלאות', fr: 'Agriculture', en: 'Agriculture', ru: 'Сельское хозяйство' },
  'Red coastal passenger train': { he: 'תחבורה', fr: 'Transports', en: 'Transport', ru: 'Транспорт' }
};
// Côté du bus (données V2) → indicateur de visibilité existant de l'admin
const VIS = {
  right_probable: 'check', right_from_route_notes: 'check', left_from_route_notes: 'check',
  side_uncertain: 'check', uncertain: 'check', nearby_not_visible: 'nearby'
};

export function loadV2() {
  const v2 = read('content/v2/v2_questions_anecdotes_4languages.json');
  const an = read('content/v2/anecdotes_pour_32_photos.json');
  return { v2, photos: an.photoAnecdotes };
}

// Contrôles stricts : on refuse de générer un import incohérent.
export function validateV2({ v2, photos }) {
  const err = m => { throw new Error('V2 : ' + m); };
  const qs = v2.questions;
  if (qs.length !== 8) err(`8 questions attendues, ${qs.length} trouvées`);
  if (qs.filter(q => q.selection === 'MAIN').length !== 6) err('6 questions MAIN attendues');
  if (qs.filter(q => q.selection === 'SPARE').length !== 2) err('2 questions SPARE attendues');
  if (new Set(qs.map(q => q.id)).size !== qs.length) err('identifiants en double');
  if (photos.length !== 32) err('32 photos attendues');
  const files = new Map(photos.map(p => [p.photo, p.order]));
  photos.forEach((p, i) => {
    if (p.order !== i + 1) err('ordre des photos non continu à ' + p.photo);
    for (const l of LANGS) if (!String(p.anecdote?.[l] || '').trim()) err(`anecdote ${l} manquante (photo ${p.order})`);
  });
  for (const q of qs) {
    if (!CAT[q.topic]) err('catégorie inconnue pour ' + q.id);
    if (!(q.correctIndex >= 0 && q.correctIndex < 4)) err('correctIndex ' + q.id);
    if (q.autoPublish) err('autoPublish interdit : ' + q.id);
    for (const l of LANGS) {
      const t = q.translations[l];
      if (!t || !t.question || !t.studentExplanation || !t.adminScript) err(`traduction ${l} incomplète : ${q.id}`);
      if (!Array.isArray(t.options) || t.options.length !== 4) err(`4 options attendues (${l}) : ${q.id}`);
      if (new Set(t.options).size !== 4) err(`options en double (${l}) : ${q.id}`);
    }
    for (const f of q.photoFiles) if (!files.has(f)) err(`photo inconnue ${f} (${q.id})`);
  }
  // ordre des MAIN = ordre du trajet (routeMarkerTime)
  const main = qs.filter(q => q.selection === 'MAIN').sort((a, b) => a.rankInVersion - b.rankInVersion);
  const times = main.map(q => q.routeMarkerTime);
  if (times.join() !== [...times].sort().join()) err('les MAIN ne suivent pas routeMarkerTime');
  return true;
}

const Q = s => {
  const v = String(s ?? '');
  if (v.includes('$mdl$')) throw new Error('délimiteur interdit dans le texte');
  return '$mdl$' + v + '$mdl$';
};
const J = o => Q(JSON.stringify(o)) + '::jsonb';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const fileFor = order => String(order).padStart(2, '0') + '.jpg';

export function buildV2Sql() {
  const data = loadV2();
  validateV2(data);
  const { v2, photos } = data;
  const order = new Map(photos.map(p => [p.photo, p.order]));
  // MAIN dans l'ordre du trajet, puis les SPARE
  const qs = [...v2.questions].sort((a, b) => (a.selection === b.selection ? 0 : a.selection === 'MAIN' ? -1 : 1)
    || a.routeMarkerTime.localeCompare(b.routeMarkerTime));

  const qRows = qs.map((q, i) => {
    const he = q.translations.he;
    const cat = CAT[q.topic];
    // PUBLIC : texte, options (même ordre), explication, catégorie
    const i18n = Object.fromEntries(LANGS.filter(l => l !== 'he').map(l => [l, {
      text: q.translations[l].question, options: q.translations[l].options,
      explanation: q.translations[l].studentExplanation, category: cat[l] }]));
    // PRIVÉ : script micro, prudence, repère
    const guideI18n = Object.fromEntries(LANGS.map(l => [l, {
      script: q.translations[l].adminScript,
      caution: q.adminCaution ? q.adminCaution[l] : '' }]));
    const photoOrders = q.photoFiles.map(f => order.get(f));
    const meta = {
      dataset: v2.id, sourceId: q.id, photos: photoOrders.map(fileFor), photoOrders,
      sourcePhotos: q.photoFiles, routeMarkerTime: q.routeMarkerTime, photoLocalTime: q.photo_local_time,
      timeIsIndicative: true, side: q.sideOfBusV2, sideNote: q.side_of_bus, confidence: q.photo_identification_confidence,
      sectorFr: q.geographic_trigger, triggerHe: q.adminPhotoTriggerHe, topic: q.topic,
      answerTimeSec: q.answerTimeSec, minAnswerTimeSec: q.minAnswerTimeSec
    };
    const location = `${q.adminPhotoTriggerHe} · שעת צילום (משוערת): ${q.photo_local_time}`;
    return `(${[
      Q('v2:' + q.id), `'V2'`, Q(q.selection), `'mcq'`, Q(he.question), J(he.options), q.correctIndex,
      Q(he.studentExplanation), Q(cat.he), 2, q.answerTimeSec, i + 1,
      Q(he.adminScript), Q(''), Q(location), Q(''),
      J(q.sources.map(u => ({ title: host(u), url: u }))), Q(''), Q(VIS[q.sideOfBusV2] || 'check'),
      J(i18n), J(guideI18n), J(meta)
    ].join(', ')})`;
  });

  const keysByPhoto = new Map();
  for (const q of v2.questions) for (const f of q.photoFiles) {
    keysByPhoto.set(f, [...(keysByPhoto.get(f) || []), 'v2:' + q.id]);
  }
  const pRows = photos.map(p => `(${[
    Q(COLLECTION), p.order, Q(fileFor(p.order)), Q(p.photo), Q(p.time), Q(p.subject), Q(p.side),
    Q(p.photoIdentificationConfidence),
    J(Object.fromEntries(LANGS.map(l => [l, p.anecdote[l]]))),
    `array[${(keysByPhoto.get(p.photo) || []).map(Q).join(', ')}]::text[]`
  ].join(', ')})`);

  return `-- =====================================================================
--  Banque V2 « ${v2.label.he} » — ${v2.label.fr}
--  6 questions principales (MAIN) + 2 de remplacement (SPARE, désactivées par défaut),
--  en hébreu / français / anglais / russe, et 32 fiches photo PRIVÉES (galerie admin).
--  Fichier GÉNÉRÉ par tools/build-v2-sql.mjs à partir de content/v2/ — ne pas éditer à la main.
--  Ré-exécutable : aucune suppression, aucun doublon, la banque V1 n'est pas touchée.
--  (Une nouvelle exécution écrase les modifications faites dans l'admin sur ces 8 questions.)
-- =====================================================================

insert into mdl.route_collections (code, bank, label, direction, notes, cautions, sort)
values (${Q(COLLECTION)}, 'V2', ${J(v2.label)}, 'outbound', ${J(v2.extraRouteNotesFromGuide || [])},
        ${J(v2.unsafeToAssume || [])}, 1)
on conflict (code) do update set bank = excluded.bank, label = excluded.label, direction = excluded.direction,
  notes = excluded.notes, cautions = excluded.cautions, sort = excluded.sort;

insert into mdl.questions (ext_key, bank, selection, kind, text, options, correct_index, explanation, category,
  difficulty, time_limit_sec, sort_order, guide_short, guide_long, guide_location, guide_practical, guide_sources,
  guide_fact, guide_visibility, i18n, guide_i18n, route_meta)
values
${qRows.join(',\n')}
on conflict (ext_key) do update set
  bank = excluded.bank, selection = excluded.selection, kind = excluded.kind, text = excluded.text,
  options = excluded.options, correct_index = excluded.correct_index, explanation = excluded.explanation,
  category = excluded.category, difficulty = excluded.difficulty, time_limit_sec = excluded.time_limit_sec,
  sort_order = excluded.sort_order, guide_short = excluded.guide_short, guide_long = excluded.guide_long,
  guide_location = excluded.guide_location, guide_practical = excluded.guide_practical,
  guide_sources = excluded.guide_sources, guide_fact = excluded.guide_fact, guide_visibility = excluded.guide_visibility,
  i18n = excluded.i18n, guide_i18n = excluded.guide_i18n, route_meta = excluded.route_meta,
  is_demo = false, updated_at = clock_timestamp();

insert into mdl.route_photos (collection, ord, file, source_file, taken_at, subject, side, confidence, anecdote, question_keys)
values
${pRows.join(',\n')}
on conflict (collection, ord) do update set
  file = excluded.file, source_file = excluded.source_file, taken_at = excluded.taken_at, subject = excluded.subject,
  side = excluded.side, confidence = excluded.confidence, anecdote = excluded.anecdote, question_keys = excluded.question_keys;
`;
}
