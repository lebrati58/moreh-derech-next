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
