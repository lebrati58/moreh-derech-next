import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('class contest SQL keeps scores private behind RPCs', async () => {
  const sql = await read('supabase/class_contest.sql');
  assert.match(sql, /revoke all on mdl\.class_scores from public, anon, authenticated;/);
  assert.equal((sql.match(/security definer/g) || []).length, 4);
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 4);
  assert.match(sql, /perform mdl\.check_admin\(p_token\)/);
  assert.match(sql, /class_leaderboard\(\)[\s\S]*'name', s\.name, 'points'/);
  assert.doesNotMatch(sql.match(/function public\.class_leaderboard[\s\S]*?\$\$;/)[0], /token_hash/);
});

test('scores are only published with a name and explicit consent', async () => {
  const js = await read('public/progress.js');
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /if \(p\.consent && p\.name\)/);
  assert.match(js, /class_score_delete/);
  assert.match(js, /אני מסכים\/ה לפרסם/);
  assert.doesNotMatch(js, /geolocation/);
  const game = await read('public/guided-tour.html');
  assert.match(game, /recordProgress\(q,ok\)/);
  assert.match(game, /<script src="progress\.js"><\/script>/);
  const map = await read('public/map.html');
  assert.match(map, /pin\.gold/);
  assert.match(map, /<script src="progress\.js"><\/script>/);
  assert.match(await read('public/class.html'), /esc\(x\.name\)/);
});

test('concours v2 : un tableau par code de classe, migration sans perte, remise à zéro d’une seule classe', async () => {
  const { freshDb, rpc } = await import('./helpers.mjs');
  const c = await freshDb('mdl_contest_v2', { seed: false });
  try {
    await c.query(await read('supabase/class_contest.sql'));
    const tok = n => `0000000${n}-0000-4000-8000-00000000000${n}`;
    // un score déjà envoyé avec la v1, avant la migration
    assert.ok((await rpc(c, 'class_score_submit', { p_token: tok(1), p_name: 'דנה', p_points: 500, p_stars: 1, p_gold: 0, p_answered: 5 })).ok);
    await c.query(await read('supabase/class_contest_v2.sql'));
    await c.query(await read('supabase/class_contest_v2.sql')); // ré-exécutable
    assert.deepEqual((await rpc(c, 'class_board', { p_class: '' })).items.map(x => x.name), ['דנה'], 'ancien score conservé dans le tableau général');
    assert.ok((await rpc(c, 'class_submit', { p_token: tok(2), p_name: 'יוסי', p_points: 900, p_stars: 2, p_gold: 0, p_answered: 9, p_class: ' Yuval-2026 ' })).ok);
    assert.ok((await rpc(c, 'class_submit', { p_token: tok(3), p_name: 'נועה', p_points: 700, p_stars: 1, p_gold: 0, p_answered: 7, p_class: 'yuval-2026' })).ok);
    assert.ok((await rpc(c, 'class_submit', { p_token: tok(4), p_name: 'Paul', p_points: 300, p_stars: 0, p_gold: 0, p_answered: 3, p_class: 'אחר' })).ok);
    assert.deepEqual((await rpc(c, 'class_board', { p_class: 'YUVAL-2026' })).items.map(x => x.name), ['יוסי', 'נועה'], 'classe : seulement ses élèves, code sans majuscules ni espaces');
    assert.deepEqual((await rpc(c, 'class_board', { p_class: 'אחר' })).items.map(x => x.name), ['Paul']);
    assert.equal((await rpc(c, 'class_submit', { p_token: tok(5), p_name: 'x', p_points: 1, p_stars: 0, p_gold: 0, p_answered: 1, p_class: 'bad code!' })).error, 'invalid_class');
    // l'élève change de classe : il quitte l'ancien tableau
    await rpc(c, 'class_submit', { p_token: tok(4), p_name: 'Paul', p_points: 300, p_stars: 0, p_gold: 0, p_answered: 3, p_class: 'yuval-2026' });
    assert.equal((await rpc(c, 'class_board', { p_class: 'אחר' })).items.length, 0);
    // remise à zéro d'une seule classe, réservée à l'admin
    await assert.rejects(rpc(c, 'admin_class_reset_code', { p_token: 'faux', p_class: 'yuval-2026' }));
    const tokA = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
    assert.equal((await rpc(c, 'admin_class_reset_code', { p_token: tokA, p_class: 'yuval-2026' })).deleted, 3);
    assert.equal((await rpc(c, 'class_board', { p_class: 'yuval-2026' })).items.length, 0);
    assert.equal((await rpc(c, 'class_board', { p_class: '' })).items.length, 1, 'les autres tableaux ne sont pas touchés');
    // aucun accès direct à la table
    const pub = await c.query(`select has_table_privilege('anon','mdl.class_scores','select') as s`).catch(() => ({ rows: [{ s: false }] }));
    assert.equal(pub.rows[0].s, false);
  } finally { await c.end(); }
});
