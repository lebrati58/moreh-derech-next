// « 🏆 אלוף הקורס » dans un vrai navigateur : un hôte (ordinateur 1280×800) et 3 joueurs (Galaxy S24 360×780),
// transport local (BroadcastChannel). Salle → code → 3 inscriptions (prénoms identiques) → 10 questions avec
// lecture puis chrono → réponses rapides / lentes / fausses → révélation → classement → rechargement d'un joueur
// et de l'hôte en cours de partie → podium → points dans « המסע שלי » → nouveau tour.
// Usage : CHROME=/chemin/chrome node tests/campus-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-campus';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--no-zygote', '--autoplay-policy=no-user-gesture-required'] });

const errors = [];
const ok = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
// Un seul contexte : les onglets partagent le BroadcastChannel (comme des téléphones sur le même canal).
// Chaque joueur a son propre identifiant : on le fixe avant le chargement (localStorage partagé dans un contexte).
const ctx = await browser.newContext({ locale: 'he-IL' });
await ctx.route(/supabase\.co/, r => r.abort());
async function open(viewport, url, init) {
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(base + url);
  return page;
}
const S24 = { width: 360, height: 780 }, PC = { width: 1280, height: 800 };
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const hostG = host => host.evaluate(() => { const h = MDCampusApp.host(); return h && JSON.parse(JSON.stringify({ phase: h.game.phase, i: h.game.i, n: h.game.questions.length, startAt: h.game.startAt, correct: h.game.questions[h.game.i] ? h.game.questions[h.game.i].correct : -1, players: h.game.players })); });
const waitPhase = (host, phase, i) => host.waitForFunction(([p, i]) => { const h = MDCampusApp.host(); return h && h.game.phase === p && (i == null || h.game.i === i); }, [phase, i], { timeout: 20000 });

// ---------- hôte ----------
const host = await open(PC, 'campus.html');
ok(await host.locator('h1').innerText() === 'אלוף הקורס', 'accueil du jeu');
await host.click('#host');
await host.waitForFunction(() => /בבנק/.test(document.getElementById('bankInfo').textContent));
const info = await host.locator('#bankInfo').innerText();
ok(+info.match(/(\d+)/)[1] > 1500, 'banque chargée : ' + info);
// filtre : seulement la frise → moins de questions, puis retour à tout
await host.click('[data-k="tours"]'); await host.click('[data-k="arch"]'); await host.click('[data-k="lessons"]');
ok(/ציר הזמן/.test(await host.locator('#srcs [aria-pressed="true"]').innerText()) && await host.locator('#box-tours').isHidden(), 'filtre de sources');
await host.click('[data-k="tours"]'); await host.click('[data-k="arch"]'); await host.click('[data-k="lessons"]');
// les סיורים par thème, pas par numéro
ok(/הנגב הצפוני/.test(await host.locator('#sub-tours').innerText()), 'סיורים affichés par thème : ' + (await host.locator('#sub-tours [data-sub]').first().innerText()));
ok(await host.locator('#sub-lessons [data-sub="geology"]').count() === 1, 'thème géologie proposé');
// géologie seule → toutes les questions des cours viennent de la géologie
await host.click('#sub-lessons [data-sub="geology"]');
const geo = await host.evaluate(() => document.getElementById('bankInfo').innerText);
ok(/\d+ בבחירה/.test(geo), 'sélection géologie : ' + geo);
await host.click('[data-none="lessons"]');
await host.click('#sub-tours [data-sub="03"]'); await host.click('[data-none="tours"]');
await host.click('[data-n="10"]'); await host.click('[data-s="10"]');
await host.screenshot({ path: `${OUT}/pc-1-setup.png`, fullPage: true });
await host.click('#open');
await host.waitForSelector('#bigPin');
const pin = (await host.locator('#bigPin').innerText()).trim();
ok(/^\d{5}$/.test(pin), 'code de partie ' + pin);
ok(await host.locator('#qr svg').count() === 1, 'QR code affiché');
ok(await host.locator('#start').isDisabled(), 'impossible de commencer sans joueur');

