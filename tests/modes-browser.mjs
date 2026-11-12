// Accueil en 4 modes (PR #78) + mode Confort, sur un S24 et sur ordinateur, dans les 4 langues.
// Vérifie : bons blocs selon le mode, titres de rubrique cohérents, langue suivie, choix gardé, visite guidée
// compatible, pas de débordement horizontal ; puis mode Confort (gros caractères, boutons élargis, contraste,
// lecture vocale avec vitesse, chronomètre désactivable) sur l'accueil et les quiz.
// Usage : CHROME=/chemin/chrome node tests/modes-browser.mjs [dossier-captures]
import { createServer } from 'node:http'; import { readFile, mkdir } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = new URL('../public/', import.meta.url).pathname, OUT = process.argv[2] || 'screens-modes'; await mkdir(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };
const srv = createServer(async (q, r) => { const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html'; try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const br = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const DEVICES = { s24: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1280, height: 800 } } };
const errs = []; let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { bad++; console.log('❌', m); } };

// Faux moteur de lecture vocale : enregistre ce qui serait lu (texte, langue, vitesse).
const fakeSpeech = () => {
  window.__said = [];
  const voices = [{ lang: 'he-IL', name: 'he' }, { lang: 'fr-FR', name: 'fr' }, { lang: 'en-US', name: 'en' }, { lang: 'ru-RU', name: 'ru' }];
  const s = { speaking: false, pending: false, getVoices: () => voices, cancel() { this.speaking = false; window.__cancel = (window.__cancel || 0) + 1; }, speak(u) { window.__said.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice && u.voice.name }); this.speaking = true; }, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: s, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
async function context(dev, init = {}) {
  const ctx = await br.newContext({ ...DEVICES[dev], locale: 'he-IL' });
  await ctx.route(/supabase|tile|googleapis|gstatic/, r => r.abort());
  await ctx.addInitScript(fakeSpeech);
  await ctx.addInitScript(kv => { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); for (const k in kv) localStorage.setItem(k, kv[k]); } } catch (e) {} }, { mdl_guide_test: '1', ...init });
  return ctx;
}
async function open(ctx, path, wait = 1200) { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(path + ': ' + e.message)); await pg.goto(base + path); await pg.waitForTimeout(wait); return pg; }
const overflow = pg => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const closeOnboarding = async pg => { for (let k = 0; k < 3 && await pg.$('.ob-card'); k++) { const x = await pg.$('.ob-x') || await pg.$('#obBack'); if (x) await x.click(); await pg.waitForTimeout(350); } };

