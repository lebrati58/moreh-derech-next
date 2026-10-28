// « ציר הזמן והחידון » : données (48 événements), questions, score, chronomètre, résultat, intégration au système de points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const exists = p => access(new URL('../' + p, import.meta.url)).then(() => true, () => false);

async function lib() {
  const ctx = { Math, JSON, Object, Array, Date, String, Number, isFinite };
  vm.createContext(ctx); vm.runInContext(await read('public/history-data.js'), ctx);
  return ctx.MDHistory;
}
const DATA = JSON.parse(await read('public/history-events.json'));

async function progress(now = '2026-10-27T10:00:00') {
  const store = new Map(), RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return new RealDate(now).getTime(); } }
  const window = {};
  const ctx = { window, Date: FakeDate, Math, JSON, Object, Array, Set, String, Number, setTimeout: () => 0, clearTimeout() {},
    crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    fetch: async () => { throw new Error('offline'); }, document: {} };
  vm.createContext(ctx); vm.runInContext(await read('public/progress.js'), ctx);
  return { P: window.MDProgress, store };
}

test('référentiel : 48 événements valides, IDs uniques et stables, ordre chronologique', async () => {
  const H = await lib();
  assert.deepEqual([...H.validate(DATA)], []);
  assert.equal(DATA.events.length, 48);
  assert.equal(new Set(DATA.events.map(e => e.id)).size, 48);
  DATA.events.forEach(e => assert.match(e.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, e.id));
  for (let i = 1; i < 48; i++) assert.ok(DATA.events[i].year >= DATA.events[i - 1].year, DATA.events[i].id);
  assert.ok(DATA.events.every(e => e.year !== 0), 'pas d’an 0');
  // Chaque période a des événements, et chaque événement une période connue.
  const per = new Set(DATA.periods.map(p => p.id));
  DATA.periods.forEach(p => assert.ok(DATA.events.some(e => e.period === p.id), p.id));
  DATA.events.forEach(e => assert.ok(per.has(e.period), e.id));
  // Les IDs de l'ancien prototype (1..48) ne sont plus utilisés : les IDs ne dépendent pas de l'ordre d'affichage.
  assert.ok(DATA.events.every(e => !/^\d+$/.test(e.id)));
});

test('audit : dates contestées / divergentes jamais dans l’examen ; formulations prudentes', async () => {
  const H = await lib();
  const byId = Object.fromEntries(DATA.events.map(e => [e.id, e]));
  DATA.events.filter(e => e.certainty === 'disputed' || e.source === 'course-diff').forEach(e => assert.equal(e.examReady, false, e.id));
  assert.equal(H.pool(DATA, { mode: 'exam' }).length, 44);
  assert.equal(H.pool(DATA, { mode: 'practice' }).length, 48);
  // Points d'audit explicitement demandés.
  assert.equal(byId['second-temple-dedication'].certainty, 'approx');
  assert.match(byId['second-temple-dedication'].note, /515/);
  assert.equal(byId.ezra.certainty, 'disputed');
  assert.match(byId.ezra.note, /398/);
  assert.match(byId.ezra.q, /מסורתי/);
  assert.equal(byId['temple-mount-expansion'].year, -19, 'corrigé selon le תאריכון du cours');
  assert.ok(!DATA.events.some(e => e.year === 612), 'l’entrée « 612 » sans événement a été remplacée');
  // Chaque note/texte affiché est non vide ; les années approximatives ont un libellé explicite ou une note.
  DATA.events.filter(e => e.certainty !== 'firm').forEach(e => assert.ok(e.yearText || e.note, e.id));
});

