// Sites 3D (Massada, Césarée, Beit Shean) sur téléphone simulé (390×844) : chargement, monuments placés, étiquettes,
// sélecteur d'époque, fiche, liste, langue ; accès depuis l'accueil et la carte.
// Usage : CHROME=/chemin/chrome node tests/sites3d-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-sites3d';
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
await ctx.route(/supabase\.co|tile\.openstreetmap/, r => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (c, msg) => { if (!c) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
const shot = async n => { await page.evaluate(() => { const A = window.MDSite3D; if (A && document.querySelector('#stage canvas')) { A.pause(true); A.snapshot(); } }); await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 300000 }); await page.evaluate(() => window.MDSite3D && window.MDSite3D.pause(false)); };

const EXPECT = { masada: ['masada_northern_palace', 'masada_casemate_wall', 'masada_ramp', 'masada_roman_camps', 'masada_western_palace'], caesarea: ['caesarea_theater', 'caesarea_harbour', 'caesarea_palace', 'caesarea_hippostadium', 'caesarea_aqueduct'], beitshean: ['bs_theater', 'bs_palladius', 'bs_amphitheater', 'bs_temple', 'bs_nymphaeum'] };
const PERIOD = { masada: 3, caesarea: 2, beitshean: 5 };
// autres sites : chargement, au moins 2 monuments placés, étiquettes, aucune erreur (SITES=a,b pour limiter)
const idx = await readFile(join(ROOT, 'index.html'), 'utf8');
const LIVE = [...idx.matchAll(/site3d\.html\?site=(\w+)/g)].map(m => m[1]).filter((x, i, a) => a.indexOf(x) === i);
const ONLY = process.env.SITES ? process.env.SITES.split(',') : null;
for (const site of LIVE.filter(x => !EXPECT[x] && (!ONLY || ONLY.includes(x)))) {
  await page.goto(base + `site3d.html?site=${site}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 400000 });
  await page.waitForTimeout(800);
  const placed = await page.evaluate(() => window.MDSite3D.placed());
  ok(placed.length >= 1, `${site} : ${placed.length} monuments placés`);
  const sizes = await page.evaluate(ids => ids.map(id => { const b = window.MDSite3D._bounds(id); return Math.max(b[1][0] - b[0][0], b[1][2] - b[0][2]); }), placed);
  ok(sizes.every(s => s > 1 && s < 3000), `${site} : tailles plausibles (${sizes.map(Math.round).join(', ')} m)`);
  ok((await page.locator('.lb:visible').count()) >= 1, `${site} : étiquettes visibles`);
  await shot(`n-${site}`);
}
for (const site of Object.keys(EXPECT).filter(x => !ONLY || ONLY.includes(x))) {
  await page.goto(base + `site3d.html?site=${site}&period=${PERIOD[site]}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 400000 });
  await page.waitForTimeout(800);
  const placed = await page.evaluate(() => window.MDSite3D.placed());
  const miss = EXPECT[site].filter(id => !placed.includes(id));
  ok(!miss.length, `${site} : monuments principaux placés (${placed.length})${miss.length ? ' — manquent ' + miss.join(', ') : ''}`);
  const sizes = await page.evaluate(ids => ids.map(id => { const b = window.MDSite3D._bounds(id); return Math.max(b[1][0] - b[0][0], b[1][2] - b[0][2]); }), EXPECT[site]);
  ok(sizes.every(s => s > 3 && s < 3000), `${site} : tailles plausibles (${sizes.map(Math.round).join(', ')} m)`);
  ok((await page.locator('.lb:visible').count()) >= 3, `${site} : étiquettes visibles`);
  ok(await page.evaluate(() => window.MDSite3D.quizEnabled === false), `${site} : quiz 3D désactivés`);
  await shot(`${site}-1-home`);
  // sélecteur d'époque
  await page.click('#pBig'); await page.waitForSelector('#pPick:not([hidden]) [data-p]');
  const np = await page.locator('#pPick [data-p]').count();
  ok(np >= 4, `${site} : sélecteur avec ${np} époques`);
  await page.click('#pPick [data-p]:last-child'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.getElementById('pPick').hidden), `${site} : liste refermée après le choix`);
  await page.click('#pPrev'); await page.waitForTimeout(600);
  await page.evaluate(n => window.MDSite3D.setPeriod(n), PERIOD[site]); await page.waitForTimeout(500);
  // fiche
  await page.evaluate(id => window.MDSite3D.openSheet(id), EXPECT[site][0]);
  await page.waitForSelector('.sheet.open');
  const sheet = await page.textContent('#sBody');
  ok(sheet.includes('מקורות') && /📄|📜|🌐/.test(sheet), `${site} : fiche avec sources`);
  await shot(`${site}-2-fiche`);
  await page.click('#sShow'); await page.waitForTimeout(1300); await shot(`${site}-3-vue`);
  // liste
  await page.click('#bList'); await page.waitForSelector('.sheet.open .list');
  ok((await page.locator('.list [data-id]').count()) >= 4, `${site} : liste des sites de l'époque`);
  await page.click('#sClose');
}
// langue
await page.click('[data-lang="fr"]'); await page.waitForTimeout(300);
ok(await page.evaluate(() => document.documentElement.dir === 'ltr' && /[a-z]/i.test(document.getElementById('title').textContent)), 'interface en français (LTR)');
await page.click('[data-lang="he"]');
// accès : accueil et carte
await page.goto(base + 'index.html'); await page.waitForTimeout(800);
ok((await page.locator('.s3d-chips a').count()) === LIVE.length, `accueil : ${LIVE.length} accès 3D`);
await page.screenshot({ path: `${OUT}/4-accueil.png` });

console.log(errors.length ? '\n' + errors.join('\n') : '\n✅ Sites 3D OK — captures dans ' + OUT);
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
