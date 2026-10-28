// מורה דרך EXAM (téléphone simulé, carte schématique hors ligne) : accueil, choix des sites + vérification,
// programme, éditeur (compteur 180 / rouge au-delà), réponse modèle, « trouve les erreurs », examen blanc + correction.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2];
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'he-IL', serviceWorkers: 'block' });
await ctx.route(/unpkg\.com|openfreemap|amazonaws/, r => r.abort());       // pas de réseau : la carte doit passer en schéma
const page = await ctx.newPage();
const errors = [], ok = (c, m) => { if (!c) { errors.push(m); console.log('❌', m); } else console.log('✅', m); };
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('dialog', d => d.accept());
const shot = async n => { if (OUT) await page.screenshot({ path: `${OUT}/exam-${n}.png`, fullPage: true }); };

await page.goto(base + 'exam.html');
await page.waitForSelector('.hero');
ok(/אתגר המבחן/.test(await page.textContent('.hero')), 'accueil : titre « אתגר המבחן »');
ok(await page.$('.daily .modes a[href*="/guided"]'), 'mission du jour avec les 3 modes');
await page.waitForSelector('#homeMap svg');
ok((await page.$$('#homeMap .pt')).length === 5, 'carte (schéma hors ligne) : 5 sites');
ok(!(await page.$('#mdlGate')), 'aucun numéro de teoudat zehout demandé');
await shot('1-home');
// fiche d'un site : statut et sources
await page.click('#homeMap .pt[data-id="ein_keshatot"]');
await page.waitForSelector('.sheet');
const sheet = await page.textContent('.sheet');
ok(/ביקרנו בשטח/.test(sheet) && /749/.test(sheet) && /drive\.google\.com/.test(await page.innerHTML('.sheet')), 'fiche עין קשתות : statut, faits, lien source Drive');
ok(/09:00–17:00/.test(sheet) && /28 ₪/.test(sheet) && /🚻/.test(sheet) && /waze\.com/.test(await page.innerHTML('.sheet')), 'fiche : horaires, prix, toilettes, lien Waze');
await page.click('.sheet .x');

// MODE 1 — choix des sites
await page.goto(base + 'exam.html#/m/g1/guided/1');
await page.waitForSelector('.slots');
await page.selectOption('select[data-slot="a"]', 'road789');
await page.selectOption('select[data-slot="b"]', 'mitzpe_ofir');
await page.selectOption('select[data-slot="c"]', 'ein_keshatot');      // faux : pas lié à 1973
await page.selectOption('select[data-slot="d"]', 'kursi');
await page.selectOption('select[data-slot="e"]', 'hippos');
await page.selectOption('select[data-slot="long"]', 'ein_keshatot');    // déjà utilisé → faux aussi
await page.click('#chk');
await page.waitForSelector('.slot.bad');
ok((await page.$$('.slot.ok')).length === 4 && (await page.$$('.slot.bad')).length === 2, 'vérification : 4 bons, 2 erreurs signalées');
await page.click('[data-hint="c"]'); await page.click('[data-hint="c"]'); await page.click('[data-hint="c"]');
ok(/תל סאקי/.test(await page.textContent('.slot:nth-child(3) .hint')), 'indice niveau 3 : la bonne réponse et pourquoi');
await page.selectOption('select[data-slot="c"]', 'tel_saki');
await page.click('#chk');
await page.waitForFunction(() => document.querySelectorAll('.slot.ok').length === 6);
ok(true, 'tout juste après correction');
const xp1 = await page.evaluate(() => window.MDExamApp.state().xp);
ok(xp1 >= 60, 'XP gagnés (' + xp1 + ')');
await shot('2-sites');

// programme
await page.goto(base + 'exam.html#/m/g1/guided/2');
await page.waitForSelector('.plan');
const info = await page.textContent('.info');
ok(/עין קשתות/.test(info) && /שירותים/.test(info) && /לברר/.test(info), 'programme : infos des sites choisis (horaires, toilettes « לברר »)');
ok(/צומת צמח ← מצפה אופיר/.test(info) && /ק״מ אווירי/.test(info) && (await page.$$('.legs a[href*="google.com/maps/dir"]')).length >= 4, 'trajets : distance aérienne + liens Google/Waze, aucun temps inventé');
const fill = async (i, k, v) => { const sel = `.pr[data-i="${i}"] [data-k="${k}"]`; if (k === 'site') await page.selectOption(sel, v); else { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); } };
await fill(0, 'end', '08:15'); await fill(0, 'what', 'מפגש ואיסוף: צומת צמח'); await fill(0, 'log', 'לבדוק שכולם הגיעו');
await page.click('#add'); await fill(1, 'end', '17:30'); await fill(1, 'what', 'עין קשתות'); await fill(1, 'site', 'ein_keshatot'); await fill(1, 'log', 'תשלום כניסה');
await page.click('#chk');
await page.waitForSelector('#out .checks');
const plan = await page.textContent('#out');
ok(/בתוך שעות הפתיחה \(09:00–17:00\)/.test(plan) && /✗/.test(plan), 'programme : heures d’ouverture du cours vérifiées (עין קשתות jusqu’à 17:00)');
ok(/נקודת פיזור/.test(plan), 'programme : point de dispersion exigé');

