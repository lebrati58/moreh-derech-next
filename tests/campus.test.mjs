// « 🏆 אלוף הקורס » : banque (22 סיורים + frise + architecture), tirage, score à la vitesse, arbitre, confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const json = async p => JSON.parse(await read(p));

const ctx = { Math, JSON, Object, Array, Date, String, Number, isFinite };
vm.createContext(ctx);
vm.runInContext(await read('public/history-data.js'), ctx);
vm.runInContext(await read('public/campus/campus-core.js'), ctx);
const C = ctx.MDCampus;
const BANK = C.buildBank({ tours: await json('public/guided-quiz.json'), H: ctx.MDHistory, history: await json('public/history-events.json'), arch: await json('public/architecture/data.json') });

test('banque : les trois sources, 4 réponses distinctes, une bonne réponse, identifiants uniques', () => {
  const by = s => BANK.filter(q => q.src === s).length;
  assert.ok(by('tours') >= 1300, 'tours ' + by('tours'));
  assert.ok(by('history') >= 40, 'history ' + by('history'));
  assert.ok(by('arch') >= 100, 'arch ' + by('arch'));
  const ids = new Set();
  for (const q of BANK) {
    assert.ok(!ids.has(q.id), 'doublon ' + q.id); ids.add(q.id);
    assert.equal(q.options.length, 4, q.id);
    assert.equal(new Set(q.options).size, 4, 'réponses en double ' + q.id);
    assert.ok(q.correct >= 0 && q.correct < 4, q.id);
    assert.ok([1, 2, 3].includes(q.level), q.id);
    assert.ok(q.text.length > 5, q.id);
  }
  // la réponse n'est jamais écrite dans la question d'architecture « quel terme ? »
  for (const q of BANK.filter(x => x.src === 'arch' && x.id.endsWith(':name'))) assert.ok(!q.text.includes(q.options[q.correct]), q.id);
});

test('tirage : nombre, sans doublon, du plus facile au plus difficile, dernière question ×2, filtres', () => {
  const g = C.buildGame(BANK, { count: 20, seed: 'a' });
  assert.equal(g.length, 20);
  assert.equal(new Set(g.map(q => q.id)).size, 20);
  assert.ok(g[0].level <= g[19].level);
  const avg = a => a.reduce((n, q) => n + q.level, 0) / a.length;
  assert.ok(avg(g.slice(0, 6)) < avg(g.slice(-6)), 'difficulté croissante');
  assert.equal(g.filter(q => q.double).length, 1); assert.ok(g[19].double);
  assert.equal(C.buildGame(BANK, { count: 5, seed: 'a', finalDouble: false }).filter(q => q.double).length, 0);
  // les réponses remélangées gardent la bonne réponse
  for (const q of g) { const src = BANK.find(b => b.id === q.id); assert.equal(q.options[q.correct], src.options[src.correct]); }
  // reproductible
  assert.deepEqual(C.buildGame(BANK, { count: 10, seed: 'x' }).map(q => q.id), C.buildGame(BANK, { count: 10, seed: 'x' }).map(q => q.id));
  // filtres
  const t = C.buildGame(BANK, { count: 15, seed: 'b', sources: ['tours'], tours: ['03', '07'] });
  assert.ok(t.every(q => q.src === 'tours' && ['03', '07'].includes(BANK.find(b => b.id === q.id).tour)));
  assert.ok(C.buildGame(BANK, { count: 10, seed: 'c', sources: ['history'] }).every(q => q.src === 'history'));
  // mélange des sources par défaut
  const mix = C.buildGame(BANK, { count: 30, seed: 'd' });
  assert.ok(new Set(mix.map(q => q.src)).size >= 2);
  // questions déjà jouées évitées tant que possible
  const avoid = g.map(q => q.id), again = C.buildGame(BANK, { count: 20, seed: 'a', avoid });
  assert.ok(again.every(q => !avoid.includes(q.id)));
});

test('score : la vitesse compte, marge réseau, série plafonnée, question ×2', () => {
  assert.equal(C.speedPoints(0, 20000), 1000);
  assert.equal(C.speedPoints(C.GRACE_MS, 20000), 1000);
  assert.equal(C.speedPoints(20000, 20000), 500);
  assert.ok(C.speedPoints(5000, 20000) > C.speedPoints(10000, 20000));
  assert.deepEqual({ ...C.scoreAnswer({ correct: false, ms: 100, limitMs: 20000, streak: 3 }) }, { points: 0, speed: 0, streakBonus: 0 });
  assert.equal(C.scoreAnswer({ correct: true, ms: 0, limitMs: 20000, streak: 1 }).points, 1000);
  assert.equal(C.scoreAnswer({ correct: true, ms: 0, limitMs: 20000, streak: 3 }).points, 1100);
  assert.equal(C.scoreAnswer({ correct: true, ms: 0, limitMs: 20000, streak: 40 }).streakBonus, C.STREAK_CAP);
  assert.equal(C.scoreAnswer({ correct: true, ms: 0, limitMs: 20000, streak: 1, double: true }).points, 2000);
});

