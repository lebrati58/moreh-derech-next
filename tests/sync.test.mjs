// Synchronisation automatique du Drive : calendrier (heure d'été/hiver), classement, validation anti-invention,
// intégration réversible, Worker (cron + bouton admin). Aucun accès réseau : Drive, Claude et GitHub sont simulés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideScheduled, nextRuns, jerusalemParts } from '../public/sync-schedule.js';
import { classify, tourIdFromPath, inMode } from '../tools/drive-sync/classify.mjs';
import { quoteFound, prepareText, numbers, validateQuestion, validateEvent, validateSite, norm, fingerprint } from '../tools/drive-sync/validate.mjs';
import { buildItems, planFiles, parseArgs } from '../tools/drive-sync/run.mjs';
import { setRoot, applyItems, rollbackRun, rebuild } from '../tools/drive-sync/integrate.mjs';
import { buildReport } from '../tools/drive-sync/report.mjs';
import { serviceAccountAssertion } from '../tools/drive-sync/google.mjs';
import worker, { handleScheduled, handleSyncRequest } from '../src/worker.js';
import { generateKeyPairSync, createVerify } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);

test('calendrier : 08:00 à Jérusalem, l’été comme l’hiver, mardi = cours, vendredi = סיורים', () => {
  // Hiver (UTC+2) : 06:00 UTC = 08:00 ; 05:00 UTC = 07:00 → ignoré.
  assert.deepEqual([decideScheduled(new Date('2026-11-03T06:00:00Z')).run, decideScheduled(new Date('2026-11-03T06:00:00Z')).mode], [true, 'courses']);
  assert.equal(decideScheduled(new Date('2026-11-03T05:00:00Z')).reason, 'other_dst_slot');
  assert.equal(decideScheduled(new Date('2026-11-06T06:00:00Z')).mode, 'tours');
  // Été (UTC+3) : 05:00 UTC = 08:00.
  assert.equal(decideScheduled(new Date('2027-06-01T05:00:00Z')).mode, 'courses');
  assert.equal(decideScheduled(new Date('2027-06-01T06:00:00Z')).reason, 'other_dst_slot');
  // Semaine du passage à l'heure d'été en Israël (vendredi 26/03/2027, 02:00) : le vendredi même est déjà en été.
  assert.equal(jerusalemParts(new Date('2027-03-26T05:00:00Z')).hour, 8);
  assert.equal(decideScheduled(new Date('2027-03-26T05:00:00Z')).run, true);
  assert.equal(decideScheduled(new Date('2027-03-23T06:00:00Z')).run, true);
  // Autres jours : rien.
  assert.equal(decideScheduled(new Date('2026-11-02T06:00:00Z')).reason, 'not_sync_day');
  // Dernières synchronisations : vendredi 30/07/2027 oui, mardi 03/08/2027 non.
  assert.equal(decideScheduled(new Date('2027-07-30T05:00:00Z')).run, true);
  assert.equal(decideScheduled(new Date('2027-08-03T05:00:00Z')).reason, 'after_end_date');
  // Exactement une exécution par jour de synchronisation, sur toute l'année scolaire.
  let n = 0, perDay = {};
  for (let t = Date.parse('2026-11-01T00:00:00Z'); t < Date.parse('2027-08-10T00:00:00Z'); t += 3600e3) {
    const d = new Date(t);
    if ([5, 6].includes(d.getUTCHours()) && [2, 5].includes(d.getUTCDay())) { const r = decideScheduled(d); if (r.run) { n++; perDay[r.local.date] = (perDay[r.local.date] || 0) + 1; } }
  }
  assert.ok(Object.values(perDay).every(c => c === 1));
  assert.ok(n > 70 && n < 80, String(n));
  const nx = nextRuns(new Date('2026-11-01T09:00:00Z'), 2);
  assert.deepEqual(nx.map(x => [x.localDate, x.mode]), [['2026-11-03', 'courses'], ['2026-11-06', 'tours']]);
  assert.deepEqual(nextRuns(new Date('2027-07-31T09:00:00Z'), 2), []);
});

