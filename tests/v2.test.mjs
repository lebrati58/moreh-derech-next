// Tests de la V2 : banques séparées, 4 langues, temps minimal de 30 s, confidentialité,
// réimport sans doublons, galerie photo, reconnexions et simulation de 48 élèves.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';
import { freshDb, rpc, PGHOST, PGPORT } from './helpers.mjs';
import { loadV2, validateV2, LANGS } from '../tools/build-v2-sql.mjs';

const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const DATA = loadV2();
const SRC = Object.fromEntries(DATA.v2.questions.map(q => [q.id, q]));
const srcOf = q => SRC[q.ext_key.replace(/^v2:/, '')];
const noMe = lb => lb.map(({ me, ...r }) => r);

let c, admin;
// remonte le temps de la question ouverte (évite d'attendre 30 s pour de vrai)
const ageOpen = (sec) => c.query(`
  update mdl.games set opened_at = opened_at - make_interval(secs => $1) where is_active;
  update mdl.game_questions gq set opened_at = gq.opened_at - make_interval(secs => $1),
         closes_at = gq.closes_at - make_interval(secs => $1)
    from mdl.games g where g.is_active and gq.game_id = g.id and gq.question_id = g.current_question`.replace(/\$1/g, String(+sec)));
const state = () => rpc(c, 'admin_state', { p_token: admin });
const newGame = (bank, title) => rpc(c, 'admin_new_game', { p_token: admin, p_title: title || bank, p_bank: bank });

before(async () => {
  c = await freshDb('mdl_v2', { seed: false });
  await c.query(file('supabase/install.sql'));
  admin = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
});
after(async () => c && c.end());

test('données V2 : validées, 4 langues, 6 MAIN + 2 SPARE, 32 photos', () => {
  assert.equal(validateV2(DATA), true);
  assert.equal(DATA.photos.length, 32);
  for (const q of DATA.v2.questions) for (const l of LANGS) assert.equal(q.translations[l].options.length, 4, q.id + l);
});

test('banques séparées : V1 = 34, V2 = 6 principales + 2 alternatives, jamais mélangées', async () => {
  let s = await state();                                   // partie créée à l'installation = V1
  assert.equal(s.bank, 'V1');
  assert.equal(s.questions.length, 34);
  assert.ok(s.questions.every(q => q.bank === 'V1'));
  const v1 = s.questions;

  await newGame('V2');
  s = await state();
  assert.equal(s.game.bank, 'V2');
  assert.equal(s.questions.length, 8);
  const main = s.questions.filter(q => q.selection === 'MAIN');
  const spare = s.questions.filter(q => q.selection === 'SPARE');
  assert.equal(main.length, 6); assert.equal(spare.length, 2);
  assert.ok(main.every(q => q.enabled) && spare.every(q => !q.enabled), 'alternatives désactivées par défaut');
  // MAIN dans l'ordre du trajet (routeMarkerTime), puis les alternatives
  const times = main.map(q => q.route_meta.routeMarkerTime);
  assert.deepEqual(times, [...times].sort());
  assert.deepEqual(s.questions.slice(0, 6).map(q => q.selection), Array(6).fill('MAIN'));
  assert.deepEqual(s.banks.map(b => [b.code, b.main, b.spare]), [['V1', 34, 0], ['V2', 6, 2], ['V3', 14, 0]]);

  // une question V1 ne peut pas être publiée dans une partie V2 (et inversement)
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: v1[0].id })).error, 'wrong_bank');
  // alternative non activée → refusée ; activée → acceptée
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: spare[0].id })).error, 'spare_disabled');
  assert.equal((await rpc(c, 'admin_toggle_spare', { p_token: admin, p_question_id: main[0].id, p_on: true })).error, 'not_spare');
  await rpc(c, 'admin_toggle_spare', { p_token: admin, p_question_id: spare[0].id, p_on: true });
  await rpc(c, 'admin_toggle_spare', { p_token: admin, p_question_id: spare[0].id, p_on: true });   // idempotent
  s = await state();
  assert.deepEqual(s.game.enabled_spares, [spare[0].id]);
  assert.equal(s.questions.find(q => q.id === spare[0].id).enabled, true);
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: spare[0].id })).ok, true);
  await ageOpen(31); await rpc(c, 'admin_reveal', { p_token: admin });
  // aucun doublon dans une partie
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: spare[0].id })).error, 'already_used');
  await rpc(c, 'admin_toggle_spare', { p_token: admin, p_question_id: spare[0].id, p_on: false });

  // retour en V1 : la banque V1 est intacte, et une nouvelle partie n'hérite pas des alternatives activées
  await newGame('V1');
  s = await state();
  assert.equal(s.questions.length, 34); assert.deepEqual(s.game.enabled_spares, []);
  assert.equal((await rpc(c, 'admin_toggle_spare', { p_token: admin, p_question_id: spare[1].id, p_on: true })).error, 'wrong_bank');
  assert.equal((await rpc(c, 'admin_new_game', { p_token: admin, p_bank: 'V9' })).error, 'bad_bank');
});

