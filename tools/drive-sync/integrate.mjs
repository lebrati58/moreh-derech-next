// Intègre les éléments VALIDÉS dans les fichiers existants du jeu, sans jamais toucher au contenu fait à la main.
// Source de vérité des ajouts automatiques : content/drive-questions/auto/ (un fichier par סיור, « lessons » pour les
// cours, « open » pour les questions ouvertes, « timeline » et « sites » pour la frise et la carte). Chaque entrée
// porte l'identifiant de la synchronisation qui l'a créée (« run ») : annuler une synchronisation = retirer ses
// entrées puis régénérer (rollbackRun), ce qui ne dépend pas de l'historique git.
// Fichiers régénérés : public/guided-quiz.json (via tools/merge-drive-questions.mjs), public/auto/open-questions.json,
// public/history-events.json (entrées « drive-… » seulement), public/siyurim-catalog.json + tools/places-sources.json
// (nouvelles étapes / nouveaux סיורים ; coordonnées résolues ensuite par tools/build-places.mjs depuis Wikipédia).
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

let ROOT = new URL('../../', import.meta.url);
const P = rel => new URL(rel, ROOT);
// Tests : travailler sur une copie du dépôt.
export function setRoot(url) { ROOT = new URL(url); }
export const AUTO_DIR = 'content/drive-questions/auto/';
const readJSON = async (rel, dflt) => existsSync(P(rel)) ? JSON.parse(await readFile(P(rel), 'utf8')) : dflt;
// JSON.stringify, sauf l'ordre des clés « 01 »…« 23 » : JavaScript range « 10 »–« 23 » avant « 01 »–« 09 » ;
// on remet l'ordre alphabétique du fichier d'origine (tools/places-sources.json → tours).
export function stringify(v, indent = 2, pad = '') {
  if (Array.isArray(v) || v === null || typeof v !== 'object') {
    if (!Array.isArray(v)) return JSON.stringify(v);
    if (!v.length) return '[]';
    const inner = pad + ' '.repeat(indent);
    return '[\n' + v.map(x => inner + stringify(x, indent, inner)).join(',\n') + '\n' + pad + ']';
  }
  let keys = Object.keys(v).filter(k => v[k] !== undefined);
  if (keys.length && keys.every(k => /^\d+$/.test(k))) keys = keys.sort();
  if (!keys.length) return '{}';
  const inner = pad + ' '.repeat(indent);
  return '{\n' + keys.map(k => inner + JSON.stringify(k) + ': ' + stringify(v[k], indent, inner)).join(',\n') + '\n' + pad + '}';
}
// Format compact fait à la main de tools/places-sources.json (une ligne par étape).
export function stringifyPlaces(d) {
  const top = Object.keys(d).filter(k => k !== 'tours').map(k => '  ' + JSON.stringify(k) + ': ' + stringify(d[k], 2, '  '));
  const inline = v => Array.isArray(v) ? '[' + v.map(x => JSON.stringify(x)).join(', ') + ']' : JSON.stringify(v);
  const tours = Object.keys(d.tours).sort().map(id => {
    const t = d.tours[id], stops = Object.keys(t.stops || {});
    const head = '    ' + JSON.stringify(id) + ': { ' + Object.keys(t).filter(k => k !== 'stops' && t[k] !== undefined).map(k => JSON.stringify(k) + ': ' + inline(t[k])).join(', ') + ', "stops": {';
    return stops.length ? head + '\n' + stops.map(k => '      ' + JSON.stringify(k) + ': ' + inline(t.stops[k])).join(',\n') + ' } }' : head + '} }';
  });
  return '{\n' + top.join(',\n') + ',\n  "tours": {\n' + tours.join(',\n') + '\n  }\n}';
}
const writeJSON = (rel, d, indent = 1) => writeFile(P(rel), (rel.endsWith('places-sources.json') ? stringifyPlaces(d) : stringify(d, indent)) + '\n');
// N'écrit que si le contenu change (garde la mise en forme d'origine des fichiers faits à la main).
async function writeIfChanged(rel, d, indent) {
  const before = await readJSON(rel, null);
  if (before && JSON.stringify(before) === JSON.stringify(d)) return false;
  await writeJSON(rel, d, indent); return true;
}

export async function loadAuto(name) {
  return readJSON(AUTO_DIR + name + '.json', { group: name, sources: {}, items: [] });
}
async function saveAuto(name, d) { await mkdir(P(AUTO_DIR), { recursive: true }); await writeJSON(AUTO_DIR + name + '.json', d); }

