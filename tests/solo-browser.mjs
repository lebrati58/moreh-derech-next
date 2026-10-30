// Mode SOLO de bout en bout (Chromium, format téléphone) : sans admin, chacun avec son GPS.
// Services en ligne SIMULÉS (données d'exemple de tests/v4-fixtures.mjs) — ne prouve pas qu'ils
// répondent depuis le site. Prérequis : base mdl_dev (install.sql, mot de passe 'guide-test-2026'), serveur de dev.
import { chromium } from 'playwright-core';
import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { respond, GEOM } from './v4-fixtures.mjs';

const OUT = process.argv[2] || 'screens-solo';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: 'mdl_dev' });
await db.connect();
const call = async (fn, args) => (await db.query(`select public.${fn}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(', ')}) r`, Object.values(args))).rows[0].r;
const ok = m => console.log('✔ ' + m);
const errors = [];
const browser = await chromium.launch({ executablePath: exe });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  geolocation: { latitude: GEOM[0][0], longitude: GEOM[0][1], accuracy: 10 }, permissions: ['geolocation'] };
const EXT = /nominatim\.openstreetmap\.org|router\.project-osrm\.org|wikipedia\.org|wikidata\.org/;
const stub = async ctx => ctx.route(u => EXT.test(u.host), async r => { const x = await respond(r.request().url()); await r.fulfill({ status: x.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: x.body }); });
const watch = (p, who) => { p.on('pageerror', e => errors.push(who + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(who + ': ' + m.text())); };
const ext = [];

// ------------------------------------------------------------------ Accueil élève → lien vers le solo
const ctx = await browser.newContext(phone); await stub(ctx);
ctx.on('request', r => { if (!/localhost/.test(r.url())) ext.push(r.url()); });
const p = await ctx.newPage(); watch(p, 'solo');
await p.goto(BASE + '/play.html');   // page élève (l'accueil `/` est le lanceur NEXT)
await p.waitForSelector('a[href="solo.html"]');
await p.click('a[href="solo.html"]');
await p.waitForSelector('#sf');
assert.match(await p.textContent('#app'), /רק לנוסעים — לא לנהג/, 'avertissement conducteur');
await p.screenshot({ path: `${OUT}/s1-depart.png` });
ok('accueil élève : lien « משחק עצמאי » → page solo, avertissement conducteur');

// ------------------------------------------------------------------ Génération : départ = ma position
await p.fill('#to', 'יקנעם');
await p.setInputFiles('#doc', new URL('./sample-guide.docx', import.meta.url).pathname);   // document facultatif
assert.equal(await p.inputValue('#to'), 'יקנעם', 'choisir un fichier ne vide pas la destination');
await p.click('#sf button.sun');
await p.waitForSelector('#go', { timeout: 30000 });
assert.match(await p.textContent('#app'), /📄 מהמסמך: 2 מקומות · 1 שאלות/, 'le document a enrichi le parcours');
assert.ok(!ext.some(u => /nominatim/.test(u) && /32\.6/.test(decodeURIComponent(u))), 'ma position n\'est pas envoyée à Nominatim (coordonnées utilisées telles quelles)');
assert.ok(!ext.some(u => /supabase|rest\/v1/.test(u)), 'aucun appel au serveur de jeu');
await p.screenshot({ path: `${OUT}/s2-pret.png` });
ok('génération sur le téléphone : départ = position GPS, aucune donnée envoyée au serveur de jeu');

// ------------------------------------------------------------------ Trajet simulé : les questions sortent toutes seules
await p.click('[data-l=fr]'); await p.click('[data-l=he]');
await p.click('#simgo');
let answered = 0, shot = false, sawDoc = false, skippedOnce = false;
for (let i = 0; i < 400; i++) {
  if (await p.$('.trophy')) break;
  if (await p.$('#ans')) {
    if (!shot) { await p.screenshot({ path: `${OUT}/s3-question.png` }); shot = true; }
    if (/השלימו את השנה/.test(await p.textContent('#app'))) { sawDoc = true; await p.screenshot({ path: `${OUT}/s3b-question-document.png` }); }
    await p.click('#ans .ans >> nth=0'); await p.click('#send'); answered++;
    await p.waitForSelector('#cont');
    if (answered === 1) await p.screenshot({ path: `${OUT}/s4-resultat.png` });
    await p.click('#cont');
  }
  // « question suivante maintenant » puis « passer » : sans attendre le GPS, 0 point
  if (!skippedOnce && answered >= 1 && await p.$('#nextnow')) {
    skippedOnce = true;
    const before = await p.evaluate(() => JSON.parse(localStorage.getItem('mdl_solo')).score);
    await p.click('#nextnow'); await p.waitForSelector('#skipq');
    if (/השלימו את השנה/.test(await p.textContent('#app'))) sawDoc = true;
    await p.click('#skipq'); await p.waitForSelector('#cont');
    assert.match(await p.textContent('.result'), /דילגתם/);
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('mdl_solo')).score), before, 'passer = 0 point');
    await p.click('#cont');
  }
  await p.waitForTimeout(500);
}
assert.ok(skippedOnce, 'bouton « השאלה הבאה עכשיו » proposé en attente');
assert.ok(answered >= 3, 'questions déclenchées par la position : ' + answered);
assert.ok(sawDoc, 'la question tirée du document est apparue pendant le trajet');
await p.waitForSelector('.trophy', { timeout: 60000 });
const end = await p.textContent('#app');
assert.match(end, /סוף המסלול/);
assert.match(end, /\d+ נקודות/);
await p.screenshot({ path: `${OUT}/s5-fin.png` });
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('mdl_solo')));
assert.equal(Object.keys(saved.ans).length >= answered, true, 'réponses gardées dans le téléphone');
ok(`trajet (simulation) : ${answered} questions apparues seules, score et écran de fin`);
await ctx.close();

// ------------------------------------------------------------------ Parcours partagé par le créateur (lien)
const tok = (await call('admin_login', { p_password: 'guide-test-2026' })).token;
const { umdBuild } = await import('./v4-build.mjs');
const built = umdBuild();
const imp = await call('admin_import_route', { p_token: tok, p_label: JSON.stringify({ he: 'מסלול משותף' }), p_route: JSON.stringify(built.route), p_questions: JSON.stringify(built.questions) });
const c2 = await browser.newContext(phone); const p2 = await c2.newPage(); watch(p2, 'lien');
await p2.goto(BASE + '/solo.html?r=' + imp.code);
await p2.waitForSelector('#sf');
assert.match(await p2.textContent('#app'), /המסלול המשותף לא נמצא|לאן נוסעים/, 'pas partagé : pas de parcours');
await call('admin_set_solo', { p_token: tok, p_bank: imp.code, p_on: true });
await p2.goto(BASE + '/solo.html?r=' + imp.code.toLowerCase());
await p2.waitForSelector('#go');
assert.match(await p2.textContent('#app'), new RegExp(`${built.questions.length} שאלות`));
await p2.click('[data-l=ru]');
assert.match(await p2.textContent('#app'), /Поехали/);
await p2.screenshot({ path: `${OUT}/s6-lien-ru.png` });
ok('lien partagé : lisible seulement après partage par le créateur, 4 langues');
await c2.close();

assert.deepEqual(errors, [], 'erreurs JavaScript : ' + errors.join(' | '));
ok('aucune erreur JavaScript');
await browser.close(); await db.end();
