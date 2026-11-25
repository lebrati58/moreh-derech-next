// Calques « 🕌 קוראן » et « ✝️ ברית חדשה » de la carte : listes sources cohérentes, reconnaissance des noms,
// et, une fois construits, chaque verset publié contient le nom du lieu et chaque événement son année.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { arNorm, hasNameAr, hasNameEn, hasNameHe, verseHasName, hasYear, yearSentence } from '../tools/scripture-lib.mjs';

const read = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const CORPORA = { quran: { min: 12, refRe: /^(\d+):\d+$/ }, nt: { min: 25, refRe: /^(.+) \d+:\d+$/ } };

test('arabe : voyelles retirées, préfixes et article reconnus', () => {
  const isra = 'سُبْحَانَ ٱلَّذِىٓ أَسْرَىٰ بِعَبْدِهِۦ لَيْلًا مِّنَ ٱلْمَسْجِدِ ٱلْحَرَامِ إِلَى ٱلْمَسْجِدِ ٱلْأَقْصَا';
  assert.ok(hasNameAr(isra, ['المسجد الحرام']));
  assert.ok(hasNameAr('سبحان الذي أسرى بعبده ليلا من المسجد الحرام إلى المسجد الأقصى', ['المسجد الأقصى']));
  assert.ok(hasNameAr('وَلَقَدْ نَصَرَكُمُ ٱللَّهُ بِبَدْرٍ وَأَنتُمْ أَذِلَّةٌ', ['بدر']), 'préfixe ب');
  assert.ok(hasNameAr('ٱهْبِطُوا۟ مِصْرًا فَإِنَّ لَكُم', ['مصر']), 'alif de tanwin');
  assert.ok(hasNameAr('وَٱلتِّينِ وَٱلزَّيْتُونِ وَطُورِ سِينِينَ', ['طور']), 'و + sans article');
  assert.ok(hasNameAr('لَقَدْ كَانَ لِسَبَإٍ فِى مَسْكَنِهِمْ', ['سبإ']), 'hamza');
  assert.ok(hasNameAr('جعل الله الكعبة البيت الحرام', ['الكعبة']));
  assert.ok(!hasNameAr('وَدَخَلَ ٱلْمَدِينَةَ عَلَىٰ حِينِ غَفْلَةٍ', ['مدين']), 'المدينة n’est pas مدين');
  assert.equal(arNorm('ٱلْأَقْصَى'), 'الاقصي');
});

test('anglais et hébreu : mots entiers', () => {
  assert.ok(hasNameEn("Now when Jesus was born in Bethlehem of Judea", ['Bethlehem']));
  assert.ok(hasNameEn('and went out to the Mount of Olives', ['Mount of Olives']));
  assert.ok(!hasNameEn('Bethanyville', ['Bethany']));
  assert.ok(hasNameHe('וַיָּבֹא לִכְפַר נַחוּם', ['כפר נחום']));
  assert.ok(verseHasName({ lang: 'en', verse: 'came to Capernaum' }, { match: [], match_en: ['Capernaum'] }));
});

test('événements : année entière dans le texte', () => {
  assert.ok(hasYear('צו מילאנו פורסם בשנת 313 לספירה.', 313));
  assert.ok(!hasYear('בשנת 3130', 313));
  assert.equal(yearSentence('משפט ראשון. בשנת 313 פורסם הצו. אחרון.', 313), 'בשנת 313 פורסם הצו.');
});

for (const [c, conf] of Object.entries(CORPORA)) {
  const SRC = read(`content/${c}/places.src.json`);
  test(`${c} : liste source cohérente`, () => {
    const ids = SRC.places.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
    assert.ok(SRC.box && SRC.books.history, 'cadre et rubrique histoire');
    for (const p of SRC.places) {
      assert.ok(SRC.kinds[p.kind], p.id + ' : type ' + p.kind);
      assert.ok(p.wiki.length && p.wiki.every(w => w.startsWith('he:')), p.id + ' : article Wikipédia');
      assert.ok(Array.isArray(p.match) && p.refs.length, p.id);
      for (const r of p.refs) {
        assert.ok(r.he && r.he.length < 140, p.id + ' : résumé court');
        if (r.h) { assert.ok(r.h.startsWith('he:') && Number.isInteger(r.year) && r.year > 0 && r.year < 2100, p.id + ' ' + r.h); continue; }
        const m = conf.refRe.exec(r.r); assert.ok(m && SRC.books[m[1]], p.id + ' ' + r.r);
        assert.ok((c === 'nt' ? p.match.length || (p.match_en || []).length : p.match.length), p.id + ' : noms à chercher dans le verset');
        if (c === 'nt') assert.ok(SRC.bookIds[m[1]], p.id + ' ' + r.r + ' : identifiant du livre');
      }
    }
    for (const j of SRC.journeys) for (const s of j.stops) {
      const p = SRC.places.find(x => x.id === s.p); assert.ok(p, j.id + ' → ' + s.p);
      if (s.h) assert.ok(p.refs.some(x => x.h === s.h), j.id + ' → ' + s.h + ' : événement du lieu');
    }
  });
  const OUT = new URL(`../public/${c}/places.json`, import.meta.url);
  test(`${c} : données publiées vérifiées`, { skip: !existsSync(OUT) && 'pas encore construit (workflow scripture.yml)' }, () => {
    const d = JSON.parse(readFileSync(OUT, 'utf8'));
    assert.ok(d.places.length >= conf.min, `au moins ${conf.min} lieux placés (${d.places.length})`);
    assert.ok(d.footHe && d.books, 'textes de la fiche');
    for (const p of d.places) {
      const s = SRC.places.find(x => x.id === p.id); assert.ok(s, p.id);
      assert.ok(p.lat >= SRC.box.minLat && p.lat <= SRC.box.maxLat && p.lon >= SRC.box.minLon && p.lon <= SRC.box.maxLon, p.id + ' dans le cadre');
      assert.ok(p.wiki && /^https:\/\/he\.wikipedia\.org\//.test(p.wiki.url), p.id + ' : lien Wikipédia');
      assert.ok(p.refs.length, p.id);
      for (const r of p.refs) {
        assert.ok(r.verse && r.version && d.books[r.book], p.id + ' ' + r.r);
        assert.ok(!/[<>{}]/.test(r.verse), p.id + ' ' + r.r + ' : balise dans le texte');
        if (r.book === 'history') assert.ok(hasYear(r.verse, r.year), p.id + ' ' + r.r + ' : année absente');
        else assert.ok(verseHasName(r, s), p.id + ' ' + r.r + ' : nom absent du verset');
      }
    }
    const placed = new Set(d.places.map(p => p.id));
    for (const j of d.journeys) { assert.ok(j.stops.length >= 2, j.id); for (const s of j.stops) assert.ok(placed.has(s.p), j.id + ' → ' + s.p); }
  });
}

test('carte : calques קוראן et ברית חדשה branchés, données dans le cache hors ligne', () => {
  const map = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  assert.ok(map.includes("{id:'quran',icon:'🕌'") && map.includes("{id:'nt',icon:'✝️'"), 'boutons des calques');
  assert.ok(map.includes("file:'quran/places.json'") && map.includes("file:'nt/places.json'"), 'fichiers des calques');
  for (const p of ['qr', 'nt']) assert.ok(map.includes(`id="${p}Books"`) && map.includes(`id="${p}Journeys"`), p + ' : filtres');
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./quran/places.json'") && sw.includes("'./nt/places.json'"));
});