test('liens de cours : documents Drive précis par période, aucun lien vide ; liens internes existants', async () => {
  for (const p of DATA.periods) {
    assert.match(p.doc.url, /^https:\/\/drive\.google\.com\/file\/d\/[\w-]{20,}\/view$/, p.id);
    assert.ok(p.doc.title.length > 5);
    if (p.lessons) assert.match(p.lessons.url, /^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]{20,}$/);
  }
  assert.match(DATA.course.taarichon.url, /^https:\/\/drive\.google\.com\/file\/d\//);
  for (const e of DATA.events) {
    if (e.doc) assert.match(e.doc.url, /^https:\/\/drive\.google\.com\/file\/d\//, e.id);
    for (const s of e.sites || []) assert.ok(await exists(`public/sites3d/${s}/site.json`), `site 3D ${s}`);
    if (e.j3d) assert.ok(e.j3d >= 1 && e.j3d <= 12);
  }
  const html = await read('public/history.html');
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(await exists('public/' + m[1]), m[1]);
  const sw = await read('public/sw.js');
  for (const f of ['history.html', 'history-app.js', 'history-data.js', 'history-events.json', 'history-link.js']) assert.ok(sw.includes(`'./${f}'`), 'sw: ' + f);
  assert.ok((await read('public/index.html')).includes('href="history.html#/timeline"'), 'tuile accueil');
  assert.ok((await read('public/journey.html')).includes('history.html#/quiz'), 'carte המסע שלי');
  for (const p of ['public/jerusalem3d.html', 'public/site3d.html']) assert.ok((await read(p)).includes('history-link.js'), p);
  assert.ok((await read('public/jerusalem3d/app.js')).includes("'mdl:period'"));
  // Aucune image IA ni badge « image IA » dans le module.
  const app = await read('public/history-app.js');
  assert.ok(!/<img/i.test(app) && !/AI|בינה מלאכותית|IA/.test(app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/MAIN|mail|AIL/g, '')));
});

test('questions : 4 options distinctes, exactement 1 juste, leurres plausibles (≥ 5 ans, jamais une année alternative)', async () => {
  const H = await lib();
  for (let s = 0; s < 40; s++) {
    for (const e of DATA.events) {
      const q = H.buildQuestion(e, DATA.events, 'seed-' + s);
      assert.equal(q.type, 'date'); assert.equal(q.eventId, e.id); assert.equal(q.id, e.id + ':date');
      assert.equal(q.options.length, 4, e.id);
      assert.equal(new Set(q.options.map(o => o.value)).size, 4, e.id);
      assert.equal(new Set(q.options.map(o => o.label)).size, 4, e.id);
      const ok = q.options.filter(o => o.correct);
      assert.equal(ok.length, 1, e.id); assert.equal(ok[0].value, e.year);
      for (const o of q.options.filter(o => !o.correct)) {
        assert.ok(Math.abs(o.value - e.year) >= H.MIN_GAP, `${e.id}: ${o.value}`);
        assert.ok(!(e.alts || []).includes(o.value), `${e.id}: alt ${o.value}`);
        assert.notEqual(o.value, 0);
      }
    }
  }
  // Reproductible avec la même graine (reprise après rechargement), différent avec une autre.
  const e = DATA.events[10];
  assert.deepEqual(H.buildQuestion(e, DATA.events, 'x').options, H.buildQuestion(e, DATA.events, 'x').options);
  // Extensible : un nouveau type de question se branche dans le registre.
  assert.equal(typeof H.QUESTION_TYPES.date, 'function');
});

