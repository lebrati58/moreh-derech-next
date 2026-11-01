// Construit les parcours « הדרכת דרך — מדריך באוטובוס » : public/hadracha/<id>.json + public/hadracha/index.json.
// Source : content/hadracha/<id>.src.json (lieux, commentaires en hébreu, sources du Drive, côté dit par le prof).
// Les coordonnées ne sont JAMAIS saisies à la main : Wikipédia (Wikidata P625) ; le tracé vient d'OSRM (© OpenStreetMap,
// ODbL, stockage et affichage sur Leaflet autorisés — contrairement aux tracés Google Routes).
// Pour chaque lieu et chaque SENS : abscisse, écart à la route, côté calculé (comparé au côté du prof, jamais corrigé
// en silence), fenêtre de visibilité, trigger_point / observation_point à 3 vitesses de référence, conflits.
// Le trajet est aussi découpé en intervalles de 1 km (250 m autour des lieux) avec route, cap et lieux à droite/gauche/devant.
// Usage : node tools/build-hadracha.mjs            (hors ligne, utilise le cache)
//         node tools/build-hadracha.mjs --online   (complète le cache : .github/workflows/hadracha.yml)
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url);
async function loadUMD(file, name) { const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number, Infinity }; vm.createContext(ctx); vm.runInContext(await readFile(new URL(file, ROOT), 'utf8'), ctx); return ctx.self[name]; }
const G = await loadUMD('public/gps-engine.js', 'MDL_GPS');
const H = await loadUMD('public/hadracha-engine.js', 'MDHadracha');
const ONLINE = process.argv.includes('--online');
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const BOX = { minLat: 29.4, maxLat: 33.45, minLon: 34.2, maxLon: 35.95 };
const SPEEDS_KMH = [50, 80, 100];          // vitesses de référence d'un autocar (ville / route / autoroute)

const cachePath = 'content/hadracha/geo-cache.json';
let cache = {}; try { cache = await readJSON(cachePath); } catch (e) { cache = {}; }
// les coordonnées déjà résolues pour les סיורים servent aussi ici (même source, même format)
let toursCache = {}; try { toursCache = await readJSON('content/tours/geo-cache.json'); } catch (e) {}
let dirty = false;

async function wikiCoord(cand) {
  if (cache[cand]) return cache[cand];
  if (toursCache[cand]) return toursCache[cand];
  if (!ONLINE) return null;
  const [lang, title] = [cand.slice(0, 2), cand.slice(3)];
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', action: 'query', prop: 'coordinates|pageprops|info', inprop: 'url', ppprop: 'wikibase_item', titles: title });
  const res = await fetch(url, { headers: { 'User-Agent': UA } }); await sleep(250);
  if (!res.ok) return null;
  const p = ((await res.json()).query || {}).pages?.[0];
  const c = p && !p.missing && ((p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0]);
  const entry = c && c.lat > BOX.minLat && c.lat < BOX.maxLat && c.lon > BOX.minLon && c.lon < BOX.maxLon
    ? { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), source: `${lang}.wikipedia: ${p.title}`, url: p.fullurl, qid: p.pageprops?.wikibase_item || null, fetchedAt: new Date().toISOString().slice(0, 10) }
    : { missing: true, checkedAt: new Date().toISOString().slice(0, 10) };
  cache[cand] = entry; dirty = true;
  return entry;
}
async function resolve(wiki) {
  for (const cand of wiki || []) { const c = await wikiCoord(cand); if (c && !c.missing) return { lat: c.lat, lon: c.lon, source: c.source, url: c.url, qid: c.qid || null }; }
  return null;
}
// Tracé OSRM avec les étapes (numéro de route : champ ref d'OSM)
async function osrm(key, points) {
  const sig = points.map(p => p.join(',')).join(';');
  if (cache[key] && cache[key].pts === sig) return cache[key];
  if (!ONLINE) return cache[key] || null;
  const coords = points.map(([lat, lon]) => `${lon},${lat}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`, { headers: { 'User-Agent': UA } });
  if (!res.ok) { console.log(`❌ OSRM ${res.status}`); return null; }
  const j = await res.json();
  if (!j.routes || !j.routes[0]) return null;
  const r = j.routes[0];
  const raw = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  const P0 = G.prepare({ geometry: raw });
  const geometry = G.simplify(P0.pts, 8).map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
  // étapes → tronçons de route (ref OSM), en abscisse cumulée
  let s = 0; const steps = [];
  for (const leg of r.legs) for (const st of leg.steps) {
    if (st.distance > 0) steps.push({ from: Math.round(s), to: Math.round(s + st.distance), ref: st.ref || null, name: st.name || '' });
    s += st.distance;
  }
  cache[key] = { pts: sig, geometry, distanceM: Math.round(r.distance), durationS: Math.round(r.duration), steps, source: 'OSRM (router.project-osrm.org), © OpenStreetMap contributors (ODbL)', fetchedAt: new Date().toISOString().slice(0, 10) };
  dirty = true;
  return cache[key];
}

