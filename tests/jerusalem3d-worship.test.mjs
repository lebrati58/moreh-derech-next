// Jérusalem 3D : lieux de culte et portes d'OpenStreetMap (période « aujourd'hui »).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const F = new URL('../public/jerusalem3d/worship.json', import.meta.url);

test('worship.json : lieux nommés, typés, dans la zone, sans doublon', { skip: !existsSync(F) && 'pas encore construit (workflow jerusalem3d-worship.yml)' }, () => {
  const d = JSON.parse(readFileSync(F, 'utf8'));
  assert.match(d.license, /OpenStreetMap/);
  assert.ok(d.counts.church >= 10 && d.counts.mosque >= 3 && d.counts.synagogue >= 3, JSON.stringify(d.counts));
  const ids = new Set();
  for (const p of d.places) {
    assert.ok(['church', 'mosque', 'synagogue', 'gate'].includes(p.k), p.id);
    assert.ok(p.n.he || p.n.en || p.n.name, p.id + ' : nom');
    assert.ok(p.lat >= d.box.s && p.lat <= d.box.n && p.lon >= d.box.w && p.lon <= d.box.e, p.id + ' : dans la zone');
    assert.ok(!ids.has(p.id), p.id); ids.add(p.id);
  }
});

test('page : barre ⛪🕌🕍🚪, chargement de worship.json, période « aujourd’hui » seulement, cache hors ligne', () => {
  const app = readFileSync(new URL('../public/jerusalem3d/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/jerusalem3d.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="poiBar"'));
  assert.ok(app.includes("fetch('jerusalem3d/worship.json'"));
  assert.ok(/function poiShown\(\) \{ return POI && period === 12/.test(app), 'uniquement à la période 12');
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./jerusalem3d/worship.json'"));
});
