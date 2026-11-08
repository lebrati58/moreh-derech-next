// Mode Confort et modes de l'accueil : contrôles statiques (le comportement est vérifié par tests/modes-browser.mjs).
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const read = f => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const PAGES = ['index', 'guided-tour', 'parta', 'history', 'architecture', 'campus', 'journey', 'sadna', 'exam', 'solo', 'play'];

test('comfort.js chargé dans le <head> des pages de jeu (avant l’affichage)', () => {
  for (const p of PAGES) {
    const h = read(p + '.html'), i = h.indexOf('comfort.js');
    assert.ok(i > 0 && i < h.indexOf('</head>'), p + '.html');
  }
  assert.match(read('index.html'), /<script src="comfort\.js" data-scope="home"><\/script>/);
});

test('comfort.js disponible hors ligne (service worker)', () => {
  const sw = read('sw.js');
  assert.match(sw, /'\.\/comfort\.js'/);
  assert.match(sw, /const CACHE = 'mdl-next-v97-confort'/);
});

test('le chronomètre n’est désactivable que dans les quiz d’entraînement', () => {
  assert.match(read('parta-app.js'), /MDComfort\.noTimer\(\)/);
  assert.match(read('architecture/app.js'), /MDComfort\.noTimer\(\)/);
  assert.match(read('history-app.js'), /cfg\.mode !== 'exam' && window\.MDComfort && MDComfort\.noTimer\(\)/);
  for (const f of ['campus/campus-app.js', 'exam/exam-app.js']) assert.doesNotMatch(read(f), /noTimer/, f + ' garde son chronomètre');
});

test('comfort.js : réglages locaux uniquement, 4 langues complètes', () => {
  const c = read('comfort.js');
  assert.doesNotMatch(c, /fetch\(|XMLHttpRequest|sendBeacon|supabase/i, 'rien n’est envoyé');
  const keys = l => [...c.matchAll(new RegExp(l + ': \\{([^}]*)\\}', 'g'))].map(m => [...m[1].matchAll(/(\w+): '/g)].map(x => x[1]).sort().join());
  const he = keys('he')[0];
  assert.ok(he && he.split(',').length >= 20);
  for (const l of ['fr', 'en', 'ru']) assert.equal(keys(l)[0], he, l);
});

test('accueil : 4 modes, rien n’est supprimé, la visite guidée montre tout', () => {
  const h = read('index.html');
  assert.match(h, /\['amateur','explorer','doctorant','guide'\]/);
  assert.match(h, /html:not\(\.ob-touring\) \.mode-hidden\{display:none!important\}/);
  assert.doesNotMatch(h, /\.remove\(\)|removeChild/, 'les blocs sont masqués, jamais retirés');
  const ob = read('onboarding.js');
  assert.match(ob, /classList\.add\('ob-touring'\)/); assert.match(ob, /classList\.remove\('ob-touring'\)/);
  for (const l of ['he', 'fr', 'en', 'ru']) assert.match(h, new RegExp(' ' + l + ":\\{title:'"), l);
});
