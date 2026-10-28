// « סיפורי דרך » dans un vrai navigateur — Samsung Galaxy S24 (360×780, tactile) puis ordinateur.
// Accueil → liste (seulement les parcours publiés) → route 67 : carte, מצב לימוד (citation, côté, réponse + sources),
// nasiya simulée qui ouvre les lieux toute seule, retour Android → מצב מבחן (chrono, expiration, pause, points)
// → brouillon 01 en aperçu (bandeau, pas de carte, pas de points) → lien direct sans aperçu bloqué.
// Usage : CHROME=/chemin/chrome node tests/tours-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-tours';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--no-zygote'] });
const errors = [];
const ok = (c, m) => { if (!c) { errors.push('ASSERT: ' + m); console.log('❌', m); } else console.log('✅', m); };
async function newPage(opts) {
  const ctx = await browser.newContext(Object.assign({ locale: 'he-IL' }, opts));
  await ctx.route(/supabase\.co|tile\.openstreetmap|sw\.js/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|fetching the script/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { if (!localStorage.getItem('mdl_player_v1')) localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false, asked: true })); } catch (e) {} });
  return { ctx, page };
}
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const jsErrors = () => !errors.some(e => !e.startsWith('ASSERT'));
const correctIdx = p => p.evaluate(() => { const s = MDTourApp.state(), t = MDTourApp.tour(); const q = t.qAll.find(x => x.id === s.ids[s.i]); return q.correct; });

