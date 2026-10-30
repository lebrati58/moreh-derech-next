// Tests V3 (route 67) : banque séparée, 4 langues sans hébreu oublié, 45 s / 30 s minimum, prénoms
// identiques, reconnexion, confidentialité, migration rejouable (depuis l'état V2 de la branche),
// et moteur GPS (map matching, alertes, pannes, simulation, fin avant Aroma, aucune publication).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { freshDb, rpc } from './helpers.mjs';
import { loadV3, validateV3, LANGS } from '../tools/build-v3-sql.mjs';

const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const DATA = loadV3();
const SRC = Object.fromEntries(DATA.v3.questions.map(q => [q.id, q]));
const srcOf = q => SRC[q.ext_key.replace(/^v3:/, '')];
// gps-engine.js est un script navigateur (UMD) : on l'évalue tel quel, sans adaptation
const GPS = (() => { const m = { exports: {} }; new Function('module', 'self', file('public/gps-engine.js'))(m, {}); return m.exports; })();
const ROUTE = JSON.parse(file('public/v3/road67-route.json'));

let c, admin;
const ageOpen = sec => c.query(`
  update mdl.games set opened_at = opened_at - make_interval(secs => ${+sec}) where is_active;
  update mdl.game_questions gq set opened_at = gq.opened_at - make_interval(secs => ${+sec}),
         closes_at = gq.closes_at - make_interval(secs => ${+sec})
    from mdl.games g where g.is_active and gq.game_id = g.id and gq.question_id = g.current_question`);
const state = () => rpc(c, 'admin_state', { p_token: admin });
const newGame = (bank, title) => rpc(c, 'admin_new_game', { p_token: admin, p_title: title || bank, p_bank: bank });

before(async () => {
  c = await freshDb('mdl_v3', { seed: false });
  await c.query(file('supabase/install.sql'));
  admin = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
});
after(async () => c && c.end());

// ===================================================================== Contenu
test('contenu V3 : validé, 14 questions principales, 4 langues, aucune photo, NVIDIA présente', () => {
  assert.equal(validateV3(DATA), true);
  const main = DATA.v3.questions.filter(q => q.selection === 'MAIN').sort((a, b) => a.order - b.order);
  assert.equal(main.length, 14);
  assert.equal(DATA.v3.questions.filter(q => q.selection === 'SPARE').length, 0);
  assert.ok(main.some(q => q.id === 'ROAD67-06' && q.final), 'question NVIDIA présente');
  const nv = SRC['ROAD67-06'];
  assert.equal(nv.i18n.he.question, 'איזו חברה ישראלית שפעלה ביוקנעם נרכשה על ידי אנבידיה בשנת 2020?');
  assert.deepEqual(nv.i18n.he.options, ['מלאנוקס', 'מובילאיי', 'ווייז', 'אנוביט']);
  // la bonne réponse n'est pas toujours au même endroit (sinon les élèves le remarquent)
  const pos = [0, 0, 0, 0]; DATA.v3.questions.forEach(q => pos[q.correctIndex]++);
  assert.ok(Math.max(...pos) <= 5, 'bonnes réponses trop souvent à la même place : ' + pos);
  assert.equal(nv.correctIndex, 0);
  assert.ok(nv.sources.some(s => s.url.includes('nvidianews.nvidia.com')));
  for (const q of DATA.v3.questions) {
    for (const l of LANGS) {
      const words = q.i18n[l].script.split(/\s+/).length, longW = q.i18n[l].long.split(/\s+/).length;
      assert.ok(words <= 30, `script court ${q.id} ${l} : ${words} mots (une phrase au micro)`);
      assert.ok(longW >= 45 && longW <= 110, `version longue ${q.id} ${l} : ${longW} mots`);
      if (l !== 'he') for (const f of ['question', 'explanation', 'script', 'long', 'fact', 'cue', 'caution'])
        assert.ok(!/[֐-׿]/.test(q.i18n[l][f]), `${q.id} ${l}.${f} contient de l'hébreu`);
    }
  }
  // côté « vérifié » seulement quand les deux documents de guidage sont d'accord (consigne du guide)
  assert.deepEqual(ROUTE.stops.filter(s => s.side.verified).map(s => s.id), ['S12', 'S1', 'S2', 'S7', 'S3', 'S4', 'S5']);
  for (const s of ROUTE.stops) if (s.side.verified) assert.ok(['left', 'right'].includes(s.side.value), s.id);
  // le générateur refuse une traduction recopiée en hébreu (bug de la première ébauche V3)
  const bad = structuredClone(DATA);
  bad.v3.questions[0].i18n.fr.explanation = bad.v3.questions[0].i18n.he.explanation;
  assert.throws(() => validateV3(bad), /hébreu/);
  const photo = structuredClone(DATA); photo.v3.questions[0].photos = ['x.jpg'];
  assert.throws(() => validateV3(photo), /photo/);
});