// ---------- joueurs ----------
const ids = ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003'];
const players = [];
for (let k = 0; k < 3; k++) {
  // localStorage est partagé dans le contexte : chaque onglet garde son identité dans sessionStorage → on injecte un proxy
  const init = new Function(`(function(){var KEY='mdc_me_v1',me=${JSON.stringify(JSON.stringify({ id: ids[k] }))};
    var get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    Storage.prototype.getItem=function(x){if(this===window.localStorage&&x===KEY){return sessionStorage.getItem('me')||me;}return get.call(this,x);};
    Storage.prototype.setItem=function(x,v){if(this===window.localStorage&&x===KEY){return sessionStorage.setItem('me',v);}if(this===window.localStorage&&x==='mdl_progress_v1'){return sessionStorage.setItem('prog',v);}return set.call(this,x,v);};
    var g2=Storage.prototype.getItem;Storage.prototype.getItem=function(x){if(this===window.localStorage&&x==='mdl_progress_v1'){return sessionStorage.getItem('prog');}return g2.call(this,x);};})();`);
  const p = await open(S24, 'campus.html?pin=' + pin, init);
  await p.waitForSelector('#nm');
  await p.fill('#nm', k < 2 ? 'נועה' : 'דוד');
  await p.click('#avs button:nth-child(' + (k + 2) + ')');
  if (k === 0) await p.screenshot({ path: `${OUT}/s24-1-join.png` });
  await p.click('#in');
  players.push(p);
}
for (const p of players) await p.waitForFunction(() => /נכנסת למשחק/.test(document.body.innerText), null, { timeout: 15000 });
ok(true, '3 joueurs inscrits');
await host.waitForFunction(() => document.querySelectorAll('#roster .who').length === 3);
const names = await host.locator('#roster .who').allInnerTexts();
ok(names.some(n => n.includes('נועה (2)')), 'prénoms identiques départagés : ' + names.join(' | '));
await players[0].screenshot({ path: `${OUT}/s24-2-lobby.png` });
await host.screenshot({ path: `${OUT}/pc-2-lobby.png` });
ok(await noHScroll(players[0]) && await noHScroll(host), 'pas de défilement horizontal');

