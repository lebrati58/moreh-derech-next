// « הרפרטואר שלי » : catégories stables, comparaison de mémoire, révision espacée, maîtrise, chrono par unité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../public/exam/repertoire-core.js';
const R = globalThis.MDRepertoire;
const load = f => JSON.parse(readFileSync(new URL('../public/exam/' + f, import.meta.url)));

test('chaque consigne des sujets du prof (תרגול אמצע 2) tombe dans une catégorie', () => {
  const slots = [
    ['השער בתל שבע', ['fortification'], 'walls'], ['מפעל המים בתל שבע', ['water'], 'water'], ['הבית הערדי', ['archaeology'], 'city'],
    ['הדרכת דרך לבחירתכם מתוך המסלול', ['road'], 'road'], ['מבנה מראשיתה של באר שבע המודרנית', ['ottoman'], 'settle'],
    ['נקודה הקשורה לקבורה', ['burial'], 'burial'], ['נקודה הקשורה למים', ['water'], 'water'], ['נקודה הקשורה לחומות העיר', ['fortification'], 'walls'],
    ['נקודה הקשורה לאזור הר הבית', ['second_temple'], 'worship'], ['בית הכנסת בברעם', ['synagogue'], 'worship'],
    ['אתר מתקופת מלחמת העצמאות', ['battle'], 'battle'], ['מערת קשת', ['caves'], 'geo'], ['שביל סובב מירון', ['nature'], 'geo']
  ];
  for (const [he, need, cat] of slots) assert.equal(R.catOfSlot({ he, need }), cat, he);
});

test('toutes les missions publiées : chaque unité a une catégorie', () => {
  const regs = load('regions.json').regions.filter(r => r.file);
  for (const r of regs) for (const m of load(r.file).missions) {
    for (const u of R.missionPrep(m, { cards: {} }, r.id, Date.now())) assert.ok(u.cat, `${r.id}/${m.id} : « ${u.he} »`);
  }
});

test('candidats : routes seulement pour הדרכת דרך, sites ailleurs', () => {
  const d = load('negev.json');
  assert.ok(R.candidates(d, 'road').every(p => (p.tags || []).includes('road')) && R.candidates(d, 'road').length >= 1);
  assert.ok(R.candidates(d, 'water').some(p => p.id === 'tel_beer_sheva'));
  assert.ok(!R.candidates(d, 'water').some(p => (d.roads || []).includes(p)));
});

test('comparaison de mémoire : identique = 100 %, vide = 0 %, préfixes hébreux tolérés', () => {
  const ref = 'שער העיר בנוי משלושה זוגות אומנות, וצמוד לו המחסנים לפריקת השיירות. בתל 15 שכבות יישוב.';
  assert.equal(R.compare(ref, ref).pct, 100);
  assert.equal(R.compare(ref, '').pct, 0);
  const r = R.compare(ref, 'ליד השער יש מחסנים, ובשער שלושה זוגות אומנות; 15 שכבות.');
  assert.ok(r.pct >= 50 && r.pct < 100, r.pct);
  assert.ok(r.missed.length > 0);
});

test('révision espacée : on avance à ≥ 70 %, on recommence sinon, maîtrise à l’étape 3', () => {
  const now = new Date('2026-11-06T10:00:00').getTime(), DAY = 864e5;
  let c = { site: 'x', text: 'abc', step: 0, due: now };
  c = R.schedule(c, 80, now); assert.equal(c.step, 1); assert.ok(c.due - now > 2 * DAY && c.due - now <= 3 * DAY);
  c = R.schedule(c, 90, now); c = R.schedule(c, 90, now); assert.equal(c.step, 3);
  assert.equal(R.state(c, now), 'mastered');
  assert.equal(R.state(c, c.due + 1), 'due');
  c = R.schedule(c, 40, now); assert.equal(c.step, 0); assert.equal(R.state(c, now), 'learning');
  assert.equal(R.state(null, now), 'empty'); assert.equal(R.state({ site: 'x' }, now), 'chosen');
});

test('liste du jour : seulement les fiches écrites et échues, la plus ancienne d’abord', () => {
  const now = 1e12, rep = { cards: { 'a:water': { site: 1, text: 't', due: now - 5 }, 'a:road': { site: 1, text: 't', due: now - 50 }, 'a:geo': { site: 1, due: now - 99 }, 'a:view': { site: 1, text: 't', due: now + 9 } } };
  assert.deepEqual(R.dueList(rep, now), ['a:road', 'a:water']);
});

test('mission fixe : 2 examens blancs ≥ 80 % = maîtrisée', () => {
  assert.equal(R.mastery([{ pct: 85 }]).done, false);
  assert.equal(R.mastery([{ pct: 85 }, { pct: 70 }, { pct: 80 }]).done, true);
});

test('chrono : 3 h = לו"ז 20 + 5 × 15 + 40 + relecture 45 ; proportionnel en 90 min', () => {
  const b = R.paceBudget(180, 5);
  assert.deepEqual(b.map(p => p.min), [20, 15, 15, 15, 15, 15, 40, 45]);
  assert.equal(b[b.length - 1].to, 180);
  assert.equal(R.pace(180, 10, 5).part.id, 'plan');
  assert.equal(R.pace(180, 21, 5).part.id, 'u1');
  assert.equal(R.pace(180, 100, 5).part.id, 'long');
  assert.equal(R.paceBudget(90, 5)[0].min, 10);
  assert.equal(R.pace(180, 999, 5).left, 0);
});

test('faits du cours : la phrase originale du document accompagne le fait (affichée au toucher)', () => {
  const regs = load('regions.json').regions.filter(r => r.file && r.file !== 'golan-south.json');
  for (const r of regs) {
    const d = load(r.file), fs = d.sites.concat(d.roads || []).flatMap(s => s.facts || []).filter(f => !f.official);
    const withQ = fs.filter(f => f.q).length;
    assert.ok(withQ / fs.length >= 0.9, `${r.id} : ${withQ}/${fs.length} faits avec la phrase originale`);
  }
  const ng = load('negev.json'), ar = ng.sites.find(s => s.id === 'arad_fortress');
  assert.ok(ar.facts.every(f => f.q), 'מצודת ערד : chaque fait a sa phrase');
});