// ===================== A. PR #78 : les 4 modes de l'accueil =====================
const EXPECT = {
  amateur: ['campus', 'history', 'parta', 'caesarea', 'jerusalem', 'chips'],
  explorer: ['campus', 'history', 'roads', 'guided', 'duo', 'parta', 'timeline', 'caesarea', 'jerusalem', 'chips'],
  doctorant: ['campus', 'history', 'roads', 'guided', 'duo', 'parta', 'arch', 'caesarea', 'jerusalem', 'chips', 'timeline'],
  guide: ['campus', 'history', 'roads', 'guided', 'duo', 'parta', 'exam', 'arch', 'caesarea', 'jerusalem', 'chips', 'guide', 'timeline']
};
const LABEL = { he: ['בחרו את הדרך שלכם', 'חובב'], fr: ['Choisis ton expérience', 'Amateur'], en: ['Choose your experience', 'Amateur'], ru: ['Выберите режим', 'Любитель'] };
const state = () => {
  const m = document.querySelector('main'), v = el => !!(el && el.getClientRects().length);
  const it = { campus: 'a.campus', history: 'section.hist', roads: 'a.map-banner.roads', guided: 'a.map-banner[href^="map.html?mode=guided"]', duo: '.duo', parta: 'section.parta-box', exam: 'section.exam-box:not(.parta-box)', arch: 'section.arch-box', caesarea: 'a.j3d[href^="world3d.html"]', jerusalem: 'a.j3d[href^="jerusalem3d.html"]', chips: '.s3d-row', guide: 'a.guide-link', timeline: 'a.hist-tl' };
  const shown = Object.keys(it).filter(k => v(m.querySelector(it[k])));
  // cohérence : un titre visible a au moins un bloc visible jusqu'au titre suivant, et un bloc visible n'est jamais sous un titre caché
  let coherent = true, head = null, count = 0;
  for (const el of m.children) {
    if (el.matches('h2.sec')) { if (head && v(head) && !count) coherent = false; head = el; count = 0; continue; }
    if (!head || el.matches('a.guide-link,.ob-replay')) continue;
    if (v(el)) { count++; if (!v(head)) coherent = false; }
  }
  if (head && v(head) && !count) coherent = false;
  return { shown, coherent, title: document.querySelector('#modeTitle')?.textContent, btn: document.querySelector('.mode-options button')?.textContent, pressed: document.querySelector('.mode-options [aria-pressed=true]')?.dataset.mode, dir: document.documentElement.dir, font: getComputedStyle(document.querySelector('.mode-options button')).fontWeight };
};
for (const dev of ['s24', 'desktop']) {
  const ctx = await context(dev, { mdl_onboarded_v3: '1', mdl_guide_never: '1' });
  const pg = await open(ctx, 'index.html'); await closeOnboarding(pg);
  for (const lang of ['he', 'fr', 'en', 'ru']) {
    await pg.click('#langTop'); await pg.click(`[data-lang=${lang}]`); await pg.waitForTimeout(250);
    let s = await pg.evaluate(state);
    check(s.title === LABEL[lang][0] && s.btn.includes(LABEL[lang][1]) && s.dir === (lang === 'he' ? 'rtl' : 'ltr'), `${dev} ${lang} : sélecteur traduit (« ${s.title} »)`);
    for (const mode of ['amateur', 'explorer', 'doctorant', 'guide']) {
      await pg.click(`.mode-options [data-mode=${mode}]`); await pg.waitForTimeout(120);
      s = await pg.evaluate(state);
      const same = s.shown.slice().sort().join() === EXPECT[mode].slice().sort().join();
      check(same && s.coherent && s.pressed === mode && (await overflow(pg)) <= 0, `${dev} ${lang} ${mode} : ${s.shown.length} blocs, titres cohérents, sans débordement`);
      if (!same) console.log('   attendu', EXPECT[mode].join(','), '\n   obtenu ', s.shown.join(','));
      if (lang === 'fr' || (lang === 'he' && dev === 's24')) await pg.screenshot({ path: `${OUT}/${dev}-${lang}-${mode}.png`, fullPage: true });
    }
  }
  check((await pg.evaluate(state)).font === '800', `${dev} : police des boutons de mode appliquée (gras 800)`);
  // le choix est gardé, la langue aussi
  await pg.click('.mode-options [data-mode=explorer]'); await pg.reload(); await pg.waitForTimeout(1000); await closeOnboarding(pg);
  const s = await pg.evaluate(state);
  check(s.pressed === 'explorer' && s.title === LABEL.ru[0], `${dev} : après rechargement, mode Explorateur et langue russe gardés`);
  // la page du jeu reste accessible même si son bloc est caché sur l'accueil (rien n'est supprimé)
  const r = await pg.goto(base + 'architecture.html'); check(r.ok(), `${dev} : architecture.html toujours accessible en mode Explorateur`);
  await ctx.close();
}
// Mode par défaut : nouveau joueur → Amateur ; joueur existant sans choix → Guide (accueil complet comme avant)
{
  let ctx = await context('s24'); let pg = await open(ctx, 'index.html', 1500);
  check(await pg.evaluate(() => document.documentElement.dataset.homeMode) === 'amateur', 'nouveau joueur : mode Amateur par défaut');
  // Visite guidée en mode Amateur : chaque étape trouve son bloc, visible et de taille réelle
  await pg.fill('#obName', 'Test'); await pg.click('#obNext'); await pg.waitForTimeout(500);
  const N = await pg.locator('#obDots i').count(); let allSized = true, missing = [];
  for (let k = 1; k < N - 1; k++) {
    const sz = await pg.evaluate(() => { const s = document.querySelector('.ob-spot'); const r = s && !s.hidden ? s.getBoundingClientRect() : null; return r ? [Math.round(r.width), Math.round(r.height)] : null; });
    if (!sz || sz[0] < 30 || sz[1] < 30) { allSized = false; missing.push(k + 1); }
    await pg.click('#obNext'); await pg.waitForTimeout(420);
  }
  check(allSized, 'visite guidée en mode Amateur : les ' + (N - 2) + ' blocs ciblés sont visibles' + (missing.length ? ' (manquants : ' + missing + ')' : ''));
  await pg.click('#obBack'); await pg.waitForTimeout(400);
  const after = await pg.evaluate(state);
  check(!(await pg.evaluate(() => document.documentElement.classList.contains('ob-touring'))) && after.shown.join() === EXPECT.amateur.join(), 'fin de visite : retour au mode Amateur');
  await ctx.close();
  ctx = await context('s24', { mdl_onboarded_v3: '1', mdl_guide_never: '1', mdl_progress_v1: '{"days":{}}' }); pg = await open(ctx, 'index.html');
  check(await pg.evaluate(() => document.documentElement.dataset.homeMode) === 'guide' && (await pg.evaluate(state)).shown.length === 13, 'joueur existant sans choix : mode Guide, accueil complet (13 blocs) comme avant');
  await ctx.close();
}

