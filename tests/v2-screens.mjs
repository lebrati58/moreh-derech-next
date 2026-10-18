// Parcours navigateur V2 (vrais Chromium mobiles) + captures d'écran.
// Prérequis : base mdl_dev installée avec supabase/install.sql, mot de passe 'guide-test-2026',
//             serveur `npm run dev` lancé. Usage : node tests/v2-screens.mjs <dossier>
// Le temps minimal de 30 s est « vieilli » par SQL direct pour ne pas attendre (comme dans les tests unitaires).
import { chromium } from 'playwright-core';
import pg from 'pg';
import assert from 'node:assert/strict';

const OUT = process.argv[2] || '.';
const BASE = 'http://localhost:8787';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: 'mdl_dev' });
await db.connect();
const ageOpen = sec => db.query(`
  update mdl.games set opened_at = opened_at - interval '${sec} s' where is_active;
  update mdl.game_questions gq set opened_at = gq.opened_at - interval '${sec} s', closes_at = gq.closes_at - interval '${sec} s'
    from mdl.games g where g.is_active and gq.game_id = g.id and gq.question_id = g.current_question`);

const browser = await chromium.launch({ executablePath: exe });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
const watch = (p, who) => { p.on('pageerror', e => errors.push(who + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text()) && errors.push(who + ': ' + m.text())); };
// (les polices Google ne sont pas joignables dans un bac à sable sans Internet : ignoré)
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });

// ---------- guide : connexion + nouvelle partie V2
const admin = await (await browser.newContext(phone)).newPage(); watch(admin, 'admin');
await admin.goto(BASE + '/admin.html');
await admin.fill('#pw', 'guide-test-2026'); await admin.click('text=כניסה');
await admin.waitForSelector('[data-view=settings]');
await admin.waitForTimeout(500);
if (await admin.$('#guide')) await admin.click('#guide [data-g=close]');   // panneau micro auto-ouvert si la partie précédente était révélée
await admin.click('[data-view=settings]');
await admin.click('[data-a=newgame]');
await admin.waitForSelector('#ngf');
// plus de choix de version : la partie créée est toujours le parcours photographié
await shot(admin, 'a1-newgame-choice');
await admin.check('#ngf input[value=V2]');
await admin.click('#ngf button.sun');
await admin.waitForSelector('.bankchip.v2');
await admin.waitForSelector('.ph-row img');
await shot(admin, 'a2-live-v2', true);
const chip = await admin.textContent('.bankchip');
assert.match(chip, /6 שאלות/); assert.match(chip, /\+2 חלופיות/);

// ---------- élèves : choix de la langue AVANT le nom
const students = {};
for (const [lang, name] of [['fr', 'Camille'], ['ru', 'Ольга'], ['he', 'דנה']]) {
  const p = await (await browser.newContext(phone)).newPage(); watch(p, 'élève-' + lang);
  await p.goto(BASE + '/');
  await p.waitForSelector('.langgrid');
  if (lang === 'fr') await shot(p, 'p0-lang-picker');
  await p.click(`.langopt[data-lang=${lang}]`);
  await p.waitForSelector('#nm');
  assert.equal(await p.evaluate(() => document.documentElement.dir), lang === 'he' ? 'rtl' : 'ltr');
  if (lang === 'ru') await shot(p, 'p1-join-ru');
  await p.fill('#nm', name); await p.click('#jbtn');
  await p.waitForSelector('.waiting');
  students[lang] = p;
}
await shot(students.fr, 'p2-wait-fr');

// ---------- publication de la 1re question V2
await admin.click('[data-a=open]');
for (const l of ['fr', 'ru', 'he']) await students[l].waitForSelector('.ans');
const texts = {};
for (const l of ['fr', 'ru', 'he']) texts[l] = await students[l].textContent('.question-text');
assert.match(texts.fr, /couches/); assert.match(texts.ru, /слои/); assert.match(texts.he, /השכבות/);
await students.fr.click('.ans.c1'); await shot(students.fr, 'p3-question-fr');
await students.fr.click('#send');
await students.ru.click('.ans.c1'); await students.ru.click('#send');
await students.he.click('.ans.c0'); await students.he.click('#send');
await students.ru.waitForSelector('.result.none');
await shot(students.ru, 'p4-sent-ru');

