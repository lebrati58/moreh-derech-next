// « הרפרטואר שלי » dans un téléphone simulé : grille région × catégorie, choix du site, fiche, révision de mémoire,
// préparation d'un sujet, mission verrouillée jusqu'à maîtrise, chrono par unité dans l'examen blanc.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2];
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe });
const errors = [], ok = (c, m) => { if (!c) { errors.push(m); console.log('❌', m); } else console.log('✅', m); };

for (const vp of [{ width: 360, height: 780, mobile: true }, { width: 1280, height: 860, mobile: false }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'he-IL', serviceWorkers: 'block' });
  await ctx.route(/unpkg\.com|jsdelivr|openfreemap|amazonaws|project-osrm/, r => r.abort());
  const page = await ctx.newPage(), tag = vp.mobile ? 'mobile' : 'desktop';
  page.on('pageerror', e => errors.push(`${tag} pageerror: ` + e.message));
  page.on('dialog', d => d.accept());
  const shot = async n => { if (OUT) await page.screenshot({ path: `${OUT}/rep-${tag}-${n}.png`, fullPage: true }); };
  const noHScroll = async m => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tag} : pas de défilement horizontal (${m})`);

  await page.goto(base + 'exam.html');
  await page.waitForSelector('.hero');
  ok(await page.$('a.rep-cta[href="#/rep"]'), `${tag} accueil : bouton « הרפרטואר שלי »`);
  ok(/מתחלף כל יום/.test(await page.textContent('.daily')), `${tag} accueil : la mission du jour explique le verrouillage`);
  await page.click('a.rep-cta');
  await page.waitForSelector('.rgrid');
  ok((await page.$$('.rgrid .rcell')).length === 10, `${tag} répertoire : 10 catégories`);
  await page.click('[data-rregion="negev"]');
  await page.waitForFunction(() => /הנגב/.test(document.querySelector('.brief .eyebrow').textContent));
  ok(true, `${tag} répertoire : changement de région (Néguev) sans quitter l'écran`);
  await noHScroll('grille');
  await shot('1-grid');

  await page.click('.rcell[href="#/rep/c/water"]');
  await page.waitForSelector('[data-pick]');
  ok(await page.$('[data-pick="tel_beer_sheva"]'), `${tag} מים / Néguev : Tel Beer Sheva proposé`);
  await page.click('[data-pick="tel_beer_sheva"]');
  await page.waitForSelector('#rText');
  ok((await page.$$('.fx-list .fx')).length >= 3, `${tag} fiche : faits du cours`);
  ok(!(await page.$('.fx-list a.src')), `${tag} fiche : plus de lien à côté de chaque phrase`);
  await page.click('.fx-list .fx summary');
  ok(/«.+»/.test(await page.textContent('.fx[open] .fq')), `${tag} fiche : au toucher, la phrase originale du cours s'affiche dessous`);
  const txt = 'חברים, אנחנו בתל באר שבע. מפעל המים אסף את מי השיטפונות מנחל חברון. תעלת הולכה הובילה את המים למאגרים תת-קרקעיים בתוך המצודה, צמוד לחומת העיר. הבורות מטויחים, ורואים שהטיח נמרח בידיים.';
  await page.fill('#rText', txt);
  ok(/wc-low/.test(await page.innerHTML('#rWc')), `${tag} fiche : compteur de mots (jaune sous 170)`);
  await page.click('#rSave');
  await page.waitForFunction(() => /חזרה הבאה/.test(document.body.textContent));
  ok(true, `${tag} fiche enregistrée, prochaine révision annoncée`);
  await shot('2-card');

  // un jour plus tard : la fiche est échue
  await page.evaluate(() => { const k = 'mdl_exam_v1', s = JSON.parse(localStorage.getItem(k)); Object.values(s.rep.cards).forEach(c => { c.due = Date.now() - 1000; }); localStorage.setItem(k, JSON.stringify(s)); });
  await page.goto(base + 'exam.html#/rep'); await page.reload();
  await page.waitForSelector('.rgrid');
  ok(/1 יחידות לחזור/.test(await page.textContent('.brief')), `${tag} répertoire : « 1 à réviser aujourd'hui »`);
  await page.click('a[href="#/rep/review"]');
  await page.waitForSelector('#vText');
  await page.fill('#vText', 'בתל באר שבע מפעל המים אסף מי שיטפונות מנחל חברון בתעלה אל מאגרים תת-קרקעיים מטויחים בתוך המצודה צמוד לחומה.');
  await page.click('#vCheck');
  await page.waitForSelector('.score .big');
  const pct = +(await page.textContent('.score .big')).replace(/\D/g, '');
  ok(pct >= 40 && pct <= 100, `${tag} révision : score de mémoire ${pct} %`);
  ok(await page.$('#vOut details'), `${tag} révision : fiche d'origine consultable après coup`);
  await noHScroll('révision');
  await shot('3-review');

  // préparation : le sujet d'abord, la réponse ensuite
  await page.goto(base + 'exam.html#/rep/m/ng2');
  await page.waitForSelector('.brief h1');
  ok(/מלחמה, מים/.test(await page.textContent('.brief h1')), `${tag} préparation : sujet ng2 ouvert`);
  ok(!/בחומר הקורס:/.test(await page.textContent('#app')), `${tag} préparation : aucune réponse visible avant d'essayer`);
  await page.click('[data-reveal="d"]');
  ok(!/בחומר הקורס:/.test(await page.textContent('#app')), `${tag} préparation : impossible de révéler sans avoir écrit un site`);
  await page.fill('[data-guess="d"]', 'תל שבע');
  await page.click('[data-reveal="d"]');
  await page.waitForFunction(() => /בחומר הקורס:/.test(document.body.textContent));
  const txt4 = await page.textContent('#app');
  ok(/«תל שבע» ✔/.test(txt4), `${tag} préparation : « תל שבע » reconnu comme Tel Beer Sheva ✔`);
  ok(/ברפרטואר שלכם: תל באר שבע/.test(txt4), `${tag} préparation : rappel du site du répertoire après coup`);
  await shot('4-prep');

  // verrouiller un sujet jusqu'à maîtrise
  await page.click('a[href="#/focus/ng2"]');
  await page.waitForFunction(() => /הנושא הנעול/.test(document.body.textContent));
  ok(/0\/2/.test(await page.textContent('.daily')), `${tag} accueil : sujet verrouillé, 0/2 examens réussis`);
  await page.click('#unfocus');
  await page.waitForFunction(() => /מתחלף כל יום/.test(document.body.textContent));
  ok(true, `${tag} accueil : déverrouillage`);

  // conditions réelles : nom du site écrit de mémoire, carte sans points, reconnaissance à la remise
  await page.evaluate(() => { const k = 'mdl_exam_v1', s = JSON.parse(localStorage.getItem(k)); delete (s.exams || {}).ng2; localStorage.setItem(k, JSON.stringify(s)); });
  await page.goto(base + 'exam.html#/'); await page.reload(); await page.waitForSelector('.hero');
  await page.goto(base + 'exam.html#/m/ng2/exam');
  await page.waitForSelector('#realChk');
  ok(await page.isChecked('#realChk'), `${tag} examen blanc : « conditions réelles » coché par défaut`);
  await page.click('#go');
  await page.waitForSelector('#bareMap');
  ok(!(await page.$('#sugg')) && !(await page.$('.pr select[data-k="site"]')), `${tag} conditions réelles : ni suggestion d'itinéraire ni liste de sites dans le לו״ז`);
  await page.click('.xtabs [data-t="ud"]');
  await page.waitForSelector('[data-f="siteText"]');
  ok(!(await page.$('select[data-f="site"]')), `${tag} conditions réelles : le site s'écrit, il ne se choisit pas dans une liste`);
  await page.fill('[data-f="siteText"]', 'מפעל המים בתל שבע');
  await page.fill('[data-f="text"]', 'חברים, אנחנו בתל באר שבע. מפעל המים אסף את מי השיטפונות מנחל חברון.');
  await page.click('#sub');
  await page.waitForSelector('.score .big');
  await page.$$eval('details.part', ds => ds.forEach(d => { d.open = true; }));
  ok(/זוהה: <b>תל באר שבע<\/b>/.test(await page.innerHTML('#app')), `${tag} correction : « מפעל המים בתל שבע » reconnu (תל באר שבע)`);
  await shot('6-real-result');

  // chrono par unité dans l'examen blanc
  await page.evaluate(() => { const k = 'mdl_exam_v1', s = JSON.parse(localStorage.getItem(k)); delete (s.exams || {}).ng2; localStorage.setItem(k, JSON.stringify(s)); });
  await page.goto(base + 'exam.html#/'); await page.reload(); await page.waitForSelector('.hero');
  await page.goto(base + 'exam.html#/m/ng2/exam');
  const start = await page.$('#go, #start, button.btn');
  if (start) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /להתחיל|Commencer/.test(x.textContent)); if (b) b.click(); }); }
  await page.waitForSelector('#pace b', { timeout: 5000 }).catch(() => {});
  ok(/לו״ז/.test(await page.textContent('#pace').catch(() => '')), `${tag} examen blanc : chrono par unité (« עכשיו: לו״ז »)`);
  await shot('5-pace');
  await ctx.close();
}
ok(!errors.some(e => /pageerror/.test(e)), 'aucune erreur JavaScript');
await browser.close(); server.close();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