test('temps minimal : 30 s réelles côté serveur, 45 s par défaut en V2, urgence seulement forcée', async () => {
  await newGame('V2');
  let s = await state();
  assert.equal(s.game.min_answer_sec, 30);
  assert.equal(s.game.default_time_limit_sec, 45);
  const q = s.questions[0];
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
  s = await state();
  assert.equal(s.current.time_limit_sec, 45);
  assert.ok(Math.abs(Date.parse(s.current.closes_at) - Date.parse(s.current.opened_at) - 45000) < 5);
  assert.ok(Math.abs(Date.parse(s.current.can_close_at) - Date.parse(s.current.opened_at) - 30000) < 5);

  // fermeture, révélation, fin de partie : refusées avant 30 s
  for (const fn of ['admin_close_question', 'admin_reveal', 'admin_finish']) {
    const r = await rpc(c, fn, { p_token: admin });
    assert.equal(r.error, 'too_early', fn);
    assert.ok(r.remaining_ms > 25000 && r.remaining_ms <= 30000, fn + ' ' + r.remaining_ms);
  }
  assert.equal((await state()).game.phase, 'open');
  await ageOpen(29);
  assert.equal((await rpc(c, 'admin_close_question', { p_token: admin })).error, 'too_early');
  await ageOpen(1.2);
  assert.equal((await rpc(c, 'admin_close_question', { p_token: admin })).ok, true);
  await rpc(c, 'admin_reveal', { p_token: admin });

  // urgence : fermeture anticipée explicitement forcée, tracée
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: s.questions[1].id });
  assert.equal((await rpc(c, 'admin_close_question', { p_token: admin, p_force: true })).ok, true);
  const exp = await rpc(c, 'admin_export', { p_token: admin });
  assert.deepEqual(exp.questions.map(x => x.forced_close), [false, true]);
  await rpc(c, 'admin_reveal', { p_token: admin });

  // réglages : impossible de descendre sous 30 s, ni pour le minimum ni pour la durée par défaut
  await rpc(c, 'admin_settings', { p_token: admin, p_s: { min_answer_sec: '10', default_time_limit_sec: '20' } });
  s = await state();
  assert.equal(s.game.min_answer_sec, 30); assert.equal(s.game.default_time_limit_sec, 30);
  await rpc(c, 'admin_settings', { p_token: admin, p_s: { min_answer_sec: '40', default_time_limit_sec: '45' } });
  s = await state();
  assert.equal(s.game.min_answer_sec, 40); assert.equal(s.game.default_time_limit_sec, 45);
  // une durée propre plus courte que le minimum est relevée au minimum (V1 : question de 20 s)
  await newGame('V1');
  s = await state();
  assert.equal(s.game.min_answer_sec, 40);
  await rpc(c, 'admin_save_question', { p_token: admin, p_q: { text: 'קצרה', options: ['א', 'ב'], correct_index: 0, time_limit_sec: 20 } });
  const short = (await state()).questions.find(x => x.text === 'קצרה');
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: short.id });
  assert.equal((await state()).current.time_limit_sec, 40);
  await ageOpen(41); await rpc(c, 'admin_reveal', { p_token: admin });
  await rpc(c, 'admin_delete_question', { p_token: admin, p_id: short.id });
  await rpc(c, 'admin_settings', { p_token: admin, p_s: { min_answer_sec: '30' } });
  // jamais de publication automatique : sans « פרסם שאלה », aucune question n'apparaît
  await newGame('V2');
  const p = await rpc(c, 'join_game', { p_name: 'ממתין', p_lang: 'fr' });
  const st = await rpc(c, 'get_state', { p_token: p.token, p_since: 0 });
  assert.equal(st.question, null); assert.equal(st.game.phase, 'waiting');
});

