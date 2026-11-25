// Construit public/tanakh/places.json : calque « תנ״ך » de la carte.
// - Coordonnées et identification : API Wikipédia en hébreu (prop=coordinates = Wikidata P625). Rien n'est saisi à la main.
// - Chaque référence biblique est vérifiée : le verset est récupéré sur Sefaria et le nom du lieu doit y figurer
//   (texte sans voyelles ni cantillation, préfixes ו/ב/כ/ל/מ/ה/ש et suffixes ה/תה admis). Sinon la référence est écartée
//   et le journal propose le verset voisin du même chapitre qui contient le nom.
// Usage : node tools/build-tanakh.mjs   (nécessite Internet ; exécuté par .github/workflows/tanakh.yml)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { strip, hasName, gem } from './tanakh-lib.mjs';

const ROOT = new URL('..', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BOX = { minLat: 29.4, maxLat: 33.45, minLon: 34.2, maxLon: 35.95 };
const log = [];
const say = s => { log.push(s); console.log(s); };

async function getJSON(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); if (r.status === 404) return null; } catch {}
    await sleep(1500 * (i + 1));
  }
  throw new Error('HTTP ' + url);
}

// ---------- texte biblique (Sefaria) ----------
const chapCache = new Map();
async function chapter(book, ch) {
  const k = book + ' ' + ch;
  if (!chapCache.has(k)) {
    const j = await getJSON('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(book.replace(/ /g, '_') + '.' + ch) + '?version=hebrew');
    const v = j && j.versions && j.versions[0];
    chapCache.set(k, v ? { verses: v.text, title: v.versionTitle, license: v.license || '', source: v.versionSource || '' } : null);
    await sleep(120);
  }
  return chapCache.get(k);
}
function parseRef(r) { const m = /^(.+) (\d+):(\d+)$/.exec(r); if (!m) throw new Error('Référence illisible : ' + r); return { book: m[1], ch: +m[2], v: +m[3] }; }

async function verify(ref, stems, books) {
  const { book, ch, v } = parseRef(ref);
  if (!books[book]) throw new Error('Livre inconnu : ' + book);
  const c = await chapter(book, ch);
  const label = books[book] + ' ' + gem(ch) + ', ' + gem(v);
  if (!c || !c.verses[v - 1]) return { ok: false, label, why: 'verset introuvable' };
  const text = c.verses[v - 1];
  if (hasName(text, stems)) return { ok: true, label, text: String(text).replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim(), version: c.title, license: c.license, source: c.source };
  const near = c.verses.map((t, i) => i + 1).filter(i => hasName(c.verses[i - 1], stems)).sort((a, b) => Math.abs(a - v) - Math.abs(b - v)).slice(0, 3);
  return { ok: false, label, why: 'nom absent du verset' + (near.length ? ' ; présent aux versets ' + near.join(', ') : ' ; absent du chapitre') };
}

// ---------- coordonnées (Wikipédia / Wikidata) ----------
async function wiki(title) {
  const p0 = new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', action: 'query', prop: 'coordinates|pageprops|info|extracts', inprop: 'url', ppprop: 'wikibase_item', exintro: '1', explaintext: '1', exsentences: '2', titles: title });
  const j = await getJSON('https://he.wikipedia.org/w/api.php?' + p0); await sleep(150);
  const p = j && j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || p.invalid) return null;
  const c = (p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0];
  return { title: p.title, url: p.fullurl, qid: p.pageprops && p.pageprops.wikibase_item, coord: c ? { lat: c.lat, lon: c.lon } : null, extract: (p.extract || '').replace(/\s+/g, ' ').trim() };
}

