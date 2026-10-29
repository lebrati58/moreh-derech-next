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
ok(await page.$('#homeMap [data-retry]') && /לא נטענה/.test(await page.textContent('#homeMap .mapnote')), 'carte : raison de l’échec + bouton « réessayer la vraie carte »');
await shot('1-home');
ok((await page.$$('.regions button, .regions .soonr')).length >= 8 && (await page.$$('.regions button.on')).length === 1, 'accueil : choix de la région (tout Israël, régions à venir marquées)');
ok(await page.$$eval('.mlist:not(.soon) .mcard', cs => cs.length >= 3 && cs.every(c => c.querySelector('.modes a') && !c.classList.contains('lock'))), 'accueil : toutes les missions ouvertes dès le départ (pas de verrou de niveau)');
// fiche d'un site : statut et sources
await page.click('#homeMap .pt[data-id="ein_keshatot"]');
await page.waitForSelector('.sheet');
const sheet = await page.textContent('.sheet');
ok(/ביקרנו בשטח/.test(sheet) && /749/.test(sheet) && /drive\.google\.com/.test(await page.innerHTML('.sheet')), 'fiche עין קשתות : statut, faits, lien source Drive');
ok(/09:00–17:00/.test(sheet) && /28 ₪/.test(sheet) && /🚻/.test(sheet) && /google\.com\/maps/.test(await page.innerHTML('.sheet')) && !/waze/.test(await page.innerHTML('.sheet')), 'fiche : horaires, prix, toilettes, lien Google Maps (plus de Waze)');
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
await page.waitForSelector('#pMap svg');
ok((await page.$$('#pMap .pt')).length === 5, 'programme : la carte est là, avec les numéros de visite');
await page.$eval('[data-mv="tel_saki:-1"]', el => el.click());
await page.waitForFunction(() => /תל א-סאקי/.test(document.querySelector('.pi .nm').textContent));
ok(/צומת צמח ← תל סאקי/.test(await page.textContent('.info')), 'ordre des visites modifié avec ▲ : trajets recalculés');
await page.$eval('[data-mv="tel_saki:1"]', el => el.click());
await page.waitForFunction(() => /מצפה אופיר/.test(document.querySelector('.pi .nm').textContent));
ok(/צומת צמח ← מצפה אופיר/.test(info) && /28 דק׳/.test(info) && /ק״מ בכביש/.test(info) && (await page.$$('.legs a[href*="google.com/maps/dir"]')).length >= 4 && !(await page.$$('.legs a[href*="waze"]')).length, 'trajets : temps de route (OSRM) + lien Google, sans Waze');
const pickTime = async (i, k, v) => { await page.$eval(`.pr[data-i="${i}"] .tbtn[data-t="${k}:${i}"]`, el => el.click()); await page.waitForSelector('.sheet.clock');
  const want = v.split(':').reduce((a, x) => a * 60 + +x, 0); let cur = (await page.textContent('#cv')).split(':').reduce((a, x) => a * 60 + +x, 0);
  while (cur !== want) { const d = want - cur, step = Math.abs(d) >= 60 ? 60 : Math.abs(d) >= 15 ? 15 : 5; await page.click(`.sheet.clock [data-d="${d > 0 ? step : -step}"]`); cur += d > 0 ? step : -step; }
  await page.click('#cok'); await page.waitForFunction(() => !document.querySelector('.sheet.clock')); };
const fill = async (i, k, v) => { if (k === 'start' || k === 'end') return pickTime(i, k, v); const sel = `.pr[data-i="${i}"] [data-k="${k}"]`; if (k === 'site') await page.selectOption(sel, v); else { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); } };
await fill(0, 'end', '08:15'); await fill(0, 'what', 'מפגש ואיסוף: צומת צמח'); await fill(0, 'log', 'לבדוק שכולם הגיעו');
await page.click('#add'); await fill(1, 'end', '17:30'); await fill(1, 'what', 'עין קשתות'); await fill(1, 'site', 'ein_keshatot'); await fill(1, 'log', 'תשלום כניסה');
await page.click('#chk');
await page.waitForSelector('#out .checks');
const plan = await page.textContent('#out');
ok(/בתוך שעות הפתיחה \(09:00–17:00\)/.test(plan) && /✗/.test(plan), 'programme : heures d’ouverture du cours vérifiées (עין קשתות jusqu’à 17:00)');
ok(/נקודת פיזור/.test(plan), 'programme : point de dispersion exigé');