test('4 langues : même question, même index, même chrono, même score, même classement', async () => {
  await newGame('V2');
  const q = (await state()).questions[2];
  const src = srcOf(q);
  const players = {};
  for (const l of LANGS) players[l] = await rpc(c, 'join_game', { p_name: 'élève-' + l, p_lang: l });
  assert.deepEqual(LANGS.map(l => players[l].lang), LANGS);
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
  const views = {};
  for (const l of LANGS) views[l] = (await rpc(c, 'get_state', { p_token: players[l].token, p_since: 0 })).question;
  for (const l of LANGS) {
    const v = views[l];
    assert.equal(v.id, q.id); assert.equal(v.seq, views.he.seq);
    assert.equal(v.opened_at, views.he.opened_at); assert.equal(v.closes_at, views.he.closes_at);
    assert.equal(v.lang, l);
    assert.equal(v.text, src.translations[l].question);
    assert.deepEqual(v.options, src.translations[l].options);
    assert.equal(v.correct_index, undefined, 'bonne réponse cachée avant la révélation (' + l + ')');
    assert.equal(v.explanation, undefined);
  }
  // tous répondent juste immédiatement (dans le temps de grâce) → mêmes points
  for (const l of LANGS) assert.equal((await rpc(c, 'submit_answer', { p_token: players[l].token, p_question_id: q.id, p_choice: src.correctIndex })).status, 'ok');
  await ageOpen(31); await rpc(c, 'admin_reveal', { p_token: admin });
  const after = {};
  for (const l of LANGS) after[l] = await rpc(c, 'get_state', { p_token: players[l].token, p_since: 0 });
  for (const l of LANGS) {
    const v = after[l].question;
    assert.equal(v.correct_index, src.correctIndex);
    assert.equal(v.my_correct, true);
    assert.equal(v.my_points, 200, l);
    assert.equal(v.explanation, src.translations[l].studentExplanation);
    assert.deepEqual(v.counts, after.he.question.counts);
    assert.deepEqual(noMe(after[l].leaderboard), noMe(after.he.leaderboard), 'un seul classement pour toutes les langues');
  }
  assert.equal((await state()).players, 4, 'une seule partie, pas de partie par langue');
  assert.deepEqual((await state()).langs, { he: 1, fr: 1, en: 1, ru: 1 });
});

