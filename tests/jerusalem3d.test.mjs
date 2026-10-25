// Jérusalem 3D : fiabilité des fiches, phase 2 verrouillée, géographie non saisie à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const LANGS = ['he', 'fr', 'en', 'ru'];

test('phase 2 locked: 3D quizzes disabled and hidden', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  assert.equal(d.quiz3dEnabled, false, 'quiz3dEnabled doit rester false sans accord explicite');
  const app = await read('public/jerusalem3d/app.js');
  assert.match(app, /quiz3dEnabled === true/);
  assert.doesNotMatch(app, /חידון|startQuiz/);
});

test('every monument is sourced, translated and classified', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  assert.equal(d.periods.length, 11);
  const ids = new Set();
  for (const m of d.monuments) {
    assert.match(m.id, /^jerusalem_[a-z0-9_]+$/, m.id);
    assert.ok(!ids.has(m.id), 'identifiant en double ' + m.id); ids.add(m.id);
    assert.ok(['attested', 'reconstruction', 'hypothesis'].includes(m.certainty), m.id);
    assert.ok(m.from >= 1 && m.to <= 11 && m.from <= m.to, m.id + ' période');
    for (const k of ['name', 'text']) for (const l of LANGS) assert.ok(m[k] && m[k][l] && m[k][l].length > 1, `${m.id}.${k}.${l}`);
    for (const k of ['dims', 'remains', 'debate', 'otherView', 'placementNote']) if (m[k]) for (const l of LANGS) assert.ok(m[k][l], `${m.id}.${k}.${l}`);
    assert.ok(m.sources.length >= 1, m.id + ' sans source');
    m.sources.forEach(s => { assert.ok(['drive', 'primary', 'online'].includes(s.kind)); assert.match(s.url, /^https:\/\//); });
    // Une hypothèse ne reçoit que des questions de type « archéologie » (phase 2).
    if (m.certainty === 'hypothesis' && m.quiz3d) assert.equal(m.quiz3d.type, 'archaeology', m.id);
  }
  const drive = d.monuments.filter(m => m.sources.some(s => s.kind === 'drive')).length;
  assert.ok(drive / d.monuments.length >= 0.85, 'le Drive doit être la source principale (seules les portes ottomanes, simples repères, n’ont pas de document de cours)  (' + drive + '/' + d.monuments.length + ')');
});

test('positions come from Wikidata anchors or OpenStreetMap, never typed by hand', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  const anchors = JSON.parse(await read('tools/jerusalem3d-anchors.json')).anchors;
  for (const m of d.monuments) if (m.anchor) assert.ok(anchors[m.anchor], m.id + ' : repère inconnu ' + m.anchor);
  assert.doesNotMatch(JSON.stringify(d.monuments), /"lat"|"lon"/);
  const geo = JSON.parse(await read('public/jerusalem3d/geo.json'));
  assert.match(geo.method, /Wikip/); assert.match(geo.license, /OpenStreetMap/);
  assert.ok(geo.shapes.some(s => s.name === 'Temple Mount'), 'contour du mont du Temple');
  assert.ok(geo.shapes.filter(s => s.kind === 'wall').length >= 5, 'murailles OSM');
  assert.equal(geo.dem.heights.length, geo.dem.rows * geo.dem.cols);
});

test('entry points and offline cache', async () => {
  const map = await read('public/map.html');
  assert.match(map, /jerusalem3d\.html\?period=/);
  const sw = await read('public/sw.js');
  for (const f of ['jerusalem3d.html', 'jerusalem3d/app.js', 'jerusalem3d/monuments.json', 'jerusalem3d/geo.json', 'vendor/three/three.module.min.js']) assert.ok(sw.includes("'./" + f + "'"), f);
  const html = await read('public/jerusalem3d.html');
  assert.match(html, /"three":"\.\/vendor\/three\/three\.module\.min\.js"/);
});
