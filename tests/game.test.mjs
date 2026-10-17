// Tests de la logique serveur (PostgreSQL réel).
// Lancer : npm test   (nécessite un Postgres local, voir README)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rpc, sleep } from './helpers.mjs';

let c, admin, qs;
before(async () => {
  c = await freshDb('mdl_unit');
  admin = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
  qs = (await rpc(c, 'admin_state', { p_token: admin })).questions;
});
after(async () => c.end());

const pts = async (ok, ms, base = 100, bonus = 100, win = 20, grace = 1.5) =>
  (await c.query('select mdl.calc_points($1,$2,$3,$4,$5,$6) p', [ok, ms, base, bonus, win, grace])).rows[0].p;

test('calcul des points : déterministe, linéaire, borné', async () => {
  assert.equal(await pts(false, 0), 0);                // mauvaise réponse
  assert.equal(await pts(true, 0), 200);               // instantané
  assert.equal(await pts(true, 1500), 200);            // dans la grâce
  assert.equal(await pts(true, 10750), 150);           // mi-fenêtre
  assert.equal(await pts(true, 20000), 100);           // fin de fenêtre
  assert.equal(await pts(true, 90000), 100);           // bien après : jamais < base
  assert.equal(await pts(true, 5000, 100, 100, 1, 1.5), 200); // fenêtre ≤ grâce
  assert.ok(await pts(true, 3000) > await pts(true, 4000));   // décroissant
});

test('sécurité admin : mauvais mot de passe, jeton invalide, verrouillage', async () => {
  assert.equal((await rpc(c, 'admin_login', { p_password: 'faux' })).error, 'bad_password');
  await assert.rejects(rpc(c, 'admin_state', { p_token: '00000000-0000-0000-0000-000000000000' }), /not_authorized/);
  await assert.rejects(rpc(c, 'admin_open_question', { p_token: 'x', p_question_id: qs[0].id }), /not_authorized/);
  for (let i = 0; i < 10; i++) await rpc(c, 'admin_login', { p_password: 'faux' });
  assert.equal((await rpc(c, 'admin_login', { p_password: 'test-password-123' })).error, 'too_many_attempts');
  await c.query('delete from mdl.login_failures');
});

test('les rôles publics ne peuvent pas lire les tables ni les fonctions internes', async () => {
  await c.query('set role anon');
  try {
    await assert.rejects(c.query('select * from mdl.questions'), /permission denied/);
    await assert.rejects(c.query('select mdl.set_admin_password($1)', ['hackhackhack']), /permission denied/);
    const r = await c.query(`select public.admin_login('faux') r`);   // RPC publique OK
    assert.equal(r.rows[0].r.error, 'bad_password');
  } finally { await c.query('reset role'); }
});

test('cycle complet : publication, réponses, doubles, tardives, révélation', async () => {
  const a = await rpc(c, 'join_game', { p_name: 'דנה' });
  const b = await rpc(c, 'join_game', { p_name: 'יוסי' });
  const q = qs[0];

  // pas de question ouverte → refus
  assert.equal((await rpc(c, 'submit_answer', { p_token: a.token, p_question_id: q.id, p_choice: 0 })).status, 'not_open');

  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id })).ok, true);
  // une seule question ouverte à la fois
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: qs[1].id })).error, 'question_open');

  // l'élève voit la question, sans la bonne réponse
  const st = await rpc(c, 'get_state', { p_token: a.token, p_since: 0 });
  assert.equal(st.question.id, q.id);
  assert.equal(st.question.correct_index, undefined);
  assert.equal(st.question.explanation, undefined);

  const r1 = await rpc(c, 'submit_answer', { p_token: a.token, p_question_id: q.id, p_choice: q.correct_index });
  assert.equal(r1.status, 'ok');
  assert.equal(r1.points, undefined);           // pas de fuite des points
  // double soumission (même ou autre choix) → refusée, 1re réponse conservée
  const r2 = await rpc(c, 'submit_answer', { p_token: a.token, p_question_id: q.id, p_choice: 3 });
  assert.equal(r2.status, 'duplicate'); assert.equal(r2.choice, q.correct_index);
  // choix invalide
  assert.equal((await rpc(c, 'submit_answer', { p_token: b.token, p_question_id: q.id, p_choice: 9 })).status, 'invalid');
  await rpc(c, 'submit_answer', { p_token: b.token, p_question_id: q.id, p_choice: (q.correct_index + 1) % 4 });

  // score invisible avant révélation
  let sa = await rpc(c, 'get_state', { p_token: a.token, p_since: 0 });
  assert.equal(sa.me.score, 0);

  await rpc(c, 'admin_close_question', { p_token: admin });
  const late = await rpc(c, 'join_game', { p_name: 'מאוחר' });
  assert.equal((await rpc(c, 'submit_answer', { p_token: late.token, p_question_id: q.id, p_choice: 0 })).status, 'closed');

  const adm = await rpc(c, 'admin_state', { p_token: admin });
  assert.equal(adm.current.answers, 2);

  await rpc(c, 'admin_reveal', { p_token: admin });
  sa = await rpc(c, 'get_state', { p_token: a.token, p_since: 0 });
  assert.equal(sa.question.correct_index, q.correct_index);
  assert.equal(sa.question.my_correct, true);
  assert.ok(sa.me.score >= 190 && sa.me.score <= 200, `score ${sa.me.score}`);
  assert.equal(sa.me.rank, 1);
  const sb = await rpc(c, 'get_state', { p_token: b.token, p_since: 0 });
  assert.equal(sb.me.score, 0); assert.equal(sb.question.my_correct, false);

  // une question déjà jouée ne peut pas être republiée
  assert.equal((await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id })).error, 'already_used');
});

