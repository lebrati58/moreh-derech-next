// « מבחן חלק א׳ » : banque de questions par thème (validation, tirage, score, enregistrement des points).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const json = async p => JSON.parse(await read(p));
const exists = p => access(new URL('../' + p, import.meta.url)).then(() => true, () => false);
async function umd(file, name) { const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number }; vm.createContext(ctx); vm.runInContext(await read(file), ctx); return ctx.self[name]; }
const C = await umd('public/parta-core.js', 'MDPartA');

test('validation : refuse une question sans source, avec 3 réponses, ou « toutes les réponses »', () => {
  const topics = [{ id: 'judaism' }];
  const ok = { id: 'Q-judaism-001', topic: 'judaism', level: 1, q: 'מהי בירת ישראל?', options: ['ירושלים', 'תל אביב', 'חיפה', 'באר שבע'], correct: 0, explanation: 'ירושלים היא בירת ישראל.', source: { title: 'x', url: 'https://he.wikipedia.org/wiki/x' } };
  assert.deepEqual([...C.validate({ topics, questions: [ok] }).errors], []);
  assert.ok(C.validate({ topics, questions: [Object.assign({}, ok, { source: {} })] }).errors.length);
  assert.ok(C.validate({ topics, questions: [Object.assign({}, ok, { options: ok.options.slice(0, 3) })] }).errors.length);
  assert.ok(C.validate({ topics, questions: [Object.assign({}, ok, { options: ['א', 'ב', 'ג', 'כל התשובות נכונות'] })] }).errors.length);
  assert.ok(C.validate({ topics, questions: [ok, Object.assign({}, ok, { id: 'Q-judaism-002' })] }).errors.some(e => /même énoncé/.test(e)));
});

test('tirage : 10 questions, réponses mélangées mais bonne réponse conservée, priorité aux questions jamais vues', () => {
  const qs = Array.from({ length: 30 }, (_, i) => ({ id: `Q-t-${String(i + 1).padStart(3, '0')}`, topic: 't', level: (i % 3) + 1, q: 'שאלה ' + i, options: ['A' + i, 'B' + i, 'C' + i, 'D' + i], correct: 2, explanation: 'x', source: { url: 'https://x' } }));
  const bank = { topics: [{ id: 't' }], questions: qs };
  const r = C.pick(bank, { topic: 't', seed: 'abc' });
  assert.equal(r.length, 10);
  r.forEach(it => assert.ok(it.options[it.correct].startsWith('C')));
  assert.ok(r.some(it => it.correct !== 2), 'les réponses sont mélangées');
  const seen = qs.slice(0, 25).map(q => q.id);
  const r2 = C.pick(bank, { topic: 't', seed: 'abc', avoid: seen });
  assert.ok(qs.slice(25).every(q => r2.some(it => it.id === q.id)), 'les 5 jamais vues sont toutes tirées');
  assert.ok(C.pick(bank, { topic: 't', level: 3, seed: 'z' }).every(it => it.level === 3));
  assert.deepEqual(C.pick(bank, { topic: 't', seed: 'same' }).map(i => i.id), C.pick(bank, { topic: 't', seed: 'same' }).map(i => i.id), 'reproductible');
});

test('score : plafonné à 290, bonus de rapidité et de série, zéro si faux', () => {
  assert.equal(C.points(false, 0, 2, 5), 0);
  assert.ok(C.points(true, 0, 3, 10) <= C.MAX_POINTS);
  assert.ok(C.points(true, 1000, 2, 1) > C.points(true, 30000, 2, 1));
  assert.ok(C.points(true, 5000, 2, 4) > C.points(true, 5000, 2, 1));
  const items = [{ id: 'Q-t-001', level: 1, correct: 0 }, { id: 'Q-t-002', level: 1, correct: 1 }];
  const rec = C.record(items, { 'Q-t-001': { choice: 0, ms: 3000 }, 'Q-t-002': { choice: 0, ms: 3000 } }, { runId: 'r1', topic: 't', level: 1 });
  assert.equal(rec.kind, 'parta'); assert.equal(rec.correct, 1); assert.equal(rec.total, 2);
  assert.equal(rec.answerDetails[1].points, 0); assert.ok(rec.answerDetails[0].points > 0);
});

test('progress.savePartA : meilleur score par question, jamais deux fois le même run', async () => {
  const store = {}; const ctx = { self: {}, window: {}, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' }, setTimeout: () => 0, clearTimeout: () => {}, fetch: async () => ({ ok: false }), console, Math, Date, JSON, Object, Array, Map, Set, String, Number, Promise };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(await read('public/progress.js'), ctx);
  const P = ctx.MDProgress;
  const rec = { version: 1, kind: 'parta', runId: 'r1', completedAt: 'x', topic: 'judaism', level: 1, score: 400, correct: 1, total: 2, answerDetails: [{ itemId: 'Q-judaism-001', correct: true, points: 250 }, { itemId: 'Q-judaism-002', correct: false, points: 0 }] };
  const r1 = P.savePartA(rec); assert.equal(r1.saved, true); assert.equal(r1.gained, 250);
  assert.equal(P.savePartA(rec).saved, false);
  const r3 = P.savePartA(Object.assign({}, rec, { runId: 'r2', answerDetails: [{ itemId: 'Q-judaism-001', correct: true, points: 100 }, { itemId: 'Q-judaism-002', correct: true, points: 500 }] }));
  assert.equal(r3.gained, 290, 'meilleur score gardé (250) + nouvelle question plafonnée à 290');
  const st = P.partAStats(); assert.deepEqual(st.known.sort(), ['Q-judaism-001', 'Q-judaism-002']); assert.equal(st.points, 540);
  assert.ok(P.totals().points >= 540);
});

test('banque construite : valide, ≥ 6 questions par thème publié, thèmes du fichier topics.json', async () => {
  if (!(await exists('public/parta/bank.json'))) return;
  const bank = await json('public/parta/bank.json'), T = await json('content/parta/topics.json');
  const v = C.validate(bank);
  assert.deepEqual([...v.errors], []);
  assert.deepEqual(bank.topics.map(t => t.id), T.topics.map(t => t.id));
  bank.topics.filter(t => t.count).forEach(t => assert.ok(t.count >= 6, t.id));
  const files = (await readdir(new URL('../content/parta/questions/', import.meta.url))).filter(f => f.endsWith('.json'));
  assert.equal(files.length, bank.topics.filter(t => t.count).length);
  // Pas de copie d'un bank payant : si le document de référence est fourni (hors dépôt), aucun énoncé ne doit y figurer tel quel.
  const ref = process.env.PARTA_REF_TXT;
  if (ref) { const txt = C.norm(await readFile(ref, 'utf8')); const dup = bank.questions.filter(q => txt.includes(C.norm(q.q))); assert.deepEqual(dup.map(q => q.id), [], 'énoncés copiés du document de référence'); }
});


test('Via Nova Traiana: illustration stays attached after answer shuffling', async () => {
  const bank = await json('public/parta/bank.json');
  const item = C.pick(bank, { ids: ['Q-roman_byzantine-009'], seed: 'via-nova' })[0];
  assert.ok(item.options[item.correct].includes('בוצרה'));
  assert.equal(item.illustration.src, 'assets/learning/via-nova-traiana.png');
  assert.ok(await exists('public/' + item.illustration.src));
});
