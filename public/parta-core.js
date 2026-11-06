/* Moreh Derech NEXT — « מבחן חלק א׳ » : logique pure du quiz par thèmes (validation, tirage, score).
   Chargé tel quel par parta.html, par tools/build-parta.mjs et par les tests Node (vm). Aucun DOM, aucun réseau. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDPartA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LEVELS = { 1: { label: 'קל', ms: 45000, mult: 0.75 }, 2: { label: 'בינוני', ms: 40000, mult: 1 }, 3: { label: 'קשה', ms: 35000, mult: 1.2 } };
  const ROUND = 10, MAX_POINTS = 290;        // ≤ 290 : compatible avec la borne serveur (points ≤ answered × 300)
  const ID_RE = /^Q-[a-z_]+-\d{3}$/;

  function hash(str) { let h = 2166136261; str = String(str); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = hash(seed) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(list, rnd) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const norm = s => String(s || '').replace(/[\s"״'’«»?,.:;!()\-–—]+/g, ' ').trim().toLowerCase();

  // ---------- validation d'une banque { topics:[...], questions:[...] } ----------
  function validate(bank) {
    const errors = [], warnings = [];
    if (!bank || !Array.isArray(bank.topics) || !Array.isArray(bank.questions)) return { errors: ['structure: topics/questions manquants'], warnings };
    const topics = new Set(bank.topics.map(t => t.id)), ids = new Set(), stems = new Map();
    bank.questions.forEach((q, i) => {
      const w = `question #${i + 1} (${q.id || '?'})`;
      if (!ID_RE.test(q.id || '')) errors.push(w + ' : id invalide');
      if (ids.has(q.id)) errors.push(w + ' : id en double'); ids.add(q.id);
      if (!topics.has(q.topic)) errors.push(w + ' : thème inconnu ' + q.topic);
      if (q.id && q.topic && !q.id.startsWith('Q-' + q.topic + '-')) errors.push(w + ' : id et thème ne concordent pas');
      if (![1, 2, 3].includes(q.level)) errors.push(w + ' : niveau invalide');
      if (!q.q || norm(q.q).split(' ').length > 40) errors.push(w + ' : énoncé manquant ou trop long');
      if (!/[֐-׿]/.test(q.q || '')) errors.push(w + ' : énoncé pas en hébreu');
      const o = q.options || [];
      if (o.length !== 4) errors.push(w + ' : 4 réponses attendues');
      if (new Set(o.map(norm)).size !== o.length) errors.push(w + ' : réponses en double');
      if (o.some(x => !x || !String(x).trim())) errors.push(w + ' : réponse vide');
      if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4)) errors.push(w + ' : index de la bonne réponse invalide');
      if (o.some(x => /כל התשובות|אף תשובה|כל הנ״ל|כל הנ"ל/.test(String(x)))) errors.push(w + ' : « toutes les réponses » interdit');
      if (!q.explanation || norm(q.explanation).split(' ').length > 60) errors.push(w + ' : explication manquante ou trop longue');
      if (!q.source || !/^https?:\/\//.test(q.source.url || '')) errors.push(w + ' : source sans URL');
      const k = norm(q.q);
      if (stems.has(k)) errors.push(w + ' : même énoncé que ' + stems.get(k)); stems.set(k, q.id);
    });
    // répartition de la bonne réponse : jamais la même position sur plus de 50 % d'un thème
    bank.topics.forEach(t => {
      const qs = bank.questions.filter(q => q.topic === t.id); if (qs.length < 6) return;
      const pos = [0, 0, 0, 0]; qs.forEach(q => { if (Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4) pos[q.correct]++; });
      if (Math.max(...pos) > qs.length / 2) warnings.push(`${t.id} : la bonne réponse est trop souvent en position ${pos.indexOf(Math.max(...pos)) + 1}`);
      [1, 2, 3].forEach(l => { if (!qs.some(q => q.level === l)) warnings.push(`${t.id} : aucune question de niveau ${l}`); });
    });
    return { errors, warnings };
  }

  // ---------- tirage d'une manche ----------
  // topic : id ou 'all' ; level : 1–3 ou 0 (tous) ; seed : reproductible ; avoid : ids déjà joués (priorité aux nouvelles)
  function pick(bank, o) {
    o = o || {};
    const rnd = rng(o.seed || String(Date.now()));
    let pool = bank.questions.filter(q => (o.topic === 'all' || !o.topic || q.topic === o.topic) && (!o.level || q.level === o.level));
    if (o.ids) pool = bank.questions.filter(q => o.ids.includes(q.id));
    const avoid = new Set(o.avoid || []);
    const fresh = shuffle(pool.filter(q => !avoid.has(q.id)), rnd), seen = shuffle(pool.filter(q => avoid.has(q.id)), rnd);
    const n = o.n || ROUND;
    return fresh.concat(seen).slice(0, n).map(q => {
      // les réponses sont mélangées à l'affichage ; on garde l'index de la bonne réponse
      const order = shuffle([0, 1, 2, 3], rnd);
      return { id: q.id, topic: q.topic, level: q.level, q: q.q, options: order.map(i => q.options[i]), correct: order.indexOf(q.correct),
        explanation: q.explanation, source: q.source, tags: q.tags || [], illustration: q.illustration || null };
    });
  }

  // ---------- score ----------
  // 100 points pour une bonne réponse + bonus de rapidité (≤ 90) + série (≤ 100), × coefficient du niveau, plafonné à 290.
  function points(correct, elapsedMs, level, streak) {
    if (!correct) return 0;
    const L = LEVELS[level] || LEVELS[2];
    const speed = Math.max(0, Math.round(90 * (1 - Math.min(elapsedMs, L.ms) / L.ms)));
    const s = Math.min(100, Math.max(0, streak - 1) * 20);
    return Math.min(MAX_POINTS, Math.round((100 + speed + s) * L.mult));
  }
  // Enregistrement envoyé à progress.savePartA (même famille que saveArch : meilleur score par question)
  function record(items, answers, o) {
    let streak = 0, score = 0, right = 0;
    const details = items.map(it => {
      const a = answers[it.id];
      const ok = !!a && a.choice === it.correct;
      streak = ok ? streak + 1 : 0; if (ok) right++;
      const p = a ? points(ok, a.ms || 0, it.level, streak) : 0; score += p;
      return { itemId: it.id, correct: ok, points: p };
    });
    return { version: 1, kind: 'parta', mode: o.mode || 'round', topic: o.topic || 'all', level: o.level || 0, runId: o.runId,
      completedAt: o.completedAt || new Date().toISOString(), answerDetails: details, correct: right, total: items.length, score };
  }
  const grade = (right, total) => (total ? right / total : 0) >= 0.9 ? { he: 'מצוין — רמת מבחן!', emoji: '🏆' } : (right / total) >= 0.7 ? { he: 'טוב מאוד — עוד קצת ואתם שם', emoji: '⭐' } : (right / total) >= 0.5 ? { he: 'בסדר — כדאי לחזור על ההסברים', emoji: '📖' } : { he: 'לא נורא — זה בדיוק בשביל זה מתאמנים', emoji: '💪' };

  // ---------- « מבחן מחצית » : simulation d'une vraie épreuve (45 QCM + 45 השלמה, 40 comptées par partie) ----------
  // Règle de l'énoncé : on répond à 40 questions sur 45 ; si on répond à plus, seules les 40 premières (dans l'ordre) comptent.
  function countable(answered, limit) {
    const lim = limit || 40, ns = answered.map(Number).sort((a, b) => a - b);
    return { counted: ns.slice(0, lim), ignored: ns.slice(lim) };
  }
  // Variante sans article défini (ה) en tête de mot : « הירדן » = « ירדן ».
  const bare = s => norm(s).split(' ').map(w => (w.length > 3 && w[0] === 'ה' ? w.slice(1) : w)).join(' ');
  // Réponse libre : true = acceptée, null = à vérifier soi-même (jamais false : une formulation différente peut être juste).
  function matchFill(input, answers) {
    const a = bare(input); if (!a) return null;
    for (const x of answers || []) {
      const b = bare(x); if (!b) continue;
      if (a === b) return true;
      if ((' ' + a + ' ').includes(' ' + b + ' ')) return true;              // « נהר הירדן הצפוני » contient « ירדן »
    }
    return null;
  }
  function validateMidterm(m) {
    const errors = [];
    if (!m || !Array.isArray(m.mcq) || !Array.isArray(m.fill)) return { errors: ['structure: mcq/fill manquants'] };
    [['mcq', m.mcq], ['fill', m.fill]].forEach(([k, list]) => {
      list.forEach((q, i) => {
        const w = `${k} #${q.n}`;
        if (q.n !== i + 1) errors.push(w + ' : numérotation non continue');
        if (!q.q || !/[֐-׿]/.test(q.q)) errors.push(w + ' : énoncé manquant');
        if (!q.explanation) errors.push(w + ' : explication manquante');
        if (k === 'mcq') {
          if ((q.options || []).length !== 4) errors.push(w + ' : 4 réponses attendues');
          if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4)) errors.push(w + ' : bonne réponse invalide');
        } else if (!(q.answers || []).length) errors.push(w + ' : aucune réponse acceptée');
      });
    });
    if (m.mcq.length !== m.rules.questions || m.fill.length !== m.rules.questions) errors.push('nombre de questions ≠ ' + m.rules.questions);
    return { errors };
  }
  // st : { mcq: {n: choix}, fill: {n: texte}, self: {n: true|false} }
  function scoreMidterm(m, st) {
    const R = m.rules, part = (list, kind) => {
      const ans = kind === 'mcq' ? st.mcq || {} : st.fill || {};
      const answered = list.filter(q => kind === 'mcq' ? Number.isInteger(ans[q.n]) : String(ans[q.n] || '').trim()).map(q => q.n);
      const c = countable(answered, R.answer), set = new Set(c.counted);
      let right = 0, pending = 0;
      const items = list.map(q => {
        const counted = set.has(q.n), given = ans[q.n];
        let ok;
        if (kind === 'mcq') ok = Number.isInteger(given) ? given === q.correct : null;
        else if (!String(given || '').trim()) ok = null;
        else { const auto = matchFill(given, q.answers); ok = auto === true ? true : (st.self && typeof st.self[q.n] === 'boolean' ? st.self[q.n] : 'pending'); }
        if (counted && ok === true) right++;
        if (counted && ok === 'pending') pending++;
        return { n: q.n, counted, ok, given };
      });
      return { items, right, pending, answered: answered.length, counted: c.counted.length, ignored: c.ignored, got: right * R.points, max: R.answer * R.points };
    };
    const mcq = part(m.mcq, 'mcq'), fill = part(m.fill, 'fill');
    const got = mcq.got + fill.got, max = mcq.max + fill.max;
    return { mcq, fill, got, max, pct: Math.round(100 * got / max), pending: mcq.pending + fill.pending };
  }

  return { LEVELS, ROUND, MAX_POINTS, ID_RE, validate, pick, points, record, grade, rng, shuffle, norm, countable, matchFill, validateMidterm, scoreMidterm };
});