test('durée maximale : réponse tardive refusée, fermeture automatique', async () => {
  const p = await rpc(c, 'join_game', { p_name: 'טל' });
  const q = qs[1];  // 30 s
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
  // on simule que 40 s se sont écoulées
  await c.query(`update mdl.game_questions set opened_at = opened_at - interval '40 s', closes_at = closes_at - interval '40 s' where question_id = $1`, [q.id]);
  const r = await rpc(c, 'submit_answer', { p_token: p.token, p_question_id: q.id, p_choice: 0 });
  assert.equal(r.status, 'late');                      // refusée : hors délai
  const st = await rpc(c, 'get_state', { p_token: p.token, p_since: 0 });
  assert.equal(st.game.phase, 'closed');
  await rpc(c, 'admin_reveal', { p_token: admin });
});

test('réponse tardive dans la marge réseau acceptée, au-delà refusée', async () => {
  const p1 = await rpc(c, 'join_game', { p_name: 'רון' });
  const p2 = await rpc(c, 'join_game', { p_name: 'גל' });
  const q = qs[2];  // 20 s
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
  await c.query(`update mdl.game_questions set opened_at = opened_at - interval '20.5 s', closes_at = closes_at - interval '20.5 s' where question_id = $1`, [q.id]);
  assert.equal((await rpc(c, 'submit_answer', { p_token: p1.token, p_question_id: q.id, p_choice: 0 })).status, 'ok');
  await c.query(`update mdl.game_questions set closes_at = closes_at - interval '5 s' where question_id = $1`, [q.id]);
  const r = await rpc(c, 'submit_answer', { p_token: p2.token, p_question_id: q.id, p_choice: 0 });
  assert.ok(['late', 'closed'].includes(r.status), r.status);
  await rpc(c, 'admin_reveal', { p_token: admin });
});

test('noms identiques, code personnel, reconnexion par jeton', async () => {
  const a = await rpc(c, 'join_game', { p_name: '  משה   כהן ' });
  assert.equal(a.name, 'משה כהן');
  const dup = await rpc(c, 'join_game', { p_name: 'משה כהן' });
  assert.equal(dup.error, 'name_taken'); assert.equal(dup.suggestion, 'משה כהן 2');
  const forced = await rpc(c, 'join_game', { p_name: 'משה כהן', p_new_name_ok: true });
  assert.equal(forced.name, 'משה כהן 2');
  // même élève depuis un autre navigateur : nom + code
  assert.equal((await rpc(c, 'join_game', { p_name: 'משה כהן', p_code: 'zzzz' })).error, 'bad_code');
  const back = await rpc(c, 'join_game', { p_name: 'משה כהן', p_code: a.code });
  assert.equal(back.player_id, a.player_id); assert.equal(back.reconnected, true);
  // reconnexion par jeton
  const again = await rpc(c, 'join_game', { p_name: 'n importe', p_token: a.token });
  assert.equal(again.player_id, a.player_id);
  assert.equal((await rpc(c, 'join_game', { p_name: '   ' })).error, 'empty_name');
});

test('version : réponse minimale si rien ne change', async () => {
  const p = await rpc(c, 'join_game', { p_name: 'נועה' });
  const s1 = await rpc(c, 'get_state', { p_token: p.token, p_since: 0 });
  const s2 = await rpc(c, 'get_state', { p_token: p.token, p_since: s1.v });
  assert.equal(s2.same, true);
  assert.ok(JSON.stringify(s2).length < 120);
});