// ===================================================================== Base de données
test('banques séparées V1/V2/V3, V3 à 45 s, jamais mélangées', async () => {
  let s = await state();
  assert.deepEqual(s.banks.map(b => [b.code, b.main, b.spare]), [['V1', 34, 0], ['V2', 6, 2], ['V3', 14, 0]]);
  const v1 = s.questions;
  await newGame('V3');
  s = await state();
  assert.equal(s.game.bank, 'V3'); assert.equal(s.game.default_time_limit_sec, 45); assert.equal(s.game.min_answer_sec, 30);
  assert.equal(s.questions.length, 14); assert.ok(s.questions.every(q => q.bank === 'V3' && q.enabled));
  assert.ok(s.questions.every(q => !q.route_meta.photos), 'aucune photo en V3');
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: v1[0].id })).error, 'wrong_bank');
  // lecture d'une autre banque pour la simulation : admin seulement, ne change rien
  const b = await rpc(c, 'admin_bank_questions', { p_token: admin, p_bank: 'V3' });
  assert.equal(b.questions.length, 14);
  await assert.rejects(rpc(c, 'admin_bank_questions', { p_token: 'x', p_bank: 'V3' }), /not_authorized/);
  // V2 et V1 restent jouables
  await newGame('V2'); s = await state(); assert.equal(s.questions.length, 8); assert.ok(s.questions.every(q => q.bank === 'V2'));
  await newGame('V1'); s = await state(); assert.equal(s.questions.length, 34);
  assert.equal((await rpc(c, 'admin_new_game', { p_token: admin, p_bank: 'V9' })).error, 'bad_bank');
});

test('élèves : prénom seul, homonymes, aucune question automatique, reconnexion', async () => {
  await newGame('V3', 'homonymes');
  const ps = [];
  for (let i = 0; i < 5; i++) ps.push(await rpc(c, 'join_game', { p_name: 'David', p_lang: LANGS[i % 4] }));
  assert.ok(ps.every(p => !p.error && p.name === 'David' && p.code === undefined));
  assert.equal(new Set(ps.map(p => p.player_id)).size, 5);
  let s = await state();
  assert.equal(s.players, 5); assert.equal(s.game.phase, 'waiting'); assert.equal(s.current, null, 'rejoindre ne publie rien');
  const names = s.leaderboard.map(r => r.name).sort();
  assert.deepEqual(names, ['David', 'David (2)', 'David (3)', 'David (4)', 'David (5)']);
  // reconnexion par jeton : même joueur, langue mise à jour, jamais de doublon
  const back = await rpc(c, 'join_game', { p_name: 'David', p_token: ps[2].token, p_lang: 'ru' });
  assert.equal(back.player_id, ps[2].player_id); assert.equal(back.reconnected, true); assert.equal(back.lang, 'ru');
  assert.equal((await state()).players, 5);
  // un jeton inventé ne donne accès à personne
  const fake = await rpc(c, 'get_state', { p_token: '00000000-0000-4000-8000-000000000000', p_since: 0 });
  assert.equal(fake.error, 'unknown_player');
  const st = await rpc(c, 'get_state', { p_token: ps[1].token, p_since: 0 });
  assert.equal(st.me.name, 'David (2)'); assert.equal(st.me.code, undefined);
  assert.equal(st.leaderboard.filter(r => r.me).length, 1);
});

