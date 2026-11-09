// « חומר עזר למבחן » (document Word de révision) → atelier 180·400, répertoire de l'examen, quiz.
// Entrées : content/ezer/chomer-ezer.json (texte du document découpé par site)
//           content/ezer/out/*.json (fiches, faits et questions rédigés à partir de ce texte)
// Règle : toute citation (ev / q / quote) doit se trouver MOT POUR MOT dans le texte du site ; sinon l'élément est écarté.
// Sorties : public/sadna/ezer.json (fiches + quiz de l'atelier)
//           public/exam/<région>.json : faits « ezer » ajoutés aux lieux existants qui portent le même nom
//           content/ezer/report.json (écarts, lieux sans correspondance dans le répertoire, doutes)
// Usage : node tools/build-ezer.mjs [--check]   (--check : n'écrit rien, échoue si une citation est introuvable)
import { readFile, writeFile, readdir } from 'node:fs/promises';
const ROOT = new URL('..', import.meta.url);
const rj = async p => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const CHECK = process.argv.includes('--check');

const norm = s => String(s || '').replace(/[‎‏‪-‮]/g, '').replace(/[״“”]/g, '"').replace(/[׳’‘]/g, "'")
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const he = s => /[֐-׿]/.test(s || '');
const words = s => norm(s).split(' ').filter(Boolean).length;

const DOC = await rj('content/ezer/chomer-ezer.json');
const R = await rj('public/exam/regions.json');
const REG = Object.fromEntries(R.regions.map(r => [r.id, r]));
const outFiles = (await readdir(new URL('content/ezer/out/', ROOT))).filter(f => f.endsWith('.json')).sort();
const OUT = {};
for (const f of outFiles) for (const o of await rj('content/ezer/out/' + f)) OUT[o.id] = o;

const report = { dropped: [], doubts: [], unmatched: [], missing: [] };
const routes = [], routeId = new Map();
const sites = [], quiz = [];
const CATS = new Set(['view', 'road', 'water', 'burial', 'walls', 'worship', 'battle', 'settle', 'geo', 'city']);

for (const src of DOC.sites) {
  const o = OUT[src.id];
  if (!o) { report.missing.push(src.id + ' ' + src.he); continue; }
  (o.doubts || []).forEach(d => report.doubts.push({ id: src.id, site: src.he, he: d }));
  if (o.skip) continue;
  const T = norm(src.text);
  const inText = (q, what) => { const ok = !!q && words(q) >= 4 && T.includes(norm(q)); if (!ok) report.dropped.push({ id: src.id, what, q }); return ok; };
  const keys = (o.keys || []).filter(k => he(k.he) && words(k.he) <= 22 && inText(k.ev, 'key')).map(k => ({ he: norm(k.he), ev: norm(k.ev) }));
  if (keys.length < 2 || !he(o.hook) || !he(o.close) || !REG[o.region]) { report.dropped.push({ id: src.id, what: 'card', q: src.he }); continue; }
  const r = src.routeShort || src.route;
  if (!routeId.has(r)) { routeId.set(r, 'r' + String(routes.length + 1).padStart(2, '0')); routes.push({ id: routeId.get(r), he: r, n: 0 }); }
  const rid = routeId.get(r); routes.find(x => x.id === rid).n++;
  const facts = (o.facts || []).filter(f => he(f.he) && words(f.he) <= 30 && inText(f.q, 'fact')).map(f => ({ he: norm(f.he), q: norm(f.q) }));
  sites.push({ id: src.id, he: norm(src.he), route: rid, routeHe: r, region: o.region, regHe: REG[o.region].he, t: o.t === '400' ? '400' : '180',
    per: norm(o.per), where: norm(o.where), hook: norm(o.hook), keys, close: norm(o.close), tool: norm(o.tool),
    cats: (o.cats || []).filter(c => CATS.has(c)), facts });
  (o.quiz || []).forEach((q, i) => {
    const opts = (q.options || []).map(norm);
    const good = he(q.q) && opts.length === 4 && opts.every(he) && new Set(opts).size === 4 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4
      && !opts.some(x => /כל התשובות|אף תשובה/.test(x)) && he(q.why) && inText(q.quote, 'quiz');
    if (good) quiz.push({ id: `${src.id}-q${i + 1}`, site: src.id, q: norm(q.q), options: opts, correct: q.correct, why: norm(q.why), quote: norm(q.quote) });
    else report.dropped.push({ id: src.id, what: 'quiz-format', q: q.q });
  });
}

// ---- répertoire de l'examen : faits ajoutés aux lieux du même nom (idempotent : les anciens faits « ezer » sont remplacés) ----
const key = s => norm(s).replace(/["'()\-–,.]/g, ' ').replace(/^(ה|ב|ל)(?=[א-ת]{3})/, '').replace(/\s+/g, ' ').trim();
const strip = s => key(s).split(' ').filter(w => !/^(גן|לאומי|שמורת|הטבע|אתר|תל|חורבת|מצודת|כנסיית|בית|הכנסת)$/.test(w)).join(' ');
let added = 0;
const regionFiles = {};
for (const r of R.regions.filter(r => r.file)) regionFiles[r.id] = await rj('public/exam/' + r.file);
for (const d of Object.values(regionFiles)) for (const s of d.sites) s.facts = (s.facts || []).filter(f => f.src !== 'ezer');
for (const s of sites) {
  const d = regionFiles[s.region]; if (!d || !s.facts.length) { report.unmatched.push({ id: s.id, he: s.he, region: s.region }); continue; }
  const a = strip(s.he);
  const hit = d.sites.find(x => { const b = strip(x.short || x.he); return a.length >= 3 && b.length >= 3 && (a === b || a.includes(b) || b.includes(a)); });
  if (!hit) { report.unmatched.push({ id: s.id, he: s.he, region: s.region }); continue; }
  s.repertoire = hit.id;
  const have = new Set(hit.facts.map(f => norm(f.he)));
  for (const f of s.facts) if (!have.has(f.he)) { hit.facts.push({ he: f.he, src: 'ezer', q: f.q }); added++; }
}
const EZ_SRC = { title: 'חומר עזר למבחן — תקצירים לטבלה / נקודות הרחבה', note: 'קובץ Word שליונל שלח (9.11.2026); לא בדרייב הקורס. כל עובדה מלווה במשפט המקורי.' };

const data = { v: 1, builtAt: new Date().toISOString().slice(0, 10), title: DOC.title, routes, sites, quiz };
const bad = report.dropped.filter(x => x.what !== 'quiz-format');
console.log(`🟢 ${sites.length} fiches · ${quiz.length} questions · ${routes.length} itinéraires · ${added} faits ajoutés au répertoire`);
console.log(`   écartés : ${report.dropped.length} (citations introuvables ${bad.length}) · sans lieu dans le répertoire ${report.unmatched.length} · doutes ${report.doubts.length} · non traités ${report.missing.length}`);
if (CHECK) process.exit(report.missing.length ? 1 : 0);
await writeFile(new URL('public/sadna/ezer.json', ROOT), JSON.stringify(data) + '\n');
for (const r of R.regions.filter(r => r.file)) {
  const d = regionFiles[r.id];
  if (d.sites.some(s => s.facts.some(f => f.src === 'ezer'))) d.sources.ezer = EZ_SRC; else delete d.sources.ezer;
  await writeFile(new URL('public/exam/' + r.file, ROOT), JSON.stringify(d, null, 1) + '\n');
}
await writeFile(new URL('content/ezer/report.json', ROOT), JSON.stringify(report, null, 1) + '\n');
