// V4 de bout en bout dans un vrai Chromium (format téléphone) : création d'un parcours automatique
// puis partie en mode bus. Les services en ligne (OpenStreetMap, Wikipédia, Wikidata) sont SIMULÉS
// avec les données d'exemple de tests/v4-fixtures.mjs : ce test ne prouve pas que ces services
// répondent depuis le site, seulement que la page sait les utiliser.
// Prérequis : base mdl_dev (install.sql, mot de passe 'guide-test-2026'), serveur de dev lancé.
import { chromium } from 'playwright-core';
import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { respond, GEOM } from './v4-fixtures.mjs';

const OUT = process.argv[2] || 'screens-v4';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: 'mdl_dev' });
await db.connect();
const one = async sql => (await db.query(sql)).rows[0];
const ok = m => console.log('✔ ' + m);
const errors = [];
const browser = await chromium.launch({ executablePath: exe });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const EXT = /nominatim\.openstreetmap\.org|router\.project-osrm\.org|wikipedia\.org|wikidata\.org/;
async function stubExternal(ctx) {
  await ctx.route(u => EXT.test(u.host), async r => { const x = await respond(r.request().url()); await r.fulfill({ status: x.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: x.body }); });
}
const watch = (p, who) => { p.on('pageerror', e => errors.push(who + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(who + ': ' + m.text())); };

// ------------------------------------------------------------------ Création
const ctx = await browser.newContext(phone); await stubExternal(ctx);
const p = await ctx.newPage(); watch(p, 'create');
await p.goto(BASE + '/create.html');
await p.waitForSelector('a[href="admin.html"]');
assert.match(await p.textContent('#app'), /צריך להיכנס קודם/, 'sans connexion : renvoi vers l\'admin');
await p.goto(BASE + '/admin.html');
await p.fill('#pw', 'guide-test-2026'); await p.click('text=כניסה');
await p.waitForSelector('[data-view=settings]', { state: 'attached' });
await p.waitForTimeout(400);
if (await p.$('#guide')) await p.click('#guide [data-g=close]');
await p.click('[data-view=settings]');
await p.click('a[href="create.html"]');
await p.waitForSelector('#cf');
await p.screenshot({ path: `${OUT}/c1-formulaire.png` });
await p.fill('#from', 'זכרון יעקב'); await p.fill('#to', 'יקנעם');
await p.setInputFiles('#doc', new URL('./sample-guide.pdf', import.meta.url).pathname);    // PDF facultatif (lu par pdf.js embarqué)
assert.equal(await p.inputValue('#from'), 'זכרון יעקב');
await p.click('#cf button.sun');
await p.waitForSelector('.rq', { timeout: 30000 });
const n = await p.$$eval('.rq', l => l.length);
assert.match(await p.textContent('#app'), /📄 מהמסמך: 0 מקומות · 0 שאלות/, 'PDF lu (aucun lieu du parcours dedans)');
assert.ok(n >= 4, 'questions générées : ' + n);
assert.match(await p.textContent('#app'), /בת שלמה/);
await p.screenshot({ path: `${OUT}/c2-relecture.png`, fullPage: true });
await p.click('.rq >> nth=1 >> input[type=checkbox]');            // le guide écarte une question
await p.waitForFunction(k => /לשמור (\d+) שאלות/.exec(document.querySelector('#save').textContent)[1] == k, n - 1);
await p.click('#save');
await p.waitForURL(/admin\.html/, { timeout: 15000 });
ok(`création : départ/arrivée → ${n} questions → relecture (1 écartée) → enregistrement → nouvelle partie`);

// ------------------------------------------------------------------ La partie V4 en mode bus
const g = await one(`select g.bank, (select count(*)::int from mdl.questions q where q.bank = g.bank) n, b.route->>'bank' rb
  from mdl.games g join mdl.question_banks b on b.code = g.bank where g.is_active`);
assert.match(g.bank, /^A\d/); assert.equal(g.n, n - 1); assert.equal(g.rb, g.bank);
await p.waitForSelector('#busroot #busact', { timeout: 15000 });
await p.waitForFunction(() => /לפרסם שאלה/.test(document.querySelector('#busact').textContent), null, { timeout: 15000 });
assert.match(await p.textContent('#busbody'), /באיזו שנה|על שם מי|מה זה|כמה תושבים/);
await p.screenshot({ path: `${OUT}/c3-bus.png` });
// un élève rejoint en français
const sctx = await browser.newContext(phone); const s = await sctx.newPage(); watch(s, 'élève');
await s.goto(BASE + '/play.html'); await s.waitForSelector('#joinf');   // page élève (l'accueil `/` est le lanceur NEXT)
await s.click('[data-lang=fr]'); await s.fill('#nm', 'Lea'); await s.click('#jbtn');
await s.waitForSelector('.waiting');
await p.click('#busact');
await s.waitForSelector('#ans .ans', { timeout: 15000 });
const sTxt = await s.textContent('#app');
assert.match(sTxt, /En quelle année|D'après qui|Qu'est-ce que|Combien d'habitants/, 'question en français');
await s.screenshot({ path: `${OUT}/c4-eleve-fr.png` });
await p.waitForFunction(() => /⏳/.test(document.querySelector('#busact').textContent));
ok('partie V4 : mode bus sur le tracé généré, publication manuelle, élève en français');

// ------------------------------------------------------------------ Le GPS suit le tracé généré
const gctx = await browser.newContext(Object.assign({}, phone, { geolocation: { latitude: GEOM[2][0], longitude: GEOM[2][1], accuracy: 10 }, permissions: ['geolocation'] }));
const gp = await gctx.newPage(); watch(gp, 'gps');
await gp.goto(BASE + '/admin.html');
await gp.fill('#pw', 'guide-test-2026'); await gp.click('text=כניסה');
await gp.waitForSelector('#busroot', { timeout: 15000 });
await gp.click('[data-nav=bus-menu]'); await gp.click('#bussheet [data-nav=gps-on]');
for (let i = 3; i <= 8; i++) { await gctx.setGeolocation({ latitude: GEOM[i][0], longitude: GEOM[i][1], accuracy: 10 }); await gp.waitForTimeout(700); }
assert.match(await gp.textContent('.busband'), /מ׳|ק״מ|עכשיו|❓/, 'bandeau : distance le long du tracé généré');
assert.equal(await gp.$eval('.gpsdot', e => e.className.includes('on')), true, 'GPS actif sur le tracé');
await gp.screenshot({ path: `${OUT}/c5-gps.png` });
ok('GPS : position projetée sur le tracé V4');

assert.deepEqual(errors, [], 'erreurs JavaScript : ' + errors.join(' | '));
ok('aucune erreur JavaScript');
await browser.close(); await db.end();
