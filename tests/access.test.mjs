// Accès réservé (numéro de teoudat zehout) : vraie base PostgreSQL. Aucun vrai numéro ici : numéros FICTIFS
// construits avec le chiffre de contrôle israélien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { freshDb, rpc } from './helpers.mjs';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

// numéro fictif valide à partir de 8 chiffres (calcul du chiffre de contrôle)
export function fakeTz(base8) {
  const d = String(base8).padStart(8, '0'); let s = 0;
  for (let k = 0; k < 8; k++) { let v = Number(d[k]) * (k % 2 ? 2 : 1); s += v > 9 ? v - 9 : v; }
  return d + String((10 - (s % 10)) % 10);
}

test('accès par teoudat zehout : liste privée hachée, connexion, retrait, limite de tentatives', async () => {
  const c = await freshDb('mdl_access', { seed: false });
  try {
    await c.query(await read('supabase/access_control.sql'));
    await c.query(await read('supabase/access_control.sql')); // ré-exécutable
    const A = fakeTz(12345678), B = fakeTz(23456789), C = fakeTz(34567890);
    // liste vide : application ouverte
    assert.equal((await rpc(c, 'access_required')).required, false);
    const adm = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
    await assert.rejects(rpc(c, 'admin_access_set', { p_token: 'faux', p_list: A }), /not_authorized/);
    // collage façon Excel : prénom ⇥ numéro, numéro sans zéro initial, ligne invalide, ligne vide
    // « 123456789 » : chiffre de contrôle faux, mais accepté quand même (demande du guide) et signalé à vérifier ; « 12 » refusé
    const r = await rpc(c, 'admin_access_set', { p_token: adm, p_list: `דנה\t${A}\r\n${B}, יוסי\n\n123456789\nאבי 12\n` });
    assert.equal(r.allowed, 3); assert.deepEqual(r.bad_lines, [4]); assert.deepEqual(r.check_lines, [3]);
    assert.equal((await rpc(c, 'access_login', { p_tz: '123456789' })).ok, true, 'numéro au chiffre de contrôle faux : accepté');
    assert.equal((await rpc(c, 'access_login', { p_tz: '0123456789' })).ok, undefined, '10 chiffres : refusé');
    assert.equal((await rpc(c, 'access_required')).required, true);
    // collages difficiles qui doivent passer (« il manque quelques-uns ») : séparateurs, caractères invisibles,
    // zéros initiaux perdus par Excel, téléphone ou n° de ligne sur la même ligne ; doublons comptés une fois
    const D = fakeTz(1234567), E = fakeTz(45678901), F = fakeTz(56789012), G = fakeTz(67890123), H = fakeTz(78901234);
    const pick = async l => (await c.query('select mdl.tz_pick($1) t', [l])).rows[0].t;
    assert.equal(await pick(D.slice(0, 3) + ' ' + D.slice(3, 6) + ' ' + D.slice(6)), D);
    assert.equal(await pick('\u200f' + E + '\u200e'), E);
    assert.equal(await pick(F.replace(/^0+/, '')), F);
    assert.equal(await pick('0521234567\t' + G), G, 'téléphone ignoré');
    assert.equal(await pick('3. ' + H.slice(0, 4) + '-' + H.slice(4)), H);
    assert.equal(await pick('1.23457E+08'), null);
    assert.equal(await pick('0521234567\t1234567'), '001234567', 'contrôle faux : premier groupe de 5 à 9 chiffres');
    const r2 = await rpc(c, 'admin_access_set', { p_token: adm, p_list: [A, B, A, D.slice(0, 3) + ' ' + D.slice(3), '\u200f' + E, '0521234567\t' + G].join('\n') });
    assert.equal(r2.allowed, 5); assert.equal(r2.duplicates, 1); assert.deepEqual(r2.bad_lines, []);
    // rien n'est stocké en clair
    const dump = JSON.stringify((await c.query('select * from mdl.access_people')).rows);
    assert.ok(!dump.includes(A) && !dump.includes(B), 'aucun numéro en clair');
    assert.deepEqual(await rpc(c, 'admin_access_list', { p_token: adm }), { allowed: 5 });
    assert.equal((await c.query('select count(*)::int n from mdl.access_people where label is not null')).rows[0].n, 0, 'aucun prénom enregistré, même collé');
    assert.ok(!JSON.stringify((await c.query('select * from mdl.access_people')).rows).includes('דנה'), 'le prénom collé n’est nulle part');
    // connexion
    assert.equal((await rpc(c, 'access_login', { p_tz: C })).error, 'not_allowed');
    assert.equal((await rpc(c, 'access_login', { p_tz: '12' })).error, 'invalid_tz');
    const s = await rpc(c, 'access_login', { p_tz: ' ' + A.slice(0, 3) + '-' + A.slice(3) + ' ' });
    assert.ok(s.ok && s.token && !('label' in s), 'connexion avec espaces et tiret, aucun prénom renvoyé');
    assert.equal((await rpc(c, 'access_check', { p_token: s.token })).ok, true);
    assert.equal((await rpc(c, 'access_check', { p_token: 'autre' })).ok, false);
    // le numéro ouvre l'application, JAMAIS l'administration : la session élève est refusée partout côté admin
    for (const [fn, args] of [['admin_access_set', { p_list: C }], ['admin_access_list', {}], ['admin_state', {}]]) {
      await assert.rejects(rpc(c, fn, Object.assign({ p_token: s.token }, args)), /not_authorized/, fn + ' refusé avec un jeton élève');
    }
    // liste collée sans aucun numéro valide : refusée, rien ne change
    assert.equal((await rpc(c, 'admin_access_set', { p_token: adm, p_list: 'n’importe quoi' })).error, 'no_valid_lines');
    assert.equal((await rpc(c, 'access_check', { p_token: s.token })).ok, true);
    // retrait de l'élève : sa session ne marche plus
    assert.equal((await rpc(c, 'admin_access_set', { p_token: adm, p_list: B })).allowed, 1);
    assert.equal((await rpc(c, 'access_check', { p_token: s.token })).ok, false);
    // limite de tentatives ratées
    for (let i = 0; i < 60; i++) await rpc(c, 'access_login', { p_tz: C });
    assert.equal((await rpc(c, 'access_login', { p_tz: B })).error, 'too_many_attempts');
    // aucun accès direct aux tables
    for (const t of ['access_people', 'access_secret', 'access_sessions'])
      assert.equal((await c.query(`select has_table_privilege('anon','mdl.${t}','select') s`).catch(() => ({ rows: [{ s: false }] }))).rows[0].s, false, t);
  } finally { await c.end(); }
});
