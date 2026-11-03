// Page d'installation (install.html) : Android/Chrome (bouton direct), iPhone (Safari), WhatsApp (navigateur intégré), ordinateur (QR) ; bouton 📲 de l'accueil.
// Usage : CHROME=/chemin/chrome node tests/install-browser.mjs [dossier-captures]
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = new URL('../public/', import.meta.url).pathname, OUT = process.argv[2] || 'screens-install'; await (await import('node:fs/promises')).mkdir(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (q, r) => { const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html'; try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const br = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const UAS = { android: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  whatsapp: 'Mozilla/5.0 (Linux; Android 14; SM-S921B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 WhatsApp/2.24',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const errs = []; let bad = 0;
for (const [k, ua] of Object.entries(UAS)) {
  const mob = k !== 'desktop';
  const ctx = await br.newContext({ userAgent: ua, viewport: mob ? { width: 360, height: 780 } : { width: 1100, height: 760 }, deviceScaleFactor: 2, isMobile: mob, hasTouch: mob, locale: 'he-IL' });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(k + ' ' + e.message));
  await pg.goto(base + 'install.html'); await pg.waitForTimeout(800);
  const vis = await pg.evaluate(() => [...document.querySelectorAll('section[id]')].filter(s => !s.hidden).map(s => s.id));
  const exp = { android: 'sAndroid', iphone: 'sIos', whatsapp: 'sInApp', desktop: 'sDesk' }[k];
  const ok = vis.includes(exp); if (!ok) bad++; console.log(ok ? '✅' : '❌', k, vis.join(','));
  if (k === 'android') { // simulation de la fenêtre d'installation de Chrome
    await pg.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(e); });
    await pg.waitForTimeout(200); const one = await pg.isVisible('#bInstall'); console.log(one ? '✅' : '❌', 'android : bouton « להתקין עכשיו »'); if (!one) bad++;
    await pg.screenshot({ path: `${OUT}/install-android.png`, fullPage: true });
    await pg.click('#bInstall'); await pg.waitForTimeout(300); const p = await pg.evaluate(() => window.__prompted === 1 && !document.getElementById('sDone').hidden);
    console.log(p ? '✅' : '❌', 'android : la fenêtre d’installation s’ouvre, puis « déjà installée »'); if (!p) bad++;
  } else await pg.screenshot({ path: `${OUT}/install-${k}.png`, fullPage: true });
  const qr = k === 'desktop' ? await pg.evaluate(() => { const c = document.getElementById('qr').getContext('2d').getImageData(20, 20, 90, 90).data; let d = 0; for (let i = 0; i < c.length; i += 4) if (c[i] < 50) d++; return d; }) : 1;
  if (!qr) { bad++; console.log('❌ QR vide'); } else if (k === 'desktop') console.log('✅ QR dessiné');
  const hs = await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); if (!hs) { bad++; console.log('❌', k, 'défilement horizontal'); }
  await ctx.close();
}
// accueil : le bouton 📲 mène à la page d'installation
const ctx = await br.newContext({ userAgent: UAS.android, viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }); const pg = await ctx.newPage();
await pg.goto(base + 'index.html'); await pg.waitForTimeout(1200); await pg.click('#installBtn'); await pg.waitForTimeout(800);
const u = pg.url(); console.log(u.endsWith('install.html') ? '✅' : '❌', 'accueil : 📲 התקנה → install.html'); if (!u.endsWith('install.html')) bad++;
await br.close(); srv.close(); console.log(errs.length ? errs.join('\n') : 'aucune erreur', bad ? bad + ' KO' : 'tout OK');