test('classement des fichiers du Drive', () => {
  const f = (path, mimeType = 'application/vnd.google-apps.document') => ({ name: path[path.length - 1], path, mimeType });
  const t = classify(f(['2. סיורים', 'סיור 05 - השפלה', 'בית גוברין']));
  assert.deepEqual([t.category, t.tourId, t.kind], ['tours', '05', 'gdoc']);
  assert.equal(classify(f(['2. סיורים', '23 – ים המלח', 'הקלטות', '1.mp3'], 'audio/mpeg')).kind, 'media');
  assert.equal(tourIdFromPath(['2. סיורים', '23 – ים המלח', 'הקלטות', '1.docx']), '23');
  assert.equal(tourIdFromPath(['2. סיורים', 'הקלטות', '1.docx']), null, 'un nom de fichier « 1.docx » n’est pas un numéro de סיור');
  const c = classify(f(['1. שיעורים', '8. בית שני- התקופה הרומית', 'שיעור 3.pdf'], 'application/pdf'));
  assert.deepEqual([c.category, c.kind, c.period], ['courses', 'pdf', '8. בית שני- התקופה הרומית']);
  assert.ok(inMode(c, 'courses') && !inMode(c, 'tours') && inMode(c, 'all'));
  assert.equal(classify(f(['2. סיורים', 'סיור 9', 'Copy of סיפור דרך הורחב ועובד'])).evidence, 'ai-edited');
});

const TEXT = 'בתל לכיש נמצאו מכתבי לכיש, 21 חרסים שנכתבו בשנת 588 לפנה״ס בערך, לפני החורבן. העיר נחרבה בידי נבוכדנצר מלך בבל. ' +
  'הסוללה האשורית נבנתה בשנת 701 לפנה"ס כשסנחריב מלך אשור צר על העיר. בית גוברין נקראה בתקופה הרומית אלותרופוליס.';

test('validation : citation vérifiée mot à mot, nombres présents dans le document, doublons écartés', () => {
  const P = prepareText(TEXT);
  assert.ok(quoteFound('הסוללה האשורית נבנתה בשנת 701 לפנה״ס', TEXT, P), 'guillemets hébreux différents tolérés');
  assert.ok(quoteFound('הַסּוֹלְלָה הָאַשּׁוּרִית נבנתה', TEXT, P), 'nikkud ignoré');
  assert.ok(!quoteFound('הסוללה נבנתה בידי הבבלים בשנת 586', TEXT, P), 'citation inventée refusée');
  assert.deepEqual(numbers('בשנת 1,517 ו-70 לספירה'), ['1517', '70']);
  const ctx = { text: TEXT, prepared: P, existing: [], fingerprints: new Set(), evidence: 'course-doc' };
  const good = { level: 2, type: 'mcq', stop: 'לכיש', q: 'מי צר על לכיש כשנבנתה הסוללה האשורית?', a: ['סנחריב', 'נבוכדנצר', 'שלמנאסר', 'טיגלת פלאסר'], e: 'הסוללה נבנתה בשנת 701 לפנה״ס.', quote: 'הסוללה האשורית נבנתה בשנת 701 לפנה"ס כשסנחריב מלך אשור צר על העיר' };
  assert.equal(validateQuestion(good, ctx).status, 'published');
  const badYear = { ...good, q: 'מתי נבנתה הסוללה?', a: ['720 לפנה״ס', '701', '586', '1000'], e: 'בשנת 720' };
  const r = validateQuestion(badYear, ctx);
  assert.equal(r.status, 'pending'); assert.match(r.reasons.join(), /720/);
  assert.equal(validateQuestion({ ...good, a: ['סנחריב', 'סנחריב', 'x', 'y'] }, ctx).status, 'drop');
  assert.equal(validateQuestion({ ...good, quote: 'סנחריב כבש את ירושלים בשנת 701' }, ctx).status, 'pending');
  assert.equal(validateQuestion(good, { ...ctx, evidence: 'ai-edited' }).status, 'pending', 'réécriture IA : jamais publiée sans validation');
  assert.equal(validateQuestion(good, { ...ctx, existing: [{ id: 'N05-2-01', question: 'מי צר על לכיש כשנבנתה הסוללה האשורית ?', options: ['סנחריב'], correct: 0 }] }).status, 'drop');
  const open = { level: 3, type: 'open', stop: 'לכיש', q: 'תארו את המצור על לכיש', answer: 'סנחריב בנה סוללה', points: ['סנחריב', 'סוללה'], e: 'x', quote: good.quote };
  assert.equal(validateQuestion(open, ctx).status, 'published');
  assert.equal(validateQuestion({ ...open, points: [] }, ctx).status, 'drop');
});

