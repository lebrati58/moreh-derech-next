// Construit public/places.json : coordonnées des étapes des 22 סיורים, telles que publiées par Wikipédia/Wikidata.
// Aucune coordonnée n'est saisie à la main : chaque point provient de l'API Wikipédia (prop=coordinates),
// avec le titre de l'article, son lien et l'identifiant Wikidata, pour vérification.
// Usage : node tools/build-places.mjs   (nécessite un accès Internet ; exécuté par .github/workflows/places.yml)
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Israël et territoires des סיורים (Golan, Judée-Samarie, Néguev) : un point hors de ce cadre est rejeté.
const BOX = { minLat: 29.4, maxLat: 33.45, minLon: 34.2, maxLon: 35.95 };

async function api(lang, params) {
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`HTTP error for ${url}`);
}

async function lookup(lang, title) {
  const j = await api(lang, { action: 'query', prop: 'coordinates|pageprops|langlinks|info', inprop: 'url', ppprop: 'wikibase_item', lllang: 'he', titles: title });
  const p = j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || p.invalid) return { found: false };
  const c = (p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0];
  const heTitle = lang === 'he' ? p.title : ((p.langlinks || [])[0] || {}).title || null;
  return { found: true, title: p.title, url: p.fullurl, qid: p.pageprops && p.pageprops.wikibase_item, coord: c ? { lat: c.lat, lon: c.lon } : null, heTitle };
}

async function heSummary(title) {
  if (!title) return null;
  const j = await api('he', { action: 'query', prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1', exsentences: '2', titles: title });
  const p = j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || !p.extract) return null;
  return { title: p.title, url: p.fullurl, extract: p.extract.replace(/\s+/g, ' ').trim() };
}

const src = JSON.parse(await readFile(new URL('tools/places-sources.json', ROOT), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('public/siyurim-catalog.json', ROOT), 'utf8'));
const out = { generatedAt: new Date().toISOString(), method: 'Wikipedia API prop=coordinates (Wikidata P625). Étapes sans article fiable : non placées.', license: 'Résumés : Wikipédia en hébreu, CC BY-SA 4.0. Coordonnées : Wikidata (CC0).', regions: src.regions, themes: src.themes, tours: {} };
let placed = 0, total = 0;

for (const tour of catalog.tours) {
  const cfg = src.tours[tour.id];
  if (!cfg) throw new Error('Pas de configuration pour le סיור ' + tour.id);
  const stops = [];
  for (const name of tour.stops) {
    total++;
    const cands = cfg.stops[name];
    if (cands === undefined) throw new Error(`Étape absente de places-sources.json : ${tour.id} / ${name}`);
    const stop = { name, placed: false };
    if (!cands) { stop.reason = 'generic'; stops.push(stop); continue; }
    for (const cand of cands) {
      const [lang, title] = [cand.slice(0, 2), cand.slice(3)];
      const r = await lookup(lang, title); await sleep(150);
      if (!r.found) continue;
      if (!r.coord) { stop.reason = stop.reason || 'no-coordinates'; stop.wiki = stop.wiki || { lang, title: r.title, url: r.url }; continue; }
      const { lat, lon } = r.coord;
      if (lat < BOX.minLat || lat > BOX.maxLat || lon < BOX.minLon || lon > BOX.maxLon) { stop.reason = 'outside-israel'; continue; }
      Object.assign(stop, { placed: true, lat: +lat.toFixed(5), lon: +lon.toFixed(5), qid: r.qid || null, wiki: { lang, title: r.title, url: r.url } });
      delete stop.reason;
      const he = await heSummary(r.heTitle); await sleep(150);
      if (he) stop.he = he;
      break;
    }
    if (!stop.placed && !stop.reason) stop.reason = 'not-found';
    if (stop.placed) placed++;
    stops.push(stop);
    console.log(`${tour.id} ${stop.placed ? '📍' : '·'} ${name} ${stop.placed ? `${stop.lat},${stop.lon} ${stop.wiki.lang}:${stop.wiki.title} ${stop.qid}` : stop.reason}`);
  }
  out.tours[tour.id] = { region: cfg.region, themes: cfg.themes, stops };
}
out.stats = { stops: total, placed };
await writeFile(new URL('public/places.json', ROOT), JSON.stringify(out, null, 1) + '\n');
console.log(`OK : ${placed}/${total} étapes placées.`);
