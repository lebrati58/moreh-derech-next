// Construit public/sites3d/<site>/geo.json : la géographie RÉELLE d'un site 3D (Massada, Césarée, Beit Shean…).
// Comme pour Jérusalem, rien n'est saisi à la main :
//   1. repères : API Wikipédia (coordonnées = Wikidata P625) ;
//   2. vestiges, rues, côte, brise-lames, aqueducs, chemins : OpenStreetMap (Overpass, ODbL) ;
//   3. relief : SRTM 30 m (OpenTopoData), sinon Copernicus GLO-90 (Open-Meteo).
// Usage : node tools/build-site3d.mjs masada   (Internet requis ; exécuté par .github/workflows/site3d.yml)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const SITE = process.argv[2];
const CFG = JSON.parse(await readFile(new URL('tools/site3d-sites.json', ROOT), 'utf8'))[SITE];
if (!CFG) throw new Error('site inconnu : ' + SITE);
const BOX = CFG.box;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

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

// 1. Repères Wikipédia / Wikidata
async function wikiCoord(cand) {
  const lang = cand.slice(0, 2), title = cand.slice(3);
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'coordinates|pageprops|info', inprop: 'url', ppprop: 'wikibase_item', titles: title });
  const j = await getJSON(url);
  const p = j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || p.invalid) return null;
  const c = (p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0];
  const qid = p.pageprops && p.pageprops.wikibase_item;
  if (c) return { title: p.title, url: p.fullurl, qid, coord: { lat: c.lat, lon: c.lon } };
  if (qid) {
    try {
      const w = await getJSON(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {}, 2), e = w.entities && w.entities[qid];
      const v = e && e.claims && e.claims.P625 && e.claims.P625[0].mainsnak.datavalue && e.claims.P625[0].mainsnak.datavalue.value;
      if (v) return { title: p.title, url: p.fullurl, qid, coord: { lat: v.latitude, lon: v.longitude } };
    } catch (err) { log('  Wikidata', qid, err.message); }
  }
  return null;
}
const anchors = {}, missing = [];
for (const [id, cands] of Object.entries(CFG.anchors)) {
  let hit = null;
  for (const cand of cands) {
    let r = null; try { r = await wikiCoord(cand); } catch (e) { log('  ', cand, e.message); } await sleep(200);
    if (r && r.coord) {
      const { lat, lon } = r.coord;
      if (lat < BOX.s || lat > BOX.n || lon < BOX.w || lon > BOX.e) { log('  hors cadre', id, cand, lat, lon); continue; }
      hit = { lat, lon, wiki: { lang: cand.slice(0, 2), title: r.title, url: r.url }, qid: r.qid || null }; break;
    }
  }
  if (hit) { anchors[id] = hit; log('ANCRE ✓', id, hit.lat.toFixed(5), hit.lon.toFixed(5), hit.wiki.title); }
  else { missing.push(id); log('ANCRE ✗', id); }
}

