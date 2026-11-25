// Construit public/<corpus>/places.json : calques « 🕌 קוראן » (corpus quran) et « ✝️ ברית חדשה » (corpus nt) de la carte.
// Même méthode que le calque תנ״ך (tools/build-tanakh.mjs) :
// - Coordonnées et identification : API Wikipédia en hébreu (prop=coordinates = Wikidata P625). Rien n'est saisi à la main.
// - Verset « r » : récupéré puis vérifié, le nom du lieu doit y figurer, sinon la référence est écartée.
//     quran : texte Tanzil via api.alquran.cloud (quran-simple-clean pour la vérification, quran-simple pour l'affichage).
//     nt    : traduction hébraïque de Delitzsch (getbible.net) si elle répond, sinon World English Bible (bible-api.com).
// - Événement « h » (histoire) : l'article Wikipédia en hébreu est récupéré, l'année doit figurer dans son introduction.
// Usage : node tools/build-scripture.mjs quran|nt   (nécessite Internet ; exécuté par .github/workflows/scripture.yml)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { hasNameHe, hasNameAr, hasNameEn, arNorm, gem, hasYear, yearSentence } from './scripture-lib.mjs';

const CORPUS = process.argv[2];
if (!['quran', 'nt'].includes(CORPUS)) { console.error('Usage : node tools/build-scripture.mjs quran|nt'); process.exit(2); }
const ROOT = new URL('..', import.meta.url);
const UA = 'MorehDerechNext/1.0 (https://github.com/lebrati58/moreh-derech-next)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const say = s => { log.push(s); console.log(s); };

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); if (r.status === 404) return null; if (r.status === 429) await sleep(8000); } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

const src = JSON.parse(await readFile(new URL(`content/${CORPUS}/places.src.json`, ROOT), 'utf8'));
const BOX = src.box;

