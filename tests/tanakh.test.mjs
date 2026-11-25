// Calque « תנ״ך » de la carte : liste source cohérente, et, une fois construit, chaque verset publié contient bien le nom du lieu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { strip, hasName, gem } from '../tools/tanakh-lib.mjs';

const SRC = JSON.parse(readFileSync(new URL('../content/tanakh/places.src.json', import.meta.url), 'utf8'));
const OUT = new URL('../public/tanakh/places.json', import.meta.url);

test('numérotation hébraïque des chapitres et versets', () => {
  assert.equal(gem(1), 'א'); assert.equal(gem(15), 'טו'); assert.equal(gem(16), 'טז'); assert.equal(gem(31), 'לא'); assert.equal(gem(119), 'קיט');
});

test('reconnaissance du nom dans le verset (préfixes, ה de direction, lettres finales)', () => {
  assert.ok(hasName('וַיָּבֹאוּ כָּל זִקְנֵי יִשְׂרָאֵל אֶל הַמֶּלֶךְ חֶבְרוֹנָה', ['חברון']));
  assert.ok(hasName('וַיֵּשֶׁב בִּמְצָדוֹת עֵין־גֶּדִי', ['עין גדי']));
  assert.ok(hasName('וַיֵּרֶד שִׁמְשׁוֹן תִּמְנָתָה', ['תמנ']));
  assert.ok(!hasName('וַיֵּלֶךְ אֲדֹנִי', ['דן']), 'pas de faux positif au milieu d’un mot');
  assert.equal(strip('בְּרֵאשִׁית'), 'בראשית');
});

test('liste source : identifiants uniques, types et livres connus, parcours vers des lieux existants', () => {
  const ids = SRC.places.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of SRC.places) {
    assert.ok(SRC.kinds[p.kind], p.id + ' : type ' + p.kind);
    assert.ok(p.wiki.length && p.wiki.every(w => w.startsWith('he:')), p.id + ' : article Wikipédia');
    assert.ok(p.match.length && p.refs.length, p.id);
    for (const r of p.refs) { const m = /^(.+) \d+:\d+$/.exec(r.r); assert.ok(m && SRC.books[m[1]], p.id + ' ' + r.r); assert.ok(r.he && r.he.length < 140, p.id + ' ' + r.r + ' : résumé court'); }
  }
  for (const j of SRC.journeys) for (const s of j.stops) assert.ok(ids.includes(s.p), j.id + ' → ' + s.p);
});

test('données publiées : coordonnées sourcées et chaque verset contient le nom du lieu', { skip: !existsSync(OUT) && 'pas encore construit (workflow tanakh.yml)' }, () => {
  const d = JSON.parse(readFileSync(OUT, 'utf8'));
  assert.ok(d.places.length >= 30, 'au moins 30 lieux placés (' + d.places.length + ')');
  for (const p of d.places) {
    const s = SRC.places.find(x => x.id === p.id);
    assert.ok(s, p.id);
    assert.ok(p.lat > 29.4 && p.lat < 33.45 && p.lon > 34.2 && p.lon < 35.95, p.id + ' dans le cadre');
    assert.ok(p.wiki && /^https:\/\/he\.wikipedia\.org\//.test(p.wiki.url), p.id + ' : lien Wikipédia');
    assert.ok(p.refs.length, p.id);
    for (const r of p.refs) { assert.ok(r.verse && hasName(r.verse, s.match), p.id + ' ' + r.r + ' : nom absent du verset'); assert.ok(r.version, p.id + ' ' + r.r + ' : version Sefaria'); assert.ok(!/[&<>{}]/.test(r.verse), p.id + ' ' + r.r + ' : balise ou entité HTML dans le verset'); }
  }
  const placed = new Set(d.places.map(p => p.id));
  for (const j of d.journeys) { assert.ok(j.stops.length >= 2, j.id); for (const s of j.stops) assert.ok(placed.has(s.p), j.id + ' → ' + s.p); }
});

test('carte : calque תנ״ך branché et données dans le cache hors ligne', () => {
  const map = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  assert.ok(map.includes("{id:'tanakh',icon:'📖'"), 'bouton du calque');
  assert.ok(map.includes("MDTours.getJSON('tanakh/places.json')"), 'chargement à la première activation');
  assert.ok(/id="tkBooks"/.test(map) && /id="tkJourneys"/.test(map), 'filtres livre et parcours');
  assert.ok(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').includes("'./tanakh/places.json'"));
});
