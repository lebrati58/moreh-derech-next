// Parcours navigateur du panneau micro (admin) + vérification côté élève.
// Usage : node tests/guide-screens.mjs <dossier-captures>   (dev-server lancé sur install.sql)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const OUT = process.argv[2] || '.';
const B = process.env.BASE || 'http://localhost:8787';
const br = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ph = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
const ctxA = await br.newContext(ph);
const a = await ctxA.newPage(); a.on('pageerror', e => errors.push(e.message));
await a.goto(B + '/admin.html'); await a.fill('#pw', 'guide-test-2026'); await a.click('text=כניסה');
await a.waitForSelector('text=פרסם שאלה');
const p = await (await br.newContext(ph)).newPage(); p.on('pageerror', e => errors.push(e.message));
await p.goto(B + '/'); await p.fill('#nm', 'נועה'); await p.click('text=הצטרפות למשחק'); await p.waitForSelector('text=מחכים');

// 1re question du trajet (Nahal Taninim)
await a.screenshot({ path: OUT + '/g0-next.png', fullPage: true });
await a.click('text=📣 פרסם שאלה');
await p.waitForSelector('.ans'); await p.click('.ans.c0'); await p.click('text=שליחת תשובה');
await a.click('text=סגור שאלה'); await a.waitForSelector('text=חשוף תשובה'); await a.click('text=חשוף תשובה');

// le panneau s'ouvre tout seul à la révélation
await a.waitForSelector('#guide', { timeout: 5000 });
await a.screenshot({ path: OUT + '/g1-auto-short.png' });
await a.click('[data-g=long]'); await a.waitForTimeout(200);
await a.screenshot({ path: OUT + '/g2-long.png' });
for (let i = 0; i < 3; i++) await a.click('[data-g=bigger]');
const fs = await a.$eval('#guide', el => getComputedStyle(el).getPropertyValue('--gfs'));
assert.equal(fs.trim(), '30px');
await a.$eval('#guide-body', el => el.scrollTop = el.scrollHeight);
await a.screenshot({ path: OUT + '/g3-bigger-scrolled.png' });

// rien du script chez l'élève
await p.waitForSelector('.result');
const html = await p.content();
assert.ok(!html.includes('אחד ממפעלי המים המרשימים'), 'script court visible chez l\'élève !');
await p.screenshot({ path: OUT + '/g4-student.png', fullPage: true });

// « המשך לשאלה הבאה » ferme le panneau et montre la question suivante
await a.click('[data-g=next]');
await a.waitForSelector('#guide', { state: 'detached' });
await a.waitForSelector('text=📣 פרסם שאלה');
// le panneau ne se rouvre pas tout seul pour la même question
await a.waitForTimeout(2500);
assert.equal(await a.$('#guide'), null);

// hors ligne : rechargement de la page admin sans réseau → fiches toujours consultables
await a.waitForTimeout(1500);
await ctxA.setOffline(true);
await a.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await a.waitForSelector('text=אין חיבור לשרת', { timeout: 15000 });
await a.screenshot({ path: OUT + '/g5-offline.png' });
await a.click('[data-a=guide] >> nth=10');
await a.waitForSelector('#guide');
await a.click('[data-g=long]');
await a.screenshot({ path: OUT + '/g6-offline-guide.png' });
await ctxA.setOffline(false);

console.log('erreurs JS :', errors);
assert.equal(errors.length, 0);
console.log('PANNEAU MICRO : OK');
await br.close();