test('validation : dates de la frise et sites de la carte', () => {
  const P = prepareText(TEXT), periodIds = ['babylon', 'roman'];
  const ev = { title: 'מכתבי לכיש', year: -588, yearText: '588 לפנה״ס בערך', period: 'babylon', quote: 'מכתבי לכיש, 21 חרסים שנכתבו בשנת 588 לפנה״ס בערך' };
  assert.equal(validateEvent(ev, { text: TEXT, prepared: P, periodIds, existingEvents: [] }).status, 'published');
  assert.equal(validateEvent({ ...ev, year: -590, yearText: '590' }, { text: TEXT, prepared: P, periodIds, existingEvents: [] }).status, 'pending');
  assert.equal(validateEvent({ ...ev, year: 0 }, { text: TEXT, prepared: P, periodIds, existingEvents: [] }).status, 'drop');
  const contra = validateEvent(ev, { text: TEXT, prepared: P, periodIds, existingEvents: [{ id: 'lachish', title: 'מכתבי לכיש', year: -587 }] });
  assert.equal(contra.status, 'pending'); assert.match(contra.reasons.join(), /סתירה/);
  const site = { name_he: 'בית גוברין', wiki_he: 'בית גוברין', kind: 'archaeological', visited: true, quote: 'בית גוברין נקראה בתקופה הרומית אלותרופוליס' };
  assert.equal(validateSite(site, { text: TEXT, prepared: P, knownSites: [], tourId: '05' }).status, 'published');
  assert.equal(validateSite({ ...site, wiki_he: '' }, { text: TEXT, prepared: P, knownSites: [], tourId: '05' }).status, 'pending', 'pas de position sans article Wikipédia');
  assert.equal(validateSite(site, { text: TEXT, prepared: P, knownSites: ['בית גוברין'], tourId: '05' }).status, 'drop');
});

test('analyse → éléments : corrections, contradictions et itinéraires toujours en attente', () => {
  const analysis = {
    questions: [{ level: 1, type: 'mcq', stop: 'לכיש', q: 'מי החריב את לכיש?', a: ['נבוכדנצר', 'סנחריב', 'כורש', 'אלכסנדר'], e: 'נבוכדנצר מלך בבל.', quote: 'העיר נחרבה בידי נבוכדנצר מלך בבל' }],
    events: [], sites: [],
    corrections: [{ existing_id: 'N05-1-02', issue: 'שנה שגויה', quote: 'x y z' }],
    contradictions: [{ topic: 'מגדל', claim_doc: 'a', quote: 'a b c' }],
    route: { from: 'א', to: 'ב', stops: [{ name: 'א', side: 'right', quote: 'q' }, { name: 'ב', side: 'left', quote: 'q' }] }
  };
  const { items } = buildItems(analysis, { text: TEXT, fileId: 'f1', tourId: '05', evidence: 'course-doc', existing: [], fingerprints: new Set(), periodIds: [], events: [], knownSites: [] });
  const by = Object.fromEntries(items.map(i => [i.kind, i.status]));
  assert.deepEqual(by, { question: 'published', correction: 'pending', contradiction: 'pending', route: 'pending' });
});