// 2. OpenStreetMap : tout ce qui est historique, en ruine, nommé ou côtier dans le cadre
const bb = `${BOX.s},${BOX.w},${BOX.n},${BOX.e}`;
const q = `[out:json][timeout:120];(
way["historic"](${bb}); relation["historic"](${bb}); node["historic"](${bb});
way["ruins"](${bb}); way["building"="ruins"](${bb});
way["building"]["name"](${bb}); relation["building"]["name"](${bb});
way["amenity"~"theatre|place_of_worship"](${bb});
way["leisure"~"stadium|track|pitch"]["name"](${bb});
way["man_made"~"breakwater|pier|groyne|aqueduct|tower|water_tower"](${bb});
way["natural"~"coastline|cliff|valley|water|spring"](${bb}); node["natural"="spring"](${bb});
way["waterway"](${bb});
way["highway"~"footway|path|steps|pedestrian|track"]["name"](${bb});
way["highway"]["name"~"קארדו|Cardo|Palladius|פלדיוס|Silvanus|סילבנוס|שביל הנחש|Snake",i](${bb});
way["tourism"](${bb}); node["tourism"]["name"](${bb});
way["boundary"="national_park"](${bb}); relation["boundary"="national_park"](${bb});
way["leisure"="nature_reserve"](${bb}); relation["leisure"="nature_reserve"](${bb});
);out geom tags;`;
let osm = null;
for (let round = 0; round < 4 && !(osm && (osm.elements || []).length); round++) for (const ep of OVERPASS) {
  if (osm && (osm.elements || []).length) break;
  try {
    const r = await fetch(ep + '?data=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const txt = await r.text();
    if (!r.ok) { log('Overpass', ep, 'HTTP', r.status, txt.slice(0, 120).replace(/\s+/g, ' ')); continue; }
    osm = JSON.parse(txt); log('Overpass', ep, 'OK', (osm.elements || []).length, 'éléments');
  } catch (e) { log('Overpass', ep, e.message); }
  await sleep(5000);
}
if (!(osm && (osm.elements || []).length)) throw new Error('Overpass : aucun élément — arrêt');
const rnd = v => Math.round(v * 1e6) / 1e6;
const KEEP = ['historic', 'ruins', 'building', 'amenity', 'leisure', 'man_made', 'natural', 'waterway', 'highway', 'tourism', 'boundary', 'archaeological_site', 'site_type', 'historic:civilization', 'height', 'building:levels', 'start_date', 'wikidata', 'wikipedia', 'religion', 'intermittent', 'tunnel', 'area', 'layer'];
const shapes = [];
for (const el of osm.elements) {
  const t = el.tags || {}, tags = {}; KEEP.forEach(k => { if (t[k] != null) tags[k] = t[k]; });
  const base = { name: t['name:en'] || t.name || '', he: t['name:he'] || (/[֐-׿]/.test(t.name || '') ? t.name : ''), osm: el.type + '/' + el.id, tags };
  log('EL', base.osm, JSON.stringify(base.name), JSON.stringify(base.he), Object.entries(tags).map(([k, v]) => k + '=' + v).join(' '));
  if (el.type === 'node') shapes.push(Object.assign(base, { pts: [[rnd(el.lat), rnd(el.lon)]] }));
  else if (el.type === 'way' && el.geometry) shapes.push(Object.assign(base, { pts: el.geometry.map(g => [rnd(g.lat), rnd(g.lon)]) }));
  else if (el.type === 'relation' && el.members) el.members.filter(m => m.type === 'way' && m.geometry).forEach(m => shapes.push(Object.assign({}, base, { role: m.role || '', pts: m.geometry.map(g => [rnd(g.lat), rnd(g.lon)]) })));
}
log('OSM :', shapes.length, 'formes');

// 3. Relief
const [STEP_LAT, STEP_LON] = CFG.step;
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
log('Relief :', rows, '×', cols, 'points —', demSource, 'min', Math.min(...heights.filter(h => h != null)), 'max', Math.max(...heights.filter(h => h != null)));

const out = {
  site: SITE, generatedAt: new Date().toISOString(),
  method: 'Repères : API Wikipédia (Wikidata P625). Vestiges et tracés : OpenStreetMap. Relief : ' + demSource + '. Aucune coordonnée saisie à la main.',
  license: 'Wikidata CC0 · OpenStreetMap © contributeurs, ODbL · ' + demSource,
  box: BOX, anchors, missing, shapes,
  dem: { source: demSource, north: BOX.n, west: BOX.w, stepLat: STEP_LAT, stepLon: STEP_LON, rows, cols, heights }
};
await mkdir(new URL(`public/sites3d/${SITE}/`, ROOT), { recursive: true });
await writeFile(new URL(`public/sites3d/${SITE}/geo.json`, ROOT), JSON.stringify(out));
log(`\nÉcrit public/sites3d/${SITE}/geo.json —`, Object.keys(anchors).length, 'repères,', shapes.length, 'formes');
