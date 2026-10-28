// Frise de la carte d'Israël : résout chaque événement de tools/israel-timeline.src.json vers une position DÉJÀ
// vérifiée du dépôt (places.json, sites3d/<site>/geo.json, jerusalem3d/geo.json) et écrit public/israel-timeline.json.
// Aucune coordonnée n'est saisie à la main. Usage : node tools/build-israel-timeline.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';

const pub = p => JSON.parse(readFileSync(new URL('../public/' + p, import.meta.url), 'utf8'));
export function resolve(at) {
  const [kind, a, ...rest] = at.split(':'), b = rest.join(':');
  if (kind === 'stop') {
    const s = (pub('places.json').tours[a]?.stops || []).find(x => x.name === b && x.placed);
    return s && { lat: s.lat, lon: s.lon, qid: s.qid || null, from: `places.json · סיור ${a} · ${b}` };
  }
  if (kind === 'site') { const g = pub(`sites3d/${a}/geo.json`).anchors[b]; return g && { lat: g.lat, lon: g.lon, qid: g.qid || null, from: `sites3d/${a}/geo.json · ${b}` }; }
  if (kind === 'j3d') { const g = pub('jerusalem3d/geo.json').anchors[a]; return g && { lat: g.lat, lon: g.lon, qid: g.qid || null, from: `jerusalem3d/geo.json · ${a}` }; }
  return null;
}
export function build() {
  const src = JSON.parse(readFileSync(new URL('./israel-timeline.src.json', import.meta.url), 'utf8'));
  const events = src.events.map(e => { const p = resolve(e.at); if (!p) throw new Error(`${e.id} : lieu introuvable ${e.at}`); return { ...e, ...p }; })
    .sort((x, y) => x.year - y.year);
  return { generatedAt: 'tools/build-israel-timeline.mjs', note: 'Positions reprises de places.json / sites3d / jerusalem3d (Wikidata, Wikipédia, OpenStreetMap) — aucune saisie à la main.', events };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = JSON.stringify(build(), null, 1) + '\n', f = new URL('../public/israel-timeline.json', import.meta.url);
  if (process.argv.includes('--check')) { const same = readFileSync(f, 'utf8') === out; console.log(same ? 'à jour' : 'À REGÉNÉRER'); process.exit(same ? 0 : 1); }
  writeFileSync(f, out); console.log(JSON.parse(out).events.length + ' événements');
}