test('nouveaux types : inverse, ordre, siècle, plusieurs réponses — toujours une correction juste', async () => {
  const H = await lib(); H.setPeriods(DATA.periods);
  const E = Object.fromEntries(DATA.events.map(e => [e.id, e])), seen = {};
  for (let s = 0; s < 25; s++) for (const ev of DATA.events) for (const t of Object.keys(H.QUESTION_TYPES)) {
    const q = H.QUESTION_TYPES[t](ev, DATA.events, 's' + s); if (!q) continue; seen[t] = (seen[t] || 0) + 1;
    assert.equal(q.eventId, ev.id); assert.equal(q.id, ev.id + ':' + t);
    assert.equal(new Set(q.options.map(o => o.label)).size, q.options.length, 'options distinctes ' + q.id);
    const n = q.options.filter(o => o.correct).length;
    if (q.multi) { assert.ok(n >= 1 && n < q.options.length, q.id); assert.equal(H.questionMs(q), 45000); } else assert.equal(n, 1, q.id);
    if (t === 'event') { assert.match(q.prompt, /^מה קרה בשנת /); assert.equal(q.options.find(o => o.correct).value, ev.id); }
    if (t === 'first') { const ys = q.options.map(o => E[o.value].year), last = q.prompt.includes('אחרון'); assert.equal(E[q.options.find(o => o.correct).value].year, last ? Math.max(...ys) : Math.min(...ys), q.id); }
    if (t === 'multiBefore') q.options.forEach(o => assert.equal(o.correct, E[o.value].year < ev.year, q.id));
    if (t === 'multiPeriod') q.options.forEach(o => assert.equal(o.correct, E[o.value].period === ev.period, q.id));
    if (t === 'event' || t === 'first') q.options.filter(o => !o.correct).forEach(o => assert.ok(Math.abs(E[o.value].year - ev.year) >= 10, 'pas de piège à moins de 10 ans ' + q.id));
  }
  for (const t of ['date', 'event', 'first', 'century', 'multiPeriod', 'multiBefore']) assert.ok(seen[t] > 100, 'type utilisé : ' + t);
  // Correction : exactement le bon ensemble.
  const q = H.QUESTION_TYPES.multiBefore(DATA.events.find(e => e.id === 'masada') || DATA.events[28], DATA.events, 'k');
  const good = q.options.map((o, i) => o.correct ? i : -1).filter(i => i >= 0), bad = q.options.findIndex(o => !o.correct);
  assert.equal(H.isCorrect(q, good), true); assert.equal(H.isCorrect(q, good.slice().reverse()), true);
  assert.equal(H.isCorrect(q, good.concat([bad])), false); assert.equal(H.isCorrect(q, null), false);
  if (good.length > 1) assert.equal(H.isCorrect(q, good.slice(1)), false);
  // Partie mélangée : beaucoup plus de questions que d'événements, jamais deux fois la même, examen = événements sûrs uniquement.
  const mix = H.buildRun(DATA, { types: 'mix', count: 60, seed: 'm', mode: 'practice' });
  assert.equal(mix.length, 60); assert.equal(new Set(mix.map(x => x.id)).size, 60);
  assert.ok(new Set(mix.map(x => x.type)).size >= 5, 'au moins 5 types dans une partie mélangée');
  const exam = H.buildRun(DATA, { types: 'mix', count: 60, seed: 'x', mode: 'exam' }), ready = new Set(DATA.events.filter(e => e.examReady).map(e => e.id));
  exam.forEach(x => { assert.ok(ready.has(x.eventId)); x.options.forEach(o => { if (E[o.value]) assert.ok(ready.has(o.value), 'examen : option contestée ' + o.value); }); });
  assert.equal(H.buildRun(DATA, { types: 'date', period: 'persian', count: 99, seed: 'p' }).length, 5, 'type « année » seul : une question par événement');
});

test('toutes les années affichées précisent לפנה״ס ou לספירה', async () => {
  // On efface les années correctement suivies de leur ère (« 66 לספירה », « 203–200 לפנה״ס », « 73 או 74 לספירה »),
  // puis il ne doit plus rester aucun nombre de 2 à 4 chiffres (hormis « הלגיון ה־12 »).
  const withEra = /\d{1,4}(?:\s*(?:–|-|או|\/)\s*\d{1,4})*\s*(?:לפנה״ס|לספירה)/g;
  const bareIn = t => t.replace(/ה־\d+/g, '').replace(withEra, '').match(/\d{2,4}/g);
  for (const e of DATA.events) for (const k of ['yearText', 'title', 'q', 'desc', 'note']) {
    const t = (e[k] || '').replace(/[בכמל]־/g, ' ');
    const m = bareIn(t); assert.equal(m, null, `${e.id}.${k} : année sans ère → ${m}`);
  }
  for (const p of DATA.periods) assert.match(p.range, /(לפנה״ס|לספירה)$/, p.id);
  const H = await lib(); H.setPeriods(DATA.periods);
  for (const ev of DATA.events) for (const t of Object.keys(H.QUESTION_TYPES)) {
    const q = H.QUESTION_TYPES[t](ev, DATA.events, 'era'); if (!q) continue;
    const txt = (q.prompt + ' ' + q.options.map(o => o.label).join(' ')).replace(/[בכמל]־/g, ' ');
    assert.equal(bareIn(txt), null, `${q.id} : ${txt}`);
    if (q.multi) assert.match(H.multiHint(q), /תשובות נכונות|תשובה נכונה אחת/, 'consigne QCM ' + q.id);
  }
});

