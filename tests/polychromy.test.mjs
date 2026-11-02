// « צבעים מקוריים » : la palette est complète, sourcée, et ne vise que des éléments qui existent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const P = new URL('../public/', import.meta.url);
const J = f => JSON.parse(readFileSync(new URL(f, P), 'utf8'));
const pal = J('polychromy.json');
const CERT = new Set(['attested', 'typical', 'hypothesis']);
const PATTERNS = new Set(['veined', 'banded', 'speckled', 'panels', 'mosaic', 'sectile', 'stripes']);

test('chaque couleur a nom, matériau, note, certitude et au moins une source (hébreu + français)', () => {
  for (const [id, e] of Object.entries(pal.entries)) {
    for (const k of ['name_he', 'name_fr', 'material_he', 'material_fr', 'note_he', 'note_fr']) assert.ok(e[k] && e[k].trim(), `${id}.${k}`);
    assert.ok(CERT.has(e.certainty), `${id} certitude ${e.certainty}`);
    assert.ok(Array.isArray(e.sources) && e.sources.length && e.sources.every(s => s.ref), `${id} sources`);
    assert.ok(e.colors.length && e.colors.every(c => /^#[0-9a-f]{6}$/i.test(c)), `${id} couleurs`);
    if (e.pattern) assert.ok(PATTERNS.has(e.pattern), `${id} motif ${e.pattern}`);
    assert.match(e.name_he, /[֐-׿]/, `${id} nom hébreu`);
  }
});

test('les tables ne pointent que vers des entrées existantes', () => {
  for (const [map, t] of Object.entries(pal.maps)) for (const [k, v] of Object.entries(t)) assert.ok(v === null || pal.entries[v], `${map}:${k} → ${v}`);
});

test('architecture : chaque clé vise une maquette et une étiquette réelles', () => {
  const D = J('architecture/data.json'), scenes = new Map(D.scenes.map(s => [s.id, new Set(s.parts.map(p => p.t))]));
  for (const k of Object.keys(pal.maps.architecture)) {
    const [sid, tag] = k.split(':'); assert.ok(scenes.has(sid), `maquette ${sid}`); assert.ok(scenes.get(sid).has(tag), `étiquette ${k}`);
  }
});

test('Césarée 3D : étiquettes réelles, jamais les erreurs volontaires', () => {
  const site = J('world3d/sites/caesarea.json'), tags = new Set(site.elements.flatMap(e => e.tags));
  for (const k of Object.keys(pal.maps.world3d)) { const tag = k.split(':')[1]; assert.ok(tags.has(tag), k); assert.ok(!tag.startsWith('err'), k); }
});

test('sites et Jérusalem : monuments réels', () => {
  const ids = new Set(J('jerusalem3d/monuments.json').monuments.map(m => m.id));
  for (const k of Object.keys(pal.maps.jerusalem)) { const id = k.split(':')[1]; if (id.startsWith('jerusalem_')) assert.ok(ids.has(id), k); }
  for (const k of Object.keys(pal.maps.sites)) {
    const [site, id] = k.split(':'); if (site === 'kind' || !/_/.test(id || '')) continue;
    const mons = new Set(J(`sites3d/${site}/site.json`).monuments.map(m => m.id)); assert.ok(mons.has(id), k);
  }
});

test('« attesté » seulement avec une source précise (pas une pratique générale)', () => {
  for (const [id, e] of Object.entries(pal.entries)) if (e.certainty === 'attested') assert.ok(!e.sources.every(s => /pratique|practice/i.test(s.ref)), id);
});
