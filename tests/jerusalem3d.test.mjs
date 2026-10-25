// Jérusalem 3D : fiabilité des fiches, phase 2 verrouillée, géographie non saisie à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const LANGS = ['he', 'fr', 'en', 'ru'];

test('phase 2 locked: 3D quizzes disabled and hidden', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  assert.equal(d.quiz3dEnabled, false, 'quiz3dEnabled doit rester false sans accord explicite');
  const app = await read('public/jerusalem3d/app.js');
  assert.match(app, /quiz3dEnabled === true/);
  assert.doesNotMatch(app, /חידון|startQuiz/);
});

test('every monument is sourced, translated and classified', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  assert.equal(d.periods.length, 12); // 11 périodes + « aujourd'hui »
  const ids = new Set();
  for (const m of d.monuments) {
    assert.match(m.id, /^jerusalem_[a-z0-9_]+$/, m.id);
    assert.ok(!ids.has(m.id), 'identifiant en double ' + m.id); ids.add(m.id);
    assert.ok(['attested', 'reconstruction', 'hypothesis'].includes(m.certainty), m.id);
    assert.ok(m.from >= 1 && m.to <= 12 && m.from <= m.to, m.id + ' période');
    for (const k of ['name', 'text']) for (const l of LANGS) assert.ok(m[k] && m[k][l] && m[k][l].length > 1, `${m.id}.${k}.${l}`);
    for (const k of ['dims', 'remains', 'debate', 'otherView', 'placementNote', 'builder', 'function', 'events']) if (m[k]) for (const l of LANGS) assert.ok(m[k][l], `${m.id}.${k}.${l}`);
    assert.ok(m.sources.length >= 1, m.id + ' sans source');
    m.sources.forEach(s => { assert.ok(['drive', 'primary', 'online'].includes(s.kind)); assert.match(s.url, /^https:\/\//); });
    // Une hypothèse ne reçoit que des questions de type « archéologie » (phase 2).
    if (m.certainty === 'hypothesis' && m.quiz3d) assert.equal(m.quiz3d.type, 'archaeology', m.id);
  }
  const drive = d.monuments.filter(m => m.sources.some(s => s.kind === 'drive')).length;
  assert.ok(drive / d.monuments.length >= 0.85, 'le Drive doit être la source principale (seules les portes ottomanes, simples repères, n’ont pas de document de cours)  (' + drive + '/' + d.monuments.length + ')');
});

test('positions come from Wikidata anchors or OpenStreetMap, never typed by hand', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  const anchors = JSON.parse(await read('tools/jerusalem3d-anchors.json')).anchors;
  for (const m of d.monuments) if (m.anchor) assert.ok(anchors[m.anchor], m.id + ' : repère inconnu ' + m.anchor);
  assert.doesNotMatch(JSON.stringify(d.monuments), /"lat"|"lon"/);
  const geo = JSON.parse(await read('public/jerusalem3d/geo.json'));
  assert.match(geo.method, /Wikip/); assert.match(geo.license, /OpenStreetMap/);
  assert.ok(geo.shapes.some(s => s.name === 'Temple Mount'), 'contour du mont du Temple');
  assert.ok(geo.shapes.filter(s => s.kind === 'wall').length >= 5, 'murailles OSM');
  assert.equal(geo.dem.heights.length, geo.dem.rows * geo.dem.cols);
});

test('entry points and offline cache', async () => {
  const map = await read('public/map.html');
  assert.match(map, /jerusalem3d\.html\?period=/);
  const sw = await read('public/sw.js');
  for (const f of ['jerusalem3d.html', 'jerusalem3d/app.js', 'jerusalem3d/monuments.json', 'jerusalem3d/geo.json', 'vendor/three/three.module.min.js']) assert.ok(sw.includes("'./" + f + "'"), f);
  const html = await read('public/jerusalem3d.html');
  assert.match(html, /"three":"\.\/vendor\/three\/three\.module\.min\.js"/);
});

test('wall lines per period: every waypoint is a known anchor, an esplanade corner or a published coordinate', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  const anchors = JSON.parse(await read('tools/jerusalem3d-anchors.json')).anchors;
  const walls = d.monuments.filter(m => m.wall);
  assert.ok(walls.length >= 10, 'au moins 10 tracés');
  const periods = new Set(); walls.forEach(w => { for (let p = w.from; p <= w.to; p++) periods.add(p); });
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]) assert.ok(periods.has(p), 'période sans muraille : ' + p);
  assert.ok(!periods.has(10), 'période 10 : murailles rasées (1219), aucune ligne');
  for (const w of walls) {
    assert.equal(w.shape.type, 'wallline'); assert.match(w.shape.color, /^#[0-9a-f]{6}$/);
    assert.ok(w.placementNote || w.shape.parts.every(p => p.osm), w.id + ' : note sur le caractère schématique');
    for (const part of w.shape.parts) {
      if (part.osm) continue;
      assert.ok(part.via.length >= 2, w.id);
      for (const tok of part.via) {
        if (typeof tok === 'object') { assert.ok(tok.itm && tok.ll && /Spiezer/.test(tok.src), w.id + ' : coordonnée publiée sourcée'); continue; }
        const [k, v] = tok.split(/:(.*)/);
        if (k === 'a') assert.ok(anchors[v], w.id + ' : repère inconnu ' + v);
        else if (k === 'tm') assert.match(v, /^(NE|NW|SE|SW)$/);
        else if (k === 'herod') assert.match(v, /^(hippicus|mariamne)$/);
        else if (k === 'mid') v.split(',').forEach(a => assert.ok(anchors[a], w.id + ' : ' + a));
        else assert.fail(w.id + ' : jeton inconnu ' + tok);
      }
    }
  }
});

