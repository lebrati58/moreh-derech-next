// Construit public/jerusalem3d/buildings.json : emprises des bâtiments ACTUELS (OpenStreetMap, ODbL) de la Vieille Ville
// et des abords, pour donner du contexte à la scène 3D (« la ville d'aujourd'hui »). Ce ne sont PAS des bâtiments anciens.
// Exécuté au déploiement (.github/workflows/pages.yml). En cas d'échec, la page fonctionne sans ce fichier.
// Format compact : origine (lat0, lon0) ; chaque bâtiment = [hauteur_m, dx1, dy1, dx2, dy2, …] en micro-degrés relatifs.
import { writeFile, mkdir } from 'node:fs/promises';
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BOX = { s: 31.7680, n: 31.7840, w: 35.2240, e: 35.2400 };
const q = `[out:json][timeout:120];way["building"](${BOX.s},${BOX.w},${BOX.n},${BOX.e});out geom tags;`;
let j = null;
for (let round = 0; round < 4 && !j; round++) for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  try {
    const r = await fetch(ep + '?data=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) { console.log('HTTP', r.status, ep); await sleep(5000); continue; }
    const t = await r.json(); if ((t.elements || []).length) { j = t; console.log('OK', ep, t.elements.length); break; }
  } catch (e) { console.log(ep, e.message); await sleep(5000); }
}
if (!j) { console.log('::notice title=buildings::indisponibles — la page fonctionnera sans'); process.exit(0); }
const lat0 = (BOX.s + BOX.n) / 2, lon0 = (BOX.w + BOX.e) / 2, out = [];
for (const el of j.elements) {
  if (!el.geometry || el.geometry.length < 4) continue;
  const t = el.tags || {};
  if (/^(roof|construction|ruins)$/.test(t.building)) continue;
  let h = parseFloat(t.height); if (!(h > 0)) { const lv = parseFloat(t['building:levels']); h = lv > 0 ? lv * 3.2 : 7; }
  h = Math.min(60, Math.round(h * 10) / 10);
  const pts = [h]; el.geometry.slice(0, -1).forEach(g => pts.push(Math.round((g.lat - lat0) * 1e6), Math.round((g.lon - lon0) * 1e6)));
  out.push(pts);
}
await mkdir(new URL('../public/jerusalem3d/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/jerusalem3d/buildings.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), license: '© OpenStreetMap contributors, ODbL', note: 'Bâtiments actuels — contexte, pas une reconstitution.', lat0, lon0, b: out }));
console.log('::notice title=buildings::buildings.json ' + out.length + ' bâtiments');