test('score : 100 + 3 × secondes restantes (arrondi sup.) + 20 × min(série précédente, 5) ; erreur/expiration = 0', async () => {
  const H = await lib();
  assert.equal(H.scoreAnswer(true, 30000, 0), 190);
  assert.equal(H.scoreAnswer(true, 29001, 0), 190);
  assert.equal(H.scoreAnswer(true, 15500, 2), 100 + 48 + 40);
  assert.equal(H.scoreAnswer(true, 1, 9), 100 + 3 + 100);
  assert.equal(H.scoreAnswer(true, 0, 0), 100);
  assert.equal(H.scoreAnswer(false, 30000, 5), 0);
  assert.equal(H.scoreAnswer(true, 30000, 99), H.MAX_POINTS);
  assert.equal(H.MAX_POINTS, 290);
  // Série : 3 justes puis une fausse puis une juste.
  let streak = 0, total = 0;
  for (const ok of [true, true, true, false, true]) { total += H.scoreAnswer(ok, 30000, streak); streak = ok ? streak + 1 : 0; }
  assert.equal(total, 190 + 210 + 230 + 0 + 190);
});

test('chronomètre : pause/reprise (onglet en arrière-plan), expiration', async () => {
  const H = await lib();
  let t = 1000; const T = new H.Timer(30000, () => t);
  assert.equal(T.remaining(), 30000); T.start(); assert.ok(T.running());
  t += 10000; assert.equal(T.remaining(), 20000);
  T.pause(); t += 120000; assert.equal(T.remaining(), 20000, 'le temps ne file pas en pause');
  T.start(); t += 19999; assert.ok(!T.expired()); t += 2; assert.ok(T.expired()); assert.equal(T.remaining(), 0);
  T.pause(); T.start(); assert.ok(!T.running(), 'un chrono expiré ne redémarre pas');
});

test('résultat structuré et versionné', async () => {
  const H = await lib();
  const qs = DATA.events.slice(0, 3).map(e => H.buildQuestion(e, DATA.events, 's'));
  const st = { runId: 'r1', mode: 'exam', period: 'all', questions: qs, bestStreak: 2, activeMs: 12345.6,
    answers: qs.map((q, i) => ({ eventId: q.eventId, questionId: q.id, chosen: q.options[0].value, expected: q.options.find(o => o.correct).value, correct: i < 2, timedOut: i === 2, msUsed: 3000, points: i < 2 ? 150 : 0 })) };
  const r = H.buildResult(st, DATA);
  for (const k of ['version', 'quizId', 'eventIds', 'mode', 'period', 'score', 'correct', 'total', 'durationMs', 'completedAt', 'answerDetails']) assert.ok(k in r, k);
  assert.equal(r.version, 1); assert.equal(r.quizId, 'history-48-dates'); assert.equal(r.score, 300); assert.equal(r.correct, 2); assert.equal(r.total, 3);
  assert.equal(r.durationMs, 12346); assert.deepEqual([...r.eventIds], qs.map(q => q.eventId));
  assert.equal(r.answerDetails[2].timedOut, true);
});

test('points centraux : meilleur score par événement, pas de double comptage, anti-doublon, borne serveur', async () => {
  const { P } = await progress();
  const rec = (runId, mode, pts, ok = true) => ({ version: 1, runId, mode, period: 'all', score: pts * 2, correct: ok ? 2 : 0, total: 2, durationMs: 1000, completedAt: '2026-10-27T10:00:00Z',
    answerDetails: [{ eventId: 'ezra', correct: ok, points: pts }, { eventId: 'nehemiah', correct: ok, points: pts }] });
  assert.equal(P.totals().points, 0);
  let s = P.saveHistory(rec('a', 'exam', 200)); assert.equal(s.saved, true); assert.equal(s.gained, 400);
  assert.equal(P.totals().points, 400); assert.equal(P.totals().answered, 2);
  assert.equal(P.saveHistory(rec('a', 'exam', 200)).reason, 'duplicate', 'même partie enregistrée deux fois');
  assert.equal(P.totals().points, 400);
  s = P.saveHistory(rec('b', 'exam', 150)); assert.equal(s.gained, 0, 'un moins bon score ne retire rien et n’ajoute rien');
  s = P.saveHistory(rec('c', 'exam', 250)); assert.equal(s.gained, 100);
  s = P.saveHistory(rec('d', 'practice', 290)); assert.equal(s.gained, 0, 'l’entraînement ne compte pas');
  assert.equal(P.totals().points, 500);
  P.saveHistory(rec('e', 'exam', 0, false));
  const h = P.historyStats(); assert.deepEqual([...h.mastered].sort(), ['ezra', 'nehemiah'], 'une bonne réponse n’est jamais perdue');
  assert.equal(h.runs.length, 5);
  assert.ok(P.saveHistory({ version: 1 }).saved === false, 'enregistrement invalide refusé');
  const t = P.totals(); assert.ok(t.points <= t.answered * 300, 'compatible avec class_score_submit (points ≤ answered × 300)');
  assert.equal(P.history(1)[0].a, 10, 'activité du jour comptée (série de jours)');
  // Les erreurs du quiz historique n'entrent pas dans la révision des 22 סיורים (identifiants inconnus là-bas).
  assert.deepEqual([...P.mistakes()], []);
  const { P: P2 } = await progress(); P2.saveHistory(rec('z', 'practice', 0, false));
  assert.deepEqual([...P2.historyStats().mistakes].sort(), ['ezra', 'nehemiah']);
});

