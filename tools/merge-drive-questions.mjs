// Fusionne content/drive-questions/tourXX.json dans public/guided-quiz.json.
// Format d'un fichier : { "tourId": "04", "sources": { "k": { "label": "...", "url": "..." } },
//   "questions": [ { "level": 1, "stop": "...", "src": "k", "q": "...", "a": ["bonne", "faux", "faux", "faux"], "e": "explication" } ] }
// La bonne réponse est toujours la première de "a" ; le jeu mélange l'ordre à l'affichage.
// Ré-exécutable : les questions N<tour>-… sont remplacées à chaque passage.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const quizPath = new URL('public/guided-quiz.json', ROOT);
const dir = new URL('content/drive-questions/', ROOT);
const quiz = JSON.parse(await readFile(quizPath, 'utf8'));
const errors = [];
const kept = quiz.questions.filter(q => !/^N\d\d-/.test(q.id));
const known = new Set(kept.map(q => q.question.trim()));
const added = [];

for (const f of (await readdir(dir)).filter(f => /^tour\d\d\.json$/.test(f)).sort()) {
  const d = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
  const tid = d.tourId, n = { 1: 0, 2: 0, 3: 0 };
  d.questions.forEach((x, i) => {
    const where = `${f} #${i + 1}`;
    if (![1, 2, 3].includes(x.level)) errors.push(`${where} : niveau`);
    if (!Array.isArray(x.a) || x.a.length !== 4 || new Set(x.a.map(s => s.trim())).size !== 4 || x.a.some(s => !s.trim())) errors.push(`${where} : 4 réponses distinctes`);
    if (!x.q || !x.e || !x.stop) errors.push(`${where} : question, explication et étape obligatoires`);
    const src = d.sources[x.src];
    if (!src || !/^https:\/\/(docs|drive)\.google\.com\//.test(src.url)) errors.push(`${where} : source « ${x.src} » invalide`);
    if (known.has(x.q.trim())) errors.push(`${where} : question en double « ${x.q} »`);
    known.add(x.q.trim());
    n[x.level]++;
    added.push({ id: `N${tid}-${x.level}-${String(n[x.level]).padStart(2, '0')}`, tourId: tid, level: x.level, source: 'tour' + tid, stop: x.stop,
      question: x.q.trim(), options: x.a.map(s => s.trim()), correct: 0, explanation: x.e.trim(), sourceUrl: src && src.url, sourceDoc: src && src.label });
  });
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
quiz.questions = [...kept, ...added];
quiz.version = new Date().toISOString().slice(0, 10) + '-drive-v3';
await writeFile(quizPath, JSON.stringify(quiz, null, 2) + '\n');

const by = {};
for (const q of quiz.questions) { const b = by[q.tourId] || (by[q.tourId] = { 1: 0, 2: 0, 3: 0 }); b[q.level]++; }
console.log(`+${added.length} questions · total ${quiz.questions.length}`);
for (const t of Object.keys(by).sort()) console.log(t, by[t][1], by[t][2], by[t][3], Math.min(by[t][1], by[t][2], by[t][3]) >= 20 ? '✅' : '…');
