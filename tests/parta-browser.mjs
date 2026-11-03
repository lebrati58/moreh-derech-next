// « מבחן חלק א׳ » dans un vrai navigateur — Galaxy S24 (360×780, tactile) puis ordinateur.
// Accueil → thèmes/niveaux → manche de 10 : réponse juste, réponse fausse, fin du temps, explication + source,
// résultat, points dans progress.js, « רק הטעויות », reprise après rechargement.
// Usage : CHROME=/chemin/chrome node tests/parta-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-parta';
const exe = process.env.CHROME || undefined;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--disable-gpu', '--no-zygote'] }, exe ? { executablePath: exe } : {}));
const errors = [];
const ok = (c, m) => { if (!c) { errors.push('ASSERT: ' + m); console.log('❌', m); } else console.log('✅', m); };
async function newPage(opts) {
  const ctx = await browser.newContext(Object.assign({ locale: 'he-IL' }, opts));
  await ctx.route(/supabase\.co|sw\.js/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|fetching the script/i.test(m.text())) errors.push('console: ' + m.text()); });
  return { ctx, page };
}
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const correctIdx = p => p.evaluate(() => { const s = MDPartAApp.state().run; return s.items[s.i].correct; });

{
  const { ctx, page } = await newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(base + 'parta.html');
  await page.waitForSelector('#start');
  const nTopics = await page.locator('.tp[data-topic]:not([disabled])').count();
  ok(nTopics >= 2, `accueil : thèmes jouables (${nTopics - 1} + מעורב)`);
  ok(await noHScroll(page), 'pas de défilement horizontal (360 px)');
  await page.screenshot({ path: `${OUT}/01-accueil.png`, fullPage: true });
  await page.click('[data-level="2"]');
  await page.click('#start');
  await page.waitForSelector('.ans');
  ok(await page.locator('.ans').count() === 4, 'manche : 4 réponses');
  ok(/1 \/ 10/.test(await page.textContent('.qhead')), 'compteur 1 / 10');
  // bonne réponse
  let c = await correctIdx(page);
  await page.click(`.ans[data-k="${c}"]`);
  ok(/נכון!/.test(await page.textContent('#expl')) && await page.locator('#expl a').count() === 1, 'bonne réponse : ✅ + explication + lien source');
  await page.screenshot({ path: `${OUT}/02-bonne.png` });
  await page.click('#next');
  // mauvaise réponse
  c = await correctIdx(page);
  await page.click(`.ans[data-k="${(c + 1) % 4}"]`);
  ok(/לא נכון/.test(await page.textContent('#expl')) && await page.locator('.ans.ok').count() === 1, 'mauvaise réponse : la bonne est montrée');
  await page.screenshot({ path: `${OUT}/03-mauvaise.png` });
  // rechargement en cours de manche : on reprend à la même question, réponse conservée
  await page.reload(); await page.waitForSelector('.ans');
  ok(/2 \/ 10/.test(await page.textContent('.qhead')) && /לא נכון/.test(await page.textContent('#expl')), 'rechargement : reprise à la question 2 avec sa réponse');
  await page.click('#next');
  // fin du temps
  await page.evaluate(() => { const s = MDPartAApp.state().run; s.t0 = Date.now() - 10 * 60 * 1000; });
  await page.waitForFunction(() => /נגמר הזמן/.test(document.querySelector('#expl')?.textContent || ''), null, { timeout: 5000 });
  ok(true, 'fin du temps : ⏰ et passage à l’explication');
  await page.click('#next');
  // le reste : alterner juste / faux
  for (let i = 3; i < 10; i++) { await page.waitForSelector('.ans:not([disabled])'); c = await correctIdx(page); await page.click(`.ans[data-k="${i % 2 ? c : (c + 2) % 4}"]`); await page.waitForSelector('#next:not([hidden])'); await page.click('#next'); }
  await page.waitForSelector('.res');
  const t = await page.textContent('.res');
  ok(/מתוך 10/.test(t) && /נק׳ למסע/.test(t), 'résultat : score, X/10, points ajoutés au מסע');
  ok(await page.locator('.rev div').count() >= 3, 'liste des erreurs à revoir');
  await page.screenshot({ path: `${OUT}/04-resultat.png`, fullPage: true });
  const pts = await page.evaluate(() => MDProgress.partAStats().points);
  ok(pts > 0 && pts <= 290 * 10, `progress : ${pts} points enregistrés`);
  await page.click('#redo');
  await page.waitForSelector('.ans');
  const n = await page.evaluate(() => MDPartAApp.state().run.items.length);
  ok(n >= 3 && /1 \/ \d+/.test(await page.textContent('.qhead')), `« רק הטעויות » : manche de ${n} questions ratées`);
  c = await correctIdx(page); await page.click(`.ans[data-k="${c}"]`);
  await page.click('#quit');
  await page.waitForSelector('.res');
  await page.click('a[href="#/"]');
  await page.waitForSelector('#start');
  ok(/תיקון טעויות/.test(await page.textContent('#app')), 'accueil : carte « תיקון טעויות » apparue');
  ok(await noHScroll(page), 'pas de défilement horizontal après une manche');
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base + 'parta.html');
  await page.waitForSelector('#start');
  ok(await noHScroll(page), 'ordinateur : mise en page sans débordement');
  await page.screenshot({ path: `${OUT}/05-ordinateur.png`, fullPage: true });
  await ctx.close();
}
await browser.close(); server.close();
const js = errors.filter(e => !e.startsWith('ASSERT'));
ok(!js.length, 'aucune erreur JavaScript' + (js.length ? ' — ' + js.join(' | ') : ''));
if (errors.length) { console.log(`\n${errors.length} problème(s)`); process.exit(1); }
console.log('\nTout est vert.');