test('partie V3 en 4 langues : même question, même index, même chrono, points serveur, rien de privé avant la révélation', async () => {
  await newGame('V3', '4 langues');
  const pl = {};
  for (const l of LANGS) pl[l] = await rpc(c, 'join_game', { p_name: 'élève-' + l, p_lang: l });
  const q = (await state()).questions.find(x => x.ext_key === 'v3:ROAD67-02');
  const src = srcOf(q);
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id })).ok, true);
  const views = {};
  for (const l of LANGS) views[l] = (await rpc(c, 'get_state', { p_token: pl[l].token, p_since: 0 }));
  for (const l of LANGS) {
    const v = views[l].question;
    assert.equal(v.text, src.i18n[l].question); assert.deepEqual(v.options, src.i18n[l].options);
    assert.equal(v.closes_at, views.he.question.closes_at); assert.equal(v.time_limit, 45);
    const raw = JSON.stringify(views[l]);
    assert.equal(v.correct_index, undefined); assert.equal(v.explanation, undefined);
    for (const f of ['script', 'fact', 'caution', 'cue']) if (src.i18n[l][f]) assert.ok(!raw.includes(src.i18n[l][f].slice(0, 30)), `${f} ${l} divulgué`);
    assert.ok(!raw.includes('guide_') && !raw.includes('route_meta'));
  }
  // le téléphone n'envoie qu'un index : le serveur calcule les points
  for (const l of LANGS) await rpc(c, 'submit_answer', { p_token: pl[l].token, p_question_id: q.id, p_choice: l === 'ru' ? 0 : src.correctIndex });
  assert.equal((await rpc(c, 'admin_close_question', { p_token: admin })).error, 'too_early');
  assert.equal((await rpc(c, 'admin_reveal', { p_token: admin })).error, 'too_early');
  await ageOpen(31);
  assert.equal((await rpc(c, 'admin_reveal', { p_token: admin })).ok, true);
  const after = {};
  for (const l of LANGS) after[l] = await rpc(c, 'get_state', { p_token: pl[l].token, p_since: 0 });
  for (const l of LANGS) {
    assert.equal(after[l].question.correct_index, src.correctIndex);
    assert.equal(after[l].question.explanation, src.i18n[l].explanation);
    assert.deepEqual(after[l].leaderboard.map(({ me, ...r }) => r), after.he.leaderboard.map(({ me, ...r }) => r));
  }
  assert.equal(after.he.question.my_points, after.fr.question.my_points);
  assert.equal(after.ru.question.my_points, 0);
  // changer de langue ne change ni le joueur ni les points
  await rpc(c, 'set_language', { p_token: pl.fr.token, p_lang: 'ru' });
  const again = await rpc(c, 'get_state', { p_token: pl.fr.token, p_since: 0 });
  assert.equal(again.me.score, after.fr.me.score); assert.equal(again.question.text, src.i18n.ru.question);
  // urgence : fermeture avant 30 s possible seulement avec confirmation, tracée
  const q2 = (await state()).questions.find(x => x.ext_key === 'v3:ROAD67-03');
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q2.id });
  assert.equal((await rpc(c, 'admin_close_question', { p_token: admin, p_force: true })).ok, true);
  assert.equal((await c.query(`select forced_close from mdl.game_questions where question_id = $1`, [q2.id])).rows[0].forced_close, true);
});

test('migration V3 rejouable : rien n\'est supprimé, modifications admin conservées', async () => {
  const snap = async () => (await c.query(`select
      (select count(*) from mdl.questions where bank = 'V1')::int v1, (select count(*) from mdl.questions where bank = 'V2')::int v2,
      (select count(*) from mdl.questions where bank = 'V3')::int v3, (select count(*) from mdl.route_photos)::int photos,
      (select count(*) from mdl.games)::int games, (select count(*) from mdl.players)::int players,
      (select count(*) from mdl.answers)::int answers,
      (select string_agg(id::text, ',' order by id) from mdl.questions) ids`)).rows[0];
  // le guide corrige une question V3 et réordonne la banque dans l'admin
  const s = await state();
  const q = (await rpc(c, 'admin_bank_questions', { p_token: admin, p_bank: 'V3' })).questions[0];
  await rpc(c, 'admin_save_question', { p_token: admin, p_q: { ...q, text: 'נוסח של המדריך', options: q.options } });
  await c.query(`update mdl.questions set sort_order = 99 where ext_key = 'v3:ROAD67-10'`);
  const s0 = await snap();
  await c.query(file('supabase/migration_v3.sql'));
  await c.query(file('supabase/migration_v3.sql'));
  await c.query(file('supabase/questions_v3.sql'));
  assert.deepEqual(await snap(), s0);
  assert.equal((await c.query(`select text from mdl.questions where id = $1`, [q.id])).rows[0].text, 'נוסח של המדריך');
  assert.equal((await c.query(`select sort_order from mdl.questions where ext_key = 'v3:ROAD67-10'`)).rows[0].sort_order, 99);
  assert.equal((await state()).game.id, s.game.id, 'la partie en cours continue');
});