test('planification : pas de réimport, reprise des erreurs, ligne de base de la première synchronisation', () => {
  const file = (id, modifiedTime, version, path = ['2. סיורים', 'סיור 05', id]) => ({ id, name: id, path, mimeType: 'application/vnd.google-apps.document', modifiedTime, version });
  const files = [file('old', '2026-10-01T00:00:00Z', '3'), file('new', '2026-10-30T00:00:00Z', '1'), file('lesson', '2026-10-30T00:00:00Z', '1', ['1. שיעורים', 'x', 'lesson'])];
  const first = planFiles(files, {}, { mode: 'tours', maxFiles: 30, baselineBefore: '2026-10-29T00:00:00Z' });
  assert.deepEqual([first.plan.map(p => p.f.id), first.baseline.map(b => b.f.id), first.scanned], [['new'], ['old'], 2]);
  const known = { old: { version: '3', status: 'skipped' }, new: { version: '1', status: 'processed' } };
  assert.equal(planFiles(files, known, { mode: 'tours', maxFiles: 30 }).plan.length, 0, 'rien de neuf');
  files[0].version = '4'; files[0].modifiedTime = '2026-11-02T00:00:00Z';
  const p2 = planFiles(files, known, { mode: 'tours', maxFiles: 30 });
  assert.deepEqual([p2.plan.map(p => p.reason), p2.changed], [['changed'], 1]);
  const p3 = planFiles(files, { ...known, old: { version: '4', status: 'error', attempts: 1 } }, { mode: 'tours', maxFiles: 30 });
  assert.deepEqual(p3.plan.map(p => p.reason), ['retry']);
  assert.equal(planFiles(files, { ...known, old: { version: '4', status: 'error', attempts: 3 } }, { mode: 'tours', maxFiles: 30 }).plan.length, 0, 'abandon après 3 essais');
  assert.equal(planFiles(files, {}, { mode: 'all', maxFiles: 1 }).deferred, 2);
  assert.throws(() => parseArgs(['--action', 'delete']));
});

async function sandbox() {
  const dir = await mkdtemp(join(tmpdir(), 'mdl-sync-'));
  for (const f of ['public/guided-quiz.json', 'public/history-events.json', 'public/siyurim-catalog.json', 'tools/places-sources.json', 'public/auto/open-questions.json']) {
    await mkdir(join(dir, f, '..'), { recursive: true }); await copyFile(new URL(f, ROOT), join(dir, f));
  }
  // Ajouts automatiques déjà publiés (le test doit passer aussi après de vraies synchronisations).
  await mkdir(join(dir, 'content/drive-questions/auto'), { recursive: true });
  for (const f of await readdir(new URL('content/drive-questions/auto/', ROOT)).catch(() => [])) await copyFile(new URL('content/drive-questions/auto/' + f, ROOT), join(dir, 'content/drive-questions/auto', f));
  setRoot('file://' + dir + '/');
  return dir;
}

