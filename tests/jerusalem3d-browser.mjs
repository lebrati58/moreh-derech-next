// Jérusalem 3D sur téléphone simulé (390×844) : chargement, périodes, fiche, plan 2D, quiz 3D masqués.
// Usage : CHROME=/chemin/chrome node tests/jerusalem3d-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-jerusalem3d';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--no-zygote', '--single-process', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
await ctx.route(/supabase\.co/, r => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (c, msg) => { if (!c) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto(base + 'jerusalem3d.html?period=5');
await page.waitForSelector('#strip [data-p]');
await page.waitForTimeout(2500);
ok(await page.locator('#strip [data-p]').count() === 11, '11 périodes dans la frise');
ok((await page.textContent('#pName')).includes('הורדוסית'), 'période hérodienne active');
const has3d = await page.evaluate(() => !!document.querySelector('#stage canvas'));
console.log('   ↳ WebGL :', has3d ? 'oui (3D)' : 'non (plan 2D)');
ok((await page.locator('.lb').count()) > 5 || !has3d, 'étiquettes des monuments affichées');
await shot('01-herodien');
ok(await page.evaluate(() => window.MDJerusalem3D && window.MDJerusalem3D.quizEnabled === false), 'quiz 3D désactivés');
ok(!(await page.locator('text=חידון').count()), 'aucun bouton de quiz visible');

// fiche
await page.evaluate(() => window.MDJerusalem3D.openSheet('jerusalem_phasael'));
await page.waitForSelector('.sheet.open');
const sheet = await page.textContent('#sBody');
ok(sheet.includes('מחלוקת') && sheet.includes('מקורות'), 'fiche Phasaël : débat et sources');
ok(sheet.includes('מסמך קורס'), 'fiche : source Drive marquée');
await shot('02-fiche-phasael');
await page.click('#sShow'); await page.waitForTimeout(1300); await shot('03-flyto-phasael');

// autre période
await page.click('#strip [data-p="11"]'); await page.waitForTimeout(1200);
ok((await page.textContent('#pName')).includes('עות'), 'période ottomane');
await shot('04-ottoman');
await page.click('#strip [data-p="7"]'); await page.waitForTimeout(1200); await shot('05-byzantin');
await page.click('#pCount'); await page.waitForSelector('.sheet.open .list');
ok((await page.locator('.list [data-id]').count()) >= 3, 'liste des sites de la période');
await shot('06-liste-byzantin');
await page.click('#sClose');

// langue
await page.click('[data-lang="fr"]'); await page.waitForTimeout(300);
ok((await page.textContent('#pName')).includes('Byzantine'), 'interface en français');
ok(await page.evaluate(() => document.documentElement.dir === 'ltr'), 'français en LTR');
await page.click('[data-lang="he"]');

// comparaison des murailles
await page.click('#bCompare'); await page.waitForSelector('.sheet.open .wrow');
ok((await page.locator('.wrow').count()) >= 10, 'comparaison : liste des murailles de toutes les époques');
await page.click('#sClose'); await page.waitForTimeout(1200);
ok((await page.locator('.lb.wl').count()) >= 6, 'comparaison : étiquettes des murailles');
await shot('06b-comparaison');
await page.click('#bCompare'); await page.waitForTimeout(500);

// plan 2D
await page.click('#b2d'); await page.waitForTimeout(500);
ok(await page.isVisible('#plan2d'), 'plan 2D affiché');
ok((await page.locator('#plan2d [data-id]').count()) > 3, 'monuments sur le plan 2D');
await page.click('#strip [data-p="5"]'); await page.waitForTimeout(400);
await shot('07-plan2d-herodien');

await browser.close(); server.close();
if (errors.length) { console.log('\nErreurs :\n' + errors.join('\n')); process.exit(1); }
console.log('\n✅ Jérusalem 3D OK — captures dans', OUT);
