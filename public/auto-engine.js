// Parcours automatique (V4) : départ + arrivée → trajet routier → lieux le long de la route → questions.
// Tout est GRATUIT et sans clé : OpenStreetMap (Nominatim pour les adresses, OSRM pour le trajet),
// Wikipédia (lieux géolocalisés + résumés) et Wikidata (faits structurés + noms en 4 langues).
// Les questions sont fabriquées à partir de FAITS sourcés (date de fondation, « nommé d'après »,
// type de lieu, population) : aucune IA, rien d'inventé. Le guide relit tout avant de jouer.
//
// Deux couches :
//  * build(...)  : fonction pure (testée en Node sur des données d'exemple), ne fait aucun appel réseau ;
//  * generate(...) : va chercher les données (fetch injectable) puis appelle build.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDL_AUTO = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const LANGS = ['he', 'fr', 'en', 'ru'];
  const UA_LANG = 'he,en';

  // ------------------------------------------------------------------ Textes des questions (4 langues)
  // Formulations neutres en genre (« המקום », « ce lieu ») : on ne connaît pas le genre grammatical du nom.
  const T = {
    named: {
      he: { q: x => `על שם מי (או מה) נקרא המקום ״${x}״?`, e: (x, y) => `״${x}״ נקרא על שם ${y}.` },
      fr: { q: x => `D'après qui (ou quoi) « ${x} » a-t-il été nommé ?`, e: (x, y) => `« ${x} » porte le nom de : ${y}.` },
      en: { q: x => `Who or what is “${x}” named after?`, e: (x, y) => `“${x}” is named after ${y}.` },
      ru: { q: x => `В честь кого (или чего) назван «${x}»?`, e: (x, y) => `«${x}» назван в честь: ${y}.` }
    },
    year: {
      he: { q: x => `באיזו שנה נוסד המקום ״${x}״?`, e: (x, y) => `״${x}״ — שנת ייסוד: ${y}.` },
      fr: { q: x => `En quelle année « ${x} » a-t-il été fondé ?`, e: (x, y) => `« ${x} » a été fondé en ${y}.` },
      en: { q: x => `In what year was “${x}” founded?`, e: (x, y) => `“${x}” was founded in ${y}.` },
      ru: { q: x => `В каком году основан «${x}»?`, e: (x, y) => `«${x}» основан в ${y} году.` }
    },
    type: {
      he: { q: x => `מה זה ״${x}״?`, e: (x, y) => `״${x}״ — ${y}.` },
      fr: { q: x => `Qu'est-ce que « ${x} » ?`, e: (x, y) => `« ${x} » : ${y}.` },
      en: { q: x => `What is “${x}”?`, e: (x, y) => `“${x}”: ${y}.` },
      ru: { q: x => `Что такое «${x}»?`, e: (x, y) => `«${x}» — ${y}.` }
    },
    pop: {
      he: { q: x => `כמה תושבים יש בערך ב״${x}״?`, e: (x, y) => `ב״${x}״ גרים כ-${y} תושבים (לפי ויקינתונים).` },
      fr: { q: x => `Combien d'habitants environ compte « ${x} » ?`, e: (x, y) => `« ${x} » compte environ ${y} habitants (Wikidata).` },
      en: { q: x => `About how many people live in “${x}”?`, e: (x, y) => `About ${y} people live in “${x}” (Wikidata).` },
      ru: { q: x => `Сколько примерно жителей в «${x}»?`, e: (x, y) => `В «${x}» живёт около ${y} человек (Викиданные).` }
    }
  };
  const CATEGORY = { he: 'מסלול', fr: 'Trajet', en: 'Route', ru: 'Маршрут' };
  const SIDE_SRC = { he: 'לפי המפה', fr: 'd’après la carte', en: 'from the map', ru: 'по карте' };
  // Leurres de secours quand le trajet n'en fournit pas assez (4 langues, mêmes positions)
  const TYPE_POOL = [
    { he: 'עיר', fr: 'ville', en: 'city', ru: 'город' }, { he: 'קיבוץ', fr: 'kibboutz', en: 'kibbutz', ru: 'кибуц' },
    { he: 'מושב', fr: 'mochav', en: 'moshav', ru: 'мошав' }, { he: 'נחל', fr: 'cours d’eau', en: 'stream', ru: 'ручей' },
    { he: 'הר', fr: 'montagne', en: 'mountain', ru: 'гора' }, { he: 'אתר ארכאולוגי', fr: 'site archéologique', en: 'archaeological site', ru: 'археологический памятник' },
    { he: 'יער', fr: 'forêt', en: 'forest', ru: 'лес' },
    { he: 'שמורת טבע', fr: 'réserve naturelle', en: 'nature reserve', ru: 'заповедник' }
  ];
  const NAMED_POOL = [
    { he: 'הברון רוטשילד', fr: 'le baron Rothschild', en: 'Baron Rothschild', ru: 'барон Ротшильд' },
    { he: 'בנימין זאב הרצל', fr: 'Theodor Herzl', en: 'Theodor Herzl', ru: 'Теодор Герцль' },
    { he: 'דוד בן-גוריון', fr: 'David Ben-Gourion', en: 'David Ben-Gurion', ru: 'Давид Бен-Гурион' },
    { he: 'יוסף טרומפלדור', fr: 'Joseph Trumpeldor', en: 'Joseph Trumpeldor', ru: 'Иосиф Трумпельдор' },
    { he: 'זאב ז׳בוטינסקי', fr: 'Zeev Jabotinsky', en: 'Ze’ev Jabotinsky', ru: 'Зеэв Жаботинский' },
    { he: 'חיים נחמן ביאליק', fr: 'Haïm Nahman Bialik', en: 'Hayim Nahman Bialik', ru: 'Хаим Нахман Бялик' },
    { he: 'אליעזר בן-יהודה', fr: 'Eliezer Ben-Yehuda', en: 'Eliezer Ben-Yehuda', ru: 'Элиэзер Бен-Иегуда' }
  ];

  // ------------------------------------------------------------------ Petits outils
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };
  const rng = seed => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296);
  const clean = t => String(t || '').replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  // découpe en phrases (on évite de couper « ע״י », « St. », « 3.5 »)
  function sentences(t) {
    const out = [];
    for (const part of clean(t).split(/(?<=[^\s״"׳'.]{2}[.!?])\s+(?=[^\s\d])/)) if (part.trim()) out.push(part.trim());
    return out;
  }
  const words = t => String(t).split(/\s+/).filter(Boolean).length;
  const label = (labels, l) => (labels && (labels[l] || labels.he || labels.en)) || '';
  const fmtInt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const roundPop = n => { const k = Math.pow(10, Math.max(0, String(Math.round(n)).length - 2)); return Math.round(n / k) * k; };

  // ------------------------------------------------------------------ Wikidata → faits utilisables
  // entity = réponse wbgetentities (labels, descriptions, claims, sitelinks)
  function claimValue(e, pid) {
    const c = e && e.claims && e.claims[pid];
    if (!c) return null;
    const best = c.find(x => x.rank === 'preferred') || c.find(x => x.rank !== 'deprecated') || c[0];
    const v = best && best.mainsnak && best.mainsnak.datavalue && best.mainsnak.datavalue.value;
    return v == null ? null : v;
  }
  const qidOf = v => v && typeof v === 'object' && v.id ? v.id : null;
  function yearOf(v) {
    const m = v && typeof v === 'object' && /^([+-])0*(\d{1,4})-/.exec(v.time || '');
    return m && m[1] === '+' ? +m[2] : null;
  }
  const labelsOf = e => {
    const o = {};
    for (const l of LANGS) if (e && e.labels && e.labels[l]) o[l] = e.labels[l].value;
    return o;
  };
  function facts(e, refs) {
    const f = {};
    const named = qidOf(claimValue(e, 'P138'));
    if (named && refs[named] && refs[named].he) f.named = refs[named];
    const y = yearOf(claimValue(e, 'P571'));
    if (y && y >= 1000 && y <= new Date().getFullYear()) f.year = y;
    const type = qidOf(claimValue(e, 'P31'));
    if (type && refs[type] && refs[type].he) f.type = Object.assign({ qid: type }, refs[type]);
    const pop = claimValue(e, 'P1082');
    const n = pop && pop.amount ? Math.abs(parseFloat(pop.amount)) : 0;
    if (n >= 50) f.pop = n;
    return f;
  }

  // ------------------------------------------------------------------ Fabrication des 4 réponses
  function threeDistinct(correct, pool, key, eq) {
    const r = rng(hash(key)), seen = [correct], out = [];
    const cand = pool.slice().sort(() => r() - 0.5);
    for (const c of cand) { if (out.length === 3) break; if (!seen.some(s => eq(s, c))) { seen.push(c); out.push(c); } }
    return out.length === 3 ? out : null;
  }
  function yearDistractors(y, key) {
    const r = rng(hash(key)), now = new Date().getFullYear(), out = new Set();
    const steps = [7, 12, 19, 26, 33, 41, 52, 64];
    let guard = 0;
    while (out.size < 3 && guard++ < 50) {
      const d = steps[Math.floor(r() * steps.length)] * (r() < 0.5 ? -1 : 1);
      const v = y + d;
      if (v !== y && v <= now && v > 1000) out.add(v);
    }
    return out.size === 3 ? [...out] : null;
  }
  function popDistractors(n) {
    const base = roundPop(n);
    const opts = [Math.max(10, roundPop(n / 4)), roundPop(n * 3), roundPop(n * 10)].filter(v => v !== base);
    return new Set(opts).size === 3 ? opts : null;
  }

  // une question = un modèle + la bonne réponse + 3 leurres, dans les 4 langues, MÊME ordre partout
  function makeQuestion(kind, place, f, ctx, idx) {
    const key = place.qid + ':' + kind;
    let right, wrong;            // valeurs { he, fr, en, ru } (ou nombres)
    if (kind === 'named') {
      right = f.named;
      wrong = threeDistinct(right, ctx.namedPool, key, (a, b) => a.he === b.he);
    } else if (kind === 'type') {
      right = f.type;
      wrong = threeDistinct(right, ctx.typePool, key, (a, b) => a.he === b.he);
    } else if (kind === 'year') {
      right = f.year; wrong = yearDistractors(f.year, key);
    } else if (kind === 'pop') {
      right = roundPop(f.pop); wrong = popDistractors(f.pop);
    }
    if (!wrong) return null;
    const pos = (idx * 3 + 1) % 4;            // bonne réponse répartie sur les 4 positions
    const vals = wrong.slice(); vals.splice(pos, 0, right);
    const show = (v, l) => typeof v === 'number' ? (kind === 'pop' ? fmtInt(v) : String(v)) : label(v, l);
    const out = { kind, correct_index: pos, i18n: {} };
    for (const l of LANGS) {
      const name = place.labels[l] || place.labels.he;
      out.i18n[l] = { text: T[kind][l].q(name), options: vals.map(v => show(v, l)),
        explanation: T[kind][l].e(name, show(right, l)), category: CATEGORY[l] };
    }
    if (new Set(out.i18n.he.options).size !== 4) return null;
    return out;
  }

  // ------------------------------------------------------------------ Assemblage (pur)
  // input : { G (moteur GPS), geometry [[lat,lon]], from {name, point}, to {name, point}, durationSec,
  //           places [{ qid, title, lat, lon, entity, extracts {he: '…', fr: …} , url }], refs {qid: labels} }
  // options : { maxOffM (1500), count (auto), minSpacingM (auto) }
  function build(input, options) {
    const o = Object.assign({ maxOffM: 1500 }, options);
    const G = input.G;
    const geometry = input.geometry;
    const base = { status: 'verified', corridorM: { verified: 150, approximate: 150 }, geometry, roads: [], stops: [] };
    const P0 = G.prepare(base);
    const L = P0.length;
    const speedKmh = input.durationSec > 0 ? Math.max(15, Math.min(110, L / input.durationSec * 3.6)) : 60;
    const count = o.count || Math.max(4, Math.min(20, Math.round(L / 1600)));
    const spacing = o.minSpacingM || Math.max(500, Math.min(4000, L / (count * 1.6)));

    // 1. candidats : lieux proches de la route, avec des faits exploitables
    const seenQ = new Set(), cands = [];
    for (const p of input.places) {
      if (!p.qid || seenQ.has(p.qid) || !p.entity) continue;
      seenQ.add(p.qid);
      const loc = G.locate(P0, [p.lat, p.lon]);
      if (loc.d > o.maxOffM || loc.s < 0) continue;
      const labels = labelsOf(p.entity);
      if (!labels.he) labels.he = p.title;
      const f = facts(p.entity, input.refs || {});
      // pas de question dont la réponse est déjà dans le nom (« מה זה נחל תות? » → נחל ; « מחלף רבין » → רבין)
      const inName = t => t && String(t).split(/[\s\-־]+/).some(w => w.length >= 3 && labels.he.includes(w));
      if (f.type && inName(f.type.he)) delete f.type;
      if (f.named && inName(f.named.he)) delete f.named;
      const kinds = ['named', 'year', 'pop', 'type'].filter(k => f[k] != null);
      if (!kinds.length) continue;
      const fame = Object.keys((p.entity && p.entity.sitelinks) || {}).length;
      const he = sentences((p.extracts || {}).he || '');
      const score = kinds.length * 3 + Math.min(8, fame) + (he.length ? 4 : 0) - loc.d / 400;
      cands.push({ p, loc, labels, f, kinds, score, he });
    }
    // 2. choix : les meilleurs, espacés le long du trajet
    const chosen = [];
    for (const c of cands.slice().sort((a, b) => b.score - a.score)) {
      if (chosen.length >= count) break;
      if (chosen.some(x => Math.abs(x.loc.s - c.loc.s) < spacing)) continue;
      chosen.push(c);
    }
    chosen.sort((a, b) => a.loc.s - b.loc.s);

    // leurres tirés du trajet lui-même (plus crédibles), complétés par les listes de secours
    const typePool = [], namedPool = [];
    for (const c of cands) {
      if (c.f.type && !typePool.some(t => t.he === c.f.type.he)) typePool.push(c.f.type);
      if (c.f.named && !namedPool.some(t => t.he === c.f.named.he)) namedPool.push(c.f.named);
    }
    for (const t of TYPE_POOL) if (!typePool.some(x => x.he === t.he)) typePool.push(t);
    for (const t of NAMED_POOL) if (!namedPool.some(x => x.he === t.he)) namedPool.push(t);
    const ctx = { typePool: typePool.filter(t => LANGS.every(l => t[l])), namedPool: namedPool.filter(t => LANGS.every(l => t[l])) };

    // 3. une question par lieu, en variant les modèles
    const used = { named: 0, year: 0, pop: 0, type: 0 };
    const stops = [], questions = [];
    chosen.forEach(c => {
      const kinds = c.kinds.slice().sort((a, b) => used[a] - used[b] || ['named', 'year', 'pop', 'type'].indexOf(a) - ['named', 'year', 'pop', 'type'].indexOf(b));
      let q = null;
      for (const k of kinds) { q = makeQuestion(k, { qid: c.p.qid, labels: c.labels }, c.f, ctx, questions.length); if (q) break; }
      if (!q) return;
      used[q.kind]++;
      const n = questions.length + 1, key = 'P' + n;
      const guide = {};
      for (const l of LANGS) {
        const ss = l === 'he' ? c.he : sentences((c.p.extracts || {})[l] || '');
        const src = ss.length ? ss : c.he;
        const script = src.slice(0, 2).join(' ');
        const nmL = c.labels[l] || c.labels.he;
        const cue = { he: `כשמתקרבים ל${nmL}`, fr: `En approchant de ${nmL}`, en: `When approaching ${nmL}`, ru: `При приближении к ${nmL}` }[l];
        guide[l] = { script: words(script) > 45 ? src[0] : script, more: src.slice(2, 5), fact: '', cue, caution: '' };
      }
      const desc = {};
      for (const l of LANGS) desc[l] = (c.p.entity.descriptions && c.p.entity.descriptions[l] && c.p.entity.descriptions[l].value) || '';
      stops.push({ id: key, question: key, main: true, name: c.labels, anchor: [c.p.lat, c.p.lon],
        anchorSource: 'Wikipedia/Wikidata', beforeM: 350, afterM: 450, offRoadM: c.loc.d,
        side: c.loc.d >= 60 ? { verified: true, value: c.loc.side } : { verified: false, docs: { he: 'על הכביש', fr: 'sur la route', en: 'on the road', ru: 'на дороге' } },
        look: desc, prio: 2 });
      questions.push({ key, kind: q.kind, text: q.i18n.he.text, options: q.i18n.he.options, correct_index: q.correct_index,
        explanation: q.i18n.he.explanation, category: CATEGORY.he,
        i18n: { fr: q.i18n.fr, en: q.i18n.en, ru: q.i18n.ru },
        guide_short: guide.he.script, guide_i18n: guide,
        guide_sources: [c.p.url ? { title: c.p.title + ' — ויקיפדיה', url: c.p.url } : null,
          { title: 'Wikidata ' + c.p.qid, url: 'https://www.wikidata.org/wiki/' + c.p.qid }].filter(Boolean),
        route_meta: { stop: key, qid: c.p.qid, offRoadM: c.loc.d, side: c.loc.side } });
    });

    const from = input.from || {}, to = input.to || {};
    const nm4 = n => ({ he: n, fr: n, en: n, ru: n });
    const route = {
      id: 'AUTO', version: 1, status: 'verified', auto: true,
      title: nm4(`${from.name || ''} → ${to.name || ''}`), origin: nm4(from.name || ''),
      corridorM: { verified: 150, approximate: 150 },
      roads: [{ fromVertex: 0, toVertex: geometry.length - 1, he: 'המסלול', fr: 'Le trajet', en: 'The route', ru: 'Маршрут', speedKmh: Math.round(speedKmh) }],
      geometry,
      destination: Object.assign(nm4(to.name || ''), { point: to.point || geometry[geometry.length - 1], verified: true }),
      finish: { enabled: false, needSec: 170 }, minGapSec: 90,
      lengthM: Math.round(L), durationSec: Math.round(input.durationSec || 0),
      stops
    };
    return { route, questions, stats: { lengthM: Math.round(L), candidates: cands.length, places: input.places.length, chosen: questions.length } };
  }

  // ------------------------------------------------------------------ Réseau (gratuit, sans clé)
  async function getJson(fetchFn, url, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 20000) : null;
    try {
      const r = await fetchFn(url, ctl ? { signal: ctl.signal, headers: { Accept: 'application/json' } } : undefined);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }
  const qs = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
    return out;
  }

  // adresse ou nom de lieu → point (Nominatim). Accepte aussi « 32.59, 34.93 ».
  async function geocode(text, fetchFn) {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text || '');
    if (m) return { name: text.trim(), point: [+m[1], +m[2]] };
    const j = await getJson(fetchFn, 'https://nominatim.openstreetmap.org/search?' + qs({ q: text, format: 'jsonv2', limit: 1, 'accept-language': UA_LANG }));
    if (!j || !j[0]) throw new Error('not_found:' + text);
    return { name: text.trim(), point: [+j[0].lat, +j[0].lon], display: j[0].display_name };
  }
  // trajet routier (OSRM, serveur de démonstration public)
  async function routeBetween(a, b, fetchFn) {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const j = await getJson(fetchFn, url, 30000);
    if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('no_route');
    const r = j.routes[0];
    return { geometry: r.geometry.coordinates.map(([lon, lat]) => [+lat.toFixed(6), +lon.toFixed(6)]), distanceM: r.distance, durationSec: r.duration };
  }
  // allège le tracé (le moteur n'a pas besoin de milliers de points)
  function thin(G, geometry, tolM) {
    const P = G.prepare({ status: 'verified', geometry, roads: [], stops: [] });
    const kept = G.simplify(P.pts, tolM || 8);
    return kept.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)]);
  }
  // points d'échantillonnage le long du trajet pour la recherche des lieux
  function samples(G, geometry, stepM) {
    const P = G.prepare({ status: 'verified', geometry, roads: [], stops: [] });
    const out = [];
    for (let s = 0; s <= P.length; s += stepM) { const p = G.pointAt(P, s); out.push([p.lat, p.lon]); }
    const last = geometry[geometry.length - 1]; out.push(last);
    return { pts: out, length: P.length };
  }

  async function generate(opts, onStep) {
    const G = opts.G, f = opts.fetch || ((u, i) => fetch(u, i));
    const step = (k, extra) => { if (onStep) onStep(k, extra); };
    step('geocode');
    const from = await geocode(opts.from, f), to = await geocode(opts.to, f);
    step('route');
    const rt = await routeBetween(from.point, to.point, f);
    const geometry = thin(G, rt.geometry, 8);
    // lieux Wikipédia (hébreu d'abord, puis anglais si le trajet est peu couvert)
    const sm = samples(G, geometry, Math.max(1500, rt.distanceM / 90));
    const radius = 2000;
    const places = new Map();
    for (const wiki of ['he', 'en']) {
      if (wiki === 'en' && places.size >= 25) break;
      step('places', { wiki });
      await pool(sm.pts, 4, async ([lat, lon]) => {
        const j = await getJson(f, `https://${wiki}.wikipedia.org/w/api.php?` + qs({ action: 'query', list: 'geosearch', gscoord: lat + '|' + lon, gsradius: radius, gslimit: 50, format: 'json', origin: '*' })).catch(() => null);
        for (const g of (j && j.query && j.query.geosearch) || []) {
          const k = wiki + ':' + g.pageid;
          if (!places.has(k)) places.set(k, { wiki, pageid: g.pageid, title: g.title, lat: g.lat, lon: g.lon });
        }
      });
    }
    step('facts', { n: places.size });
    // pages → identifiants Wikidata
    const list = [...places.values()];
    for (const wiki of ['he', 'en']) {
      const ids = list.filter(p => p.wiki === wiki).map(p => p.pageid);
      for (const c of chunks(ids, 50)) {
        const j = await getJson(f, `https://${wiki}.wikipedia.org/w/api.php?` + qs({ action: 'query', pageids: c.join('|'), prop: 'pageprops', ppprop: 'wikibase_item', format: 'json', origin: '*' })).catch(() => null);
        for (const pg of Object.values((j && j.query && j.query.pages) || {})) {
          const p = places.get(wiki + ':' + pg.pageid);
          if (p && pg.pageprops && pg.pageprops.wikibase_item) p.qid = pg.pageprops.wikibase_item;
        }
      }
    }
    // faits Wikidata
    const byQ = new Map(); for (const p of list) if (p.qid && !byQ.has(p.qid)) byQ.set(p.qid, p);
    const ents = {};
    for (const c of chunks([...byQ.keys()], 50)) {
      const j = await getJson(f, 'https://www.wikidata.org/w/api.php?' + qs({ action: 'wbgetentities', ids: c.join('|'), props: 'labels|descriptions|claims|sitelinks', languages: LANGS.join('|'), sitefilter: LANGS.map(l => l + 'wiki').join('|'), format: 'json', origin: '*' })).catch(() => null);
      Object.assign(ents, (j && j.entities) || {});
    }
    const refIds = new Set();
    for (const e of Object.values(ents)) for (const pid of ['P31', 'P138']) { const id = qidOf(claimValue(e, pid)); if (id) refIds.add(id); }
    const refs = {};
    for (const c of chunks([...refIds], 50)) {
      const j = await getJson(f, 'https://www.wikidata.org/w/api.php?' + qs({ action: 'wbgetentities', ids: c.join('|'), props: 'labels', languages: LANGS.join('|'), format: 'json', origin: '*' })).catch(() => null);
      for (const [id, e] of Object.entries((j && j.entities) || {})) refs[id] = labelsOf(e);
    }
    // résumés Wikipédia (le texte du guide), dans chaque langue disponible
    step('texts');
    const extracts = {};
    for (const l of LANGS) {
      const titles = [];
      for (const [q, e] of Object.entries(ents)) { const sl = e.sitelinks && e.sitelinks[l + 'wiki']; if (sl) titles.push([q, sl.title]); }
      for (const c of chunks(titles, 20)) {
        const j = await getJson(f, `https://${l}.wikipedia.org/w/api.php?` + qs({ action: 'query', titles: c.map(x => x[1]).join('|'), prop: 'extracts', exintro: 1, explaintext: 1, exsentences: 5, exlimit: 20, redirects: 1, format: 'json', origin: '*' })).catch(() => null);
        const byTitle = {};
        for (const pg of Object.values((j && j.query && j.query.pages) || {})) if (pg.extract) byTitle[pg.title] = pg.extract;
        const norm = {}; for (const n of ((j && j.query && j.query.normalized) || []).concat((j && j.query && j.query.redirects) || [])) norm[n.from] = n.to;
        for (const [q, t] of c) { const x = byTitle[t] || byTitle[norm[t]]; if (x) (extracts[q] = extracts[q] || {})[l] = x; }
      }
    }
    step('build');
    const placesOut = [...byQ.values()].filter(p => ents[p.qid]).map(p => {
      const e = ents[p.qid], hel = e.sitelinks && e.sitelinks.hewiki;
      return { qid: p.qid, title: p.title, lat: p.lat, lon: p.lon, entity: e, extracts: extracts[p.qid] || {},
        url: hel ? 'https://he.wikipedia.org/wiki/' + encodeURIComponent(hel.title.replace(/ /g, '_')) : `https://${p.wiki}.wikipedia.org/?curid=${p.pageid}` };
    });
    return build({ G, geometry, from, to, durationSec: rt.durationSec, places: placesOut, refs }, opts.build);
  }

  // ------------------------------------------------------------------ Document du joueur (facultatif)
  // Pour chaque lieu du parcours on cherche son nom dans le texte (dans les 4 langues) :
  //  * les phrases trouvées deviennent le texte « 🎤 » (à la place de Wikipédia) ;
  //  * une phrase qui contient une année devient une question « complétez l'année » tirée du document.
  // Aucune IA : seulement les phrases du document, recopiées telles quelles.
  const CLOZE = {
    he: c => `השלימו את השנה: ״${c}״`, fr: c => `Complétez l’année : « ${c} »`,
    en: c => `Fill in the year: “${c}”`, ru: c => `Вставьте год: «${c}»`
  };
  const YEAR = /(^|[^\d])(1[5-9]\d\d|20[0-2]\d)(?!\d)/;
  function docLang(text) {
    const he = (text.match(/[\u0590-\u05FF]/g) || []).length, ru = (text.match(/[\u0400-\u04FF]/g) || []).length;
    const lat = (text.match(/[a-zà-ÿ]/gi) || []).length;
    if (he >= ru && he >= lat) return 'he';
    if (ru >= lat) return 'ru';
    return /\b(le|la|les|des|est|une|du)\b/i.test(text) ? 'fr' : 'en';
  }
  // noms à chercher : le nom du lieu dans chaque langue, et sans le mot générique (« מושב », « kibbutz »…)
  function namesOf(stop) {
    const out = new Set();
    for (const l of LANGS) {
      const n = clean((stop.name || {})[l] || '');
      if (n.length >= 3) out.add(n);
      const short = n.replace(/^(מושב|קיבוץ|כפר|נחל|הר|תל|moshav|kibbutz|kibboutz|mochav|tel|mount|mont|кибуц|мошав|гора)\s+/i, '');
      if (short !== n && short.length >= 3) out.add(short);
    }
    return [...out];
  }
  function applyDoc(res, text) {
    const lang = docLang(text);
    const sents = String(text).split(/\n+/).flatMap(sentences).filter(x => words(x) >= 4 && words(x) <= 60);
    const used = new Set();
    let matched = 0, made = 0;
    res.questions.forEach((q, qi) => {
      const st = res.route.stops.find(s => s.id === q.key); if (!st) return;
      const names = namesOf(st);
      const hits = sents.filter(x => !used.has(x) && names.some(n => (lang === 'he' ? x.includes(n) : x.toLowerCase().includes(n.toLowerCase())))).slice(0, 4);
      if (!hits.length) return;
      matched++;
      hits.forEach(h => used.add(h));
      const nmL = st.name[lang] || st.name.he;
      q.guide_i18n[lang] = Object.assign({}, q.guide_i18n[lang], { script: hits[0], more: hits.slice(1), src: 'doc' });
      if (lang === 'he') q.guide_short = hits[0];
      // une phrase du document avec une année → question à trous
      const ys = hits.find(h => YEAR.test(h) && words(h) >= 6 && words(h) <= 35);
      if (!ys) return;
      const y = +YEAR.exec(ys)[2];
      const wrong = yearDistractors(y, 'doc:' + q.key + ':' + y);
      if (!wrong) return;
      const pos = (qi * 3 + 1) % 4, vals = wrong.slice(); vals.splice(pos, 0, y);
      const cloze = ys.replace(YEAR, (m, a) => a + '____');
      const opts = vals.map(String);
      const loc = l => ({ text: CLOZE[l](cloze), options: opts, explanation: ys, category: CATEGORY[l] });
      Object.assign(q, { kind: 'doc', correct_index: pos, text: loc('he').text, options: opts, explanation: ys,
        i18n: { fr: loc('fr'), en: loc('en'), ru: loc('ru') } });
      q.route_meta = Object.assign({}, q.route_meta, { doc: true, docLang: lang });
      q.guide_sources = [{ title: '📄 ' + nmL + ' — מהמסמך' }].concat(q.guide_sources || []);
      made++;
    });
    res.stats = Object.assign({}, res.stats, { docLang: lang, docMatched: matched, docQuestions: made });
    return res;
  }

  return { build, generate, applyDoc, geocode, routeBetween, facts, sentences, makeQuestion, LANGS, T };
});
