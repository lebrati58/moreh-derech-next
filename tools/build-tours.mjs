// Construit les parcours « סיפור דרך » jouables : public/tours/<id>.json + public/tours/index.json.
//  • road67 : converti depuis le parcours de référence existant (content/v3 + public/v3), sans le modifier ;
//  • chaque content/tours/<id>.src.json : lieux, citations de l'enregistrement, questions et sources.
// Les coordonnées ne sont JAMAIS saisies à la main : elles viennent de l'API Wikipédia (Wikidata P625) et le tracé
// d'OSRM, puis sont gardées dans content/tours/geo-cache.json avec leur source. Le côté de chaque lieu (droite/gauche)
// est recalculé sur le tracé et comparé à ce que dit le prof : un désaccord est signalé, jamais corrigé en silence.
// Usage : node tools/build-tours.mjs            (hors ligne, utilise le cache)
//         node tools/build-tours.mjs --online   (complète le cache : exécuté par .github/workflows/tours.yml)
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url);
// Les modules du navigateur (UMD) sont chargés tels quels, comme dans les tests.
async function loadUMD(file, name) { const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number }; vm.createContext(ctx); vm.runInContext(await readFile(new URL(file, ROOT), 'utf8'), ctx); return ctx.self[name]; }
const G = await loadUMD('public/gps-engine.js', 'MDL_GPS');
const E = await loadUMD('public/tour-engine.js', 'MDTourEngine');
const ONLINE = process.argv.includes('--online');
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const BOX = { minLat: 29.4, maxLat: 33.45, minLon: 34.2, maxLon: 35.95 };

const cachePath = 'content/tours/geo-cache.json';
let cache = {}; try { cache = await readJSON(cachePath); } catch (e) { cache = {}; }
let cacheDirty = false;