// éditeur courte : compteur et dépassement
await page.goto(base + 'exam.html#/m/g1/guided/3');
await page.waitForSelector('#ed textarea');
await page.fill('#ed textarea', Array(190).fill('מילה').join(' '));
ok(/חריגה! 190\/180/.test(await page.textContent('[data-c="text"]')), 'compteur : 190/180 en rouge');
await page.fill('[data-f="method"]', Array(25).fill('תמונה').join(' '));
ok(/25\/20/.test(await page.textContent('[data-c="method"]')), 'אמצעים : 25/20 signalé');
await page.click('#chk');
await page.waitForSelector('#out .checks');
ok(/חריגה של 10/.test(await page.textContent('#out')), 'vérification : « חריגה של 10 » + règle du cahier');
await page.click('#mdl');
await page.waitForSelector('#out .mtext');
ok(/כורסי/.test(await page.textContent('#out .mtext')) && /לא תשובה רשמית/.test(await page.textContent('#out')), 'réponse modèle (כביש 789) affichée, marquée « pas officielle »');
await page.click('#cmp');
await page.waitForSelector('.cmp');
ok(true, 'comparaison côte à côte');
await shot('3-editor');

// MODE 2 — trouve les erreurs
await page.goto(base + 'exam.html#/m/g1/errors/e1');
await page.waitForSelector('.eitems');
await page.click('.eitems li[data-i="1"] .eit'); await page.click('.eitems li[data-i="1"] [data-c="period"]');
await page.click('.eitems li[data-i="3"] .eit');
await page.click('.eitems li[data-i="0"] .eit');                       // phrase juste marquée à tort
await page.click('#chk');
await page.waitForSelector('#out h3');
ok(/2 נמצאו · 1 פוספסו · 1 סומנו בטעות/.test(await page.textContent('#out h3')), 'trouve les erreurs : 2 trouvées, 1 manquée, 1 fausse alerte');
ok(/מעיין שכבה/.test(await page.textContent('.eitems li[data-i="5"]')), 'correction sourcée de l’erreur manquée (מעיין שכבה)');
await shot('4-errors');

// MODE 3 — examen blanc
await page.goto(base + 'exam.html#/m/g1/exam');
await page.waitForSelector('#go');
await page.selectOption('#durSel', '45');
await page.click('#go');
await page.waitForSelector('#tm');
ok(/^0:4[45]:\d\d$/.test(await page.textContent('#tm')), 'chronomètre 45 min');
ok(!(await page.$('#mdl')) && !(await page.$('[data-hint]')), 'examen : aucune aide');
await page.click('[data-t="long"]');
await page.waitForSelector('#ed textarea');
await page.selectOption('[data-f="site"]', 'ein_keshatot');
const longModel = await page.evaluate(async () => (await (await fetch('exam/golan-south.json')).json()).models.long_ein_keshatot);
await page.fill('[data-f="topic"]', longModel.topic); await page.fill('[data-f="place"]', longModel.place); await page.fill('[data-f="minutes"]', '45'); await page.fill('[data-f="method"]', longModel.method);
await page.fill('#ed textarea', longModel.text.replace(/749/, '363').replace('כלומר, זה לא בית כנסת מימי הבית השני.', 'זה בית כנסת מימי הבית השני.'));
await shot('5-exam');
await page.click('#sub');
await page.waitForSelector('.score');
const sc = await page.textContent('.score');
ok(/\/ 70/.test(sc) && /הערכה פדגוגית/.test(sc), 'résultat sur 70, marqué indicatif');
const longPart = await page.textContent('details.part:last-of-type');
ok(/749/.test(longPart) && /לא לימי הבית השני/.test(longPart), 'correction : erreurs historiques détectées (749, pas le Second Temple)');
await shot('6-result');
const st = await page.evaluate(() => window.MDExamApp.state());
ok(st.badges.includes('examdone') && st.history.length === 1, 'badge + historique enregistrés dans le téléphone');

// « À l'envers » : le guide décrit, l'app propose
await page.goto(base + 'exam.html#/tiyul');
await page.waitForSelector('#tGo');
await page.fill('#tGroup', 'משפחות, 40 איש, אוטובוס');
for (const t of ['synagogue', 'view', 'yom_kippur', 'christianity']) await page.$eval(`[data-tag="${t}"]`, el => el.click());
await page.$eval('#tGo', el => el.click());
await page.waitForSelector('.prop');
const prop = await page.textContent('.prop');
ok(/הצעה 1/.test(prop) && /עין קשתות/.test(prop) && /תל סאקי/.test(prop) && /כל מה שביקשתם מכוסה/.test(prop), 'tiyul : proposition couvrant les 4 souhaits');
ok(/זמן: לבדוק ב-Waze/.test(prop) && /לברר: שירותים/.test(prop) && /המתנה בקופה/.test(prop), 'tiyul : brouillon de programme sans temps inventé, toilettes et caisse « לברר »');
await page.$eval('[data-open="0"]', el => el.click());
await page.waitForSelector('.slots');
ok(/הטיול שלי/.test(await page.textContent('.brief h1')) && (await page.$$('.slots select')).length >= 4, 'tiyul : ouvert comme mission d’entraînement, sites pré-remplis');
await page.click('#chk'); await page.waitForSelector('.slot.ok');
ok((await page.$$('.slot.bad')).length === 0, 'mission personnalisée : tous les sites valides');
await page.goto(base + 'exam.html#/m/custom/guided/2');
await page.waitForSelector('.plan');
ok((await page.$$('.plan .pr')).length >= 9 && (await page.$$eval('.plan [data-k="what"]', els => els.map(e => e.value).join('|'))).includes('לבדוק ב-Waze'), 'programme pré-rempli (lignes de trajet à compléter)');
await shot('7-tiyul');

// FR
await page.goto(base + 'exam.html');
await page.waitForSelector('#lng'); await page.click('#lng');
await page.waitForSelector('.hero');
ok(/Exam Challenge/.test(await page.textContent('.hero')), 'accompagnement en français');

ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