test('pause, fin de partie, nouvelle session', async () => {
  const p = await rpc(c, 'join_game', { p_name: 'עדי' });
  assert.equal((await rpc(c, 'admin_pause', { p_token: admin, p_paused: true })).ok, true);
  assert.equal((await rpc(c, 'get_state', { p_token: p.token })).game.paused, true);
  await rpc(c, 'admin_pause', { p_token: admin, p_paused: false });
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: qs[3].id });
  assert.equal((await rpc(c, 'admin_pause', { p_token: admin, p_paused: true })).error, 'question_open');
  await rpc(c, 'admin_finish', { p_token: admin });
  const st = await rpc(c, 'get_state', { p_token: p.token });
  assert.equal(st.game.status, 'finished');
  assert.equal(st.question.correct_index, qs[3].correct_index);   // révélée à la fin
  assert.ok(st.stats.players > 0);
  const exp = await rpc(c, 'admin_export', { p_token: admin });
  assert.ok(exp.answers.length > 0);

  await rpc(c, 'admin_new_game', { p_token: admin, p_title: 'סיור אמיתי' });
  assert.equal((await rpc(c, 'get_state', { p_token: p.token })).error, 'unknown_player');
  const s = await rpc(c, 'admin_state', { p_token: admin });
  assert.equal(s.players, 0); assert.equal(s.game.title, 'סיור אמיתי');
  assert.ok(s.questions.every(q => !q.used));   // la banque de questions est conservée
});

test('édition, suppression, réorganisation, vrai/faux', async () => {
  const tf = await rpc(c, 'admin_save_question', { p_token: admin, p_q: { kind: 'tf', text: 'בדיקה', correct_index: 1 } });
  assert.ok(tf.id);
  assert.equal((await rpc(c, 'admin_save_question', { p_token: admin, p_q: { text: 'x', options: ['א'], correct_index: 0 } })).error, 'options');
  assert.equal((await rpc(c, 'admin_save_question', { p_token: admin, p_q: { text: 'x', options: ['א', 'ב'], correct_index: 5 } })).error, 'correct_index');
  await rpc(c, 'admin_save_question', { p_token: admin, p_q: { id: tf.id, kind: 'tf', text: 'בדיקה ערוכה', correct_index: 0 } });
  let s = await rpc(c, 'admin_state', { p_token: admin });
  const ids = s.questions.map(q => q.id).reverse();
  await rpc(c, 'admin_reorder', { p_token: admin, p_ids: ids });
  s = await rpc(c, 'admin_state', { p_token: admin });
  assert.deepEqual(s.questions.map(q => q.id), ids);
  assert.equal(s.questions[0].text, 'בדיקה ערוכה');
  await rpc(c, 'admin_delete_question', { p_token: admin, p_id: tf.id });
  s = await rpc(c, 'admin_state', { p_token: admin });
  assert.ok(!s.questions.some(q => q.id === tf.id));
});

test('égalité : départage stable et documenté', async () => {
  await rpc(c, 'admin_new_game', { p_token: admin });
  const x = await rpc(c, 'join_game', { p_name: 'א' });
  await sleep(5);
  const y = await rpc(c, 'join_game', { p_name: 'ב' });
  // égalité parfaite (0 point) → l'ordre d'arrivée départage
  const lb = (await rpc(c, 'admin_state', { p_token: admin })).leaderboard;
  assert.deepEqual(lb.map(r => r.name), ['א', 'ב']);
  assert.deepEqual(lb.map(r => r.rank), [1, 2]);
  void x; void y;
});

test('durée par défaut : appliquée aux questions sans durée, désactivable avec 0', async () => {
  await rpc(c, 'admin_new_game', { p_token: admin });
  const s = await rpc(c, 'admin_state', { p_token: admin });
  assert.equal(s.game.default_time_limit_sec, 30);
  const noLimit = s.questions.find(q => q.time_limit_sec === null);
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: noLimit.id });
  let cur = (await rpc(c, 'admin_state', { p_token: admin })).current;
  assert.equal(cur.time_limit_sec, 30);
  assert.ok(Math.abs(Date.parse(cur.closes_at) - Date.parse(cur.opened_at) - 30000) < 5);
  await rpc(c, 'admin_reveal', { p_token: admin });
  // 0 = sans limite ; la valeur est conservée pour la partie suivante
  await rpc(c, 'admin_settings', { p_token: admin, p_s: { default_time_limit_sec: '0' } });
  await rpc(c, 'admin_new_game', { p_token: admin });
  assert.equal((await rpc(c, 'admin_state', { p_token: admin })).game.default_time_limit_sec, 0);
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: noLimit.id });
  cur = (await rpc(c, 'admin_state', { p_token: admin })).current;
  assert.equal(cur.closes_at, null);
  // une durée propre à la question l'emporte toujours
  await rpc(c, 'admin_reveal', { p_token: admin });
  const own = s.questions.find(q => q.time_limit_sec === 20);
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: own.id });
  assert.equal((await rpc(c, 'admin_state', { p_token: admin })).current.time_limit_sec, 20);
  await rpc(c, 'admin_settings', { p_token: admin, p_s: { default_time_limit_sec: '30' } });
});

test('installation ré-exécutable sans doublons', async () => {
  const { readFileSync } = await import('node:fs');
  const n0 = (await c.query('select count(*)::int n from mdl.questions')).rows[0].n;
  await c.query(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await c.query(readFileSync(new URL('../supabase/seed_demo.sql', import.meta.url), 'utf8'));
  assert.equal((await c.query('select count(*)::int n from mdl.questions')).rows[0].n, n0);
});
