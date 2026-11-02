// « הדרכת דרך — מדריך באוטובוס » dans un vrai navigateur — Galaxy S24 (360×780, tactile) puis ordinateur.
// Liste (brouillon caché sans ?preview=1) → parcours : carte, simulation complète aller à 3 vitesses (chaque explication
// commence avant le point d'observation, jamais deux en même temps, aucune explication en retard), sens retour
// (côtés inversés), mode תרגול (texte masqué puis révélé), mode manuel, repérage enregistré dans le téléphone.
// Usage : CHROME=/chemin/chrome node tests/hadracha-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-hadracha';
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
  await ctx.route(/supabase\.co|tile\.openstreetmap|sw\.js/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
  return { ctx, page };
}
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// Simulation complète dans la page : on avance par pas de 0,5 s et on note où chaque explication commence et où l'on dit « regardez ».
const ride = (page, kmh) => page.evaluate(kmh => {
  const A = window.MDHadrachaApp, S = A.state(), H = window.MDHadracha;
  S.started = true; S.ride = 'sim'; S.v = kmh / 3.6; S.mul = 1; S.running = true; S.s = 0; S.clock = 0; S.done = new Set(); S.cur = null;
  const log = {}; let prev = null, overlaps = 0, guard = 0;
  while (S.s < A.route().directions[S.dir].lengthM - 1 && guard++ < 20000) {
    A.tick(0.5);
    const c = S.cur;
    if (c && !log[c.poi.id]) { const t = H.trigger(c.poi, S.dir, S.v); log[c.poi.id] = { start: S.s, short: c.short, sObs: t.sObs, sAbeam: c.poi.sAbeam, noLook: t.noLook, sVisEnd: t.sVisEnd }; if (prev && prev !== c.poi.id && S.cur && !S.done.has(prev)) overlaps++; prev = c.poi.id; }
    if (c && c.phase === 'look' && log[c.poi.id] && log[c.poi.id].look == null) log[c.poi.id].look = S.s;
  }
  S.running = false; S.started = false; A.goto(S.s);
  return { log, overlaps, n: A.pois().length, done: S.done.size };
}, kmh);

