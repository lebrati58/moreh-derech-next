// Parcours V4 construit à partir des données d'exemple (moteur réel, sans réseau) — partagé par les tests.
import { readFileSync } from 'node:fs';
import { GEOM, PLACES, REF_LABELS } from './v4-fixtures.mjs';
const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const umd = p => { const m = { exports: {} }; new Function('module', 'self', file(p))(m, {}); return m.exports; };
export function umdBuild() {
  const G = umd('public/gps-engine.js'), A = umd('public/auto-engine.js');
  return A.build({ G, geometry: GEOM, from: { name: 'זכרון יעקב', point: GEOM[0] }, to: { name: 'יקנעם', point: GEOM[GEOM.length - 1] },
    durationSec: 1200, places: PLACES, refs: REF_LABELS });
}
