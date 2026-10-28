// Concours de la classe (téléphone simulé) : message clair si la fonction manque sur le serveur, tableau en direct
// (rafraîchi tout seul : un nouvel inscrit apparaît sans recharger). Serveur Supabase SIMULÉ.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
let mode = 'missing', players = [{ name: 'דנה', points: 900, stars: 2, gold: 0 }];
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && /\/rest\/v1\/rpc\//.test(req.url)) {
    if (mode === 'missing') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"code":"PGRST202"}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(/class_leaderboard/.test(req.url) ? { items: players } : { ok: true }));
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
players = players.concat({ name: 'יוסי', points: 1200, stars: 3, gold: 1 });
await page.clock.runFor(21000);
await page.waitForFunction(() => /יוסי/.test(document.getElementById('board').textContent));
ok((await page.textContent('#board')).indexOf('יוסי') < (await page.textContent('#board')).indexOf('דנה'), 'nouvel inscrit apparu tout seul, classé par points');
ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
