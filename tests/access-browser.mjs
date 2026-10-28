// Flux d'accès (téléphone simulé, serveur Supabase SIMULÉ) : élèves/participants sans numéro ; numéro demandé
// seulement pour lancer un quiz en direct (animateur) ; admin par mot de passe, séparé, absent de l'accueil.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2];
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const OK_TZ = '000000018'; // numéro FICTIF (chiffre de contrôle valide)
let required = true, sessions = new Set();
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && /\/rest\/v1\/rpc\//.test(req.url)) {
    const fn = req.url.split('/rpc/')[1], body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
    const send = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (fn === 'access_required') return send({ required });
    if (fn === 'access_check') return send({ required, ok: sessions.has(body.p_token) });
    if (fn === 'access_login') {
      const d = String(body.p_tz || '').replace(/\D/g, '').padStart(9, '0');
      if (d === OK_TZ) { const t = 'tok-' + Math.random().toString(36).slice(2); sessions.add(t); return send({ ok: true, token: t }); }
      return send({ error: d === '000000000' ? 'invalid_tz' : 'not_allowed' });
    }
    res.writeHead(404); return res.end();
  }
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'he-IL', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [], ok = (c, m) => { if (!c) { errors.push(m); console.log('❌', m); } else console.log('✅', m); };
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const hidden = () => page.evaluate(() => getComputedStyle(document.body).visibility === 'hidden');

// 1. ÉLÈVES / PARTICIPANTS : tout est ouvert, jamais de numéro (même quand la liste existe)
for (const p of ['index.html', 'map.html', 'history.html', 'class.html', 'play.html', 'admin.html?login=admin']) {
  await page.goto(base + p); await page.waitForTimeout(500);
  ok(!(await page.$('#mdlGate')) && !(await hidden()), p + ' : ouvert sans numéro');
}
ok(/חידון חי/.test(await (await page.goto(base + 'index.html'), page.textContent('.guide-link'))), 'accueil : seule entrée « להפעיל חידון חי », pas d’admin');
ok(!(await page.$('a[href*="admin.html"]')) && !(await page.$('a[href*="inbox.html"]')), 'accueil : aucun lien vers l’administration');
// 2. ANIMATEUR : le numéro est demandé seulement pour lancer un quiz en direct
await page.click('.guide-link');
await page.waitForSelector('#mdlGate input');
ok(await hidden() && /חידון חי/.test(await page.textContent('#mdlGate h1')), 'lancer un quiz en direct : numéro demandé');
if (OUT) await page.screenshot({ path: OUT + '/acces-1.png' });
await page.fill('#mdlGate input', '123456782'); await page.click('#mdlGate button');
await page.waitForFunction(() => /לא נמצא/.test(document.querySelector('#mdlGate .err').textContent));
ok(await hidden(), 'numéro hors liste : refusé');
await page.fill('#mdlGate input', '0000-00018'); await page.click('#mdlGate button');
await page.waitForFunction(() => !document.getElementById('mdlGate'));
ok(!(await hidden()), 'numéro de la liste : espace « חידון חי » visible');
const stored = await page.evaluate(() => JSON.stringify(localStorage));
ok(!/000000018|18"/.test(stored) && /tok-/.test(stored), 'le numéro n’est pas gardé dans le téléphone, seulement un jeton');
if (OUT) await page.screenshot({ path: OUT + '/acces-2.png', fullPage: true });
await page.goto(base + 'admin.html?mode=guide');
await page.waitForTimeout(800);
ok(!(await page.$('#mdlGate')) && await page.evaluate(() => document.body.classList.contains('host')), 'écran du quiz en direct : mode animateur (outils admin cachés)');
// 3. ADMIN : connexion distincte par mot de passe, jamais par le numéro
await page.goto(base + 'admin.html?login=admin');
await page.waitForSelector('#pw');
ok(!(await page.evaluate(() => document.body.classList.contains('host'))), 'admin.html?login=admin : mot de passe demandé, pas le mode animateur');
// animateur retiré de la liste : au prochain contrôle, retour au numéro
sessions.clear();
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mdl_access_v1')); s.checked = 0; localStorage.setItem('mdl_access_v1', JSON.stringify(s)); });
await page.goto(base + 'guide.html');
await page.waitForSelector('#mdlGate input');
ok(/הסתיימה/.test(await page.textContent('#mdlGate .err')), 'animateur retiré : il faut retaper le numéro');
// le guide connecté avec son mot de passe entre sans numéro
await page.evaluate(() => localStorage.clear());
sessions.add('adm-tok'); await page.evaluate(() => localStorage.setItem('mdl_admin', JSON.stringify('adm-tok')));
await page.goto(base + 'guide.html');
await page.waitForFunction(() => !document.getElementById('mdlGate') && getComputedStyle(document.body).visibility !== 'hidden');
ok(true, 'admin connecté (mot de passe) : pas de numéro');
await page.goto(base + 'admin.html');
await page.waitForTimeout(500);
ok(!(await page.evaluate(() => document.body.classList.contains('host'))), 'admin connecté : tous les outils (pas le mode animateur)');
// liste vide : l'espace s'ouvre (l'écran du quiz demandera alors le mot de passe)
required = false;
await page.evaluate(() => localStorage.clear());
await page.goto(base + 'guide.html');
await page.waitForTimeout(800);
ok(!(await page.$('#mdlGate')) && !(await hidden()), 'liste vide : pas de numéro demandé');
ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
