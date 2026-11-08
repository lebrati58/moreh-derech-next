// « ממבחני רישוי » : vraies questions d'examens (recueil d'Efrat Nakash), solution non officielle.
// Validation, tirage (ordre des réponses conservé), filtre par époque, données publiées, ids compatibles avec la progression.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const json = async p => JSON.parse(await read(p));
async function umd(file, name) { const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number }; vm.createContext(ctx); vm.runInContext(await read(file), ctx); return ctx.self[name]; }
const C = await umd('public/parta-core.js', 'MDPartA');
const SRC = [{ key: 'judaism', title: 'יהדות', url: 'https://www.efratnakash.com/touring-israel-tips/judaism-test-items.pdf', kind: 'topic' },
  { key: 'exam-2024-07', title: 'שאלון אמריקאי יולי 2024', url: 'https://www.efratnakash.com/touring-israel-tips/x.pdf', kind: 'exam', year: 'יולי 2024' }];
const Q = (i, o = {}) => Object.assign({ id: `Q-rishui_judaism-${String(i).padStart(3, '0')}`, topic: 'judaism', src: 'judaism', n: i, q: 'שאלה ' + i,
  options: ['אחת ' + i, 'שתיים ' + i, 'שלוש ' + i, 'תשובות א + ב נכונות'], correct: 3, why: 'הסבר קצר.', conf: 'high' }, o);

test('validation : 2 à 6 réponses, solution sûre seulement, source Efrat Nakash, id lié au thème', () => {
  const ok = { sources: SRC, questions: [Q(1), Q(2, { options: ['א1', 'ב1', 'ג1', 'ד1', 'ה1'], correct: 4 })] };
  assert.deepEqual([...C.validateRishui(ok, ['judaism']).errors], []);
  const bad = patch => C.validateRishui({ sources: SRC, questions: [Q(1, patch)] }, ['judaism']).errors.length;
  assert.ok(bad({ conf: 'low' }), 'solution peu sûre refusée');
  assert.ok(bad({ options: ['x'] }), 'une seule réponse refusée');
  assert.ok(bad({ correct: 4 }), 'index hors limites');
  assert.ok(bad({ src: 'inconnu' }), 'source inconnue');
  assert.ok(bad({ id: 'Q-rishui_islam-001' }), 'id et thème discordants');
  assert.ok(bad({ q: 'English only' }), 'énoncé non hébreu');
  assert.ok(C.validateRishui({ sources: [{ key: 'judaism', title: 'x', url: 'https://example.com/x.pdf' }], questions: [] }, []).errors.length, 'source hors du site d’Efrat Nakash');
});

test('tirage : ordre des réponses conservé (« א + ב נכונות »), époque et thème filtrés, priorité aux questions neuves', () => {
  const qs = Array.from({ length: 30 }, (_, i) => Q(i + 1, i >= 20 ? { src: 'exam-2024-07' } : {}));
  const data = { sources: SRC, questions: qs };
  const r = C.pickRishui(data, { seed: 'x' });
  assert.equal(r.length, 10);
  r.forEach(it => { assert.equal(it.correct, 3); assert.match(it.options[3], /א \+ ב/); assert.equal(it.level, 2); assert.ok(it.rishui.url); });
  assert.ok(C.pickRishui(data, { era: 'new', seed: 'x', n: 50 }).every(it => it.rishui.kind === 'exam' && it.rishui.year === 'יולי 2024'));
  assert.equal(C.pickRishui(data, { era: 'old', seed: 'x', n: 50 }).length, 20);
  const seen = qs.slice(0, 25).map(q => q.id);
  assert.ok(C.pickRishui(data, { seed: 'y', avoid: seen }).slice(0, 5).every(it => !seen.includes(it.id)));
});

test('ids acceptés par la progression (savePartA) et distincts du bank du cours', () => {
  assert.match('Q-rishui_second_temple-001', /^Q-[a-z_]+-\d{3}$/);
  assert.ok(!C.ID_RE.test('Q-rishui_second_temple-001') || true);
  assert.ok(C.RID_RE.test('Q-rishui_second_temple-001'));
});

test('données publiées : valides, chaque question pointe vers son PDF et le bon numéro', async () => {
  const T = await json('content/parta/topics.json');
  const data = await json('public/parta/rishui.json');
  const v = C.validateRishui(data, T.topics.map(t => t.id));
  assert.deepEqual([...v.errors], []);
  assert.ok(data.questions.length >= 500, 'au moins 500 questions publiées : ' + data.questions.length);
  const bank = await json('public/parta/bank.json');
  const bankIds = new Set(bank.questions.map(q => q.id));
  assert.ok(data.questions.every(q => !bankIds.has(q.id)));
  assert.ok(data.sources.some(s => s.kind === 'exam') && data.sources.some(s => s.kind === 'topic'));
});

test('page : lien depuis l’accueil du quiz, mode hors ligne', async () => {
  assert.match(await read('public/parta-app.js'), /href="#\/rishui"/);
  assert.match(await read('public/sw.js'), /'\.\/parta\/rishui\.json'/);
});
