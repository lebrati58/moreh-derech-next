// Moreh Derech NEXT — synchronisation automatique du Drive de l'école → jeu.
// Lancé par .github/workflows/drive-sync.yml (déclenché par le cron du Worker Cloudflare, le bouton « סנכרן עכשיו »,
// ou le filet de sécurité planifié de GitHub). Utilisable aussi à la main :
//   node tools/drive-sync/run.mjs --action sync --mode tours --dry-run
// Actions : sync (analyse des documents nouveaux/modifiés) · publish (publie ce que l'admin a approuvé) · rollback (annule une synchronisation).
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { appendFileSync, existsSync } from 'node:fs';
import { getAccessToken, createDrive } from './google.mjs';
import { classify, inMode, tourIdFromPath } from './classify.mjs';
import { mergeFolders } from '../tours-registry.mjs';
import { extract, contentHash } from './extract.mjs';
import { analyze } from './claude.mjs';
import { validateQuestion, validateEvent, validateSite, prepareText, fingerprint, norm } from './validate.mjs';
import { applyItems, rollbackRun } from './integrate.mjs';
import { supabaseState, fileState } from './state.mjs';
import { buildReport } from './report.mjs';
import { MODE_BY_WEEKDAY, jerusalemParts, END_DATE } from '../../public/sync-schedule.js';

const ROOT = new URL('../../', import.meta.url);
const DEFAULT_ROOT_ID = '1S5xdXEF4K0AOihsIkxXsZdMngvrXLvdb';
// Première synchronisation : les documents antérieurs à l'audit du 28/10/2026 sont déjà couverts par la banque faite à la main.
const DEFAULT_BASELINE = '2026-10-29T00:00:00Z';
const MAX_ATTEMPTS = 3;

export function parseArgs(argv) {
  const a = { action: 'sync', mode: 'all', trigger: 'manual', runId: '', requestId: '', dryRun: false, maxFiles: 30, state: '' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--action') { a.action = v; i++; } else if (k === '--mode') { a.mode = v; i++; } else if (k === '--trigger') { a.trigger = v; i++; }
    else if (k === '--run-id') { a.runId = v || ''; i++; } else if (k === '--request-id') { a.requestId = v || ''; i++; }
    else if (k === '--max-files') { a.maxFiles = +v; i++; } else if (k === '--state') { a.state = v; i++; } else if (k === '--dry-run') a.dryRun = true;
  }
  if (!['sync', 'publish', 'rollback'].includes(a.action)) throw new Error('action inconnue');
  if (!['courses', 'tours', 'all'].includes(a.mode)) throw new Error('mode inconnu');
  return a;
}

async function publicConfig() {
  const js = await readFile(new URL('public/config.js', ROOT), 'utf8');
  return { url: /url:\s*'([^']+)'/.exec(js)[1], key: /anonKey:\s*'([^']+)'/.exec(js)[1] };
}

// Décide quels fichiers analyser. known : état mémorisé par fichier.
export function planFiles(files, known, { mode, maxFiles, baselineBefore }) {
  const plan = [], baseline = [], unchanged = [];
  let scanned = 0, isNew = 0, changed = 0;
  const firstRun = Object.keys(known).length === 0;
  for (const f of files) {
    const cls = classify(f);
    if (!inMode(cls, mode)) continue;
    scanned++;
    const k = known[f.id];
    if (!k) {
      if (firstRun && baselineBefore && f.modifiedTime < baselineBefore) { baseline.push({ f, cls }); continue; }
      isNew++; plan.push({ f, cls, reason: 'new' }); continue;
    }
    const same = (k.version && f.version && String(k.version) === String(f.version)) || (k.modified_time && Date.parse(k.modified_time) === Date.parse(f.modifiedTime));
    if (same && k.status !== 'error') { unchanged.push(f.id); continue; }
    if (k.status === 'error' && k.attempts >= MAX_ATTEMPTS && same) { unchanged.push(f.id); continue; }
    if (!same) changed++;
    plan.push({ f, cls, reason: same ? 'retry' : 'changed', attempts: k.status === 'error' ? k.attempts : 0, prevHash: k.content_hash });
  }
  plan.sort((a, b) => (b.f.modifiedTime || '').localeCompare(a.f.modifiedTime || ''));
  return { plan: plan.slice(0, maxFiles), deferred: Math.max(0, plan.length - maxFiles), baseline, unchanged, scanned, isNew, changed, firstRun };
}

