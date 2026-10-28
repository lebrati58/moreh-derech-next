// מורה דרך EXAM : contenu sourcé et cohérent, compteur de mots comme le cahier, contrôles et score indicatif.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../public/exam/exam-core.js';
const C = globalThis.MDExamCore;
const D = JSON.parse(readFileSync(new URL('../public/exam/golan-south.json', import.meta.url)));
const MO = JSON.parse(readFileSync(new URL('../public/exam/models.json', import.meta.url)));
const M = MO.models.school5;

test('modèle de l’école : 70 pts = 15 + 5×8 + 15, limites 180 / 20 / 400 (cahier d’examen)', () => {
  const p = Object.fromEntries(M.parts.map(x => [x.id, x]));
  assert.equal(p.plan.points + p.short.count * p.short.pointsEach + p.long.points, M.total);
  assert.equal(M.total, 70); assert.equal(p.short.count, 5);
  assert.deepEqual([M.limits.shortWords, M.limits.methodWords, M.limits.longWords], [180, 20, 400]);
  assert.equal(MO.models.ministry6.total, null, 'barème des 6 interventions non publié : pas de points inventés');
});

test('contenu : chaque fait a une source connue, coordonnées dans le sud du Golan, statuts explicites', () => {
  const srcs = new Set(Object.keys(D.sources).concat(['roadTips', 'lesson26', 'longRules', 'model']));
  for (const s of D.sites) {
    assert.ok(s.lat > 32.7 && s.lat < 32.95 && s.lon > 35.6 && s.lon < 35.9, s.id + ' : coordonnées');
    assert.ok(s.status.length, s.id + ' : statut');
    for (const f of s.facts) assert.ok(srcs.has(f.src), s.id + ' : source ' + f.src);
  }
  for (const id of ['hippos', 'kursi']) assert.ok(D.sites.find(s => s.id === id).status.includes('unverified'), id + ' marqué « טרם אומת »');
  for (const e of D.errorSets) for (const it of e.items) { assert.ok(srcs.has(it.src), e.id + ' source'); if (!it.ok) assert.ok(it.fix && C.CATS[it.cat], e.id + ' : correction + catégorie'); }
  const ek = D.sites.find(s => s.id === 'ein_keshatot');
  assert.ok(ek.facts.some(f => /6–7/.test(f.he)) && !ek.facts.some(f => /בית שני/.test(f.he)), 'עין קשתות : Antiquité tardive, jamais « Second Temple »');
});

test('missions : la meilleure réponse respecte chaque consigne (sites différents, développée hors des courtes)', () => {
  for (const m of D.missions) {
    const picks = Object.fromEntries(m.slots.map(s => [s.id, s.best])); picks.long = m.long.best;
    const r = C.checkSlots(m, picks, D);
    assert.ok(r.every(x => x.ok), m.id + ' : ' + r.filter(x => !x.ok).map(x => x.he).join(' | '));
  }
  const m = D.missions[0], bad = Object.fromEntries(m.slots.map(s => [s.id, s.best])); bad.long = m.slots[1].best;
  assert.equal(C.checkSlots(m, bad, D).find(x => x.slot === 'long').ok, false, 'développée déjà utilisée en courte → refusée');
});

test('réponses modèles : dans les limites et sans piège factuel', () => {
  for (const [k, mo] of Object.entries(D.models)) {
    const n = C.wordCount(mo.text);
    assert.ok(n <= (mo.kind === 'long' ? 400 : 180), k + ' : ' + n + ' mots');
    assert.ok(C.wordCount(mo.method) <= 20, k + ' : אמצעים');
    const r = C.checkUnit(Object.assign({ site: mo.kind === 'long' ? mo.site : k }, mo), { model: M, data: D, shortSites: mo.kind === 'long' ? [] : null });
    assert.equal(r.frac, 1, k + ' : ' + r.items.filter(i => !i.ok).map(i => i.he).join(' | '));
  }
});

test('compteur de mots et couleurs du cahier (jaune < 170, vert 170–180, rouge > 180)', () => {
  assert.equal(C.wordCount('  א  ב\nג '), 3);
  assert.equal(C.wordState(169, 'short', M.limits).state, 'low');
  assert.equal(C.wordState(175, 'short', M.limits).state, 'ok');
  assert.equal(C.wordState(181, 'short', M.limits).state, 'over');
  assert.equal(C.wordState(390, 'long', M.limits).state, 'ok');
  assert.equal(C.wordState(401, 'long', M.limits).state, 'over');
});