test('migration depuis l\'état V2 (avant V3) : sessions conservées, homonymes désormais acceptés', async () => {
  const d = await freshDb('mdl_v3_migr', { seed: false });
  try {
    const old = execSync('git show 8d1a61b:supabase/install.sql', { cwd: new URL('..', import.meta.url), maxBuffer: 1 << 26 }).toString();
    await d.query('drop schema mdl cascade');
    await d.query(old);
    await d.query(`select mdl.set_admin_password('test-password-123')`);
    let tok = (await rpc(d, 'admin_login', { p_password: 'test-password-123' })).token;
    await rpc(d, 'admin_new_game', { p_token: tok, p_title: 'ancienne', p_bank: 'V2' });
    const a = await rpc(d, 'join_game', { p_name: 'נועה', p_lang: 'fr' });
    assert.equal((await rpc(d, 'join_game', { p_name: 'נועה' })).error, 'name_taken', 'ancien comportement');
    const v2ids = (await d.query(`select string_agg(id::text, ',' order by id) s from mdl.questions where bank = 'V2'`)).rows[0].s;
    await d.query(file('supabase/migration_v3.sql'));
    tok = (await rpc(d, 'admin_login', { p_password: 'test-password-123' })).token;
    const st = await rpc(d, 'get_state', { p_token: a.token, p_since: 0 });
    assert.equal(st.error, undefined, 'session existante conservée'); assert.equal(st.me.lang, 'fr');
    const b = await rpc(d, 'join_game', { p_name: 'נועה' });
    assert.equal(b.error, undefined); assert.notEqual(b.player_id, a.player_id);
    const s = await rpc(d, 'admin_state', { p_token: tok });
    assert.deepEqual(s.banks.map(x => [x.code, x.main]), [['V1', 34], ['V2', 6], ['V3', 14]]);
    assert.equal((await d.query(`select string_agg(id::text, ',' order by id) s from mdl.questions where bank = 'V2'`)).rows[0].s, v2ids, 'V2 intacte');
    assert.equal((await d.query(`select count(*)::int n from mdl.route_photos`)).rows[0].n, 32, 'photos V2 intactes');
  } finally { await d.end(); }
});

// ===================================================================== Moteur GPS
const P = GPS.prepare(ROUTE);
const fixAt = (s, t, extra = {}) => { const p = GPS.pointAt(P, s); return Object.assign({ lat: p.lat, lon: p.lon, accuracy: 10, timestamp: t, heading: p.bearing, speed: 16 }, extra); };

test('GPS : distances le long du trajet, dans le bon sens, lieux dans l\'ordre du parcours', () => {
  assert.ok(P.dest.s > 17000 && P.dest.s < 23000, 'trajet ≈ 19–21 km : ' + P.dest.s);
  const main = P.stops.filter(s => s.main).map(s => s.question);
  assert.deepEqual(main, ['ROAD67-11', 'ROAD67-12', 'ROAD67-01', 'ROAD67-02', 'ROAD67-07', 'ROAD67-10', 'ROAD67-03',
    'ROAD67-09', 'ROAD67-14', 'ROAD67-04', 'ROAD67-13', 'ROAD67-05', 'ROAD67-06', 'ROAD67-08']);
  assert.ok(P.stops.every(s => s.offRoadM < 50), 'repères sur la chaussée');
  assert.equal(GPS.roadAt(P, 2000).label.he.slice(0, 7), 'כביש 67');
  assert.match(GPS.roadAt(P, 14000).label.he, /כביש 6/);
  // un point à 900 m de la route, mais tout près à vol d'oiseau d'un village, n'est PAS « sur place »
  const T = new GPS.Tracker(P);
  let t = 0;
  for (let s = 0; s <= 3000; s += 200) T.update(fixAt(s, t += 12000));
  assert.ok(Math.abs(T.s - 3000) < 30, 'progression ' + T.s);
  assert.ok(T.speed > 12 && T.speed < 20, 'vitesse estimée ' + T.speed);
});

