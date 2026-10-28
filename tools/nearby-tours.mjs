// Lieux Wikipédia proches du tracé d'un parcours : « qu'est-ce qu'on voit pas loin du bus ? »
// Pour chaque point du tracé (tous les ~1,5 km), recherche géographique Wikipédia (he + en, rayon 2 km),
// puis distance au tracé, côté (gauche/droite dans le sens du trajet) et kilomètre où on le croise.
// Ce sont des CANDIDATS de source externe : à vérifier sur place / avec le prof avant toute question.
// Usage : node tools/nearby-tours.mjs 01 [rayonM=2000]   (réseau requis : à lancer dans GitHub Actions)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next; lebrati58 tour builder)';
const id = process.argv[2] || '01';
const RADIUS = Number(process.argv[3] || 2000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cache = JSON.parse(await readFile(new URL('content/tours/geo-cache.json', ROOT), 'utf8'));
const route = cache['route:' + id];
if (!route) { console.error(`pas de tracé route:${id} dans geo-cache.json`); process.exit(1); }
const geom = route.geometry; // [[lat, lon], ...] dans le sens du trajet
const src = JSON.parse(await readFile(new URL(`content/tours/${id}.src.json`, ROOT), 'utf8'));

// projection locale en mètres
const lat0 = geom[0][0] * Math.PI / 180, R = 6371000;
const xy = ([lat, lon]) => [lon * Math.PI / 180 * R * Math.cos(lat0), lat * Math.PI / 180 * R];
const P = geom.map(xy);
const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));

function locate(lat, lon) {
  const q = xy([lat, lon]); let best = null;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / L2));
    const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(q[0] - px, q[1] - py);
    if (!best || d < best.d) best = { d, s: cum[i] + t * Math.sqrt(L2), side: (dx * (q[1] - ay) - dy * (q[0] - ax)) > 0 ? 'left' : 'right' };
  }
  return best;
}

// points d'échantillonnage tous les ~1,5 km
const samples = []; let next = 0;
for (let i = 0; i < geom.length; i++) if (cum[i] >= next) { samples.push(geom[i]); next = cum[i] + 1500; }
samples.push(geom[geom.length - 1]);

const found = new Map();
for (const lang of ['he', 'en']) {
  for (const [lat, lon] of samples) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=geosearch&gscoord=${lat}|${lon}&gsradius=${Math.min(RADIUS, 10000)}&gslimit=50&gsnamespace=0`;
    let j; try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); j = await r.json(); } catch (e) { console.log(`⚠️ ${lang} ${lat},${lon}: ${e.message}`); continue; }
    await sleep(150);
    for (const g of j.query?.geosearch || []) {
      const key = `${lang}:${g.pageid}`; if (found.has(key)) continue;
      const loc = locate(g.lat, g.lon); if (loc.d > RADIUS) continue;
      found.set(key, { lang, title: g.title, pageid: g.pageid, lat: +g.lat.toFixed(5), lon: +g.lon.toFixed(5), km: +(loc.s / 1000).toFixed(1), distM: Math.round(loc.d), side: loc.d < 50 ? 'on-road' : loc.side });
    }
  }
}

// liens he ↔ en via Wikidata (pour fusionner les doublons entre langues)
const items = [...found.values()];
for (const lang of ['he', 'en']) {
  const ids = items.filter(x => x.lang === lang).map(x => x.pageid);
  for (let k = 0; k < ids.length; k += 50) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageprops|langlinks&ppprop=wikibase_item&lllang=${lang === 'he' ? 'en' : 'he'}&lllimit=max&pageids=${ids.slice(k, k + 50).join('|')}`;
    try {
      const j = await (await fetch(url, { headers: { 'User-Agent': UA } })).json(); await sleep(150);
      for (const p of j.query?.pages || []) { const it = items.find(x => x.lang === lang && x.pageid === p.pageid); if (!it) continue; it.qid = p.pageprops?.wikibase_item || null; it.other = p.langlinks?.[0]?.title || null; }
    } catch (e) { console.log(`⚠️ pageprops ${lang}: ${e.message}`); }
  }
}
const byQ = new Map();
for (const it of items) {
  const k = it.qid || `${it.lang}:${it.pageid}`, cur = byQ.get(k) || { qid: it.qid || null, km: it.km, distM: it.distM, side: it.side, lat: it.lat, lon: it.lon };
  if (it.lang === 'he') cur.he = it.title; else cur.en = it.title;
  if (!cur.he && it.lang === 'en' && it.other) cur.he = it.other;
  if (!cur.en && it.lang === 'he' && it.other) cur.en = it.other;
  byQ.set(k, cur);
}
// déjà dans le parcours ?
const known = new Set(); for (const s of src.stops || []) for (const w of s.wiki || []) known.add(w.replace(/^\w+:/, ''));
const out = [...byQ.values()].map(x => ({ ...x, inTour: !!((x.he && known.has(x.he)) || (x.en && known.has(x.en))) })).sort((a, b) => a.km - b.km || a.distM - b.distM);

await mkdir(new URL('content/tours/nearby/', ROOT), { recursive: true });
await writeFile(new URL(`content/tours/nearby/${id}.json`, ROOT), JSON.stringify({
  tour: id, radiusM: RADIUS, routeDistanceM: route.distanceM, fetchedAt: new Date().toISOString().slice(0, 10),
  source: 'Wikipédia (he, en) — recherche géographique le long du tracé OSRM. Source externe : candidats à vérifier, pas des propos du prof.',
  places: out }, null, 1) + '\n');
console.log(`🔭 ${id} : ${out.length} lieux à moins de ${RADIUS} m du tracé (${out.filter(x => x.inTour).length} déjà dans le parcours)`);
