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
      if (bank.evidencePolicy === 'drive-only') {
        const s = q.source || {};
        const m = /^https:\/\/(?:docs|drive)\.google\.com\/(?:document\/d|file\/d)\/([^/?#]+)/.exec(s.url || '');
        if (!m || m[1] !== s.driveFileId) errors.push(w + ' : référence Drive incohérente');
        if (!s.quote || !s.anchor || !s.quote.includes(s.anchor) || !s.locator || !s.verifiedAt || !/^[a-f0-9]{64}$/.test(s.sourceDigest || '')) errors.push(w + ' : preuve Drive manquante');
        if (q.reviewStatus !== 'drive-verified' || !q.reviewedAt) errors.push(w + ' : relecture non validée');
        const lengths = o.map(x => String(x).length);
        if (lengths.length === 4 && Math.max(...lengths) > 2 * Math.min(...lengths) && Math.max(...lengths) - Math.min(...lengths) > 12) errors.push(w + ' : longueurs des choix déséquilibrées');
      }
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


  // ---------- « ממבחני רישוי » : vraies questions d'examens de licence (recueil d'Efrat Nakash), solution non officielle ----------
  // Données : parta/rishui.json { sources:[{key,title,url,kind,year?}], questions:[{id,topic,src,n,year?,q,options[2–5],correct,why,conf}] }
  const RID_RE = /^Q-rishui_[a-z_]+-\d{3}$/;
  function validateRishui(data, topicIds) {
    const errors = [], warnings = [];
    if (!data || !Array.isArray(data.sources) || !Array.isArray(data.questions)) return { errors: ['structure: sources/questions manquants'], warnings };
    const topics = new Set(topicIds || []), srcs = new Map(data.sources.map(s => [s.key, s])), ids = new Set();
    data.sources.forEach(s => { if (!s.key || !s.title || !/^https:\/\/www\.efratnakash\.com\//.test(s.url || '')) errors.push('source invalide ' + (s.key || '?')); });
    data.questions.forEach((q, i) => {
      const w = `rishui #${i + 1} (${q.id || '?'})`;
      if (!RID_RE.test(q.id || '')) errors.push(w + ' : id invalide');
      if (ids.has(q.id)) errors.push(w + ' : id en double'); ids.add(q.id);
      if (!topics.has(q.topic)) errors.push(w + ' : thème inconnu ' + q.topic);
      if (q.id && q.topic && !q.id.startsWith('Q-rishui_' + q.topic + '-')) errors.push(w + ' : id et thème ne concordent pas');
      if (!srcs.has(q.src)) errors.push(w + ' : source inconnue ' + q.src);
      if (!(Number.isInteger(q.n) && q.n > 0)) errors.push(w + ' : numéro dans le PDF manquant');
      if (!q.q || !/[\u0590-\u05ff]/.test(q.q)) errors.push(w + ' : énoncé manquant ou pas en hébreu');
      const o = q.options || [];
      if (o.length < 2 || o.length > 5) errors.push(w + ' : 2 à 5 réponses attendues');
      if (o.some(x => !x || !String(x).trim())) errors.push(w + ' : réponse vide');
      if (new Set(o.map(norm)).size !== o.length) errors.push(w + ' : réponses en double');
      if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < o.length)) errors.push(w + ' : index de la bonne réponse invalide');
      if (!q.why || norm(q.why).split(' ').length > 45) errors.push(w + ' : explication manquante ou trop longue');
      if (!['high', 'medium'].includes(q.conf)) errors.push(w + ' : seules les solutions sûres (high/medium) sont publiées');
    });
    topicIds && topicIds.forEach(t => { if (!data.questions.some(q => q.topic === t)) warnings.push('rishui : aucune question pour ' + t); });
    return { errors, warnings };
  }
  // Tirage : l'ordre des réponses est GARDÉ (les choix « ב + ג נכונות » renvoient aux lettres).
  // era : 'all' | 'old' (recueil par thèmes, examens ≤ 2017) | 'new' (examens complets 2018–2024)
  function pickRishui(data, o) {
    o = o || {};
    const rnd = rng(o.seed || String(Date.now())), kind = new Map(data.sources.map(s => [s.key, s]));
    let pool = data.questions.filter(q => (!o.topic || o.topic === 'all' || q.topic === o.topic) &&
      (!o.era || o.era === 'all' || (o.era === 'new') === ((kind.get(q.src) || {}).kind === 'exam')));
    if (o.ids) pool = data.questions.filter(q => o.ids.includes(q.id));
    const avoid = new Set(o.avoid || []);
    const list = shuffle(pool.filter(q => !avoid.has(q.id)), rnd).concat(shuffle(pool.filter(q => avoid.has(q.id)), rnd)).slice(0, o.n || ROUND);
    return list.map(q => { const s = kind.get(q.src) || {};
      return { id: q.id, topic: q.topic, level: 2, q: q.q, options: q.options.slice(), correct: q.correct, explanation: q.why, conf: q.conf,
        rishui: { n: q.n, year: q.year || s.year || '', title: s.title || '', url: s.url || '', kind: s.kind || 'topic' }, tags: [] }; });
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

  return { LEVELS, ROUND, MAX_POINTS, ID_RE, RID_RE, validate, validateRishui, pickRishui, pick, points, record, grade, rng, shuffle, norm };
});
