// ספריית רט״ג dans un vrai navigateur (Galaxy S24 + ordinateur) : recherche, filtres, guides en tête, fiche, lien officiel, RTL.
// Usage : CHROME=/chemin/chrome node tests/rtg-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || '';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
if (OUT) await mkdir(OUT, { recursive: true });
const CAT = JSON.parse(await readFile(join(ROOT, 'rtg/catalog.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const errors = [], ok = (c, m) => { if (!c) { errors.push(m); console.log('❌', m); } else console.log('✅', m); };
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const shot = n => OUT ? page.screenshot({ path: `${OUT}/rtg-${n}.png` }) : null;

await page.goto(base + 'rtg.html');
await page.waitForSelector('.doc');
ok(await page.evaluate(() => document.documentElement.dir === 'rtl' && getComputedStyle(document.body).direction === 'rtl'), 'RTL');
ok(/727|\d+ מסמכים/.test(await page.textContent('.count')) && (await page.textContent('.count')).includes(String(CAT.docs.length)), `compteur : ${CAT.docs.length} documents`);
const firstGuides = await page.$$eval('.doc', (els, n) => els.slice(0, n).every(e => e.classList.contains('guide')), CAT.counts.guides);
ok(firstGuides, `les ${CAT.counts.guides} « מדריך למדריך » sont en tête`);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile : pas de défilement horizontal');
await shot('1-liste');

// recherche par site
await page.fill('#q', 'לכיש'); await page.waitForTimeout(400);
const n1 = await page.$$eval('.doc', els => els.length);
ok(n1 >= 1 && (await page.textContent('.list')).includes('לכיש'), `recherche « לכיש » : ${n1} résultat(s)`);
await page.fill('#q', 'zzzz-introuvable'); await page.waitForTimeout(400);
ok((await page.textContent('.list')).includes('לא נמצאו'), 'recherche sans résultat : message clair');
await page.fill('#q', ''); await page.waitForTimeout(400);
// filtres
await page.selectOption('#ty', 'map'); await page.waitForTimeout(150);
const maps = await page.$$eval('.doc small', els => els.map(e => e.textContent));
ok(maps.length && maps.every(t => t.includes('מפה')), `filtre type « מפה » : ${maps.length}`);
await page.selectOption('#ty', ''); await page.selectOption('#lg', 'en'); await page.waitForTimeout(150);
ok((await page.$$eval('.doc small', els => els.every(e => e.textContent.includes('English')))), 'filtre langue « English »');
await page.selectOption('#lg', '');
const reg = CAT.docs.find(d => d.rga && d.rga !== 'כלל ארצי או סיווג לבדיקה')?.rga;
if (reg) { await page.selectOption('#rg', reg); await page.waitForTimeout(150); ok((await page.textContent('.list')).includes(reg) && /אוטומטי/.test(await page.textContent('.list')), `filtre région « ${reg} » (signalée automatique)`); await page.selectOption('#rg', ''); }
await page.click('#g'); await page.waitForTimeout(150);
ok((await page.$$('.doc')).length === CAT.counts.guides, 'bouton « רק מדריך למדריך »');
await shot('2-guides');
// fiche
await page.click('.doc'); await page.waitForSelector('.card h2');
const card = await page.textContent('.card');
ok(/מדריך למדריך/.test(card) && /עמודים/.test(card) && /שפה/.test(card), 'fiche : titre, type, pages, langue');
const href = await page.getAttribute('.card a.btn', 'href');
ok(/^https:\/\/(static\.|www\.)?parks\.org\.il\//.test(href || ''), `fiche : lien officiel parks.org.il (${(href || '').slice(0, 60)})`);
ok(await page.getAttribute('.card a.btn', 'target') === '_blank' && /noopener/.test(await page.getAttribute('.card a.btn', 'rel')), 'lien ouvert dans un nouvel onglet, sans accès à la page');
ok(/אינם מאוחסנים/.test(await page.textContent('#view')), 'crédit et mention « fichiers non hébergés »');
await shot('3-fiche');
await page.goBack(); await page.waitForSelector('.doc');
ok(true, 'retour à la liste');
// document relié au jeu
const linked = CAT.docs.find(d => d.ln);
if (linked) { await page.goto(base + 'rtg.html#/d/' + linked.id); await page.waitForSelector('.links a'); ok((await page.$$('.links a')).length >= 1, `liens vers le jeu (${linked.ln.map(l => l.he).join(', ')})`); }
// fiche d'un מדריך למדריך exploité : faits avec page, fiche de révision, questions à 3 niveaux et corrigé
const fx = CAT.docs.find(d => d.fx && d.ty === 'guide');
if (fx) {
  await page.goto(base + 'rtg.html#/d/' + fx.id); await page.waitForSelector('#facts details');
  const ft = await page.textContent('#facts');
  ok(/עמ׳ \d+/.test(ft) && /רמה 1/.test(ft) && /רמה 2/.test(ft) && /רמה 3/.test(ft), 'faits avec n° de page + questions des 3 niveaux');
  ok((await page.$$('#facts details')).length >= 3, 'faits groupés par thème (histoire, archéologie, géographie…)');
  await page.click('[data-ans]');
  ok(/מה צריך להופיע/.test(await page.textContent('.quiz')) && /מקור:/.test(await page.textContent('.quiz')), 'corrigé : éléments attendus + références');
  await shot('4-faits');
}
// חידון רט״ג : réponse ouverte, auto-vérification, points au מסע (chrono simulé)
if (fx) {
  await page.addInitScript(() => { try { localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false, asked: true })); } catch (e) {} });
  await page.goto(base + 'rtg.html#/q/' + fx.id); await page.waitForSelector('#go');
  const before = await page.evaluate(() => MDProgress.totals().points);
  await page.click('#go'); await page.waitForSelector('#ans');
  const F = JSON.parse(await readFile(join(ROOT, 'rtg/facts/' + fx.id + '.json'), 'utf8'));
  const qs = F.questions.slice().map((q, i) => Object.assign({ i }, q)).sort((a, b) => a.level - b.level);
  ok(/רמה 1/.test(await page.textContent('.hero')) && /שנ׳/.test(await page.textContent('.hero')), 'quiz : niveau 1 d’abord, chrono affiché');
  for (let k = 0; k < qs.length; k++) {
    await page.fill('#ans', k % 2 ? 'לא יודע' : qs[k].expected.join(' . '));
    await page.click('#chk'); await page.waitForSelector('#nxt');
    if (k === 0) ok((await page.$$eval('#res input:checked', e => e.length)) === qs[0].expected.length, 'auto-vérification : tous les éléments attendus repérés dans une bonne réponse');
    if (k === 1) ok((await page.$$eval('#res input:checked', e => e.length)) === 0, 'auto-vérification : rien coché sur « לא יודע »');
    await page.click('#nxt');
  }
  await page.waitForSelector('.hero h1');
  const after = await page.evaluate(() => MDProgress.totals().points);
  ok(after > before && /נקודות חדשות למסע/.test(await page.textContent('.hero')), `points ajoutés au מסע (+${after - before})`);
  await page.click('#again'); await page.waitForSelector('#go');
  ok(/שיא נוכחי/.test(await page.textContent('.hero')), 'quiz : le record est rappelé');
  await shot('5-quiz');
}
await ctx.close();
// ordinateur
const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const p2 = await c2.newPage(); p2.on('pageerror', e => errors.push('pageerror: ' + e.message));
await p2.goto(base + 'rtg.html'); await p2.waitForSelector('.doc');
ok((await p2.$$('.doc')).length === 40 && await p2.isVisible('#more'), 'ordinateur : 40 premiers + « עוד תוצאות »');
await c2.close();
ok(!errors.some(e => e.startsWith('pageerror')), 'aucune erreur JavaScript');
await browser.close(); server.close();
console.log(errors.length ? '\n' + errors.join('\n') : '\nTout est OK.');
process.exit(errors.length ? 1 : 0);