async function wikiCoord(cand) {
  if (cache[cand]) return cache[cand];
  if (!ONLINE) return null;
  const [lang, title] = [cand.slice(0, 2), cand.slice(3)];
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', action: 'query', prop: 'coordinates|pageprops|info', inprop: 'url', ppprop: 'wikibase_item', titles: title });
  const res = await fetch(url, { headers: { 'User-Agent': UA } }); await sleep(200);
  if (!res.ok) return null;
  const p = ((await res.json()).query || {}).pages?.[0];
  const c = p && !p.missing && ((p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0]);
  const entry = c && c.lat > BOX.minLat && c.lat < BOX.maxLat && c.lon > BOX.minLon && c.lon < BOX.maxLon
    ? { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), source: `${lang}.wikipedia: ${p.title}`, url: p.fullurl, qid: p.pageprops?.wikibase_item || null, fetchedAt: new Date().toISOString().slice(0, 10) }
    : { missing: true, checkedAt: new Date().toISOString().slice(0, 10) };
  cache[cand] = entry; cacheDirty = true;
  return entry;
}
async function osrm(key, points) {
  if (cache[key] && cache[key].pts === points.map(p => p.join(',')).join(';')) return cache[key];
  if (!ONLINE) return cache[key] || null;
  const coords = points.map(([lat, lon]) => `${lon},${lat}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.routes || !j.routes[0]) return null;
  const raw = j.routes[0].geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
  // simplification (≈ 25 m) avec le même algorithme que le moteur GPS
  const P0 = G.prepare({ geometry: raw.map(p => [p.lat, p.lon]) });
  const simp = G.simplify(P0.pts, 25).map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
  cache[key] = { pts: points.map(p => p.join(',')).join(';'), geometry: simp, distanceM: Math.round(j.routes[0].distance), source: 'OSRM (router.project-osrm.org), © OpenStreetMap', fetchedAt: new Date().toISOString().slice(0, 10) };
  cacheDirty = true;
  return cache[key];
}

// Côté calculé seulement si le lieu est nettement à côté de la route : un point posé SUR la chaussée (< 50 m,
// cas des ancres de la route 67) ne dit rien du côté ; au-delà de 3 km le lieu se voit de loin, ou pas du tout.
const sideFrom = loc => (loc.d >= 50 && loc.d <= 3000 ? loc.side : null);

// ------------------------------------------------------------------ road67 (référence)
async function buildRoad67() {
  const route = await readJSON('public/v3/road67-route.json');
  const bank = await readJSON('content/v3/road67_questions.json');
  const P = G.prepare(route);
  const stops = route.stops.map(st => {
    const loc = G.locate(P, st.anchor);
    const teacher = st.side && st.side.value || null, computed = sideFrom(loc);
    return { id: st.id.toLowerCase(), name: st.name.he, coord: { lat: st.anchor[0], lon: st.anchor[1], source: st.anchorSource || 'road67-route.json' },
      s: Math.round(loc.s), offRoadM: loc.d, side: teacher ? { teacher, computed, agree: computed ? teacher === computed : null, verified: !!(st.side && st.side.verified) } : null,
      sideQuote: st.side && st.side.docs ? st.side.docs.he : null, look: st.look && st.look.he || '', story: [] };
  }).sort((a, b) => a.s - b.s);
  const qByStop = {};
  const questions = bank.questions.map(q => {
    const he = q.i18n.he, stop = q.stop.toLowerCase();
    (qByStop[stop] = qByStop[stop] || []).push(he.long || he.explanation);
    return { id: q.id, stop, type: 'mcq', certainty: he.caution ? 'approx' : 'firm', prompt: he.question, options: he.options, correct: q.correctIndex,
      explanation: he.explanation + (he.fact ? ' ' + he.fact : '') + (he.caution ? ' ⚠️ ' + he.caution : ''),
      sources: [{ kind: 'course-doc', title: 'מסמכי הדרכת הדרך של הקורס (יוסי, יאיר) — סיכום', quote: q.docs }]
        .concat((q.sources || []).map(s => ({ kind: 'external', title: s.title, url: s.url }))) };
  });
  stops.forEach(s => { s.story = qByStop[s.id] || []; });
  return { v: 1, id: 'road67', title: 'מסלול 67 — זכרון יעקב ← יקנעם', subtitle: 'כביש 67 (ואדי מילק) וכביש 6', status: 'pret', published: true,
    statusNote: 'מסלול הייחוס. התוואי משוער (צמתים מוויקיפדיה); הצדדים לפי מסמכי ההדרכה.', transcript: null,
    docs: [{ title: 'content/v3 — מקורות המסלול', url: 'https://github.com/lebrati58/moreh-derech-next/blob/main/content/v3/README.md' }],
    route: { status: route.status, corridorM: route.corridorM, geometry: route.geometry, roads: route.roads, minGapSec: route.minGapSec, source: 'road67-route.json' },
    stops, questions };
}

// ------------------------------------------------------------------ parcours issus d'un enregistrement
async function buildFromSource(src) {
  const t = { v: 1, id: src.id, title: src.title, subtitle: src.subtitle, date: src.date, status: src.status, published: src.published === true,
    statusNote: src.statusNote, transcript: src.transcript, docs: src.docs || [], route: null, stops: [], questions: [] };
  for (const s of src.stops) {
    let coord = null;
    for (const cand of s.wiki || []) { const c = await wikiCoord(cand); if (c && !c.missing) { coord = { lat: c.lat, lon: c.lon, source: c.source, url: c.url }; break; } }
    t.stops.push({ id: s.id, name: s.name, coord, look: s.look || '', story: s.story || [], sideQuote: s.sideQuote || null,
      side: s.sideTeacher ? { teacher: s.sideTeacher, computed: null, agree: null } : null });
  }
  const byId = Object.fromEntries(t.stops.map(s => [s.id, s]));
  const via = (src.routing && src.routing.via || []).map(id => byId[id] && byId[id].coord).filter(Boolean);
  if (via.length >= 2 && via.length === (src.routing.via || []).length) {
    const r = await osrm('route:' + src.id, via.map(c => [c.lat, c.lon]));
    if (r) t.route = { status: 'approximate', corridorM: { approximate: 900, verified: 150 }, geometry: r.geometry, roads: [], minGapSec: 45, source: r.source, distanceM: r.distanceM };
  }
  if (t.route) {
    const P = G.prepare({ geometry: t.route.geometry });
    t.stops.forEach(s => {
      if (!s.coord) return;
      const loc = G.locate(P, [s.coord.lat, s.coord.lon]);
      s.s = Math.round(loc.s); s.offRoadM = loc.d;
      // À plus de 3 km, le côté calculé n'a plus de sens (le lieu se voit de loin, ou pas du tout).
      if (s.side) { s.side.computed = sideFrom(loc); s.side.agree = s.side.computed ? s.side.computed === s.side.teacher : null; }
    });
  }
  const tr = src.transcript ? { title: src.transcript.title, url: src.transcript.url } : {};
  t.questions = src.questions.map(q => Object.assign({}, q, { sources: q.sources.map(x => x.kind === 'transcript' ? Object.assign({}, tr, x) : x) }))
    .concat(E.sideQuestions(t));
  return t;
}

// ------------------------------------------------------------------ main
const registry = await readJSON('content/tours/registry.json');
const tours = [await buildRoad67()];
for (const f of (await readdir(new URL('content/tours/', ROOT))).filter(f => /^\d{2}\.src\.json$/.test(f)).sort()) {
  tours.push(await buildFromSource(await readJSON('content/tours/' + f)));
}
await mkdir(new URL('public/tours/', ROOT), { recursive: true });
const index = { v: 1, builtAt: new Date().toISOString(), tours: [] };
let problems = 0;
for (const t of tours) {
  const v = E.validate(t), pub = E.publishable(t);
  const reg = registry.tours.find(x => x.id === t.id);
  if (reg && reg.status !== t.status) console.log(`⚠️ ${t.id} : statut ${t.status} (registre : ${reg.status})`);
  console.log(`${pub ? '🟢' : '🟡'} ${t.id} ${t.title} — ${t.stops.length} lieux, ${t.questions.length} questions, statut ${t.status}${pub ? ' (publié)' : ''}`);
  v.errors.forEach(e => console.log('   ❌ ' + e)); v.warnings.forEach(w => console.log('   ⚠️ ' + w));
  if (t.status === 'pret' && t.published && v.errors.length) problems++;
  t.check = { errors: v.errors, warnings: v.warnings, builtAt: index.builtAt.slice(0, 10) };
  await writeFile(new URL(`public/tours/${t.id}.json`, ROOT), JSON.stringify(t) + '\n');
  index.tours.push({ id: t.id, title: t.title, subtitle: t.subtitle || '', status: t.status, public: pub, stops: t.stops.length,
    questions: t.questions.length, map: !!t.route, issues: v.errors.length, warnings: v.warnings.length });
}
await writeFile(new URL('public/tours/index.json', ROOT), JSON.stringify(index, null, 1) + '\n');
if (cacheDirty) await writeFile(new URL(cachePath, ROOT), JSON.stringify(cache, null, 1) + '\n');
if (problems) { console.error(`${problems} parcours marqué(s) publié(s) avec des erreurs bloquantes.`); process.exit(1); }
