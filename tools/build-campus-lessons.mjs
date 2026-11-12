// Construit public/campus/lessons.json (banque « 📚 שיעורי התיאוריה » du jeu אלוף הקורס)
// à partir des fichiers content/campus/<thème>.json écrits d'après les documents du Drive (voir content/campus/SPEC.md).
// Contrôles : 4 réponses distinctes, une bonne réponse, niveau 1–3, source Drive présente, réponse absente de la question,
// pas de question en double. Toute question non conforme est écartée (et listée).
// Usage : node tools/build-campus-lessons.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';

const DIR = new URL('../content/campus/', import.meta.url);
const OUT = new URL('../public/campus/lessons.json', import.meta.url);
// ordre d'affichage = ordre du cours
const ORDER = ['intro', 'geology', 'prehistory', 'bronze', 'iron', 'persian', 'hellenistic', 'hasmonean', 'roman', 'byzantine', 'medieval', 'religions', 'heritage', 'har_hazeitim'];
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = s => clean(s).replace(/[״"׳'?.,:;!()\-–—]/g, '').toLowerCase();

const files = (await readdir(DIR)).filter(f => f.endsWith('.json')).sort();
const topics = [], questions = [], rejected = [], seenText = new Set();
for (const f of files) {
  const d = JSON.parse(await readFile(new URL(f, DIR), 'utf8'));
  if (!d.topic || !/^[a-z_]{2,20}$/.test(d.topic) || !Array.isArray(d.questions)) { rejected.push(`${f}: fichier mal formé`); continue; }
  // source = document du Drive (lien obligatoire) ou transcript d'un סיור (kind: "transcript", sans lien)
  const src = {}; (d.sources || []).forEach(s => {
    if (!s || !s.id) return;
    if (/^https:\/\/(drive|docs)\.google\.com\//.test(s.url || '')) src[s.id] = { title: clean(s.title), url: s.url };
    else if (s.kind === 'transcript' && clean(s.title)) src[s.id] = { title: clean(s.title), url: '' };
  });
  let n = 0;
  d.questions.forEach((q, i) => {
    const id = clean(q.id) || `${d.topic}-${i + 1}`, why = [];
    const opts = Array.isArray(q.options) ? q.options.map(clean) : [];
    const text = clean(q.q);
    if (opts.length !== 4 || new Set(opts).size !== 4 || opts.some(o => !o || o.length > 90)) why.push('réponses');
    if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4)) why.push('bonne réponse');
    if (![1, 2, 3].includes(q.level)) why.push('niveau');
    if (!text || text.length > 200) why.push('question');
    if (!src[q.src]) why.push('source');
    if (opts.some(o => /כל התשובות|אף אחת|אף תשובה|תשובות [אב]['׳]? ו/.test(o))) why.push('réponse « toutes / aucune »');
    const good = opts[q.correct] || '';
    if (good.length >= 4 && norm(text).includes(norm(good))) why.push('réponse dans la question');
    const key = norm(text);
    if (seenText.has(key)) why.push('doublon');
    if (why.length) { rejected.push(`${f} ${id}: ${why.join(', ')}`); return; }
    seenText.add(key);
    const s = src[q.src];
    questions.push({ id, topic: d.topic, level: q.level, q: text, options: opts, correct: q.correct, explanation: clean(q.explanation), source: s.title, url: s.url });
    n++;
  });
  if (n) topics.push({ id: d.topic, he: clean(d.he), emoji: clean(d.emoji), count: n });
}
topics.sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99 || a.id.localeCompare(b.id));
const out = { version: new Date().toISOString().slice(0, 10), about: 'שאלות מתוך מסמכי שיעורי התיאוריה בדרייב של הקורס. לכל שאלה קישור למסמך המקור.', topics, questions };
await writeFile(OUT, JSON.stringify(out) + '\n');
console.log(`${questions.length} questions, ${topics.length} thèmes → public/campus/lessons.json`);
topics.forEach(t => console.log(`  ${t.emoji} ${t.he}: ${t.count}`));
if (rejected.length) { console.log(`\n${rejected.length} écartées :`); rejected.forEach(r => console.log('  - ' + r)); }