test('arbitre : inscription, temps mesuré par l\'hôte, une seule réponse, classement et podium', () => {
  const qs = C.buildGame(BANK, { count: 3, seed: 'z' });
  const g = C.createGame(qs, { seconds: 20 });
  assert.ok(C.join(g, 'a', 'דנה', '🦁').ok);
  assert.ok(C.join(g, 'b', 'דנה', '🐪').ok);
  assert.equal(g.players.b.name, 'דנה (2)');
  assert.ok(C.join(g, 'c', '<b>יוסי</b>', 'X').ok);
  assert.ok(!/[<>]/.test(g.players.c.name)); assert.ok(C.AVATARS.includes(g.players.c.avatar));
  assert.equal(C.join(g, 'a', 'דנה').player.name, 'דנה', 'reconnexion = même joueur, même nom');
  assert.equal(C.publicState(g, 0).roster.length, 3);

  const t0 = 1_000_000;
  C.startQuestion(g, t0, 3000);
  const start = t0 + 3000, q = qs[0], bad = (q.correct + 1) % 4;
  assert.equal(C.answer(g, 'a', 0, q.correct, start - 1000).error, 'too_soon', 'pas de réponse pendant la lecture');
  // la bonne réponse et l'explication ne partent jamais pendant la question
  const pub = C.publicState(g, start);
  assert.equal(pub.q.correct, undefined); assert.equal(pub.q.explanation, undefined); assert.equal(pub.q.qid, undefined);
  assert.ok(!JSON.stringify(pub).includes('"correct"'));
  assert.equal(pub.pre, 0); assert.equal(pub.left, 20000);

  assert.ok(C.answer(g, 'a', 0, q.correct, start + 400).ok);             // dans la marge : 1000
  assert.ok(C.answer(g, 'a', 0, bad, start + 500).duplicate, 'seule la première réponse compte');
  assert.ok(C.answer(g, 'b', 0, q.correct, start + 10300).ok);
  assert.equal(C.answer(g, 'x', 0, 1, start).error, 'unknown_player');
  assert.equal(C.answer(g, 'c', 1, 1, start).error, 'wrong_question');
  assert.equal(C.answer(g, 'c', 0, 7, start).error, 'bad_choice');
  assert.ok(!C.everyoneAnswered(g));
  assert.ok(C.answer(g, 'c', 0, bad, start + 2000).ok);
  assert.ok(C.everyoneAnswered(g));
  assert.deepEqual(C.publicState(g, start).got.sort(), ['a', 'b', 'c']);

  C.reveal(g);
  assert.equal(g.players.a.score, 1000);
  assert.equal(g.players.b.score, C.speedPoints(10300, 20000));
  assert.equal(g.players.c.score, 0);
  const rv = C.publicState(g, start);
  assert.equal(rv.q.correct, q.correct); assert.equal(rv.q.qid, q.id);
  assert.equal(rv.dist.reduce((a, b) => a + b, 0), 3);
  assert.deepEqual(rv.scores.map(r => r[0]), ['a', 'b', 'c']);
  C.showBoard(g);

  // question 2 : réponse arrivée après la fin du chrono (au-delà de la marge) refusée
  C.startQuestion(g, t0 + 60000, 0);
  const q2 = qs[1], s2 = t0 + 60000;
  assert.equal(C.answer(g, 'c', 1, q2.correct, s2 + 20000 + C.LATE_MS + 1).error, 'closed');
  assert.ok(C.answer(g, 'c', 1, q2.correct, s2 + 20000 + 500).ok, 'réponse un peu en retard (réseau) acceptée, comptée au temps limite');
  assert.equal(g.answers[1].c.ms, 20000);
  C.reveal(g); C.showBoard(g);
  assert.equal(g.players.c.last, 500);

  // départage : même score → le plus de bonnes réponses, puis le plus rapide
  const r = C.ranking({ x: { id: 'x', score: 900, right: 1, timeRight: 3000, joined: 1 }, y: { id: 'y', score: 900, right: 1, timeRight: 1000, joined: 2 }, z: { id: 'z', score: 900, right: 2, timeRight: 9000, joined: 3 } });
  assert.deepEqual(r.map(p => p.id), ['z', 'y', 'x']);

  C.removePlayer(g, 'b');
  assert.equal(C.ranking(g.players).length, 2);
  C.startQuestion(g, t0 + 90000, 0); C.reveal(g); C.showBoard(g);
  assert.ok(C.startQuestion(g, t0 + 99000, 0).finished, 'après la dernière question : podium');
  const fs = C.finalStats(g), end = C.publicState(g, t0);
  assert.equal(end.phase, 'podium');
  assert.equal(fs.fastest.name, 'דנה');
  assert.equal(end.top[0][0], 'דנה');
});

test('code de partie, intégration dans le site et hors ligne', async () => {
  for (let i = 0; i < 50; i++) assert.match(C.makePin(), /^[1-9]\d{4}$/);
  assert.ok(C.readMs({ text: 'x', options: ['a', 'b', 'c', 'd'] }) >= 3000);
  assert.ok(C.readMs({ text: 'x'.repeat(500), options: ['a', 'b', 'c', 'd'] }) <= 7000);
  const html = await read('public/campus.html');
  for (const s of ['config.js', 'vendor/supabase/supabase.js', 'campus/campus-core.js', 'campus/campus-net.js', 'campus/campus-app.js', 'history-data.js', 'progress.js']) assert.ok(html.includes(`src="${s}"`), s);
  const sw = await read('public/sw.js');
  for (const f of ['./campus.html', './campus/campus-core.js', './campus/campus-net.js', './campus/campus-app.js', './vendor/supabase/supabase.js', './architecture/data.json']) assert.ok(sw.includes(`'${f}'`), f);
  assert.ok((await read('public/index.html')).includes('href="campus.html"'));
  assert.ok((await read('public/vendor/supabase/LICENSE')).includes('MIT'));
});
