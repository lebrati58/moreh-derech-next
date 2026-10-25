// Construit public/jerusalem3d/geo.json : la géographie RÉELLE de la scène 3D de Jérusalem.
// Rien n'est saisi à la main :
//   1. coordonnées des repères (portes, monuments) : API Wikipédia (prop=coordinates = Wikidata P625) ;
//   2. tracés actuels (murailles ottomanes, esplanade du mont du Temple, quelques bâtiments) : OpenStreetMap (Overpass, ODbL) ;
//   3. relief : modèle numérique de terrain SRTM 30 m (OpenTopoData), sinon Copernicus GLO-90 (Open-Meteo).
// Usage : node tools/build-jerusalem3d.mjs   (Internet requis ; exécuté par .github/workflows/jerusalem3d.yml)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BOX = { s: 31.7650, n: 31.7920, w: 35.2190, e: 35.2440 }; // jusqu'au tracé nord de la 3e muraille
const log = (...a) => console.log(...a);

async function getJSON(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.ok) return await r.json();
      log('  HTTP', r.status, url.slice(0, 90));
    } catch (e) { log('  erreur', e.message); }
    await sleep(2000 * (i + 1));
  }
  throw new Error('échec ' + url.slice(0, 120));
}

// 1. Repères Wikipédia
async function wikiCoord(cand) {
  const lang = cand.slice(0, 2), title = cand.slice(3);
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'coordinates|pageprops|info', inprop: 'url', ppprop: 'wikibase_item', titles: title });
  const j = await getJSON(url);
  const p = j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || p.invalid) return null;
  const c = (p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0];
  if (!c) return { title: p.title, url: p.fullurl, qid: p.pageprops && p.pageprops.wikibase_item, coord: null };
  return { title: p.title, url: p.fullurl, qid: p.pageprops && p.pageprops.wikibase_item, coord: { lat: c.lat, lon: c.lon } };
}

const sources = JSON.parse(await readFile(new URL('tools/jerusalem3d-anchors.json', ROOT), 'utf8'));
const anchors = {}, missing = [];
for (const [id, cands] of Object.entries(sources.anchors)) {
  let hit = null;
  for (const cand of cands) {
    const r = await wikiCoord(cand); await sleep(200);
    if (r && r.coord) {
      const { lat, lon } = r.coord;
      if (lat < BOX.s || lat > BOX.n || lon < BOX.w || lon > BOX.e) { log('  hors cadre', id, cand, lat, lon); continue; }
      hit = { lat, lon, wiki: { lang: cand.slice(0, 2), title: r.title, url: r.url }, qid: r.qid || null }; break;
    }
  }
  if (hit) { anchors[id] = hit; log('✓', id, hit.lat.toFixed(5), hit.lon.toFixed(5), hit.wiki.title); }
  else { missing.push(id); log('✗', id, '(aucune coordonnée fiable)'); }
}

