// Remplace les FAUSSES réponses des questions de public/guided-quiz.json à partir de tools/distractors/*.json.
// But : la bonne réponse ne doit plus se repérer à sa longueur (avant : la plus longue dans 71 % des cas).
// Ne touche jamais à la question, à la bonne réponse, à l'explication ni à la source.
// Usage : node tools/apply-distractors.mjs        → applique et affiche le contrôle
//         node tools/apply-distractors.mjs --check → contrôle seulement
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const QF = new URL('public/guided-quiz.json', root);
const data = JSON.parse(readFileSync(QF, 'utf8'));
const byId = new Map(data.questions.map(q => [q.id, q]));
const check = process.argv.includes('--check');
let changed = 0;
const errors = [];
if (!check) {
  for (const f of readdirSync(new URL('tools/distractors/', root)).filter(f => f.endsWith('.json')).sort()) {
    const patch = JSON.parse(readFileSync(new URL('tools/distractors/' + f, root), 'utf8'));
    for (const [id, wrong] of Object.entries(patch)) {
      if (id.startsWith('_')) continue;
      const q = byId.get(id);
      if (!q) { errors.push(`${f}: ${id} introuvable`); continue; }
      const right = q.options[q.correct];
      if (!Array.isArray(wrong) || wrong.length !== q.options.length - 1) { errors.push(`${f}: ${id} : ${q.options.length - 1} fausses réponses attendues`); continue; }
      const all = new Set([right, ...wrong].map(s => s.trim()));
      if (all.size !== q.options.length || wrong.some(w => !w.trim())) { errors.push(`${f}: ${id} : réponses vides ou en double`); continue; }
      const opts = wrong.slice(); opts.splice(q.correct, 0, right);
      if (JSON.stringify(opts) !== JSON.stringify(q.options)) { q.options = opts; changed++; }
    }
  }
}
// contrôle : la bonne réponse est-elle (strictement) la plus longue ?
const longest = q => { const L = q.options.map(o => o.length), c = L[q.correct]; return L.every((x, i) => i === q.correct || x < c); };
const per = {};
for (const q of data.questions) { const t = q.tourId || '-'; per[t] = per[t] || [0, 0]; per[t][0]++; if (longest(q)) per[t][1]++; }
const tot = Object.values(per).reduce((a, [n, l]) => [a[0] + n, a[1] + l], [0, 0]);
console.log(`bonne réponse = la plus longue : ${tot[1]}/${tot[0]} (${Math.round(100 * tot[1] / tot[0])} %) — au hasard ≈ 25 %`);
console.log(Object.entries(per).sort().map(([t, [n, l]]) => `${t}:${Math.round(100 * l / n)}%`).join(' '));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!check && changed) { writeFileSync(QF, JSON.stringify(data, null, 2) + '\n'); console.log(`${changed} questions mises à jour`); }