// Fusionne les étapes OSRM en tronçons de route numérotés (« 20 », « 1 »…)
function roadRuns(steps) {
  const runs = [];
  for (const st of steps || []) {
    const ref = st.ref ? String(st.ref).split(';')[0].trim() : null;
    const last = runs[runs.length - 1];
    if (last && last.ref === ref) last.to = st.to; else runs.push({ ref, name: st.name, from: st.from, to: st.to });
  }
  // un petit tronçon sans numéro (bretelle) est rattaché au précédent
  return runs.filter((r, i) => r.ref || r.to - r.from > 400 || i === 0);
}
const refAt = (runs, s) => (runs.find(r => s >= r.from - 1 && s <= r.to + 1) || {}).ref || null;
const sideFrom = loc => (loc.d >= 50 && loc.d <= 4000 ? loc.side : null);
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const bearingTo = (P, s, ll) => { const a = G.pointAt(P, s), p = P.proj.fwd(ll[0], ll[1]); return (Math.atan2(p.x - a.x, p.y - a.y) * 180 / Math.PI + 360) % 360; };

function directionView(P, pois, dir, runs) {
  const L = P.length;
  const list = pois.filter(p => p.coord).map(p => {
    const loc = G.locate(P, [p.coord.lat, p.coord.lon]);
    const computed = p.sideRule === 'along' ? 'along' : sideFrom(loc);
    const teacher = p.teacherSide ? (dir === 'fwd' ? p.teacherSide.value : ({ right: 'left', left: 'right' }[p.teacherSide.value] || p.teacherSide.value)) : null;
    const side = teacher || computed;
    return Object.assign({}, p, { sAbeam: Math.round(loc.s), offRoadM: loc.d, side,
      sideCheck: { teacher, computed, agree: teacher && computed ? teacher === computed : null, from: teacher ? 'teacher' : computed ? 'computed' : 'unknown' },
      road: refAt(runs, loc.s) });
  }).sort((a, b) => a.sAbeam - b.sAbeam);
  const triggers = list.map(p => {
    const byV = {};
    for (const k of SPEEDS_KMH) { const t = H.trigger(p, dir, k / 3.6); byV[k] = { trigger_s: Math.round(t.sTrig), trigger_point: ll(P, t.sTrig), observation_s: Math.round(t.sObs), observation_point: ll(P, t.sObs), lead_m: t.leadM, lead_sec: t.leadSec }; }
    const t80 = H.trigger(p, dir, 80 / 3.6);
    return { id: p.id, side: p.side, visibility: t80.visibility, noLook: t80.noLook, durations: t80.dur, totalSec: Math.round(t80.totalSec), byKmh: byV };
  });
  const plans = {};
  for (const k of SPEEDS_KMH) plans[k] = H.schedule(list, dir, k / 3.6).map(x => ({ id: x.poi.id, mode: x.mode, shifted: !!x.shifted, start_s: x.start == null ? null : Math.round(x.start), end_s: x.end == null ? null : Math.round(x.end) }));
  return { list, triggers, plans, L };
}
const ll = (P, s) => { const p = G.pointAt(P, Math.max(0, Math.min(P.length, s))); return [+p.lat.toFixed(5), +p.lon.toFixed(5)]; };

