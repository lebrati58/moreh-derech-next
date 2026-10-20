// Parcours navigateur V3 de bout en bout (vrais Chromium en format téléphone) + captures d'écran.
// Prérequis : base mdl_dev installée avec supabase/install.sql, mot de passe 'guide-test-2026',
//             serveur `npm run dev` lancé. Usage : node tests/v3-browser.mjs <dossier-captures>
// Vérifie : accueil élève en hébreu, langue + prénom seulement, homonymes, attente, publication
// manuelle uniquement, 4 langues, chrono commun, 30 s minimum, révélation, classement, reconnexion,
// coupure réseau, GPS (autorisé / refusé / position sur le trajet), simulation sans envoi, V1/V2 intacts.
import { chromium } from 'playwright-core';
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'screens-v3';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const V3 = JSON.parse(readFileSync(new URL('../content/v3/road67_questions.json', import.meta.url)));
const SRC = Object.fromEntries(V3.questions.map(q => [q.id, q]));
const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: 'mdl_dev' });
await db.connect();
const one = async (sql, a) => (await db.query(sql, a)).rows[0];
const ageOpen = sec => db.query(`
  update mdl.games set opened_at = opened_at - interval '${sec} s' where is_active;
  update mdl.game_questions gq set opened_at = gq.opened_at - interval '${sec} s', closes_at = gq.closes_at - interval '${sec} s'
    from mdl.games g where g.is_active and gq.game_id = g.id and gq.question_id = g.current_question`);
const published = async () => +(await one(`select count(*) n from mdl.game_questions gq join mdl.games g on g.id = gq.game_id and g.is_active`)).n;

const browser = await chromium.launch({ executablePath: exe });
const android = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' };
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' };
const errors = [];
const watch = (p, who) => {
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('console', m => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) && errors.push(who + ': ' + m.text()));
};
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const ok = m => console.log('✔ ' + m);
async function login(p) {
  await p.goto(BASE + '/admin.html');
  await p.fill('#pw', 'guide-test-2026'); await p.click('text=כניסה');
  await p.waitForSelector('[data-view=settings]', { state: 'attached' });
  await p.waitForTimeout(300);
  if (await p.$('#guide')) await p.click('#guide [data-g=close]');
}
// les scénarios historiques utilisent l'écran complet ; le « mode bus » (défaut en V3) a son propre scénario
const fullMode = ctx => ctx.addInitScript(() => { try { if (localStorage.getItem('mdl_busmode') === null) localStorage.setItem('mdl_busmode', 'false'); } catch { /* */ } });
const noHScroll = async (p, who) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), who + ' : défilement horizontal');

