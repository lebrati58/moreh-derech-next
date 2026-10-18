// SCÉNARIO OBLIGATOIRE — 35 élèves, de bout en bout, via HTTP (comme les vrais
// téléphones) + 3 vrais navigateurs Chromium parmi eux.
// Prérequis : dev-server lancé sur une base fraîche (voir README, "npm run scenario").
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:8787';
const rpc = async (fn, args) => {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json(); if (!r.ok) throw new Error(j.message); return j;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('✔', ...a);

// --- admin
const { token: admin } = await rpc('admin_login', { p_password: 'guide-test-2026' });
await rpc('admin_new_game', { p_token: admin, p_title: 'סימולציה 35' });
// Ce scénario ferme les questions sans attendre : temps minimal ramené à 0 par SQL direct (test uniquement ;
// impossible via l'API admin). La règle des 30 s est testée dans tests/v2.test.mjs et tests/v2-screens.mjs.
{ const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: process.env.DB || 'mdl_dev' });
  await db.connect(); await db.query('update mdl.games set min_answer_sec = 0 where is_active'); await db.end(); }
let st = await rpc('admin_state', { p_token: admin });
const geo = st.questions.find(q => q.category === 'גאולוגיה');
const q2 = st.questions.find(q => q.id !== geo.id);

// --- 3 vrais navigateurs + 32 clients HTTP = 35 élèves
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pages = [];
for (let i = 1; i <= 3; i++) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true })).newPage();
  await p.goto(BASE + '/');
  await p.click('.langopt[data-lang=he]');            // V2 : choix de la langue avant le nom
  await p.fill('#nm', 'דפדפן ' + i); await p.click('#jbtn');
  await p.waitForSelector('text=מחכים לשאלה הבאה');
  pages.push(p);
}
const players = await Promise.all(Array.from({ length: 32 }, (_, i) => rpc('join_game', { p_name: 'תלמיד ' + (i + 1) })));
st = await rpc('admin_state', { p_token: admin });
assert.equal(st.players, 35); log('35 élèves ont rejoint');

// Clients HTTP : boucle de lecture d'état comme les vrais téléphones
const view = new Map(); let polling = true;
const offline = new Set();
const pollers = players.map(async p => {
  let v = 0;
  while (polling) {
    if (!offline.has(p.token)) {
      const s = await rpc('get_state', { p_token: p.token, p_since: v });
      if (!s.same) { v = s.v; view.set(p.token, s); }
    }
    await sleep(1500);
  }
});

// --- question de géologie publiée
const t0 = Date.now();
await rpc('admin_open_question', { p_token: admin, p_question_id: geo.id });
await Promise.all(pages.map(p => p.waitForSelector('.ans', { timeout: 5000 })));
log('question visible dans les 3 navigateurs sans rafraîchir, en', Date.now() - t0, 'ms');
await sleep(1700);
assert.ok(players.every(p => view.get(p.token)?.question?.id === geo.id), 'tous les clients voient la question');
assert.ok(players.every(p => view.get(p.token).question.correct_index === undefined), 'bonne réponse cachée');
log('question reçue par les 32 clients HTTP, bonne réponse non divulguée');

// --- réponses à des vitesses différentes (0 à ~6 s), 1 élève sur 4 se trompe
const correct = geo.correct_index;
const subs = players.map((p, i) => (async () => {
  await sleep(i * 180);
  const choice = i % 4 === 3 ? (correct + 1) % 4 : correct;
  return rpc('submit_answer', { p_token: p.token, p_question_id: geo.id, p_choice: choice });
})());
for (const [i, p] of pages.entries()) { await p.click(`.ans.c${i === 2 ? (correct + 2) % 4 : correct}`); await p.click('text=שליחת תשובה'); }
const res = await Promise.all(subs);
assert.ok(res.every(r => r.status === 'ok'));
await Promise.all(pages.map(p => p.waitForSelector('text=התשובה נקלטה')));
log('35 réponses envoyées et confirmées');