function fileRow(f, cls, extra) {
  return { file_id: f.id, title: f.name, path: f.path.join(' / '), mime: f.mimeType, category: cls.category, tour_id: cls.tourId,
    modified_time: f.modifiedTime, version: f.version ? String(f.version) : null, ...extra };
}

// Transforme une analyse Claude en éléments validés (publiés / en attente / écartés).
export function buildItems(analysis, ctx) {
  const items = [], dropped = [];
  const prepared = prepareText(ctx.text || '');
  const base = { tour_id: ctx.tourId, file_id: ctx.fileId, source: ctx.source };
  const contradictedStops = (analysis.contradictions || []).map(c => c.topic);
  const vctx = { text: ctx.text || '', prepared, existing: ctx.existing, fingerprints: ctx.fingerprints, evidence: ctx.evidence, contradictedStops };
  for (const x of analysis.questions || []) {
    const v = validateQuestion(x, vctx);
    if (v.status === 'drop') { dropped.push({ q: x.q, why: v.reasons }); continue; }
    ctx.fingerprints.add(v.fingerprint);
    const open = x.type === 'open';
    items.push({ ...base, kind: open ? 'open_question' : 'question', status: v.status, reason: v.reasons.join(' · '), fingerprint: v.fingerprint,
      payload: open ? { level: x.level, type: 'open', stop: x.stop, q: x.q, answer: x.answer, points: x.points, e: x.e, quote: x.quote, i18n: x.i18n }
        : { level: x.level, type: x.type || 'mcq', stop: x.stop, q: x.q, a: x.a, e: x.e, quote: x.quote, i18n: x.i18n } });
  }
  for (const ev of analysis.events || []) {
    const v = validateEvent(ev, { text: ctx.text || '', prepared, periodIds: ctx.periodIds, existingEvents: ctx.events, evidence: ctx.evidence });
    if (v.status === 'drop' || ctx.fingerprints.has(v.fingerprint)) continue;
    ctx.fingerprints.add(v.fingerprint);
    items.push({ ...base, kind: 'event', status: v.status, reason: v.reasons.join(' · '), fingerprint: v.fingerprint,
      payload: { title: ev.title, year: ev.year, yearText: ev.yearText, period: ev.period, desc: ev.desc || '', quote: ev.quote } });
  }
  for (const s of analysis.sites || []) {
    const v = validateSite(s, { text: ctx.text || '', prepared, knownSites: ctx.knownSites, tourId: ctx.tourId });
    if (v.status === 'drop' || ctx.fingerprints.has(v.fingerprint)) continue;
    ctx.fingerprints.add(v.fingerprint); ctx.knownSites.push(s.name_he);
    items.push({ ...base, kind: 'site', status: v.status, reason: v.reasons.join(' · '), fingerprint: v.fingerprint,
      payload: { name_he: s.name_he, wiki_he: s.wiki_he || '', wiki_en: s.wiki_en || '', kind: s.kind, quote: s.quote, tourTitle: ctx.tourTitle, folderUrl: ctx.folderUrl } });
  }
  // Ce qui touche à l'existant n'est JAMAIS appliqué automatiquement.
  for (const c of analysis.corrections || []) items.push({ ...base, kind: 'correction', status: 'pending', reason: 'תיקון לשאלה קיימת — דורש אישור', fingerprint: fingerprint('corr|' + c.existing_id + '|' + c.issue), payload: c });
  for (const c of analysis.contradictions || []) items.push({ ...base, kind: 'contradiction', status: 'pending', reason: 'סתירה בין מקורות', fingerprint: fingerprint('contra|' + c.topic + '|' + c.claim_doc), payload: c });
  if (analysis.route && (analysis.route.stops || []).length >= 2) {
    items.push({ ...base, kind: 'route', status: 'pending', reason: 'סיפור דרך: טיוטה — בניית המסלול והצד בדרך דורשים בדיקה (content/tours/README.md)',
      fingerprint: fingerprint('route|' + ctx.fileId + '|' + (ctx.hash || '')), payload: analysis.route });
  }
  return { items, dropped };
}

