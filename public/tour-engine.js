/* Moreh Derech NEXT — moteur des parcours « סיפור דרך » (généralisation de la route 67).
   Logique pure, sans DOM ni réseau : utilisée par parcours.html, par tools/build-tours.mjs et par les tests Node.
   Le déplacement le long du trajet (GPS réel, simulation) est confié à gps-engine.js, comme pour la route 67. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDTourEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUSES = ['a_importer', 'en_analyse', 'a_verifier', 'pret'];
  const STATUS_LABEL = {
    a_importer: { he: 'לייבוא', fr: 'À importer' },
    en_analyse: { he: 'בניתוח', fr: 'En cours d’analyse' },
    a_verifier: { he: 'לבדיקה', fr: 'À vérifier' },
    pret: { he: 'מוכן לפרסום', fr: 'Prêt à publier' }
  };
  // Nature d'une source : ce que le prof a dit (enregistrement), un document du cours, ou un complément extérieur.
  const SOURCE_KINDS = ['transcript', 'course-doc', 'external'];
  const SOURCE_LABEL = { transcript: '🎙️ מתוך ההקלטה', 'course-doc': '📚 מסמך הקורס', external: '🌐 השלמה חיצונית' };
  // Certitude d'une question : seules « firm » et « approx » vont dans l'examen noté.
  const CERTAINTY = ['firm', 'approx', 'anecdote', 'check'];
  const TYPES = ['mcq', 'recognize', 'error', 'side'];
  const DURATION_MS = 30000, MAX_POINTS = 290;

  // ---------------------------------------------------------------- validation
  // Renvoie { errors, warnings } : une erreur empêche la publication, un avertissement non.
  function validate(t) {
    const errors = [], warnings = [];
    if (!t || t.v !== 1) return { errors: ['format: v != 1'], warnings };
    if (!/^(?:\d{2}|road67)$/.test(t.id || '')) errors.push('id invalide : ' + t.id);
    if (!STATUSES.includes(t.status)) errors.push('statut inconnu : ' + t.status);
    if (!t.title) errors.push('titre manquant');
    const stops = t.stops || [], ids = new Set();
    if (stops.length < 2) errors.push('moins de 2 lieux');
    stops.forEach((s, i) => {
      const w = `lieu ${s.id || i}`;
      if (!/^[a-z0-9-]+$/.test(s.id || '')) errors.push(w + ' : id invalide');
      if (ids.has(s.id)) errors.push(w + ' : id en double'); ids.add(s.id);
      if (!s.name) errors.push(w + ' : nom manquant');
      if (!s.coord) errors.push(w + ' : pas de coordonnées vérifiables');
      else {
        if (!(s.coord.lat > 29 && s.coord.lat < 33.5 && s.coord.lon > 34 && s.coord.lon < 36)) errors.push(w + ' : coordonnées hors d’Israël');
        if (!s.coord.source) errors.push(w + ' : coordonnées sans source');
      }
      if (s.side && s.side.teacher && s.side.computed && s.side.teacher !== s.side.computed) warnings.push(w + ` : côté du prof (${s.side.teacher}) ≠ côté calculé (${s.side.computed})`);
      if (s.offRoadM > 4000) warnings.push(w + ` : à ${Math.round(s.offRoadM / 100) / 10} km du tracé`);
    });
    for (let i = 1; i < stops.length; i++) if (stops[i].s != null && stops[i - 1].s != null && stops[i].s + 300 < stops[i - 1].s) warnings.push(`ordre : ${stops[i].id} est avant ${stops[i - 1].id} sur le trajet`);
    const qids = new Set();
    (t.questions || []).forEach((q, i) => {
      const w = `question ${q.id || i}`;
      if (qids.has(q.id)) errors.push(w + ' : id en double'); qids.add(q.id);
      if (!TYPES.includes(q.type)) errors.push(w + ' : type inconnu');
      if (!ids.has(q.stop)) errors.push(w + ' : lieu inconnu ' + q.stop);
      if (!CERTAINTY.includes(q.certainty)) errors.push(w + ' : certitude inconnue');
      if (!q.prompt) errors.push(w + ' : énoncé manquant');
      const opts = q.options || [];
      if (opts.length < 2 || opts.length > 4) errors.push(w + ' : 2 à 4 réponses');
      if (new Set(opts).size !== opts.length) errors.push(w + ' : réponses en double');
      if (!(q.correct >= 0 && q.correct < opts.length)) errors.push(w + ' : bonne réponse invalide');
      if (!q.explanation) errors.push(w + ' : explication manquante');
      const src = q.sources || [];
      if (!src.length) errors.push(w + ' : aucune source');
      src.forEach(x => {
        if (!SOURCE_KINDS.includes(x.kind)) errors.push(w + ' : nature de source inconnue');
        if (x.kind === 'transcript' && !x.quote) errors.push(w + ' : citation de l’enregistrement manquante');
        if (x.url && !/^https:\/\//.test(x.url)) errors.push(w + ' : lien non https');
      });
      if (!src.some(x => x.kind !== 'external')) warnings.push(w + ' : uniquement des sources extérieures au cours');
    });
    if (!(t.questions || []).length) errors.push('aucune question');
    if (t.route && !(Array.isArray(t.route.geometry) && t.route.geometry.length >= 2)) errors.push('tracé manquant');
    return { errors, warnings };
  }
  // Une donnée importante incertaine ne part jamais chez les élèves.
  function publishable(t) {
    const v = validate(t);
    return t.status === 'pret' && t.published === true && !v.errors.length;
  }

  // ---------------------------------------------------------------- questions d'une partie
  // Mode « study » : toutes les questions. Mode « exam » : sans anecdotes ni points à vérifier,
  // et sans les questions de côté dont le côté du prof n'est pas confirmé par le tracé.
  function examEligible(q, t) {
    if (q.certainty === 'anecdote' || q.certainty === 'check') return false;
    if (q.type === 'side') { const s = (t.stops || []).find(x => x.id === q.stop); return !!(s && s.side && s.side.agree === true); }
    return true;
  }
  function questionsFor(t, mode) {
    const order = new Map((t.stops || []).map((s, i) => [s.id, i]));
    return (t.questions || []).filter(q => mode !== 'exam' || examEligible(q, t))
      .slice().sort((a, b) => (order.get(a.stop) - order.get(b.stop)) || 0);
  }
  // Questions de côté générées depuis les consignes du prof (« תסתכלו שמאלה ») : jamais inventées.
  function sideQuestions(t) {
    const out = [];
    (t.stops || []).forEach(s => {
      if (!s.side || !s.side.teacher || !s.sideQuote) return;
      out.push({ id: s.id + ':side', stop: s.id, type: 'side', certainty: s.side.agree ? 'firm' : 'check',
        prompt: `בנסיעה בכיוון המסלול — באיזה צד של האוטובוס נראה ${s.name}?`,
        options: ['מימין', 'משמאל'], correct: s.side.teacher === 'right' ? 0 : 1,
        explanation: `המורה: „${s.sideQuote}”.` + (s.side.agree === false ? ' ⚠️ לפי המפה הצד אחר — לבדיקה.' : ''),
        sources: [Object.assign({ kind: 'transcript', quote: s.sideQuote }, t.transcript ? { title: t.transcript.title, url: t.transcript.url } : {})] });
    });
    return out;
  }

  // ---------------------------------------------------------------- score
  function scoreAnswer(correct, remainingMs, prevStreak) {
    if (!correct) return 0;
    const s = Math.max(0, Math.min(30, Math.ceil(Math.max(0, remainingMs || 0) / 1000)));
    return 100 + 3 * s + 20 * Math.min(Math.max(0, prevStreak | 0), 5);
  }
  function Timer(durationMs, now) { this.duration = durationMs || DURATION_MS; this.left = this.duration; this.since = null; this.now = now || (() => Date.now()); }
  Timer.prototype.start = function () { if (this.since === null && this.left > 0) this.since = this.now(); return this; };
  Timer.prototype.pause = function () { if (this.since !== null) { this.left = Math.max(0, this.left - (this.now() - this.since)); this.since = null; } return this; };
  Timer.prototype.remaining = function () { return this.since === null ? this.left : Math.max(0, this.left - (this.now() - this.since)); };
  Timer.prototype.expired = function () { return this.remaining() <= 0; };

  // Correction détaillée (fin d'examen) : chaque question avec sa source.
  function correction(t, run) {
    const byId = new Map((t.questions || []).concat(sideQuestions(t)).map(q => [q.id, q]));
    const stops = new Map((t.stops || []).map(s => [s.id, s]));
    return run.answers.map(a => {
      const q = byId.get(a.questionId) || {}, s = stops.get(q.stop) || {};
      return { questionId: a.questionId, place: s.name, prompt: q.prompt, chosen: a.chosen == null ? null : q.options[a.chosen],
        expected: q.options && q.options[q.correct], correct: a.correct, timedOut: !!a.timedOut, points: a.points,
        explanation: q.explanation, sources: q.sources || [] };
    });
  }
  function result(t, run) {
    const details = run.answers.map(a => ({ questionId: a.questionId, stop: a.stop, correct: a.correct, timedOut: !!a.timedOut, points: a.points, msUsed: a.msUsed }));
    return { version: 1, kind: 'tour', tourId: t.id, runId: run.runId, mode: run.mode,
      score: details.reduce((n, a) => n + a.points, 0), correct: details.filter(a => a.correct).length, total: details.length,
      durationMs: Math.round(run.activeMs || 0), completedAt: new Date().toISOString(), answerDetails: details };
  }

  // ---------------------------------------------------------------- route au format gps-engine (V3)
  // Le tracé et les lieux d'un parcours sont convertis au format de road67-route.json : le même moteur
  // GPS (map matching, simulation) sert à tous les סיורים.
  function toGpsRoute(t) {
    const r = t.route || {};
    return {
      id: 'TOUR' + t.id, version: 1, status: r.status || 'approximate', corridorM: r.corridorM || { approximate: 900, verified: 150 },
      geometry: r.geometry, roads: r.roads && r.roads.length ? r.roads : [{ fromVertex: 0, toVertex: r.geometry.length - 1, he: t.title, speedKmh: 70 }],
      destination: { he: t.stops[t.stops.length - 1].name, point: [t.stops[t.stops.length - 1].coord.lat, t.stops[t.stops.length - 1].coord.lon] },
      finish: { enabled: false }, minGapSec: r.minGapSec || 45,
      stops: t.stops.filter(s => s.coord).map(s => ({ id: s.id, main: true, name: { he: s.name }, anchor: [s.coord.lat, s.coord.lon], beforeM: s.beforeM || 700, afterM: s.afterM || 900 }))
    };
  }

  return { STATUSES, STATUS_LABEL, SOURCE_KINDS, SOURCE_LABEL, CERTAINTY, TYPES, DURATION_MS, MAX_POINTS,
    validate, publishable, examEligible, questionsFor, sideQuestions, scoreAnswer, Timer, correction, result, toGpsRoute };
});
