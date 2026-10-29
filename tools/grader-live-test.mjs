// Test réel de /api/grade sur le site en ligne : une réponse correcte, une partielle, une fausse.
// Usage : node tools/grader-live-test.mjs https://moreh-derech-next.<compte>.workers.dev
import { readFile } from 'node:fs/promises';
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) { console.error('usage: node tools/grader-live-test.mjs <url>'); process.exit(2); }
const data = JSON.parse(await readFile(new URL('../public/exam/golan-south.json', import.meta.url)));
const good = data.models.long_ein_keshatot.text;
const partial = good.split(/\s+/).slice(0, 70).join(' ');
const wrong = 'חברים, הגענו לעין קשתות. בית הכנסת הזה נבנה בימי הבית השני על ידי הורדוס, והוא נהרס בידי הרומאים בשנת 70 לספירה, יחד עם בית המקדש. ' +
  'החזית פונה צפונה, לכיוון ירושלים, ובפנים יש פסיפס גלגל המזלות הגדול בארץ. המקום נחפר לראשונה בשנות התשעים, ואז הוחלט לבנות אותו מחדש בבטון.';
const player = '00000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
const health = await (await fetch(base + '/api/grade')).json().catch(e => ({ error: String(e) }));
console.log('health', JSON.stringify(health));
let fails = 0;
for (const [name, text, check] of [['correcte', good, s => s >= 7], ['partielle', partial, s => s >= 2 && s <= 7], ['fausse', wrong, s => s <= 4]]) {
  const t0 = Date.now();
  const r = await fetch(base + '/api/grade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player, region: 'golan_south', mission: 'g1', slot: 'long', site: 'ein_keshatot', kind: 'long', text, place: 'ברחבה מול החזית', method: 'תוכנית בית הכנסת', minutes: 25 }) });
  const j = await r.json().catch(() => ({}));
  const s = j.grade && j.grade.score;
  const ok = r.status === 200 && j.ok && check(s);
  if (!ok) fails++;
  console.log(`${ok ? '✅' : '❌'} ${name}: HTTP ${r.status} · score ${s}/10 · saved=${j.saved} ${j.savedNote || ''} · ${Date.now() - t0} ms · erreurs ${j.grade ? j.grade.errors.length : '-'} · ${j.error || ''} ${j.detail || ''}`);
  if (j.grade) console.log('   ' + (j.grade.summary || '') + ' | erreurs: ' + j.grade.errors.map(e => e.claim).join(' ; ').slice(0, 300));
}
process.exit(fails ? 1 : 0);
