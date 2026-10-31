// Mondes 3D : registre, données de Césarée (sources, incertitudes, 3 langues), missions, score, progression, qualité graphique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const exists = p => access(new URL('../' + p, import.meta.url)).then(() => true, () => false);
const SITE = JSON.parse(await read('public/world3d/sites/caesarea.json'));
const REG = JSON.parse(await read('public/world3d/sites/index.json'));

async function lib() { const ctx = { Math, JSON, Object, Array, Date, String, Number, isFinite }; vm.createContext(ctx); vm.runInContext(await read('public/world3d/world-core.js'), ctx); return ctx.MDWorld; }
async function progress() {
  const store = new Map(), window = {};
  const ctx = { window, Date, Math, JSON, Object, Array, Set, String, Number, setTimeout: () => 0, clearTimeout() {}, crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) }, fetch: async () => { throw new Error('offline'); }, document: {} };
  vm.createContext(ctx); vm.runInContext(await read('public/progress.js'), ctx); return window.MDProgress;
}

test('registre : Césarée jouable, sites suivants prévus, fichiers présents', async () => {
  const play = REG.sites.filter(s => s.status === 'playable');
  assert.deepEqual(play.map(s => s.id), ['caesarea']);
  for (const id of ['jerusalem-second-temple', 'jerusalem-byzantine', 'beit-shean', 'masada', 'tzippori']) assert.ok(REG.sites.some(s => s.id === id && s.status === 'planned'), id);
  for (const s of play) assert.ok(await exists(`public/world3d/sites/${s.id}.json`), s.id);
  assert.ok(await exists('public/world3d/sites/caesarea-theatre.js'));
  assert.ok(await exists('public/vendor/three-mesh-bvh/LICENSE'));
});

test('Césarée : données valides, 3 langues, sources pour chaque élément non moderne, hypothèses signalées', async () => {
  const W = await lib();
  assert.deepEqual([...W.validate(SITE)], []);
  assert.deepEqual(SITE.periods.map(p => p.id).sort(), ['ancient', 'present']);
  // l'état actuel n'est PAS présenté comme un scan
  assert.match(SITE.periods.find(p => p.id === 'present').reliabilityNote.fr, /pas un scan/);
  // les valeurs non publiées en accès libre sont marquées hypothétiques
  for (const k of ['rows', 'stage', 'scaenaeFronsHeight']) assert.equal(SITE.dimensions[k].certainty, 'hypothetical', k);
  assert.equal(SITE.dimensions.caveaDiameter.value, 90); assert.equal(SITE.dimensions.caveaDiameter.alt, 100);
  assert.equal(W.element(SITE, 'scaenaeFrons').certainty, 'hypothetical');
  // époque unique pour la reconstruction : pas de marbre impérial dans l'Antiquité (sauf l'erreur volontaire)
  assert.equal(W.element(SITE, 'errMarble').certainty, 'error');
  assert.ok(SITE.elements.filter(e => e.certainty === 'error').every(e => e.mission === 'errors' && e.eras.length === 1));
});

test('sélection : l\'étiquette d\'un maillage donne l\'élément le plus précis de l\'époque affichée', async () => {
  const W = await lib();
  assert.equal(W.elementForTag(SITE, 'imaCavea', 'ancient').id, 'ima');
  assert.equal(W.elementForTag(SITE, 'summaPresent', 'present').id, 'upperModern');
  assert.equal(W.elementForTag(SITE, 'modernStage', 'present').id, 'modernStage');
  assert.equal(W.elementForTag(SITE, 'errGothic', 'ancient'), null, 'erreurs invisibles hors mission');
  assert.equal(W.elementForTag(SITE, 'errGothic', 'ancient', { errors: true }).id, 'errGothic');
});

test('missions : identification, erreurs (fautes comptées), comparaison, chronologie, examen', async () => {
  const W = await lib(), el = id => W.element(SITE, id);
  const a = W.startMission(SITE, 'identify');
  assert.equal(W.pick(SITE, a, el('ima')).status, 'found');
  assert.equal(W.pick(SITE, a, el('summa')).status, 'already');
  W.pick(SITE, a, el('orchestra')); assert.equal(a.done, false); W.pick(SITE, a, el('pulpitum')); assert.equal(a.done, true);
  const e = W.startMission(SITE, 'errors');
  assert.equal(W.pick(SITE, e, el('scaenaeFrons')).status, 'miss'); ['errGothic', 'errMarble', 'errTower'].forEach(id => W.pick(SITE, e, el(id)));
  assert.ok(e.done); assert.equal(e.misses, 1);
  const c = W.startMission(SITE, 'compare'); ['scaenaeFrons', 'proscaenium', 'summa', 'modernStage', 'lightTowers'].forEach(id => W.pick(SITE, c, el(id))); assert.equal(c.done, false); W.pick(SITE, c, el('upperModern')); assert.ok(c.done);
  const h = W.startMission(SITE, 'chronology'); const m = W.mission(SITE, 'chronology');
  m.items.forEach((it, i) => { assert.equal(W.chronoItem(SITE, h).element, it.element); W.answerChrono(SITE, h, i === 0 ? 'modern' : it.answer); });
  assert.ok(h.done); assert.equal(h.answers.filter(x => x.ok).length, m.items.length - 1);
  assert.equal(W.scoreOpen(4, 5).ok, true); assert.equal(W.scoreOpen(3, 5).ok, false);
});

test('progression : résultat de mission enregistré par MDProgress.saveArch et compté dans le total', async () => {
  const W = await lib(), P = await progress();
  const s = W.startMission(SITE, 'identify'); ['ima', 'orchestra', 'pulpitum'].forEach(id => W.pick(SITE, s, W.element(SITE, id)));
  const r = P.saveArch(W.missionResult(SITE, s, 'run-1'));
  assert.equal(r.saved, true); assert.ok(r.gained > 0); assert.equal(P.totals().points, r.points);
  const x = W.startMission(SITE, 'exam'); x.answers.push({ id: 'A-caesarea-01', ok: true, points: 290 });
  assert.equal(P.saveArch(W.missionResult(SITE, x, 'run-2')).saved, true);
  assert.ok(P.archStats().known.includes('A-caesarea-01'));
});

test('qualité graphique : auto selon l\'appareil, baisse si moins de 28 i/s mesurées', async () => {
  const W = await lib();
  assert.equal(W.autoQuality({ mobile: true, cores: 8, memory: 8 }), 'medium');
  assert.equal(W.autoQuality({ mobile: true, cores: 4, memory: 3 }), 'low');
  assert.equal(W.autoQuality({ mobile: false, cores: 12 }), 'high');
  assert.equal(W.adapt('high', 20), 'medium'); assert.equal(W.adapt('medium', 40), 'medium');
  assert.ok(W.QUALITY.low.dpr <= 1 && !W.QUALITY.low.shadows);
});

test('textures : uniquement CC0 de Poly Haven, provenance enregistrée', async () => {
  const m = JSON.parse(await read('public/world3d/textures/manifest.json'));
  assert.match(m.license, /CC0/);
  for (const [k, s] of Object.entries(m.slots)) { assert.match(s.page, /^https:\/\/polyhaven\.com\/a\//, k); assert.ok(s.authors.length, k); }
});
