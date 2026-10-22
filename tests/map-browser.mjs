// Parcours carte → סיור → difficulté → jeu, sur un téléphone simulé (390×844).
// Usage : node tests/map-browser.mjs [dossier-captures]
// Les tuiles cartographiques (réseau externe) peuvent manquer en environnement isolé : seules les erreurs de NOTRE code font échouer le test.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-map';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/cartocdn|openstreetmap|ERR_|net::/i.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/openstreetmap\.org/, r => r.abort());
const ok = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });

// 1. Accueil : les modes mènent à la carte
await page.goto(base + 'index.html');
await page.waitForFunction(() => /\d{2,}/.test(document.querySelector('.map-banner small')?.textContent || ''));
ok(await page.locator('a[href="map.html?mode=guided"]').count() === 1, 'accueil : סיור מודרך → carte');
const banner = await page.locator('.map-banner small').textContent();
const quiz = JSON.parse(await readFile(join(ROOT, 'guided-quiz.json'), 'utf8'));
ok(banner.includes(String(quiz.questions.length)), `accueil : compteur dynamique (${quiz.questions.length})`);
await shot('01-home');

// 2. Carte : marqueurs
await page.goto(base + 'map.html?mode=guided');
await page.waitForSelector('#loading.gone');
await page.waitForTimeout(900);
const places = JSON.parse(await readFile(join(ROOT, 'places.json'), 'utf8'));
ok(places.stats.placed > 50, `places.json : ${places.stats.placed}/${places.stats.stops} étapes placées`);
ok(await page.locator('.cluster, .pin').count() > 5, 'carte : pins/regroupements affichés');
ok((await page.locator('#countPill').textContent()).startsWith('23 סיורים'), 'carte : 22 סיורים + מסלול 67');
await shot('02-map');

// 3. Recherche → ouverture d'un סיור
await page.fill('#q', 'מגידו');
await page.waitForTimeout(400);
ok((await page.locator('#countPill').textContent()).startsWith('1 '), 'recherche « מגידו » : 1 סיור');
await page.press('#q', 'Enter');
await page.waitForSelector('.sheet.peek');
await page.waitForTimeout(800);
ok((await page.locator('#sheetTitle').textContent()).includes('מגידו'), 'fiche : סיור 04 ouvert');
const c04 = quiz.questions.filter(q => q.tourId === '04' && q.level === 1).length;
ok((await page.locator('[data-level="1"] small').textContent()).includes(String(c04)), `fiche : nombre exact de questions faciles (${c04})`);
await shot('03-sheet-peek');

// 4. Fiche complète + étape
await page.click('#grab');
await page.waitForSelector('.sheet.full');
await page.click('[data-stop="תל מגידו"]');
await page.waitForSelector('.story');
ok((await page.locator('.story').textContent()).includes('ויקיפדיה'), 'étape : résumé Wikipédia attribué');
await page.click('[data-level="2"]');
const href = await page.locator('#playBtn').getAttribute('href');
ok(href === 'guided-tour.html?tour=04&level=2&mode=tour', 'bouton jouer : ' + href);
await page.waitForTimeout(500);
await shot('04-sheet-full');

// 5. Retour (bouton « back » du téléphone) ferme la fiche
await page.goBack();
await page.waitForTimeout(400);
ok(!(await page.locator('.sheet.peek, .sheet.full').count()), 'retour : la fiche se ferme');

// 6. Liste + filtre région
await page.fill('#q', '');
await page.click('[data-view="list"]');
await page.click('[data-region="jerusalem"]');
await page.waitForTimeout(300);
ok(await page.locator('.tcard').count() === 6, 'liste filtrée ירושלים : 6 סיורים');
await shot('05-list');
await page.click('[data-region="all"]');
await page.click('[data-view="map"]');

// 7. Choix du mode depuis la carte, puis מסלול 67 en mode LIVE
await page.click('#modeChip');
await page.click('[data-mode="guide"]');
ok((await page.locator('#modeLabel').textContent()).includes('LIVE'), 'mode : מדריך LIVE');
await page.evaluate(() => { location.hash = '#t=road67'; });
await page.waitForSelector('.sheet.peek');
ok(await page.locator('a.play[href="admin.html?mode=guide"]').count() === 1, 'מסלול 67 + LIVE → admin.html?mode=guide');
await shot('06-road67-live');
await page.evaluate(() => { location.hash = '#t=09'; });
await page.waitForTimeout(500);
ok((await page.locator('.sheet .notice').first().textContent()).includes('Supabase'), 'סיור sans banque LIVE : explication honnête');

// 8. Jeu : סיור מודרך par étapes
await page.goto(base + 'guided-tour.html?tour=04&level=1&mode=tour');
await page.waitForSelector('#story:not([hidden])');
ok((await page.locator('#tour').inputValue()) === '04', 'jeu : סיור 04 sélectionné depuis le lien');
ok((await page.locator('#story .step-k').textContent()).includes('תחנה 1'), 'jeu : étape 1 affichée');
ok(!(await page.locator('#story').textContent()).includes(quiz.questions.find(q => q.tourId === '04' && q.level === 1).explanation), "jeu : l'explication n'est pas montrée avant la réponse");
await page.locator('.ans').first().click();
ok(await page.locator('.feedback:not([hidden])').count() === 1, 'jeu : explication après réponse');
await shot('07-guided-step');

// 9. Ancien lien du catalogue (?tour=tour04) — corrigé
await page.goto(base + 'guided-tour.html?tour=tour04&mode=quiz');
await page.waitForSelector('.question h2');
ok((await page.locator('#tour').inputValue()) === '04', 'compatibilité : ?tour=tour04');

// 10. Lecture
await page.goto(base + 'guided-tour.html?tour=04&mode=stories');
await page.waitForSelector('.rcard');
ok(await page.locator('.rcard').count() >= 4, 'lecture : fiches par étape');
await shot('08-stories');

// 11. Catalogue : compteurs calculés
await page.goto(base + 'tour-catalog.html');
await page.waitForFunction(() => document.getElementById('sQ').textContent !== '…');
ok((await page.locator('#sQ').textContent()) === String(quiz.questions.length), 'catalogue : compteur de questions dynamique');

await browser.close(); server.close();
if (errors.length) { console.log('\n' + errors.join('\n')); process.exit(1); }
console.log('\nTout est vert ✔');
