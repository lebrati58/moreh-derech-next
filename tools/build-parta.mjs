// Construit public/parta/bank.json à partir de content/parta/topics.json + content/parta/questions/<topic>.json.
// Valide la banque (parta-core.js) : une erreur bloque la construction ; les avertissements sont affichés.
// Usage : node tools/build-parta.mjs
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url);
const readJSON = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number }; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('public/parta-core.js', ROOT), 'utf8'), ctx);
const C = ctx.self.MDPartA;

const T = await readJSON('content/parta/topics.json');
const files = (await readdir(new URL('content/parta/questions/', ROOT))).filter(f => f.endsWith('.json')).sort();
const questions = [];
for (const f of files) {
  const d = await readJSON('content/parta/questions/' + f);
  const topic = d.topic || f.replace(/\.json$/, '');
  for (const q of d.questions || []) questions.push(Object.assign({ topic }, q, { topic }));
}
const bank = { v: 1, builtAt: new Date().toISOString().slice(0, 10), about: T.about, levels: T.levels,
  topics: T.topics.map(t => Object.assign({}, t, { count: questions.filter(q => q.topic === t.id).length })), questions };
const v = C.validate(bank);
v.warnings.forEach(w => console.log('⚠️ ' + w));
v.errors.forEach(e => console.log('❌ ' + e));
if (v.errors.length) { console.error(`${v.errors.length} erreur(s) — banque non écrite.`); process.exit(1); }
await mkdir(new URL('public/parta/', ROOT), { recursive: true });
await writeFile(new URL('public/parta/bank.json', ROOT), JSON.stringify(bank) + '\n');
console.log(`🟢 ${questions.length} questions, ${bank.topics.filter(t => t.count).length}/${bank.topics.length} thèmes → public/parta/bank.json`);
for (const t of bank.topics) console.log(`   ${t.count ? '•' : '○'} ${t.id} ${t.he} — ${t.count}`);

// ---------- מבחני מחצית : content/parta/midterm/<id>.txt → public/parta/midterm-<id>.json ----------
// Format ligne par ligne (voir l'en-tête du .txt). Les métadonnées de chaque épreuve sont dans MIDTERMS ci-dessous.
const MIDTERMS = {
  '2026-b': {
    title: 'בחינת מחצית — חלק א׳, מועד ב׳', course: 'קורס טנא', fr: 'Examen de mi-parcours — partie A, 2e session',
    rules: { questions: 45, answer: 40, points: 0.5, minutes: 90 },
    sources: [
      { title: 'בחינת מחצית חלק א מועד ב.doc', id: '1s63w9fC7b-0Io2OwmfFNF902227IeO5z', note: 'השאלות, כלשונן' },
      { title: 'תשובות לשאלות מבחן אמצע.docx', id: '1gBWPQlL2F86J6R623DWLWuoyt_V_1_GT', note: 'קובץ התשובות של הכיתה (40+40): נבדק, תוקן בשאלת השלמה 36 והושלם ל-45+45' }
    ],
    note: 'ההסברים נכתבו מחדש. ⚠️ = תשובה שלא מצאנו בחומר הקורס: כדאי לוודא עם המרצה.'
  }
};
const flagsOf = s => (s || '').split(/\s+/).filter(Boolean);
for (const [id, meta] of Object.entries(MIDTERMS)) {
  const txt = await readFile(new URL(`content/parta/midterm/${id}.txt`, ROOT), 'utf8');
  const mcq = [], fill = [];
  for (const line of txt.split('\n')) {
    if (!/^[MF]\|/.test(line)) continue;
    const f = line.split('|');
    if (f[0] === 'M') mcq.push({ n: +f[1], q: f[2], options: f[3].split('¦'), correct: +f[4], topic: f[5], explanation: f[6], flags: flagsOf(f[7]) });
    else fill.push({ n: +f[1], q: f[2], answers: f[3].split('¦'), topic: f[4], explanation: f[5], flags: flagsOf(f[6]) });
  }
  const m = Object.assign({ id, v: 1 }, meta, { mcq, fill });
  const bad = C.validateMidterm(m).errors.concat([...mcq, ...fill].filter(q => !T.topics.some(t => t.id === q.topic)).map(q => `#${q.n} : thème inconnu ${q.topic}`));
  if (bad.length) { bad.forEach(e => console.log('❌ ' + e)); process.exit(1); }
  await writeFile(new URL(`public/parta/midterm-${id}.json`, ROOT), JSON.stringify(m) + '\n');
  console.log(`🟢 מבחן מחצית ${id} : ${mcq.length} QCM + ${fill.length} השלמה → public/parta/midterm-${id}.json`);
}