// Ajoute les éléments publiés d'une synchronisation. items: [{ kind, tour_id, fingerprint, payload, source: {key,label,url} }]
export async function applyItems(items, runId) {
  const touched = new Set(), stats = { questions: 0, open: 0, events: 0, sites: 0, tours: 0 };
  const files = {};
  const get = async name => files[name] || (files[name] = await loadAuto(name));
  for (const it of items) {
    let name;
    if (it.kind === 'question') name = it.tour_id || 'lessons';
    else if (it.kind === 'open_question') name = 'open';
    else if (it.kind === 'event') name = 'timeline';
    else if (it.kind === 'site') name = 'sites';
    else continue;
    const d = await get(name);
    if (d.items.some(x => x.fp === it.fingerprint)) continue;          // déjà intégré
    if (it.source) d.sources[it.source.key] = { label: it.source.label, url: it.source.url };
    const { source: _ignored, ...payload } = it.payload || {};
    d.items.push({ fp: it.fingerprint, run: runId, tourId: it.tour_id || null, src: it.source ? it.source.key : null, ...payload });
    touched.add(name);
    stats[{ question: 'questions', open_question: 'open', event: 'events', site: 'sites' }[it.kind]]++;
  }
  for (const n of touched) await saveAuto(n, files[n]);
  stats.tours = await rebuild();
  return stats;
}

export async function rollbackRun(runId) {
  let removed = 0;
  if (!existsSync(P(AUTO_DIR))) return 0;
  for (const f of (await readdir(P(AUTO_DIR))).filter(f => f.endsWith('.json'))) {
    const name = f.replace(/\.json$/, ''), d = await loadAuto(name);
    const keep = d.items.filter(x => x.run !== runId);
    if (keep.length !== d.items.length) {
      removed += d.items.length - keep.length; d.items = keep;
      const used = new Set(keep.map(x => x.src));                    // sources devenues orphelines : retirées aussi
      for (const k of Object.keys(d.sources)) if (!used.has(k)) delete d.sources[k];
      await saveAuto(name, d);
    }
  }
  await rebuild();
  return removed;
}

// Régénère tous les fichiers publics à partir des fichiers auto. Idempotent.
export async function rebuild() {
  const open = await loadAuto('open');
  await mkdir(P('public/auto/'), { recursive: true });
  await writeIfChanged('public/auto/open-questions.json', {
    version: 'auto-' + open.items.length, language: 'he',
    note: 'שאלות פתוחות שנוצרו אוטומטית ממסמכי הקורס ב-Drive, עם תשובת ייחוס ונקודות מפתח. כל שאלה מקושרת למסמך המקור.',
    sources: open.sources,
    questions: open.items.map(x => ({ id: 'O-' + x.fp.slice(0, 10), tourId: x.tourId, level: x.level, stop: x.stop, question: x.q, answer: x.answer,
      points: x.points, explanation: x.e, quote: x.quote, i18n: x.i18n || null, sourceUrl: (open.sources[x.src] || {}).url, sourceDoc: (open.sources[x.src] || {}).label }))
  }, 2);
  await rebuildQuiz();
  await rebuildTimeline();
  return rebuildSites();
}

// Banque des QCM : on ne régénère PAS la banque faite à la main (ses leurres ont été retravaillés après coup,
// voir tools/apply-distractors.mjs) ; on retire seulement les questions automatiques « A… » et on les remet.
export const AUTO_Q_ID = /^A(\d\d|lessons)-/;
async function rebuildQuiz() {
  const path = 'public/guided-quiz.json';
  const quiz = await readJSON(path, null); if (!quiz) return;
  const manual = quiz.questions.filter(q => !AUTO_Q_ID.test(q.id));
  const known = new Set(manual.map(q => q.question.trim()));
  const auto = [];
  const names = existsSync(P(AUTO_DIR)) ? (await readdir(P(AUTO_DIR))).filter(f => /^(\d\d|lessons)\.json$/.test(f)).sort() : [];
  for (const f of names) {
    const group = f.replace('.json', ''), d = await loadAuto(group);
    for (const x of d.items) {
      if (known.has(x.q.trim())) continue;
      known.add(x.q.trim());
      const src = d.sources[x.src] || {};
      auto.push({ id: `A${group}-${x.fp.slice(0, 10)}`, tourId: group, level: x.level, source: group === 'lessons' ? 'lessons' : 'tour' + group, stop: x.stop,
        question: x.q.trim(), options: x.a.map(s => String(s).trim()), correct: 0, explanation: x.e.trim(), sourceUrl: src.url, sourceDoc: src.label,
        type: x.type || 'mcq', quote: x.quote, auto: true, ...(x.i18n ? { i18n: x.i18n } : {}) });
    }
  }
  const next = { ...quiz, questions: [...manual, ...auto] };
  if (JSON.stringify(next.questions) !== JSON.stringify(quiz.questions)) {
    next.version = new Date().toISOString().slice(0, 10) + '-drive-auto';
    await writeJSON(path, next, 2);
  }
}