// Intervalles : 1 km, affinés à 250 m quand un lieu est « actif » (fenêtre élargie de 1 km)
function segments(P, list, dir, runs) {
  const L = P.length, hot = list.map(p => [p.sAbeam - 1500, p.sAbeam + 1000]);
  const cuts = [0]; let s = 0;
  while (s < L) { const step = hot.some(([a, b]) => s >= a && s <= b) ? 250 : 1000; s = Math.min(L, s + step); cuts.push(s); }
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1], mid = (a + b) / 2, pm = G.pointAt(P, mid);
    const seg = { dir, from_s: Math.round(a), to_s: Math.round(b), lengthM: Math.round(b - a), road: refAt(runs, mid), bearing: Math.round(pm.bearing), start: ll(P, a), end: ll(P, b), right: [], left: [], ahead: [] };
    for (const p of list) {
      const w = H.visWindow(p, dir);
      if (w.status === 'not_visible') continue;
      const dist = p.sAbeam - mid;
      // devant : dans l'axe (±25°) et encore loin ; sinon à droite / gauche pendant la fenêtre de visibilité
      if (dist > 600 && dist < 6000 && angDiff(bearingTo(P, mid, [p.coord.lat, p.coord.lon]), pm.bearing) < 25) seg.ahead.push(p.id);
      else if (b >= w.sObs && a <= w.sVisEnd && (p.side === 'right' || p.side === 'left')) seg[p.side].push(p.id);
    }
    out.push(seg);
  }
  return out;
}

async function build(src) {
  const start = await resolve(src.endpoints.start.wiki), end = await resolve(src.endpoints.end.wiki);
  const pois = [];
  for (const p of src.pois) pois.push(Object.assign({}, p, { coord: await resolve(p.wiki) }));
  const out = { v: 1, id: src.id, corridor: src.corridor, title: src.title, titleFr: src.titleFr, roads: src.roads, status: src.status, published: src.published === true,
    statusNote: src.statusNote, sources: src.sources, endpoints: { start: Object.assign({ name: src.endpoints.start.name }, start ? { coord: start } : {}), end: Object.assign({ name: src.endpoints.end.name }, end ? { coord: end } : {}) },
    route: null, directions: {}, pois: [], check: { errors: [], warnings: [] } };
  const err = m => out.check.errors.push(m), warn = m => out.check.warnings.push(m);
  if (!start || !end) err('extrémités sans coordonnées (Wikipédia)');
  pois.filter(p => !p.coord).forEach(p => err(`${p.id} : pas de coordonnées vérifiables`));
  const r = start && end ? await osrm('route:' + src.id, [[start.lat, start.lon], [end.lat, end.lon]]) : null;
  if (!r) { err('tracé OSRM absent (lancer le workflow « hadracha » en ligne)'); out.pois = pois.map(p => ({ id: p.id, name: p.name, coord: p.coord })); return out; }
  const runs = roadRuns(r.steps);
  out.route = { geometry: r.geometry, distanceM: r.distanceM, durationS: r.durationS, roads: runs, source: r.source, fetchedAt: r.fetchedAt, status: 'approximate' };
  const P = G.prepare({ geometry: r.geometry });
  const Prev = G.prepare({ geometry: r.geometry.slice().reverse() });
  for (const [dir, PP] of [['fwd', P], ['rev', Prev]]) {
    const view = directionView(PP, pois, dir, dir === 'fwd' ? runs : runs.map(x => ({ ref: x.ref, name: x.name, from: PP.length - x.to, to: PP.length - x.from })).reverse());
    out.directions[dir] = { label: dir === 'fwd' ? `${src.endpoints.start.name} → ${src.endpoints.end.name}` : `${src.endpoints.end.name} → ${src.endpoints.start.name}`,
      lengthM: Math.round(PP.length), order: view.list.map(p => p.id), triggers: view.triggers, plans: view.plans,
      segments: segments(PP, view.list, dir, dir === 'fwd' ? runs : runs.map(x => ({ ref: x.ref, from: PP.length - x.to, to: PP.length - x.from })).reverse()),
      pois: view.list.map(p => ({ id: p.id, sAbeam: p.sAbeam, offRoadM: p.offRoadM, side: p.side, sideCheck: p.sideCheck, road: p.road,
        text: { intro: H.render(p.commentary.intro, p.side), cue: H.render(p.commentary.cue, p.side), look: H.render(p.commentary.look, p.side), short: H.render(p.commentary.short, p.side) } })) };
    view.list.forEach(p => {
      if (p.sideCheck.agree === false) warn(`${dir} ${p.id} : côté du prof (${p.sideCheck.teacher}) ≠ côté calculé (${p.sideCheck.computed}) à ${p.offRoadM} m — à trancher en repérage`);
      if (!p.side) warn(`${dir} ${p.id} : côté inconnu (lieu à ${p.offRoadM} m de la route) — pas de consigne droite/gauche`);
      if (p.offRoadM > 4000) warn(`${dir} ${p.id} : à ${(p.offRoadM / 1000).toFixed(1)} km du tracé — visibilité douteuse`);
    });
    for (const k of SPEEDS_KMH) view.plans[k].filter(x => x.mode !== 'full').forEach(x => warn(`${dir} ${k} km/h ${x.id} : ${x.mode === 'short' ? 'version courte (conflit)' : 'écarté (conflit)'}`));
  }
  // ordre attendu (celui de la source = ordre du trajet aller)
  const ord = out.directions.fwd.order, srcOrd = src.pois.map(p => p.id).filter(id => ord.includes(id));
  srcOrd.forEach((id, i) => { if (ord[i] !== id) warn(`ordre : ${id} attendu en position ${i + 1}, calculé ${ord.indexOf(id) + 1}`); });
  out.pois = pois.map(p => ({ id: p.id, name: p.name, category: p.category, prio: p.prio, coord: p.coord, anchorNote: p.anchorNote || null, themes: p.themes || [],
    teacherSide: p.teacherSide, visibility: p.visibility || {}, commentary: p.commentary, facts: p.facts,
    confidence: confidence(p, out) }));
  return out;
}
// Niveau de confiance d'un lieu : position (source), côté (prof ⇄ calcul), visibilité (repérage), contenu (sources)
function confidence(p, out) {
  const f = out.directions.fwd && out.directions.fwd.pois.find(x => x.id === p.id);
  const side = !f ? 'unknown' : f.sideCheck.agree === true ? 'high' : f.sideCheck.agree === false ? 'conflict' : f.sideCheck.from === 'teacher' ? 'medium' : f.sideCheck.from === 'computed' ? 'medium' : 'low';
  const vis = (p.visibility && p.visibility.fwd && p.visibility.fwd.status) || 'estimated';
  const kinds = new Set((p.facts || []).map(x => (out.sources[x.source] || { kind: x.source }).kind));
  const content = kinds.has('transcript') ? 'high' : kinds.has('course-doc') ? 'medium' : 'low';
  return { position: p.coord ? (p.anchorNote ? 'low' : 'medium') : 'none', side, visibility: vis === 'verified' ? 'high' : vis === 'not_visible' ? 'n/a' : 'low', content, verified: false };
}

