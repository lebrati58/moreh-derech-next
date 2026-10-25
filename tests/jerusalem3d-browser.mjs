// Jérusalem 3D sur téléphone simulé (390×844) : chargement, périodes, fiche, plan 2D, quiz 3D masqués.
// Usage : CHROME=/chemin/chrome node tests/jerusalem3d-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-jerusalem3d';
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
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--no-zygote', '--single-process', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
await ctx.route(/supabase\.co/, r => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(180000); // rendu logiciel lent dans l'environnement de test
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (c, msg) => { if (!c) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
// Rendu logiciel (SwiftShader) très lent : on fige la boucle, on force une image, puis on capture.
const tool = async id => { await page.click('#bMenu'); await page.click(id); };
const shot = async n => { await page.evaluate(() => { const A = window.MDJerusalem3D; if (A && document.querySelector('#stage canvas') && !document.body.classList.contains('mode2d')) { A.pause(true); A.snapshot(); } }); await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 300000 }); await page.evaluate(() => window.MDJerusalem3D && window.MDJerusalem3D.pause(false)); };

await page.goto(base + 'jerusalem3d.html?period=5');
await page.waitForSelector('#strip [data-p]');
await page.waitForFunction(() => document.body.dataset.ready === '1' || document.body.classList.contains('mode2d'), null, { timeout: 400000 });
await page.waitForTimeout(500);
ok(await page.locator('#strip [data-p]').count() === 12, '12 périodes dans la frise (dont « aujourd’hui »)');
ok((await page.textContent('#pName')).includes('הורדוסית'), 'période hérodienne active');
const has3d = await page.evaluate(() => !!document.querySelector('#stage canvas'));
console.log('   ↳ WebGL :', has3d ? 'oui (3D)' : 'non (plan 2D)');
ok((await page.locator('.lb').count()) > 5 || !has3d, 'étiquettes des monuments affichées');
await shot('01-herodien');
ok(await page.evaluate(() => window.MDJerusalem3D && window.MDJerusalem3D.quizEnabled === false), 'quiz 3D désactivés');
ok(!(await page.locator('text=חידון').count()), 'aucun bouton de quiz visible');

// fiche
await page.evaluate(() => window.MDJerusalem3D.openSheet('jerusalem_phasael'));
await page.waitForSelector('.sheet.open');
const sheet = await page.textContent('#sBody');
ok(sheet.includes('מחלוקת') && sheet.includes('מקורות'), 'fiche Phasaël : débat et sources');
ok(sheet.includes('מסמך קורס'), 'fiche : source Drive marquée');
await shot('02-fiche-phasael');
await page.click('#sShow'); await page.waitForTimeout(1300); await shot('03-flyto-phasael');

// autre période
await page.click('#strip [data-p="11"]'); await page.waitForTimeout(1200);
ok((await page.textContent('#pName')).includes('עות'), 'période ottomane');
await shot('04-ottoman');
await page.click('#strip [data-p="7"]'); await page.waitForTimeout(1200); await shot('05-byzantin');
await page.click('#pCount'); await page.waitForSelector('.sheet.open .list');
ok((await page.locator('.list [data-id]').count()) >= 3, 'liste des sites de la période');
await shot('06-liste-byzantin');
await page.click('#sClose');

// langue
await page.click('[data-lang="fr"]'); await page.waitForTimeout(300);
ok((await page.textContent('#pName')).includes('Byzantine'), 'interface en français');
ok(await page.evaluate(() => document.documentElement.dir === 'ltr'), 'français en LTR');
await page.click('[data-lang="he"]');

// comparaison des murailles
await tool('#bCompare'); await page.waitForSelector('.sheet.open .wrow');
ok((await page.locator('.wrow').count()) >= 10, 'comparaison : liste des murailles de toutes les époques');
await page.click('#sClose'); await page.waitForTimeout(1200);
ok((await page.locator('.lb.wl').count()) >= 6, 'comparaison : étiquettes des murailles');
await shot('06b-comparaison');
await tool('#bCompare'); await page.waitForTimeout(500);