// ------------------------------------------------------------------ Guide : nouvelle partie V3
const actx = await browser.newContext(iphone); await fullMode(actx);
const admin = await actx.newPage(); watch(admin, 'admin');
await admin.goto(BASE + '/admin.html');
await admin.fill('#pw', 'guide-test-2026'); await admin.click('text=כניסה');
await admin.waitForSelector('[data-view=settings]');
await admin.waitForTimeout(400);
if (await admin.$('#guide')) await admin.click('#guide [data-g=close]');
await admin.click('[data-view=settings]');
await admin.click('[data-a=newgame]');
await admin.waitForSelector('#ngf');
const banks = await admin.$$eval('#ngf input[name=bank]', els => els.map(e => e.value));
assert.deepEqual(banks, ['V1', 'V2', 'V3']);
await shot(admin, 'a1-selecteur-V1-V2-V3');
await admin.check('#ngf input[value=V3]');
await admin.click('#ngf button.sun');
await admin.waitForSelector('#navroot');
assert.equal((await one('select bank, default_time_limit_sec t, min_answer_sec m from mdl.games where is_active')).bank, 'V3');
assert.equal((await one('select default_time_limit_sec t from mdl.games where is_active')).t, 45);
assert.equal(await published(), 0);
await admin.waitForSelector('#navroot .lvl');
assert.match(await admin.textContent('#navroot'), /ניווט חכם — כביש 67/);
assert.match(await admin.textContent('#navroot'), /GPS כבוי — מצב ידני/);
assert.equal(await admin.$$eval('img', im => im.filter(i => /photos\//.test(i.src)).length), 0, 'aucune photo en V3');
await shot(admin, 'a2-live-V3-manuel', true);
ok('admin : sélecteur V1/V2/V3, partie V3 à 45 s, aucune photo, GPS éteint par défaut (mode manuel)');

// ------------------------------------------------------------------ Élèves : accueil hébreu, langue + prénom
const students = [];
async function student(ctxOpts, who, name, langBtn) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage(); watch(p, who);
  await p.goto(BASE + '/');
  await p.waitForSelector('#joinf');
  if (langBtn) await p.click(`[data-lang=${langBtn}]`);
  await p.fill('#nm', name);
  await p.click('#jbtn');
  await p.waitForSelector('.waiting');
  students.push({ ctx, p, who, name, lang: langBtn || 'he' });
  return p;
}
{
  const ctx = await browser.newContext(android);
  const p = await ctx.newPage(); watch(p, 'accueil');
  await p.goto(BASE + '/');
  await p.waitForSelector('#joinf');
  assert.equal(await p.getAttribute('html', 'dir'), 'rtl');
  assert.equal(await p.getAttribute('html', 'lang'), 'he', 'hébreu par défaut même si le téléphone est en français');
  const txt = await p.textContent('#joinf');
  for (const s of ['מורה דרך', 'LIVE', 'ברוכים הבאים לחידון!', 'בחרו שפה', 'עברית', 'Français', 'English', 'Русский', 'מה השם הפרטי שלכם?', 'מתחילים לשחק 🚀'])
    assert.ok(txt.includes(s), 'accueil : ' + s);
  assert.equal(await p.getAttribute('#nm', 'placeholder'), 'השם הפרטי');
  assert.equal(await p.$$eval('.langopt .flag svg', e => e.length), 4, 'drapeaux dessinés (lisibles aussi sous Windows)');
  assert.equal(await p.$$eval('#joinf input', e => e.length), 1, 'un seul champ : le prénom');
  await noHScroll(p, 'accueil 360px');
  await shot(p, 's1-accueil-he');
  await p.fill('#nm', 'Léa');
  await p.click('[data-lang=fr]');
  assert.equal(await p.getAttribute('html', 'dir'), 'ltr');
  assert.match(await p.textContent('#joinf'), /Bienvenue au quiz !/);
  assert.equal(await p.inputValue('#nm'), 'Léa', 'le prénom tapé est conservé au changement de langue');
  await shot(p, 's2-accueil-fr');
  await p.click('[data-lang=ru]'); assert.match(await p.textContent('#joinf'), /Начинаем играть/);
  await p.click('[data-lang=en]'); assert.match(await p.textContent('#joinf'), /Let’s play/);
  await ctx.close();
  ok('élève : accueil hébreu RTL par défaut, 4 langues LTR/RTL immédiates, un seul champ (prénom)');
}
const sHe = await student(android, 'he', 'דוד');
const sFr = await student(android, 'fr', 'דוד', 'fr');          // même prénom : entre directement
const sEn = await student(iphone, 'en', 'Sam', 'en');
const sRu = await student(iphone, 'ru', 'Миша', 'ru');
assert.match(await sHe.textContent('.waiting'), /מחכים לשאלה הבאה\.\.\. 🚌/);
assert.match(await sHe.textContent('.waiting'), /השאלה תופיע כאן אוטומטית/);
assert.match(await sFr.textContent('.waiting'), /On attend la prochaine question/);
// règles du défi sur l'écran d'attente : points, bonus de vitesse, une seule réponse
assert.match(await sHe.textContent('.rules'), /100[\s\S]*\+100[\s\S]*200/);
assert.match(await sFr.textContent('.rules'), /Bonus de vitesse/);
assert.equal(await sHe.$eval('.rules', d => d.open), true, 'règles dépliées avant la première question');
assert.ok(!/(^|[\s:])קוד|\bcode\b|(^|\s)код/i.test(await sHe.textContent('#app') + await sFr.textContent('#app')), 'aucun code personnel affiché');
assert.equal(+(await one(`select count(*) n from mdl.players p join mdl.games g on g.id = p.game_id and g.is_active where name = 'דוד'`)).n, 2);
assert.equal(await published(), 0, 'rejoindre ne publie jamais de question');
await noHScroll(sHe, 'attente 360px');
await shot(sHe, 's3-attente-he'); await shot(sFr, 's4-attente-fr');
ok('élèves : 2 « דוד » acceptés sans code, arrivée directe dans le jeu, message d\'attente, aucune question auto');

// ------------------------------------------------------------------ Publication manuelle depuis la carte de navigation
await admin.waitForFunction(() => /4\/4|👥 4/.test(document.querySelector('#hdr-chip')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
await admin.click('#navroot [data-nav=publish]');
await admin.waitForSelector('#closebtn');
const q1 = SRC[(await one(`select x.ext_key from mdl.games g join mdl.questions x on x.id = g.current_question where g.is_active`)).ext_key.replace('v3:', '')];
for (const s of students) {
  await s.p.waitForSelector('.question-text', { timeout: 5000 });
  assert.equal((await s.p.textContent('.question-text')).trim(), q1.i18n[s.lang].question, s.who);
  const opts = await s.p.$$eval('#ans .ans span:last-child', e => e.map(x => x.textContent.trim()));
  assert.deepEqual(opts, q1.i18n[s.lang].options, s.who);
}
const gq = await one(`select gq.opened_at, gq.closes_at, gq.time_limit_sec from mdl.game_questions gq join mdl.games g on g.id = gq.game_id and g.is_active`);
assert.equal(gq.time_limit_sec, 45);
await shot(sRu, 's5-question-ru'); await shot(sHe, 's6-question-he');
ok('publication manuelle (bouton 📣) : question apparue sans rafraîchir, dans la langue de chacun, 45 s');

// changement de langue en pleine question : même question, même joueur
await sFr.click('#lang-btn'); await sFr.click('#lsheet [data-lang=en]');
await sFr.waitForFunction(t => document.querySelector('.question-text')?.textContent.trim() === t, q1.i18n.en.question);
students[1].lang = 'en';
// réponses : 3 justes, 1 fausse
for (const [i, s] of students.entries()) {
  await s.p.click(`#ans .ans[data-i="${i === 3 ? (q1.correctIndex + 1) % 4 : q1.correctIndex}"]`);
  await s.p.click('#send');
  await s.p.waitForSelector('.result');
}
// fermeture normale verrouillée avant 30 s (bouton + serveur)
assert.equal(await admin.$eval('#closebtn', b => b.disabled), true);
await shot(admin, 'a3-question-ouverte-verrou-30s');
await ageOpen(31);
await admin.waitForFunction(() => !document.querySelector('#closebtn').disabled, null, { timeout: 4000 });
await admin.click('#closebtn');
await admin.waitForSelector('[data-a=reveal]');
await admin.click('[data-a=reveal]');
await admin.waitForSelector('#guide');
const gtxt = await admin.textContent('#guide');
for (const s of ['🎤 מה להגיד באוטובוס', '💡 הידעת?', '📍 מתי לדבר?', '📚 מידע נוסף']) assert.ok(gtxt.includes(s), 'panneau micro : ' + s);
assert.ok(gtxt.indexOf('🎤 מה להגיד') < gtxt.indexOf('💡 הידעת?') && gtxt.indexOf('💡 הידעת?') < gtxt.indexOf('📍 מתי לדבר?'));
await shot(admin, 'a4-micro-apres-revelation');
await admin.click('#guide [data-g=close]');
for (const s of students) {
  await s.p.waitForSelector('.result.good, .result.wrong');
  assert.match(await s.p.textContent('.explain'), new RegExp(q1.i18n[s.lang].explanation.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
const lbHe = await sHe.$$eval('.lb li .nm', e => e.map(x => x.textContent));
assert.ok(lbHe.includes('דוד') && lbHe.includes('דוד (2)'), 'homonymes distingués : ' + lbHe);
const lbRu = await sRu.$$eval('.lb li .nm', e => e.map(x => x.textContent));
assert.deepEqual(lbRu, lbHe, 'un seul classement pour les 4 langues');
const pts = (await db.query(`select p.name, a.points, a.is_correct from mdl.answers a join mdl.players p on p.id = a.player_id join mdl.games g on g.id = a.game_id and g.is_active order by p.id`)).rows;
assert.equal(pts.filter(r => r.is_correct).length, 3);
await shot(sHe, 's7-revelation-he', true); await shot(sEn, 's8-revelation-en', true);
ok('30 s minimum respecté, révélation, explication traduite, panneau micro 🎤→💡→📍→📚, classement commun avec « דוד (2) »');

// reconnexion : rechargement + coupure réseau
const before = await sFr.textContent('#hdr-chip');
await sFr.reload(); await sFr.waitForSelector('.myline');
assert.equal(await sFr.textContent('#hdr-chip'), before, 'score conservé après rechargement');
assert.equal(await sFr.getAttribute('html', 'lang'), 'en', 'langue conservée');
await students[2].ctx.setOffline(true);
await sEn.waitForSelector('#banner:not(.hidden)', { timeout: 10000 });
await shot(sEn, 's9-hors-ligne');
await students[2].ctx.setOffline(false);
await sEn.waitForSelector('#banner.hidden', { state: 'attached', timeout: 15000 });
ok('reconnexion automatique : rechargement (score + langue conservés) et coupure réseau signalée puis rétablie');

// ------------------------------------------------------------------ GPS réel : position sur le trajet (Playwright)
const gctx = await browser.newContext(Object.assign({}, iphone, { geolocation: { latitude: 32.5935, longitude: 34.9690, accuracy: 10 }, permissions: ['geolocation'] }));
await fullMode(gctx);
const gpage = await gctx.newPage(); watch(gpage, 'gps');
await login(gpage);
await gpage.waitForSelector('#navroot');
const nBefore = await published();
await gpage.click('#navroot [data-nav=gps-on]');
await gpage.waitForFunction(() => /GPS פעיל/.test(document.querySelector('#navroot .navstat')?.textContent || ''), null, { timeout: 8000 });
await gctx.setGeolocation({ latitude: 32.5945, longitude: 34.9760, accuracy: 10 });
await gpage.waitForTimeout(2500);
const navTxt = await gpage.textContent('#navroot');
assert.match(navTxt, /ק״מ \d/);
assert.match(navTxt, /👈 שמאל|ימין 👉/);
await shot(gpage, 'a5-gps-reel-sur-le-trajet', true);
assert.equal(await published(), nBefore, 'le GPS ne publie jamais');
// position imprécise → mode manuel annoncé
await gctx.setGeolocation({ latitude: 32.5950, longitude: 34.9800, accuracy: 400 });
await gpage.waitForFunction(() => /מיקום לא מדויק — עבור למצב ידני/.test(document.querySelector('#navroot')?.textContent || ''), null, { timeout: 8000 });
ok('GPS réel (autorisé) : position projetée sur le trajet, côté non vérifié signalé, imprécision → mode manuel, aucune publication');
// GPS refusé
const dctx = await browser.newContext(iphone); await fullMode(dctx);
// sur un vrai téléphone l'utilisateur refuse ; ici on reproduit la réponse du navigateur (code 1 = PERMISSION_DENIED)
await dctx.addInitScript(() => {
  navigator.geolocation.watchPosition = (ok, err) => { setTimeout(() => err({ code: 1, message: 'User denied Geolocation' }), 200); return 7; };
  navigator.geolocation.clearWatch = () => {};
});
const dpage = await dctx.newPage(); watch(dpage, 'gps-refusé');
await login(dpage); await dpage.waitForSelector('#navroot');
await dpage.click('#navroot [data-nav=gps-on]');
await dpage.waitForFunction(() => /אין הרשאת מיקום/.test(document.querySelector('#navroot')?.textContent || ''), null, { timeout: 8000 });
assert.ok(await dpage.$('#navroot [data-nav=publish]'), 'publication manuelle toujours possible sans GPS');
ok('GPS refusé : message + mode manuel opérationnel');
await dctx.close();

// ------------------------------------------------------------------ Simulation complète (aucun envoi)
const nSim = await published();
await gpage.click('#navroot [data-nav=gps-off]');
await gpage.click('#navroot [data-nav=to-sim]');
await gpage.waitForSelector('#navroute');
await gpage.click('[data-nav=sim-play]');
for (let i = 0; i < 2; i++) await gpage.click('[data-nav=sim-speed]');      // ×4 → ×8 → ×16
const seen = new Set();
for (let t = 0; t < 120 && seen.size < 3; t++) {
  await gpage.waitForTimeout(500);
  const h = await gpage.textContent('#navroute .lvl:not(.stage) .lvlh').catch(() => '');
  for (const k of ['🟡', '🟠', '🟢']) if (h.includes(k)) seen.add(k);
  if (h.includes('🟢') && await gpage.$('#navroute [data-nav=simpub]')) { await gpage.click('#navroute [data-nav=simpub]'); }
}
assert.deepEqual([...seen].sort(), ['🟠', '🟡', '🟢'].sort(), 'trois niveaux d\'alerte vus en simulation');
await gpage.waitForSelector('#navroute .lvl .lvlh:has-text("שאלה בסימולציה"), #navroute .lvl .lvlh:has-text("התשובה נחשפה")', { timeout: 20000 });
await shot(gpage, 'a6-simulation', true);
// pannes simulées
await gpage.click('#navroute summary:has-text("אפשרויות ותקלות")');
await gpage.check('[data-nav=fault][data-k=noisy]'); await gpage.waitForTimeout(2500);
assert.match(await gpage.textContent('#navroute'), /מיקום לא מדויק/);
await gpage.uncheck('[data-nav=fault][data-k=noisy]');
await gpage.check('[data-nav=fault][data-k=lost]'); await gpage.waitForTimeout(2000);
await gpage.uncheck('[data-nav=fault][data-k=lost]');
await gpage.check('[data-nav=fault][data-k=rush]');
await gpage.waitForFunction(() => /הגענו לארומה יקנעם|סיום ההדרכה — מתקרבים לארומה יקנעם/.test(document.querySelector('#navroute')?.textContent || ''), null, { timeout: 90000 });
await shot(gpage, 'a7-simulation-fin-aroma', true);
assert.equal(await published(), nSim, 'la simulation n\'envoie aucune question aux élèves');
ok('simulation : 3 niveaux, publication simulée sans envoi, pannes GPS, fin « 🏁 » avant Aroma');

// ------------------------------------------------------------------ Mode bus : un écran, un bouton, aucun défilement
const bctx = await browser.newContext(Object.assign({}, iphone, { viewport: { width: 360, height: 740 } }));
const bpage = await bctx.newPage(); watch(bpage, 'mode-bus');
await login(bpage);
await bpage.waitForSelector('#busroot #busact');
assert.equal(await bpage.isVisible('#tabs'), false, 'barre d\'onglets cachée en mode bus');
const label = () => bpage.textContent('#busact');
const waitLabel = re => bpage.waitForFunction(r => new RegExp(r).test(document.querySelector('#busact')?.textContent || ''), re.source, { timeout: 15000 });
if (/לשאלה הבאה/.test(await label())) await bpage.click('#busact');
await waitLabel(/לפרסם שאלה/);
await shot(bpage, 'b1-bus-avant');
const nBus = await published();
await bpage.click('#busact');
await waitLabel(/⏳/);
assert.equal(await published(), nBus + 1, 'un appui = une question publiée');
assert.equal(await bpage.isDisabled('#busact'), true, 'pas de révélation avant 30 s');
await shot(bpage, 'b2-bus-ouverte');
await ageOpen(31);
await waitLabel(/לסגור ולחשוף/);
await bpage.click('#busact');
await bpage.waitForSelector('#busbody .busscript', { timeout: 15000 });
assert.equal(await bpage.$('.modal'), null, 'pas de fenêtre : la phrase micro est sur l\'écran');
await waitLabel(/לשאלה הבאה/);
await shot(bpage, 'b3-bus-micro');
await bpage.click('#busact');
await waitLabel(/לפרסם שאלה/);
// tout tient sur l'écran : le bouton est visible sans défiler
assert.ok(await bpage.evaluate(() => { const r = document.querySelector('#busact').getBoundingClientRect(); return r.bottom <= innerHeight && r.top > innerHeight / 2; }));
assert.ok(await bpage.$$eval('#busrank .lb li', l => l.length) >= 2, 'classement complet en bas de l\'écran');
await bpage.click('[data-nav=bus-menu]'); await bpage.click('#bussheet [data-nav=bus-rank]');
await bpage.waitForTimeout(600);
assert.ok(await bpage.evaluate(() => document.querySelector('#busrank').getBoundingClientRect().top < innerHeight), 'menu → classement visible');
await shot(bpage, 'b5-bus-classement');
await bpage.evaluate(() => window.scrollTo(0, 0));
await bpage.click('[data-nav=bus-menu]');
await bpage.waitForSelector('#bussheet .sheet');
await shot(bpage, 'b4-bus-menu');
await bpage.click('#bussheet [data-nav=bus-pick]');
await bpage.waitForSelector('#bussheet [data-nav=pin]');
const pickName = await bpage.textContent('#bussheet [data-nav=pin] >> nth=-1');
await bpage.click('#bussheet [data-nav=pin] >> nth=-1');
await bpage.waitForFunction(n => (document.querySelector('#busbody .busband')?.textContent || '').includes(n), pickName.split(' · ')[1].trim(), { timeout: 8000 });
await bpage.click('[data-nav=bus-menu]'); await bpage.click('#bussheet [data-nav=bus-full]');
await bpage.waitForSelector('#navroot'); assert.equal(await bpage.isVisible('#tabs'), true);
await bpage.click('[data-a=bus-on]'); await bpage.waitForSelector('#busroot');
await noHScroll(bpage, 'mode bus');
await bctx.close();
ok('mode bus : publier → attendre 30 s → révéler → phrase micro → suivante, 1 bouton fixe, menu, choix manuel, retour à l\'écran complet');

// ------------------------------------------------------------------ V2 et V1 toujours fonctionnels
if (await admin.$('#guide')) await admin.click('#guide [data-g=close]');   // ouvert par la révélation faite en mode bus
await admin.click('[data-view=settings]'); await admin.click('[data-a=newgame]');
await admin.check('#ngf input[value=V2]'); await admin.click('#ngf button.sun');
await admin.waitForSelector('.ph-row img', { timeout: 8000 });
await admin.click('[data-view=gallery]'); await admin.waitForSelector('#strip img');
assert.equal(await admin.$$eval('#strip button', b => b.length), 32);
await shot(admin, 'a8-V2-galerie');
await admin.click('[data-view=settings]'); await admin.click('[data-a=newgame]');
await admin.check('#ngf input[value=V1]'); await admin.click('#ngf button.sun');
await admin.waitForFunction(() => /34 שאלות/.test(document.querySelector('.bankchip')?.textContent || ''), null, { timeout: 8000 });
assert.equal(await admin.$('#navroot'), null, 'pas de GPS en V1');
ok('V2 (6+2, galerie 32 photos) et V1 (34 questions) intacts');

assert.deepEqual(errors, [], 'aucune erreur JavaScript');
ok('aucune erreur JavaScript dans les scénarios testés');
await browser.close(); await db.end();
