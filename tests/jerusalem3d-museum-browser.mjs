// Jérusalem 3D — outils « musée » (Chromium, téléphone simulé, rendu logiciel) : visite des rues, deux époques, mode apprentissage, mesures.
// Usage : CHROME=/chemin/chrome node tests/jerusalem3d-museum-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-jerusalem3d-museum';
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
page.setDefaultTimeout(180000); // rendu logiciel lent dans l'environnement de test
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (c, msg) => { if (!c) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
// Rendu logiciel (SwiftShader) très lent : on fige la boucle, on force une image, puis on capture.
const tool = async id => { await page.click('#bMenu'); await page.click(id); };
const shot = async n => { await page.evaluate(() => { const A = window.MDJerusalem3D; if (A && document.querySelector('#stage canvas') && !document.body.classList.contains('mode2d')) { A.pause(true); A.snapshot(); } }); await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 300000 }); await page.evaluate(() => window.MDJerusalem3D && window.MDJerusalem3D.pause(false)); };

const A = (fn, arg) => page.evaluate(fn, arg);
const t0 = Date.now();
await page.goto(base + 'jerusalem3d.html?period=5');
await page.waitForFunction(() => document.body.dataset.ready === '1' && window.MDJerusalem3D && window.MDJerusalem3D.museum, null, { timeout: 400000 });
const firstFrame = Date.now() - t0;
await page.waitForTimeout(800);
const perf = await A(() => window.MDJerusalem3D.perf());
console.log('   ↳ mesures (rendu LOGICIEL, pas un vrai téléphone) :', JSON.stringify({ premiere_image_ms: firstFrame, ...perf }));
ok(perf.monuments >= 20, 'scène pilote 30 apr. J.-C. : ' + perf.monuments + ' monuments posés');

// ---- 🚶 visite au niveau des rues
await tool('#bWalk');
await page.waitForSelector('#mtWalkPad');
const w0 = await A(() => { const c = window.MDJerusalem3D.camera, g = window.MDJerusalem3D.ground(c.position.x, c.position.z); return { x: c.position.x, y: c.position.y, z: c.position.z, eye: c.position.y - g }; });
ok(w0.eye > 1 && w0.eye < 40, 'hauteur des yeux au-dessus du sol (m) : ' + w0.eye.toFixed(1));
const st = await A(() => window.MDJerusalem3D.museum.state); ok(st.walking, 'mode marche actif');
const pad = page.locator('#mtWalkPad .up'); const box = await pad.boundingBox();
await page.click('#mtWalkPad .fa');
await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.waitForTimeout(6000); await page.mouse.up();
console.log('   ↳ état marche :', JSON.stringify(await A(() => window.MDJerusalem3D.museum.state)));
const w1 = await A(() => { const c = window.MDJerusalem3D.camera; return { x: c.position.x, z: c.position.z }; });
const moved = Math.hypot(w1.x - w0.x, w1.z - w0.z);
ok(moved > 0.3, 'on avance en maintenant ▲ : ' + moved.toFixed(1) + ' m');
await shot('m1-rue');
await page.click('#mtWalkOut');
ok(!(await A(() => window.MDJerusalem3D.museum.state.walking)), 'retour à la vue aérienne');

// ---- ⇄ deux époques, même point de vue
const camBefore = await A(() => window.MDJerusalem3D.camera.position.toArray().map(Math.round).join(','));
await tool('#bCmp2');
await page.click('#mtBar [data-b="12"]');
await page.waitForTimeout(800);
ok((await page.textContent('#pName')).includes('היום'), 'comparaison : époque B (aujourd’hui) affichée');
await page.click('#mtSwap'); await page.waitForTimeout(800);
ok((await page.textContent('#pName')).includes('הורדוס'), 'bascule : retour à l’époque A (Hérode)');
const camAfter = await A(() => window.MDJerusalem3D.camera.position.toArray().map(Math.round).join(','));
ok(camBefore === camAfter, 'la caméra ne bouge pas en changeant d’époque');
await shot('m2-comparaison');
await page.click('#mtCmpX');

// ---- 🎓 mode apprentissage
await tool('#bLearn');
await page.waitForSelector('#mtBar .q b');
ok(await A(() => getComputedStyle(document.getElementById('labels')).display === 'none'), 'apprentissage : étiquettes masquées');
const target = await A(() => window.MDJerusalem3D.museum.state.learn.target);
ok(!!target, 'question posée : ' + target);
// toucher le monument demandé (centre de sa boîte projeté à l'écran)
const pt = await A(id => { const M = window.MDJerusalem3D, b = M._bounds(id), c = M.camera; M.viewAt(id);
  const v = { x: (b[0][0] + b[1][0]) / 2, y: (b[0][1] + b[1][1]) / 2, z: (b[0][2] + b[1][2]) / 2 };
  const p = new c.position.constructor(v.x, v.y, v.z).project(c); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; }, target);
await page.waitForTimeout(600);
await page.mouse.click(pt[0], pt[1]);
await page.waitForTimeout(600);
const after = await A(() => ({ s: window.MDJerusalem3D.museum.state.learn, sheet: document.getElementById('sheet').classList.contains('open'), bar: document.getElementById('mtBar').textContent }));
ok(!after.sheet, 'apprentissage : toucher ne déclenche pas la fiche');
ok(after.s.i === 1, 'réponse enregistrée (' + (after.s.score ? 'juste' : 'autre monument touché') + ') : ' + after.bar.slice(0, 60));
await shot('m3-apprentissage');
await page.click('#mtBar button:last-child');

ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close(); server.close();
console.log(errors.length ? '\n❌ échecs' : '\n✅ Outils musée OK — captures dans ' + OUT);
process.exit(errors.length ? 1 : 0);