{
  const { ctx, page } = await newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(base + 'hadracha.html');
  await page.waitForSelector('#rl .card, #rl .ritem');
  ok(await page.locator('.ritem').count() === 0, 'sans ?preview=1 : le brouillon n’est pas listé');
  await page.goto(base + 'hadracha.html#/r/savidor-jerusalem?dir=fwd&mode=study');
  await page.waitForFunction(() => /בבדיקה/.test(document.querySelector('#app')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  ok(/בבדיקה/.test(await page.textContent('#app')), 'lien direct vers un brouillon sans aperçu : bloqué');

  await page.goto(base + 'hadracha.html?preview=1');
  await page.waitForSelector('#now [data-start]');
  ok(await page.locator('#now [data-start]').count() === 3, 'aperçu : un seul parcours → il s’ouvre directement sur « איך נוסעים? » (3 gros boutons)');
  ok(await page.locator('.draft').count() === 1, 'bandeau « טיוטה » (replié)');
  ok(await page.locator('.leaflet-container').count() === 1, 'carte Leaflet');
  ok(await page.locator('#list .li').count() === 15, '15 lieux listés');
  ok(await noHScroll(page), 'pas de défilement horizontal (360 px)');
  const startBox = await page.locator('[data-start=sim]').boundingBox();
  ok(startBox && startBox.y + startBox.height < 780, 'le bouton « נסיעה מדומה » est visible sans faire défiler');
  await page.screenshot({ path: `${OUT}/01-depart.png` });
  await page.click('[data-start=sim]');
  await page.waitForSelector('#play');
  ok(/האתר הבא|מתחילים להסביר/.test(await page.textContent('#now')) && /עצירה/.test(await page.textContent('#play')), 'un tap : la nasiya démarre (⏸️ עצירה + האתר הבא)');
  await page.click('#skip');
  ok(/מתחילים להסביר/.test(await page.textContent('#now')), '⏭️ לאתר הבא : l’explication suivante commence tout de suite');
  await page.screenshot({ path: `${OUT}/02-en-route.png` });
  const bar = await page.locator('.ctrls').boundingBox(), tab = await page.locator('.md-tabbar').boundingBox().catch(() => null);
  ok(bar && bar.y + bar.height <= 780 && (!tab || bar.y + bar.height <= tab.y + 1), 'la barre ⏸️ ⏭️ est toujours visible, au-dessus des onglets');
  await page.click('#play');
  ok(/המשך/.test(await page.textContent('#play')), '⏸️ met en pause');
  await page.click('#back');
  await page.waitForSelector('.ritem');
  ok(await page.locator('.ritem').count() === 1, 'retour à la liste : Savidor → Jérusalem listé');
  await page.click('.ritem');
  await page.waitForSelector('#now [data-start]');
  for (const kmh of [50, 80, 100]) {
    const r = await ride(page, kmh);
    const L = Object.entries(r.log);
    ok(L.length === r.n, `${kmh} km/h : les ${r.n} lieux sont commentés (${L.filter(([, x]) => x.short).length} en version courte)`);
    ok(r.overlaps === 0, `${kmh} km/h : jamais deux explications en même temps`);
    const bad = L.filter(([, x]) => !x.short && !x.noLook && !(x.start < x.sObs && x.look != null && x.look <= x.sAbeam + 5));
    ok(!bad.length, `${kmh} km/h : chaque explication commence avant l’observation, et « regardez » tombe avant le passage${bad.length ? ' — ' + bad.map(b => b[0]).join(',') : ''}`);
    const late = L.filter(([, x]) => x.start > x.sVisEnd);
    ok(!late.length, `${kmh} km/h : aucune explication lancée après le lieu`);
  }

  // moment « regardez » à l'écran
  await page.click('[data-start=sim]'); await page.click('#play');
  await page.evaluate(() => { const A = window.MDHadrachaApp, S = A.state(), H = window.MDHadracha; S.done = new Set(); S.cur = null; S.v = 80 / 3.6;
    const p = A.pois().find(x => x.id === 'latrunpolice'); const t = H.trigger(p, 'fwd', S.v);
    A.pois().filter(x => x.sAbeam < p.sAbeam).forEach(x => S.done.add(x.id)); S.running = true; A.goto(t.sTrig + 5); });
  ok(/מתחילים להסביר/.test(await page.textContent('#now')), 'au trigger_point : « מתחילים להסביר עכשיו » + texte');
  await page.locator('#now').screenshot({ path: `${OUT}/03-intro.png` });
  await page.evaluate(() => { const A = window.MDHadrachaApp, S = A.state(), H = window.MDHadracha; const t = H.trigger(S.cur.poi, 'fwd', S.v); A.goto(t.sObs); });
  ok(await page.locator('#now .side.right').count() === 1 && /תסתכלו ימינה/.test(await page.textContent('#now')), 'à l’observation_point : grand « 👉 תסתכלו ימינה » (police de Latrun)');
  await page.locator('#now').screenshot({ path: `${OUT}/04-regardez.png` });

  // repérage
  await page.click('#scoutc summary');
  await page.click('#seeY');
  ok(/1 רישומים/.test(await page.textContent('#scoutst')), 'repérage : un relevé « רואים עכשיו » enregistré dans le téléphone');

  // sens retour
  await page.evaluate(() => { location.hash = '#/r/savidor-jerusalem?dir=rev&mode=study'; });
  await page.waitForFunction(() => /חזור/.test(document.querySelector('.hero .eyebrow')?.textContent || ''));
  const rev = await page.evaluate(() => { const P = window.MDHadrachaApp.pois(); return { first: P[0].id, police: P.find(p => p.id === 'latrunpolice').side, emmaus: P.find(p => p.id === 'emmaus').side, cue: P.find(p => p.id === 'latrunpolice').commentary.cue }; });
  ok(rev.first === 'motza', 'retour : le premier lieu est Motza');
  ok(rev.police === 'left' && rev.emmaus === 'right' && /שמאלה/.test(rev.cue), 'retour : côtés inversés (police de Latrun à gauche, Emmaüs à droite) et consigne réécrite');
  const rr = await ride(page, 100);
  ok(Object.keys(rr.log).length === rr.n && rr.overlaps === 0, `retour 100 km/h : ${Object.keys(rr.log).length}/${rr.n} lieux, sans chevauchement`);

  // mode תרגול
  await page.evaluate(() => { location.hash = '#/r/savidor-jerusalem?dir=fwd&mode=practice'; });
  await page.waitForFunction(() => /תרגול/.test(document.querySelector('.chips')?.textContent || '') && !!document.querySelector('[data-start]'));
  await page.click('[data-start=sim]'); await page.click('#play');
  await page.evaluate(() => { const A = window.MDHadrachaApp, S = A.state(), H = window.MDHadracha; S.running = true; S.v = 80 / 3.6; const p = A.pois().find(x => x.id === 'emmaus');
    A.pois().filter(x => x.sAbeam < p.sAbeam).forEach(x => S.done.add(x.id)); A.goto(H.trigger(p, 'fwd', S.v).sTrig + 5); });
  ok(await page.locator('#reveal').count() === 1 && await page.locator('#now .say').count() === 0, 'תרגול : texte masqué, bouton « להציג »');
  await page.locator('#now').screenshot({ path: `${OUT}/05-tirgul.png` });
  await page.click('#reveal');
  ok(await page.locator('#now .say').count() >= 1, 'תרגול : texte révélé à la demande');

  // mode manuel
  await page.evaluate(() => { location.hash = '#/r/savidor-jerusalem?dir=fwd&mode=study'; });
  await page.waitForFunction(() => /לימוד/.test(document.querySelector('.chips')?.textContent || '') && !!document.querySelector('[data-start]'));
  await page.click('[data-start=manual]');
  await page.click('#next');
  ok(/מתחילים להסביר/.test(await page.textContent('#now')), 'manuel : « הבא » lance l’explication du premier lieu');
  await page.click('#next');
  ok(/עכשיו מסתכלים|לאורך הכביש/.test(await page.textContent('#now')), 'manuel : « הבא » passe à « regardez »');
  ok(await noHScroll(page), 'pas de défilement horizontal après les modes');
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base + 'hadracha.html?preview=1#/r/savidor-jerusalem?dir=fwd&mode=study');
  await page.waitForSelector('#now [data-start]');
  ok(await noHScroll(page), 'ordinateur : mise en page sans débordement');
  await page.screenshot({ path: `${OUT}/06-ordinateur.png`, fullPage: true });
  await ctx.close();
}
await browser.close(); server.close();
const js = errors.filter(e => !e.startsWith('ASSERT'));
ok(!js.length, 'aucune erreur JavaScript' + (js.length ? ' — ' + js.join(' | ') : ''));
if (errors.length) { console.log(`\n${errors.length} problème(s)`); process.exit(1); }
console.log('\nTout est vert.');
