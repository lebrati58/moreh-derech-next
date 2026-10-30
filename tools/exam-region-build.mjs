// Construit une région de l'אתגר המבחן à partir de sa source (content/exam/<region>.src.json) :
//  - coordonnées des lieux depuis Wikipédia (titres « he:… » / « en:… » de la source ; jamais tapées à la main),
//  - temps de trajet voiture entre tous les lieux (OSRM / OpenStreetMap, sans trafic),
//  - contrôle : chaque fait a une source connue, chaque mission pointe vers des lieux existants,
//  - écrit public/exam/<region>.json et met la région dans public/exam/regions.json.
// Un lieu sans coordonnées vérifiables n'est PAS publié (signalé dans le rapport).
// Usage : node tools/exam-region-build.mjs shfela [--online]   (réseau : GitHub Actions)
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const UA = 'MorehDerechNext/1.0 (github.com/lebrati58/moreh-derech-next; exam region builder)';
const id = process.argv[2];
const online = process.argv.includes('--online');
if (!id) { console.error('usage: node tools/exam-region-build.mjs <region> [--online]'); process.exit(2); }
const srcPath = new URL(`content/exam/${id}.src.json`, ROOT);
const src = JSON.parse(await readFile(srcPath, 'utf8'));
const cachePath = new URL('content/exam/geo-cache.json', ROOT);
let cache = {}; try { cache = JSON.parse(await readFile(cachePath, 'utf8')); } catch (e) {}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = [], err = m => report.push('❌ ' + m), warn = m => report.push('⚠️ ' + m);

// Israël et environs (garde-fou contre un homonyme à l'autre bout du monde)
const inBox = c => c && c.lat > 29.3 && c.lat < 33.5 && c.lon > 34.2 && c.lon < 35.95;
async function wiki(title) {
  if (cache['wiki:' + title]) return cache['wiki:' + title];
  if (!online) return null;
  const [lang, ...rest] = title.split(':'), t = rest.join(':');
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=coordinates|info|pageprops&inprop=url&titles=${encodeURIComponent(t)}`;
  try {
    let j = null;
    for (let k = 0; k < 4 && !j; k++) {   // Wikipédia limite le débit (« You are making too many requests ») : on attend et on réessaie
      const txt = await (await fetch(url, { headers: { 'User-Agent': UA } })).text(); await sleep(600 + k * 2500);
      try { j = JSON.parse(txt); } catch (e) { if (k === 3) throw new Error('réponse non JSON : ' + txt.slice(0, 40)); }
    }
    const p = j.query && j.query.pages && j.query.pages[0], c = p && p.coordinates && p.coordinates[0];
    const out = c && inBox(c) ? { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), title: `${lang}:${p.title}`, url: p.fullurl, qid: (p.pageprops || {}).wikibase_item || null } : null;
    cache['wiki:' + title] = out || { none: true, at: new Date().toISOString().slice(0, 10) };
    return out;
  } catch (e) { warn(`wikipedia ${title}: ${e.message}`); return null; }
}
async function locate(p) {
  for (const t of [].concat(p.wiki || [])) { const c = await wiki(t); if (c && !c.none) return c; }
  return null;
}

const sources = Object.assign({}, src.sources, { wiki: { title: 'Wikipedia (קואורדינטות)', url: 'https://www.wikipedia.org' } });
const known = new Set(Object.keys(sources));
const clean = f => Object.assign({ he: f.he, src: f.src }, f.official ? { official: true, page: f.page } : {});
const placeOut = async (p, kind) => {
  const c = await locate(p);
  if (!c) { err(`${kind} ${p.id} (${p.he}) : pas de coordonnées Wikipédia — non publié (titres essayés : ${[].concat(p.wiki || []).join(', ') || 'aucun'})`); return null; }
  const o = Object.assign({}, p, { lat: c.lat, lon: c.lon, coordSource: 'wiki', coordRef: c.title });
  delete o.wiki;
  if (o.facts) {
    o.facts = o.facts.filter(f => { const ok = known.has(f.src) && f.he; if (!ok) err(`${p.id} : fait sans source connue « ${(f.he || '').slice(0, 40)} »`); return ok; }).map(clean);
    if (!o.facts.length) { o.status = [...new Set((o.status || []).concat('unverified'))]; warn(`${p.id} : aucun fait sourcé — marqué « טרם אומת »`); }
  }
  for (const k of ['hours', 'visit', 'access']) if (!(k in o)) o[k] = null;
  return o;
};

const anchors = []; for (const a of src.anchors || []) { const o = await placeOut(a, 'départ'); if (o) anchors.push(o); }
const sites = []; for (const s of src.sites || []) { const o = await placeOut(s, 'lieu'); if (o) sites.push(o); }
const roads = (src.roads || []).map(r => Object.assign({}, r, { facts: (r.facts || []).filter(f => known.has(f.src)).map(clean) }));
const ids = new Set(sites.map(s => s.id).concat(roads.map(r => r.id))), aids = new Set(anchors.map(a => a.id));
const missions = [];
for (const m of src.missions || []) {
  const bad = m.slots.filter(sl => !ids.has(sl.best)).map(sl => sl.id).concat(m.long && !ids.has(m.long.best) ? ['long'] : []);
  if (m.start && !aids.has(m.start)) err(`mission ${m.id} : départ ${m.start} sans coordonnées`);
  if (m.end && !aids.has(m.end)) err(`mission ${m.id} : arrivée ${m.end} sans coordonnées`);
  if (bad.length) warn(`mission ${m.id} : lieu modèle absent pour ${bad.join(', ')} — le choix reste possible, sans « bonne réponse »`);
  const fixSlot = sl => ids.has(sl.best) || !sl.best ? sl : Object.assign({}, sl, { best: null, why: (sl.why ? sl.why + ' ' : '') + '(האתר שבמסמכים לא פורסם כאן: אין לו קואורדינטות מוויקיפדיה.)' });
  missions.push(Object.assign({}, m, { slots: m.slots.map(sl => fixSlot(Object.assign({}, sl, { alt: (sl.alt || []).filter(x => ids.has(x)) }))), long: m.long ? fixSlot(m.long) : m.long }));
}
const models = {};
for (const [k, v] of Object.entries(src.models || {})) {
  const site = v.site || k.replace(/^long_/, '');
  if (!ids.has(site)) { warn(`modèle ${k} : lieu non publié — retiré`); continue; }
  const site0 = [...(src.sites || []), ...(src.roads || [])].find(x => x.id === site);
  const srcOfMap = v.map ? [...new Set(v.map.flatMap(x => x.facts || []).map(i => site0 && site0.facts[i] && site0.facts[i].src).filter(Boolean))] : [];
  models[k] = Object.assign({}, v, { src: [...new Set((v.src || []).concat(srcOfMap))].filter(x => known.has(x)) });
  delete models[k].map;   // la correspondance phrase → faits reste dans la source (traçabilité), pas dans l'appli
}
const errorSets = (src.errorSets || []).map(e => Object.assign({}, e, { items: e.items.filter(it => it.ok || (it.fix && known.has(it.src))) }));

// temps de trajet (OSRM table)
let drive = cache['drive:' + id] || null;
const pts = anchors.concat(sites);
const sig = pts.map(p => p.id + '@' + p.lat + ',' + p.lon).join(';');
if (online && pts.length > 1 && (!drive || drive.sig !== sig)) {
  try {
    const coords = pts.map(p => `${p.lon},${p.lat}`).join(';');
    const j = await (await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`, { headers: { 'User-Agent': UA } })).json();
    if (j.code !== 'Ok') throw new Error(j.code);
    const legs = {};
    pts.forEach((a, i) => pts.forEach((b, k) => { if (i !== k && j.durations[i][k] != null) legs[`${a.id}>${b.id}`] = { min: Math.round(j.durations[i][k] / 60), km: Math.round(j.distances[i][k] / 100) / 10 }; }));
    drive = { source: 'OSRM (router.project-osrm.org), © OpenStreetMap — voiture, sans trafic', fetchedAt: new Date().toISOString().slice(0, 10), sig, legs };
    cache['drive:' + id] = drive;
  } catch (e) { warn('OSRM : ' + e.message); }
}
if (!drive) warn('pas de temps de trajet (lancer avec --online)');

