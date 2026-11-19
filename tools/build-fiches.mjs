// Construit public/fiches/*.json (דפי חזרה) depuis content/fiches/*.json.
// Chaque point cite des qid de la banque du jeu (guided-quiz.json ou return-bus/<date>.json) :
// le script vérifie qu'ils existent, que chaque chiffre du texte est présent dans les faits cités,
// et remplace les qid par les liens sources. Usage : node tools/build-fiches.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));

export function loadBanks() {
  const banks = {};
  for (const q of read('public/guided-quiz.json').questions) (banks[q.tourId] ||= {})[q.id] = { text: [q.question, q.options[q.correct], q.explanation || '', q.stop || ''].join(' '), src: q.sourceUrl || '' };
  for (const f of readdirSync(join(root, 'public/return-bus')).filter(f => f.endsWith('.json'))) {
    const d = read('public/return-bus/' + f), id = 'trip-' + f.replace('.json', '');
    const names = Object.fromEntries((d.stops || []).map(s => [s.id, s.name]));
    banks[id] = Object.fromEntries(d.questions.map(q => [q.id, { text: [q.question, q.options[q.correct], q.explanation || '', names[q.stop] || ''].join(' '), src: q.source || '' }]));
  }
  return banks;
}

export function buildFiche(f, bank) {
  const errors = [];
  const items = [];
  const cite = (where, text, q, need = true) => {
    if (!text || !String(text).trim()) errors.push(`${where}: texte vide`);
    if (need && !(q || []).length) errors.push(`${where}: aucun qid`);
    const bad = (q || []).filter(x => !bank[x]);
    if (bad.length) errors.push(`${where}: qid inconnus ${bad.join(',')}`);
    const pool = (q || []).filter(x => bank[x]).map(x => bank[x].text).join(' ');
    for (const n of String(text).match(/\d+/g) || []) if ((q || []).length && !pool.includes(n)) errors.push(`${where}: chiffre ${n} absent des faits cités`);
    return [...new Set((q || []).map(x => bank[x]?.src).filter(Boolean))];
  };
  const out = {
    id: f.id, kind: f.id.startsWith('trip-') ? 'trip' : 'tour', title: f.title, date: f.date || '', oneLiner: f.oneLiner || '',
    mustKnow: (f.mustKnow || []).map((p, i) => ({ t: p.t, src: cite(`mustKnow[${i}]`, p.t, p.q) })),
    stops: (f.stops || []).map((s, i) => ({ name: s.name, oneLine: s.oneLine || '', points: (s.points || []).map((p, j) => ({ t: p.t, src: cite(`${s.name}[${j}]`, p.t, p.q) })) })),
    dates: (f.dates || []).map((d, i) => ({ when: d.when, what: d.what, src: cite(`dates[${i}]`, d.when + ' ' + d.what, d.q) })),
    terms: (f.terms || []).map((d, i) => ({ term: d.term, def: d.def, src: cite(`terms[${i}]`, d.term + ' ' + d.def, d.q) })),
    trick: f.trick || ''
  };
  if (!out.stops.length) errors.push('aucune תחנה');
  if (out.mustKnow.length < 3) errors.push('mustKnow trop court');
  return { out, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const banks = loadBanks();
  const dir = join(root, 'content/fiches');
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const cat = Object.fromEntries(read('public/siyurim-catalog.json').tours.map(t => [t.id, t]));
  const all = [];
  let bad = 0;
  if (!existsSync(join(root, 'public/fiches'))) mkdirSync(join(root, 'public/fiches'));
  for (const file of files) {
    const f = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (!f.date && cat[f.id]) f.date = cat[f.id].date || '';
    const { out, errors } = buildFiche(f, banks[f.id] || {});
    if (errors.length) { bad++; console.error(`❌ ${f.id}\n  ` + errors.join('\n  ')); continue; }
    if (!process.argv.includes('--check')) writeFileSync(join(root, 'public/fiches', f.id + '.json'), JSON.stringify(out) + '\n');
    all.push(out);
    console.log(`✅ ${f.id} ${f.title}: ${out.stops.length} תחנות, ${out.stops.reduce((a, s) => a + s.points.length, 0)} נקודות`);
  }
  const fiches = all.map(f => ({ id: f.id, kind: f.kind, title: f.title, date: f.date, stops: f.stops.length, route: f.stops.map(s => s.name) }))
    .sort((a, b) => a.kind !== b.kind ? (a.kind === 'trip' ? -1 : 1) : a.kind === 'trip' ? b.date.localeCompare(a.date) : a.id.localeCompare(b.id));
  if (!process.argv.includes('--check')) writeFileSync(join(root, 'public/fiches/index.json'), JSON.stringify({ v: Date.now().toString(36), fiches }, null, 1) + '\n');
  if (bad) process.exit(1);
}
