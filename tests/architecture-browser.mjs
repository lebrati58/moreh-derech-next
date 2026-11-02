// « אדריכלות קלאסית » dans un vrai navigateur : Samsung Galaxy S24 (360×780, DPR 3, tactile) puis ordinateur (1280×800).
// Les 14 maquettes se chargent sans erreur → fiche d'un élément (lien direct) → partie de zihouï complète (find/name/latin)
// → points dans « המסע שלי » → questions ouvertes (réponse, corrigé, cases) → banque + recherche → pas de défilement horizontal.
// Usage : CHROME=/chemin/chrome node tests/architecture-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-architecture';
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
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--no-zygote', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const errors = [];
const ok = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
const PLAYER = () => { try { if (!localStorage.getItem('mdl_player_v1')) localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false, asked: true })); } catch (e) {} };

async function newPage(opts) {
  const ctx = await browser.newContext(Object.assign({ locale: 'he-IL' }, opts));
  await ctx.route(/supabase\.co|tile\.openstreetmap/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|WebGL|GPU/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(PLAYER);
  return { ctx, page };
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ready = page => page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 20000 });

async function run(label, opts) {
  console.log(`\n=== ${label} ===`);
  const { ctx, page } = await newPage(opts);
  await page.goto(base + 'architecture.html#/explore/orders');
  await ready(page);
  const gl = await page.evaluate(() => window.MDArchApp.hasGL());
  ok(gl, `${label} : WebGL actif`);
  const ids = await page.evaluate(() => window.MDArchApp.data().scenes.map(s => s.id));
  ok(ids.length === 14, `${label} : 14 maquettes`);
  for (const id of ids) {
    await page.evaluate(i => { location.hash = '#/explore/' + i; }, id);
    await page.waitForTimeout(250);
    const n = await page.evaluate(() => document.querySelectorAll('#pins .pin:not([hidden])').length);
    ok(n >= 3, `${label} : ${id} — ${n} repères visibles`);
    if (label === 'S24' || ['orders', 'bsh', 'olive', 'syn'].includes(id)) await page.screenshot({ path: `${OUT}/${label}-explore-${id}.png` });
  }
  // lien direct vers un élément : #/explore/temple/2 = סטילובט
  await page.evaluate(() => { location.hash = '#/explore/temple/2'; }); await page.waitForTimeout(300);
  ok(/סטילובט/.test(await page.textContent('#detail')), `${label} : lien direct → fiche סטילובט`);
  ok(await noHScroll(page), `${label} : pas de défilement horizontal (חקירה)`);
  await page.screenshot({ path: `${OUT}/${label}-detail.png`, fullPage: true });

  // jeu de zihouï : 6 manches, tous types, on répond juste sauf à la 2e
  await page.click('#tabPlay'); await page.waitForSelector('#vPlaySet:not([hidden])');
  await page.click('#pN button[data-n="5"]');
  await page.click('#pStart'); await page.waitForSelector('#vPlay:not([hidden])');
  await page.screenshot({ path: `${OUT}/${label}-play-1.png` });
  let rounds = await page.evaluate(() => window.MDArchApp.state().run.rounds.length);
  ok(rounds === 5, `${label} : partie de 5 manches`);
  const kinds = new Set();
  for (let i = 0; i < rounds; i++) {
    const r = await page.evaluate(() => { const S = window.MDArchApp.state(), r = S.run.rounds[S.run.i]; return { kind: r.kind, answer: r.answer, k: S.scene.parts.findIndex(p => p.t === r.tag) }; });
    kinds.add(r.kind);
    const wrong = i === 1;
    if (r.kind === 'find') {
      const target = wrong ? (r.k === 0 ? 1 : 0) : r.k;
      await page.evaluate(t => document.querySelectorAll('#pins .pin')[t].click(), target);
    } else await page.click(`#pOpts button[data-j="${wrong ? (r.answer + 1) % 4 : r.answer}"]`);
    await page.waitForSelector('#pFb:not([hidden])');
    if (i === 0) await page.screenshot({ path: `${OUT}/${label}-play-feedback.png` });
    await page.click('#pNext');
  }
  ok(kinds.size >= 2, `${label} : types de manches mélangés (${[...kinds].join(', ')})`);
  await page.waitForSelector('#vResult:not([hidden])');
  ok((await page.textContent('#rBig')).trim() === '4/5', `${label} : résultat 4/5`);
  const st = await page.evaluate(() => { const s = window.MDProgress.archStats(); return { p: s.points, m: s.mistakes.length, tot: window.MDProgress.totals().points }; });
  ok(st.p > 0 && st.m === 1 && st.tot >= st.p, `${label} : points enregistrés (${st.p}) et 1 erreur à revoir, comptés dans le total`);
  await page.screenshot({ path: `${OUT}/${label}-result.png`, fullPage: true });
  await page.click('#rFix'); await page.waitForSelector('#vPlay:not([hidden])');
  ok(await page.evaluate(() => window.MDArchApp.state().run.rounds.length) === 1, `${label} : « לתקן טעויות » relance la manche ratée`);
  await page.click('#pQuit');

  // questions ouvertes
  await page.click('#tabOpen'); await page.waitForSelector('#vOpenSet:not([hidden])');
  await page.click('#oN button[data-n="5"]'); await page.click('#oStart'); await page.waitForSelector('#vOpen:not([hidden])');
  for (let i = 0; i < 2; i++) {
    await page.fill('#oAns', 'קארדו = ציר צפון–דרום, דקומנוס מזרח–מערב');
    await page.click('#oReveal');
    const n = await page.evaluate(() => document.querySelectorAll('#oKp input').length);
    ok(n >= 3, `${label} : corrigé de la question ${i + 1} (${n} points clés)`);
    if (i === 0) { await page.evaluate(() => document.querySelectorAll('#oKp input').forEach(x => x.click())); await page.screenshot({ path: `${OUT}/${label}-open.png`, fullPage: true }); }
    if (i === 0) await page.click('#oNext'); else await page.click('#oQuit');
  }
  await page.waitForSelector('#vResult:not([hidden])');
  ok((await page.textContent('#rBig')).trim() === '1/2', `${label} : questions ouvertes 1/2`);
  ok(await page.evaluate(() => window.MDProgress.archStats().known.some(id => id.startsWith('A-'))), `${label} : question ouverte réussie enregistrée`);
  await page.goto(base + 'architecture.html#/bank'); await ready(page);
  await page.fill('#bSearch', 'בית בד'); await page.waitForTimeout(150);
  ok((await page.$$('#bank details')).length >= 1, `${label} : banque + recherche « בית בד »`);
  ok(await noHScroll(page), `${label} : pas de défilement horizontal (banque)`);
  // המסע שלי et accueil : lien vers la page
  await page.goto(base + 'index.html'); await page.waitForTimeout(400);
  ok(await page.$('a[href^="architecture.html"]') !== null, `${label} : lien depuis l'accueil`);
  await ctx.close();
}

await run('S24', { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
await run('desktop', { viewport: { width: 1280, height: 800 } });
await browser.close(); server.close();
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1); }
console.log('\nOK — aucune erreur');
