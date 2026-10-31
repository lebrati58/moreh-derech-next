// « אדריכלות קלאסית » : données (14 maquettes, 162 éléments, 83 questions ouvertes), parties de zihouï, score, progression.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const D = JSON.parse(await read('public/architecture/data.json'));

async function lib() { const ctx = { Math, JSON, Object, Array, Date, String, Number, isFinite }; vm.createContext(ctx); vm.runInContext(await read('public/architecture/arch-core.js'), ctx); return ctx.MDArch; }
async function progress() {
  const store = new Map(); const window = {};
  const ctx = { window, Date, Math, JSON, Object, Array, Set, String, Number, setTimeout: () => 0, clearTimeout() {},
    crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) }, fetch: async () => { throw new Error('offline'); }, document: {} };
  vm.createContext(ctx); vm.runInContext(await read('public/progress.js'), ctx); return window.MDProgress;
}

test('données : valides, 14 maquettes, 162 éléments, 83 questions, sources liées', async () => {
  const A = await lib();
  assert.deepEqual([...A.validate(D)], []);
  assert.deepEqual({ ...A.counts(D) }, { scenes: 14, parts: 162, open: 83 });
  D.scenes.forEach(s => s.src.forEach(k => assert.ok(D.sources[k], s.id + ':' + k)));
  // termes du cours du Dr Miron présents
  const names = D.scenes.flatMap(s => s.parts.map(p => p.he)).join('|');
  ['סטילובט', 'טריגליף', 'מטופה', 'אבקוס', 'אכינוס', 'קנילורות', 'טטרפילון', 'אינסולה', 'וומיטוריום', 'אמבולקרום', 'מטה פרימה', 'נרתקס', 'היפוקאוסט', 'ממל', 'עקלים']
    .forEach(t => assert.ok(names.includes(t) || D.scenes.some(s => s.parts.some(p => p.d.includes(t))), t));
  // la גת n'a pas de document du cours : la maquette le dit
  assert.match(A.scene(D, 'gat').intro, /לא נמצא מסמך קורס/);
});

test('constructeurs 3D : une maquette par scène de data.json', async () => {
  const src = await read('public/architecture/scenes.js');
  D.scenes.forEach(s => assert.match(src, new RegExp('\\n' + s.id + '\\(\\)\\{'), s.id));
});

test('partie de zihouï : reproductible, sans doublon, leurres distincts, bonne réponse présente', async () => {
  const A = await lib();
  const a = A.buildRun(D, { scene: 'all', n: 15, seed: 42 }), b = A.buildRun(D, { scene: 'all', n: 15, seed: 42 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.length, 15);
  assert.equal(new Set(a.map(r => r.id)).size, 15);
  assert.deepEqual([...new Set(a.map(r => r.kind))].sort(), ['find', 'latin', 'name']);
  for (const r of a) {
    const s = A.scene(D, r.scene), p = s.parts.find(x => x.t === r.tag);
    if (r.kind === 'find') { assert.equal(r.answer, p.t); continue; }
    assert.equal(r.options.length, 4); assert.equal(new Set(r.options).size, 4);
    assert.equal(r.options[r.answer], r.kind === 'latin' ? p.la : p.he);
    assert.ok(!r.options.includes('—'));
  }
  const one = A.buildRun(D, { scene: 'bath', n: 50, seed: 1 });
  assert.equal(one.length, A.scene(D, 'bath').parts.length);
  assert.ok(one.every(r => r.scene === 'bath'));
});

test('score : 290 max, 0 si faux, questions ouvertes au prorata', async () => {
  const A = await lib();
  assert.equal(A.scoreRound(false, 100, 5), 0);
  assert.equal(A.scoreRound(true, 0, 9), 290);
  assert.equal(A.scoreRound(true, A.ROUND_MS, 0), 100);
  assert.deepEqual({ ...A.scoreOpen(3, 4) }, { ratio: .75, points: 218, ok: true });
  assert.equal(A.scoreOpen(2, 4).ok, false);
  assert.equal(A.scoreOpen(9, 4).points, 290);
});

test('progression : meilleur score par élément, anti-doublon, compté dans le total, erreurs à revoir', async () => {
  const A = await lib(), P = await progress();
  const r1 = A.buildResult({ mode: 'zihoui', runId: 'r1', details: [{ itemId: 'P:temple:styl', correct: true, points: 250 }, { itemId: 'P:bath:hyp', correct: false, points: 0 }, { itemId: 'evil<script>', correct: true, points: 290 }] });
  assert.equal(P.saveArch(r1).gained, 250);
  assert.equal(P.saveArch(r1).reason, 'duplicate');
  const r2 = A.buildResult({ mode: 'open', runId: 'r2', details: [{ itemId: 'P:temple:styl', correct: true, points: 120 }, { itemId: 'A-arch-01', correct: true, points: 290 }] });
  assert.equal(P.saveArch(r2).gained, 290);
  const st = P.archStats();
  assert.equal(st.points, 540); assert.deepEqual([...st.mistakes], ['P:bath:hyp']); assert.equal(st.best('P:temple:styl'), 250);
  assert.equal(P.totals().points, 540);
  assert.equal(P.saveArch({ version: 1, kind: 'tour', runId: 'x', answerDetails: [] }).saved, false);
});
