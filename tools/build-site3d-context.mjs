// Construit public/sites3d/<site>/context.json : les bâtiments d'aujourd'hui autour d'un site 3D (décor de la période « היום »).
// Source : OpenStreetMap (Overpass, ODbL), tous les way["building"] du cadre du site (tools/site3d-sites.json), sauf ruines.
// Chaque bâtiment est réduit à son rectangle orienté (axe principal) : [lat, lon, longueur m, largeur m, cap °, hauteur m].
// Hauteur : tag height, sinon building:levels × 3,2 m, sinon estimation selon le type (maison 6 m, église 12 m…) — marquée comme estimée.
// Usage : node tools/build-site3d-context.mjs <site|all>   (Internet requis ; exécuté par .github/workflows/site3d-context.yml)
import { readFile, writeFile, access } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CFG = JSON.parse(await readFile(new URL('tools/site3d-sites.json', ROOT), 'utf8'));
const arg = process.argv[2] || 'all';
const SITES = arg === 'all' ? Object.keys(CFG).filter(k => k !== '_doc') : arg.split(',');
const DEF_H = { house: 6, detached: 6, residential: 9, apartments: 15, church: 12, chapel: 7, mosque: 10, school: 9, commercial: 9, retail: 7, industrial: 8, warehouse: 8, shed: 3, garage: 3, roof: 4, hut: 3, hotel: 15 };

async function overpass(q) {
  for (let round = 0; round < 3; round++) for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, { signal: AbortSignal.timeout(150000), method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } });
      if (r.ok) return await r.json();
      console.log('  Overpass', ep, 'HTTP', r.status);
    } catch (e) { console.log('  Overpass', ep, e.message); }
    await sleep(4000);
  }
  throw new Error('Overpass indisponible');
}

function obb(pts, lat0) { // rectangle orienté (ACP) en mètres autour du centroïde
  const KX = 111320 * Math.cos(lat0 * Math.PI / 180), KZ = 110574;
  const Q = pts.length > 2 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts;
  const cl = Q.reduce((s, p) => s + p[0], 0) / Q.length, co = Q.reduce((s, p) => s + p[1], 0) / Q.length;
  const xy = Q.map(([la, lo]) => [(lo - co) * KX, (la - cl) * KZ]); // x = est, y = nord
  let sxx = 0, syy = 0, sxy = 0; xy.forEach(([x, y]) => { sxx += x * x; syy += y * y; sxy += x * y; });
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(a), uy = Math.sin(a);
  const al = xy.map(([x, y]) => x * ux + y * uy), pe = xy.map(([x, y]) => -x * uy + y * ux);
  const a0 = Math.min(...al), a1 = Math.max(...al), b0 = Math.min(...pe), b1 = Math.max(...pe), am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
  const cx = am * ux - bm * uy, cy = am * uy + bm * ux; // centre du rectangle
  const bearing = (90 - a * 180 / Math.PI + 360) % 180; // cap de l'axe long (0 = nord)
  return { lat: cl + cy / KZ, lon: co + cx / KX, L: a1 - a0, W: b1 - b0, bearing };
}

const r1 = v => Math.round(v * 10) / 10, r6 = v => Math.round(v * 1e6) / 1e6;
for (const site of SITES) {
  const c = CFG[site]; if (!c) { console.log('site inconnu', site); continue; }
  try { await access(new URL(`public/sites3d/${site}/site.json`, ROOT)); } catch { console.log('pas de site.json, ignoré :', site); continue; }
  const b = c.box, bb = `${b.s},${b.w},${b.n},${b.e}`;
  console.log('==', site);
  const j = await overpass(`[out:json][timeout:120];way["building"]["building"!="ruins"]["ruins"!="yes"]["historic"!~"."](${bb});out geom tags;`);
  const out = [], est = { tag: 0, levels: 0, guess: 0 };
  for (const el of j.elements || []) {
    if (!el.geometry || el.geometry.length < 4) continue;
    const t = el.tags || {}, o = obb(el.geometry.map(g => [g.lat, g.lon]), (b.s + b.n) / 2);
    if (o.L < 2 || o.W < 1.5 || o.L > 400) continue;
    let h = parseFloat(t.height), how = 'tag';
    if (!(h > 0)) { const lv = parseFloat(t['building:levels']); if (lv > 0) { h = lv * 3.2; how = 'levels'; } else { h = DEF_H[t.building] || 7; how = 'guess'; } }
    est[how]++;
    out.push([r6(o.lat), r6(o.lon), r1(o.L), r1(o.W), Math.round(o.bearing), r1(Math.min(h, 80)), how === 'guess' ? 0 : 1, el.id]);
  }
  const doc = {
    site, generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap © contributeurs, ODbL — way["building"] du cadre (hors ruines et monuments historiques)',
    method: 'Rectangle orienté de chaque emprise. Hauteur : tag height, sinon building:levels × 3,2 m, sinon estimation selon le type.',
    fields: ['lat', 'lon', 'longueur_m', 'largeur_m', 'cap_deg', 'hauteur_m', 'hauteur_mesuree(1)_ou_estimee(0)', 'osm_way'],
    counts: est, b: out
  };
  await writeFile(new URL(`public/sites3d/${site}/context.json`, ROOT), JSON.stringify(doc));
  console.log(`  ${out.length} bâtiments (hauteur : ${est.tag} tag, ${est.levels} étages, ${est.guess} estimées)`);
  await sleep(3000);
}