test('intégration réversible : ajout dans la banque, la frise et la carte, puis annulation à l’identique', async () => {
  const dir = await sandbox();
  const orig = {};
  for (const f of ['public/guided-quiz.json', 'public/history-events.json', 'public/siyurim-catalog.json', 'tools/places-sources.json']) orig[f] = await readFile(join(dir, f), 'utf8');
  orig['public/auto/open-questions.json'] = await readFile(join(dir, 'public/auto/open-questions.json'), 'utf8').catch(() => null);
  if (orig['public/auto/open-questions.json'] === null) delete orig['public/auto/open-questions.json'];
  await rebuild();
  for (const f in orig) assert.equal(await readFile(join(dir, f), 'utf8'), orig[f], 'reconstruction sans changement : ' + f);
  const source = { key: 'dabc', label: '2. סיורים / סיור 05 / לכיש', url: 'https://drive.google.com/file/d/abc/view' };
  const q = { level: 2, type: 'mcq', stop: 'לכיש', q: 'מי צר על לכיש (בדיקה)?', a: ['סנחריב', 'נבוכדנצר', 'כורש', 'טיטוס'], e: 'הסבר', quote: 'ציטוט', i18n: { fr: { q: 'Qui a assiégé Lakish ?' } } };
  const items = [
    { kind: 'question', tour_id: '05', fingerprint: fingerprint(q.q), payload: { ...q, source }, source },
    { kind: 'question', tour_id: null, fingerprint: fingerprint('lesson q'), payload: { ...q, q: 'שאלה משיעור (בדיקה)?', source }, source },
    { kind: 'open_question', tour_id: '05', fingerprint: fingerprint('open'), payload: { level: 3, type: 'open', stop: 'לכיש', q: 'תארו', answer: 'ת', points: ['א', 'ב'], e: 'e', quote: 'q' }, source },
    { kind: 'event', tour_id: '05', fingerprint: fingerprint('ev'), payload: { title: 'מכתבי לכיש', year: -588, yearText: '588 לפנה״ס בערך', period: 'babylon', desc: 'חרסים', quote: 'q' }, source },
    { kind: 'site', tour_id: '05', fingerprint: fingerprint('site'), payload: { name_he: 'תל לכיש (בדיקה)', wiki_he: 'תל לכיש', wiki_en: 'Lachish', kind: 'archaeological', quote: 'q' }, source },
    { kind: 'site', tour_id: '59', fingerprint: fingerprint('site59'), payload: { name_he: 'מצדה (בדיקה)', wiki_he: 'מצדה', kind: 'archaeological', quote: 'q', tourTitle: 'סיור 59 – בדיקה' }, source }
  ];
  const st = await applyItems(items, 'run-1');
  assert.deepEqual([st.questions, st.open, st.events, st.sites, st.tours], [2, 1, 1, 2, 1]);
  const quiz = JSON.parse(await readFile(join(dir, 'public/guided-quiz.json'), 'utf8'));
  const before = new Set(JSON.parse(orig['public/guided-quiz.json']).questions.map(x => x.id));
  const auto = quiz.questions.filter(x => x.auto && !before.has(x.id));
  assert.deepEqual(auto.map(x => x.tourId).sort(), ['05', 'lessons']);
  assert.ok(auto.every(x => x.options.length === 4 && x.correct === 0 && x.sourceUrl === source.url && /^A(05|lessons)-[0-9a-f]{10}$/.test(x.id)));
  assert.equal(quiz.questions.length, JSON.parse(orig['public/guided-quiz.json']).questions.length + 2);
  const hist = JSON.parse(await readFile(join(dir, 'public/history-events.json'), 'utf8'));
  const ev = hist.events.find(e => e.auto && e.title === 'מכתבי לכיש');
  assert.ok(ev && ev.certainty === 'approx' && ev.examReady === false && /\?$/.test(ev.q));
  for (let i = 1; i < hist.events.length; i++) assert.ok(hist.events[i].year >= hist.events[i - 1].year);
  const cat = JSON.parse(await readFile(join(dir, 'public/siyurim-catalog.json'), 'utf8'));
  assert.ok(cat.tours.find(t => t.id === '05').stops.includes('תל לכיש (בדיקה)'));
  assert.ok(cat.tours.find(t => t.id === '59' && t.auto), 'nouveau סיור créé dans le catalogue');
  const src = JSON.parse(await readFile(join(dir, 'tools/places-sources.json'), 'utf8'));
  assert.deepEqual(src.tours['05'].stops['תל לכיש (בדיקה)'], ['he:תל לכיש', 'en:Lachish'], 'aucune coordonnée : seulement des titres Wikipédia');
  const open = JSON.parse(await readFile(join(dir, 'public/auto/open-questions.json'), 'utf8'));
  assert.equal(open.questions.length, JSON.parse(orig['public/auto/open-questions.json'] || '{"questions":[]}').questions.length + 1);
  // Ré-appliquer les mêmes éléments ne crée pas de doublon.
  assert.equal((await applyItems(items, 'run-2')).questions, 0);
  // Annulation : retour exact aux fichiers d'origine.
  assert.equal(await rollbackRun('run-1'), 6);
  const strip = (f, t) => f.endsWith('guided-quiz.json') ? t.replace(/"version": "[^"]*"/, '') : t;   // seule la version change
  for (const f in orig) assert.equal(strip(f, await readFile(join(dir, f), 'utf8')), strip(f, orig[f]), 'annulation exacte : ' + f);
  setRoot(ROOT);
});