const out = {
  region: src.region, he: src.he,
  about: `Contenu construit UNIQUEMENT à partir des documents du cours (${(src.course || []).map(c => 'סיור ' + c).join(', ')}, Drive) ; coordonnées : Wikipédia (titre cité par lieu). Les réponses modèles sont des exemples pédagogiques écrits à partir de ces documents, pas des corrigés officiels.`,
  statusLabels: { taught: 'נלמד בכיתה', visited: 'ביקרנו בשטח', material: 'מופיע בחומר', unverified: 'טרם אומת' },
  tags: src.newTags || {}, mapHint: src.mapHint || '',
  sources, sites, roads, missions, models, errorSets, pitfalls: src.pitfalls || [], anchors,
  drive: drive ? { source: drive.source, fetchedAt: drive.fetchedAt, legs: drive.legs } : undefined
};
const file = `${id.replace(/_/g, '-')}.json`;
const regsPath = new URL('public/exam/regions.json', ROOT), regs = JSON.parse(await readFile(regsPath, 'utf8'));
const r = regs.regions.find(x => x.id === src.region);
const publishable = sites.length >= 3 && missions.length && anchors.length && !report.some(l => l.startsWith('❌ mission'));
if (online || drive) {
  await writeFile(new URL('public/exam/' + file, ROOT), JSON.stringify(out, null, 1) + '\n');
  if (r && publishable) { r.file = file; r.missions = missions.map(m => m.id); await writeFile(regsPath, JSON.stringify(regs, null, 2) + '\n'); }
}
await writeFile(cachePath, JSON.stringify(cache, null, 1) + '\n');
console.log(`${publishable ? '🟢' : '🟡'} ${src.region} : ${sites.length}/${(src.sites || []).length} lieux, ${anchors.length} départs, ${missions.length} missions, ${Object.keys(models).length} modèles, trajets ${drive ? Object.keys(drive.legs).length : 0}`);
report.forEach(l => console.log('   ' + l));