// --- doubles soumissions (rafale simultanée) et choix modifié
const dupl = await Promise.all([0, 1, 2, 3].map(c => rpc('submit_answer', { p_token: players[0].token, p_question_id: geo.id, p_choice: c })));
assert.ok(dupl.every(r => r.status === 'duplicate' && r.choice === correct));
log('4 doubles soumissions simultanées refusées, première réponse conservée');

st = await rpc('admin_state', { p_token: admin });
assert.equal(st.current.answers, 35);
log('admin voit', st.current.answers, 'réponses, répartition', JSON.stringify(st.current.counts));

// --- fermeture, réponse tardive refusée
await rpc('admin_close_question', { p_token: admin });
const lateP = await rpc('join_game', { p_name: 'מאחר' });
assert.equal((await rpc('submit_answer', { p_token: lateP.token, p_question_id: geo.id, p_choice: correct })).status, 'closed');
log('réponse après fermeture refusée');

// --- révélation + classement
await rpc('admin_reveal', { p_token: admin });
await Promise.all(pages.map(p => p.waitForSelector('.result')));
await sleep(1700);
const s0 = view.get(players[0].token), s1 = view.get(players[30].token);
assert.equal(s0.question.correct_index, correct); assert.ok(s0.question.explanation);
assert.ok(s0.me.score > s1.me.score, 'le plus rapide a plus de points');
assert.ok(s0.me.score > 100 && s0.me.score <= 200);
const wrong = view.get(players[3].token);
assert.equal(wrong.me.score, 0); assert.equal(wrong.question.my_correct, false);
st = await rpc('admin_state', { p_token: admin });
const top = st.leaderboard.slice(0, 3).map(r => `${r.name}:${r.score}`).join(', ');
log('bonne réponse + explication révélées, classement à jour — podium:', top);
assert.equal(await pages[2].locator('.result.wrong').count(), 1);
log('navigateur 3 (mauvaise réponse) affiche bien "לא הפעם"');

// --- un élève perd sa connexion pendant la question suivante
const lost = players[5];
const scoreBefore = view.get(lost.token).me.score;
offline.add(lost.token);
await pages[0].context().setOffline(true);
await rpc('admin_open_question', { p_token: admin, p_question_id: q2.id });
await sleep(4000);
assert.equal(await pages[0].locator('#banner:not(.hidden)').count(), 1);
log('perte de réseau : bannière "אין חיבור" affichée dans le navigateur');
await pages[0].context().setOffline(false);
await pages[0].waitForSelector('.ans', { timeout: 10000 });
log('navigateur reconnecté : la question en cours apparaît, nom conservé');
offline.delete(lost.token);
// reconnexion : simple reprise avec le jeton (rien à ressaisir)
const back = await rpc('get_state', { p_token: lost.token, p_since: 0 });
assert.equal(back.me.score, scoreBefore); assert.equal(back.question.id, q2.id);
log(`élève reconnecté, score conservé (${scoreBefore}), voit la nouvelle question`);
// reprise par le jeton même si l'élève retape son prénom (aucun doublon créé)
const again = await rpc('join_game', { p_name: lost.name, p_token: lost.token });
assert.equal(again.player_id, lost.player_id); assert.equal(again.reconnected, true);
log('reconnexion par jeton (prénom retapé) : même joueur, aucun doublon');
// rechargement de page complet : retour direct dans le jeu
await pages[1].reload(); await pages[1].waitForSelector('.ans');
log('rechargement complet de la page : retour direct dans la partie');

await rpc('submit_answer', { p_token: lost.token, p_question_id: q2.id, p_choice: q2.correct_index });
await rpc('admin_reveal', { p_token: admin });
await rpc('admin_finish', { p_token: admin });
await Promise.all(pages.map(p => p.waitForSelector('text=הזוכים הגדולים')));
st = await rpc('admin_state', { p_token: admin });
log('fin de partie, podium affiché :', JSON.stringify(st.stats));

polling = false; await Promise.all(pollers);
await browser.close();
console.log('\nSCÉNARIO COMPLET : OK');
