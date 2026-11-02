// « צבעים מקוריים » dans un vrai navigateur (Galaxy S24, 360×780) : chaque module 3D a le bouton,
// l'image change quand on l'active, la légende s'ouvre avec ses sources, le choix est mémorisé, aucune erreur.
// Usage : CHROME=/chemin/chrome node tests/polychromy-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-polychromy';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--no-zygote', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const ok = (c, m) => { if (!c) { errors.push('ASSERT: ' + m); console.log('❌', m); } else console.log('✅', m); };
const S24 = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' };

async function newPage() {
  const ctx = await browser.newContext(S24);
  await ctx.route(/supabase\.co|tile\.openstreetmap|arcgisonline|cartocdn/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|WebGL|GPU|404/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false })); localStorage.setItem('mdl_onboard_v1', '1'); } catch (e) {} });
  return { ctx, page };
}
// différence moyenne entre deux captures (lecture des pixels dans le navigateur, sans dépendance)
async function diff(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(b)]); const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d');
    g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) n++;
    return n / (da.length / 4);
  }, [a.toString('base64'), b.toString('base64')]);
}
const tap = (page, sel) => page.evaluate(s => { const el = [...document.querySelectorAll(s.split('|')[0])].find(e => !s.includes('|') || e.textContent.includes(s.split('|')[1])); if (el) el.click(); return !!el; }, sel);
let check = async function (name, url, { open = null, button, wait = 1500 } = {}) {
  const { ctx, page } = await newPage();
  await page.goto(base + url);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 300000 });
  if (open) await open(page);
  await page.waitForTimeout(wait);
  const has = await page.evaluate(s => !![...document.querySelectorAll(s.split('|')[0])].find(e => !s.includes('|') || e.textContent.includes(s.split('|')[1])), button);
  ok(has, `${name} : bouton « צבעים מקוריים » présent`);
  const before = await page.screenshot({ path: `${OUT}/${name}-1-pierre.png`, timeout: 120000 });
  await tap(page, button); await page.waitForTimeout(wait);
  await page.evaluate(() => { const m = document.getElementById('toolsMenu'); if (m) m.classList.remove('open'); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(s => { const el = [...document.querySelectorAll(s.split('|')[0])].find(e => !s.includes('|') || e.textContent.includes(s.split('|')[1])); return el && el.getAttribute('aria-pressed'); }, button) === 'true', `${name} : bouton activé`);
  const after = await page.screenshot({ path: `${OUT}/${name}-2-couleurs.png`, timeout: 120000 });
  const d = await diff(page, before, after);
  ok(d > 0.004, `${name} : l'image change (${(d * 100).toFixed(1)} % des pixels)`);
  await tap(page, '.poly-info'); await page.waitForSelector('.poly-pop', { timeout: 60000 });
  const items = await page.locator('.poly-pop li').count();
  ok(items > 0, `${name} : légende avec ${items} couleur(s) sourcée(s)`);
  ok(await page.locator('.poly-pop .src').count() > 0, `${name} : sources dans la légende`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} : pas de défilement horizontal`);
  await page.screenshot({ path: `${OUT}/${name}-3-legende.png`, timeout: 120000 });
  ok(await page.evaluate(() => localStorage.getItem('mdl_poly')) === '1', `${name} : choix mémorisé`);
  await ctx.close();
}

const ONLY = process.env.ONLY;
const _check = check; check = (n, ...a) => (!ONLY || n.includes(ONLY)) ? _check(n, ...a) : null;
await check('architecture-ordres', 'architecture.html#/explore/orders', { button: '.poly-btn', open: p => p.evaluate(() => document.getElementById('stage').scrollIntoView({ block: 'end' })) });
await check('architecture-temple', 'architecture.html#/explore/temple', { button: '.poly-btn', open: p => p.evaluate(() => document.getElementById('stage').scrollIntoView({ block: 'end' })) });
await check('architecture-bains', 'architecture.html#/explore/bath', { button: '.poly-btn', open: p => p.evaluate(() => document.getElementById('stage').scrollIntoView({ block: 'end' })) });
await check('architecture-eglise', 'architecture.html#/explore/church', { button: '.poly-btn', open: p => p.evaluate(() => document.getElementById('stage').scrollIntoView({ block: 'end' })) });
await check('cesaree-3d', 'world3d.html?site=caesarea', { button: '#side .rb[aria-pressed]:not(#btnCmp):not(#btnFly)', wait: 2500,
  open: async p => { const st = p.locator('#start, .start, [data-start]').first(); if (await st.count() && await st.isVisible()) await st.click(); } });
await check('jerusalem-herode', 'jerusalem3d.html?period=5', { button: '#toolsMenu button|צבעים מקוריים', wait: 2500 });
await check('site-cesaree', 'site3d.html?site=caesarea&period=2', { button: '#toolsMenu button|צבעים מקוריים', wait: 2500 });
await check('site-massada', 'site3d.html?site=masada&period=2', { button: '#toolsMenu button|צבעים מקוריים', wait: 2500 });

await browser.close(); server.close();
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1); }
console.log('\nTout est vert.');