// 2. Tracés OpenStreetMap
const bb = `${BOX.s},${BOX.w},${BOX.n},${BOX.e}`;
const q = `[out:json][timeout:90];(
way["historic"="citywalls"](${bb});
way["barrier"="city_wall"](${bb});
way["name:en"~"^(Temple Mount|Dome of the Rock|Church of the Holy Sepulchre|Al-Aqsa Mosque|Tower of David)$"](${bb});
relation["name:en"~"^(Temple Mount|Church of the Holy Sepulchre|Al-Aqsa Mosque|Tower of David)$"](${bb});
way["name:he"~"הר הבית"](${bb});
relation["name:he"~"הר הבית"](${bb});
way["name:en"~"Temple Mount|Haram|Noble Sanctuary|Al-Aqsa compound",i](${bb});
relation["name:en"~"Temple Mount|Haram|Noble Sanctuary|Al-Aqsa compound",i](${bb});
way["landuse"="religious"](${bb});
relation["landuse"="religious"](${bb});
way["historic"="archaeological_site"]["name:en"~"Temple",i](${bb});
);out geom tags;`;
let osm = null;
for (let round = 0; round < 4 && !(osm && (osm.elements || []).length); round++) for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  if (osm && (osm.elements || []).length) break;
  try {
    const r = await fetch(ep + '?data=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const txt = await r.text();
    if (!r.ok) { log('Overpass', ep, 'HTTP', r.status, txt.slice(0, 120).replace(/\s+/g, ' ')); continue; }
    osm = JSON.parse(txt); log('Overpass', ep, 'OK', (osm.elements || []).length, 'éléments');
  } catch (e) { log('Overpass', ep, e.message); }
  await sleep(5000);
}
if (!(osm && (osm.elements || []).length)) throw new Error('Overpass : aucun élément — on arrête pour ne pas publier des tracés vides');
// Zones qui CONTIENNENT le Dôme du Rocher (l'esplanade du mont du Temple y figure si elle est cartographiée).
{
  const qi = '[out:json][timeout:60];is_in(31.77806,35.23528)->.a;(way(pivot.a);relation(pivot.a););out geom tags;';
  let done = false;
  for (let round = 0; round < 3 && !done; round++) for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(ep + '?data=' + encodeURIComponent(qi), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) { log('ENCL HTTP', r.status, ep); await sleep(4000); continue; }
      const j = await r.json();
      (j.elements || []).forEach(e => { e._enclosing = true; (osm = osm || { elements: [] }).elements.push(e); log('ENCL', e.type + '/' + e.id, (e.tags && (e.tags['name:en'] || e.tags.name)) || '', JSON.stringify(e.tags || {}).slice(0, 140)); });
      done = true; break;
    } catch (e) { log('ENCL erreur', ep, e.message); }
  }
}
const round = v => Math.round(v * 1e6) / 1e6;
const shapes = [];
for (const el of (osm && osm.elements) || []) {
  const t = el.tags || {};
  const kind = (t.historic === 'citywalls' || t.barrier === 'city_wall') ? 'wall' : 'outline';
  let name = t['name:en'] || t.name || '';
  if (/הר הבית/.test(t['name:he'] || '') || /Temple Mount|Haram|Noble Sanctuary/i.test(t['name:en'] || '')) name = 'Temple Mount';
  if (el._enclosing) {
    const g = el.type === 'way' ? el.geometry : ((el.members || []).find(m => m.geometry && (m.role === 'outer' || m.role === '')) || {}).geometry;
    if (!g) continue;
    const la = g.map(p => p.lat), lo = g.map(p => p.lon), ns = (Math.max(...la) - Math.min(...la)) * 110574, ew = (Math.max(...lo) - Math.min(...lo)) * 94600;
    log('ENCL taille', el.type + '/' + el.id, Math.round(ns), 'x', Math.round(ew));
    if (ns < 250 || ns > 650 || ew < 200 || ew > 450) continue; // seule une zone de la taille de l'esplanade est retenue
    name = 'Temple Mount';
  }
  if (el.type === 'way' && el.geometry) shapes.push({ kind, name, osm: 'way/' + el.id, pts: el.geometry.map(g => [round(g.lat), round(g.lon)]) });
  if (el.type === 'relation' && el.members) el.members.filter(m => (m.role === 'outer' || m.role === '') && m.type === 'way' && m.geometry).forEach(m =>
    shapes.push({ kind, name, osm: 'relation/' + el.id, pts: m.geometry.map(g => [round(g.lat), round(g.lon)]) }));
}
(osm && osm.elements || []).filter(e => !(e.tags && (e.tags.historic === 'citywalls' || e.tags.barrier === 'city_wall'))).forEach(e => log('OSMEL', e.type + '/' + e.id, (e.tags && (e.tags['name:en'] || e.tags.name)) || '', (e.tags && (e.tags.landuse || e.tags.amenity || e.tags.building || e.tags.historic)) || ''));
log('OSM :', shapes.filter(s => s.kind === 'wall').length, 'segments de muraille,', shapes.filter(s => s.kind === 'outline').length, 'contours');

// 3. Relief
const STEP_LAT = 0.00036, STEP_LON = 0.00042; // ≈ 40 m
const rows = Math.round((BOX.n - BOX.s) / STEP_LAT) + 1, cols = Math.round((BOX.e - BOX.w) / STEP_LON) + 1;
const pts = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push([BOX.n - r * STEP_LAT, BOX.w + c * STEP_LON]);
let heights = [], demSource = null;
try {
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const j = await getJSON('https://api.opentopodata.org/v1/srtm30m?locations=' + chunk.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join('|'));
    j.results.forEach(x => heights.push(x.elevation == null ? null : Math.round(x.elevation * 10) / 10));
    await sleep(1100);
  }
  demSource = 'SRTM 30 m (NASA), via OpenTopoData';
} catch (e) {
  log('OpenTopoData indisponible, repli Open-Meteo :', e.message); heights = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const j = await getJSON('https://api.open-meteo.com/v1/elevation?latitude=' + chunk.map(p => p[0].toFixed(5)).join(',') + '&longitude=' + chunk.map(p => p[1].toFixed(5)).join(','));
    j.elevation.forEach(h => heights.push(Math.round(h * 10) / 10));
    await sleep(400);
  }
  demSource = 'Copernicus GLO-90 (ESA), via Open-Meteo';
}
log('Relief :', rows, '×', cols, 'points —', demSource);

const out = {
  generatedAt: new Date().toISOString(),
  method: 'Repères : API Wikipédia (Wikidata P625). Tracés actuels : OpenStreetMap. Relief : ' + demSource + '. Aucune coordonnée saisie à la main.',
  license: 'Wikidata CC0 · OpenStreetMap © contributeurs, ODbL · ' + demSource,
  box: BOX,
  anchors, missing,
  shapes,
  dem: { source: demSource, north: BOX.n, west: BOX.w, stepLat: STEP_LAT, stepLon: STEP_LON, rows, cols, heights }
};
await mkdir(new URL('public/jerusalem3d/', ROOT), { recursive: true });
await writeFile(new URL('public/jerusalem3d/geo.json', ROOT), JSON.stringify(out));
log('\nÉcrit public/jerusalem3d/geo.json —', Object.keys(anchors).length, 'repères,', missing.length, 'manquants :', missing.join(', '));