async function rebuildTimeline() {
  const path = 'public/history-events.json';
  const h = await readJSON(path, null); if (!h) return;
  const t = await loadAuto('timeline');
  const manual = h.events.filter(e => !/^drive-/.test(e.id));
  const auto = t.items.map(x => {
    const approx = /בערך|לערך|כ-|~|–|-/.test(x.yearText || '');
    return { id: 'drive-' + x.fp.slice(0, 10), year: x.year, yearText: x.yearText, period: x.period, certainty: approx ? 'approx' : 'firm',
      source: 'course', examReady: !approx, title: x.title, q: `באיזו שנה: ${x.title}?`, desc: x.desc || x.title,
      note: `נוסף אוטומטית ממסמך הקורס: ${(t.sources[x.src] || {}).label || ''}`, doc: t.sources[x.src] ? { url: t.sources[x.src].url, title: t.sources[x.src].label } : undefined, auto: true };
  });
  h.events = [...manual, ...auto].sort((a, b) => a.year - b.year);   // tri stable : l'ordre manuel est conservé à année égale
  await writeIfChanged(path, h, 2);
}

async function rebuildSites() {
  const catalog = await readJSON('public/siyurim-catalog.json', null);
  const src = await readJSON('tools/places-sources.json', null);
  if (!catalog || !src) return 0;
  const s = await loadAuto('sites');
  // Retire d'abord les ajouts automatiques précédents (marqués), puis les remet : rollback propre.
  const autoStops = catalog.autoStops || {};
  for (const [tid, names] of Object.entries(autoStops)) {
    const t = catalog.tours.find(x => x.id === tid);
    if (t) t.stops = t.stops.filter(n => !names.includes(n));
    if (src.tours[tid]) for (const n of names) delete src.tours[tid].stops[n];
  }
  // סיורים qui ont des questions automatiques mais pas encore d'entrée au catalogue (ex. סיור 24) : on les crée aussi,
  // sinon leurs questions ne seraient accessibles que via « כל הסיורים ».
  const qTours = new Set();
  if (existsSync(P(AUTO_DIR))) for (const f of (await readdir(P(AUTO_DIR))).filter(f => /^\d\d\.json$/.test(f))) {
    if ((await loadAuto(f.slice(0, 2))).items.length) qTours.add(f.slice(0, 2));
  }
  const reg = await readJSON('content/tours/registry.json', { tours: [] });
  const hasAuto = id => s.items.some(x => x.tourId === id) || qTours.has(id);
  catalog.tours = catalog.tours.filter(t => !(t.auto && !hasAuto(t.id)));
  for (const id of qTours) if (!catalog.tours.some(t => t.id === id)) {
    const r = reg.tours.find(t => t.id === id) || {};
    catalog.tours.push({ id, title: r.title || `סיור ${id}`, date: null, stops: [], folderUrl: r.folder || null, sourceUrl: null, status: 'נוסף אוטומטית מה-Drive — דורש בדיקה', auto: true });
    if (!src.tours[id]) src.tours[id] = { region: null, themes: [], stops: {}, auto: true };
  }
  for (const tid of Object.keys(src.tours)) if (src.tours[tid].auto && !catalog.tours.some(t => t.id === tid)) delete src.tours[tid];
  const next = {}; let newTours = 0;
  for (const x of s.items) {
    if (!x.tourId) continue;
    let t = catalog.tours.find(c => c.id === x.tourId);
    if (!t) {
      t = { id: x.tourId, title: x.tourTitle || `סיור ${x.tourId}`, date: null, stops: [], folderUrl: x.folderUrl || null,
        sourceUrl: (s.sources[x.src] || {}).url || null, status: 'נוסף אוטומטית מה-Drive — דורש בדיקה', auto: true };
      catalog.tours.push(t); newTours++;
    }
    if (!src.tours[x.tourId]) src.tours[x.tourId] = { region: x.region || null, themes: [], stops: {}, auto: true };
    if (t.stops.includes(x.name_he)) continue;
    t.stops.push(x.name_he);
    src.tours[x.tourId].stops[x.name_he] = [x.wiki_he && 'he:' + x.wiki_he, x.wiki_en && 'en:' + x.wiki_en].filter(Boolean);
    (next[x.tourId] = next[x.tourId] || []).push(x.name_he);
  }
  catalog.tours.sort((a, b) => a.id.localeCompare(b.id));
  catalog.count = catalog.tours.length;
  if (Object.keys(next).length) catalog.autoStops = next; else delete catalog.autoStops;
  await writeIfChanged('public/siyurim-catalog.json', catalog, 2);
  await writeIfChanged('tools/places-sources.json', src, 2);
  return newTours;
}
