// « הדרכת דרך — מדריך באוטובוס » : moteur de déclenchement anticipé + données Savidor → Jérusalem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const json = async p => JSON.parse(await read(p));
const exists = p => access(new URL('../' + p, import.meta.url)).then(() => true, () => false);
async function umd(file, name) { const ctx = { self: {}, Math, Date, JSON, Object, Array, Map, Set, String, Number, Infinity }; vm.createContext(ctx); vm.runInContext(await read(file), ctx); return ctx.self[name]; }
const H = await umd('public/hadracha-engine.js', 'MDHadracha');

const words = n => Array.from({ length: n }, (_, i) => 'מילה' + i).join(' ');
// commentaire d'environ introSec secondes d'introduction
const poi = (id, sAbeam, o = {}) => Object.assign({ id, sAbeam, offRoadM: 400, category: 'site', prio: 2, side: 'right',
  commentary: { intro: words(Math.round((o.introSec || 30) * H.WORDS_PER_SEC)), cue: 'תסתכלו {LOOK}', look: words(22), short: words(11) } }, o);
const kmh = k => k / 3.6;

test('le commentaire commence AVANT le point d’observation, avec le temps de dire l’introduction', () => {
  const p = poi('a', 10000, { introSec: 45 });
  const t = H.trigger(p, 'fwd', kmh(90));
  assert.ok(t.sObs < p.sAbeam, 'on regarde avant d’être à la hauteur du lieu');
  assert.ok(t.sObs - t.sTrig >= kmh(90) * (t.dur.intro + H.REACT_SEC) - 1, 'l’intro tient avant l’observation');
  // l'exemple de Lionel : 45 s à 90 km/h → bien plus que 500 m d'avance
  assert.ok(t.leadM > 1000, `avance ${t.leadM} m`);
});

test('plus vite = déclenchement plus tôt ; plus lent = plus tard ; jamais sous le plancher de la catégorie', () => {
  const p = poi('a', 10000, { introSec: 20 });
  const slow = H.trigger(p, 'fwd', kmh(40)), fast = H.trigger(p, 'fwd', kmh(100));
  assert.ok(fast.sTrig < slow.sTrig);
  for (const cat of ['landscape', 'site', 'near']) {
    const t = H.trigger(poi('b', 5000, { category: cat, introSec: 1, offRoadM: 0 }), 'fwd', kmh(10));
    assert.ok(t.sAbeam - t.sTrig >= H.MIN_LEAD[cat], cat);
  }
});

test('observation ≠ passage : un lieu lointain se regarde plus tôt qu’un lieu au bord de la route', () => {
  const far = H.visWindow(poi('f', 10000, { offRoadM: 1200 }), 'fwd'), near = H.visWindow(poi('n', 10000, { offRoadM: 50, category: 'near' }), 'fwd');
  assert.ok(10000 - far.sObs > 10000 - near.sObs);
  // une visibilité constatée en repérage remplace l'estimation
  const v = H.visWindow(poi('v', 10000, { visibility: { fwd: { status: 'verified', before: 333, after: 120 } } }), 'fwd');
  assert.equal(v.sObs, 9667); assert.equal(v.verified, true);
});

test('programme sans chevauchement à toutes les vitesses : décalage, version courte ou écart — jamais deux voix', () => {
  const pois = [poi('a', 3000, { prio: 1 }), poi('b', 3600, { prio: 3 }), poi('c', 4000, { prio: 2 }), poi('d', 9000), poi('e', 9100, { prio: 1 })];
  for (const k of [40, 80, 110]) {
    const v = kmh(k), plan = H.schedule(pois, 'fwd', v).filter(x => x.mode !== 'skipped_conflict');
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].start >= plan[i - 1].end + v * H.GAP_SEC - 1, `${k} km/h ${plan[i - 1].poi.id}→${plan[i].poi.id}`);
    // le plus prioritaire n'est jamais écarté
    assert.ok(plan.some(x => x.poi.id === 'b'), `${k} km/h`);
  }
});

test('temps réel : attendre, lancer, consigne, version courte, et jamais d’explication tardive', () => {
  const p = poi('a', 10000, { introSec: 20 }), v = kmh(80), t = H.trigger(p, 'fwd', v);
  assert.equal(H.decide([p], 'fwd', t.sTrig - 500, v).action, 'wait');
  assert.equal(H.decide([p], 'fwd', t.sTrig + 10, v).action, 'start');
  assert.equal(H.decide([p], 'fwd', t.sObs, v, { started: { id: 'a' } }).action, 'cue');
  // en retard (moins que l'intro avant l'observation) → version courte
  assert.equal(H.decide([p], 'fwd', t.sObs - v * 5, v).action, 'start_short');
  // dépassé → rien
  assert.equal(H.decide([p], 'fwd', t.sVisEnd + 50, v).action, 'done');
  // bus lent : le déclenchement recule (on parle plus tard), toujours avant l'observation
  const tSlow = H.trigger(p, 'fwd', kmh(30));
  assert.ok(tSlow.sTrig > t.sTrig && tSlow.sTrig < tSlow.sObs);
});

