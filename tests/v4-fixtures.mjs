// Données d'EXEMPLE pour tester la V4 sans réseau (formats documentés de Nominatim, OSRM, Wikipédia, Wikidata).
// Ce ne sont pas de vraies données : noms et faits inventés pour le test.
// Trajet rectiligne d'ouest en est (≈ 18,7 km). Nord = gauche du bus.
export const GEOM = Array.from({ length: 41 }, (_, i) => [32.6, +(34.90 + i * 0.005).toFixed(4)]);
const lab = (he, fr, en, ru) => ({ he: { value: he }, fr: { value: fr }, en: { value: en }, ru: { value: ru } });
const claim = v => [{ rank: 'normal', mainsnak: { datavalue: { value: v } } }];
const item = id => ({ 'entity-type': 'item', id });
export const REFS = {
  Q_MOSHAV: lab('מושב', 'mochav', 'moshav', 'мошав'), Q_KIB: lab('קיבוץ', 'kibboutz', 'kibbutz', 'кибуц'),
  Q_STREAM: lab('נחל', 'cours d’eau', 'stream', 'ручей'), Q_CITY: lab('עיר', 'ville', 'city', 'город'),
  Q_BARON: lab('הברון רוטשילד', 'le baron Rothschild', 'Baron Rothschild', 'барон Ротшильд'),
  Q_RABIN: lab('יצחק רבין', 'Yitzhak Rabin', 'Yitzhak Rabin', 'Ицхак Рабин')
};
// [qid, he, lon, latOffset, claims]
export const RAW = [
  ['Q1', 'אליקים', 34.915, 0.004, { P31: claim(item('Q_MOSHAV')), P571: claim({ time: '+1949-00-00T00:00:00Z' }) }],
  ['Q2', 'נחל תות', 34.94, -0.003, { P31: claim(item('Q_STREAM')) }],
  ['Q3', 'בת שלמה', 34.97, 0.002, { P31: claim(item('Q_MOSHAV')), P138: claim(item('Q_BARON')), P571: claim({ time: '+1889-00-00T00:00:00Z' }) }],
  ['Q4', 'יקנעם עילית', 35.06, -0.004, { P31: claim(item('Q_CITY')), P1082: claim({ amount: '+24600' }), P571: claim({ time: '+1950-00-00T00:00:00Z' }) }],
  ['Q5', 'רמת השופט', 35.00, 0.0035, { P31: claim(item('Q_KIB')), P571: claim({ time: '+1941-00-00T00:00:00Z' }) }],
  ['Q6', 'מחלף רבין', 35.03, 0.0002, { P31: claim(item('Q_CITY')), P138: claim(item('Q_RABIN')) }],
  ['Q7', 'מקום רחוק', 35.02, 0.05, { P31: claim(item('Q_CITY')), P571: claim({ time: '+1900-00-00T00:00:00Z' }) }],   // 5,5 km : exclu
  ['Q8', 'ללא עובדות', 35.08, 0.001, {}],                                                                                // rien à demander : exclu
  ['Q9', 'עין העמק', 35.09, -0.002, { P31: claim(item('Q_KIB')), P571: claim({ time: '+1950-00-00T00:00:00Z' }) }]
];
export const ENTS = Object.fromEntries(RAW.map(([q, he, lon, dl, claims]) => [q, { id: q,
  labels: lab(he, he + ' (fr)', he + ' (en)', he + ' (ru)'), descriptions: { he: { value: 'יישוב בצפון' } },
  claims, sitelinks: { hewiki: { title: he }, enwiki: { title: he + ' (en)' } } }]));
export const PLACES = RAW.map(([q, he, lon, dl], i) => ({ qid: q, title: he, lat: 32.6 + dl, lon, entity: ENTS[q],
  extracts: { he: `${he} הוא מקום מעניין בצפון. הוא נוסד לפני שנים רבות. יש בו נוף יפה. המקום ידוע בחקלאות. גרים בו אנשים נחמדים.`,
              en: `${he} is an interesting place. It has a view.` }, url: 'https://he.wikipedia.org/wiki/x' + i }));
export const REF_LABELS = Object.fromEntries(Object.entries(REFS).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([l, o]) => [l, o.value]))]));


// Répond comme les services en ligne (fetch du navigateur ou de Node)
export function fakeFetch() {
  const calls = [];
  const R = 6371000, hav = (a, b, c, d) => { const r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const ok = j => Promise.resolve({ ok: true, status: 200, json: async () => j });
  const f = (url) => {
    calls.push(url);
    const u = new URL(url), p = u.searchParams;
    if (u.host === 'nominatim.openstreetmap.org') return ok(p.get('q') === 'זכרון יעקב' ? [{ lat: '32.6', lon: '34.9', display_name: 'Zikhron' }] : [{ lat: '32.6', lon: '35.1', display_name: 'Yokneam' }]);
    if (u.host === 'router.project-osrm.org') return ok({ code: 'Ok', routes: [{ distance: 18700, duration: 1200, geometry: { coordinates: GEOM.map(([a, b]) => [b, a]) } }] });
    if (u.host === 'he.wikipedia.org' && p.get('list') === 'geosearch') {
      const [la, lo] = p.get('gscoord').split('|').map(Number), r = +p.get('gsradius');
      return ok({ query: { geosearch: PLACES.map((x, i) => ({ pageid: 100 + i, title: x.title, lat: x.lat, lon: x.lon, dist: hav(la, lo, x.lat, x.lon) })).filter(g => g.dist <= r) } });
    }
    if (u.host === 'en.wikipedia.org' && p.get('list') === 'geosearch') return ok({ query: { geosearch: [] } });
    if (/wikipedia\.org$/.test(u.host) && p.get('prop') === 'pageprops') {
      const pages = {}; for (const id of p.get('pageids').split('|')) pages[id] = { pageid: +id, pageprops: { wikibase_item: PLACES[+id - 100].qid } };
      return ok({ query: { pages } });
    }
    if (u.host === 'www.wikidata.org') {
      const ids = p.get('ids').split('|'), entities = {};
      for (const id of ids) entities[id] = ENTS[id] || { id, labels: REFS[id] || {} };
      return ok({ entities });
    }
    if (/wikipedia\.org$/.test(u.host) && p.get('prop') === 'extracts') {
      const lang = u.host.split('.')[0], pages = {};
      p.get('titles').split('|').forEach((t, i) => { const pl = PLACES.find(x => x.title === t || x.title + ' (en)' === t); if (pl && pl.extracts[lang]) pages[i] = { title: t, extract: pl.extracts[lang] }; });
      return ok({ query: { pages } });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  };
  return { f, calls };
}


export function respond(url) {
  const { f } = fakeFetch();
  return f(url).then(async r => ({ status: r.status, body: JSON.stringify(await r.json()) }));
}
