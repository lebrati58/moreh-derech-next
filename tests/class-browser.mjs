// Concours de la classe (téléphone simulé) : message clair si la fonction manque sur le serveur, tableau en direct
// (rafraîchi tout seul : un nouvel inscrit apparaît sans recharger). Serveur Supabase SIMULÉ.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
let mode = 'missing', v2 = true, players = [{ name: 'דנה', points: 900, stars: 2, gold: 0, cls: '' }], lastSubmit = null;
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && /\/rest\/v1\/rpc\//.test(req.url)) {
    const fn = req.url.split('/rpc/')[1], body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
    const miss = () => { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"code":"PGRST202"}'); };
    if (mode === 'missing' || (!v2 && /class_board|class_submit/.test(fn))) return miss();
    if (fn === 'class_submit' || fn === 'class_score_submit') lastSubmit = body;
    res.writeHead(200, { 'content-type': 'application/json' });
    if (fn === 'class_board') return res.end(JSON.stringify({ items: players.filter(p => p.cls === (body.p_class || '')) }));
    if (fn === 'class_leaderboard') return res.end(JSON.stringify({ items: players }));
    return res.end('{"ok":true}');
  }
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'he-IL' })).newPage();
const errors = [], ok = (c, m) => { if (!c) { errors.push(m); console.log('❌', m); } else console.log('✅', m); };
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.clock.install();
await page.goto(base + 'class.html');
await page.waitForFunction(() => /class_contest\.sql/.test(document.getElementById('board').textContent));
ok(true, 'fonction absente : message « class_contest.sql » (et non « pas de connexion »)');
mode = 'ok';
await page.clock.runFor(21000);
await page.waitForFunction(() => /דנה/.test(document.getElementById('board').textContent));
ok(/בשידור חי/.test(await page.textContent('#live')), 'tableau affiché sans recharger, « בשידור חי »');
players = players.concat({ name: 'יוסי', points: 1200, stars: 3, gold: 1, cls: '' });
await page.clock.runFor(21000);
await page.waitForFunction(() => /יוסי/.test(document.getElementById('board').textContent));
ok((await page.textContent('#board')).indexOf('יוסי') < (await page.textContent('#board')).indexOf('דנה'), 'nouvel inscrit apparu tout seul, classé par points');
// Code de classe : lien partagé « ?c=… », tableau de la classe seulement, changement de classe dans la page
players.push({ name: 'מאיה', points: 800, stars: 2, gold: 0, cls: 'yuval-2026' }, { name: 'רון', points: 500, stars: 1, gold: 0, cls: 'yuval-2026' });
await page.goto(base + 'class.html?c=Yuval-2026');
await page.waitForFunction(() => /מאיה/.test(document.getElementById('board').textContent));
const b1 = await page.textContent('#board');
ok(/טבלת הכיתה: yuval-2026/.test(b1) && /רון/.test(b1) && !/דנה|יוסי/.test(b1), 'lien ?c= : tableau de la classe « yuval-2026 » seulement');
ok(/הכיתה שלי: yuval-2026/.test(await page.textContent('#klass')), 'code de classe affiché et mémorisé');
if (process.argv[2]) await page.screenshot({ path: process.argv[2] + '/classe.png', fullPage: true });
await page.click('#kEdit'); await page.fill('#kc', ''); await page.click('#kSave');
await page.clock.runFor(2000);
await page.waitForFunction(() => /טבלה כללית/.test(document.getElementById('board').textContent));
ok(/דנה/.test(await page.textContent('#board')) && !/מאיה/.test(await page.textContent('#board')), 'code vidé : retour au tableau général');
v2 = false;
await page.click('#kEdit'); await page.fill('#kc', 'yuval-2026'); await page.click('#kSave');
await page.clock.runFor(2000);
await page.waitForFunction(() => /class_contest_v2\.sql/.test(document.getElementById('board').textContent));
ok(true, 'serveur sans la v2 : message « class_contest_v2.sql »');
ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
