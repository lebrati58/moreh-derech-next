// Parcours « סיפור דרך » : conversion de la route 67 (référence), pilote 01, garde-fous de publication,
// moteur (examen, score, chrono), registre des 23 סיורים, lecteur de transcriptions ivrit.ai, points centraux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import vm from 'node:vm';
import { parseDocx, mainSpeaker } from '../tools/parse-ivrit-docx.mjs';
import { mergeFolders } from '../tools/tours-registry.mjs';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const json = async p => JSON.parse(await read(p));
async function umd(file, name) { const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number }; vm.createContext(ctx); vm.runInContext(await read(file), ctx); return ctx.self[name]; }
const E = await umd('public/tour-engine.js', 'MDTourEngine');
const G = await umd('public/gps-engine.js', 'MDL_GPS');

test('route 67 (référence) : convertie sans perte, valide et publiée', async () => {
  const t = await json('public/tours/road67.json'), bank = await json('content/v3/road67_questions.json'), route = await json('public/v3/road67-route.json');
  assert.equal(t.stops.length, route.stops.length);
  assert.equal(t.questions.length, bank.questions.length);
  assert.deepEqual([...E.validate(t).errors], []);
  assert.equal(E.publishable(t), true);
  t.questions.forEach(q => { assert.ok(q.sources.length); assert.equal(q.options.length, 4); });
  // les ancres de la route 67 sont SUR la chaussée : aucun côté calculé à partir d'elles (pas de fausse alerte)
  assert.ok(t.stops.every(s => !s.side || s.side.computed === null));
  // l'ordre des lieux suit le trajet
  for (let i = 1; i < t.stops.length; i++) assert.ok(t.stops[i].s >= t.stops[i - 1].s);
});