test('3D engine: every module import resolves to a vendored file that is also cached offline', async () => {
  const { existsSync } = await import('node:fs');
  const { resolve, dirname, relative } = await import('node:path');
  const pub = new URL('../public/', import.meta.url).pathname, sw = await read('public/sw.js'), seen = new Set();
  const html = await read('public/jerusalem3d.html');
  assert.match(html, /"three\/addons\/":"\.\/vendor\/three\/jsm\/"/, 'import map : three/addons');
  const walk = async f => {
    if (seen.has(f)) return; seen.add(f);
    assert.ok(existsSync(f), 'fichier manquant : ' + relative(pub, f));
    assert.ok(sw.includes("'./" + relative(pub, f) + "'"), 'absent du cache hors ligne : ' + relative(pub, f));
    const src = await readFile(f, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (m[1] === 'three') continue;
      await walk(m[1].startsWith('three/addons/') ? resolve(pub, 'vendor/three/jsm', m[1].slice(13)) : resolve(dirname(f), m[1]));
    }
  };
  await walk(resolve(pub, 'jerusalem3d/app.js'));
  assert.ok(seen.size >= 10);
});

test('detailed models are only used for sourced monuments and flagged as schematic where proportions are reconstructed', async () => {
  const d = JSON.parse(await read('public/jerusalem3d/monuments.json'));
  const app = await read('public/jerusalem3d/app.js');
  const MODEL = ['hippicus', 'mariamne', 'hadrian', 'temple', 'porticoes', 'royalstoa', 'robinson', 'wilson', 'hulda', 'steps', 'antonia', 'phasael', 'palace', 'sepulchre_byz', 'sepulchre', 'nea', 'cardo', 'domerock', 'aqsa'];
  for (const t of MODEL) assert.ok(app.includes(`case '${t}'`), 'type de modèle non géré : ' + t);
  for (const m of d.monuments.filter(m => MODEL.includes(m.shape.type))) {
    assert.ok(m.sources.some(s => s.kind === 'drive' || s.kind === 'primary'), m.id + ' : modèle détaillé sans source Drive ni source antique');
  }
  assert.match(app, /SCHEMATIC = new Set\(\[/);
  assert.ok(d.monuments.find(m => m.id === 'jerusalem_wilsons_arch').debate, 'arc de Wilson : datation débattue');
});
