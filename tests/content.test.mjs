// Contrôle qualité de la banque des 34 questions et de leurs fiches, puis import réel en base.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTE } from '../content/index.mjs';
import { freshDb, rpc } from './helpers.mjs';

const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

test('34 questions, clés uniques, réponses valides', () => {
  assert.equal(ROUTE.length, 34);
  assert.equal(new Set(ROUTE.map(q => q.key)).size, 34);
  assert.equal(new Set(ROUTE.map(q => q.text)).size, 34, 'deux questions identiques');
  for (const q of ROUTE) {
    assert.equal(q.options.length, 4, q.key);
    assert.equal(new Set(q.options).size, 4, q.key + ' : options en double');
    assert.ok(q.correct >= 0 && q.correct < 4, q.key);
    assert.ok(['visible', 'check', 'nearby', 'topic'].includes(q.visibility), q.key);
  }
});

test('chaque fiche est complète, de la bonne longueur, et sourcée', () => {
  for (const q of ROUTE) {
    const s = words(q.short), l = words(q.long);
    // ~130 mots/min à l'oral : court ≈ 20–45 s, long ≈ 1–3 min
    assert.ok(s >= 40 && s <= 100, `${q.key} : script court ${s} mots`);
    assert.ok(l >= 150 && l <= 400, `${q.key} : script long ${l} mots`);
    assert.ok(q.explanation && words(q.explanation) <= 45, `${q.key} : explication élèves trop longue`);
    assert.ok(q.location, q.key + ' : moment du trajet manquant');
    assert.ok(q.fact, q.key + ' : הידעת manquant');
    assert.ok(q.sources.length >= 1 && q.sources.every(x => x.title), q.key + ' : sources');
  }
});

test('les 34 fiches sont différentes (pas de texte répété)', () => {
  const firstLines = ROUTE.map(q => q.long.split('\n')[0]);
  assert.equal(new Set(firstLines).size, 34);
  const shorts = ROUTE.map(q => q.short);
  assert.equal(new Set(shorts).size, 34);
});

let c;
after(async () => c && c.end());

test('import SQL réel : 34 questions, ordre du trajet, ré-exécutable, privé', async () => {
  c = await freshDb('mdl_content', { seed: false });
  const sql = readFileSync(new URL('../supabase/questions_route.sql', import.meta.url), 'utf8');
  await c.query(sql);
  await c.query(sql);                                   // deuxième exécution : pas de doublons
  await c.query(readFileSync(new URL('../supabase/seed_demo.sql', import.meta.url), 'utf8'));
  const admin = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
  const st = await rpc(c, 'admin_state', { p_token: admin });
  assert.equal(st.questions.length, 34, 'pas de démo ajoutée quand la banque est remplie');
  assert.deepEqual(st.questions.map(q => q.ext_key), ROUTE.map(q => q.key));
  assert.ok(st.questions.every(q => q.guide_long.length > 500 && q.guide_sources.length));
  // un élève ne reçoit jamais le contenu des fiches
  const p = await rpc(c, 'join_game', { p_name: 'בודק' });
  for (const q of st.questions.slice(0, 5)) {
    await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
    await rpc(c, 'admin_reveal', { p_token: admin });
    const s = JSON.stringify(await rpc(c, 'get_state', { p_token: p.token, p_since: 0 }));
    assert.ok(!s.includes(q.guide_short.slice(0, 30)) && !s.includes(q.guide_fact.slice(0, 30)), q.ext_key);
  }
});

test('install.sql complet sur une base vierge', async () => {
  const d = await freshDb('mdl_install', { seed: false });
  try {
    await d.query(readFileSync(new URL('../supabase/install.sql', import.meta.url), 'utf8'));
    const n = (await d.query('select count(*)::int n, count(*) filter (where is_demo)::int demo from mdl.questions')).rows[0];
    assert.deepEqual(n, { n: 34, demo: 0 });
  } finally { await d.end(); }
});
