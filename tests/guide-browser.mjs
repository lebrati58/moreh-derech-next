// Le guide Lionel sur un S24 : prénom à la 1re visite (gardé localement, jamais envoyé), accueil personnalisé à chaque ouverture,
// pas de répétition dans la même session, case « לא להציג שוב », relance par le bouton en bas de l’accueil.
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = new URL('../public/', import.meta.url).pathname, OUT = process.argv[2] || 'screens-guide'; await (await import('node:fs/promises')).mkdir(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const srv = createServer(async (q, r) => { const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html'; try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const br = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await br.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
await ctx.route(/supabase|tile/, r => r.abort());
await ctx.addInitScript(() => { try { localStorage.setItem('mdl_guide_test', '1'); } catch (e) {} });
const errs = []; let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { bad++; console.log('❌', m); } };
const page = async () => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); await pg.goto(base + 'index.html'); await pg.waitForTimeout(1600); return pg; };
// 1) première fois
let pg = await page();
check(await pg.isVisible('#obName'), '1re visite : Lionel demande le prénom');
await pg.screenshot({ path: OUT + '/p1-prenom.png' });
await pg.fill('#obName', 'נועה'); await pg.click('#obNext'); await pg.waitForTimeout(600);
const t2 = await pg.textContent('#obT'); check(t2.startsWith('נועה,'), 'étape 2 personnalisée : « ' + t2 + ' »');
check(await pg.evaluate(() => localStorage.getItem('mdl_guide_name')) === 'נועה', 'prénom gardé dans le téléphone');
check(await pg.evaluate(() => !JSON.stringify(JSON.parse(localStorage.getItem('mdl_player_v1') || '{}')).includes('נועה')), 'prénom PAS copié dans le profil envoyé au classement');
// visite complète : 14 étapes, chaque étape ciblée trouve son bloc sur l'accueil (projecteur visible)
const N = await pg.locator('#obDots i').count(); check(N === 14, 'visite : 14 étapes (nouveautés incluses)');
for (let k = 1; k < N; k++) {
  const spotOn = await pg.isVisible('.ob-spot'), last = k === N - 1;
  check(last ? !spotOn : spotOn, 'étape ' + (k + 1) + ' : ' + (await pg.textContent('#obT')) + (last ? ' (bulle centrée)' : ' (bloc ciblé)'));
  if ([3, 7, 8, 10].includes(k)) await pg.screenshot({ path: OUT + '/p1-etape' + (k + 1) + '.png' });
  await pg.click('#obNext'); await pg.waitForTimeout(450); if (!(await pg.$('#obNext'))) break;
}
await pg.close();
// 2) ouverture suivante (nouvelle session)
pg = await page();
const hi = await pg.textContent('#obT').catch(() => ''); check(/נועה/.test(hi) && !(await pg.$('#obName')), 'ouverture suivante : accueil personnalisé « ' + hi + ' »');
check(await pg.isVisible('#obMain') && await pg.isVisible('#obTour'), 'boutons : action du jour + visite guidée');
await pg.screenshot({ path: OUT + '/p2-accueil.png' });
// même session : pas de nouvel affichage en revenant à l'accueil
await pg.click('.ob-x'); await pg.goto(base + 'index.html'); await pg.waitForTimeout(1500);
check(!(await pg.$('.ob-card')), 'même session : ne réapparaît pas en revenant à l’accueil');
await pg.close();
// 3) case « ne plus afficher »
pg = await page(); await pg.check('#obNever'); await pg.click('.ob-x'); await pg.close();
pg = await page(); check(!(await pg.$('.ob-card')), '« לא להציג שוב » : plus d’affichage automatique');
check(await pg.isVisible('#obReplay'), 'le bouton en bas de l’accueil le relance quand même');
await pg.click('#obReplay'); await pg.waitForTimeout(600); check(await pg.isVisible('.ob-card'), 'visite relancée à la demande');
await pg.close();
console.log(errs.length ? errs.join('\n') : 'aucune erreur', ok, 'ok', bad, 'ko'); await br.close(); srv.close(); process.exit(bad || errs.length ? 1 : 0);