// supprimer toutes les lignes ne laisse jamais un tableau vide
while (await page.$('.plan [data-del]')) { await page.$eval('.plan [data-del]', el => el.click()); await page.waitForTimeout(80); if ((await page.$$('.plan .pr')).length === 1 && (await page.$eval('.plan .tbtn', e => e.dataset.v)) === '08:00') break; }
ok((await page.$$('.plan .pr')).length === 1 && (await page.$eval('.plan .tbtn', e => e.dataset.v)) === '08:00', 'programme : après suppression, la ligne 08:00 מפגש revient');
// le temps de trajet compte dans le לוח זמנים
await page.$eval('[data-fillplan]', el => el.click());
await page.waitForFunction(() => document.querySelectorAll('.plan .pr').length > 3);
const rowsT = () => page.$$eval('.plan .pr', rs => rs.map(r => { const b = r.querySelectorAll('.tbtn'); return [b[0] && b[0].dataset.v, b[1] && b[1].dataset.v, r.querySelector('[data-k="what"]').value]; }));
const mn = t => { const m = /^(\d+):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
let rt = await rowsT();
ok(/נסיעה למצפה אופיר/.test(rt[1][2]) && rt[1][0] === '08:00' && mn(rt[1][1]) - mn(rt[1][0]) === 28 && rt[2][0] === rt[1][1], `לוח : la nסיעה dure 28 min et le site commence à l’arrivée (${rt[1].join(' ')})`);
await page.fill('[data-gmin="tzemach>mitzpe_ofir"]', '35'); await page.dispatchEvent('[data-gmin="tzemach>mitzpe_ofir"]', 'change');
await page.waitForFunction(() => /35 דק׳/.test(document.querySelector('.info').textContent));
rt = await rowsT();
ok(mn(rt[1][1]) - mn(rt[1][0]) === 35 && rt[2][0] === rt[1][1], 'לוח : le temps Google saisi remplace l’estimation et décale la suite');
await shot('plan-trajets');

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
// trajet logique proposé dans la simulation à partir des sites choisis
await page.click('[data-t="ua"]'); await page.waitForSelector('#ed select'); await page.selectOption('#ed [data-f="site"]', 'tel_saki');
await page.click('[data-t="plan"]'); await page.waitForSelector('#sugg');
await page.$eval('#sugg', el => el.click());
await page.waitForFunction(() => document.querySelectorAll('.plan .pr').length >= 6);
const whats = await page.$$eval('.plan [data-k="what"]', els => els.map(e => e.value));
ok(whats[0].startsWith('מפגש') && whats.some(w => /עין קשתות/.test(w)) && whats.some(w => /תל א-סאקי/.test(w)) && whats.some(w => /ארוחת צהריים/.test(w)) && /פיזור/.test(whats[whats.length - 1]), 'simulation : programme pré-rempli dans un ordre logique (rendez-vous, sites, déjeuner, retour)');
ok(whats.indexOf(whats.find(w => /עין קשתות/.test(w))) < whats.indexOf(whats.find(w => /תל א-סאקי/.test(w))), 'ordre par proximité depuis צומת צמח : עין קשתות avant תל סאקי');
await page.click('[data-t="long"]'); await page.waitForSelector('#ed textarea');
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
ok(/דק׳ — לאשר ב-Google/.test(prop) && !/Waze/.test(prop) && /לברר: שירותים/.test(prop) && /המתנה בקופה/.test(prop), 'tiyul : brouillon de programme sans temps inventé, toilettes et caisse « לברר »');
await page.$eval('[data-open="0"]', el => el.click());
await page.waitForSelector('.slots');
ok(/הטיול שלי/.test(await page.textContent('.brief h1')) && (await page.$$('.slots select')).length >= 4, 'tiyul : ouvert comme mission d’entraînement, sites pré-remplis');
await page.click('#chk'); await page.waitForSelector('.slot.ok');
ok((await page.$$('.slot.bad')).length === 0, 'mission personnalisée : tous les sites valides');
await page.goto(base + 'exam.html#/m/custom/guided/2');
await page.waitForSelector('.plan');
ok((await page.$$('.plan .pr')).length >= 9 && (await page.$$eval('.plan [data-k="what"]', els => els.map(e => e.value).join('|'))).includes('לאשר ב-Google'), 'programme pré-rempli (lignes de trajet à compléter)');
await shot('7-tiyul');

// sauver le מסלול (guide), le rouvrir, l'imprimer en PDF, l'exporter / l'importer
await page.$eval('#saveM', el => el.click());
await page.waitForSelector('#svName');
await page.fill('#svName', 'גולן — משפחות 40');
await page.$eval('#svOk', el => el.click());
await page.waitForFunction(() => /#\/m\/s_/.test(location.hash));
const sid = await page.evaluate(() => location.hash.split('/')[2]);
ok((await page.textContent('.brief h1')).includes('גולן — משפחות 40') && /לשמור שינויים/.test(await page.textContent('#saveM')), `מסלול sauvegardé et rouvert sous son nom (${sid})`);
await page.goto(base + 'exam.html#/');
await page.waitForSelector('.saved .svl li');
ok(/גולן — משפחות 40/.test(await page.textContent('.saved')) && /אתרים/.test(await page.textContent('.saved')), 'accueil : « המסלולים שלי » liste le parcours');
await page.click('.saved .svl a[href$="/print"]');
await page.waitForSelector('.printdoc');
const pd = await page.textContent('.printdoc');
ok(/לוח זמנים/.test(pd) && /לאשר ב-Google/.test(pd) && /דק׳/.test(pd) && /לוגיסטיקה/.test(pd) && /עין קשתות/.test(pd) && (await page.$$('.printdoc .ptab tbody tr')).length >= 9, 'PDF : itinéraire, trajets, לוח זמנים complet, logistique');
await page.emulateMedia({ media: 'print' });
ok(!(await page.isVisible('#doPrint')) && !(await page.isVisible('.md-tabbar')), 'PDF : boutons et barre du bas masqués à l’impression');
const pdfOut = OUT ? `${OUT}/exam-maslul.pdf` : null;
if (pdfOut) await page.pdf({ path: pdfOut, format: 'A4' });
await page.emulateMedia({ media: 'screen' });
await page.goto(base + 'exam.html#/'); await page.waitForSelector('.saved .svl li');
const [dl] = await Promise.all([page.waitForEvent('download'), page.$eval('.saved [data-exp]', el => el.click())]);
const file = await dl.path();
ok(/^maslul-.*\.json$/.test(dl.suggestedFilename()), `export : fichier ${dl.suggestedFilename()}`);
await page.setInputFiles('#svImp', file);
await page.waitForFunction(() => document.querySelectorAll('.saved .svl li').length === 2);
ok(true, 'import : le fichier ajoute un 2e parcours (pour un autre guide / un autre téléphone)');
await page.setInputFiles('#svImp', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
await page.waitForTimeout(150);
ok((await page.$$('.saved .svl li')).length === 2, 'import : un fichier qui n’est pas un parcours est refusé');
await page.$eval('.saved [data-rm]', el => el.click());
await page.waitForFunction(() => document.querySelectorAll('.saved .svl li').length === 1);
ok(true, 'suppression d’un parcours sauvegardé');

// FR
await page.goto(base + 'exam.html');
await page.waitForSelector('#lng'); await page.click('#lng');
await page.waitForSelector('.hero');
ok(/Exam Challenge/.test(await page.textContent('.hero')), 'accompagnement en français');

ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
