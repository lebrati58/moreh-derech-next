// « מבחן מחצית » dans un vrai navigateur — Galaxy S24 (360×780, tactile) puis ordinateur.
// Accueil Part A → carte → règles → simulation : 41 réponses (alerte « pas comptée »), réponse libre exacte et reformulée,
// remise, note /40, auto-vérification ; puis mode תרגול : réponse immédiate + explication ; reprise après rechargement.
// Usage : CHROME=/chemin/chrome node tests/midterm-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-midterm';
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
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const [label, opts] of [['mobile', { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1280, height: 860 } }]]) {
  const ctx = await browser.newContext(Object.assign({ locale: 'he-IL' }, opts));
  await ctx.route(/supabase\.co|sw\.js/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|fetching the script/i.test(m.text())) errors.push(label + ' console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(base + 'parta.html');
  await page.waitForSelector('.mtcard');
  ok(true, `${label} : carte « בחינת מחצית » sur l'accueil Part A`);
  if (label === 'mobile') await page.screenshot({ path: `${OUT}/1-accueil-${label}.png` });
  await page.click('.mtcard');
  await page.waitForSelector('[data-mode="exam"]');
  ok(await page.locator('.rules li').count() === 3, `${label} : règles affichées`);
  await page.screenshot({ path: `${OUT}/2-regles-${label}.png`, fullPage: label === 'mobile' });

  // ---- simulation
  await page.click('[data-mode="exam"]');
  await page.waitForSelector('#mcq-1');
  ok(await page.locator('#mcq-45').count() === 1, `${label} : 45 QCM sur la feuille`);
  ok(await page.locator('#clock').textContent().then(t => /⏳ (89|90):/.test(t)), `${label} : chrono 90′`);
  const key = await page.evaluate(() => MDPartAMidterm.data().mcq.map(q => q.correct));
  for (let n = 1; n <= 41; n++) await page.click(`#mcq-${n} .opt[data-k="${n === 2 ? (key[1] + 1) % 4 : key[n - 1]}"]`);
  ok(await page.locator('.expl').count() === 0, `${label} : simulation — aucune réponse dévoilée avant la remise`);
  ok(await page.locator('#cnt').textContent().then(t => t.includes('41') && t.includes('לא ייספרו')), `${label} : alerte « 41 > 40 »`);
  await page.click(`#mcq-1 .opt[data-k="${key[0]}"]`);           // retoucher = gommer
  ok(await page.evaluate(() => !(1 in MDPartAMidterm.state().mcq)), `${label} : re-toucher efface la réponse`);
  await page.click(`#mcq-1 .opt[data-k="${key[0]}"]`);
  if (label === 'mobile') await page.screenshot({ path: `${OUT}/3-feuille-qcm-${label}.png` });
  await page.click('.tabs2 a[href="#/mt/b"]');
  await page.waitForSelector('#fi-16');
  await page.fill('#fi-16', 'רבי עקיבא');
  await page.fill('#fi-35', 'נהר הירדן');
  await page.fill('#fi-13', 'העיר בית שאן ברומית');      // contient « בית שאן » → accepté
  await page.fill('#fi-12', 'אבירי מסע הצלב');             // reformulé → auto-vérification
  if (label === 'mobile') { await page.locator('#fill-12').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/4-feuille-completion-${label}.png` }); }
  await page.reload(); await page.waitForSelector('#fi-16');
  ok(await page.inputValue('#fi-16') === 'רבי עקיבא', `${label} : brouillon conservé après rechargement`);
  await page.click('#submit');
  await page.waitForSelector('.res .score');
  const score = await page.locator('.res .score').textContent();
  ok(/^21 \/ 40$/.test(score.trim()), `${label} : note sur 40 (${score.trim()})`);
  const r1 = await page.evaluate(() => MDPartA.scoreMidterm(MDPartAMidterm.data(), MDPartAMidterm.state()));
  ok(r1.mcq.got === 19.5 && r1.mcq.ignored.length === 1 && r1.fill.got === 1.5 && r1.pending === 1, `${label} : QCM 19,5 (1 faute, 1 ignorée) · השלמה 1,5 · 1 à vérifier`);
  ok(await page.locator('.selfck').count() === 1, `${label} : bloc d'auto-vérification`);
  await page.screenshot({ path: `${OUT}/5-resultat-${label}.png`, fullPage: label === 'mobile' });
  await page.click('.selfck [data-self="12:1"]');
  await page.waitForSelector('.res .score');
  ok(await page.locator('.res .score').textContent().then(t => /21[.,]5 \/ 40/.test(t)), `${label} : « צדקתי » ajoute 0,5 → 21,5 / 40`);
  ok(await page.locator('[data-topic-go]').count() >= 1, `${label} : points perdus par thème avec lien`);
  ok(await noHScroll(page), `${label} : pas de défilement horizontal (résultat)`);

  // ---- תרגול des erreurs
  await page.click('#redo');
  await page.waitForSelector('#mcq-2');
  ok(await page.locator('.qq').count() === 1, `${label} : « תרגול הטעויות » ne garde que la question ratée`);
  await page.click(`#mcq-2 .opt[data-k="${key[1]}"]`);
  await page.waitForSelector('#mcq-2 .expl.ok');
  ok(true, `${label} : mode תרגול — explication immédiate`);
  if (label === 'mobile') await page.screenshot({ path: `${OUT}/6-pratique-${label}.png` });

  // ---- תרגול complet, réponse libre
  await page.goto(base + 'parta.html#/mt'); await page.waitForSelector('[data-mode="practice"]');
  await page.click('[data-mode="practice"]'); await page.waitForSelector('#mcq-1');
  await page.click('.tabs2 a[href="#/mt/b"]'); await page.waitForSelector('#fi-36');
  await page.fill('#fi-36', 'בית דוד'); await page.click('[data-check="36"]');
  await page.waitForSelector('#fill-36 .expl.ok');
  ok(await page.locator('#fill-36 .flag').count() >= 1, `${label} : השלמה 36 signalée « תוקן »`);
  await page.fill('#fi-43', 'מצדה'); await page.press('#fi-43', 'Enter');
  await page.waitForSelector('#fill-43 .flag.warn');
  ok(true, `${label} : réponse non vérifiée dans le cours signalée ⚠️`);
  if (label === 'mobile') { await page.locator('#fill-36').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/7-pratique-completion-${label}.png` }); }
  ok(await noHScroll(page), `${label} : pas de défilement horizontal (feuille)`);
  await ctx.close();
}

// tuile de l'accueil
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: 'he-IL' });
  await ctx.route(/supabase\.co|sw\.js/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(base + 'index.html');
  ok(await page.locator('a[href="parta.html#/mt"]').count() === 1, 'accueil : lien direct vers בחינת מחצית');
  await ctx.close();
}
await browser.close(); server.close();
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1); }
console.log('\n🟢 מבחן מחצית : tout est vert');
