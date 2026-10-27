/* Moreh Derech NEXT — « ציר הזמן והחידון » : logique partagée.
   Une seule source de données (history-events.json) pour la frise ET le quiz.
   Ce fichier ne touche pas au DOM : il est chargé tel quel par history.html et par les tests Node (vm). */
(function (global) {
  'use strict';

  var DURATION_MS = 30000;          // 30 s par question
  var MAX_POINTS = 100 + 3 * 30 + 20 * 5; // 290 : bonne réponse instantanée avec une série ≥ 5
  var MIN_GAP = 5;                  // écart minimal (années) entre la bonne réponse et un leurre
  var PERIOD_IDS = ['babylon', 'persian', 'hellenistic', 'hasmonean', 'roman', 'late_roman', 'byzantine'];
  var CERTAINTY = ['firm', 'approx', 'disputed'];
  var SOURCES = ['course', 'course-diff', 'external'];

  // ---------- formats ----------
  function formatYear(y) { return y < 0 ? (-y) + ' לפנה״ס' : y + ' לספירה'; }
  function yearLabel(ev) { return ev.yearText || formatYear(ev.year); }
  var CERT_LABEL = { firm: '', approx: '≈ תאריך מקורב', disputed: '⚖️ שנוי במחלוקת' };
  var SOURCE_LABEL = {
    course: '✅ התאריך מופיע בחומרי הקורס',
    'course-diff': '⚠️ חומרי הקורס אינם אחידים בתאריך הזה — לבדוק לפני מבחן',
    external: '🔎 לא נמצא בחומרי הקורס שנבדקו — תאריך מקובל במחקר'
  };

  // ---------- hasard reproductible (tests, reprise après rechargement) ----------
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = hash(seed) || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(list, rnd) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- validation ----------
  function validate(data) {
    var errors = [];
    if (!data || !Array.isArray(data.events) || !Array.isArray(data.periods)) return ['structure: events/periods manquants'];
    var pids = {};
    data.periods.forEach(function (p) {
      if (pids[p.id]) errors.push('période en double: ' + p.id); pids[p.id] = p;
      if (PERIOD_IDS.indexOf(p.id) < 0) errors.push('période inconnue: ' + p.id);
      if (!/^#[0-9a-f]{6}$/i.test(p.color || '')) errors.push('couleur invalide: ' + p.id);
      if (!p.doc || !/^https:\/\/drive\.google\.com\//.test(p.doc.url)) errors.push('document Drive manquant: ' + p.id);
    });
    var ids = {}, prev = -Infinity;
    data.events.forEach(function (e, i) {
      var where = 'événement #' + (i + 1) + ' (' + e.id + ')';
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id || '')) errors.push(where + ': id invalide');
      if (ids[e.id]) errors.push(where + ': id en double'); ids[e.id] = 1;
      if (typeof e.year !== 'number' || !isFinite(e.year) || e.year === 0 || Math.round(e.year) !== e.year) errors.push(where + ': année invalide');
      if (e.year < prev) errors.push(where + ': ordre chronologique cassé'); prev = e.year;
      if (!pids[e.period]) errors.push(where + ': période inconnue');
      if (CERTAINTY.indexOf(e.certainty) < 0) errors.push(where + ': certitude inconnue');
      if (SOURCES.indexOf(e.source) < 0) errors.push(where + ': source inconnue');
      if (typeof e.examReady !== 'boolean') errors.push(where + ': examReady manquant');
      if ((e.certainty === 'disputed' || e.source === 'course-diff') && e.examReady) errors.push(where + ': date contestée marquée prête pour l’examen');
      if (!e.title || !e.q || !e.desc) errors.push(where + ': texte manquant');
      if (e.q && !/\?$/.test(e.q)) errors.push(where + ': la question doit finir par « ? »');
      if (e.alts && e.alts.indexOf(e.year) >= 0) errors.push(where + ': alts contient la bonne année');
      if (e.yearText && e.yearText.indexOf(String(Math.abs(e.year))) < 0) errors.push(where + ': yearText ne contient pas l’année');
      var p = pids[e.period];
      if (p && p.j3d == null && e.j3d) { /* lien 3D propre à l'événement : autorisé */ }
      (e.sites || []).forEach(function (s) { if (!data.sites3d || !data.sites3d[s]) errors.push(where + ': site 3D inconnu ' + s); });
    });
    return errors;
  }

  // ---------- questions ----------
  // Type « date » : 4 années distinctes, exactement une juste. Les leurres :
  //  • jamais à moins de MIN_GAP ans de la bonne année (pas de piège 538/539) ;
  //  • jamais une année alternative reconnue (alts : 587, 515, 33…) ;
  //  • de préférence d'autres années du référentiel proches dans le temps, sinon des écarts plausibles.
  function dateOptions(ev, events, seed) {
    var rnd = rng(seed + '|' + ev.id), y = ev.year, banned = {}; (ev.alts || []).forEach(function (a) { banned[a] = 1; });
    var ok = function (v) { return v !== y && v !== 0 && !banned[v] && Math.abs(v - y) >= MIN_GAP; };
    var near = [], seen = {};
    events.forEach(function (o) { var v = o.year; if (!seen[v] && ok(v) && Math.abs(v - y) <= 160) { seen[v] = 1; near.push(v); } });
    near = shuffle(near, rnd).sort(function (a, b) { return Math.abs(a - y) - Math.abs(b - y); }).slice(0, 6);
    var picks = [];
    shuffle(near, rnd).forEach(function (v) { if (picks.length < 3 && picks.every(function (p) { return Math.abs(p - v) >= 3; })) picks.push(v); });
    var steps = [7, 11, 13, 18, 25, 30, 40, 55, 70, 90];
    var guard = 0;
    while (picks.length < 3 && guard++ < 200) {
      var d = steps[Math.floor(rnd() * steps.length)] * (rnd() < 0.5 ? -1 : 1), v = y + d;
      if ((y < 0) !== (v < 0)) v = y - d; // reste du même côté de l'ère pour ne pas rendre la réponse évidente
      if (ok(v) && picks.indexOf(v) < 0 && picks.every(function (p) { return Math.abs(p - v) >= 3; })) picks.push(v);
    }
    var opts = shuffle([y].concat(picks), rnd).map(function (v) { return { value: v, label: formatYear(v), correct: v === y }; });
    return opts;
  }
  var QUESTION_TYPES = {
    date: function (ev, events, seed) {
      return { id: ev.id + ':date', type: 'date', eventId: ev.id, prompt: ev.q, options: dateOptions(ev, events, seed) };
    }
    // À venir (même forme de sortie) : 'person' (qui ?), 'cause', 'consequence', 'order' (remettre dans l'ordre).
  };
  function buildQuestion(ev, events, seed, type) { return (QUESTION_TYPES[type || 'date'])(ev, events, seed); }

  // Événements d'une partie : examen = uniquement examReady ; entraînement = tous.
  function pool(data, opts) {
    opts = opts || {};
    var list = data.events.filter(function (e) {
      if (opts.period && opts.period !== 'all' && e.period !== opts.period) return false;
      if (opts.mode === 'exam' && !e.examReady) return false;
      if (opts.ids && opts.ids.indexOf(e.id) < 0) return false;
      return true;
    });
    return list;
  }
  function pickEvents(data, opts) {
    var list = shuffle(pool(data, opts), rng('pick|' + (opts.seed || '')));
    if (opts.count && opts.count < list.length) list = list.slice(0, opts.count);
    return list;
  }

  // ---------- score ----------
  // Bonne réponse = 100 + 3 × secondes restantes (arrondi supérieur) + 20 × min(série précédente, 5).
  // Mauvaise réponse ou temps écoulé = 0, et la série repart à zéro.
  function scoreAnswer(correct, remainingMs, prevStreak) {
    if (!correct) return 0;
    var s = Math.max(0, Math.min(30, Math.ceil(Math.max(0, remainingMs) / 1000)));
    return 100 + 3 * s + 20 * Math.min(Math.max(0, prevStreak | 0), 5);
  }

  // ---------- chronomètre avec pause (horloge injectable pour les tests) ----------
  function Timer(durationMs, now) {
    this.duration = durationMs || DURATION_MS; this.left = this.duration; this.since = null; this.now = now || function () { return Date.now(); };
  }
  Timer.prototype.start = function () { if (this.since === null && this.left > 0) this.since = this.now(); return this; };
  Timer.prototype.pause = function () { if (this.since !== null) { this.left = Math.max(0, this.left - (this.now() - this.since)); this.since = null; } return this; };
  Timer.prototype.remaining = function () { return this.since === null ? this.left : Math.max(0, this.left - (this.now() - this.since)); };
  Timer.prototype.running = function () { return this.since !== null; };
  Timer.prototype.expired = function () { return this.remaining() <= 0; };

  // ---------- résultat structuré et versionné ----------
  function buildResult(st, data) {
    var details = st.answers.map(function (a) { return { eventId: a.eventId, questionId: a.questionId, type: 'date', chosen: a.chosen, expected: a.expected, correct: a.correct, timedOut: !!a.timedOut, msUsed: a.msUsed, points: a.points }; });
    return {
      version: 1, quizId: (data && data.quizId) || 'history-48-dates', dataVersion: (data && data.dataVersion) || null,
      runId: st.runId, mode: st.mode, period: st.period || 'all',
      eventIds: st.questions.map(function (q) { return q.eventId; }),
      score: details.reduce(function (n, a) { return n + a.points; }, 0),
      correct: details.filter(function (a) { return a.correct; }).length,
      total: st.questions.length,
      bestStreak: st.bestStreak || 0,
      durationMs: Math.round(st.activeMs || 0),
      completedAt: new Date().toISOString(),
      answerDetails: details
    };
  }

  global.MDHistory = {
    DURATION_MS: DURATION_MS, MAX_POINTS: MAX_POINTS, MIN_GAP: MIN_GAP, PERIOD_IDS: PERIOD_IDS,
    CERT_LABEL: CERT_LABEL, SOURCE_LABEL: SOURCE_LABEL,
    formatYear: formatYear, yearLabel: yearLabel, validate: validate, rng: rng, shuffle: shuffle, hash: hash,
    QUESTION_TYPES: QUESTION_TYPES, buildQuestion: buildQuestion, dateOptions: dateOptions, pool: pool, pickEvents: pickEvents,
    scoreAnswer: scoreAnswer, Timer: Timer, buildResult: buildResult
  };
})(typeof window !== 'undefined' ? window : globalThis);