test('pilote 01 : chaque question cite l’enregistrement du prof ; brouillon jamais publiable sans coordonnées', async () => {
  const src = await json('content/tours/01.src.json'), t = await json('public/tours/01.json');
  assert.equal(src.status, 'a_verifier'); assert.equal(src.published, false);
  assert.equal(src.transcript.kind, 'verbatim');
  const stops = new Set(src.stops.map(s => s.id));
  src.questions.forEach(q => {
    assert.ok(stops.has(q.stop), q.id);
    assert.ok(q.sources.some(x => x.kind === 'transcript' && x.quote && x.quote.length > 15), q.id + ' : citation');
    assert.ok(E.CERTAINTY.includes(q.certainty));
    assert.equal(new Set(q.options).size, q.options.length, q.id);
  });
  // aucune coordonnée tapée à la main : seulement des titres Wikipédia à résoudre
  src.stops.forEach(s => { assert.ok(!('coord' in s) && !('lat' in s)); assert.ok(s.wiki.length && s.wiki.every(w => /^(he|en):/.test(w))); });
  assert.equal(E.publishable(t), false);
  // les sources « transcript » reçoivent le titre et le lien du document Drive
  assert.ok(t.questions.filter(q => q.id.startsWith('01-')).every(q => q.sources.filter(x => x.kind === 'transcript').every(x => /^https:\/\/docs\.google\.com\//.test(x.url))));
  // questions de côté : générées seulement là où le prof a dit « ימינה / שמאלה »
  const sideQs = t.questions.filter(q => q.type === 'side');
  assert.equal(sideQs.length, src.stops.filter(s => s.sideTeacher && s.sideQuote).length);
  sideQs.forEach(q => assert.ok(q.sources[0].quote));
});

test('publication : jamais automatique si une donnée importante est incertaine', async () => {
  const t = JSON.parse(JSON.stringify(await json('public/tours/road67.json')));
  assert.equal(E.publishable(t), true);
  t.published = false; assert.equal(E.publishable(t), false, 'il faut published: true');
  t.published = true; t.status = 'a_verifier'; assert.equal(E.publishable(t), false, 'il faut le statut pret');
  t.status = 'pret'; delete t.stops[0].coord; assert.equal(E.publishable(t), false, 'lieu sans coordonnées');
  const t2 = JSON.parse(JSON.stringify(await json('public/tours/road67.json'))); t2.questions[0].sources = []; assert.equal(E.publishable(t2), false, 'question sans source');
  const t3 = JSON.parse(JSON.stringify(await json('public/tours/road67.json'))); t3.questions[0].correct = 7; assert.equal(E.publishable(t3), false, 'bonne réponse invalide');
  const t4 = JSON.parse(JSON.stringify(await json('public/tours/road67.json'))); t4.questions[0].sources = [{ kind: 'transcript' }]; assert.ok(E.validate(t4).errors.some(e => /citation/.test(e)), 'citation obligatoire');
});

test('examen : sans anecdotes ni points à vérifier ni côtés non confirmés ; ordre du trajet', async () => {
  const t = await json('public/tours/01.json');
  const ex = E.questionsFor(t, 'exam'), study = E.questionsFor(t, 'study');
  assert.equal(study.length, t.questions.length);
  assert.ok(ex.length < study.length);
  assert.ok(ex.every(q => q.certainty === 'firm' || q.certainty === 'approx'));
  assert.ok(!ex.some(q => q.id === '01-command' || q.id === '01-benzion' || q.id === '01-french'));
  assert.ok(!ex.some(q => q.type === 'side'), 'pas de côté confirmé par la carte tant que le tracé manque');
  const order = t.stops.map(s => s.id);
  for (let i = 1; i < study.length; i++) assert.ok(order.indexOf(study[i].stop) >= order.indexOf(study[i - 1].stop));
});

test('score, chronomètre avec pause, résultat et correction', async () => {
  assert.equal(E.scoreAnswer(true, 30000, 0), 190); assert.equal(E.scoreAnswer(true, 1, 9), 203); assert.equal(E.scoreAnswer(false, 30000, 5), 0);
  assert.equal(E.scoreAnswer(true, 30000, 50), E.MAX_POINTS);
  let now = 0; const T = new E.Timer(30000, () => now); T.start(); now = 10000; T.pause(); now = 99999; assert.equal(T.remaining(), 20000); T.start(); now += 20001; assert.ok(T.expired());
  const t = await json('public/tours/road67.json');
  const run = { runId: 'r1', mode: 'exam', activeMs: 1234.4, answers: [{ questionId: t.questions[0].id, stop: t.questions[0].stop, chosen: 1, correct: false, points: 0, msUsed: 5000 }, { questionId: t.questions[1].id, stop: t.questions[1].stop, chosen: t.questions[1].correct, correct: true, points: 180, msUsed: 3000 }] };
  const r = E.result(t, run);
  assert.equal(r.kind, 'tour'); assert.equal(r.tourId, 'road67'); assert.equal(r.score, 180); assert.equal(r.correct, 1); assert.equal(r.total, 2); assert.equal(r.durationMs, 1234);
  const c = E.correction(t, run);
  assert.equal(c[0].expected, t.questions[0].options[t.questions[0].correct]);
  assert.ok(c[0].sources.length && c[0].explanation);
});

test('côté calculé sur le tracé : un lieu à l’est d’une route vers le nord est « à droite »', async () => {
  const P = G.prepare({ geometry: [[32.0, 35.0], [32.1, 35.0]] });
  assert.equal(G.locate(P, [32.05, 35.01]).side, 'right');
  assert.equal(G.locate(P, [32.05, 34.99]).side, 'left');
});

test('registre : 23 סיורים + route 67, statuts valides, nouveau dossier → « à importer » (jamais « prêt »)', async () => {
  const reg = await json('content/tours/registry.json');
  assert.equal(reg.tours.length, 24);
  assert.deepEqual(reg.tours.map(t => t.id), ['road67', ...Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(2, '0'))]);
  reg.tours.forEach(t => assert.ok(E.STATUSES.includes(t.status), t.id));
  assert.deepEqual(reg.tours.filter(t => t.status === 'pret').map(t => t.id), ['road67']);
  assert.equal(reg.tours.find(t => t.id === '23').status, 'a_importer');
  // transcriptions classées : une réécriture IA n'est jamais comptée comme « ce qu'a dit le prof »
  reg.tours.forEach(t => (t.transcripts || []).forEach(x => assert.ok(Object.keys(reg.transcriptKinds).includes(x.kind), t.id + ' ' + x.kind)));
  const copy = JSON.parse(JSON.stringify(reg));
  const added = mergeFolders(copy, [
    { id: '1vhraDtYeTiLNzcdaKBa2kMsTmlImnaQh', title: 'סיור 23 - ישובי עמק הירדן', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'NEWFOLDERID000000000000000', title: 'סיור 24 - נגב מערבי', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'x', title: 'משהו אחר.pdf', mimeType: 'application/pdf' }], '2026-11-01');
  assert.equal(added.length, 1); assert.equal(added[0].id, '24'); assert.equal(added[0].status, 'a_importer');
  assert.equal(copy.tours.length, 25);
});

// ---- ivrit.ai : un .docx dont le texte est dans word/afchunk.mht (HTML quoted-printable) ----
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), d = Buffer.from(data), crc = crc32(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(10, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(10, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, n, d); central.push(c, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length / 2, 8); e.writeUInt16LE(central.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const qp = s => [...Buffer.from(s, 'utf8')].map(b => (b === 61 ? '=3D' : String.fromCharCode(b))).join('');
test('transcriptions ivrit.ai : texte lu dans afchunk.mht, locuteurs, locuteur principal', () => {
  const html = `<html><body><p><span style="color:#000000; font-weight:700">דובר 0: </span>אנחנו נוסעים בכביש 443, תסתכלו ימינה.</p><p><span style="color:#2196F3; font-weight:700">דובר 1: </span>רואים?</p><p><span style="color:#000000; font-weight:700">דובר 0: </span>זה מעלה בית חורון &amp; כפל השכבות.</p><p style="color:#666">תומלל באמצעות שירות התמלול של ivrit.ai</p></body></html>`;
  const mht = `MIME-Version: 1.0\nContent-Type: multipart/related;\n    boundary="----=mhtDocumentPart"\n\n\n------=mhtDocumentPart\nContent-Type: text/html;\n    charset="utf-8"\nContent-Transfer-Encoding: quoted-printable\n\n${qp(html)}\n\n------=mhtDocumentPart--\n`;
  const buf = zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document><w:body><w:altChunk r:id="htmlChunk"/></w:body></w:document>', 'word/afchunk.mht': Buffer.from(mht, 'latin1') });
  const r = parseDocx(buf);
  assert.equal(r.source, 'ivrit-mht');
  assert.equal(r.paragraphs.length, 3);
  assert.deepEqual({ ...r.paragraphs[0] }, { speaker: 'דובר 0', text: 'אנחנו נוסעים בכביש 443, תסתכלו ימינה.' });
  assert.equal(r.paragraphs[2].text, 'זה מעלה בית חורון & כפל השכבות.');
  assert.match(r.note, /ivrit\.ai/);
  assert.equal(mainSpeaker(r.paragraphs), 'דובר 0');
  const w = parseDocx(zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>שלום</w:t></w:r><w:r><w:t xml:space="preserve"> עולם</w:t></w:r></w:p></w:body></w:document>' }));
  assert.equal(w.source, 'word'); assert.equal(w.paragraphs[0].text, 'שלום עולם');
});

test('points centraux : meilleur score d’examen par question, brouillon jamais compté, anti-doublon', async () => {
  const store = new Map(), window = {};
  const ctx = { window, Date, Math, JSON, Object, Array, Set, String, Number, setTimeout: () => 0, clearTimeout() {}, crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }, fetch: async () => { throw new Error('offline'); }, document: {} };
  vm.createContext(ctx); vm.runInContext(await read('public/progress.js'), ctx);
  const P = window.MDProgress;
  const rec = (runId, mode, pts, tourId = 'road67') => ({ version: 1, kind: 'tour', tourId, runId, mode, score: pts, correct: 1, total: 1, completedAt: 'x', answerDetails: [{ questionId: 'ROAD67-11', correct: pts > 0, points: pts }] });
  assert.equal(P.saveTourRun(rec('a', 'exam', 200)).gained, 200);
  assert.equal(P.saveTourRun(rec('a', 'exam', 200)).reason, 'duplicate');
  assert.equal(P.saveTourRun(rec('b', 'exam', 150)).gained, 0);
  assert.equal(P.saveTourRun(rec('c', 'study', 290)).gained, 0);
  assert.equal(P.saveTourRun(rec('d', 'exam', 290, '01'), { draft: true }).gained, 0, 'brouillon : jamais compté');
  assert.equal(P.saveTourRun(Object.assign(rec('e', 'exam', 10), { tourId: '../x' })).saved, false);
  const t = P.totals(); assert.equal(t.points, 200); assert.ok(t.points <= t.answered * 300);
  assert.deepEqual([...P.tourStats('road67').known], ['ROAD67-11']);
});

test('intégration : page, accueil, cache hors ligne, workflow', async () => {
  const html = await read('public/parcours.html');
  for (const s of ['gps-engine.js', 'tour-engine.js', 'progress.js', 'parcours-app.js', 'vendor/leaflet/leaflet.js']) assert.ok(html.includes(`src="${s}"`), s);
  assert.ok((await read('public/index.html')).includes('href="parcours.html"'));
  const sw = await read('public/sw.js');
  for (const f of ['parcours.html', 'parcours-app.js', 'tour-engine.js', 'tours/index.json', 'tours/road67.json']) assert.ok(sw.includes(`'./${f}'`), f);
  const idx = await json('public/tours/index.json');
  assert.deepEqual(idx.tours.filter(t => t.public).map(t => t.id), ['road67']);
  assert.ok(!/fetch\(|XMLHttpRequest/.test((await read('public/tour-engine.js')).replace(/\/\/.*$/gm, '')), 'moteur sans réseau');
  assert.ok((await read('.github/workflows/tours.yml')).includes('build-tours.mjs --online'));
});
