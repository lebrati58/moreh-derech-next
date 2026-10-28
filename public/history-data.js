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
  // ---------- outils communs aux types de questions ----------
  function centuryOf(y) { return y < 0 ? -Math.ceil(-y / 100) : Math.ceil(y / 100); }
  function centuryLabel(c) { return 'המאה ה־' + Math.abs(c) + (c < 0 ? ' לפנה״ס' : ' לספירה'); }
  function evOption(e, correct) { return { value: e.id, label: e.title, correct: !!correct }; }
  // Deux événements trop proches dans le temps (ou dont l'une des années alternatives est proche) ne peuvent pas
  // servir de piège l'un pour l'autre : on ne demande jamais de départager 66 et 67.
  function apart(a, b, gap) {
    var ya = [a.year].concat(a.alts || []), yb = [b.year].concat(b.alts || []);
    return ya.every(function (x) { return yb.every(function (y) { return Math.abs(x - y) >= gap; }); });
  }
  var FAR = 10; // écart minimal (années) entre deux événements proposés ensemble
  function spread(cands, n, rnd, anchor) {
    var out = [];
    shuffle(cands, rnd).forEach(function (c) {
      if (out.length < n && apart(c, anchor, FAR) && out.every(function (o) { return apart(o, c, FAR); })) out.push(c);
    });
    return out.length === n ? out : null;
  }
  function nearest(ev, list, k) {
    return list.slice().sort(function (a, b) { return Math.abs(a.year - ev.year) - Math.abs(b.year - ev.year); }).slice(0, k);
  }
  function periodBounds(events) {
    var order = [], first = {};
    events.forEach(function (e) { if (!(e.period in first)) { first[e.period] = e.year; order.push(e.period); } });
    var b = {};
    order.forEach(function (p, i) { b[p] = [first[p], i < order.length - 1 ? first[order[i + 1]] : Infinity]; });
    return b;
  }
  function nearBound(y, bounds) { return bounds.some(function (b) { return isFinite(b) && Math.abs(y - b) <= 3; }); }

  var PERIODS = {};
  function setPeriods(list) { PERIODS = {}; (list || []).forEach(function (p) { PERIODS[p.id] = p; }); }
  var MULTI_MS = 45000; // plus de temps quand il faut cocher plusieurs réponses

  var QUESTION_TYPES = {
    // Événement → année (4 années, une juste).
    date: function (ev, events, seed) {
      return { id: ev.id + ':date', type: 'date', eventId: ev.id, prompt: ev.q, options: dateOptions(ev, events, seed) };
    },
    // Année → événement (« מה קרה בשנת 70 לספירה? »).
    event: function (ev, events, seed) {
      var rnd = rng(seed + '|' + ev.id + '|event');
      var others = events.filter(function (o) { return o.id !== ev.id; });
      var picks = spread(nearest(ev, others.filter(function (o) { return apart(o, ev, FAR); }), 9), 3, rnd, ev);
      if (!picks) return null;
      return { id: ev.id + ':event', type: 'event', eventId: ev.id, prompt: 'מה קרה בשנת ' + yearLabel(ev) + '?',
        options: shuffle([evOption(ev, true)].concat(picks.map(function (o) { return evOption(o, false); })), rnd) };
    },
    // Ordre : « איזה מהאירועים האלה קרה ראשון? » (ou « אחרון » en fin de frise).
    first: function (ev, events, seed) {
      var rnd = rng(seed + '|' + ev.id + '|first'), others = events.filter(function (o) { return o.id !== ev.id && apart(o, ev, FAR); });
      var later = others.filter(function (o) { return o.year > ev.year && o.year - ev.year <= 400; });
      var earlier = others.filter(function (o) { return o.year < ev.year && ev.year - o.year <= 400; });
      var useLast = later.length < 3 || (earlier.length >= 3 && rnd() < 0.35);
      var picks = spread(nearest(ev, useLast ? earlier : later, 10), 3, rnd, ev);
      if (!picks) return null;
      return { id: ev.id + ':first', type: 'first', eventId: ev.id,
        prompt: useLast ? 'איזה מהאירועים האלה קרה אחרון?' : 'איזה מהאירועים האלה קרה ראשון?',
        options: shuffle([evOption(ev, true)].concat(picks.map(function (o) { return evOption(o, false); })), rnd) };
    },
    // Siècle : « באיזו מאה התרחש…? » (jamais pour une année trop proche d'un changement de siècle).
    century: function (ev, events, seed) {
      var r = Math.abs(ev.year) % 100;
      if (ev.certainty === 'disputed' || r <= 5 || r >= 95) return null;
      var rnd = rng(seed + '|' + ev.id + '|century'), c = centuryOf(ev.year), near = [];
      [-2, -1, 1, 2].forEach(function (d) { var x = c + d; if (c < 0 && x >= 0) x += 1; if (c > 0 && x <= 0) x -= 1; if (x !== 0 && near.indexOf(x) < 0 && x !== c) near.push(x); });
      var picks = shuffle(near, rnd).slice(0, 3);
      return { id: ev.id + ':century', type: 'century', eventId: ev.id, prompt: 'באיזו מאה התרחש: ' + ev.title + '?',
        options: shuffle([c].concat(picks), rnd).map(function (x) { return { value: x, label: centuryLabel(x), correct: x === c }; }) };
    },
    // Plusieurs réponses : « אילו מהאירועים האלה שייכים לתקופת …? »
    multiPeriod: function (ev, events, seed) {
      var rnd = rng(seed + '|' + ev.id + '|multiPeriod'), B = periodBounds(events), b = B[ev.period] || [ev.year, Infinity];
      if (nearBound(ev.year, b)) return null;
      var same = events.filter(function (o) { return o.id !== ev.id && o.period === ev.period && !nearBound(o.year, b); });
      var other = events.filter(function (o) { return o.period !== ev.period && !nearBound(o.year, b) && Math.abs(o.year - ev.year) <= 250; });
      var k = Math.min(same.length, Math.floor(rnd() * 3)), right = [ev];
      shuffle(same, rnd).forEach(function (o) { if (right.length < k + 1 && right.every(function (x) { return apart(x, o, 5); })) right.push(o); });
      var wrong = [];
      shuffle(nearest(ev, other, 10), rnd).forEach(function (o) { if (wrong.length < 5 - right.length && wrong.concat(right).every(function (x) { return apart(x, o, 5); })) wrong.push(o); });
      if (wrong.length < 5 - right.length || wrong.length < 2) return null;
      var per = PERIODS[ev.period];
      var name = per ? '„' + per.short + '” (' + per.range + ')' : ev.period;
      return { id: ev.id + ':multiPeriod', type: 'multiPeriod', eventId: ev.id, multi: true, ms: MULTI_MS,
        prompt: 'אילו מהאירועים האלה שייכים לתקופת ' + name + '?',
        options: shuffle(right.map(function (o) { return evOption(o, true); }).concat(wrong.map(function (o) { return evOption(o, false); })), rnd) };
    },
    // Plusieurs réponses : « אילו מהאירועים האלה קרו לפני …? »
    multiBefore: function (ev, events, seed) {
      var rnd = rng(seed + '|' + ev.id + '|multiBefore');
      var cands = nearest(ev, events.filter(function (o) { return o.id !== ev.id && apart(o, ev, FAR) && Math.abs(o.year - ev.year) <= 300; }), 12);
      var before = cands.filter(function (o) { return o.year < ev.year; }), after = cands.filter(function (o) { return o.year > ev.year; });
      if (!before.length || !after.length) return null;
      var nb = Math.max(1, Math.min(before.length, 1 + Math.floor(rnd() * 3))), na = 5 - nb;
      if (after.length < na) { na = after.length; nb = Math.min(before.length, 5 - na); }
      if (nb + na < 4 || na < 1) return null;
      var picks = shuffle(before, rnd).slice(0, nb).concat(shuffle(after, rnd).slice(0, na));
      return { id: ev.id + ':multiBefore', type: 'multiBefore', eventId: ev.id, multi: true, ms: MULTI_MS,
        prompt: 'אילו מהאירועים האלה קרו לפני ' + ev.title + ' (' + yearLabel(ev) + ')?',
        options: shuffle(picks.map(function (o) { return evOption(o, o.year < ev.year); }), rnd) };
    }
  };
  // Familles proposées dans les réglages du quiz.
  var TYPE_GROUPS = {
    mix: ['date', 'event', 'first', 'century', 'multiPeriod', 'multiBefore'],
    date: ['date'],
    event: ['event'],
    multi: ['multiPeriod', 'multiBefore'],
    order: ['first', 'century']
  };
  function buildQuestion(ev, events, seed, type) { return (QUESTION_TYPES[type || 'date'])(ev, events, seed); }
  function questionMs(q) { return (q && q.ms) || DURATION_MS; }
  // Bonne réponse ? (une option pour les questions simples, exactement le bon ensemble pour les questions à choix multiples)
  function isCorrect(q, chosen) {
    if (chosen == null) return false;
    var want = []; q.options.forEach(function (o, i) { if (o.correct) want.push(i); });
    var got = (Array.isArray(chosen) ? chosen : [chosen]).slice().sort(function (a, b) { return a - b; });
    return got.length === want.length && got.every(function (v, i) { return v === want[i]; });
  }
  function answerLabel(q, idxs) {
    if (idxs == null) return '—';
    return (Array.isArray(idxs) ? idxs : [idxs]).map(function (i) { return q.options[i] ? q.options[i].label : '?'; }).join(' · ') || '—';
  }
  // Consigne des questions à plusieurs réponses : on dit toujours combien de réponses sont justes.
  function multiHint(q) {
    if (!q || !q.multi) return '';
    var n = q.options.filter(function (o) { return o.correct; }).length;
    return n === 1 ? '☑️ כאן יש תשובה נכונה אחת בלבד — סמנו אותה ולחצו „בדיקה”' : '☑️ כאן יש ' + n + ' תשובות נכונות — סמנו את כולן ולחצו „בדיקה”';
  }
  function correctLabel(q) { return q.options.filter(function (o) { return o.correct; }).map(function (o) { return o.label; }).join(' · '); }

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

  // Questions d'une partie : chaque événement peut revenir sous un autre type de question (jamais deux fois la même).
  function maxQuestions(data, opts) { return pool(data, opts).length * (TYPE_GROUPS[opts.types] || TYPE_GROUPS.date).length; }
  function buildRun(data, opts) {
    opts = opts || {};
    if (data.periods) setPeriods(data.periods);
    var seed = opts.seed || '', types = TYPE_GROUPS[opts.types] || TYPE_GROUPS.date;
    var evs = shuffle(pool(data, opts), rng('pick|' + seed)), optEvents = opts.mode === 'exam' ? data.events.filter(function (e) { return e.examReady; }) : data.events;
    var count = opts.count || evs.length, out = [], used = {};
    for (var round = 0; round < types.length && out.length < count; round++) {
      for (var i = 0; i < evs.length && out.length < count; i++) {
        var ev = evs[i], order = shuffle(types, rng(seed + '|' + ev.id + '|' + round));
        for (var t = 0; t < order.length; t++) {
          if (used[ev.id + ':' + order[t]]) continue;
          var q = QUESTION_TYPES[order[t]](ev, optEvents, seed);
          if (q) { used[q.id] = 1; out.push(q); break; }
        }
      }
    }
    return out;
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
    var details = st.answers.map(function (a) { return { eventId: a.eventId, questionId: a.questionId, type: a.type || 'date', chosen: a.chosen, expected: a.expected, chosenLabel: a.chosenLabel, expectedLabel: a.expectedLabel, prompt: a.prompt, correct: a.correct, timedOut: !!a.timedOut, msUsed: a.msUsed, points: a.points }; });
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
    QUESTION_TYPES: QUESTION_TYPES, TYPE_GROUPS: TYPE_GROUPS, setPeriods: setPeriods, buildQuestion: buildQuestion, buildRun: buildRun, maxQuestions: maxQuestions, questionMs: questionMs,
    isCorrect: isCorrect, multiHint: multiHint, answerLabel: answerLabel, correctLabel: correctLabel, centuryLabel: centuryLabel, MULTI_MS: MULTI_MS, dateOptions: dateOptions, pool: pool, pickEvents: pickEvents,
    scoreAnswer: scoreAnswer, Timer: Timer, buildResult: buildResult
  };
})(typeof window !== 'undefined' ? window : globalThis);