test('rapport en hébreu', () => {
  const r = buildReport({ kind: 'tours', dateLocal: '2026-11-06 08:03', docs_scanned: 40, docs_new: 3, docs_changed: 1, docs_analyzed: 4, questions_created: 21, open_created: 3,
    sites_added: 2, events_added: 0, questions_corrected: 1, contradictions: 1, pending_count: 5, byLevel: { 1: 7, 2: 7, 3: 7 },
    docs: [{ path: 'סיור 23 / סיכום', status: 'processed', questions: 21, pending: 5 }, { path: 'הקלטות/1.mp3', status: 'skipped', skip: 'audio_without_transcript' }], errors: [], newTours: [{ id: '23', title: 'ים המלח' }], audioOnly: 1 });
  assert.match(r, /דוח עדכון — יום שישי/); assert.match(r, /שאלות חדשות שפורסמו: 21/); assert.match(r, /הקלטה ללא תמלול/); assert.match(r, /סיור 23/);
});

test('Google : jeton de compte de service signé RS256', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = serviceAccountAssertion({ client_email: 'bot@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, 1000);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/drive.readonly', 'lecture seule');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(createVerify('RSA-SHA256').update(h + '.' + c).verify(publicKey, Buffer.from(s, 'base64url')));
});

test('Worker : le cron ne lance qu’à 08:00 locale ; le bouton exige un admin ; le site statique est inchangé', async () => {
  const calls = [];
  const env = { GITHUB_TOKEN: 'ghp_x', GITHUB_REPO: 'lebrati58/moreh-derech-next', SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'sb_publishable_x', SYNC_END_DATE: '2027-07-31' };
  const fake = async (url, init) => {
    calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
    if (url.includes('/rpc/admin_sync_request')) {
      const b = JSON.parse(init.body);
      return b.p_token === 'good-admin-token' ? new Response(JSON.stringify({ id: '0f0f0f0f-0000-4000-8000-000000000001' }), { status: 200 })
        : new Response(JSON.stringify({ message: 'not_authorized' }), { status: 401 });
    }
    if (url.includes('api.github.com')) return new Response(null, { status: 204 });
    throw new Error('unexpected ' + url);
  };
  assert.equal((await handleScheduled(Date.parse('2026-11-03T05:00:00Z'), env, fake)).run, false);
  assert.equal(calls.length, 0);
  assert.equal((await handleScheduled(Date.parse('2026-11-03T06:00:00Z'), env, fake)).mode, 'courses');
  assert.deepEqual(calls[0].body, { ref: 'main', inputs: { action: 'sync', mode: 'courses', trigger: 'cron', run_id: '', request_id: '' } });
  assert.match(calls[0].url, /actions\/workflows\/drive-sync\.yml\/dispatches$/);
  const post = (body, origin = 'https://moreh-derech-next.lebrati.workers.dev') => new Request('https://moreh-derech-next.lebrati.workers.dev/api/sync/request', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await handleSyncRequest(post({ token: 'wrong-token-123', action: 'sync' }), env, fake)).status, 401);
  assert.equal((await handleSyncRequest(post({ token: 'good-admin-token', action: 'sync' }, 'https://evil.example'), env, fake)).status, 403);
  const ok = await handleSyncRequest(post({ token: 'good-admin-token', action: 'sync', mode: 'tours' }), env, fake);
  assert.equal(ok.status, 200);
  assert.deepEqual(calls.at(-1).body.inputs, { action: 'sync', mode: 'tours', trigger: 'manual', run_id: '', request_id: '0f0f0f0f-0000-4000-8000-000000000001' });
  assert.ok(!JSON.stringify(await ok.json()).includes('ghp_'), 'le jeton GitHub ne sort jamais');
  assert.equal((await handleSyncRequest(post({ token: 'good-admin-token', action: 'rollback' }), env, fake)).status, 400);
  const res = await worker.fetch(new Request('https://x/index.html'), { ...env, ASSETS: { fetch: () => new Response('static') } });
  assert.equal(await res.text(), 'static');
  const wr = await readFile(new URL('wrangler.jsonc', ROOT), 'utf8');
  assert.match(wr, /"0 5 \* \* 2,5", "0 6 \* \* 2,5"/);
  assert.match(wr, /"run_worker_first": \["\/api\/\*"\]/);
});
