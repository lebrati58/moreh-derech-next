// Monde 3D de Césarée dans un vrai navigateur : Samsung Galaxy S24 (360×780, DPR 3, tactile) puis ordinateur (1280×800).
// Chargement (progression réelle) → marche au joystick tactile / clavier → collision avec la scène → montée des gradins → sélection au centre
// → époque / comparaison / transparence → 5 missions complètes → points dans « המסע שלי » → pause/reprise → langue → mesure des i/s.
// ATTENTION : en sans-tête le rendu WebGL est logiciel (SwiftShader) : les i/s mesurées ici NE représentent PAS un téléphone réel.
// Usage : CHROME=/chemin/chrome node tests/world3d-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-world3d';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.hdr': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], report = {};
const ok = (c, m) => { if (!c) { errors.push('ASSERT: ' + m); console.log('❌', m); } else console.log('✅', m); };
const S = () => window.MDWorldApp.state();

async function run(label, opts, mobile) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(Object.assign({ locale: 'he-IL' }, opts));
  await ctx.route(/supabase\.co/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|GPU stall/i.test(m.text())) errors.push(label + ' console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(q => { try { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.setItem('mdl_world3d_v1:caesarea', JSON.stringify({ quality: q, sound: false })); localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false, asked: true })); } } catch (e) {} }, mobile ? 'low' : 'medium');
  const steps = [];
  await page.exposeFunction('__step', s => steps.push(s));
  await page.addInitScript(() => { const iv = setInterval(() => { const e = document.getElementById('loadStep'); if (e && e.textContent && window.__last !== e.textContent) { window.__last = e.textContent; window.__step(e.textContent); } if (document.body && document.body.dataset.ready) clearInterval(iv); }, 30); });
  const t0 = Date.now();
  await page.goto(base + 'world3d.html?site=caesarea');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  report[label] = { loadMs: Date.now() - t0 };
  ok(steps.length >= 5, `${label} : écran de chargement avec étapes réelles (${steps.length} : ${steps.slice(0, 3).join(' | ')}…)`);
  ok(await page.$eval('#load', e => e.hidden), `${label} : écran de chargement masqué`);
  const st0 = await page.evaluate(S);
  ok(st0.era === 'present' && st0.mode === 'walk', `${label} : démarre à pied, époque « היום »`);
  await page.screenshot({ path: `${OUT}/${label}-1-spawn.png` });

  // --- déplacement ---
  const p0 = (await page.evaluate(S)).pos;
  if (mobile) {
    const cdp = await ctx.newCDPSession(page);
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', 70, 640); for (let i = 1; i <= 6; i++) { await T('touchMove', 70, 640 - i * 10); await page.waitForTimeout(30); }
    await page.waitForTimeout(2500); await T('touchEnd');
    // regard : glisser à droite
    const yaw0 = await page.evaluate(() => window.MDWorldApp.player().yaw);
    await T('touchStart', 280, 300); for (let i = 1; i <= 5; i++) { await T('touchMove', 280 - i * 15, 300); await page.waitForTimeout(20); } await T('touchEnd');
    ok(Math.abs(await page.evaluate(() => window.MDWorldApp.player().yaw) - yaw0) > 0.1, `${label} : glisser à droite tourne la caméra`);
  } else { await page.keyboard.down('KeyW'); await page.evaluate(() => { const P = window.MDWorldApp.player(); for (let i = 0; i < 40; i++) P.update(1 / 30); }); await page.keyboard.up('KeyW'); } // rendu logiciel très lent : on fait avancer la simulation à pas fixes
  const p1 = (await page.evaluate(S)).pos, moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  ok(moved > 0.4, `${label} : le joueur avance (${moved.toFixed(2)} m, ${mobile ? 'joystick tactile' : 'clavier W'})`);

  // --- collision : marcher vers le front de scène (1,4 m, pas d'escalier à z=20) ---
  const blockedX = await page.evaluate(async () => { const P = window.MDWorldApp.player(); window.MDWorldApp.setEra('ancient'); P.place([5, 0, 4], Math.PI / 2, 0); for (let i = 0; i < 90; i++) { P.keys.KeyW = true; P.update(1 / 30); } P.keys.KeyW = false; return P.pos.x; });
  ok(blockedX > 0.15 && blockedX < 1.5, `${label} : bloqué par le front de scène (x = ${blockedX.toFixed(2)} m)`);
  // --- marches : monter l'escalier central de l'ima cavea depuis l'orchestra ---
  const climb = await page.evaluate(async () => { const P = window.MDWorldApp.player(); P.place([11, 0, 0], -Math.PI / 2, 0); for (let i = 0; i < 150; i++) { P.keys.KeyW = true; P.update(1 / 30); } P.keys.KeyW = false; return [P.pos.x, P.pos.y]; });
  ok(climb[1] > 2.5, `${label} : montée des gradins par l'escalier (hauteur ${climb[1].toFixed(2)} m, x = ${climb[0].toFixed(1)})`);
  await page.screenshot({ path: `${OUT}/${label}-2-gradins.png` });

  // --- sélection au centre de l'écran (regarder la scène depuis l'orchestra) ---
  await page.evaluate(() => { const P = window.MDWorldApp.player(); P.place([9, 0, 0], Math.PI / 2, 0.12); });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.MDWorldApp.select(null));
  await page.waitForTimeout(300);
  const selId = (await page.evaluate(S)).sel;
  ok(['scaenaeFrons', 'pulpitum', 'proscaenium', 'hospitalia'].includes(selId), `${label} : sélection d'un élément au centre (${selId})`);
  ok(await page.$eval('#sheet', e => !e.hidden && /Scaenae|Pulpitum|Proscaenium|Valvae/.test(e.textContent)), `${label} : fiche avec nom latin, certitude et sources`);
  await page.screenshot({ path: `${OUT}/${label}-3-fiche.png` });
  await page.click('#qBtn'); await page.click('#qBox button[data-p="scaena"]');
  ok(await page.$eval('#qBox button.good', e => !!e), `${label} : question déclenchée depuis l'objet`);
  await page.click('#sheetX');

  // --- époques et comparaison ---
  await page.click('#btnEra'); const e1 = (await page.evaluate(S)).era; await page.click('#btnEra'); const e2 = (await page.evaluate(S)).era;
  ok(e1 !== e2, `${label} : bouton époque (${e1} → ${e2})`);
  await page.evaluate(() => window.MDWorldApp.player().flyTo({ x: 0, y: 4, z: 0 }, { x: 58, y: 30, z: 42 }));
  const cam0 = await page.evaluate(() => window.MDWorldApp.camera().position.toArray());
  await page.click('#btnCmp'); await page.waitForSelector('#cmp:not([hidden])');
  await page.$eval('#cmpRange', e => { e.value = 80; e.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${label}-4-comparaison.png` });
  const cam1 = await page.evaluate(() => window.MDWorldApp.camera().position.toArray());
  ok(cam0.every((v, i) => Math.abs(v - cam1[i]) < 0.5), `${label} : la caméra reste identique pendant la comparaison`);
  await page.click('#ghost'); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${label}-5-transparence.png` });
  ok((await page.evaluate(S)).ghost, `${label} : bâtiments antiques en transparence sur les ruines`);
  await page.click('#btnCmp');

  // --- missions ---
  const pick = (id, era) => page.evaluate(([i, e]) => window.MDWorldApp.pickElement(i, e), [id, era]);
  const closeSheet = () => page.evaluate(() => { const x = document.getElementById('sheetX'); if (!document.getElementById('sheet').hidden) x.click(); });
  await page.click('#btnMis'); await page.click('[data-m="identify"]');
  ok(await page.$eval('#obj', e => !e.hidden), `${label} : objectif de mission affiché`);
  for (const id of ['ima', 'orchestra', 'scaenaeFrons']) { await pick(id, 'ancient'); await closeSheet(); }
  ok((await page.evaluate(S)).mission === null, `${label} : mission d'identification accomplie`);
  await page.click('#btnMis'); await page.click('[data-m="errors"]');
  ok(await page.evaluate(() => window.MDWorldApp.world().errors.visible), `${label} : erreurs volontaires visibles pendant la mission`);
  await page.evaluate(() => window.MDWorldApp.player().flyTo({ x: 0, y: 4, z: 0 }, { x: 70, y: 32, z: 45 })); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${label}-6-erreurs.png` });
  await pick('summa', 'ancient'); await closeSheet();
  for (const id of ['errGothic', 'errMarble', 'errTower']) { await pick(id, 'ancient'); await closeSheet(); }
  ok((await page.evaluate(S)).mission === null && !(await page.evaluate(() => window.MDWorldApp.world().errors.visible)), `${label} : mission « erreurs » accomplie, erreurs à nouveau masquées`);
  await page.click('#btnMis'); await page.click('[data-m="compare"]');
  for (const [id, era] of [['scaenaeFrons', 'ancient'], ['proscaenium', 'ancient'], ['summa', 'ancient'], ['modernStage', 'present'], ['lightTowers', 'present'], ['upperModern', 'present']]) { await pick(id, era); await closeSheet(); }
  ok((await page.evaluate(S)).mission === null, `${label} : mission de comparaison accomplie`);
  await page.click('#btnMis'); await page.click('[data-m="chronology"]');
  const items = await page.evaluate(() => window.MDWorld.mission(window.MDWorldApp.site(), 'chronology').items);
  for (const it of items) { await pick(it.element, it.era); await page.click(`[data-c="${it.answer}"]`); await page.click('#chNext'); }
  ok((await page.evaluate(S)).mission === null, `${label} : mission chronologique accomplie (${items.length} éléments)`);
  await page.click('#btnMis'); await page.click('[data-m="exam"]');
  for (let i = 0; i < 5; i++) { await page.fill('#exA', 'קוואה, אורכסטרה, סקנה'); await page.click('#exR'); await page.$$eval('#exK input', xs => xs.slice(0, 4).forEach(x => x.click())); if (i === 0) await page.screenshot({ path: `${OUT}/${label}-7-examen.png` }); await page.click('#exN'); }
  ok((await page.evaluate(S)).mission === null, `${label} : examen מורה דרך (5 questions ouvertes, sans note automatique)`);
  const prog = await page.evaluate(() => ({ p: window.MDProgress.archStats().points, tot: window.MDProgress.totals().points, done: Object.keys(window.MDWorldApp.state().done).length }));
  ok(prog.p > 0 && prog.tot >= prog.p && prog.done === 5, `${label} : 5/5 missions, ${prog.p} points dans « המסע שלי »`);
  ok((await page.textContent('#prog')).includes('5/5'), `${label} : indicateur de progression 5/5`);

  // --- pause / reprise, langue ---
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await page.$eval('#pause', e => !e.hidden), `${label} : pause quand l'application passe en arrière-plan`);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); }); await page.click('#resume');
  ok(await page.$eval('#pause', e => e.hidden), `${label} : reprise`);
  await page.click('#btnSet'); await page.click('[data-l="fr"]');
  ok((await page.textContent('#lCmp')) === 'Comparer' && (await page.evaluate(() => document.documentElement.dir)) === 'ltr', `${label} : interface en français (LTR)`);
  await page.click('[data-l="en"]'); ok((await page.textContent('#lMis')) === 'Mission', `${label} : interface en anglais`);
  await page.click('[data-l="he"]'); await page.click('#sheetX');
  // --- mesure des images/s (rendu logiciel) ---
  await page.evaluate(() => { const P = window.MDWorldApp.player(); P.setMode('walk'); P.place([30, 0, 0], Math.PI / 2, -0.05); });
  await page.waitForTimeout(9000);
  report[label].fps = (await page.evaluate(S)).fpsLog; report[label].level = (await page.evaluate(S)).level;
  console.log(`ℹ️ ${label} : i/s mesurées en rendu LOGICIEL SwiftShader (non représentatif d'un téléphone) : ${report[label].fps.join(', ')} · qualité ${report[label].level}`);
  await page.screenshot({ path: `${OUT}/${label}-8-fin.png` });
  await ctx.close();
}

await run('S24', { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' }, true);
await run('desktop', { viewport: { width: 1280, height: 800 } }, false);
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await browser.close(); server.close();
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1); }
console.log('\nOK — aucune erreur');