test('changer de langue en cours de partie ne perd ni les points ni le joueur', async () => {
  const s = await state();
  const p = await rpc(c, 'join_game', { p_name: 'élève-fr', p_token: null, p_code: null });   // homonyme : nouveau joueur
  assert.equal(p.error, undefined); assert.equal(p.reconnected, false);
  const fr = (await c.query(`select token::text, code from mdl.players where name = 'élève-fr' and game_id = $1 order by joined_at, id limit 1`, [s.game.id])).rows[0];
  assert.notEqual(fr.token, p.token);
  const before = await rpc(c, 'get_state', { p_token: fr.token, p_since: 0 });
  assert.equal((await rpc(c, 'set_language', { p_token: fr.token, p_lang: 'ru' })).lang, 'ru');
  assert.equal((await rpc(c, 'set_language', { p_token: fr.token, p_lang: 'de' })).error, 'bad_lang');
  assert.equal((await rpc(c, 'set_language', { p_token: '00000000-0000-0000-0000-000000000000', p_lang: 'ru' })).error, 'unknown_player');
  const afterChange = await rpc(c, 'get_state', { p_token: fr.token, p_since: 0 });
  assert.equal(afterChange.me.score, before.me.score); assert.equal(afterChange.me.rank, before.me.rank);
  assert.equal(afterChange.me.lang, 'ru');
  assert.equal(afterChange.question.lang, 'ru');
  assert.equal(afterChange.question.text, srcOf(s.questions[2]).translations.ru.question);
  // retour depuis un autre navigateur (nom + code) avec une autre langue : même joueur, même score
  const back = await rpc(c, 'join_game', { p_name: 'élève-fr', p_code: fr.code, p_lang: 'en' });
  assert.equal(back.reconnected, true); assert.equal(back.lang, 'en');
  assert.equal((await rpc(c, 'get_state', { p_token: back.token, p_since: 0 })).me.score, before.me.score);
});

test('V1 sans traduction : repli propre sur l\'hébreu', async () => {
  await newGame('V1');
  const q = (await state()).questions[0];
  const p = await rpc(c, 'join_game', { p_name: 'russe', p_lang: 'ru' });
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
  const v = (await rpc(c, 'get_state', { p_token: p.token, p_since: 0 })).question;
  assert.equal(v.lang, 'he'); assert.equal(v.text, q.text); assert.deepEqual(v.options, q.options);
  await ageOpen(31); await rpc(c, 'admin_reveal', { p_token: admin });
});

