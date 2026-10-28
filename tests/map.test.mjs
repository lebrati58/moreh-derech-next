// Données de la carte et de la banque סיורים — sans base de données. node --test tests/map.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const json = f => JSON.parse(read(f));
const catalog = json('siyurim-catalog.json'), places = json('places.json'), quiz = json('guided-quiz.json');

test('places.json couvre chaque étape du catalogue, sans étape en trop', () => {
  for (const t of catalog.tours) {
    const p = places.tours[t.id];
    assert.ok(p, 'סיור manquant : ' + t.id);
    assert.deepEqual(p.stops.map(s => s.name), t.stops, 'étapes différentes pour ' + t.id);
    assert.ok(places.regions[p.region], 'région inconnue pour ' + t.id);
    for (const th of p.themes) assert.ok(places.themes[th], `thème inconnu ${th} (${t.id})`);
  }
});

test('chaque point placé a une source vérifiable et se trouve dans le cadre Israël', () => {
  let placed = 0;
  for (const [id, t] of Object.entries(places.tours)) for (const s of t.stops) {
    if (!s.placed) { assert.ok(s.reason, `raison manquante : ${id}/${s.name}`); continue; }
    placed++;
    assert.ok(s.lat > 29.4 && s.lat < 33.45 && s.lon > 34.2 && s.lon < 35.95, `hors cadre : ${id}/${s.name}`);
    assert.match(s.wiki.url, /^https:\/\/(en|he)\.wikipedia\.org\//, `source : ${id}/${s.name}`);
    assert.match(s.qid || '', /^Q\d+$/, `Wikidata : ${id}/${s.name}`);
  }
  assert.equal(placed, places.stats.placed);
});

test('chaque question appartient à un סיור connu et est jouable', () => {
  const ids = new Set([...catalog.tours.map(t => t.id), 'road67']);
  const seen = new Set();
  for (const q of quiz.questions) {
    assert.ok(ids.has(q.tourId), `tourId invalide : ${q.id} → ${q.tourId}`);
    assert.ok(!seen.has(q.id), 'identifiant en double : ' + q.id); seen.add(q.id);
    assert.ok([1, 2, 3].includes(q.level), 'niveau : ' + q.id);
    assert.equal(q.options.length, 4, 'quatre réponses : ' + q.id);
    assert.equal(new Set(q.options).size, 4, 'réponses distinctes : ' + q.id);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, 'bonne réponse : ' + q.id);
    assert.ok(q.explanation && q.sourceUrl, 'explication et source : ' + q.id);
  }
  for (const t of catalog.tours) for (const l of [1, 2, 3])
    assert.ok(quiz.questions.some(q => q.tourId === t.id && q.level === l), `aucune question niveau ${l} pour ${t.id}`);
});

test('aucun total de questions codé en dur dans les pages', () => {
  const total = String(quiz.questions.length);
  for (const f of ['index.html', 'modes.html', 'map.html', 'guided-tour.html', 'tour-catalog.html'])
    for (const n of [total, '117', '183']) assert.ok(!new RegExp(`\\b${n}\\b`).test(read(f).replace(/<script src[^>]*>/g, '')), `${n} codé en dur dans ${f}`);
});

test('les pages de la carte sont dans le cache hors ligne', () => {
  const sw = read('sw.js');
  for (const f of ['map.html', 'places.json', 'tour-data.js', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.markercluster.js']) assert.ok(sw.includes("'./" + f + "'"), f);
});

test('quiz : la bonne réponse n’est pas devinable à sa longueur', () => {
  // Au hasard, la bonne réponse serait la plus longue dans ~25 % des cas. Avant correction : 71 %.
  const longest = q => q.options.every((o, i) => i === q.correct || o.length < q.options[q.correct].length);
  const byTour = {};
  for (const q of quiz.questions) {
    assert.equal(new Set(q.options).size, 4, q.id + ' : réponses en double');
    const t = (byTour[q.tourId] ||= { n: 0, l: 0 }); t.n++; if (longest(q)) t.l++;
  }
  const all = Object.values(byTour).reduce((s, t) => s + t.l, 0) / quiz.questions.length;
  assert.ok(all <= 0.3, 'total ' + Math.round(all * 100) + ' %');
  for (const [id, t] of Object.entries(byTour)) assert.ok(t.l / t.n <= 0.35, id + ' : ' + Math.round(100 * t.l / t.n) + ' %');
});

test('frise de la carte : chaque événement pointe sur un lieu déjà vérifié, 4 langues, ordre chronologique', async () => {
  const { build } = await import('../tools/build-israel-timeline.mjs');
  const { ERA_COLORS } = await import('../public/era-timeline.js');
  const file = json('israel-timeline.json'), fresh = build();
  assert.deepEqual(file, JSON.parse(JSON.stringify(fresh)), 'israel-timeline.json à regénérer (node tools/build-israel-timeline.mjs)');
  assert.ok(file.events.length >= 30);
  assert.equal(new Set(file.events.map(e => e.id)).size, file.events.length, 'identifiants uniques');
  file.events.forEach((e, i) => {
    if (i) assert.ok(e.year >= file.events[i - 1].year, 'ordre : ' + e.id);
    assert.ok(ERA_COLORS[e.era], e.id + ' : ère inconnue');
    assert.ok(['fact', 'tradition'].includes(e.kind), e.id);
    for (const l of ['he', 'fr', 'en', 'ru']) { assert.ok(e.title[l] && e.text[l] && e.more?.[l] && e.src?.[l], `${e.id} : ${l} manquant (titre, texte, détails, source)`); if (e.label) assert.ok(e.label[l], `${e.id} : date ${l}`); }
    assert.ok(e.lat > 29 && e.lat < 33.5 && e.lon > 34 && e.lon < 36, e.id + ' : hors d’Israël');
    assert.ok(/^(stop|site|j3d):/.test(e.at) && e.from, e.id + ' : position sans provenance');
  });
  assert.ok(file.events.some(e => e.id === 'masada_falls' && e.at === 'site:masada:masada'), 'Massada 73');
  const dg = file.events.find(e => e.id === 'david_goliath');
  assert.ok(dg && dg.kind === 'tradition' && dg.battle && /עזקה/.test(dg.text.he), 'David et Goliath : tradition, vallée d’Elah');
  assert.ok(file.events.find(e => e.id === 'gamla_falls').battle, 'Gamla est une bataille');
  assert.ok(file.events.filter(e => e.battle).length >= 25, 'au moins 25 batailles');
  // aucune coordonnée saisie à la main dans la source
  const src = readFileSync(new URL('../tools/israel-timeline.src.json', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /"lat"|"lon"/);
});
