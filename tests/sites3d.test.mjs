// Sites 3D (Massada, Césarée, Beit Shean) : données cohérentes, sourcées, en 4 langues ; positions issues de la géographie réelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const SITES = Object.keys(JSON.parse(await read('tools/site3d-sites.json'))).filter(k => !k.startsWith('_') && existsSync(new URL(`../public/sites3d/${k}/site.json`, import.meta.url)));
const LANGS = ['he', 'fr', 'en', 'ru'];
const TYPES = new Set(['theater', 'circus', 'amphi', 'casemate', 'wall', 'aqueduct', 'path', 'street', 'footprint', 'terraces', 'ramp', 'breakwater', 'pool', 'temple', 'storerooms', 'hall', 'basilica', 'mosque', 'facade', 'marker', 'tholos', 'tower', 'box', 'fortress', 'gate', 'stables', 'altar', 'silo', 'roundtower']);

for (const s of SITES) {
  test(`${s} : périodes, fiches 4 langues, sources, certitude`, async () => {
    const d = JSON.parse(await read(`public/sites3d/${s}/site.json`));
    assert.ok(d.periods.length >= 2, 'au moins 2 périodes');
    for (const p of d.periods) for (const l of LANGS) { assert.ok(p.name[l], `${s} période ${p.n} nom ${l}`); assert.ok(p.dates[l], `${s} période ${p.n} dates ${l}`); }
    const ns = new Set(d.periods.map(p => p.n)), ids = new Set();
    assert.ok(d.monuments.length >= 5, 'au moins 5 fiches');
    for (const m of d.monuments) {
      assert.ok(!ids.has(m.id), 'id unique ' + m.id); ids.add(m.id);
      assert.ok(ns.has(m.from) && ns.has(m.to) && m.from <= m.to, m.id + ' : périodes');
      assert.ok(d.certainty[m.certainty], m.id + ' : certitude');
      for (const l of LANGS) { assert.ok(m.name[l], `${m.id} nom ${l}`); assert.ok(m.text[l], `${m.id} texte ${l}`); }
      for (const k of ['builder', 'dims', 'remains', 'debate', 'otherView', 'placementNote', 'events', 'function']) if (m[k]) for (const l of LANGS) assert.ok(m[k][l], `${m.id} ${k} ${l}`);
      assert.ok(m.sources && m.sources.length, m.id + ' : sources');
      for (const src of m.sources) { assert.ok(['drive', 'primary', 'online'].includes(src.kind), m.id + ' : type de source'); assert.match(src.url, /^https:\/\//, m.id + ' : lien'); }
      if (m.shape) assert.ok(TYPES.has(m.shape.type), m.id + ' : type de modèle ' + m.shape.type);
      if (!m.shape) assert.ok(m.placementNote, m.id + ' : sans position → note explicative');
      if (m.certainty !== 'attested' || m.schematic) assert.ok(m.placementNote || m.debate || m.otherView, m.id + ' : reconstruction/hypothèse expliquée');
    }
    // au moins une source du cours (Drive) pour Césarée et Beit Shean (sorties 15 et 19)
    if (s !== 'masada') assert.ok(d.monuments.filter(m => m.sources.some(x => x.kind === 'drive')).length >= d.monuments.length * 0.7, 'majorité de fiches sourcées par le cours');
  });

  test(`${s} : chaque référence OpenStreetMap existe dans geo.json (positions réelles, rien d'inventé)`, async () => {
    const d = JSON.parse(await read(`public/sites3d/${s}/site.json`)), g = JSON.parse(await read(`public/sites3d/${s}/geo.json`));
    assert.ok(g.dem && g.dem.heights.length === g.dem.rows * g.dem.cols, 'relief complet');
    const have = new Set(g.shapes.map(x => x.osm));
    for (const [k, sel] of Object.entries(d.osm)) {
      if (sel.osm) for (const o of [].concat(sel.osm)) assert.ok(have.has(o), `${s} : ${k} → ${o} absent de geo.json`);
      else assert.ok(g.shapes.some(x => (!sel.name || new RegExp(sel.name, 'i').test(x.name + ' ' + x.he))), `${s} : ${k} ne trouve aucune forme`);
    }
    const toks = []; const walk = v => { if (typeof v === 'string' && /^(o|a):/.test(v)) toks.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    d.monuments.forEach(m => walk(m.shape)); walk(d.home);
    for (const t of toks) { if (t.startsWith('o:')) assert.ok(d.osm[t.slice(2)], `${s} : ${t} non défini`); else assert.ok(g.anchors[t.slice(2)], `${s} : repère ${t} absent`); }
    for (const m of d.monuments) for (const k of ['osm', 'fit']) if (m.shape && typeof m.shape[k] === 'string') assert.ok(d.osm[m.shape[k]], `${m.id} : ${k}=${m.shape[k]} non défini`);
  });
}

test('sites 3D : accès depuis la carte, l\'accueil et les parcours 15 et 19 ; hors-ligne', async () => {
  const map = await read('public/map.html'), idx = await read('public/index.html'), gt = await read('public/guided-tour.html'), sw = await read('public/sw.js');
  for (const s of SITES) { assert.ok(map.includes(`site3d.html?site=${s}`), 'carte → ' + s); assert.ok(idx.includes(`site3d.html?site=${s}`), 'accueil → ' + s); }
  assert.match(gt, /15:"site3d\.html\?site=caesarea"/); assert.match(gt, /19:"site3d\.html\?site=beitshean"/);
  for (const f of ['./site3d.html', './sites3d/app.js', './sites3d/models.js']) assert.ok(sw.includes(`'${f}'`), 'cache hors-ligne : ' + f);
  const app = await read('public/sites3d/app.js');
  assert.match(app, /quizEnabled: false/, 'quiz 3D désactivés (phase 2 non autorisée)');
});

test('frise du temps : chaque époque a son ère et sa couleur, jamais deux voisines identiques', async () => {
  const { ERA_COLORS, eraPaint } = await import('../public/era-timeline.js');
  const fs = await import('node:fs');
  const files = ['public/jerusalem3d/monuments.json', ...fs.readdirSync('public/sites3d').map(s => `public/sites3d/${s}/site.json`).filter(f => fs.existsSync(f))];
  assert.ok(files.length >= 20);
  for (const f of files) {
    const { periods } = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const p of periods) assert.ok(ERA_COLORS[p.era], `${f} : époque ${p.n} sans ère connue`);
    assert.equal(periods.at(-1).era, 'today', f + ' : la frise finit par aujourd’hui');
    const c = eraPaint(periods).map(x => x.c);
    for (let i = 1; i < c.length; i++) assert.notEqual(c[i], c[i - 1], `${f} : époques ${i} et ${i + 1} de même couleur`);
  }
  assert.equal(new Set(Object.values(ERA_COLORS)).size, Object.keys(ERA_COLORS).length, 'une couleur par ère');
});