test('lieu invisible depuis la route (tunnel) : on en parle en passant, sans « regardez »', () => {
  const p = poi('castel', 8000, { visibility: { fwd: { status: 'not_visible' } } });
  const t = H.trigger(p, 'fwd', kmh(70));
  assert.equal(t.noLook, true);
  assert.ok(t.sTrig < p.sAbeam);
});

test('sens retour : abscisse miroir, côté inversé, jetons {LOOK}/{SIDE} rendus', () => {
  const p = poi('a', 3000, { side: 'right', visibility: { fwd: { status: 'verified', before: 500, after: 100 } } });
  const m = H.mirror(p, 20000);
  assert.equal(m.sAbeam, 17000); assert.equal(m.side, 'left');
  assert.equal(m.visibility.fwd.before, 100);
  assert.equal(H.render('תסתכלו {LOOK} — {SIDE}', 'right'), 'תסתכלו ימינה — מימין');
  assert.equal(H.render('תסתכלו {LOOK}', 'left'), 'תסתכלו שמאלה');
});

test('source Savidor → Jérusalem : ≥ 10 lieux, sources du Drive, aucun côté ni coordonnée tapés en dur', async () => {
  const src = await json('content/hadracha/savidor-jerusalem.src.json');
  assert.equal(src.published, false); assert.notEqual(src.status, 'pret');
  assert.ok(src.pois.length >= 10);
  const ids = new Set();
  for (const p of src.pois) {
    assert.ok(/^[a-z0-9-]+$/.test(p.id) && !ids.has(p.id), p.id); ids.add(p.id);
    assert.ok(p.wiki && p.wiki.length, p.id + ' : titres Wikipédia');
    assert.equal(p.lat, undefined); assert.equal(p.coord, undefined);
    assert.ok(['landscape', 'site', 'near'].includes(p.category), p.id);
    assert.ok(p.name.he && p.name.fr, p.id);
    const c = p.commentary;
    assert.ok(c.intro && c.look && c.short, p.id);
    // le côté ne doit jamais être écrit en clair : sinon le sens retour dirait le contraire de la réalité
    for (const v of [c, c.rev || {}]) for (const k of ['intro', 'cue', 'look', 'short']) assert.ok(!/ימינה|שמאלה|מימין|משמאל|בצד השני/.test(v[k] || ''), `${p.id}.${k} : côté écrit en dur`);
    const notVisible = p.visibility && p.visibility.fwd && p.visibility.fwd.status === 'not_visible';
    if (!notVisible && p.sideRule !== 'along') assert.ok(/\{LOOK\}/.test(c.cue), p.id + ' : consigne de regard');
    assert.ok(p.facts.length, p.id);
    for (const f of p.facts) assert.ok(f.source === 'external' ? !!f.ref || /עבד אל-קאדר/.test(f.he) : !!src.sources[f.source], `${p.id} : source ${f.source}`);
    if (p.teacherSide) { assert.ok(src.sources[p.teacherSide.source], p.id); assert.ok(p.teacherSide.quote.length > 10, p.id); }
    // durée d'un commentaire complet : raisonnable pour un bus (≤ 75 s)
    const d = H.durations(c); assert.ok(d.intro + d.cue + d.look <= 75, `${p.id} : ${d.intro + d.cue + d.look} s`);
  }
  // les sources « ai-edited » ne sont jamais présentées comme la parole du prof
  for (const p of src.pois) if (p.teacherSide) assert.notEqual(src.sources[p.teacherSide.source].kind, 'ai-edited', p.id);
});

test('parcours construit (si le tracé est résolu) : deux sens cohérents, déclenchements avant les lieux, intervalles continus', async () => {
  if (!(await exists('public/hadracha/savidor-jerusalem.json'))) return;
  const t = await json('public/hadracha/savidor-jerusalem.json');
  if (!t.route) return;
  const f = t.directions.fwd, r = t.directions.rev;
  assert.ok(Math.abs(f.lengthM - r.lengthM) < 5);
  for (const p of f.pois) {
    const q = r.pois.find(x => x.id === p.id); assert.ok(q, p.id);
    if (p.side === 'right' || p.side === 'left') assert.equal(q.side, p.side === 'right' ? 'left' : 'right', p.id);
  }
  for (const dir of [f, r]) {
    for (const tr of dir.triggers) for (const k of Object.keys(tr.byKmh)) {
      const p = dir.pois.find(x => x.id === tr.id);
      assert.ok(tr.byKmh[k].trigger_s < p.sAbeam, `${tr.id} ${k}`);
    }
    // 1 km par défaut, 250 m dans les zones riches ; aucun trou
    dir.segments.forEach((s, i) => { if (i) assert.equal(s.from_s, dir.segments[i - 1].to_s); assert.ok(s.lengthM <= 1000); });
    assert.equal(dir.segments[dir.segments.length - 1].to_s, dir.lengthM);
    assert.ok(dir.segments.some(s => s.lengthM === 250) && dir.segments.some(s => s.lengthM === 1000));
  }
});