test('confidentialité : scripts, anecdotes, photos et réponses jamais envoyés aux élèves', async () => {
  await newGame('V2');
  const s = await state();
  const secrets = [];
  for (const q of DATA.v2.questions) for (const l of LANGS) {
    secrets.push(q.translations[l].adminScript.slice(0, 40));
    if (q.adminCaution) secrets.push(q.adminCaution[l].slice(0, 30));
  }
  for (const p of DATA.photos) for (const l of LANGS) secrets.push(p.anecdote[l].slice(0, 40));
  secrets.push('routeMarkerTime', 'route_meta', 'guide_i18n', 'anecdote', '.jpg', 'adminScript');
  // un texte privé glissé par erreur dans les traductions publiques ne passe pas non plus
  const q0 = s.questions[0];
  await c.query(`update mdl.questions set i18n = jsonb_set(i18n, '{fr,adminScript}', '"FUITE-PRIVEE"') where id = $1`, [q0.id]);
  secrets.push('FUITE-PRIVEE');
  const p = await rpc(c, 'join_game', { p_name: 'espion', p_lang: 'fr' });
  const check = async (label) => {
    for (const l of LANGS) {
      await rpc(c, 'set_language', { p_token: p.token, p_lang: l });
      const txt = JSON.stringify(await rpc(c, 'get_state', { p_token: p.token, p_since: 0 }));
      for (const sec of secrets) assert.ok(!txt.includes(sec), `fuite « ${sec} » (${label}, ${l})`);
    }
  };
  for (const q of s.questions.filter(x => x.selection === 'MAIN')) {
    await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
    await check('ouverte ' + q.ext_key);
    for (const l of LANGS) {
      await rpc(c, 'set_language', { p_token: p.token, p_lang: l });
      const v = (await rpc(c, 'get_state', { p_token: p.token, p_since: 0 })).question;
      assert.equal(v.correct_index, undefined); assert.equal(v.explanation, undefined);
    }
    await ageOpen(31);
    await rpc(c, 'admin_close_question', { p_token: admin }); await check('fermée ' + q.ext_key);
    await rpc(c, 'admin_reveal', { p_token: admin }); await check('révélée ' + q.ext_key);
  }
  await rpc(c, 'admin_finish', { p_token: admin }); await check('terminée');
  // 2e barrière : la copie publiée (game_questions) ne contient que les champs de la liste blanche
  const snapLeak = (await c.query(`select count(*)::int n from mdl.game_questions where i18n::text like '%FUITE-PRIVEE%'`)).rows[0].n;
  assert.equal(snapLeak, 0, 'texte privé copié dans la question publiée');
  const keys = (await c.query(`select distinct k2 from mdl.game_questions, jsonb_each(i18n) e(k, v), jsonb_object_keys(v) k2`)).rows.map(r => r.k2).sort();
  assert.deepEqual(keys, ['category', 'explanation', 'options', 'text']);
  await c.query(`update mdl.questions set i18n = i18n #- '{fr,adminScript}' where id = $1`, [q0.id]);

  // les RPC admin exigent un jeton valide ; le rôle public ne lit aucune table
  await assert.rejects(rpc(c, 'admin_photos', { p_token: 'x' }), /not_authorized/);
  await assert.rejects(rpc(c, 'admin_toggle_spare', { p_token: 'x', p_question_id: 1, p_on: true }), /not_authorized/);
  await assert.rejects(rpc(c, 'admin_new_game', { p_token: 'x', p_bank: 'V2' }), /not_authorized/);
  await c.query('set role anon');
  try {
    for (const t of ['route_photos', 'route_collections', 'question_banks', 'questions'])
      await assert.rejects(c.query(`select * from mdl.${t}`), /permission denied/, t);
    const r = await c.query(`select public.set_language('x', 'fr') r`);         // RPC publique autorisée
    assert.equal(r.rows[0].r.error, 'unknown_player');
    await assert.rejects(c.query(`select mdl.pub_i18n('{}')`), /permission denied/);
  } finally { await c.query('reset role'); }
});

test('galerie : 32 fiches dans l\'ordre, photos sans question, fichiers recadrés présents', async () => {
  const g = await rpc(c, 'admin_photos', { p_token: admin });
  assert.equal(g.collection.code, 'ALLER_V2');
  assert.deepEqual(g.collections.map(x => [x.code, x.count]), [['ALLER_V2', 32]]);
  assert.equal(g.photos.length, 32);
  assert.deepEqual(g.photos.map(p => p.ord), Array.from({ length: 32 }, (_, i) => i + 1));
  const linked = g.photos.filter(p => p.question_keys.length);
  assert.equal(linked.length, 9, 'seules les photos citées par une question y sont liées');
  assert.ok(g.photos.length - linked.length === 23, '23 photos sont de simples fiches, sans question');
  for (const p of g.photos) {
    for (const l of LANGS) assert.ok(p.anecdote[l].length > 20, `anecdote ${l} photo ${p.ord}`);
    assert.ok(existsSync(new URL(`../public/photos/aller-v2/${p.file}`, import.meta.url)), p.file);
    assert.ok(existsSync(new URL(`../public/photos/aller-v2/thumbs/${p.file}`, import.meta.url)), 'miniature ' + p.file);
  }
  assert.ok(g.collection.notes.length >= 9, 'repères facultatifs de la note du guide');
  // aucune capture d'origine (avec bandeau du téléphone) dans le dossier publié
  for (const p of g.photos) assert.ok(!existsSync(new URL(`../public/photos/aller-v2/${p.source_file}`, import.meta.url)));
  // les photos ne génèrent pas de question : la banque V2 reste à 8
  assert.equal((await c.query(`select count(*)::int n from mdl.questions where bank = 'V2'`)).rows[0].n, 8);
});