{
  const { ctx, page } = await newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.clock.install();
  const shot = n => page.screenshot({ path: `${OUT}/s24-${n}.png` });
  await page.goto(base + 'index.html');
  await page.waitForSelector('a.map-banner.roads');
  ok(await page.isVisible('a.map-banner.roads'), 'accueil : entrée « סיפורי דרך על המפה »');
  await page.locator('a.map-banner.roads').scrollIntoViewIfNeeded(); await shot('01-accueil');
  await page.tap('a.map-banner.roads');
  await page.waitForSelector('.titem');
  ok(await page.locator('.titem').count() === 1, 'liste : seul le parcours publié (route 67) est visible');
  ok(!(await page.textContent('#below')).includes('טיוטה'), 'liste : aucun brouillon montré aux élèves');
  await shot('02-liste');
  await page.tap('.titem');
  await page.waitForSelector('#map .pin');
  ok(await page.locator('#map .pin').count() === 14, 'route 67 : 14 lieux sur la carte');
  ok(await page.locator('#map svg path').count() >= 1, 'route 67 : tracé dessiné');
  ok(await noHScroll(page), 'pas de défilement horizontal');
  await shot('03-route67');

  // מצב לימוד
  await page.tap('a.mode:not(.exam)');
  await page.waitForSelector('.stopbar');
  ok((await page.textContent('.stopbar')).includes('1 מתוך 14'), 'לימוד : lieu 1/14');
  ok(await page.isVisible('.side'), 'לימוד : côté du bus affiché');
  const card = page.locator('.q').first();
  const qid = await card.getAttribute('data-q');
  const right = await page.evaluate(id => MDTourApp.tour().qAll.find(q => q.id === id).correct, qid);
  await card.locator(`[data-i="${(right + 1) % 4}"]`).tap();
  ok(await page.locator('.q .ans.wrong').count() === 1 && await page.locator('.q .ans.correct').count() === 1, 'לימוד : erreur → bonne réponse montrée');
  ok((await page.textContent('.q .fb')).includes('מסמך הקורס'), 'לימוד : source affichée sous l’explication');
  await shot('04-limud');
  await page.tap('#nextStop');
  await page.waitForFunction(() => location.hash.endsWith('/study/1'));
  ok((await page.textContent('.stopbar')).includes('2 מתוך 14'), 'לימוד : lieu suivant');
  // nasiya simulée : le lieu suivant s'ouvre tout seul
  await page.tap('[data-ride="sim"]');
  await page.tap('[data-mul="20"]');
  await page.clock.runFor(30000);
  const n = await page.evaluate(() => Number(location.hash.split('/').pop()));
  ok(n >= 2, `simulation : le bus avance et ouvre les lieux suivants (lieu ${n + 1})`);
  ok(await page.isVisible('.bus'), 'simulation : bus sur la carte');
  await shot('05-simulation');
  await page.tap('[data-ride="manual"]');
  await page.goBack();
  ok(/#\/t\/road67$/.test(page.url()) || /study\/\d+$/.test(page.url()), 'retour Android : on reste dans le parcours');

  // מצב מבחן
  await page.goto(base + 'parcours.html#/t/road67/exam');
  await page.waitForSelector('#startExam');
  await shot('06-mivhan-regles');
  await page.tap('#startExam');
  await page.waitForSelector('.q .ans');
  ok((await page.textContent('.hud')).includes('מתוך 14'), 'מבחן : 14 questions');
  await page.clock.runFor(4000);
  let c = await correctIdx(page);
  await page.tap(`.q [data-i="${c}"]`);
  ok(await page.locator('.ans.correct').count() === 0, 'מבחן : pas de correction pendant l’examen');
  ok((await page.textContent('#hScore')) === '178', 'מבחן : 100 + 3 × 26 s = 178');
  await shot('07-mivhan');
  await page.tap('#next');
  await page.clock.runFor(31000);
  await page.waitForSelector('.fb');
  ok((await page.textContent('.fb')).includes('נגמר הזמן'), 'מבחן : expiration = erreur');
  await page.tap('#next');
  // arrière-plan → pause, question masquée
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await page.isVisible('#resume'), 'מבחן : pause quand l’appli passe en arrière-plan');
  ok(await page.locator('.q').count() === 0, 'pause : question masquée');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await page.tap('#resume');
  for (let k = 2; k < 14; k++) { c = await correctIdx(page); await page.clock.runFor(2000); await page.tap(`.q [data-i="${c}"]`); await page.tap('#next'); }
  await page.waitForSelector('.corr li');
  ok((await page.textContent('.res')).includes('13 / 14'), 'résultat : 13 / 14');
  ok(await page.locator('.corr li').count() === 14, 'correction : 14 questions détaillées');
  ok((await page.textContent('.corr')).includes('מסמך הקורס'), 'correction : sources');
  const pts = await page.evaluate(() => MDProgress.totals().points);
  ok(pts > 0 && (await page.textContent('.res')).includes('נקודות חדשות'), `points ajoutés au total central (${pts})`);
  await shot('08-tikun');

  // brouillon 01 en aperçu
  await page.goto(base + 'parcours.html?preview=1#/');
  await page.waitForSelector('.titem');
  ok(await page.locator('.titem').count() === 2, 'aperçu : le brouillon 01 apparaît');
  ok((await page.textContent('#below')).includes('טיוטה'), 'aperçu : badge « טיוטה »');
  await page.tap('.titem >> nth=1');
  await page.waitForSelector('.draft');
  ok(await page.isVisible('.nomap'), '01 : pas de carte tant que les coordonnées ne sont pas vérifiées');
  await shot('09-brouillon');
  await page.tap('a.mode:not(.exam)');
  await page.waitForSelector('.quote');
  ok((await page.textContent('.card')).includes('מה המורה אמר'), '01 : citations de l’enregistrement du prof');
  ok((await page.textContent('.side')).includes('לפי המורה'), '01 : côté donné par le prof');
  await shot('10-brouillon-limud');
  await page.goto(base + 'parcours.html?preview=1#/t/01/exam');
  await page.waitForSelector('#startExam');
  const nEx = await page.evaluate(() => MDTourEngine.questionsFor(MDTourApp.tour(), 'exam').length);
  ok(nEx > 0 && !(await page.evaluate(() => MDTourEngine.questionsFor(MDTourApp.tour(), 'exam').some(q => q.certainty === 'anecdote'))), `01 : examen sans anecdotes (${nEx} questions)`);
  await page.tap('#startExam');
  for (let k = 0; k < nEx; k++) { c = await correctIdx(page); await page.tap(`.q [data-i="${c}"]`); await page.tap('#next'); }
  await page.waitForSelector('.res');
  ok((await page.textContent('.res')).includes('לא נספר'), '01 : brouillon — points non comptés');
  ok(await page.evaluate(() => MDProgress.totals().points) === pts, 'total central inchangé après le brouillon');
  // lien direct sans aperçu
  await page.goto(base + 'parcours.html#/t/01');
  await page.waitForSelector('#view .card');
  ok((await page.textContent('#view')).includes('עוד לא פורסם'), 'lien direct vers un brouillon : bloqué pour les élèves');
  ok(jsErrors(), 'S24 : aucune erreur JavaScript');
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base + 'parcours.html#/t/road67');
  await page.waitForSelector('#map .pin');
  await page.screenshot({ path: `${OUT}/desktop-01.png` });
  await page.goto(base + 'parcours.html#/t/road67/exam');
  await page.waitForSelector('#startExam'); await page.click('#startExam'); await page.waitForSelector('.q .ans');
  const c = await correctIdx(page);
  await page.keyboard.press(String(c + 1));
  ok(await page.evaluate(() => MDTourApp.state().answers[0].correct), 'clavier : touches 1–4');
  ok(await page.evaluate(() => document.activeElement.id === 'next'), 'clavier : focus sur « suivante »');
  await page.screenshot({ path: `${OUT}/desktop-02.png` });
  ok(jsErrors(), 'ordinateur : aucune erreur JavaScript');
  await ctx.close();
}
await browser.close(); server.close();
console.log(errors.length ? `\n${errors.length} problème(s) :\n` + errors.join('\n') : '\nTout est OK.');
process.exit(errors.length ? 1 : 0);