test('GPS : pas de fausse alerte — position isolée, imprécise, ancienne, route parallèle, sens inverse', () => {
  const T = new GPS.Tracker(P); let t = 0;
  for (let s = 0; s <= 4000; s += 150) T.update(fixAt(s, t += 9000));
  const s0 = T.s;
  // une position aberrante 4 km plus loin : ignorée (il en faut 2 cohérentes)
  T.update(fixAt(8000, t += 2000)); assert.equal(T.s, s0);
  // un recul isolé (erreur GPS) : ignoré
  T.update(fixAt(s0 - 400, t += 2000)); assert.equal(T.s, s0);
  // imprécision 300 m : position non utilisée
  T.update(fixAt(s0 + 3000, t += 2000, { accuracy: 300 })); assert.equal(T.s, s0); assert.equal(T.status(t), 'inaccurate');
  // position trop ancienne / perdue
  T.update(fixAt(s0 + 100, t += 2000)); assert.equal(T.status(t + 25000), 'stale'); assert.equal(T.status(t + 70000), 'lost');
  // route parallèle à 900 m : hors trajet après 3 positions, sans faire avancer le bus
  const s1 = T.s;
  for (let i = 0; i < 3; i++) { const p = GPS.pointAt(P, s1 + 200 * (i + 1)); const b = p.bearing * Math.PI / 180;
    const [lat, lon] = P.proj.inv(p.x + Math.cos(b) * 900, p.y - Math.sin(b) * 900);
    T.update({ lat, lon, accuracy: 10, timestamp: t += 5000 }); }
  assert.equal(T.status(t), 'off_route'); assert.equal(T.s, s1);
  // sens inverse confirmé
  const R2 = new GPS.Tracker(P); let t2 = 0;
  for (let s = 6000; s >= 4000; s -= 200) R2.update(fixAt(s, t2 += 8000, { heading: (GPS.pointAt(P, s).bearing + 180) % 360 }));
  assert.equal(R2.status(t2), 'wrong_dir');
});

test('GPS : 3 niveaux d\'alerte suffisamment tôt, lieux dépassés, aucune publication possible', () => {
  assert.equal(typeof GPS.publish, 'undefined');
  assert.ok(!/rpc|fetch|admin_open|XMLHttpRequest/.test(file('public/gps-engine.js').replace(/\/\/.*$/gm, '')), 'le moteur n\'a aucun accès réseau');
  const T = new GPS.Tracker(P); let t = 0; const firstSeen = {};
  // les questions d'avant ont déjà été posées : Bat Shlomo est la prochaine
  const used = new Set(['ROAD67-11', 'ROAD67-12', 'ROAD67-01', 'ROAD67-02', 'ROAD67-07', 'ROAD67-10']);
  for (let s = 0; s <= P.dest.s; s += 50) {
    T.update(fixAt(s, t += 3000));
    const pl = GPS.plan(P, T, { now: t, used });
    const n = pl.next;
    if (n && n.stop.id === 'S3' && n.level && !firstSeen[n.level]) firstSeen[n.level] = { s, eta: n.etaSec };
  }
  assert.ok(firstSeen[1] && firstSeen[2] && firstSeen[3], JSON.stringify(firstSeen));
  assert.ok(firstSeen[1].eta >= 80 && firstSeen[1].eta <= 95, 'niveau 1 ≈ 90 s avant : ' + firstSeen[1].eta);
  assert.ok(firstSeen[2].eta >= 40 && firstSeen[2].eta <= 55, 'niveau 2 ≈ 45–55 s avant : ' + firstSeen[2].eta);
  assert.ok(firstSeen[1].s < firstSeen[2].s && firstSeen[2].s < firstSeen[3].s);
  // lieu dépassé sans question : listé « passé », la suggestion passe au suivant
  const T2 = new GPS.Tracker(P); let t2 = 0;
  for (let s = 0; s <= 9000; s += 100) T2.update(fixAt(s, t2 += 6000));
  const pl = GPS.plan(P, T2, { now: t2, used: new Set() });
  assert.deepEqual(pl.passed.map(i => i.stop.id), ['S11', 'S12', 'S1', 'S2', 'S7', 'S10', 'S3']);
  assert.equal(pl.next.stop.id, 'S9');
  // sauté à la main / choisi à la main (même un lieu déjà dépassé)
  assert.equal(GPS.plan(P, T2, { now: t2, used: new Set(), skipped: new Set(['S9']) }).next.stop.id, 'S14');
  assert.equal(GPS.plan(P, T2, { now: t2, used: new Set(), pinned: 'S5' }).next.stop.id, 'S5');
});

test('GPS : ne bouscule pas le guide (question ouverte, micro, 1 min 30 entre questions)', () => {
  const T = new GPS.Tracker(P); let t = 0;
  for (let s = 0; s <= 3600; s += 100) T.update(fixAt(s, t += 6000));
  assert.equal(GPS.plan(P, T, { now: t, phase: 'open' }).hold.reason, 'question_open');
  assert.equal(GPS.plan(P, T, { now: t, phase: 'revealed', revealedAt: t - 10000, lastOpenAt: t - 60000 }).hold.reason, 'speaking');
  const sp = GPS.plan(P, T, { now: t, phase: 'revealed', revealedAt: t - 50000, lastOpenAt: t - 70000 });
  assert.equal(sp.hold.reason, 'spacing'); assert.equal(sp.hold.waitSec, 20);
  assert.equal(GPS.plan(P, T, { now: t, phase: 'revealed', revealedAt: t - 60000, lastOpenAt: t - 95000 }).hold, null);
});

