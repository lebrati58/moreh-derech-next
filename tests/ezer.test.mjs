// « חומר עזר למבחן » dans l'atelier 180·400 et le répertoire : chaque citation est dans le document, quiz bien formé,
// révision espacée (boîtes de Leitner), faits du répertoire sourcés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import '../public/sadna/sadna-data.js';
const D = globalThis.MDSadna;
const J = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const norm = s => String(s || '').replace(/[‎‏‪-‮]/g, '').replace(/[״“”]/g, '"').replace(/[׳’‘]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
// Le texte intégral n'est pas versionné (dépôt public) : les citations sont vérifiées quand il est présent en local.
const HAS_DOC = existsSync(new URL('../content/ezer/chomer-ezer.json', import.meta.url));
const DOC = HAS_DOC ? J('content/ezer/chomer-ezer.json') : null, EZ = J('public/sadna/ezer.json');
const TEXT = HAS_DOC ? Object.fromEntries(DOC.sites.map(s => [s.id, norm(s.text)])) : null;
const inDoc = (id, q) => !TEXT || (TEXT[id] || '').includes(norm(q));
const inAny = q => !TEXT || Object.values(TEXT).some(t => t.includes(norm(q)));

test('fiches : chaque point clé cite une phrase exacte du document', () => {
  assert.ok(EZ.sites.length >= 150, EZ.sites.length + ' fiches');
  for (const s of EZ.sites) {
    assert.ok(/^ez\d{3}$/.test(s.id), s.id + ' : id');
    assert.ok(s.keys.length >= 2 && s.hook && s.close, s.id + ' : fiche complète');
    for (const k of s.keys) assert.ok(k.ev && inDoc(s.id, k.ev), `${s.id} : citation introuvable « ${k.ev} »`);
    assert.ok(EZ.routes.some(r => r.id === s.route), s.id + ' : itinéraire');
  }
});

test('quiz : 4 réponses distinctes, une bonne, preuve citée du document', () => {
  assert.ok(EZ.quiz.length >= 200, EZ.quiz.length + ' questions');
  const ids = new Set(EZ.sites.map(s => s.id));
  for (const q of EZ.quiz) {
    assert.ok(ids.has(q.site), q.id + ' : site publié');
    assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4);
    assert.ok(q.correct >= 0 && q.correct < 4);
    assert.ok(!q.options.some(o => /כל התשובות/.test(o)), q.id + ' : pas de « כל התשובות »');
    assert.ok(q.quote && inDoc(q.site, q.quote), `${q.id} : preuve introuvable`);
  }
});

test('révision espacée : ידעתי monte d’une boîte (1, 3, 7, 21 jours), לחזור revient à zéro, ordre de passage', () => {
  const DAY = 864e5;
  let s = D.grade(null, true, 0); assert.deepEqual([s.b, s.due], [1, DAY]);
  s = D.grade(s, true, 0); s = D.grade(s, true, 0); assert.equal(s.b, 3); assert.ok(D.mastered(s));
  s = D.grade(s, true, 0); s = D.grade(s, true, 0); assert.equal(s.b, 4, 'plafond');
  assert.equal(D.grade(s, false, 5).b, 0); assert.equal(D.grade(s, false, 5).due, 5, 'à revoir tout de suite');
  const st = { a: { b: 2, due: 5 }, b: { b: 0, due: 1 }, c: { b: 1, due: 99 } };
  assert.deepEqual(D.dueList(['a', 'b', 'c', 'd'], st, 10), ['b', 'a', 'd'], 'dues (boîte basse d’abord), puis nouvelles ; pas les futures');
});

test('répertoire de l’examen : faits « ezer » sourcés et cités mot pour mot', () => {
  const R = J('public/exam/regions.json'); let n = 0;
  const bySite = Object.fromEntries(EZ.sites.map(s => [s.id, s]));
  for (const r of R.regions.filter(r => r.file)) {
    const d = J('public/exam/' + r.file);
    const fs = d.sites.flatMap(s => s.facts.filter(f => f.src === 'ezer'));
    if (fs.length) assert.ok(d.sources.ezer && d.sources.ezer.title, r.id + ' : source ezer déclarée');
    for (const f of fs) { n++; assert.ok(f.q && inAny(f.q), `${r.id} : « ${f.q} » introuvable`); }
  }
  assert.ok(n >= 50, n + ' faits ajoutés');
  assert.ok(EZ.sites.filter(s => s.repertoire).every(s => bySite[s.id]));
});

test('page : onglets חזרה et חידון, données chargées et en cache hors ligne', () => {
  const html = readFileSync(new URL('../public/sadna.html', import.meta.url), 'utf8');
  for (const t of ['#review', '#quiz', 'sadna/ezer.json', 'mdl_sadna_review']) assert.ok(html.includes(t), t);
  assert.match(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), /'\.\/sadna\/ezer\.json'/);
});
