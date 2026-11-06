// סדנת 180 · 400 : budgets de mots, compteur identique au cahier, repères, fiches complètes et corrections vérifiées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../public/sadna/sadna-data.js';
import '../public/exam/exam-core.js';
const D = globalThis.MDSadna;
const C = globalThis.MDExamCore;

test('budgets : 180 et 400 mots, comme les limites du cahier d’examen', () => {
  const sum = k => D.PLAN[k].reduce((a, p) => a + p.w, 0);
  assert.equal(sum('180'), 180);
  assert.equal(sum('400'), 400);
  const MO = JSON.parse(readFileSync(new URL('../public/exam/models.json', import.meta.url)));
  assert.deepEqual([MO.models.school5.limits.shortWords, MO.models.school5.limits.longWords], [180, 400]);
  assert.deepEqual(D.MINUTES, { 180: 15, 400: 30 });
});

test('compteur : même résultat que « אתגר המבחן » (règle Excel du cahier)', () => {
  for (const t of ['', '  ', 'אנחנו עומדים — כאן', 'שורה\nשנייה  עם   רווחים', 'ב־1928 נמצא הפסיפס.']) {
    assert.equal(D.wordCount(t), C.wordCount(t), JSON.stringify(t));
  }
  assert.equal(D.wordState(181, 180).state, 'over');
  assert.equal(D.wordState(170, 180).state, 'ok');
  assert.equal(D.wordState(40, 180).state, 'low');
});

test('repères détectés dans un texte modèle', () => {
  const t = 'אנחנו עומדים בתיאטרון. הביטו למעלה. מדוע? בואו נעבור. במאה השנייה לספירה. לסיכום, מבינים ש…';
  assert.ok(D.checks(t).every(c => c.ok), D.checks(t).filter(c => !c.ok).map(c => c.k).join());
  assert.ok(D.checks('').every(c => !c.ok));
});

test('fiches : 18 sites complets, identifiants uniques, tout en hébreu', () => {
  assert.equal(D.SITES.length, 18);
  assert.equal(new Set(D.SITES.map(s => s.id)).size, 18);
  for (const s of D.SITES) {
    for (const f of ['he', 'sub', 'reg', 'per', 'where', 'hook', 'close', 'trap', 'tool']) assert.ok(s[f], s.id + ' : ' + f);
    assert.ok(['180', '400'].includes(s.t), s.id + ' : format');
    assert.ok(s.keys.length >= 4, s.id + ' : clés');
    const txt = [s.he, s.sub, s.reg, s.per, s.where, s.hook, s.close, s.trap, s.tool, ...s.keys].join(' ').replace(/<[^>]+>/g, '');
    assert.ok(!/[a-zà-ÿ]{3,}/i.test(txt.replace(/DNA/g, '')), s.id + ' : texte non hébreu');
  }
});

test('corrections vérifiées présentes (Hérodion, Ein Gedi, Tel Haï, Harod)', () => {
  const by = id => D.SITES.find(s => s.id === id);
  assert.match(by('herodion').trap, /15 לפנה״ס/);
  assert.match(by('herodion').trap, /סקו/);
  assert.match(by('eingedi').trap, /ביזנטי/);
  assert.match(by('telhai').trap, /ד׳ באייר/);
  assert.match(by('einharod').trap, /22 אלף/);
});

test('page : accessible depuis l’accueil et l’examen, en cache hors ligne', () => {
  const read = p => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
  assert.match(read('index.html'), /href="sadna\.html"/);
  assert.match(read('exam/exam-app.js'), /href="sadna\.html"/);
  const sw = read('sw.js');
  assert.match(sw, /'\.\/sadna\.html'/);
  assert.match(sw, /'\.\/sadna\/sadna-data\.js'/);
  const html = read('sadna.html');
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /tabbar\.js/);
});