test('réimport : V2 et migration ré-exécutables, sans doublon, sans toucher V1 ni les parties', async () => {
  const snap = async () => (await c.query(`select
      (select count(*) from mdl.questions where bank = 'V1')::int v1,
      (select count(*) from mdl.questions where bank = 'V2')::int v2,
      (select count(*) from mdl.route_photos)::int photos,
      (select count(*) from mdl.games)::int games,
      (select count(*) from mdl.answers)::int answers,
      (select string_agg(id::text, ',' order by id) from mdl.questions where bank = 'V2') ids`)).rows[0];
  // une modification admin sur une question V1 doit survivre à la migration
  await c.query(`update mdl.questions set guide_fact = 'MODIF-ADMIN' where bank = 'V1' and sort_order = 1`);
  const s0 = await snap();
  await c.query(file('supabase/questions_v2.sql'));
  await c.query(file('supabase/migration_v2.sql'));
  await c.query(file('supabase/migration_v2.sql'));
  assert.deepEqual(await snap(), s0);
  assert.equal((await c.query(`select guide_fact from mdl.questions where bank = 'V1' and sort_order = 1`)).rows[0].guide_fact, 'MODIF-ADMIN');
});

test('migration depuis l\'ancienne version (main) : données conservées, tout devient V1', async () => {
  const d = await freshDb('mdl_v2_migr', { seed: false });
  try {
    // ancienne installation, telle que déployée avant la V2
    const old = (await import('node:child_process')).execSync('git show main:supabase/install.sql', { cwd: new URL('..', import.meta.url), maxBuffer: 1 << 26 }).toString();
    await d.query('drop schema mdl cascade');
    for (const f of ['join_game(text,text,text,boolean,text)', 'admin_new_game(text,text,text)', 'admin_close_question(text,boolean)',
      'admin_reveal(text,boolean)', 'admin_finish(text,boolean)', 'set_language(text,text)', 'admin_toggle_spare(text,bigint,boolean)',
      'admin_photos(text,text)']) await d.query(`drop function if exists public.${f}`);
    await d.query(old);
    await d.query(`select mdl.set_admin_password('test-password-123')`);
    let tok = (await rpc(d, 'admin_login', { p_password: 'test-password-123' })).token;
    const q = (await rpc(d, 'admin_state', { p_token: tok })).questions[0];
    const pl = await rpc(d, 'join_game', { p_name: 'ותיק' });
    await rpc(d, 'admin_open_question', { p_token: tok, p_question_id: q.id });
    await rpc(d, 'submit_answer', { p_token: pl.token, p_question_id: q.id, p_choice: q.correct_index });
    await rpc(d, 'admin_reveal', { p_token: tok });
    const scoreBefore = (await rpc(d, 'get_state', { p_token: pl.token, p_since: 0 })).me.score;
    // mise à jour
    await d.query(file('supabase/migration_v2.sql'));
    tok = (await rpc(d, 'admin_login', { p_password: 'test-password-123' })).token;
    const s = await rpc(d, 'admin_state', { p_token: tok });
    assert.equal(s.bank, 'V1'); assert.equal(s.questions.length, 34);
    const st = await rpc(d, 'get_state', { p_token: pl.token, p_since: 0 });
    assert.equal(st.me.score, scoreBefore, 'score conservé'); assert.equal(st.me.lang, 'he');
    assert.equal((await d.query(`select count(*)::int n from mdl.questions where bank = 'V2'`)).rows[0].n, 8);
  } finally { await d.end(); }
});