test('contrastes AA : couleurs de période sur fond sombre et texte foncé sur pastille colorée', async () => {
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const p of DATA.periods) {
    assert.ok(ratio(p.color, '#151f4a') >= 4.5, `${p.id} sur carte : ${ratio(p.color, '#151f4a').toFixed(2)}`);
    assert.ok(ratio(p.color, '#111d40') >= 4.5, `${p.id} sur fiche`);
    assert.ok(ratio('#10173a', p.color) >= 4.5, `texte sur ${p.id}`);
  }
});

test('niveaux de difficulté : leurres plus ou moins proches, chrono, points', async () => {
  const H = await lib(); H.setPeriods(DATA.periods);
  const evs = DATA.events, gap = q => Math.min(...q.options.filter(o => !o.correct).map(o => Math.abs(o.value - q.options.find(x => x.correct).value)));
  const avg = lv => { const qs = H.buildRun(DATA, { seed: 'lv', types: 'date', level: lv }); return { n: qs.length, min: Math.min(...qs.map(gap)), mean: qs.map(gap).reduce((a, b) => a + b, 0) / qs.length, ms: qs[0].ms }; };
  const e = avg(1), m = avg(2), h = avg(3);
  assert.ok(e.min >= 40, 'קל : leurres à 40 ans ou plus (min ' + e.min + ')');
  assert.ok(m.min >= H.MIN_GAP && h.min >= 3, 'בינוני ≥ 5 ans, קשה ≥ 3 ans');
  assert.ok(e.mean > m.mean && m.mean > h.mean, `écart moyen décroissant : ${e.mean.toFixed(0)} > ${m.mean.toFixed(0)} > ${h.mean.toFixed(0)}`);
  assert.deepEqual([e.ms, m.ms, h.ms], [40000, 30000, 20000]);
  assert.equal(e.n, evs.length); assert.equal(h.n, evs.length);
  // le niveau moyen est le jeu d'origine
  assert.deepEqual(H.buildRun(DATA, { seed: 's', types: 'mix', level: 2 }).map(q => q.id), H.buildRun(DATA, { seed: 's', types: 'mix' }).map(q => q.id));
  // points : facile ×0,75 ; difficile = même barème, le bonus suit la part du temps restant ; jamais plus de 290
  assert.equal(H.scoreAnswer(true, 30000, 0, 2, 30000), 190);
  assert.equal(H.scoreAnswer(true, 40000, 0, 1, 40000), Math.round(190 * 0.75));
  assert.equal(H.scoreAnswer(true, 20000, 0, 3, 20000), 190);
  assert.equal(H.scoreAnswer(true, 10000, 0, 3, 20000), H.scoreAnswer(true, 15000, 0, 2, 30000));
  assert.ok(H.scoreAnswer(true, 20000, 99, 3, 20000) <= H.MAX_POINTS);
  // aucune réponse ne reprend une année alternative reconnue
  for (const lv of [1, 2, 3]) for (const q of H.buildRun(DATA, { seed: 'alt' + lv, types: 'date', level: lv })) {
    const ev = evs.find(x => x.id === q.eventId); for (const o of q.options) if (!o.correct) assert.ok(!(ev.alts || []).includes(o.value), q.id);
  }
});