// ---------- partie ----------
await host.click('#start');
let n = 10;
for (let i = 0; i < n; i++) {
  await waitPhase(host, 'question', i);
  const g = await hostG(host);
  n = g.n;
  if (i === 0) {
    await players[0].waitForSelector('#readyN');
    await players[0].screenshot({ path: `${OUT}/s24-3-reading.png` });
    ok(await players[0].locator('#ans').count() === 0, 'temps de lecture : pas encore de réponses');
  }
  for (const p of players) await p.waitForSelector('#ans button:not([disabled])', { timeout: 15000 });
  const c = g.correct, wrong = (c + 1) % 4;
  await players[0].click(`#ans button[data-i="${c}"]`);                      // rapide et juste
  if (i === 0) { await players[0].waitForFunction(() => /נקלטה/.test(document.body.innerText)); await players[0].screenshot({ path: `${OUT}/s24-4-answered.png` }); await host.screenshot({ path: `${OUT}/pc-3-question.png` }); }
  await players[1].waitForTimeout(1500);
  await players[1].click(`#ans button[data-i="${i % 3 === 2 ? wrong : c}"]`);  // plus lent, parfois faux
  if (i !== 4) await players[2].click(`#ans button[data-i="${wrong}"]`);      // toujours faux ; ne répond pas à la question 5
  if (i === 3) {
    // un joueur recharge sa page en pleine question : il revient dans la partie, sa réponse est déjà comptée
    await players[1].reload();
    await players[1].waitForFunction(() => document.querySelector('#ans') || /נכון|לא נכון/.test(document.body.innerText), null, { timeout: 15000 });
    ok(true, 'joueur rechargé : de retour dans la partie');
  }
  await waitPhase(host, 'reveal', i);
  await players[0].waitForFunction(() => /נכון!/.test(document.body.innerText), null, { timeout: 15000 });
  await players[2].waitForFunction(() => /לא נכון|לא הספקת/.test(document.body.innerText), null, { timeout: 15000 });
  if (i === 0) {
    const pts = +(await players[0].locator('.result .pts').innerText()).replace(/\D/g, '');
    ok(pts >= 900 && pts <= 1000, 'réponse rapide ≈ 1000 points : ' + pts);
    await players[0].screenshot({ path: `${OUT}/s24-5-right.png` }); await players[2].screenshot({ path: `${OUT}/s24-6-wrong.png` });
    await host.screenshot({ path: `${OUT}/pc-4-reveal.png` });
  }
  if (i === 4) ok(/לא הספקת/.test(await players[2].locator('body').innerText()), 'pas de réponse : 0 point, message dédié');
  await host.click('#nx');                                   // passer au classement sans attendre
  if (i === n - 1) break;                                    // dernière question : directement le podium
  await waitPhase(host, 'board', i);
  if (i === 1) {
    await players[0].waitForFunction(() => /הטבלה/.test(document.body.innerText));
    await players[0].screenshot({ path: `${OUT}/s24-7-board.png` }); await host.screenshot({ path: `${OUT}/pc-5-board.png` });
    const first = await host.locator('.board li').first().innerText();
    ok(/נועה/.test(first) && !/\(2\)/.test(first), 'le plus rapide en tête du classement');
  }
  if (i === 5) {
    // l'hôte recharge sa page : la partie reprend au même endroit
    await host.reload();
    await host.waitForFunction(() => MDCampusApp.host() && MDCampusApp.host().game.phase === 'board');
    ok((await hostG(host)).i === 5, 'hôte rechargé : partie reprise');
  }
  if (i === n - 2) ok(/שאלת האלוף/.test(await host.locator('body').innerText()), 'annonce de la question finale ×2');
  if (i < n - 1) await host.click('#nx');
}
await waitPhase(host, 'podium');
for (const p of players) await p.waitForSelector('.podium', { timeout: 15000 });
await players[0].waitForTimeout(3000);
await host.waitForTimeout(500);
await players[0].screenshot({ path: `${OUT}/s24-8-podium.png` });
await host.screenshot({ path: `${OUT}/pc-6-podium.png`, fullPage: true });
ok(/אלוף הקורס!/.test(await players[0].locator('.rankline').innerText()), 'le joueur rapide et juste est champion');
const final = await hostG(host);
const sc = ids.map(id => final.players[id].score);
ok(sc[0] > sc[1] && sc[1] > sc[2], 'classement final cohérent : ' + sc.join(' > '));
ok(sc[2] === 0, 'toujours faux = 0');
ok(final.players[ids[0]].best === n, 'série complète enregistrée : ' + final.players[ids[0]].best);
ok(/התשובה הכי מהירה/.test(await host.locator('.stats').innerText()), 'statistiques de fin');
// points dans « המסע שלי » pour les questions des 22 סיורים
const prog = await players[0].evaluate(() => JSON.parse(sessionStorage.getItem('prog') || '{}'));
ok(Object.keys(prog.q || {}).length > 0, 'réponses des סיורים enregistrées dans le suivi personnel : ' + Object.keys(prog.q || {}).length);

// ---------- nouveau tour, mêmes joueurs ----------
await host.click('#again');
await waitPhase(host, 'lobby');
await host.waitForFunction(() => document.querySelectorAll('#roster .who').length === 3);
ok((await hostG(host)).i === -1, 'nouveau tour : mêmes joueurs, scores à zéro');
const g2 = await host.evaluate(() => MDCampusApp.host().game.questions.map(q => q.id));
ok(g2.length === 10, 'nouveau tour : 10 nouvelles questions');
for (const p of players) await p.waitForFunction(() => /מחכים שהמנחה/.test(document.body.innerText), null, { timeout: 15000 });
ok(true, 'les joueurs passent seuls au nouveau tour');

// accueil : tuile présente et page sans erreur
const home = await open(S24, 'index.html');
ok(await home.locator('a.campus[href="campus.html"]').count() === 1, 'tuile sur l\'accueil');
await home.screenshot({ path: `${OUT}/s24-0-home.png` });

await browser.close(); server.close();
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1); }
console.log('\nOK — toutes les vérifications passent');
