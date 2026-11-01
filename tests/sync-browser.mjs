// Page « עדכונים אוטומטיים » (sync.html) et « שאלות פתוחות » (open.html) sur téléphone (Galaxy S24) et ordinateur.
// Prérequis : Postgres local avec install.sql + auto_sync.sql (base mdl_dev), comme les autres tests navigateur.
// Usage : node tests/sync-browser.mjs [dossier-captures]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';

const OUT = process.argv[2] || 'screens-sync';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const PORT = 8799, DB = process.env.MDL_DB || 'mdl_dev';
await mkdir(OUT, { recursive: true });
const db = new pg.Client({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: DB });
await db.connect();
// Données de démonstration : un secret connu, une synchronisation, des éléments en attente.
await db.query(`delete from mdl.sync_items; delete from mdl.sync_runs; delete from mdl.sync_requests; delete from mdl.sync_files`);
await db.query(`select mdl.set_admin_password('test-password-1')`);
await db.query(`update mdl.sync_config set secret_hash = encode(sha256(convert_to('test-secret','UTF8')),'hex'), paused = false, publish_mode = 'auto'`);
const run = (await db.query(`select public.sync_bot_begin('test-secret','tours','cron',false,null,'https://github.com/x/actions/runs/1')->>'id' id`)).rows[0].id;
await db.query(`select public.sync_bot_items('test-secret', $1, $2)`, [run, JSON.stringify([
  { kind: 'question', status: 'pending', tour_id: '23', fingerprint: 'b1', reason: 'הציטוט לא נמצא במסמך',
    payload: { level: 2, type: 'mcq', stop: 'מצדה', q: 'מי בנה את הארמון הצפוני במצדה?', a: ['הורדוס', 'יונתן הכהן', 'אלעזר בן יאיר', 'סילבה'], e: 'הורדוס בנה את ארמון שלוש המדרגות.', quote: 'הורדוס בנה ארמון תלוי', source: { label: '2. סיורים / סיור 23 / סיכום', url: 'https://drive.google.com/file/d/x/view' } } },
  { kind: 'contradiction', status: 'pending', tour_id: '23', fingerprint: 'b2', reason: 'סתירה בין מקורות', payload: { topic: 'נפילת מצדה', claim_doc: '73 לספירה', claim_existing: '74 לספירה', quote: 'בשנת 73' } },
  { kind: 'site', status: 'published', tour_id: '23', fingerprint: 'b3', payload: { name_he: 'מצדה', wiki_he: 'מצדה', kind: 'archaeological', quote: 'q' } }
])]);
await db.query(`select public.sync_bot_finish('test-secret', $1, $2)`, [run, JSON.stringify({ status: 'partial', docs_scanned: 412, docs_new: 3, docs_changed: 1, sites_added: 1, questions_created: 21, pending_count: 2,
  errors: ['2. סיורים / סיור 23 / הקלטות / 4.mp3: הקלטה ללא תמלול'], report_he: '# דוח עדכון — יום שישי (סיורים)\n2026-10-30 08:02\n\n📄 מסמכים שנסרקו: 412 · חדשים: 3', commit_sha: 'abcdef1234' })]);

const server = spawn('node', ['tests/dev-server.mjs', String(PORT), DB], { stdio: 'pipe' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--no-zygote'] });
let ok = 0, fail = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { fail++; console.log('❌', m); } };
try {
  for (const [name, vp] of [['s24', { width: 360, height: 780 }], ['desktop', { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: name === 's24' ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/sync.html`);
    await page.fill('#pw', 'test-password-1'); await page.click('#lf button');
    await page.waitForSelector('text=ממתינים לאישור');
    const body = await page.innerText('#app');
    check(/הצליח חלקית/.test(body), `${name}: dernière synchronisation affichée avec son statut`);
    check(/הסנכרון הבא/.test(body) && /עדכון (שיעורים|סיורים)/.test(body), `${name}: prochaine synchronisation calculée`);
    check(/מי בנה את הארמון הצפוני/.test(body) && /הציטוט לא נמצא/.test(body), `${name}: question en attente avec la raison`);
    check(/נפילת מצדה/.test(body), `${name}: contradiction en attente`);
    check(/שלב הגדרה/.test(body) === false, `${name}: pas d’étape de configuration une fois le secret créé`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: pas de défilement horizontal`);
    await page.click('[data-rep]'); await page.waitForSelector('pre.rep');
    check(/דוח עדכון — יום שישי/.test(await page.textContent('pre.rep')), `${name}: rapport hébreu ouvert`);
    check(await page.isVisible('[data-undo]'), `${name}: bouton d’annulation disponible`);
    await page.screenshot({ path: `${OUT}/sync-${name}.png`, fullPage: true });
    if (name === 's24') {
      await page.check('input[data-sel]'); await page.click('[data-dec="approved"]');
      await page.waitForSelector('#publish');
      check(/פרסם 1 פריטים שאושרו/.test(await page.textContent('#publish')), 's24: approbation → bouton de publication');
      await page.click('#syncNow');
      const t = await page.waitForSelector('.toast:has-text("Cloudflare")', { timeout: 5000 }).catch(() => null);
      check(!!t, 's24: hors Cloudflare, le bouton explique où il fonctionne');
      await page.check('#paused'); await page.waitForTimeout(600);
      check((await db.query('select paused from mdl.sync_config')).rows[0].paused === true, 's24: pause enregistrée');
      await page.waitForSelector('text=מושהה');
      check(true, 's24: prochaine synchronisation « מושהה »');
      await page.uncheck('#paused'); await page.waitForTimeout(600);
    }
    check(!errors.length, `${name}: aucune erreur JS ${errors.join(' | ')}`);
    const p2 = await browser.newPage({ viewport: vp });
    const e2 = []; p2.on('pageerror', e => e2.push(String(e)));
    await p2.route('**/auto/open-questions.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ questions: [
      { id: 'O-1', tourId: '23', level: 3, stop: 'מצדה', question: 'תארו את מערך המצור הרומי על מצדה.', answer: 'מחנות, חומת מצור וסוללה.', points: ['שמונה מחנות', 'חומת מצור', 'הסוללה במערב'], explanation: 'x', sourceUrl: 'https://drive.google.com/file/d/x/view', sourceDoc: 'סיור 23' }] }) }));
    await p2.goto(`http://localhost:${PORT}/open.html`);
    await p2.waitForSelector('#show'); await p2.fill('#ans', 'סוללה וחומה'); await p2.click('#show');
    await p2.check('#key input[data-k="1"]'); await p2.check('#key input[data-k="2"]'); await p2.click('#next');
    await p2.waitForSelector('.score');
    check(/0\.7 \/ 1/.test(await p2.textContent('.score')), `${name}: questions ouvertes — auto-évaluation par points clés (2/3)`);
    await p2.screenshot({ path: `${OUT}/open-${name}.png`, fullPage: true });
    check(!e2.length, `${name}: open.html sans erreur ${e2.join(' | ')}`);
  }
} finally {
  await browser.close(); server.kill(); await db.end();
}
console.log(`\n${ok} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