test('GPS : sans la règle Aroma, beaucoup plus de questions, 1 min 30 minimum entre deux (simulation, 3 vitesses)', () => {
  assert.equal(P.endRule, false); assert.equal(P.minGap, 90);
  for (const [mul, min] of [[0.6, 10], [1, 8], [1.4, 6]]) {
    const sim = new GPS.Simulator(P), T = new GPS.Tracker(P);
    const ctx = { now: 0, used: new Set(), phase: 'waiting' };
    const log = [];
    while (!sim.done) {
      ctx.now += 1000;
      const f = sim.step(mul, ctx.now); if (f) T.update(f);
      if (ctx.phase === 'open' && ctx.now - ctx.lastOpenAt >= 45000) { ctx.phase = 'revealed'; ctx.revealedAt = ctx.now; }
      const pl = GPS.plan(P, T, ctx);
      if (pl.next && pl.next.level === 3 && !pl.hold && !pl.finish) {
        ctx.used.add(pl.next.stop.question); ctx.phase = 'open'; ctx.lastOpenAt = ctx.now;
        log.push({ q: pl.next.stop.question, t: ctx.now });
      }
    }
    const ids = log.map(l => l.q);
    assert.ok(ids.length >= min, `×${mul} : ${ids.length} questions (${ids})`);
    for (let i = 1; i < log.length; i++) assert.ok(log[i].t - log[i - 1].t >= 90000, `×${mul} : 1 min 30 entre questions`);
    assert.equal(new Set(ids).size, ids.length, 'jamais deux fois la même');
    for (const must of ['ROAD67-02', 'ROAD67-03', 'ROAD67-04', 'ROAD67-06']) assert.ok(ids.includes(must), `×${mul} : ${must} manquée (${ids})`);
  }
  // arrivée à Aroma : carte « הגענו »
  const T = new GPS.Tracker(P); let t = 0;
  for (let s = 0; s <= P.dest.s; s += 100) T.update(fixAt(s, t += 4000));
  const end = GPS.plan(P, T, { now: t, used: new Set() });
  assert.equal(end.finish, true); assert.equal(end.arrived, true);
});

test('GPS : la règle « finir avant Aroma » reste disponible si on la réactive', () => {
  const PE = GPS.prepare(Object.assign({}, ROUTE, { finish: { enabled: true, needSec: 170 }, minGapSec: 120 }));
  assert.equal(PE.endRule, true);
  const T = new GPS.Tracker(PE); let t = 0;
  for (let s = 0; s <= PE.dest.s - 1500; s += 100) T.update(fixAt(s, t += 4000));
  const pl = GPS.plan(PE, T, { now: t, used: new Set() });
  assert.equal(pl.finish, true); assert.ok(!pl.next || pl.next.level === 0);
  const T2 = new GPS.Tracker(PE); let t2 = 0;
  for (let s = 0; s <= 12000; s += 100) T2.update(fixAt(s, t2 += 4000));
  const done = GPS.plan(PE, T2, { now: t2, used: new Set(['ROAD67-06']) });
  assert.equal(done.done, true); assert.equal(done.next, null);
});

test('GPS : trace enregistrée (GeoJSON / GPX) remplace le tracé estimé', () => {
  const pts = []; for (let s = 0; s <= P.dest.s; s += 40) { const p = GPS.pointAt(P, s); pts.push([p.lat, p.lon]); }
  const geo = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map(([a, b]) => [b, a]) } }] });
  assert.equal(GPS.parseTrack(geo).length, pts.length);
  const gpx = `<gpx><trk><trkseg>${pts.map(([a, b]) => `<trkpt lat="${a}" lon="${b}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
  assert.equal(GPS.parseTrack(gpx).length, pts.length);
  const V = GPS.prepare(ROUTE, { geometry: pts, anchors: { S2: pts[100] } });
  assert.equal(V.verified, true); assert.equal(V.corridor, 120);
  assert.ok(Math.abs(V.dest.s - P.dest.s) < 60);
  assert.ok(Math.abs(V.stops.find(s => s.id === 'S2').s - 4000) < 60 && V.stops.find(s => s.id === 'S2').anchorVerified);
});