// le guide ne peut pas fermer avant 30 s
await admin.waitForSelector('text=3 / 3 ענו');
await admin.waitForSelector('#closewait b');
assert.equal(await admin.isDisabled('#closebtn'), true);
await shot(admin, 'a3-open-locked', true);
await ageOpen(31);
await admin.waitForFunction(() => !document.getElementById('closebtn').disabled, null, { timeout: 5000 });
await admin.click('#closebtn');
await admin.waitForSelector('text=חשוף תשובה'); await admin.click('text=חשוף תשובה');

// révélation : panneau micro ouvert automatiquement ; résultat dans chaque langue
await admin.waitForSelector('#guide');
await shot(admin, 'a4-guide-he');
await admin.click('#guide [data-alang=fr]');
await admin.waitForSelector('#guide .guide-text[lang=fr]');
await admin.click('#guide [data-g=anec]');
await admin.waitForSelector('#guide .anec');
await shot(admin, 'a5-guide-fr-anecdote');
for (const l of ['fr', 'ru']) await students[l].waitForSelector('.result.good');
await students.he.waitForSelector('.result.wrong');
await shot(students.fr, 'p5-revealed-fr', true);
await shot(students.ru, 'p5-revealed-ru', true);
const scoreFr = await students.fr.textContent('#hdr-chip');

// changement de langue en cours de partie : score conservé
await students.fr.click('#lang-btn');
await students.fr.waitForSelector('#lsheet .langopt[data-lang=en]');
await shot(students.fr, 'p6-lang-sheet');
await students.fr.click('#lsheet .langopt[data-lang=en]');
await students.fr.waitForSelector('text=Correct!');
assert.equal(await students.fr.evaluate(() => document.documentElement.lang), 'en');
assert.equal((await students.fr.textContent('#hdr-chip')).split(' ')[0], scoreFr.split(' ')[0]);
await shot(students.fr, 'p7-switched-en', true);

// rechargement / perte de réseau : reconnexion automatique, même score
await students.ru.reload();
await students.ru.waitForSelector('.result.good');

// ---------- galerie : on avance de photo en photo sans rien envoyer
await admin.click('#guide [data-g=next]').catch(() => admin.click('#guide [data-g=close]'));
await admin.click('[data-view=gallery]');
await admin.waitForSelector('#strip img');
const v0 = (await db.query('select version from mdl.games where is_active')).rows[0].version;
for (let i = 0; i < 3; i++) await admin.click('[data-a=gnext]');
await admin.click('[data-a=anec]');
await admin.waitForSelector('.anec');
await shot(admin, 'a6-gallery-photo4', true);
await admin.click('[data-a=gpos][data-i="24"]');                 // photo 25 : panneau du camp d'Atlit (liée à une question)
await admin.waitForSelector('text=שאלה קשורה');
await shot(admin, 'a7-gallery-photo25', true);
const v1 = (await db.query('select version from mdl.games where is_active')).rows[0].version;
assert.equal(v1, v0, 'feuilleter la galerie ne change rien côté élèves');
await students.he.waitForTimeout(1600);
assert.ok(await students.he.$('.result.wrong'), 'aucune nouvelle question envoyée');

// ---------- alternatives : désactivées par défaut, activables
await admin.click('[data-view=live]');
await admin.waitForSelector('.spares');
await admin.click('.spares summary').catch(() => {});
await shot(admin, 'a8-live-next-spares', true);

console.log(errors.length ? 'ERREURS CONSOLE :\n' + errors.join('\n') : 'Aucune erreur console.');
await browser.close(); await db.end();
if (errors.length) process.exit(1);
