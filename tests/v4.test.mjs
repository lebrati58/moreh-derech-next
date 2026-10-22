// V4 — parcours automatique : départ/arrivée → lieux le long de la route → questions.
// Les services en ligne (OpenStreetMap, Wikipédia, Wikidata) ne sont PAS appelés ici : les réponses
// sont des données d'exemple fabriquées pour le test, au format documenté de chaque service.
// Ce test vérifie la logique (choix des lieux, questions, 4 langues, enregistrement), pas les vraies données.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDb, rpc } from './helpers.mjs';
import { GEOM, PLACES, REF_LABELS, fakeFetch } from './v4-fixtures.mjs';

const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const umd = p => { const m = { exports: {} }; new Function('module', 'self', file(p))(m, {}); return m.exports; };
const G = umd('public/gps-engine.js');
const A = umd('public/auto-engine.js');

// ------------------------------------------------------------------ Données d'exemple
const built = A.build({ G, geometry: GEOM, from: { name: 'זכרון יעקב', point: GEOM[0] }, to: { name: 'יקנעם', point: GEOM[40] },
  durationSec: 1200, places: PLACES, refs: REF_LABELS });

// ------------------------------------------------------------------ Moteur (pur)
test('lieux : proches de la route seulement, dans l\'ordre du trajet, espacés', () => {
  const { route, questions } = built;
  const keys = route.stops.map(s => s.name.he);
  assert.ok(!keys.includes('מקום רחוק'), 'lieu à 5 km exclu');
  assert.ok(!keys.includes('ללא עובדות'), 'lieu sans fait exploitable exclu');
  assert.ok(questions.length >= 4, 'au moins 4 questions');
  const P = G.prepare(route);
  const ss = P.stops.map(s => s.s);
  assert.deepEqual(ss, ss.slice().sort((a, b) => a - b), 'ordre du trajet');
  assert.deepEqual(route.stops.map(s => s.id), questions.map(q => q.key), 'un lieu = une question');
  assert.equal(route.stops.find(s => s.name.he === 'אליקים').side.value, 'left', 'nord de la route = gauche (vers l\'est)');
  assert.equal(route.stops.find(s => s.name.he === 'יקנעם עילית').side.value, 'right', 'sud = droite');
  assert.ok(!keys.includes('נחל תות'), '« מה זה נחל תות? » → נחל : réponse déjà dans le nom, question écartée');
  for (const q of questions) {
    const name = route.stops.find(st => st.id === q.key).name.he;
    assert.ok(!name.includes(q.options[q.correct_index]), 'réponse dans le nom : ' + q.text);
  }
  assert.equal(route.stops.find(s => s.name.he === 'מחלף רבין').side.verified, false, 'sur la route : pas de côté');
  assert.equal(route.status, 'verified'); assert.equal(route.finish.enabled, false); assert.equal(route.minGapSec, 90);
});

test('questions : faits sourcés, 4 réponses distinctes, même bonne réponse dans les 4 langues', () => {
  for (const q of built.questions) {
    assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4, q.text);
    assert.ok(q.correct_index >= 0 && q.correct_index < 4);
    for (const l of ['fr', 'en', 'ru']) {
      assert.equal(q.i18n[l].options.length, 4);
      assert.ok(!/[֐-׿]/.test(q.i18n[l].text.replace(/[«“].*[»”]/, '')), `${l} : texte traduit`);
    }
    assert.ok(q.guide_i18n.he.script.length > 10, 'phrase micro tirée de Wikipédia');
    assert.ok(Array.isArray(q.guide_i18n.he.more));
    assert.ok(q.guide_sources.some(s => /wikidata\.org/.test(s.url)), 'source citée');
  }
  const bat = built.questions.find(q => q.text.includes('בת שלמה'));
  assert.ok(bat, 'Bat Shlomo présente');
  assert.equal(bat.kind, 'named', 'le fait le plus intéressant (« nommé d\'après ») passe en premier');
  assert.equal(bat.options[bat.correct_index], 'הברון רוטשילד');
  assert.equal(bat.i18n.en.options[bat.correct_index], 'Baron Rothschild');
  const pos = [0, 0, 0, 0]; built.questions.forEach(q => pos[q.correct_index]++);
  assert.ok(Math.max(...pos) - Math.min(...pos) <= 2, 'bonne réponse répartie : ' + pos);
  const kinds = new Set(built.questions.map(q => q.kind));
  assert.ok(kinds.size >= 3, 'modèles variés : ' + [...kinds]);
  const yokneam = built.questions.find(q => q.text.includes('יקנעם עילית'));
  if (yokneam && yokneam.kind === 'year') assert.equal(yokneam.options[yokneam.correct_index], '1950');
});

test('phrases : découpage sans casser les abréviations, parenthèses retirées', () => {
  assert.deepEqual(A.sentences('המושבה (בערבית: x) נוסדה ע״י הברון. היא יפה! עוד משפט.'), ['המושבה נוסדה ע״י הברון.', 'היא יפה!', 'עוד משפט.']);
  assert.deepEqual(A.sentences('It was built in 3.5 years. Then it grew.'), ['It was built in 3.5 years.', 'Then it grew.']);
});

