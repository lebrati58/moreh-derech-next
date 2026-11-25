// Construit public/jerusalem3d/worship.json : églises, mosquées, synagogues et portes de la Vieille Ville et des abords,
// tels que cartographiés dans OpenStreetMap (ODbL) — bâtiments ACTUELS, affichés à la période « aujourd'hui ».
// Les 3 grands édifices et les 8 portes déjà modélisés dans la 3D (monuments.json) ne sont pas dupliqués.
// Usage : node tools/build-jerusalem3d-worship.mjs   (Internet ; exécuté par .github/workflows/jerusalem3d-worship.yml)
import { readFile, writeFile } from 'node:fs/promises';
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Vieille Ville, mont Sion, Cité de David, Kidron et bas du mont des Oliviers
const BOX = { s: 31.7690, n: 31.7855, w: 35.2245, e: 35.2425 };
const b = `${BOX.s},${BOX.w},${BOX.n},${BOX.e}`;
const q = `[out:json][timeout:90];(nwr["amenity"="place_of_worship"](${b});nwr["building"~"^(church|cathedral|chapel|mosque|synagogue)$"](${b});nwr["historic"="city_gate"](${b});nwr["barrier"="city_wall"]["gate"](${b}););out center tags;`;
let j = null;
for (let round = 0; round < 4 && !j; round++) for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  try {
    const r = await fetch(ep, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    if (!r.ok) { console.log('HTTP', r.status, ep); await sleep(5000); continue; }
    const t = await r.json(); if ((t.elements || []).length) { j = t; console.log('OK', ep, t.elements.length); break; }
  } catch (e) { console.log(ep, e.message); await sleep(5000); }
}
if (!j) { console.error('Overpass indisponible'); process.exit(1); }

const GEO = JSON.parse(await readFile(new URL('../public/jerusalem3d/geo.json', import.meta.url), 'utf8'));
const M = JSON.parse(await readFile(new URL('../public/jerusalem3d/monuments.json', import.meta.url), 'utf8'));
const dist = (a, b2) => Math.hypot((a[0] - b2[0]) * 110574, (a[1] - b2[1]) * 94650);
const anchorLL = id => { const a = GEO.anchors[id]; return a ? [a.lat, a.lon] : null; };
// déjà dans la 3D : grands édifices (par repère) et portes ottomanes (fiches de type « gate »)
const BIG = ['dome_of_the_rock', 'al_aqsa', 'holy_sepulchre'].map(anchorLL).filter(Boolean);
const GATES = M.monuments.filter(m => m.shape && m.shape.type === 'gate' && m.anchor).map(m => anchorLL(m.anchor)).filter(Boolean);

const kindOf = t => {
  if (t.historic === 'city_gate' || (t.barrier === 'city_wall' && t.gate)) return 'gate';
  const r = t.religion, bl = t.building;
  if (r === 'christian' || /^(church|cathedral|chapel)$/.test(bl)) return 'church';
  if (r === 'muslim' || bl === 'mosque') return 'mosque';
  if (r === 'jewish' || bl === 'synagogue') return 'synagogue';
  return null;
};
const seen = new Map(), out = [], skipped = { noname: 0, dup: 0, big: 0, other: 0 };
for (const el of j.elements) {
  const t = el.tags || {}, k = kindOf(t);
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (!k || lat == null) { skipped.other++; continue; }
  const nm = { he: t['name:he'] || '', en: t['name:en'] || '', fr: t['name:fr'] || '', ru: t['name:ru'] || '', ar: t['name:ar'] || '', name: t.name || '' };
  if (!nm.he && !nm.en && !nm.name) { skipped.noname++; continue; }
  if (k !== 'gate' && BIG.some(a => dist(a, [lat, lon]) < 45)) { skipped.big++; continue; }
  if (k === 'gate' && GATES.some(a => dist(a, [lat, lon]) < 40)) { skipped.big++; continue; }
  // même lieu décrit deux fois (bâtiment + point) : on garde la version la plus complète
  const key = k + ':' + (t.wikidata || (nm.he || nm.en || nm.name).toLowerCase());
  const prev = seen.get(key);
  if (prev && dist([prev.lat, prev.lon], [lat, lon]) < 80) { skipped.dup++; continue; }
  const o = { id: el.type[0] + el.id, k, lat: +lat.toFixed(6), lon: +lon.toFixed(6), n: Object.fromEntries(Object.entries(nm).filter(([, v]) => v)) };
  if (t.denomination) o.denom = t.denomination;
  if (t.wikidata) o.wd = t.wikidata;
  if (t.wikipedia) o.wp = t.wikipedia;
  seen.set(key, o); out.push(o);
}
out.sort((a, b2) => a.k.localeCompare(b2.k) || (a.n.he || a.n.name || a.n.en).localeCompare(b2.n.he || b2.n.name || b2.n.en, 'he'));
const count = k => out.filter(o => o.k === k).length;
await writeFile(new URL('../public/jerusalem3d/worship.json', import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(), license: '© OpenStreetMap contributors, ODbL', box: BOX,
  note: 'Lieux de culte et portes ACTUELS d’OpenStreetMap ; la date de construction n’est pas connue ici : affichés à la période « aujourd’hui ».',
  counts: { church: count('church'), mosque: count('mosque'), synagogue: count('synagogue'), gate: count('gate') }, places: out
}, null, 1) + '\n');
console.log('églises', count('church'), '· mosquées', count('mosque'), '· synagogues', count('synagogue'), '· portes', count('gate'), '· écartés', JSON.stringify(skipped));