// ===================== B. Mode Confort =====================
for (const dev of ['s24', 'desktop']) {
  const ctx = await context(dev, { mdl_onboarded_v3: '1', mdl_guide_never: '1', mdl_mode_lang: 'fr' });
  let pg = await open(ctx, 'index.html'); await closeOnboarding(pg);
  check(await pg.textContent('#modeComfort .lb') === '♿ Mode Confort' && await pg.textContent('#modeComfort .st') === 'désactivé', `${dev} : bouton Confort sur l'accueil, en français, désactivé`);
  await pg.click('#modeComfort'); await pg.waitForTimeout(200);
  check(await pg.isVisible('.cf-panel') && (await pg.textContent('#cfT')).includes('Mode Confort'), `${dev} : panneau Confort ouvert`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-panneau-off.png` });
  await pg.check('#cfOn'); await pg.waitForTimeout(150);
  const cls = await pg.evaluate(() => [...document.documentElement.classList].filter(c => c.startsWith('cf-')).sort().join(' '));
  check(cls === 'cf-big cf-contrast cf-home cf-on cf-wide', `${dev} : activation → gros caractères, boutons élargis, contraste (${cls})`);
  await pg.click('[data-size="150"]'); await pg.click('#cfTimer');
  await pg.fill('#cfRate', '1.4'); await pg.dispatchEvent('#cfRate', 'input');
  await pg.click('#cfTest'); const said = await pg.evaluate(() => window.__said.at(-1));
  check(said && said.rate === 1.4 && said.lang === 'fr-FR', `${dev} : essai de voix en français à vitesse ×1,4`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-panneau-on.png` });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  check(!(await pg.$('.cf-panel')) && await pg.textContent('#modeComfort .st') === 'activé', `${dev} : Échap ferme le panneau, état « activé » affiché`);
  const z = await pg.evaluate(() => [+getComputedStyle(document.querySelector('main')).zoom, getComputedStyle(document.body).zoom, getComputedStyle(document.body).backgroundColor, +getComputedStyle(document.documentElement).getPropertyValue('--cf-text')]);
  // S24 : mise en page agrandie jusqu'à garder 320 px utiles (×1,12), le reste va au texte des questions (×1,34) → 150 % au total
  const total = Math.round(z[0] * z[3] * 100) / 100;
  check(Math.abs(total - 1.5) < 0.02 && (dev === 'desktop' ? z[0] === 1.5 : z[0] === 1.12) && z[1] === '1' && z[2] === 'rgb(0, 0, 0)', `${dev} : accueil — mise en page ×${z[0]}, texte des questions ×${total}, fond noir`);
  check((await overflow(pg)) <= 0, `${dev} : accueil à 150 % sans débordement horizontal`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-accueil.png`, fullPage: dev === 's24' });
  // indépendant du niveau : changer de mode ne touche pas au Confort, et inversement
  await pg.click('.mode-options [data-mode=doctorant]');
  check(await pg.evaluate(() => MDComfort.get().on && document.documentElement.dataset.homeMode === 'doctorant'), `${dev} : mode Doctorant + Confort ensemble`);
  // la visite guidée reste juste avec le zoom
  await pg.evaluate(() => { localStorage.removeItem('mdl_guide_never'); sessionStorage.clear(); });
  await pg.click('#obReplay').catch(() => {}); await pg.waitForTimeout(500);
  if (await pg.$('#obTour')) { await pg.click('#obTour'); await pg.waitForTimeout(500); }
  if (await pg.$('#obNext')) {
    await pg.click('#obNext'); await pg.waitForTimeout(600);
    const al = await pg.evaluate(() => { const s = document.querySelector('.ob-spot').getBoundingClientRect(), t = document.querySelector('.qt-daily').getBoundingClientRect(); return Math.abs(s.top + 6 - t.top) < 3 && Math.abs(s.width - 12 - t.width) < 3; });
    check(al, `${dev} : visite guidée à 150 % — le projecteur entoure bien le bloc`);
    await pg.screenshot({ path: `${OUT}/${dev}-confort-visite.png` });
    await closeOnboarding(pg);
  }
  await pg.close();

  // ---- Quiz du défi : réponses une par ligne, contraste, lecture automatique ----
  pg = await open(ctx, 'guided-tour.html?mode=daily&new=1', 2200);
  const q = await pg.evaluate(() => { const a = [...document.querySelectorAll('.answers .ans')]; const r = a.map(b => b.getBoundingClientRect()); return { n: a.length, oneCol: r.every(x => Math.abs(x.left - r[0].left) < 2), h: Math.min(...r.map(x => x.height)), bg: getComputedStyle(a[0]).backgroundColor, bd: getComputedStyle(a[0]).borderTopColor, q: document.querySelector('.question h2')?.textContent }; });
  check(q.n >= 2 && q.oneCol && q.h >= 64, `${dev} : défi du jour — ${q.n} réponses, une par ligne, hauteur ≥ 64 px`);
  check(q.bg === 'rgb(0, 0, 0)' && q.bd === 'rgb(255, 225, 77)', `${dev} : réponses noir sur bordure jaune (contraste élevé)`);
  let s = await pg.evaluate(() => window.__said.map(x => x.text));
  check(s.length === q.n + 1 && s[0] === q.q.trim() && s[1].startsWith('Réponse 1.'), `${dev} : question lue automatiquement puis ${q.n} réponses numérotées`);
  check((await pg.evaluate(() => window.__said[0])).lang === 'he-IL', `${dev} : question en hébreu lue avec la voix hébraïque`);
  check(await pg.isVisible('.cf-fab .cf-read') && await pg.isVisible('.cf-fab .cf-open'), `${dev} : boutons 🔊 et Aa présents sur la page de jeu`);
  check((await overflow(pg)) <= 0, `${dev} : défi du jour à 150 % sans débordement horizontal`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-defi.png` });
  await pg.evaluate(() => { window.__said = []; }); await pg.click('.answers .ans >> nth=0'); await pg.waitForTimeout(700);
  check((await pg.evaluate(() => window.__said.length)) === 0, `${dev} : pas de relecture quand on répond (même question)`);
  const fb = await pg.evaluate(() => { const c = document.querySelector('.ans.correct'); return c && getComputedStyle(c).borderTopColor; });
  check(fb === 'rgb(125, 255, 155)', `${dev} : bonne réponse bien distincte en contraste élevé (bordure verte)`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-defi-reponse.png` });
  await pg.evaluate(() => { speechSynthesis.speaking = false; window.__said = []; }); // la lecture précédente est terminée
  await pg.click('.cf-fab .cf-read'); s = await pg.evaluate(() => window.__said.map(x => x.rate));
  check(s.length > 1 && s.every(r => r === 1.4), `${dev} : bouton 🔊 relit question + réponses à ×1,4`);
  await pg.close();

  // ---- Examen partie A : lecture des questions et réponses ----
  pg = await open(ctx, 'parta.html#/', 1500); await pg.click('#start');
  await pg.waitForFunction(() => window.__said.length > 1, null, { timeout: 8000 }).catch(() => {});
  const pr = await pg.evaluate(() => window.__said.map(x => x.text));
  const ansTxt = await pg.evaluate(() => [...document.querySelectorAll('#answers .ans')].map(b => b.lastElementChild.textContent.trim()));
  check(pr.length === ansTxt.length + 1 && ansTxt.every((a, k) => pr[k + 1] === 'Réponse ' + (k + 1) + '. ' + a), `${dev} : examen partie A — question et ${ansTxt.length} réponses lues, sans les lettres א/ב/ג/ד`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-parta.png` });
  await pg.close();
  // ---- Chronomètre désactivé : examen partie A (horloge simulée : 5 minutes passent) ----
  pg = await ctx.newPage(); pg.on('pageerror', e => errs.push('parta: ' + e.message)); await pg.clock.install();
  await pg.goto(base + 'parta.html#/'); await pg.clock.runFor(1500); await pg.click('#start'); await pg.clock.runFor(800);
  check(await pg.isHidden('#timer'), `${dev} : examen partie A — chronomètre masqué`);
  await pg.clock.runFor(5 * 60 * 1000);
  check((await pg.evaluate(() => document.querySelectorAll('.ans:disabled,.ans.correct,.ans.wrong').length)) === 0, `${dev} : examen partie A — 5 min après, la question attend toujours la réponse`);
  await pg.close();

  // ---- Chronomètre désactivé : frise (entraînement), mais gardé en mode examen ----
  pg = await open(ctx, 'history.html#/quiz', 1600); await pg.click('#start'); await pg.waitForTimeout(900);
  check(await pg.evaluate(() => document.getElementById('clock').classList.contains('off')), `${dev} : frise — entraînement sans chronomètre`);
  await pg.screenshot({ path: `${OUT}/${dev}-confort-frise.png` });
  await pg.close();

  // ---- Désactivation : tout revient comme avant ----
  pg = await open(ctx, 'journey.html', 1000);
  await pg.click('.cf-fab .cf-open'); await pg.waitForTimeout(150); await pg.uncheck('#cfOn'); await pg.click('#cfDone');
  const offs = await pg.evaluate(() => [[...document.documentElement.classList].filter(c => /^cf-(on|big|wide|contrast)$/.test(c)).length, getComputedStyle(document.body).zoom]);
  check(offs[0] === 0 && offs[1] === '1', `${dev} : désactivé depuis une autre page → plus aucun effet`);
  const keep = await pg.evaluate(() => MDComfort.get());
  check(keep.size === 150 && keep.rate === 1.4 && keep.noTimer, `${dev} : réglages conservés pour la prochaine activation`);
  await pg.close();
  await ctx.close();
}
// Architecture (3D) : chronomètre masqué en Confort
{
  const ctx = await context('desktop', { mdl_comfort_v1: JSON.stringify({ on: true, noTimer: true, size: 100, contrast: false }) });
  const pg = await open(ctx, 'architecture.html#/play', 2500);
  await pg.click('#pStart'); await pg.waitForTimeout(1500);
  check(await pg.isHidden('#pTimer'), 'architecture : chronomètre masqué en Confort sans chronomètre');
  await pg.waitForTimeout(500); check(!(await pg.isVisible('#pFb')), 'architecture : pas de « temps écoulé » automatique');
  await pg.close(); await ctx.close();
}
// Langues du panneau Confort
{
  const ctx = await context('s24', { mdl_onboarded_v3: '1', mdl_guide_never: '1' });
  const pg = await open(ctx, 'index.html');
  for (const [lang, word] of [['he', 'מצב נוחות'], ['fr', 'Mode Confort'], ['en', 'Comfort mode'], ['ru', 'Режим комфорта']]) {
    await pg.click('#langTop'); await pg.click(`[data-lang=${lang}]`); await pg.waitForTimeout(150);
    await pg.click('#modeComfort'); await pg.waitForTimeout(120);
    const d = await pg.evaluate(() => [document.querySelector('#cfT').textContent, document.querySelector('.cf-panel').dir]);
    check(d[0].includes(word) && d[1] === (lang === 'he' ? 'rtl' : 'ltr'), `panneau Confort en ${lang} (« ${d[0]} »)`);
    if (lang === 'he') await pg.screenshot({ path: `${OUT}/s24-he-confort-panneau.png` });
    await pg.click('#cfDone');
  }
  await pg.close(); await ctx.close();
}
console.log(errs.length ? 'ERREURS JS :\n' + [...new Set(errs)].join('\n') : 'aucune erreur JS', ok, 'ok', bad, 'ko');
await br.close(); srv.close(); process.exit(bad || errs.length ? 1 : 0);