function git(args, opts = {}) { return execFileSync('git', args, { cwd: new URL('.', ROOT).pathname, encoding: 'utf8', ...opts }).trim(); }
const DATA_PATHS = ['content/drive-questions/auto', 'public/guided-quiz.json', 'public/auto', 'public/history-events.json', 'public/siyurim-catalog.json', 'tools/places-sources.json', 'public/places.json', 'content/tours/registry.json'];

// Contrôles techniques avant publication : les tests de contenu du dépôt doivent passer.
function technicalChecks() {
  try {
    execFileSync('node', ['--test', '--test-concurrency=1', 'tests/history.test.mjs', 'tests/journey.test.mjs', 'tests/sync.test.mjs'],
      { cwd: new URL('.', ROOT).pathname, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true };
  } catch (e) { return { ok: false, out: String(e.stdout || e.message).split('\n').filter(l => /not ok|Error|✖/.test(l)).slice(0, 8).join('\n') }; }
}

// Annule les modifications de données non publiées (fichiers suivis remis à l'état de HEAD, nouveaux fichiers supprimés).
function revertData() {
  const tracked = DATA_PATHS.filter(p => git(['ls-files', '--', p]));
  if (tracked.length) git(['checkout', 'HEAD', '--', ...tracked]);
  git(['clean', '-fdq', '--', ...DATA_PATHS]);
}

function commitAndPush(message) {
  git(['add', '-A', '--', ...DATA_PATHS.filter(p => existsSync(new URL(p, ROOT)))]);
  if (!git(['diff', '--cached', '--name-only'])) return null;
  git(['-c', 'user.name=moreh-derech-sync[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', message]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try { git(['push', 'origin', 'HEAD:main']); return git(['rev-parse', 'HEAD']); }
    catch { git(['pull', '--rebase', 'origin', 'main']); }
  }
  throw new Error('push impossible');
}

function siteCoordinates() {
  try { execFileSync('node', ['tools/build-places.mjs'], { cwd: new URL('.', ROOT).pathname, stdio: 'pipe', timeout: 15 * 60e3 }); return null; }
  catch (e) { return 'מיקומים מוויקיפדיה: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 200); }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const a = parseArgs(argv);
  const now = new Date(), local = jerusalemParts(now);
  const state = env.SYNC_SECRET ? supabaseState({ ...(await publicConfig()), secret: env.SYNC_SECRET }) : fileState(a.state || new URL('.sync-state.json', ROOT).pathname);
  const cfg = await state.config();
  const out = { kind: a.action === 'sync' ? a.mode : a.action, dateLocal: `${local.date} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    dryRun: a.dryRun, docs_scanned: 0, docs_new: 0, docs_changed: 0, docs_analyzed: 0, questions_created: 0, open_created: 0, sites_added: 0,
    events_added: 0, questions_corrected: 0, contradictions: 0, pending_count: 0, byLevel: { 1: 0, 2: 0, 3: 0 }, docs: [], errors: [], newTours: [], audioOnly: 0 };

  // Gardes : pause, date de fin, filet de sécurité (ne refait pas une synchronisation déjà réussie aujourd'hui).
  if (a.trigger !== 'manual') {
    const end = String(cfg.end_date || END_DATE).slice(0, 10);
    if (local.date > end) return log({ skipped: 'after_end_date' });
    if (cfg.paused) return log({ skipped: 'paused' });
    if (a.trigger === 'fallback') {
      const mode = MODE_BY_WEEKDAY[local.weekday];
      if (!mode) return log({ skipped: 'not_a_sync_day' });
      a.mode = mode; out.kind = mode;
      const d = { mode };
      if ((cfg.last_success || {})[d.mode] === local.date) return log({ skipped: 'already_done_today' });
    }
  }

  const runId = await state.begin(out.kind, a.trigger === 'manual' && a.requestId ? 'manual' : a.trigger, a.dryRun, a.requestId || null, env.GITHUB_RUN_URL);
  try {
    if (a.action === 'rollback') {
      const removed = await rollbackRun(a.runId);
      const sha = a.dryRun ? null : commitAndPush(`data(sync): annulation de la synchronisation ${a.runId.slice(0, 8)} (${removed} éléments retirés)`);
      if (!a.dryRun) await state.rollback(a.runId, runId);
      out.summaryLine = `${removed} פריטים הוסרו`; out.commit = sha;
      out.errors = removed ? [] : ['לא נמצאו פריטים של העדכון הזה בקבצים'];
    } else if (a.action === 'publish') {
      await publishApproved(a, state, runId, out);
    } else {
      await syncDocuments(a, env, cfg, state, runId, out);
      // Les éléments approuvés depuis la dernière fois sont publiés avec la synchronisation (pas besoin d'y penser).
      await publishApproved(a, state, runId, out);
    }
    out.status = out.errors.length ? 'partial' : 'success';
  } catch (e) {
    out.status = 'failed'; out.errors.push(String(e.message || e));
  }
  out.report_he = buildReport(out);
  await state.finish(runId, { status: out.status, docs_scanned: out.docs_scanned, docs_new: out.docs_new, docs_changed: out.docs_changed,
    sites_added: out.sites_added, questions_created: out.questions_created + out.open_created, questions_corrected: out.questions_corrected,
    pending_count: out.pending_count, errors: out.errors, report_he: out.report_he, commit_sha: out.commit || null, branch: out.commit ? 'main' : null,
    summary: { byLevel: out.byLevel, events: out.events_added, open: out.open_created, contradictions: out.contradictions, deferred: out.deferred || 0 } });
  console.log(out.report_he);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, out.report_he + '\n');
  if (out.status === 'failed') process.exitCode = 1;
  return out;

  function log(x) { console.log('drive-sync:', JSON.stringify(x)); return x; }
}

// Publie ce que l'admin a approuvé dans sync.html.
async function publishApproved(a, state, runId, out) {
  if (a.dryRun) return;
  const ap = await state.approved();
  const items = ap.filter(i => ['question', 'open_question', 'event', 'site'].includes(i.kind));
  if (items.length) {
    const st = await applyItems(items.map(i => ({ ...i, source: (i.payload && i.payload.source) || null })), runId);
    out.questions_created += st.questions; out.open_created += st.open; out.events_added += st.events; out.sites_added += st.sites;
    if (st.sites) { const e = siteCoordinates(); if (e) out.errors.push(e); }
    const chk = technicalChecks();
    if (!chk.ok) {
      revertData();
      out.errors.push('בדיקה טכנית נכשלה — הפריטים שאושרו לא פורסמו: ' + chk.out); return;
    }
    out.commit = commitAndPush(`data(sync): publication de ${items.length} éléments validés par l'admin`) || out.commit;
    await state.mark(items.map(i => i.id), 'published', runId);
  }
  // Corrections / contradictions / itinéraires approuvés : notés comme traités (la correction se fait dans le fichier source).
  const others = ap.filter(i => !items.includes(i));
  if (others.length) await state.mark(others.map(i => i.id), 'published', runId);
}

async function syncDocuments(a, env, cfg, state, runId, out) {
  const local = jerusalemParts(new Date());
  const quiz = JSON.parse(await readFile(new URL('public/guided-quiz.json', ROOT), 'utf8'));
  const hist = JSON.parse(await readFile(new URL('public/history-events.json', ROOT), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('public/siyurim-catalog.json', ROOT), 'utf8'));
  const fps = new Set((await state.fingerprints()).map(x => x.split(':').pop()));
  quiz.questions.forEach(q => fps.add(fingerprint(q.question)));
  const knownSites = catalog.tours.flatMap(t => t.stops);

  const token = await getAccessToken(env);
  const drive = createDrive(token);
  const files = await drive.walk(env.DRIVE_ROOT_ID || DEFAULT_ROOT_ID);
  const known = await state.files();
  const P = planFiles(files, known, { mode: a.mode, maxFiles: a.maxFiles, baselineBefore: env.SYNC_BASELINE_BEFORE || DEFAULT_BASELINE });
  Object.assign(out, { docs_scanned: P.scanned, docs_new: P.isNew, docs_changed: P.changed, deferred: P.deferred });
  if (P.deferred) out.errors.push(`${P.deferred} מסמכים נוספים יטופלו בעדכון הבא (מגבלת ${a.maxFiles} מסמכים להרצה)`);
  if (P.baseline.length && !a.dryRun) {
    // Première synchronisation : on enregistre l'existant sans l'analyser (déjà couvert par la banque actuelle).
    await state.saveFiles(runId, P.baseline.map(({ f, cls }) => fileRow(f, cls, { status: 'skipped', outputs: { baseline: true } })));
    out.docs.push({ path: `קו בסיס: ${P.baseline.length} מסמכים קיימים נרשמו בלי ניתוח (כבר מכוסים בבנק השאלות)`, status: 'skipped' });
  }
  // Nouveaux dossiers de סיור → registre des parcours (statut « à importer », jamais plus loin).
  const tourFolders = (files.folders || []).filter(d => d.path.length === 2 && /^\s*2\.\s*סיורים/.test(d.path[0]));
  const folderUrl = Object.fromEntries(tourFolders.map(d => [tourIdFromPath(['', d.title, '']), 'https://drive.google.com/drive/folders/' + d.id]));
  if (a.mode !== 'courses') {
    const reg = JSON.parse(await readFile(new URL('content/tours/registry.json', ROOT), 'utf8'));
    const added = mergeFolders(reg, tourFolders, local.date).filter(t => t.id);
    out.newTours.push(...added.map(t => ({ id: t.id, title: t.title })));
    if (added.length && !a.dryRun) { reg.asOf = local.date; await writeFile(new URL('content/tours/registry.json', ROOT), JSON.stringify(reg, null, 1) + '\n'); }
  }

  const rows = [], allItems = [];
  for (const { f, cls, attempts = 0, prevHash } of P.plan) {
    const path = f.path.join(' / ');
    const doc = { path, status: 'processed' };
    try {
      const content = await extract(drive, f, cls);
      if (content.skip) {
        doc.status = 'skipped'; doc.skip = content.skip; if (content.skip === 'audio_without_transcript') out.audioOnly++;
        rows.push(fileRow(f, cls, { status: content.skip === 'audio_without_transcript' ? 'audio_only' : 'skipped' })); out.docs.push(doc); continue;
      }
      const hash = contentHash(content);
      if (hash && hash === prevHash) { rows.push(fileRow(f, cls, { status: 'processed', content_hash: hash })); doc.status = 'skipped'; doc.skip = 'unchanged'; out.docs.push(doc); continue; }
      const group = cls.tourId || (cls.category === 'courses' ? 'lessons' : null);
      const existing = quiz.questions.filter(q => group ? (q.tourId === group) : q.tourId === 'lessons').slice(-150);
      const ctx = {
        title: f.name, path, evidence: cls.evidence, category: cls.category, tourId: cls.tourId,
        periods: hist.periods.map(p => p.id),
        existingQuestions: existing.map(q => `${q.id} | ${q.question} | ${q.options[q.correct || 0]}`),
        existingEvents: hist.events.map(e => `${e.id} | ${e.title} | ${e.yearText || e.year}`),
        existingSites: cls.tourId ? ((catalog.tours.find(t => t.id === cls.tourId) || {}).stops || []) : []
      };
      const res = await analyze(ctx, content, { apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL || undefined });
      out.docs_analyzed++;
      if (res.analysis.usable === false) { doc.status = 'skipped'; doc.skip = 'not_usable'; rows.push(fileRow(f, cls, { status: 'skipped', content_hash: hash })); out.docs.push(doc); continue; }
      const key = 'd' + f.id.slice(0, 10);
      const source = { key, label: path, url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` };
      const { items } = buildItems(res.analysis, {
        text: content.text || '', fileId: f.id, tourId: cls.tourId, evidence: cls.evidence, source, hash,
        existing: quiz.questions, fingerprints: fps, periodIds: hist.periods.map(p => p.id), events: hist.events, knownSites,
        tourTitle: cls.tourId ? f.path[1] : null, folderUrl: folderUrl[cls.tourId] || null
      });
      if (content.pdfOnly && !content.text) doc.error = 'PDF סרוק — הציטוטים לא ניתנים לאימות, הכול ממתין לאישור';
      if (cfg.publish_mode === 'review') items.forEach(i => { if (i.status === 'published') { i.status = 'pending'; i.reason = 'מצב תצוגה מקדימה: כל פריט דורש אישור'; } });
      items.forEach(i => { i.payload.source = source; });
      allItems.push(...items);
      doc.questions = items.filter(i => i.kind === 'question' && i.status === 'published').length;
      doc.pending = items.filter(i => i.status === 'pending').length;
      rows.push(fileRow(f, cls, { status: 'processed', content_hash: hash, outputs: { items: items.length, model: res.model, truncated: res.truncated } }));
    } catch (e) {
      doc.status = 'error'; doc.error = String(e.message || e).slice(0, 200);
      rows.push(fileRow(f, cls, { status: 'error', attempts: attempts + 1, last_error: doc.error }));
      out.errors.push(`${path}: ${doc.error}`);
    }
    out.docs.push(doc);
  }

  const pub = allItems.filter(i => i.status === 'published');
  out.pending_count = allItems.filter(i => i.status === 'pending').length;
  out.questions_corrected = allItems.filter(i => i.kind === 'correction').length;
  out.contradictions = allItems.filter(i => i.kind === 'contradiction').length;
  pub.filter(i => i.kind === 'question').forEach(i => { out.byLevel[i.payload.level]++; });

  if (a.dryRun) {
    out.questions_created = pub.filter(i => i.kind === 'question').length; out.open_created = pub.filter(i => i.kind === 'open_question').length;
    out.sites_added = pub.filter(i => i.kind === 'site').length; out.events_added = pub.filter(i => i.kind === 'event').length;
    out.previewItems = allItems;
    return;
  }
  if (pub.length) {
    const st = await applyItems(pub, runId);
    Object.assign(out, { questions_created: st.questions, open_created: st.open, events_added: st.events, sites_added: st.sites });
    if (st.sites) { const e = siteCoordinates(); if (e) out.errors.push(e); }
    const chk = technicalChecks();
    if (!chk.ok) {
      // Rien n'est publié si les contrôles échouent : tout passe en attente, avec la raison.
      revertData();
      pub.forEach(i => { i.status = 'pending'; i.reason = 'בדיקה טכנית נכשלה'; });
      out.pending_count += pub.length; Object.assign(out, { questions_created: 0, open_created: 0, events_added: 0, sites_added: 0 });
      out.errors.push('בדיקה טכנית נכשלה — לא פורסם דבר: ' + chk.out);
    } else {
      out.commit = commitAndPush(`data(sync): ${out.kind} ${out.dateLocal.slice(0, 10)} — ${st.questions} questions, ${st.open} ouvertes, ${st.sites} sites, ${st.events} dates`);
    }
  }
  if (!pub.length && out.newTours.length && !out.commit) out.commit = commitAndPush(`data(sync): nouveaux dossiers de סיור (${out.newTours.map(t => t.id).join(', ')})`);
  await state.items(runId, allItems.map(({ source, ...i }) => i));
  await state.saveFiles(runId, rows);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
