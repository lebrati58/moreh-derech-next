// Construit public/parta/rishui.json (mode « ממבחני רישוי ») à partir de content/parta/rishui/<key>.json.
// Chaque fichier = un PDF du recueil d'Efrat Nakash (questions d'examens de licence, sans corrigé) avec la solution
// résolue question par question (champ conf). Ne sont publiées que les questions jouables : pas de skip, conf high/medium.
// Doublons (même énoncé + mêmes réponses, d'un PDF à l'autre) : on garde la première occurrence.
// Usage : node tools/build-rishui.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url);
const readJSON = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number }; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('public/parta-core.js', ROOT), 'utf8'), ctx);
const C = ctx.self.MDPartA;
const T = await readJSON('content/parta/topics.json');
const topicIds = T.topics.map(t => t.id);

const strip = s => String(s ?? '').replace(/^\s*[\(]?[אבגדה][\)\.]\s+/, '').trim();
const files = (await readdir(new URL('content/parta/rishui/', ROOT))).filter(f => f.endsWith('.json')).sort();
const sources = [], questions = [], seen = new Map(), stats = { total: 0, skip: {}, low: 0, dup: 0, badTopic: 0 };
// Ids stables : (PDF, numéro) → id, gardés dans content/parta/rishui-ids.json pour que la progression ne se mélange pas
// quand on ajoute un PDF. Un nouvel id prend le numéro libre suivant du thème.
const IDS_PATH = 'content/parta/rishui-ids.json';
const idMap = await readJSON(IDS_PATH).catch(() => ({}));
const used = new Set(Object.values(idMap));
const nextId = topic => { for (let k = 1; ; k++) { const id = `Q-rishui_${topic}-${String(k).padStart(3, '0')}`; if (!used.has(id)) { used.add(id); return id; } } };
for (const f of files) {
  const d = await readJSON('content/parta/rishui/' + f);
  const kind = /^exam-/.test(d.key) ? 'exam' : 'topic';
  sources.push({ key: d.key, title: d.title, url: d.url, kind, ...(kind === 'exam' && d.year ? { year: d.year } : {}) });
  for (const q of d.questions || []) {
    stats.total++;
    if (q.skip) { stats.skip[q.skip] = (stats.skip[q.skip] || 0) + 1; continue; }
    if (!['high', 'medium'].includes(q.conf)) { stats.low++; continue; }
    if (!topicIds.includes(q.topic)) { stats.badTopic++; continue; }
    const options = (q.options || []).map(strip);
    const key = C.norm(q.q) + '|' + options.map(C.norm).sort().join('|');
    if (seen.has(key)) { stats.dup++; continue; }
    seen.set(key, true);
    const ref = d.key + '#' + q.n;
    if (!idMap[ref] || !idMap[ref].startsWith('Q-rishui_' + q.topic + '-')) idMap[ref] = nextId(q.topic);
    questions.push({ id: idMap[ref], topic: q.topic, src: d.key, n: q.n,
      ...(q.year ? { year: String(q.year) } : {}), ...(q.origin === 'web' ? { origin: 'web' } : {}),
      q: String(q.q).trim(), options, correct: q.correct, why: String(q.why || '').trim(), conf: q.conf, ...(q.check ? { check: q.check } : {}) });
  }
}
const data = { v: 1, builtAt: new Date().toISOString().slice(0, 10),
  about: 'שאלות אמריקאיות ממבחני הרישוי של משרד התיירות, מתוך הקובץ של אפרת נקש. הפתרונות אינם רשמיים: נפתרו שאלה אחר שאלה, ורק תשובות בטוחות מוצגות.',
  sources, questions };
const v = C.validateRishui(data, topicIds);
v.warnings.forEach(w => console.log('⚠️ ' + w));
v.errors.slice(0, 40).forEach(e => console.log('❌ ' + e));
if (v.errors.length) { console.error(`${v.errors.length} erreur(s) — fichier non écrit.`); process.exit(1); }
await writeFile(new URL('public/parta/rishui.json', ROOT), JSON.stringify(data) + '\n');
await writeFile(new URL(IDS_PATH, ROOT), JSON.stringify(Object.fromEntries(Object.entries(idMap).sort()), null, 0).replace(/,"/g, ',\n"') + '\n');
console.log(`🟢 ${questions.length} questions publiées sur ${stats.total} (${files.length} PDF) → public/parta/rishui.json`);
console.log(`   écartées : ${JSON.stringify(stats.skip)} · peu sûres ${stats.low} · doublons ${stats.dup} · thème inconnu ${stats.badTopic}`);
for (const t of topicIds) console.log(`   • ${t} — ${questions.filter(q => q.topic === t).length}`);