const files = (await readdir(new URL('content/hadracha/', ROOT))).filter(f => f.endsWith('.src.json')).sort();
await mkdir(new URL('public/hadracha/', ROOT), { recursive: true });
const index = { v: 1, builtAt: new Date().toISOString(), routes: [] };
for (const f of files) {
  const src = await readJSON('content/hadracha/' + f), t = await build(src);
  const pub = t.status === 'pret' && t.published && !t.check.errors.length;
  console.log(`${pub ? '🟢' : '🟡'} ${t.id} — ${t.pois.length} lieux, ${t.route ? (t.route.distanceM / 1000).toFixed(1) + ' km' : 'sans tracé'}, statut ${t.status}`);
  t.check.errors.forEach(e => console.log('   ❌ ' + e)); t.check.warnings.forEach(w => console.log('   ⚠️ ' + w));
  await writeFile(new URL(`public/hadracha/${t.id}.json`, ROOT), JSON.stringify(t) + '\n');
  index.routes.push({ id: t.id, corridor: t.corridor, title: t.title, status: t.status, public: pub, pois: t.pois.length, km: t.route ? Math.round(t.route.distanceM / 100) / 10 : null,
    // « analysé » seulement si chaque lieu est vérifié en repérage (jamais par le seul calcul)
    analysis: t.check.errors.length || !t.route ? 'non_traite' : t.pois.every(p => p.confidence.verified) ? 'analyse' : 'partiel', errors: t.check.errors.length, warnings: t.check.warnings.length });
}
await writeFile(new URL('public/hadracha/index.json', ROOT), JSON.stringify(index, null, 1) + '\n');
if (dirty) await writeFile(new URL(cachePath, ROOT), JSON.stringify(cache, null, 1) + '\n');