test('pièges historiques détectés, négations respectées', () => {
  const pf = (t, s) => C.findPitfalls(t, s, D).map(x => x.cat);
  assert.deepEqual(pf('זה בית כנסת מימי הבית השני.', 'ein_keshatot'), ['period']);
  assert.deepEqual(pf('זה לא בית כנסת מימי הבית השני.', 'ein_keshatot'), []);
  assert.deepEqual(pf('נהרס ברעידת האדמה של 363.', 'ein_keshatot'), ['chronology']);
  assert.deepEqual(pf('נהרס ברעידת האדמה של 749.', 'ein_keshatot'), []);
  assert.deepEqual(pf('הקרב במלחמת ששת הימים.', 'tel_saki'), ['period']);
  assert.deepEqual(pf('הביטו קדימה אל המצוק.', 'road789'), ['orientation']);
});

test('programme : début 08:00, continuité, heures d’ouverture du cours, programme vide = 0', () => {
  const ctx = { model: M, data: D, sites: ['ein_keshatot'] };
  assert.equal(C.checkPlan([], ctx).frac, 0);
  const good = [
    { start: '08:00', end: '09:00', what: 'מפגש ואיסוף בצומת צמח, נסיעה', log: 'לבדוק שכולם הגיעו' },
    { start: '09:00', end: '10:30', what: 'עין קשתות', log: 'תשלום, שירותים', site: 'ein_keshatot' },
    { start: '10:30', end: '12:30', what: 'נסיעה', log: '' },
    { start: '12:30', end: '13:30', what: 'ארוחת צהריים', log: 'עצמית' },
    { start: '13:30', end: '18:00', what: 'נסיעה וחזרה, פיזור בצומת צמח', log: 'פיזור' }
  ];
  assert.equal(C.checkPlan(good, ctx).frac, 1);
  const late = good.map(r => Object.assign({}, r)); late[1].end = '17:30';
  const r = C.checkPlan(late, ctx);
  assert.ok(r.items.some(i => !i.ok && /שעות הפתיחה \(09:00–17:00\)/.test(i.he)), 'עין קשתות après 17:00 → signalé');
  assert.ok(r.items.some(i => !i.ok && /חורים/.test(i.he)), 'trou entre 17:30 et 11:30 → signalé');
  // déjeuner : 1 h entre 12:00 et 14:00 (règle du guide)
  const lunch = good.map(r => Object.assign({}, r)); lunch[3].start = '11:30'; lunch[3].end = '13:00'; lunch[2].end = '11:30';
  const rl = C.checkPlan(lunch, ctx);
  assert.ok(rl.items.some(i => !i.ok && /שעה אחת/.test(i.he)) && rl.items.some(i => !i.ok && /בין 12:00 ל-14:00/.test(i.he)), 'déjeuner 11:30–13:00 → durée et plage signalées');
  const late2 = good.map(r => Object.assign({}, r)); late2[3].start = '13:30'; late2[3].end = '14:30'; late2[2].end = '13:30'; late2[4].start = '14:30';
  assert.ok(C.checkPlan(late2, ctx).items.some(i => !i.ok && /בין 12:00 ל-14:00/.test(i.he)), 'déjeuner finissant 14:30 → signalé');
});

test('examen blanc : copie vide = 0, sur 70, indicatif ; 6 interventions → % sans barème inventé', () => {
  const m = D.missions[0];
  const empty = C.scoreExam({ plan: [], units: {}, long: {} }, M, m, D);
  assert.equal(empty.got, 0); assert.equal(empty.max, 70); assert.ok(empty.indicative);
  const six = C.scoreExam({ plan: [], units: {}, long: {} }, MO.models.ministry6, m, D);
  assert.equal(six.total, null); assert.equal(six.parts.filter(p => p.slot).length, 6);
});

test('progression : niveaux, révision ciblée, mission du jour stable', () => {
  assert.equal(C.level(0).n, 1); assert.equal(C.level(130).n, 2);
  const rec = C.recommend({ period: 3, time: 1 }, D);
  assert.equal(rec.cat, 'period'); assert.ok(rec.sets.includes('e1'));
  assert.equal(C.dailyMission('2026-10-28', D.missions).id, C.dailyMission('2026-10-28T23:00', D.missions).id);
});
