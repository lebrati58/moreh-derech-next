// ספריית רט״ג — métadonnées dérivées du texte par page (exécuté dans GitHub Actions, où se trouvent les textes) :
//  - heading : première ligne significative de la 1re page (pour distinguer les « גיליון 58 » entre eux) ;
//  - mentions : lieux du jeu cités dans le document, avec les numéros de page (pour relier documents ↔ sites).
// Rien du texte intégral n'est écrit dans le dépôt public.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const ROOT = new URL('../../', import.meta.url);
const TEXT = process.argv[2] || 'rtg-text';
const rd = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const places = [];
for (const r of (await rd('public/exam/regions.json')).regions.filter(r => r.file)) {
  const d = await rd('public/exam/' + r.file);
  for (const s of d.sites || []) places.push({ key: 'exam:' + r.id + ':' + s.id, he: s.he, short: s.short || s.he });
}
const ti = await rd('public/tours/index.json');
for (const t of (ti.tours || []).filter(t => t.public)) for (const s of (await rd('public/tours/' + t.id + '.json')).stops || []) places.push({ key: 'tour:' + t.id + ':' + s.id, he: s.name, short: s.name });
const norm = s => String(s || '').normalize('NFC').replace(/[״"׳'`(),.:;–—\-]/g, ' ').replace(/\s+/g, ' ').trim();
// mots génériques : jamais une clé à eux seuls (« הגנים » matcherait « רשות הטבע והגנים » dans tous les documents)
const STOP = new Set(['תל', 'גן', 'הגן', 'לאומי', 'הלאומי', 'שמורת', 'שמורה', 'נחל', 'הר', 'עין', 'מצפה', 'בית', 'חורבת', 'מערת', 'כביש', 'אתר', 'העיר', 'הדרכת', 'דרך', 'הגנים', 'הטבע', 'רשות', 'פארק', 'העתיק', 'העתיקה', 'הקדומה', 'תצפית', 'המרחץ', 'הרומי', 'בקיסריה', 'ים', 'המלח', 'הכנסת', 'בית', 'ישראל', 'ירושלים', 'הגדול', 'מסלול', 'שביל', 'הירדן', 'הצפוני', 'הדרומי', 'שאול', 'דוד', 'אליהו', 'המערות', 'הקשתות']);
// clé d'un lieu : ses mots distinctifs ; une clé d'UN seul mot doit faire ≥ 5 lettres et être précédée dans le texte
// d'un mot de lieu (תל / הר / גן לאומי / שמורת / נחל / מצפה / עין / חורבת / מערת / מבצר / קיבוץ / מושב)
const PLACE = '(?:תל|הר|גן לאומי|גן|שמורת|שמורת טבע|נחל|מצפה|עין|חורבת|מערת|מבצר|קיבוץ|מושב|אתר|גבעת|מנזר|כנסיית|בית הכנסת|מצודת)\\s+ה?';
const keys = places.map(p => {
  const w = norm(p.short).split(' ').filter(x => x.length > 1 && !STOP.has(x));
  if (!w.length) return null;
  const k = w.join(' ');
  if (w.length === 1 && w[0].length < 5) return null;
  return { p, k, single: w.length === 1 };
}).filter(Boolean);
const out = {};
for (const f of (await readdir(TEXT)).filter(f => f.endsWith('.json.gz'))) {
  const J = JSON.parse(gunzipSync(await readFile(TEXT + '/' + f)).toString('utf8'));
  const pages = J.pages || [];
  const first = (pages[0] && pages[0].text || '').split('\n').map(l => norm(l)).filter(l => l.split(' ').length >= 3 && l.length <= 100 && /[א-תA-Za-z]/.test(l));
  const mentions = [];
  for (const { p, k, single } of keys) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = single ? new RegExp(PLACE + esc + '($|[\\s])') : new RegExp('(^|[\\s])[והבלמש]?' + esc + '($|[\\s])');
    const hit = pages.filter(pg => re.test(' ' + norm(pg.text) + ' ')).map(pg => pg.n);
    if (hit.length) mentions.push({ place: p.key, he: p.he, pages: hit.slice(0, 30), count: hit.length });
  }
  mentions.sort((a, b) => b.count - a.count);
  out[J.id] = { heading: first[0] || null, mentions: mentions.slice(0, 12) };
}
await writeFile(new URL('content/rtg/derived.json', ROOT), JSON.stringify(out, null, 0) + '\n');
console.log(`dérivé : ${Object.keys(out).length} documents · ${Object.values(out).filter(x => x.mentions.length).length} citent au moins un lieu du jeu`);
