// Suivi du joueur : série de jours, erreurs à revoir, défi du jour (progress.js) + pages liées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

async function load(now) {
  const store = new Map();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return new RealDate(now).getTime(); } }
  const window = {};
  const ctx = {
    window, Date: FakeDate, Math, JSON, Object, Array, Set, String, Number, setTimeout: () => 0, clearTimeout() {},
    crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    fetch: async () => { throw new Error('offline'); }, document: {}
  };
  vm.createContext(ctx);
  vm.runInContext(await read('public/progress.js'), ctx);
  return { P: window.MDProgress, store, ctx };
}

test('mistakes stay open until answered correctly', async () => {
  const { P } = await load('2026-10-24T10:00:00');
  P.mark('A', false); P.mark('B', true); P.mark('C', false);
  assert.deepEqual([...P.mistakes()].sort(), ['A', 'C']);
  P.mark('A', true);
  assert.deepEqual([...P.mistakes()], ['C']);
  P.mark('B', false); // une bonne réponse n'est jamais perdue
  assert.deepEqual([...P.mistakes()], ['C']);
  assert.equal(P.accuracy(), 67);
});

test('day streak counts consecutive local days', async () => {
  const saved = JSON.stringify({ q: {}, lv: {}, days: { '2026-10-21': { a: 3, c: 2 }, '2026-10-22': { a: 1, c: 1 }, '2026-10-23': { a: 5, c: 4 } } });
  // Pas encore joué aujourd'hui : la série d'hier compte toujours.
  const s2 = await load('2026-10-24T10:00:00'); s2.store.set('mdl_progress_v1', saved);
  assert.equal(s2.P.dayStreak(), 3);
  s2.P.mark('X', true);
  assert.equal(s2.P.dayStreak(), 4);
  const h = s2.P.history(14);
  assert.equal(h.length, 14);
  assert.equal(h[13].day, '2026-10-24');
  assert.equal(h[13].a, 1);
  // Un jour sauté casse la série.
  const s3 = await load('2026-10-26T10:00:00'); s3.store.set('mdl_progress_v1', s2.store.get('mdl_progress_v1'));
  assert.equal(s3.P.dayStreak(), 0);
});

test('daily challenge: same 5 questions for everyone on a given day, first try counts', async () => {
  const qs = (await read('public/guided-quiz.json').then(JSON.parse)).questions;
  const a = await load('2026-10-24T08:00:00'), b = await load('2026-10-24T22:00:00'), c = await load('2026-10-25T08:00:00');
  const ids = x => Array.from(x.P.dailyPick(qs), q => q.id), ia = ids(a), ib = ids(b), ic = ids(c);
  assert.equal(ia.length, 5);
  assert.deepEqual(ia, ib);
  assert.notDeepEqual(ia, ic);
  assert.equal(new Set(ia).size, 5);
  assert.deepEqual(Array.from(a.P.dailyPick(qs), q => q.level), [1, 1, 2, 2, 3]);
  assert.ok(a.P.dailyPick(qs).every(q => q.tourId !== 'road67'));
  a.P.saveDaily(3, 5); a.P.saveDaily(5, 5);
  assert.deepEqual({ ...a.P.dailyResult() }, { right: 3, total: 5 });
  assert.equal(a.P.dailyStreak(), 1);
});

test('game page offers review and daily modes; journey page is linked and cached', async () => {
  const game = await read('public/guided-tour.html');
  assert.match(game, /"review","daily"/);
  assert.match(game, /MDProgress\.dailyPick\(data\.questions\)/);
  assert.match(game, /MDProgress\.mistakes\(\)/);
  assert.match(game, /function finishDaily/);
  const journey = await read('public/journey.html');
  assert.match(journey, /<script src="progress\.js"><\/script>/);
  assert.match(journey, /guided-tour\.html\?mode=review&new=1/);
  assert.doesNotMatch(journey, /geolocation/);
  const home = await read('public/index.html');
  assert.match(home, /href="journey\.html"/);
  assert.match(home, /qDaily:'Défi du jour'/);
  assert.match(home, /qJourney:'Мой путь'/);
  assert.match(await read('public/sw.js'), /'\.\/journey\.html'/);
});
