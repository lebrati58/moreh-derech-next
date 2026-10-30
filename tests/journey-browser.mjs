// Suivi du joueur sur téléphone simulé (390×844) : accueil → défi du jour → « המסע שלי » → révision des erreurs.
// Usage : CHROME=/chemin/chrome node tests/journey-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-journey';
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

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--no-zygote', '--single-process'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
await ctx.route(/supabase\.co/, r => r.abort()); // aucun envoi réel au tableau de la classe pendant le test
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
const shot = name => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

// Joueur déjà nommé (sans accord de publication) : pas de fenêtre de prénom pendant le test.
await page.addInitScript(() => { try { if (!localStorage.getItem('mdl_player_v1')) localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false, asked: true })); } catch (e) {} });

await page.goto(base + 'index.html');
await page.waitForSelector('.qt-daily');
ok(await page.isVisible('a.qt-daily'), 'accueil : tuile « אתגר היום » visible');
ok(await page.isVisible('a.qt-journey'), 'accueil : tuile « המסע שלי » visible');
await page.locator('.qt-daily').scrollIntoViewIfNeeded(); await shot('01-accueil');

// Défi du jour : 5 questions. On répond toujours le 1er choix affiché (certaines seront fausses).
await page.click('a.qt-daily');
await page.waitForSelector('.question h2');
ok((await page.textContent('#heroTitle')).includes('אתגר היום'), 'jeu : mode défi du jour');
ok(/מתוך 5/.test(await page.textContent('#counter')), 'défi : 5 questions');
await shot('02-defi-question');
for (let i = 0; i < 5; i++) {
  await page.click('.answers .ans >> nth=0');
  await page.waitForSelector('.feedback:not([hidden])');
  if (i === 0) await shot('03-defi-reponse');
  await page.click('#next');
}
await page.waitForSelector('.done');
const doneTxt = await page.textContent('.done');
ok(/🟩|🟥/.test(doneTxt), 'défi : grille 🟩/🟥 affichée');
ok(doneTxt.includes('ברצף'), 'défi : série affichée');
ok(await page.isVisible('#shareDaily'), 'défi : bouton de partage');
await shot('04-defi-fin');

// Page de suivi.
await page.goto(base + 'journey.html');
await page.waitForSelector('.tour .lv a');
const stats = await page.textContent('#stats');
ok(/1/.test(stats) && stats.includes('ימים ברצף'), 'suivi : 1 jour de série');
ok((await page.textContent('#daily')).includes('/5'), 'suivi : résultat du défi du jour');
ok((await page.locator('.tour').count()) >= 22, 'suivi : 22 סיורים listés');
const review = await page.textContent('#review');
console.log('   ↳', review.trim().replace(/\s+/g, ' '));
ok((await page.locator('.bar.today i:not(.zero)').count()) === 1, 'suivi : barre d’activité du jour');
await shot('05-suivi-haut');
await page.locator('#tours').scrollIntoViewIfNeeded(); await shot('06-suivi-carte-etoiles');

// Révision des erreurs (s'il y en a).
const nMiss = await page.evaluate(() => MDProgress.mistakes().length);
if (nMiss) {
  await page.click('#review');
  await page.waitForSelector('.question h2');
  ok((await page.textContent('#heroTitle')).includes('חזרה על טעויות'), 'révision : mode ouvert');
  ok(new RegExp('מתוך ' + nMiss).test(await page.textContent('#counter')), `révision : ${nMiss} question(s) ratée(s)`);
  await shot('07-revision');
  // On répond juste en lisant la bonne réponse dans le fichier (simulation d'un élève qui a appris).
  const bank = await page.evaluate(() => fetch('guided-quiz.json').then(r => r.json()));
  for (let i = 0; i < nMiss; i++) {
    const qText = (await page.textContent('.question h2')).trim();
    const q = bank.questions.find(x => x.question.trim() === qText);
    await page.click(`.answers .ans[data-option="${q.options[q.correct].replace(/"/g, '\\"')}"]`);
    await page.click('#next');
  }
  await page.waitForSelector('.done');
  ok((await page.textContent('.done')).includes('כל הטעויות תוקנו'), 'révision : toutes les erreurs corrigées');
  await shot('08-revision-fin');
  ok(await page.evaluate(() => MDProgress.mistakes().length) === 0, 'révision : liste des erreurs vide');
} else console.log('ℹ️ aucune erreur à réviser (5/5 au défi)');

await browser.close(); server.close();
if (errors.length) { console.log('\nErreurs :\n' + errors.join('\n')); process.exit(1); }
console.log('\n✅ Parcours de suivi OK — captures dans', OUT);
