// ספריית רט״ג — construit le catalogue léger de l'appli (public/rtg/catalog.json) à partir de :
//   content/rtg/inventory.json   (import automatique : métadonnées, statut du texte, classifications AUTOMATIQUES)
//   content/rtg/corrections.json (corrections manuelles — prioritaires, jamais écrasées par l'import)
//   content/rtg/facts/<id>.json  (faits extraits, avec page — optionnel)
// et relie chaque document aux lieux déjà présents dans le jeu (régions de l'examen, parcours) par leur nom.
// Aucun texte intégral ni PDF n'est publié : seulement titre, type, langue, pages, région, liens officiels.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url);
const rd = async (p, d) => { try { return JSON.parse(await readFile(new URL(p, ROOT), 'utf8')); } catch (e) { return d; } };
const inv = await rd('content/rtg/inventory.json', null);
if (!inv) { console.error('pas d’inventaire (content/rtg/inventory.json) — lancer l’import d’abord'); process.exit(1); }
const corr = (await rd('content/rtg/corrections.json', { documents: {} })).documents || {};

// lieux du jeu : sites des 13 régions de l'examen + lieux des parcours
const places = [];
const regions = (await rd('public/exam/regions.json', { regions: [] })).regions.filter(r => r.file);
for (const r of regions) {
  const d = await rd('public/exam/' + r.file, null); if (!d) continue;
  for (const s of d.sites || []) places.push({ kind: 'exam', region: r.id, regionHe: r.he, id: s.id, he: s.he, short: s.short || s.he, mission: (d.missions || []).find(m => (m.slots || []).some(sl => sl.best === s.id) || (m.long || {}).best === s.id)?.id || null });
}
const tours = await rd('public/tours/index.json', { tours: [] });
for (const t of (tours.tours || []).filter(t => t.public)) {
  const d = await rd('public/tours/' + t.id + '.json', null);
  for (const s of (d && d.stops) || []) places.push({ kind: 'tour', tour: t.id, tourHe: t.title, id: s.id, he: s.name || s.he, short: s.name || s.he });
}
const norm = s => String(s || '').normalize('NFC').replace(/[״"׳'`(),.:;–—-]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['תל', 'גן', 'לאומי', 'שמורת', 'שמורה', 'נחל', 'הר', 'עין', 'מצפה', 'בית', 'חורבת', 'מערת', 'כביש', 'אתר', 'העיר', 'הדרכת', 'דרך']);
const keyOf = p => {   // nom distinctif d'un lieu (ex. « תל לכיש (גן לאומי) » → « לכיש »)
  const w = norm(p.short).split(' ').filter(x => x.length > 1 && !STOP.has(x));
  return w.length ? w.join(' ') : null;
};
const placeKeys = places.map(p => ({ p, k: keyOf(p) })).filter(x => x.k && x.k.length >= 3);
function linksFor(title) {
  const t = ' ' + norm(title) + ' ';
  const out = [];
  for (const { p, k } of placeKeys) if (t.includes(' ' + k + ' ') || t.includes(' ' + k + 'ה ') || t.includes(' ה' + k + ' ')) out.push(p);
  const seen = new Set();
  return out.filter(p => { const id = p.kind + ':' + (p.region || p.tour) + ':' + p.id; if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 8);
}

let factIds = new Set();
try { factIds = new Set((await readdir(new URL('content/rtg/facts/', ROOT))).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))); } catch (e) {}

const derived = await rd('content/rtg/derived.json', {});
const byKey = Object.fromEntries(places.map(p => [p.kind + ':' + (p.region || p.tour) + ':' + p.id, p]));
// type : titre « מדריך למדריך » d'abord, puis le sujet du manifeste (classement automatique de la collecte)
function typeOf(d) {
  const tt = (d.title || '') + ' ' + (d.fileName || '');
  if (/מדריך\s*[-–]?\s*ל?מדרי[ךכ]/.test(tt)) return 'guide';
  if (/מפה|מפת|\bmap\b/i.test(tt)) return 'map';
  if (/חוברת\s*הפעלה|דפי\s*צביעה|מערך|פקח(ים)?\s*צעיר|ניצנים|פעילות|ערכה|activity/i.test(tt)) return 'activity';
  if (/דוחות\s*כספיים|טפס|נהלים|הזמנה|ביטול|לינה|ceremony|form/i.test(tt)) return 'other';
  const sub = String(d.subject || '');
  if (/מפה ועלון/.test(sub) || /דפדפת|עלון|brochure|פלאייר/i.test(tt)) return 'brochure';
  if (/מאמר|כתב עת/.test(sub) || /גיליון/.test(tt)) return 'article';
  return d.type === 'guide' ? 'other' : (d.type || 'other');
}
const titleCount = {};
for (const d of inv.documents) titleCount[d.title] = (titleCount[d.title] || 0) + 1;
const docs = [];
for (const d of inv.documents) {
  const c = corr[d.id] || {};
  if (c.hide) continue;
  const dv = derived[d.id] || {};
  // titres génériques répétés (« גיליון 58 » ×19) : on ajoute la première ligne du document
  const title = c.title || (titleCount[d.title] > 1 && dv.heading ? `${d.title} — ${dv.heading}` : d.title);
  const fromText = (dv.mentions || []).filter(m => m.count >= 2 || (dv.mentions || []).length <= 3).map(m => Object.assign({}, byKey[m.place], { pages: m.pages })).filter(p => p.id);
  const fromTitle = linksFor(title + ' ' + (d.fileName || ''));
  const seen = new Set(), cand = [];
  for (const p of fromTitle.concat(fromText)) { const k = p.kind + ':' + (p.region || p.tour) + ':' + p.id; if (!seen.has(k)) { seen.add(k); cand.push(p); } }
  const links = (c.links || cand.slice(0, 8)).map(p => p.kind === 'exam'
    ? { k: 'exam', region: p.region, site: p.id, he: p.he, mission: p.mission || undefined, pages: p.pages ? p.pages.slice(0, 8) : undefined, auto: !c.links }
    : { k: 'tour', tour: p.tour, stop: p.id, he: p.he, pages: p.pages ? p.pages.slice(0, 8) : undefined, auto: !c.links });
  docs.push({
    id: d.id, t: title, f: d.fileName, ty: c.type || typeOf(d), lg: c.lang || d.lang || null, pg: d.pages || null,
    st: d.status, q: d.quality ?? null, ocr: d.ocrPages || 0,
    rg: c.regionVerified || null, rga: c.regionVerified ? null : (d.regionAuto || null),
    per: c.periods || null, pera: c.periods ? null : (d.periodsAuto || null),
    th: c.themes || [], site: c.site || (d.site && !/לא זוהה/.test(d.site) ? d.site : null), sitea: !c.site && d.site && !/לא זוהה/.test(d.site) ? true : undefined,
    u: c.officialUrl || d.officialUrl || null, sp: d.sourcePage || null,
    ln: links.length ? links : undefined, fx: factIds.has(d.id) || undefined
  });
}
const prio = { guide: 0, brochure: 1, map: 2, activity: 3, article: 4, other: 5 };
docs.sort((a, b) => (prio[a.ty] ?? 9) - (prio[b.ty] ?? 9) || a.t.localeCompare(b.t, 'he'));
const s = inv.summary || {};
await mkdir(new URL('public/rtg/', ROOT), { recursive: true });
await writeFile(new URL('public/rtg/catalog.json', ROOT), JSON.stringify({
  v: 1, built: new Date().toISOString().slice(0, 10), importDate: s.date || null,
  note: 'רשות הטבע והגנים — הקבצים אינם מאוחסנים באפליקציה; הקישור הוא לאתר הרשמי. אזורים ותקופות שסומנו ״אוטומטי״ טרם אומתו.',
  counts: { docs: docs.length, guides: docs.filter(d => d.ty === 'guide').length, withUrl: docs.filter(d => d.u).length, linked: docs.filter(d => d.ln).length },
  docs
}) + '\n');
console.log(`catalogue : ${docs.length} documents · ${docs.filter(d => d.ty === 'guide').length} מדריך למדריך · ${docs.filter(d => d.u).length} avec lien officiel · ${docs.filter(d => d.ln).length} reliés à des lieux du jeu`);
