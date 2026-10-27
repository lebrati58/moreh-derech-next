// « ציר הזמן והחידון » dans un vrai navigateur : Samsung Galaxy S24 (360×780, DPR 3, tactile) puis ordinateur (1280×800).
// Accueil → frise → filtre/recherche → fiche (bouton retour) → quiz entraînement (reprise après sortie) → expiration du temps
// → pause arrière-plan → examen complet → points dans « המסע שלי » → reduced motion → clavier → lien depuis la 3D.
// Usage : CHROME=/chemin/chrome node tests/history-browser.mjs [dossier-captures]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = process.argv[2] || 'screens-history';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--no-zygote'] });

const errors = [];
const ok = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('❌', msg); } else console.log('✅', msg); };
const PLAYER = () => { try { if (!localStorage.getItem('mdl_player_v1')) localStorage.setItem('mdl_player_v1', JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', name: 'נועה', consent: false, asked: true })); } catch (e) {} };

async function newPage(opts) {
  const ctx = await browser.newContext(Object.assign({ locale: 'he-IL' }, opts));
  await ctx.route(/supabase\.co|tile\.openstreetmap/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/supabase|ERR_|net::|Failed to load resource|WebGL|GPU/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(PLAYER);
  return { ctx, page };
}
const correctIndex = page => page.evaluate(() => { const s = window.MDHistoryApp.state(); return s.questions[s.i].options.findIndex(o => o.correct); });
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ================= Samsung Galaxy S24 =================
{
  const { ctx, page } = await newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.clock.install();
  const shot = name => page.screenshot({ path: `${OUT}/s24-${name}.png` });

  await page.goto(base + 'index.html');
  await page.waitForSelector('a.qt-history');
  await page.locator('a.qt-history').scrollIntoViewIfNeeded();
  ok(await page.isVisible('a.qt-history'), 'accueil : tuile « ציר הזמן והחידון » visible');
  await shot('01-accueil');
  await page.tap('a.qt-history');
  await page.waitForSelector('#list .ev');
  ok(await page.locator('#list .ev').count() === 48, 'frise : 48 événements');
  ok(await page.locator('#list .period').count() === 7, 'frise : 7 périodes');
  ok(await noHScroll(page), 'frise : pas de défilement horizontal à 360 px');
  await shot('02-frise');

  // Filtre par période + recherche
  await page.tap('#pchips [data-p="persian"]');
  ok(await page.locator('#list .ev').count() === 5, 'filtre « פרס » : 5 événements');
  ok(page.url().includes('period=persian'), 'filtre reflété dans l’URL');
  await page.tap('#reset');
  await page.fill('#q', 'נפילת מצדה');
  ok(await page.locator('#list .ev').count() === 1, 'recherche « נפילת מצדה » : 1 résultat');
  await page.fill('#q', 'מצדה');
  ok(await page.locator('#list .ev').count() === 2, 'recherche « מצדה » : Massada + Hérode (texte)');
  await page.fill('#q', '445');
  ok(await page.locator('#list .ev').count() === 1, 'recherche par année « 445 »');
  await page.tap('#qClear');
  ok(await page.locator('#list .ev').count() === 48, 'effacement de la recherche');
  await page.tap('#pchips [data-p="persian"]');
  await page.mouse.wheel(0, 400);

  // Fiche + retour Android
  await page.tap('[data-ev="ezra"]');
  await page.waitForSelector('#sheetWrap:not([hidden])');
  ok((await page.textContent('#shTitle')).includes('עזרא'), 'fiche : titre Esdras');
  const href = await page.getAttribute('#sheet a.course', 'href');
  ok(/^https:\/\/drive\.google\.com\/file\/d\/16_Wg/.test(href), 'fiche : lien vers le document précis de la période perse');
  ok((await page.textContent('#sheet')).includes('באימון בלבד'), 'fiche : Esdras signalé « entraînement seulement »');
  ok((await page.textContent('#sheet')).includes('398'), 'fiche : controverse 458/398 expliquée');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('x')), 'fiche : focus sur « fermer »');
  await shot('03-fiche');
  await page.tap('#sheet [data-act="nav"]:not([disabled]) >> nth=1');
  await page.waitForFunction(() => document.getElementById('shTitle').textContent.includes('נחמיה'), null, { timeout: 3000 }).catch(() => {});
  ok((await page.textContent('#shTitle')).includes('נחמיה'), 'fiche : événement suivant');
  await page.goBack();
  await page.waitForSelector('#sheetWrap', { state: 'hidden' });
  ok(await page.isVisible('#list'), 'retour Android : la fiche se ferme, la frise reste');
  ok(await page.locator('#list .ev').count() === 5, 'retour : le filtre de période est conservé');

  // Fiche → quiz de la période
  await page.tap('[data-ev="nehemiah"]');
  await page.tap('#sheet [data-act="quiz"]');
  await page.waitForSelector('#vQuiz:not([hidden])');
  ok(await page.getAttribute('#qpchips [data-p="persian"]', 'aria-pressed') === 'true', 'quiz : période pré-sélectionnée depuis la fiche');
  await page.tap('.mode[data-mode="practice"]');
  ok(await noHScroll(page), 'réglages : pas de défilement horizontal');
  const small = await page.evaluate(() => [...document.querySelectorAll('#vQuiz button, #vQuiz a')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40).map(b => b.textContent.trim().slice(0, 20)));
  ok(small.length === 0, 'réglages : cibles tactiles ≥ 40 px ' + JSON.stringify(small));
  await shot('04-reglages');

  // Entraînement : 1re bonne, 2e fausse
  await page.tap('#start');
  await page.waitForSelector('#vPlay:not([hidden]) .ans');
  ok((await page.textContent('#hPos')).includes('מתוך 5'), 'entraînement « פרס » : 5 questions');
  ok(await page.locator('.ans').count() === 4, '4 réponses');
  await shot('05-question');
  let ci = await correctIndex(page);
  await page.clock.runFor(4000);
  await page.tap(`.ans[data-i="${ci}"]`);
  await page.waitForSelector('#fb:not([hidden])');
  ok((await page.textContent('#hScore')) === '178', 'score : 100 + 3×26 s = 178 ' + await page.textContent('#hScore'));
  ok((await page.textContent('#fb')).includes('לחומרי הקורס'), 'entraînement : explication + lien cours');
  ok(await page.locator('.ans.correct').count() === 1, 'entraînement : bonne réponse en vert');
  await shot('06-bonne-reponse');
  await page.tap('#next');
  ci = await correctIndex(page);
  await page.tap(`.ans[data-i="${(ci + 1) % 4}"]`);
  ok((await page.textContent('#hStreak')) === '0', 'série remise à zéro après une erreur');
  ok(await page.locator('.ans.wrong').count() === 1 && await page.locator('.ans.correct').count() === 1, 'erreur : rouge + bonne réponse montrée');
  await page.tap('#next');

  // Sortie au milieu d'une question → reprise sans perte
  await page.clock.runFor(5000);
  const before = await page.evaluate(() => ({ i: window.MDHistoryApp.state().i, score: window.MDHistoryApp.state().score }));
  await page.tap('#tabTimeline');
  await page.waitForSelector('#vTimeline:not([hidden])');
  ok(await page.evaluate(() => window.MDHistoryApp.state().paused === 'nav'), 'quitter la partie : chrono en pause');
  await page.clock.runFor(60000);
  await page.tap('#tabQuiz');
  await page.waitForSelector('#vPlay:not([hidden])');
  const after = await page.evaluate(() => ({ i: window.MDHistoryApp.state().i, score: window.MDHistoryApp.state().score }));
  ok(after.i === before.i && after.score === before.score, 'retour : même question, même score');
  ok(Number(await page.textContent('#hSec')) >= 24, 'retour : le temps n’a pas filé pendant l’absence (' + await page.textContent('#hSec') + ' s)');
  // Rechargement complet de la page : la partie reprend aussi
  await page.reload();
  await page.waitForSelector('#vPlay:not([hidden]) .ans');
  ok(await page.evaluate(() => window.MDHistoryApp.state().i) === before.i, 'rechargement : la partie reprend à la même question');
  ok(await page.isVisible('#pausew'), 'rechargement : la partie revient en pause (question masquée)');
  await page.tap('#resumeBtn');

  // Expiration du temps = erreur
  await page.clock.runFor(31000);
  await page.waitForSelector('#fb:not([hidden])');
  ok((await page.textContent('#fb')).includes('נגמר הזמן'), 'expiration : « נגמר הזמן »');
  ok(await page.evaluate(() => { const s = window.MDHistoryApp.state(); const a = s.answers[s.i]; return a.timedOut && !a.correct && a.points === 0; }), 'expiration comptée comme erreur (0 point)');
  await shot('07-temps-ecoule');
  await page.tap('#next');

  // Passage en arrière-plan → pause, question masquée
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const secs = await page.textContent('#hSec');
  await page.clock.runFor(20000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await page.isVisible('#pausew'), 'arrière-plan : fenêtre de pause');
  ok(await page.evaluate(() => document.getElementById('qcard').classList.contains('blur')), 'pause : question floutée');
  ok(await page.textContent('#hSec') === secs, 'pause : chrono figé');
  await shot('08-pause');
  await page.tap('#resumeBtn');
  ok(await page.isHidden('#pausew'), 'reprise');
  ci = await correctIndex(page);
  await page.tap(`.ans[data-i="${ci}"]`); await page.tap('#next');
  ci = await correctIndex(page);
  await page.tap(`.ans[data-i="${ci}"]`); await page.tap('#next');
  await page.waitForSelector('#vResult:not([hidden])');
  ok((await page.textContent('#resultCard')).includes('3 / 5'), 'résultat entraînement : 3 / 5');
  ok((await page.textContent('#resultCard')).includes('לא נספר'), 'entraînement : non compté');
  await shot('09-resultat-entrainement');
  const ptsAfterPractice = await page.evaluate(() => window.MDProgress.totals().points);
  ok(ptsAfterPractice === 0, 'entraînement : 0 point ajouté au total central');

  // Examen complet : חשמונאים (8 événements), toutes justes
  await page.goto(base + 'history.html#/quiz?period=hasmonean&mode=exam');
  await page.waitForSelector('#vQuiz:not([hidden])');
  ok(await page.isHidden('#timedWrap'), 'examen : chrono obligatoire');
  await page.tap('#counts button:last-child');
  await page.tap('#start');
  await page.waitForSelector('#vPlay:not([hidden]) .ans');
  let total = 0;
  for (let k = 0; k < 8; k++) {
    ci = await correctIndex(page);
    await page.clock.runFor(2000);
    await page.tap(`.ans[data-i="${ci}"]`);
    if (k === 0) { ok(await page.locator('.ans.correct').count() === 0, 'examen : pas de correction pendant la partie'); await shot('10-examen'); }
    total += await page.evaluate(() => { const s = window.MDHistoryApp.state(); return s.answers[s.i].points; });
    await page.tap('#next');
  }
  await page.waitForSelector('#vResult:not([hidden])');
  const res = await page.textContent('#resultCard');
  ok(res.includes('8 / 8'), 'examen : 8 / 8');
  ok(res.includes('נקודות חדשות'), 'examen : points ajoutés au parcours');
  await shot('11-resultat-examen');
  const t1 = await page.evaluate(() => window.MDProgress.totals().points);
  ok(t1 === total, `total central = somme des points de l’examen (${t1} = ${total})`);
  // Rejouer le même examen ne double pas les points
  await page.tap('[data-act="again"]');
  // Rejouer en se trompant partout : rien n'est retiré ni ajouté (seul le meilleur score par événement compte).
  for (let k = 0; k < 8; k++) { ci = await correctIndex(page); await page.tap(`.ans[data-i="${(ci + 1) % 4}"]`); await page.tap('#next'); }
  await page.waitForSelector('#vResult:not([hidden])');
  const t2 = await page.evaluate(() => window.MDProgress.totals().points);
  ok(t2 === t1, `rejouer (toutes fausses) : total inchangé, pas de double comptage (${t2} vs ${t1})`);
  const last = await page.evaluate(() => JSON.parse(localStorage.getItem('mdl_hist_last_v1')).record);
  ok(last.version === 1 && last.quizId === 'history-48-dates' && last.eventIds.length === 8 && last.answerDetails.length === 8 && last.mode === 'exam' && last.period === 'hasmonean' && typeof last.durationMs === 'number' && last.completedAt, 'résultat structuré complet');
  // Retour Android depuis le résultat → réglages (pas la partie terminée)
  await page.goBack();
  ok(!page.url().includes('#/play'), 'retour depuis le résultat : pas de retour dans la partie finie');

  // « המסע שלי »
  await page.goto(base + 'journey.html');
  await page.waitForSelector('#history');
  ok((await page.textContent('#history')).includes('ציר הזמן'), 'המסע שלי : carte « ציר הזמן והחידון »');
  ok((await page.textContent('#stats')).includes(t1.toLocaleString('he-IL')), 'המסע שלי : points inclus dans le total');
  await page.locator('#history').scrollIntoViewIfNeeded();
  await shot('12-mon-parcours');
  // Accueil : sous-titre de la tuile mis à jour
  await page.goto(base + 'index.html');
  ok((await page.textContent('#historySub')).includes('/48'), 'accueil : progression affichée sur la tuile');
  // Événement de fin de partie
  await page.goto(base + 'history.html#/quiz?period=babylon&mode=practice');
  await page.waitForSelector('#vQuiz:not([hidden])');
  await page.evaluate(() => { window.__done = null; window.addEventListener('moreh-dereh:quiz-complete', e => { window.__done = e.detail; }); });
  await page.tap('#start'); await page.tap('.ans >> nth=0'); await page.tap('#next');
  ok(await page.evaluate(() => window.__done && window.__done.total === 1), 'événement « moreh-dereh:quiz-complete » émis');
  ok(!errors.some(e => !e.startsWith('ASSERT')), 'S24 : aucune erreur JavaScript');
  await ctx.close();
}

// ================= reduced motion =================
{
  const { ctx, page } = await newPage({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await page.goto(base + 'history.html#/quiz?period=persian&mode=practice');
  await page.waitForSelector('#vQuiz:not([hidden])');
  await page.tap('#start'); await page.waitForSelector('.ans');
  const ci = await correctIndex(page); await page.tap(`.ans[data-i="${ci}"]`);
  ok(await page.evaluate(() => document.getElementById('fx').children.length === 0 && !document.querySelector('.fx-plus')), 'reduced motion : pas de confettis ni d’animation de points');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.clock .in i')).animationName === 'none'), 'reduced motion : sablier immobile');
  await ctx.close();
}

// ================= ordinateur + clavier =================
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  const shot = name => page.screenshot({ path: `${OUT}/desktop-${name}.png` });
  await page.goto(base + 'history.html');
  await page.waitForSelector('#list .ev');
  await shot('01-frise');
  await page.focus('[data-ev="masada"]'); await page.keyboard.press('Enter');
  await page.waitForSelector('#sheetWrap:not([hidden])');
  ok((await page.getAttribute('#sheet a[href^="site3d"]', 'href')) === 'site3d.html?site=masada', 'fiche Massada : lien vers מצדה 3D');
  await shot('02-fiche');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheetWrap', { state: 'hidden' });
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.ev === 'masada'), 'clavier : Échap ferme la fiche et rend le focus');
  await page.click('#tabQuiz'); await page.click('.mode[data-mode="exam"]'); await page.click('#start');
  await page.waitForSelector('.ans');
  const ci = await correctIndex(page);
  await page.keyboard.press(String(ci + 1));
  ok(await page.evaluate(() => { const s = window.MDHistoryApp.state(); return s.answers[s.i] && s.answers[s.i].correct; }), 'clavier : touches 1–4 pour répondre');
  ok(await page.evaluate(() => document.activeElement.id === 'next'), 'clavier : focus sur « suivante »');
  await shot('03-quiz');
  // Lien depuis Jérusalem 3D (période hérodienne = 5) et depuis un site 3D
  await page.goto(base + 'jerusalem3d.html?period=5');
  await page.waitForSelector('.hist-link:not([hidden])', { timeout: 15000 }).catch(() => {});
  ok((await page.getAttribute('.hist-link', 'href')) === 'history.html#/timeline?period=roman', 'Jérusalem 3D : lien vers la période de la frise');
  await page.goto(base + 'site3d.html?site=masada');
  await page.waitForSelector('.hist-link:not([hidden])', { timeout: 15000 }).catch(() => {});
  ok((await page.getAttribute('.hist-link', 'href')) === 'history.html#/event/masada', 'מצדה 3D : lien vers « נפילת מצדה »');
  const keep = errors.filter(e => !/WebGL|three|webgl|GPU/i.test(e)); errors.length = 0; errors.push(...keep);
  ok(!errors.some(e => !e.startsWith('ASSERT')), 'ordinateur : aucune erreur JavaScript');
  await ctx.close();
}

await browser.close(); server.close();
console.log(errors.length ? `\n${errors.length} problème(s) :\n` + errors.join('\n') : '\nTout est OK.');
process.exit(errors.length ? 1 : 0);