const src = JSON.parse(await readFile(new URL('content/tanakh/places.src.json', ROOT), 'utf8'));
const out = {
  generatedAt: new Date().toISOString(),
  method: 'Lieux : coordonnées Wikipédia/Wikidata (P625). Références : chaque verset récupéré sur Sefaria ; le nom du lieu doit y figurer, sinon la référence est écartée.',
  license: 'Résumés de lieux : Wikipédia en hébreu, CC BY-SA 4.0. Coordonnées : Wikidata (CC0). Texte biblique : Sefaria (version et licence indiquées pour chaque verset).',
  books: src.books, kinds: src.kinds, places: [], unplaced: [], rejected: [], journeys: []
};
const byId = {};
for (const pl of src.places) {
  let w = null;
  for (const cand of pl.wiki) { const r = await wiki(cand.slice(3)); if (r && r.coord) { w = r; break; } if (r && !w) w = r; }
  const inBox = w && w.coord && w.coord.lat >= BOX.minLat && w.coord.lat <= BOX.maxLat && w.coord.lon >= BOX.minLon && w.coord.lon <= BOX.maxLon;
  const refs = [];
  for (const r of pl.refs) {
    const v = await verify(r.r, pl.match, src.books);
    if (v.ok) refs.push({ r: r.r, label: v.label, he: r.he, verse: v.text, version: v.version, license: v.license, book: parseRef(r.r).book });
    else { out.rejected.push({ place: pl.id, r: r.r, why: v.why }); say(`✗ ${pl.id} ${r.r} (${v.label}) : ${v.why}`); }
  }
  if (!inBox) {
    // aide : articles proches (recherche Wikipédia) avec leurs coordonnées, à vérifier avant de les ajouter à la liste source
    const sj = await getJSON('https://he.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', action: 'query', generator: 'search', gsrsearch: pl.he, gsrlimit: '8', prop: 'coordinates' }));
    const sug = ((sj && sj.query && sj.query.pages) || []).sort((a, b) => a.index - b.index).map(x => x.title + (x.coordinates ? ' @' + x.coordinates[0].lat.toFixed(3) + ',' + x.coordinates[0].lon.toFixed(3) : ' (sans coord.)'));
    say(`   suggestions ${pl.id} : ${sug.join(' | ')}`);
    out.unplaced.push({ id: pl.id, he: pl.he, wiki: w && w.title, why: !w ? 'article introuvable' : !w.coord ? 'article sans coordonnées' : 'hors du cadre' }); say(`⚠ ${pl.id} non placé (${pl.wiki.join(' | ')})`); continue; }
  if (!refs.length) { say(`⚠ ${pl.id} : aucune référence vérifiée, lieu écarté`); continue; }
  const o = { id: pl.id, he: pl.he, kind: pl.kind, lat: +w.coord.lat.toFixed(5), lon: +w.coord.lon.toFixed(5), wiki: { title: w.title, url: w.url, qid: w.qid, extract: w.extract }, refs };
  out.places.push(o); byId[pl.id] = o;
  say(`✓ ${pl.id} ← ${w.title} (${o.lat}, ${o.lon}) · ${refs.length}/${pl.refs.length} réf.`);
}
for (const j of src.journeys) {
  const stops = [];
  for (const s of j.stops) {
    const pl = src.places.find(x => x.id === s.p); const placed = byId[s.p];
    if (!pl || !placed) { say(`⚠ parcours ${j.id} : étape ${s.p} non placée, ignorée`); continue; }
    const v = await verify(s.r, pl.match, src.books);
    if (!v.ok) { out.rejected.push({ journey: j.id, place: s.p, r: s.r, why: v.why }); say(`✗ parcours ${j.id} ${s.p} ${s.r} : ${v.why}`); continue; }
    stops.push({ p: s.p, r: s.r, label: v.label });
  }
  if (stops.length >= 2) out.journeys.push({ id: j.id, he: j.he, color: j.color, stops });
}
await mkdir(new URL('public/tanakh/', ROOT), { recursive: true });
await writeFile(new URL('public/tanakh/places.json', ROOT), JSON.stringify(out, null, 1) + '\n');
await writeFile(new URL('tools/tanakh-build.log', ROOT), log.join('\n') + '\n');
say(`Lieux placés : ${out.places.length}/${src.places.length} · références écartées : ${out.rejected.length} · parcours : ${out.journeys.length}`);