test('simulation : 48 élèves, 4 langues, réseau instable, reconnexions, 6 questions V2', async () => {
  await newGame('V2', 'סימולציה 48');
  const pool = new pg.Pool({ host: PGHOST, port: PGPORT, user: 'postgres', database: 'mdl_v2', max: 16 });
  const prpc = async (fn, args) => { const k = await pool.connect(); try { return await rpc(k, fn, args); } finally { k.release(); } };
  try {
    const N = 48;
    const langs = i => LANGS[i % 4];
    let players = await Promise.all(Array.from({ length: N }, (_, i) =>
      prpc('join_game', { p_name: `תלמיד ${i + 1}`, p_lang: langs(i) })));
    const codes = new Map((await c.query('select id, code from mdl.players')).rows.map(r => [+r.id, r.code]));
    players = players.map(p => ({ ...p, code: codes.get(+p.player_id) }));
    assert.equal(new Set(players.map(p => p.player_id)).size, N);
    const qs = (await state()).questions.filter(q => q.selection === 'MAIN');
    const expected = new Map();                             // points attendus par joueur
    let round = 0;
    for (const q of qs) {
      round++;
      await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
      // tous interrogent l'état en parallèle, chacun dans sa langue
      const views = await Promise.all(players.map(p => prpc('get_state', { p_token: p.token, p_since: 0 })));
      views.forEach((v, i) => {
        assert.equal(v.question.id, q.id);
        assert.equal(v.question.text, srcOf(q).translations[langs(i)].question);
      });
      // 1 élève sur 6 « perd le réseau » : il se reconnecte (jeton, ou nom + code) avant de répondre
      players = await Promise.all(players.map(async (p, i) => {
        if ((i + round) % 6 !== 0) return p;
        const r = (i % 2) ? await prpc('join_game', { p_name: 'x', p_token: p.token })
                          : await prpc('join_game', { p_name: p.name, p_code: p.code, p_lang: langs(i) });
        assert.equal(r.player_id, p.player_id); assert.equal(r.reconnected, true);
        return { ...p, token: r.token };
      }));
      // réponses simultanées ; 1 sur 7 ne répond pas ; 1 sur 5 envoie deux fois
      const correct = srcOf(q).correctIndex;
      await Promise.all(players.map(async (p, i) => {
        if ((i + round) % 7 === 0) return;
        const choice = (i + round) % 3 === 0 ? (correct + 1) % 4 : correct;
        const sends = (i % 5 === 0) ? [choice, (choice + 2) % 4] : [choice];
        const rs = await Promise.all(sends.map(ch => prpc('submit_answer', { p_token: p.token, p_question_id: q.id, p_choice: ch })));
        assert.equal(rs.filter(r => r.status === 'ok').length, 1, 'une seule réponse acceptée');
      }));
      // la fermeture avant 30 s est refusée même sous charge
      assert.equal((await rpc(c, 'admin_close_question', { p_token: admin })).error, 'too_early');
      await ageOpen(31);
      await rpc(c, 'admin_close_question', { p_token: admin });
      await rpc(c, 'admin_reveal', { p_token: admin });
    }
    // contrôle : score affiché = somme des points enregistrés, identique pour toutes les langues
    const sums = (await c.query(`select a.player_id, sum(a.points)::int s from mdl.answers a
        join mdl.games g on g.id = a.game_id and g.is_active group by 1`)).rows;
    for (const r of sums) expected.set(+r.player_id, r.s);
    const finals = await Promise.all(players.map(p => prpc('get_state', { p_token: p.token, p_since: 0 })));
    finals.forEach((f, i) => {
      assert.equal(f.me.score, expected.get(+players[i].player_id) || 0, players[i].name);
      assert.deepEqual(noMe(f.leaderboard), noMe(finals[0].leaderboard));
    });
    const s = await state();
    assert.equal(s.players, N); assert.equal(s.stats.questions, 6);
    assert.deepEqual(s.langs, { he: 12, fr: 12, en: 12, ru: 12 });
    const n = (await c.query(`select count(*)::int n from mdl.answers a join mdl.games g on g.id = a.game_id and g.is_active`)).rows[0].n;
    assert.ok(n > 6 * N * 0.8 && n <= 6 * N, `${n} réponses`);
  } finally { await pool.end(); }
});