// ---------- Wikipédia ----------
const wikiCache = new Map();
async function wiki(title, full) {
  const k = title + (full ? '#full' : '');
  if (wikiCache.has(k)) return wikiCache.get(k);
  const p0 = { format: 'json', formatversion: '2', redirects: '1', action: 'query', prop: 'coordinates|pageprops|info|extracts', inprop: 'url', ppprop: 'wikibase_item', exintro: '1', explaintext: '1', titles: title };
  if (!full) p0.exsentences = '2';
  const j = await getJSON('https://he.wikipedia.org/w/api.php?' + new URLSearchParams(p0)); await sleep(150);
  const p = j && j.query && j.query.pages && j.query.pages[0];
  const out = !p || p.missing || p.invalid ? null : (() => {
    const c = (p.coordinates || []).find(x => x.primary) || (p.coordinates || [])[0];
    return { title: p.title, url: p.fullurl, qid: p.pageprops && p.pageprops.wikibase_item, coord: c ? { lat: c.lat, lon: c.lon } : null, extract: (p.extract || '').replace(/\s+/g, ' ').trim() };
  })();
  // article sans coordonnées : on prend celles de son élément Wikidata (P625), s'il en a
  if (out && !out.coord && out.qid) {
    const wd = await getJSON('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetclaims', format: 'json', entity: out.qid, property: 'P625' }));
    const v = wd && wd.claims && wd.claims.P625 && wd.claims.P625[0] && wd.claims.P625[0].mainsnak.datavalue && wd.claims.P625[0].mainsnak.datavalue.value;
    if (v) { out.coord = { lat: v.latitude, lon: v.longitude }; out.coordFrom = 'wikidata'; }
  }
  wikiCache.set(k, out);
  return out;
}
async function searchTitles(q) {
  const sj = await getJSON('https://he.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '8', prop: 'coordinates' }));
  return ((sj && sj.query && sj.query.pages) || []).sort((a, b) => a.index - b.index).map(x => x.title + (x.coordinates ? ' @' + x.coordinates[0].lat.toFixed(3) + ',' + x.coordinates[0].lon.toFixed(3) : ' (sans coord.)'));
}

// Événement : l'année doit figurer dans l'introduction de l'article.
// « h » est le titre principal ; « alt » d'autres titres possibles (le premier qui contient l'année l'emporte).
async function verifyHistory(h, year, alt = []) {
  let w = null, why = [];
  for (const t of [h, ...alt]) {
    const x = await wiki(t.slice(3), true);
    if (!x) { why.push(`« ${t.slice(3)} » introuvable`); continue; }
    if (!hasYear(x.extract, year)) { why.push(`année ${year} absente de l'introduction de « ${x.title} »`); continue; }
    w = x; break;
  }
  const label = year + ' · ' + (w ? w.title : h.slice(3));
  if (!w) { const sug = await searchTitles(h.slice(3)); return { ok: false, label, why: why.join(' ; ') + (sug.length ? ' — articles proches : ' + sug.slice(0, 6).join(' | ') : '') }; }
  return { ok: true, label, verse: yearSentence(w.extract, year), lang: 'he', version: 'ויקיפדיה: ' + w.title, license: 'CC BY-SA 4.0', url: w.url, book: 'history', year };
}

// ---------- Coran ----------
const surahCache = new Map();
async function surah(n, ed) {
  const k = n + '/' + ed;
  if (!surahCache.has(k)) {
    const j = await getJSON(`https://api.alquran.cloud/v1/surah/${n}/${ed}`);
    surahCache.set(k, j && j.data && j.data.ayahs ? j.data.ayahs.map(a => a.text) : null);
    await sleep(200);
  }
  return surahCache.get(k);
}
// alquran.cloud ajoute la basmala au début du verset 1 (sauf sourates 1 et 9) : on la retire de l'affichage.
const dropBasmala = (t, n, v) => v === 1 && n !== 1 && arNorm(t).startsWith('بسم الله الرحمن الرحيم') ? t.split(/\s+/).slice(4).join(' ') : t;
async function verifyQuran(ref, place) {
  const m = /^(\d+):(\d+)$/.exec(ref); if (!m) throw new Error('Référence illisible : ' + ref);
  const n = +m[1], v = +m[2], book = m[1];
  if (!src.books[book]) throw new Error('Sourate absente de « books » : ' + book);
  const label = 'סורה ' + src.books[book].replace(' · ', ' (') + '), פסוק ' + v;
  const clean = await surah(n, 'quran-simple-clean');
  if (!clean || !clean[v - 1]) return { ok: false, label, why: 'verset introuvable' };
  const text = dropBasmala(clean[v - 1], n, v);
  if (!hasNameAr(text, place.match)) {
    const near = clean.map((t, i) => i + 1).filter(i => hasNameAr(clean[i - 1], place.match)).sort((a, b) => Math.abs(a - v) - Math.abs(b - v)).slice(0, 3);
    return { ok: false, label, why: 'nom absent du verset' + (near.length ? ' ; présent aux versets ' + near.join(', ') : ' ; absent de la sourate') };
  }
  const disp = await surah(n, 'quran-simple');
  return { ok: true, label, verse: dropBasmala((disp && disp[v - 1]) || clean[v - 1], n, v), lang: 'ar', version: 'Tanzil Quran Text (Simple), api.alquran.cloud', license: 'CC BY 3.0 — tanzil.net', url: `https://quran.com/${n}/${v}`, book };
}

// ---------- Nouveau Testament ----------
let heKey;
const chapCache = new Map();
async function heChapter(num, ch) {
  if (heKey === null) return null;
  const keys = heKey ? [heKey] : ['delitzsch', 'hebdelitzsch', 'heb_delitzsch'];
  for (const key of keys) {
    const j = await getJSON(`https://api.getbible.net/v2/${key}/${num}/${ch}.json`, 2); await sleep(150);
    const vs = j && (Array.isArray(j.verses) ? j.verses : j.verses && Object.values(j.verses));
    if (vs && vs.length && /[א-ת]/.test(vs.map(x => x.text).join(''))) {
      if (!heKey) { heKey = key; say(`ℹ texte hébreu : getbible « ${key} » (${j.translation || j.name || key})`); }
      return { verses: Object.fromEntries(vs.map(x => [+x.verse, String(x.text).trim()])), title: 'Delitzsch, ' + (j.translation || key) + ' (getbible.net)', license: 'domaine public' };
    }
  }
  if (!heKey) { heKey = null; say('ℹ texte hébreu de Delitzsch indisponible sur getbible.net : vérification sur le World English Bible'); }
  return null;
}
async function enChapter(id, ch) {
  const j = await getJSON(`https://bible-api.com/data/web/${id}/${ch}`); await sleep(2200);
  return j && j.verses ? { verses: Object.fromEntries(j.verses.map(x => [+x.verse, String(x.text).replace(/\s+/g, ' ').trim()])), title: 'World English Bible (bible-api.com)', license: 'Public Domain' } : null;
}
async function chapterNT(book, ch) {
  const k = book + ' ' + ch;
  if (!chapCache.has(k)) {
    const [id, num] = src.bookIds[book];
    chapCache.set(k, { he: await heChapter(num, ch), en: await enChapter(id, ch) });
  }
  return chapCache.get(k);
}
async function verifyNT(ref, place) {
  const m = /^(.+) (\d+):(\d+)$/.exec(ref); if (!m) throw new Error('Référence illisible : ' + ref);
  const book = m[1], ch = +m[2], v = +m[3];
  if (!src.books[book] || !src.bookIds[book]) throw new Error('Livre inconnu : ' + book);
  const label = src.books[book] + ' ' + gem(ch) + ', ' + gem(v);
  const c = await chapterNT(book, ch);
  if (c.he && c.he.verses[v] && hasNameHe(c.he.verses[v], place.match)) return { ok: true, label, verse: c.he.verses[v], lang: 'he', version: c.he.title, license: c.he.license, book };
  if (c.en && c.en.verses[v] && hasNameEn(c.en.verses[v], place.match_en || [])) return { ok: true, label, verse: c.en.verses[v], lang: 'en', version: c.en.title, license: c.en.license, book };
  if (!c.he && !c.en) return { ok: false, label, why: 'chapitre introuvable (réseau ?)' };
  const vs = c.en ? c.en.verses : c.he.verses, ok = t => c.en ? hasNameEn(t, place.match_en || []) : hasNameHe(t, place.match);
  const near = Object.keys(vs).map(Number).filter(i => ok(vs[i])).sort((a, b) => Math.abs(a - v) - Math.abs(b - v)).slice(0, 3);
  return { ok: false, label, why: 'nom absent du verset' + (near.length ? ' ; présent aux versets ' + near.join(', ') : ' ; absent du chapitre') };
}

const verifyVerse = CORPUS === 'quran' ? verifyQuran : verifyNT;
const verify = (ref, place) => ref.h ? verifyHistory(ref.h, ref.year, ref.alt) : verifyVerse(ref.r, place);
const refKey = ref => ref.h ? ref.h + '@' + ref.year : ref.r;

// ---------- construction ----------
const SOURCES = CORPUS === 'quran'
  ? 'נוסח הפסוקים: Tanzil (CC BY 3.0, דרך api.alquran.cloud), בערבית; התרגום לעברית הוא סיכום שנכתב לאפליקציה.'
  : 'נוסח הפסוקים: תרגום דליטש לעברית או World English Bible (נחלת הכלל), לפי מה שזמין.';
const out = {
  generatedAt: new Date().toISOString(), corpus: CORPUS, name: src.name,
  method: 'Lieux : coordonnées Wikipédia/Wikidata (P625). Versets : récupérés et vérifiés (le nom du lieu doit y figurer). Événements : l\'année doit figurer dans l\'introduction de l\'article Wikipédia.',
  license: 'Résumés de lieux : Wikipédia en hébreu, CC BY-SA 4.0. Coordonnées : Wikidata (CC0). Textes : version et licence indiquées pour chaque référence.',
  footHe: 'כל פסוק נבדק אוטומטית: שם המקום מופיע בו. כל אירוע היסטורי נבדק: השנה מופיעה בפתיח של הערך בוויקיפדיה. ' + SOURCES + ' המיקום והזיהוי: ויקיפדיה/ויקינתונים — יש זיהויים שנויים במחלוקת. הסיכומים נכתבו לאפליקציה.',
  books: src.books, kinds: src.kinds, places: [], unplaced: [], rejected: [], journeys: []
};
const byId = {};
for (const pl of src.places) {
  let w = null;
  for (const cand of pl.wiki) { const r = await wiki(cand.slice(3)); if (r && r.coord) { w = r; break; } if (r && !w) w = r; }
  const inBox = w && w.coord && w.coord.lat >= BOX.minLat && w.coord.lat <= BOX.maxLat && w.coord.lon >= BOX.minLon && w.coord.lon <= BOX.maxLon;
  const refs = [];
  for (const r of pl.refs) {
    const v = await verify(r, pl);
    if (v.ok) refs.push({ r: refKey(r), label: v.label, he: r.he, verse: v.verse, lang: v.lang, version: v.version, license: v.license, url: v.url, book: v.book, year: v.year });
    else { out.rejected.push({ place: pl.id, r: refKey(r), why: v.why }); say(`✗ ${pl.id} ${refKey(r)} (${v.label}) : ${v.why}`); }
  }
  if (!inBox) {
    const sug = await searchTitles(pl.he);
    say(`   suggestions ${pl.id} : ${sug.join(' | ')}`);
    out.unplaced.push({ id: pl.id, he: pl.he, wiki: w && w.title, why: !w ? 'article introuvable' : !w.coord ? 'article sans coordonnées' : 'hors du cadre' }); say(`⚠ ${pl.id} non placé (${pl.wiki.join(' | ')})`); continue;
  }
  if (!refs.length) { say(`⚠ ${pl.id} : aucune référence vérifiée, lieu écarté`); continue; }
  const o = { id: pl.id, he: pl.he, kind: pl.kind, lat: +w.coord.lat.toFixed(5), lon: +w.coord.lon.toFixed(5), wiki: { title: w.title, url: w.url, qid: w.qid, extract: w.extract, coordFrom: w.coordFrom || 'wikipedia' }, refs };
  if (pl.note) o.note = pl.note;
  out.places.push(o); byId[pl.id] = o;
  say(`✓ ${pl.id} ← ${w.title} (${o.lat}, ${o.lon}) · ${refs.length}/${pl.refs.length} réf.`);
}
for (const j of src.journeys) {
  const stops = [];
  for (const s of j.stops) {
    const pl = src.places.find(x => x.id === s.p); const placed = byId[s.p];
    if (!pl || !placed) { say(`⚠ parcours ${j.id} : étape ${s.p} non placée, ignorée`); continue; }
    const ref = s.h ? Object.assign({}, pl.refs.find(x => x.h === s.h) || { h: s.h }) : { r: s.r };
    if (s.h && !ref.year) { say(`✗ parcours ${j.id} ${s.p} : événement ${s.h} absent des références du lieu`); continue; }
    const v = await verify(ref, pl);
    if (!v.ok) { out.rejected.push({ journey: j.id, place: s.p, r: refKey(ref), why: v.why }); say(`✗ parcours ${j.id} ${s.p} ${refKey(ref)} : ${v.why}`); continue; }
    stops.push({ p: s.p, r: refKey(ref), label: v.label });
  }
  if (stops.length >= 2) out.journeys.push({ id: j.id, he: j.he, color: j.color, stops });
  else say(`⚠ parcours ${j.id} : moins de 2 étapes vérifiées, écarté`);
}
await mkdir(new URL(`public/${CORPUS}/`, ROOT), { recursive: true });
await writeFile(new URL(`public/${CORPUS}/places.json`, ROOT), JSON.stringify(out, null, 1) + '\n');
await writeFile(new URL(`tools/${CORPUS}-build.log`, ROOT), log.join('\n') + '\n');
say(`Lieux placés : ${out.places.length}/${src.places.length} · références écartées : ${out.rejected.length} · parcours : ${out.journeys.length}/${src.journeys.length}`);
