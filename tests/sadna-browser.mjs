// סדנת 180 · 400 (téléphone simulé S24 + ordinateur) : onglets, filtres, mode révision, compteur rouge au-delà de 180,
// repères cochés, chrono, brouillon gardé après rechargement, pas de défilement horizontal.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2];
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(req.url.split(/[?#]/)[0])).replace(/^\/+/, '') || 'index.html';
  try { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(join(ROOT, p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = 'http://127.0.0.1:' + server.address().port + '/';
let fails = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fails++; };

const browser = await chromium.launch({ executablePath: exe });
for (const [name, vp] of [['s24', { width: 360, height: 780 }], ['desktop', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'sadna.html');
  ok(await page.isVisible('#v-method') && await page.isHidden('#v-cards'), name + ' : méthode affichée au départ');
  ok(await page.locator('#skel180 div').count() === 4 && await page.locator('#skel400 div').count() === 5, name + ' : barres de budget');
  if (OUT) await page.screenshot({ path: `${OUT}/sadna-${name}-methode.png`, fullPage: true });

  await page.click('.tabs a[data-v=cards]'); await page.waitForSelector('.card');
  // חומר עזר : par défaut, 24 fiches affichées, filtre par itinéraire, recherche, « להציג עוד », extrait d'origine
  ok(await page.inputValue('#csrc') === 'ezer' && await page.locator('.card').count() === 24, name + ' : חומר עזר, 24 premières fiches');
  const nRoutes = await page.locator('#croute option').count();
  ok(nRoutes > 20, name + ' : ' + (nRoutes - 1) + ' itinéraires');
  await page.selectOption('#croute', { index: 1 }); await page.waitForTimeout(150);
  const inRoute = await page.locator('.card').count(); ok(inRoute > 0 && inRoute <= 24, name + ' : filtre itinéraire (' + inRoute + ')');
  await page.selectOption('#croute', 'all'); await page.fill('#cq', 'מצדה'); await page.waitForTimeout(150);
  ok((await page.locator('.card h3').allTextContents()).every(t => t.includes('מצדה')) && await page.locator('.card').count() >= 1, name + ' : recherche « מצדה »');
  await page.click('.card .keys summary'); ok(await page.isVisible('.card .keys .ev'), name + ' : 📄 montre la phrase d’origine');
  await page.click('.card [data-mark="todo"]'); await page.waitForTimeout(100);
  ok(await page.locator('.card .st-chip.todo').count() === 1, name + ' : marqué « לחזור »');
  await page.fill('#cq', ''); await page.click('.chip[data-f="todo"]'); await page.waitForTimeout(100);
  ok(await page.locator('.card').count() === 1, name + ' : filtre « לחזור »');
  await page.click('.chip[data-f="all"]'); await page.click('#cmore'); await page.waitForTimeout(100);
  ok(await page.locator('.card').count() === 48, name + ' : « להציג עוד »');
  if (OUT) await page.screenshot({ path: `${OUT}/sadna-${name}-ezer.png` });
  // ⏱ 🔁 חזרה מרווחת
  await page.click('.tabs a[data-v=review]'); await page.waitForSelector('#rshow');
  ok(/לחזרה עכשיו/.test(await page.textContent('#rstat')), name + ' : compteur de révision');
  await page.click('#rshow'); await page.waitForSelector('#rok');
  const site1 = await page.textContent('.rc-site'); await page.click('#rok'); await page.waitForTimeout(100);
  ok((await page.textContent('.rc-site')) !== site1, name + ' : « ידעתי » passe à la fiche suivante');
  if (OUT) await page.screenshot({ path: `${OUT}/sadna-${name}-review.png` });
  // ❓ חידון
  await page.click('.tabs a[data-v=quiz]'); await page.click('#qstart'); await page.waitForSelector('.qopt');
  ok(await page.locator('.qopt').count() === 4, name + ' : 4 réponses');
  await page.click('.qopt >> nth=0'); await page.waitForSelector('#qnext');
  ok(await page.locator('.qopt.right').count() === 1 && /״/.test(await page.textContent('#qexp')), name + ' : bonne réponse + phrase d’origine');
  if (OUT) await page.screenshot({ path: `${OUT}/sadna-${name}-quiz.png` });
  // כרטיסי הסדנה (18 fiches d'origine)
  await page.click('.tabs a[data-v=cards]'); await page.selectOption('#csrc', 'sadna'); await page.waitForTimeout(150);
  ok(await page.locator('.card').count() === 18, name + ' : 18 fiches de la סדנה');
  await page.click('.chip[data-f="400"]');
  ok(await page.locator('.card').count() === 8, name + ' : filtre 400 (8 sites longs)');
  await page.check('#hidek');
  const blur = await page.$eval('.card .keys', el => getComputedStyle(el).filter);
  ok(/blur/.test(blur), name + ' : mode révision floute les clés');
  if (OUT) await page.screenshot({ path: `${OUT}/sadna-${name}-fiches.png` });

  await page.click('.chip[data-f="180"]'); await page.waitForSelector('.card [data-train="herodion"]');
  await page.click('.card [data-train="herodion"]'); await page.waitForSelector('#v-train:not([hidden])');
  ok(await page.isVisible('#v-train') && await page.inputValue('#tsite') === 'herodion', name + ' : « לתרגל » ouvre l’entraînement sur le site');
  ok((await page.textContent('#tprompt')).includes('תיאטרון'), name + ' : phrase de départ');

  const text = 'אנחנו עומדים בתיאטרון. הביטו למעלה. מדוע? בואו נעבור. במאה הראשונה לפנה״ס. לסיכום, מבינים ש… ' + 'מילה '.repeat(170);
  await page.fill('#draft', text);
  ok(await page.locator('#cnt.over').count() === 1, name + ' : compteur rouge au-delà de 180');
  ok(await page.locator('#checks li.ok').count() === 6, name + ' : 6 repères cochés');
  await page.click('#tstart'); await page.waitForTimeout(1300);
  ok((await page.textContent('#timer')) !== '15:00', name + ' : chrono démarre');
  if (OUT) await page.screenshot({ path: `${OUT}/sadna-${name}-train.png`, fullPage: true });

  await page.reload();
  await page.selectOption('#tsite', 'herodion');
  ok((await page.inputValue('#draft')).startsWith('אנחנו עומדים'), name + ' : brouillon gardé');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, name + ' : pas de défilement horizontal');
  ok(errors.length === 0, name + ' : aucune erreur JS ' + errors.join(' | '));
  await ctx.close();
}
await browser.close(); server.close();
if (fails) { console.log(fails + ' échec(s)'); process.exit(1); }
console.log('Tout est vert.');
