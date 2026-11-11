// מורה דרך EXAM — « Mon répertoire » (logique pure, testée dans tests/repertoire.test.mjs).
// Idée : à l'examen, les LIEUX changent mais les CATÉGORIES d'unités reviennent (מים, קבורה, חומות, הדרכת דרך…).
// L'élève choisit UNE fois son site de référence par région × catégorie, écrit sa fiche (≤ 180 mots),
// puis la réécrit de mémoire à intervalles croissants (révision espacée). L'examen blanc s'appuie sur ce répertoire.
(function (root) {
  'use strict';
  const CATS = [
    { id: 'view', he: 'תצפית', emoji: '🔭', tags: ['view'], kw: ['תצפית', 'מצפה', 'נוף'] },
    { id: 'road', he: 'הדרכת דרך', emoji: '🚌', tags: ['road'], kw: ['הדרכת דרך', 'בדרך', 'ק"מ', 'ק״מ', 'נסיעה'] },
    { id: 'water', he: 'מים', emoji: '💧', tags: ['water'], kw: ['מים', 'מפעל המים', 'בריכ', 'באר', 'מעיין', 'אמת'] },
    { id: 'burial', he: 'קבורה והנצחה', emoji: '🪦', tags: ['burial', 'memorial', 'commemoration'], kw: ['קבורה', 'קבר', 'קברות', 'הנצחה', 'אנדרט'] },
    { id: 'walls', he: 'חומות, שערים וביצורים', emoji: '🏰', tags: ['fortification'], kw: ['חומ', 'שער', 'ביצור', 'מצוד', 'מבצר'] },
    { id: 'worship', he: 'בית כנסת ומקומות פולחן', emoji: '🕍', tags: ['synagogue', 'christianity', 'islam', 'religions'], kw: ['בית הכנסת', 'בית כנסת', 'כנסיי', 'מסגד', 'מקדש', 'פולחן', 'הר הבית'] },
    { id: 'battle', he: 'מלחמות וקרבות', emoji: '⚔️', tags: ['battle'], kw: ['מלחמת', 'קרב', 'מבצע', 'שייר'] },
    { id: 'settle', he: 'התיישבות ומורשת', emoji: '🏡', tags: ['settlement', 'modern_settlement', 'zionist_settlement', 'ottoman', 'templers'], kw: ['מושב', 'עלייה', 'התיישבות', 'ראשית', 'עות'] },
    { id: 'geo', he: 'גאולוגיה, מערות וטבע', emoji: '🪨', tags: ['geology', 'caves', 'volcanism', 'nature', 'fauna'], kw: ['גאולוג', 'גיאולוג', 'מער', 'נקרה', 'שמורה', 'סובב', 'שביל'] },
    { id: 'city', he: 'עיר עתיקה וארכאולוגיה', emoji: '⛏️', tags: ['city', 'archaeology'], kw: ['תל ', 'עיר', 'בית ', 'רחוב', 'מחלף', 'דגם', 'ארכיאולוג', 'ארכאולוג'] }
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const DAY = 864e5;
  const STEPS = [1, 3, 7, 21, 60];          // jours avant la prochaine révision, selon l'étape atteinte
  const MASTER = 3;                         // à partir de l'étape 3 (révision à J+21), la case est « maîtrisée »
  const PASS = 70;                          // % de mots-clés retrouvés pour avancer d'une étape

  const fitsCat = (place, cat) => !!place && (CAT[cat] ? CAT[cat].tags : []).some(t => (place.tags || []).includes(t));
  // Lieux d'une région qui conviennent à une catégorie (route : seulement pour « הדרכת דרך »)
  function candidates(data, cat) {
    if (!data) return [];
    const pool = cat === 'road' ? (data.roads || []) : (data.sites || []);
    return pool.filter(p => fitsCat(p, cat)).sort((a, b) => (b.facts || []).length - (a.facts || []).length);
  }
  // Catégorie d'une consigne d'examen : d'abord les tags demandés, sinon les mots de la consigne
  function catOfSlot(slot) {
    const need = (slot && slot.need) || [];
    const byTag = CATS.find(c => c.id !== 'city' && c.tags.some(t => need.includes(t)));
    if (byTag) return byTag.id;
    const he = (slot && slot.he) || '';
    const byWord = CATS.find(c => c.kw.some(k => he.includes(k)));
    return byWord ? byWord.id : (need.length ? 'city' : null);
  }

  // ---------- Comparaison « de mémoire » ----------
  const NIQQUD = /[֑-ׇ]/g;
  const STOP = new Set('את של על עם אל גם כי לא אבל או זה זו זאת הוא היא הם הן אנחנו אתם כאן שם יש אין היה הייתה היו כל עוד רק מה מי למה איך כמו אחרי לפני בין תחת מעל כך אז עכשיו פה ועוד חברים בואו הביטו שימו לב'.split(' '));
  const clean = w => w.replace(NIQQUD, '').replace(/[״"׳'`]/g, '').replace(/[^\u05D0-\u05EA0-9-]/g, '');
  // Formes possibles d'un mot : tel quel, puis sans 1 ou 2 lettres de préfixe (ו, ה, ב, ל, מ, ש, כ) — « וכשהמים » ~ « מים »
  function forms(w) {
    const out = [w];
    if (/^\d/.test(w)) return [w.replace(/-/g, '')];
    let x = w;
    for (let i = 0; i < 2 && x.length > 3 && /^[והבלמשכ]/.test(x); i++) { x = x.slice(1); out.push(x); }
    return out;
  }
  function keywords(text) {
    const out = [], seen = new Set();
    String(text || '').split(/[\s,.;:!?()\[\]–—/]+/).forEach(raw => {
      const n = clean(raw);
      if (!n || seen.has(n)) return;
      if (/^\d+$/.test(n) ? n.length < 2 : (n.length < 3 || STOP.has(n))) return;
      seen.add(n); out.push({ w: raw.replace(/[,.;:!?()]/g, ''), n, f: forms(n) });
    });
    return out;
  }
  const near = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && Math.min(a.length, b.length) >= 4 && (a.startsWith(b.slice(0, Math.max(4, b.length - 2))) || b.startsWith(a.slice(0, Math.max(4, a.length - 2)))));
  // % des mots-clés de la fiche retrouvés dans la réécriture (préfixes et terminaisons tolérés : « המחסנים » ~ « מחסן »)
  function compare(ref, attempt) {
    const K = keywords(ref), A = keywords(attempt).flatMap(x => x.f);
    const found = [], missed = [];
    K.forEach(k => (k.f.some(f => A.some(a => near(f, a))) ? found : missed).push(k.w));
    const pct = K.length ? Math.round(100 * found.length / K.length) : 0;
    return { pct, found, missed, total: K.length };
  }

  // ---------- Conditions réelles : le nom du site est écrit de mémoire, reconnu seulement à la remise ----------
  const nameTokens = t => String(t || '').replace(NIQQUD, '').replace(/[״"׳'`]/g, '').split(/[^א-ת0-9]+/).filter(w => w.length >= 2 || /^\d+$/.test(w)).map(w => forms(w));
  const sameRoot = (a, b) => near(a, b) || (a.length >= 4 && b.length >= 4 && Math.abs(a.length - b.length) <= 1 && a.slice(0, 3) === b.slice(0, 3) && a.slice(0, -1) === b.slice(0, -1));
  // Reconnaît un lieu écrit librement (« השער בתל שבע » → תל באר שבע) : chaque mot du nom pèse 1/(nombre de lieux qui l'ont),
  // on garde le lieu dont les mots retrouvés pèsent le plus (≥ 0,5). Aucun lieu reconnu → null (l'unité est notée comme telle).
  function matchPlace(text, places) {
    const T0 = nameTokens(text).flat(), T = T0.concat(T0.filter(t => t.length === 3 && /^[והבלמשכ]/.test(t)).map(t => t.slice(1)));   // « בתל » → « תל »
    if (!T.length) return null;
    const words = p => [...new Set(nameTokens([p.short, p.he].concat(p.aliases || []).join(' ')).map(f => f[f.length - 1]).filter(w => !STOP.has(w)))];
    const W = (places || []).map(p => ({ p, w: words(p) })), freq = {};
    W.forEach(x => x.w.forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
    let best = null;
    W.forEach(({ p, w }) => {
      const hit = w.filter(x => T.some(t => sameRoot(x, t)));
      const score = hit.reduce((a, x) => a + 1 / freq[x], 0), ratio = w.length ? hit.length / w.length : 0;
      if (score >= 0.5 && (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && ratio > best.ratio))) best = { id: p.id, score, ratio };
    });
    return best ? best.id : null;
  }
  // Faits du cours couverts par une réécriture, et nombres écrits qui n'apparaissent nulle part dans le cours
  function factCoverage(facts, attempt) {
    const A = keywords(attempt).flatMap(x => x.f), has = k => k.f.some(f => A.some(a => near(f, a)));
    const covered = [], missed = [];
    (facts || []).forEach(f => { const K = keywords(f.he).filter(k => !/^\d+$/.test(k.n)); if (!K.length) return; (K.filter(has).length / K.length >= 0.5 ? covered : missed).push(f); });
    const nums = s => (String(s || '').match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.'));
    const known = new Set((facts || []).flatMap(f => nums(f.he).concat(nums(f.q))));
    const stray = [...new Set(nums(attempt))].filter(n => !known.has(n) && !(+n <= 10));
    return { covered, missed, stray };
  }

  // ---------- Révision espacée ----------
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function schedule(card, pct, now) {
    const c = Object.assign({}, card);
    c.hist = (card.hist || []).concat([{ at: now, pct }]).slice(-20);
    c.step = pct >= PASS ? Math.min((card.step || 0) + 1, STEPS.length) : 0;
    c.due = startOfDay(now) + STEPS[Math.min(c.step, STEPS.length - 1)] * DAY;
    return c;
  }
  const isDue = (card, now) => !!(card && card.text && card.due != null && card.due <= now);
  function state(card, now) {
    if (!card || !card.site) return 'empty';
    if (!card.text) return 'chosen';
    if ((card.step || 0) >= MASTER) return isDue(card, now) ? 'due' : 'mastered';
    return isDue(card, now) ? 'due' : 'learning';
  }
  const key = (region, cat) => region + ':' + cat;
  function dueList(rep, now) {
    return Object.entries((rep && rep.cards) || {}).filter(([, c]) => isDue(c, now)).sort((a, b) => a[1].due - b[1].due).map(([k]) => k);
  }
  function stats(rep, region, now) {
    const s = { empty: 0, chosen: 0, learning: 0, due: 0, mastered: 0 };
    CATS.forEach(c => { s[state(((rep && rep.cards) || {})[key(region, c.id)], now)]++; });
    return s;
  }
  // Une mission vue à travers le répertoire : pour chaque unité, la catégorie et la fiche de l'élève
  function missionPrep(mission, rep, region, now) {
    const units = (mission.slots || []).map(s => ({ id: s.id, he: s.he, need: s.need })).concat(mission.long ? [{ id: 'long', he: mission.long.he, need: mission.long.need, long: true }] : []);
    return units.map(u => {
      const cat = catOfSlot(u), card = cat ? ((rep && rep.cards) || {})[key(region, cat)] : null;
      return Object.assign(u, { cat, card: card || null, state: state(card, now) });
    });
  }

  // ---------- Mission « fixe jusqu'à maîtrise » ----------
  const MASTERY = { need: 2, min: 80 };     // deux examens blancs ≥ 80 % sur le même sujet
  function mastery(results) {
    const ok = (results || []).filter(r => r.pct >= MASTERY.min).length;
    return { ok, need: MASTERY.need, done: ok >= MASTERY.need };
  }

  // ---------- Chrono par unité ----------
  // Budget pour 3 h (180 min) : לו"ז 20, chaque courte 15, développée 40, relecture = le reste. Proportionnel à la durée choisie.
  function paceBudget(totalMin, shortCount) {
    const n = shortCount || 5, f = totalMin / 180;
    const parts = [{ id: 'plan', he: 'לו״ז', min: 20 * f }];
    for (let i = 1; i <= n; i++) parts.push({ id: 'u' + i, he: 'יחידה ' + i, min: 15 * f });
    parts.push({ id: 'long', he: 'מורחבת', min: 40 * f });
    const used = parts.reduce((a, p) => a + p.min, 0);
    parts.push({ id: 'review', he: 'קריאה חוזרת', min: Math.max(0, totalMin - used) });
    let t = 0; parts.forEach(p => { p.from = Math.round(t); t += p.min; p.to = Math.round(t); p.min = Math.round(p.min); });
    return parts;
  }
  function pace(totalMin, elapsedMin, shortCount) {
    const parts = paceBudget(totalMin, shortCount);
    const cur = parts.find(p => elapsedMin < p.to) || parts[parts.length - 1];
    return { part: cur, left: Math.max(0, Math.round(cur.to - elapsedMin)), parts };
  }

  const api = { matchPlace, factCoverage, CATS, CAT, STEPS, MASTER, PASS, MASTERY, fitsCat, candidates, catOfSlot, keywords, compare, schedule, isDue, state, key, dueList, stats, missionPrep, mastery, paceBudget, pace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDRepertoire = api;
})(typeof window !== 'undefined' ? window : globalThis);