// ------------------------------------------------------------------ Réseau (simulé : formats documentés des API)
test('chaîne complète : adresses → trajet → lieux → faits → textes → questions (services simulés)', async () => {
  const { f, calls } = fakeFetch();
  const steps = [];
  const r = await A.generate({ G, fetch: f, from: 'זכרון יעקב', to: 'יקנעם' }, k => steps.push(k));
  assert.deepEqual([...new Set(steps)], ['geocode', 'route', 'places', 'facts', 'texts', 'build']);
  assert.ok(r.questions.length >= 4);
  assert.equal(r.route.title.he, 'זכרון יעקב → יקנעם');
  assert.ok(calls.every(u => /^https:\/\//.test(u)), 'HTTPS uniquement');
  assert.ok(calls.filter(u => /wiki/.test(u)).every(u => /origin=\*/.test(u) || /wikidata/.test(u) && /origin=\*/.test(u)), 'appels Wikipédia/Wikidata compatibles navigateur (origin=*)');
  assert.ok(r.questions.find(q => q.text.includes('בת שלמה')).guide_i18n.en.script.includes('interesting'), 'texte anglais tiré de Wikipédia anglais');
  // coordonnées tapées directement : pas d'appel Nominatim
  const g2 = fakeFetch();
  await A.generate({ G, fetch: g2.f, from: '32.6, 34.9', to: '32.6,35.1' });
  assert.ok(!g2.calls.some(u => /nominatim/.test(u)));
});

test('aucune clé ni secret dans le moteur', () => {
  assert.ok(!/key=|apikey|token|Bearer/i.test(file('public/auto-engine.js')));
});

// ------------------------------------------------------------------ Base de données
let c, admin;
before(async () => {
  c = await freshDb('mdl_v4', { seed: false });
  await c.query(file('supabase/install.sql'));
  admin = (await rpc(c, 'admin_login', { p_password: 'test-password-123' })).token;
});
after(async () => c && c.end());

test('enregistrement : nouvelle banque + tracé, partie jouable, V1/V2/V3 intactes', async () => {
  const before = (await c.query(`select bank, count(*)::int n from mdl.questions group by 1 order by 1`)).rows;
  const r = await rpc(c, 'admin_import_route', { p_token: admin, p_label: { he: 'זכרון יעקב → יקנעם' },
    p_route: built.route, p_questions: JSON.stringify(built.questions) });
  assert.ok(/^A\d{12}/.test(r.code), JSON.stringify(r));
  assert.equal(r.questions, built.questions.length);
  const r2 = await rpc(c, 'admin_import_route', { p_token: admin, p_label: { he: 'שוב' }, p_route: built.route, p_questions: JSON.stringify(built.questions) });
  assert.notEqual(r2.code, r.code, 'chaque parcours = sa propre banque');
  const after = (await c.query(`select bank, count(*)::int n from mdl.questions where bank in ('V1','V2','V3') group by 1 order by 1`)).rows;
  assert.deepEqual(after, before.filter(x => ['V1', 'V2', 'V3'].includes(x.bank)));
  const g = await rpc(c, 'admin_new_game', { p_token: admin, p_title: 'auto', p_bank: r.code });
  assert.equal(g.bank, r.code);
  const s = await rpc(c, 'admin_state', { p_token: admin });
  assert.equal(s.route.bank, r.code); assert.equal(s.route.stops.length, built.questions.length);
  assert.equal(s.questions.length, built.questions.length);
  const q = s.questions[0];
  assert.equal(q.ext_key, r.code.toLowerCase() + ':P1'); assert.equal(q.time_limit_sec, 45);
  assert.deepEqual(q.guide_i18n.he.more, built.questions[0].guide_i18n.he.more);
  assert.equal((await c.query(`select default_time_limit_sec t from mdl.games where is_active`)).rows[0].t, 45);
  // un élève joue : la question part dans sa langue, rien de privé
  const pl = await rpc(c, 'join_game', { p_name: 'דנה', p_lang: 'fr' });
  await rpc(c, 'admin_open_question', { p_token: admin, p_question_id: q.id });
  const st = await rpc(c, 'get_state', { p_token: pl.token, p_since: 0 });
  assert.equal(st.question.text, built.questions[0].i18n.fr.text);
  assert.ok(!JSON.stringify(st).includes('guide_') && !JSON.stringify(st).includes('"route"'));
  const sv = await rpc(c, 'get_state', { p_token: pl.token, p_since: 0 });
  assert.equal(sv.route, undefined, 'le tracé n\'est jamais envoyé aux élèves');
});

test('enregistrement : refus des données invalides et sans jeton', async () => {
  const bad = async (q, route) => rpc(c, 'admin_import_route', { p_token: admin, p_label: {}, p_route: route || built.route, p_questions: JSON.stringify(q) });
  assert.equal((await bad([])).error, 'bad_count');
  assert.equal((await bad([{ key: 'x', text: 'a', options: ['a', 'b', 'c'], correct_index: 0 }])).error, 'bad_question');
  assert.equal((await bad([{ key: 'x y', text: 'a', options: ['a', 'b', 'c', 'd'], correct_index: 0 }])).error, 'bad_question');
  assert.equal((await bad(built.questions, { geometry: [[1, 2]] })).error, 'bad_route');
  await assert.rejects(rpc(c, 'admin_import_route', { p_token: 'nope', p_label: {}, p_route: built.route, p_questions: JSON.stringify(built.questions) }));
});
