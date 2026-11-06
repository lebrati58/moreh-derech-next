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
const bank = { v: 1, evidencePolicy: 'drive-only', builtAt: new Date().toISOString().slice(0, 10), about: T.about, levels: T.levels,
  topics: T.topics.map(t => Object.assign({}, t, { count: questions.filter(q => q.topic === t.id).length })), questions };
const v = C.validate(bank);
v.warnings.forEach(w => console.log('⚠️ ' + w));
v.errors.forEach(e => console.log('❌ ' + e));
if (v.errors.length) { console.error(`${v.errors.length} erreur(s) — banque non écrite.`); process.exit(1); }
await mkdir(new URL('public/parta/', ROOT), { recursive: true });
await writeFile(new URL('public/parta/bank.json', ROOT), JSON.stringify(bank) + '\n');
console.log(`🟢 ${questions.length} questions, ${bank.topics.filter(t => t.count).length}/${bank.topics.length} thèmes → public/parta/bank.json`);
for (const t of bank.topics) console.log(`   ${t.count ? '•' : '○'} ${t.id} ${t.he} — ${t.count}`);
