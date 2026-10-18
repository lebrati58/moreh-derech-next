// Parcours visuel rapide (captures d'écran mobile). Usage : node tests/screens.mjs <outdir>
import { chromium } from 'playwright-core';
import pg from 'pg';
const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: 'mdl_dev' });
await db.connect();
const OUT = process.argv[2] || '.';
const BASE = 'http://localhost:8787';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text())); };

const admin = await (await browser.newContext(phone)).newPage(); watch(admin);
await admin.goto(BASE + '/admin.html');
await admin.screenshot({ path: `${OUT}/a0-login.png` });
await admin.fill('#pw', 'guide-test-2026'); await admin.click('text=כניסה');
await admin.waitForSelector('text=פרסם שאלה');
await admin.screenshot({ path: `${OUT}/a1-live.png`, fullPage: true });

const st = await (await browser.newContext(phone)).newPage(); watch(st);
await st.goto(BASE + '/');
await st.click('.langopt[data-lang=he]');
await st.screenshot({ path: `${OUT}/p0-join.png` });
await st.fill('#nm', 'דנה לוי'); await st.click('#jbtn');
await st.waitForSelector('text=מחכים לשאלה הבאה');
await st.screenshot({ path: `${OUT}/p1-wait.png` });

await admin.click('text=📣 פרסם שאלה');
await db.query("update mdl.games set opened_at = opened_at - interval '31 s' where is_active; update mdl.game_questions gq set opened_at = gq.opened_at - interval '31 s', closes_at = gq.closes_at - interval '31 s' from mdl.games g where g.is_active and gq.game_id = g.id and gq.question_id = g.current_question"); // temps minimal « vieilli » (test)
await st.waitForSelector('.ans');
await st.click('.ans.c0');
await st.screenshot({ path: `${OUT}/p2-question.png` });
await st.click('text=שליחת תשובה');
await st.waitForSelector('text=התשובה נקלטה');
await st.screenshot({ path: `${OUT}/p3-sent.png` });
await admin.waitForSelector('text=1 / 1 ענו');
await admin.screenshot({ path: `${OUT}/a2-open.png`, fullPage: true });
await admin.click('text=סגור שאלה');
await admin.waitForSelector('text=חשוף תשובה'); await admin.click('text=חשוף תשובה');
await st.waitForSelector('.result.good');
await st.screenshot({ path: `${OUT}/p4-revealed.png`, fullPage: true });
await admin.click('[data-view=questions]'); await admin.waitForTimeout(300);
await admin.screenshot({ path: `${OUT}/a3-questions.png`, fullPage: true });
await admin.click('[data-a=edit]'); await admin.waitForSelector('#qf');
await admin.screenshot({ path: `${OUT}/a4-editor.png` });
await admin.click('[data-x]');
await admin.click('[data-view=settings]'); await admin.waitForTimeout(300);
admin.once('dialog', d => d.accept());
await admin.click('[data-a=finish]');
await st.waitForSelector('text=הזוכים הגדולים');
await st.screenshot({ path: `${OUT}/p5-final.png`, fullPage: true });
await admin.click('[data-view=live]'); await admin.waitForTimeout(500);
await admin.screenshot({ path: `${OUT}/a5-final.png`, fullPage: true });
console.log('errors:', errors.filter(e => !/fonts\.g/.test(e)));
await browser.close();