// modèles détaillés de la période hérodienne
await page.click('#strip [data-p="5"]'); await page.waitForTimeout(800);
const placedIds = await page.evaluate(() => ['jerusalem_second_temple', 'jerusalem_royal_stoa', 'jerusalem_porticoes', 'jerusalem_robinsons_arch', 'jerusalem_wilsons_arch', 'jerusalem_antonia', 'jerusalem_phasael', 'jerusalem_hippicus', 'jerusalem_mariamne', 'jerusalem_herod_palace'].filter(id => { const b = window.MDJerusalem3D._bounds(id); return b[1][1] > b[0][1]; }));
ok(placedIds.length === 10, 'Temple, portiques, Portique royal, arcs, Antonia, Phasaël, Hippicus, Mariamne, palais construits en 3D (' + placedIds.length + '/10)');
await page.waitForFunction(() => { const c = document.getElementById('museumChip'); return !c || c.hidden; }, null, { timeout: 300000 });
ok(await page.evaluate(() => { const b = window.MDJerusalem3D._bounds('jerusalem_royal_stoa'); return b[1][0] - b[0][0] > 250; }), 'modèle OpenBible du mont du Temple chargé et recalé (Portique royal ≈ 280 m)');
await page.evaluate(() => window.MDJerusalem3D.openSheet('jerusalem_second_temple')); await page.waitForSelector('.sheet.open');
ok((await page.locator('#sBody ul.cls li').count()) >= 4 && (await page.textContent('#sBody')).includes('OpenBible'), 'fiche du Temple : éléments classés A/B/C/D et crédit OpenBible (MIT)');
await page.click('#sClose');
const tm = await page.evaluate(() => { const A = window.MDJerusalem3D, t = A._tm(), w = A._bounds('jerusalem_wilsons_arch'); return Math.abs(w[1][1] - t.top); });
ok(tm < 2, 'arc de Wilson au niveau du parvis');
await page.evaluate(() => window.MDJerusalem3D.viewAt('jerusalem_second_temple')); await shot('08-temple');
// murailles : constructeur et date sur l'étiquette, hauteur ×2 signalée
ok(await page.evaluate(() => [...document.querySelectorAll('.lb.wl small')].some(s => s.textContent.length > 3)), 'murailles : constructeur et date sur l’étiquette');
// comparer avec aujourd'hui puis revenir
await page.evaluate(() => window.MDJerusalem3D.openSheet('jerusalem_robinsons_arch')); await page.waitForSelector('#sToday');
ok((await page.textContent('#sBody .altname')).length > 2, 'fiche : nom dans une deuxième langue');
await page.click('#sToday'); await page.waitForTimeout(600);
ok((await page.textContent('#pName')).includes('היום'), 'comparer avec aujourd’hui : période actuelle');
await page.click('#backChip'); await page.waitForTimeout(600);
ok((await page.textContent('#pName')).includes('הורדוסית'), 'retour à la période d’origine');
ok(await page.locator('#toolsMenu .tl').first().textContent().then(s => s.length > 2), 'menu Outils : boutons avec libellés');
// vallées : Kidron (OSM), Hinnom et Tyropéon (relief)
ok(await page.evaluate(() => ['jerusalem_kidron', 'jerusalem_hinnom', 'jerusalem_tyropoeon'].every(id => { const b = window.MDJerusalem3D._bounds(id); return b[1][0] - b[0][0] > 100 || b[1][2] - b[0][2] > 100; })), 'vallées : Kidron, Ben Hinnom et Tyropéon tracés');
// couleurs de certitude
await tool('#bColors'); await page.waitForTimeout(500);
ok(await page.getAttribute('#bColors', 'aria-pressed') === 'true', 'bouton couleurs de certitude');
await shot('09-temple-certitude'); await tool('#bColors'); await page.waitForTimeout(300);
// mode cinéma (survol + sous-titres) puis arrêt
await page.click('#bCine'); await page.waitForTimeout(1500);
ok(await page.evaluate(() => document.body.classList.contains('cinema')), 'mode cinéma : interface masquée');
ok((await page.textContent('#caption')).length > 3, 'mode cinéma : sous-titre');
await shot('10-cinema');
await page.click('#cineStop'); await page.waitForTimeout(400);
ok(!(await page.evaluate(() => document.body.classList.contains('cinema'))), 'mode cinéma : arrêt');
// enregistrement vidéo : téléchargement d'un .webm à l'arrêt
const dl = page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
await tool('#bRec'); await page.waitForTimeout(4000); await page.click('#cineStop');
const file = await dl; ok(file && /\.webm$/.test(file.suggestedFilename()), 'enregistrement : fichier vidéo ' + (file ? file.suggestedFilename() : 'absent'));

// plan 2D
await tool('#b2d'); await page.waitForTimeout(500);
ok(await page.isVisible('#plan2d'), 'plan 2D affiché');
ok((await page.locator('#plan2d [data-id]').count()) > 3, 'monuments sur le plan 2D');
await page.click('#strip [data-p="5"]'); await page.waitForTimeout(400);
await shot('07-plan2d-herodien');

await browser.close(); server.close();
if (errors.length) { console.log('\nErreurs :\n' + errors.join('\n')); process.exit(1); }
console.log('\n✅ Jérusalem 3D OK — captures dans', OUT);
