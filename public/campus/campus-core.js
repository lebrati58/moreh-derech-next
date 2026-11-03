// « 🏆 אלוף הקורס » — jeu de campus en direct (façon Kahoot) : logique pure, sans réseau ni DOM.
// Banque : les 22 סיורים (guided-quiz.json), la frise (history-events.json via MDHistory) et
// l'architecture classique (architecture/data.json). L'hôte est l'arbitre : il mesure lui-même
// le temps de réponse (heure de réception), calcule les points et le classement.
(function (global) {
  'use strict';

  var MAX_POINTS = 1000;          // réponse juste instantanée
  var MIN_POINTS = 500;           // réponse juste à la dernière seconde
  var GRACE_MS = 600;             // marge réseau : tout ce qui arrive avant compte comme instantané
  var STREAK_STEP = 50;           // bonus de série : +50 par bonne réponse d'affilée (à partir de la 2e)
  var STREAK_CAP = 250;
  var LATE_MS = 1200;             // une réponse partie à temps peut arriver un peu après la fin du chrono
  var SOURCES = ['tours', 'lessons', 'history', 'arch'];
  var SOURCE_WEIGHT = { tours: 1, lessons: 1.15, history: 0.9, arch: 0.6 };
  var SOURCE_LABEL = { tours: '🧭 הסיורים', lessons: '📚 שיעורי התיאוריה', history: '⏳ ציר הזמן', arch: '🏛️ אדריכלות קלאסית' };

  // ---------- hasard reproductible ----------
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = hash(seed) || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(list, rnd) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function distinct4(opts) { var seen = {}; return opts.length === 4 && opts.every(function (o) { var k = clean(o); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }

  // ---------- banques ----------
  // 1. Les 22 סיורים : questions déjà vérifiées et sourcées, niveaux 1–3.
  // titles : { '03': 'הנגב הצפוני', … } (siyurim-catalog.json) — on affiche le thème, pas le numéro.
  function tourTitles(catalog) { var t = {}; ((catalog && catalog.tours) || []).forEach(function (x) { if (x && x.id) t[x.id] = clean(x.title); }); t.road67 = t.road67 || 'כביש 67 — זכרון יעקב–יקנעם'; return t; }
  function fromTours(data, titles) {
    var out = []; titles = titles || {};
    ((data && data.questions) || []).forEach(function (q) {
      if (!q || !Array.isArray(q.options) || !distinct4(q.options) || !(q.correct >= 0 && q.correct < 4)) return;
      var tour = q.tourId || '';
      out.push({
        id: 't:' + q.id, src: 'tours', tour: tour, sub: tour, level: [1, 2, 3].indexOf(q.level) >= 0 ? q.level : 2,
        text: clean(q.question), options: q.options.map(clean), correct: q.correct,
        explanation: clean(q.explanation), cat: (titles[tour] || (tour === 'road67' ? 'כביש 67' : 'סיור ' + tour)) + (q.stop ? ' · ' + clean(q.stop) : ''),
        sourceUrl: q.sourceUrl || ''
      });
    });
    return out;
  }

  // 2. La frise : questions « date » et « événement » à une seule bonne réponse, événements d'examen uniquement.
  function fromHistory(H, data) {
    if (!H || !data || !data.events) return [];
    if (data.periods && H.setPeriods) H.setPeriods(data.periods);
    var exam = data.events.filter(function (e) { return e.examReady; }), out = [];
    exam.forEach(function (ev) {
      var lvDate = 1 + (hash('campus|' + ev.id) % 3);
      [['date', lvDate], ['event', 2]].forEach(function (pair) {
        var q = H.buildQuestion(ev, exam, 'campus', pair[0], pair[1]);
        if (!q || q.multi || !q.options || q.options.length !== 4) return;
        var labels = q.options.map(function (o) { return clean(o.label); }), correct = -1;
        q.options.forEach(function (o, i) { if (o.correct) correct = correct < 0 ? i : 99; });
        if (correct < 0 || correct > 3 || !distinct4(labels)) return;
        out.push({
          id: 'h:' + q.id, src: 'history', level: pair[1], text: clean(q.prompt), options: labels, correct: correct,
          explanation: clean(ev.title + ' — ' + (ev.yearText || H.formatYear(ev.year)) + '. ' + (ev.desc || '')),
          cat: '⏳ ציר הזמן'
        });
      });
    });
    return out;
  }

  // 3. L'architecture : « quel terme correspond à cette description ? » et « quel est le terme latin ? ».
  function fromArch(data) {
    if (!data || !data.scenes) return [];
    var all = [], out = [];
    data.scenes.forEach(function (s) { (s.parts || []).forEach(function (p) { if (p && p.he && p.d) all.push({ s: s, p: p }); }); });
    all.forEach(function (it, idx) {
      var s = it.s, p = it.p, rnd = rng('arch|' + s.id + '|' + p.t);
      var same = all.filter(function (o) { return o !== it && o.s === s; }), other = all.filter(function (o) { return o.s !== s; });
      function pickOpts(field) {
        var mine = clean(p[field]), seen = {}; seen[mine] = 1;
        var pool = shuffle(same, rnd).concat(shuffle(other, rnd)), picks = [];
        pool.forEach(function (o) { var v = clean(o.p[field]); if (picks.length < 3 && v && !seen[v]) { seen[v] = 1; picks.push(v); } });
        if (picks.length < 3) return null;
        var opts = shuffle([mine].concat(picks), rnd);
        return { options: opts, correct: opts.indexOf(mine) };
      }
      var heName = clean(p.he), desc = clean(p.d);
      // la description ne doit pas contenir le nom (sinon la réponse est dans la question)
      var core = heName.split(/[\s(]/)[0];
      // descriptions trop courtes ou qui dépendent de la visite 3D (« התחנה הבאה… ») : écartées
      if (desc.length >= 30 && !/^(התחנה|כאן|זה |זהו)/.test(desc) && desc.indexOf(heName) < 0 && (core.length < 3 || desc.indexOf(core) < 0)) {
        var o1 = pickOpts('he');
        if (o1) out.push({ id: 'a:' + s.id + ':' + p.t + ':name', src: 'arch', level: 2, text: 'איזה מונח מתאים לתיאור: „' + (desc.length > 230 ? desc.slice(0, 227) + '…' : desc) + '”',
          options: o1.options, correct: o1.correct, explanation: heName + (p.la ? ' (' + clean(p.la) + ')' : '') + (p.w ? ' — ' + clean(p.w) : ''), cat: '🏛️ ' + clean(s.he) });
      }
      if (p.la && clean(p.la) && !/[֐-׿]/.test(p.la)) {
        var o2 = pickOpts('la');
        if (o2) out.push({ id: 'a:' + s.id + ':' + p.t + ':la', src: 'arch', level: 3, text: 'מהו המונח הלטיני של „' + heName + '”?',
          options: o2.options, correct: o2.correct, explanation: heName + ' = ' + clean(p.la) + '. ' + desc, cat: '🏛️ ' + clean(s.he) });
      }
    });
    return out;
  }

  // 4. Les cours de théorie du Drive (public/campus/lessons.json, construit par tools/build-campus-lessons.mjs).
  function fromLessons(data) {
    var out = [], topics = {};
    ((data && data.topics) || []).forEach(function (t) { topics[t.id] = t; });
    ((data && data.questions) || []).forEach(function (q) {
      var t = topics[q.topic];
      if (!t || !Array.isArray(q.options) || !distinct4(q.options) || !(q.correct >= 0 && q.correct < 4)) return;
      out.push({ id: 'l:' + q.id, src: 'lessons', sub: q.topic, level: [1, 2, 3].indexOf(q.level) >= 0 ? q.level : 2,
        text: clean(q.q), options: q.options.map(clean), correct: q.correct, explanation: clean(q.explanation),
        cat: (t.emoji ? t.emoji + ' ' : '') + clean(t.he), sourceUrl: q.url || '' });
    });
    return out;
  }

  function buildBank(parts) {
    parts = parts || {};
    var bank = [].concat(fromTours(parts.tours, tourTitles(parts.catalog)), fromLessons(parts.lessons), fromHistory(parts.H, parts.history), fromArch(parts.arch)), seen = {};
    return bank.filter(function (q) { if (seen[q.id]) return false; seen[q.id] = 1; return true; });
  }
  function countBy(bank, filter) { return bank.filter(filter).length; }
  function poolFor(bank, opts) {
    opts = opts || {};
    // subs : { tours: ['03', …], lessons: ['geology', …] } — liste vide ou absente = tout
    var srcs = (opts.sources && opts.sources.length) ? opts.sources : SOURCES, subs = Object.assign({}, opts.subs || {});
    if (opts.tours && opts.tours.length) subs.tours = opts.tours;
    return bank.filter(function (q) {
      if (srcs.indexOf(q.src) < 0) return false;
      var only = subs[q.src];
      if (only && only.length && only.indexOf(q.sub) < 0) return false;
      return true;
    });
  }

  // ---------- partie ----------
  // Niveau prévu pour la question i sur n : on monte en difficulté (40 % קל, 35 % בינוני, 25 % קשה).
  function plannedLevel(i, n) { var r = n <= 1 ? 1 : i / (n - 1); return r < 0.4 ? 1 : r < 0.75 ? 2 : 3; }
  // Tire n questions : niveaux croissants, sources mélangées, jamais deux fois le même arrêt d'affilée,
  // en évitant les questions déjà jouées (avoid). Les réponses sont remélangées.
  function buildGame(bank, opts) {
    opts = opts || {};
    var n = Math.max(1, Math.min(60, opts.count || 15)), seed = opts.seed || String(Date.now()), rnd = rng('game|' + seed);
    var avoid = {}; (opts.avoid || []).forEach(function (id) { avoid[id] = 1; });
    var pool = shuffle(poolFor(bank, opts), rnd);
    if (!pool.length) return [];
    var fresh = pool.filter(function (q) { return !avoid[q.id]; });
    if (fresh.length < n) fresh = fresh.concat(pool.filter(function (q) { return avoid[q.id]; }));
    var srcs = {}; fresh.forEach(function (q) { (srcs[q.src] = srcs[q.src] || []).push(q); });
    var srcList = Object.keys(srcs);
    // part de chaque source proportionnelle à la racine de sa taille (la frise et l'architecture ne sont pas noyées)
    var w = {}, tw = 0; srcList.forEach(function (s) { w[s] = Math.sqrt(srcs[s].length) * (SOURCE_WEIGHT[s] || 1); tw += w[s]; });
    var used = {}, out = [], lastCat = '';
    for (var i = 0; i < n; i++) {
      var want = plannedLevel(i, n), r = rnd() * tw, src = srcList[srcList.length - 1];
      for (var k = 0; k < srcList.length; k++) { r -= w[srcList[k]]; if (r <= 0) { src = srcList[k]; break; } }
      var cands = [srcs[src]].concat(srcList.filter(function (s) { return s !== src; }).map(function (s) { return srcs[s]; }));
      var pick = null;
      for (var pass = 0; pass < 4 && !pick; pass++) {
        for (var c = 0; c < cands.length && !pick; c++) {
          for (var j = 0; j < cands[c].length; j++) {
            var q = cands[c][j];
            if (used[q.id]) continue;
            if (pass < 1 && q.level !== want) continue;
            if (pass < 2 && Math.abs(q.level - want) > 1) continue;
            if (pass < 3 && q.cat === lastCat) continue;
            pick = q; break;
          }
        }
      }
      if (!pick) break;
      used[pick.id] = 1; lastCat = pick.cat;
      var order = shuffle([0, 1, 2, 3], rng('opts|' + seed + '|' + pick.id));
      out.push({
        id: pick.id, src: pick.src, level: pick.level, cat: pick.cat, text: pick.text,
        options: order.map(function (k) { return pick.options[k]; }), correct: order.indexOf(pick.correct),
        explanation: pick.explanation, sourceUrl: pick.sourceUrl || '', double: false
      });
    }
    if (out.length && opts.finalDouble !== false) out[out.length - 1].double = true;
    return out;
  }

  // ---------- score ----------
  // Bonne réponse : 1000 si elle arrive dans la marge réseau, puis décroît jusqu'à 500 à la fin du chrono.
  function speedPoints(ms, limitMs) {
    var span = Math.max(1, limitMs - GRACE_MS), t = Math.max(0, Math.min(1, (ms - GRACE_MS) / span));
    return Math.round(MAX_POINTS - (MAX_POINTS - MIN_POINTS) * t);
  }
  function scoreAnswer(o) {
    if (!o || !o.correct) return { points: 0, speed: 0, streakBonus: 0 };
    var speed = speedPoints(o.ms, o.limitMs), bonus = Math.min(STREAK_CAP, Math.max(0, (o.streak || 1) - 1) * STREAK_STEP);
    var mult = o.double ? 2 : 1;
    return { points: (speed + bonus) * mult, speed: speed * mult, streakBonus: bonus * mult };
  }

  // Classement : points ↓, bonnes réponses ↓, temps cumulé des bonnes réponses ↑, ordre d'arrivée ↑.
  function ranking(players) {
    var list = Object.keys(players || {}).map(function (id) { return players[id]; }).filter(function (p) { return p && !p.removed; });
    list.sort(function (a, b) { return (b.score - a.score) || (b.right - a.right) || (a.timeRight - b.timeRight) || (a.joined - b.joined); });
    return list.map(function (p, i) { return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, right: p.right, rank: i + 1, streak: p.streak, last: p.last || 0 }; });
  }

  // ---------- arbitre (hôte) ----------
  var AVATARS = ['🦁', '🐪', '🦅', '🐐', '🦊', '🐢', '🐬', '🦉', '🐫', '🦌', '🐝', '🦜', '🐆', '🐻', '🐙', '🐸', '🦒', '🐘', '🐳', '🦄'];
  function cleanName(s) { return clean(s).replace(/[<>]/g, '').slice(0, 20); }

  function createGame(questions, opts) {
    opts = opts || {};
    var g = {
      id: opts.id || String(Date.now()), questions: questions, limitMs: (opts.seconds || 20) * 1000,
      phase: 'lobby', i: -1, startAt: 0, endAt: 0, players: {}, joinSeq: 0, answers: {}, version: 1,
      fastest: null, max: opts.maxPlayers || 120
    };
    return g;
  }
  function bump(g) { g.version++; }
  function uniqueName(g, name, id) {
    var base = cleanName(name) || 'שחקן', n = base, k = 2;
    var taken = function (x) { return Object.keys(g.players).some(function (pid) { return pid !== id && !g.players[pid].removed && g.players[pid].name === x; }); };
    while (taken(n)) n = base + ' (' + (k++) + ')';
    return n;
  }
  function join(g, id, name, avatar) {
    if (!id || typeof id !== 'string' || id.length > 64) return { error: 'bad_id' };
    var p = g.players[id];
    if (p) {
      if (p.removed) return { error: 'removed' };
      if (name && cleanName(name) && cleanName(name) !== p.name.replace(/ \(\d+\)$/, '')) p.name = uniqueName(g, name, id);
      if (avatar && AVATARS.indexOf(avatar) >= 0) p.avatar = avatar;
      bump(g); return { ok: true, player: p };
    }
    var count = Object.keys(g.players).filter(function (k) { return !g.players[k].removed; }).length;
    if (count >= g.max) return { error: 'full' };
    p = g.players[id] = { id: id, name: uniqueName(g, name, id), avatar: AVATARS.indexOf(avatar) >= 0 ? avatar : AVATARS[hash(id) % AVATARS.length],
      score: 0, right: 0, timeRight: 0, streak: 0, best: 0, joined: ++g.joinSeq, last: 0, removed: false, late: g.i >= 0 };
    bump(g); return { ok: true, player: p };
  }
  function removePlayer(g, id) { if (g.players[id]) { g.players[id].removed = true; bump(g); } }

  function current(g) { return g.questions[g.i] || null; }
  // Temps de lecture avant l'apparition des réponses : on mesure la vitesse de réflexion, pas de lecture.
  function readMs(q) { var n = q ? (q.text.length + q.options.join('').length / 3) : 0; return Math.max(3000, Math.min(7000, Math.round(2000 + n * 35))); }
  function startQuestion(g, now, read) {
    if (g.i + 1 >= g.questions.length) return finish(g);
    g.i++; g.phase = 'question';
    var pre = read == null ? readMs(g.questions[g.i]) : read;
    g.startAt = now + pre; g.endAt = g.startAt + g.limitMs; g.answers[g.i] = {};
    Object.keys(g.players).forEach(function (id) { g.players[id].last = 0; });
    bump(g); return { ok: true };
  }
  // Réponse reçue par l'hôte : seule la première compte ; le temps est mesuré par l'hôte.
  function answer(g, id, seq, choice, now) {
    var p = g.players[id];
    if (!p || p.removed) return { error: 'unknown_player' };
    if (seq !== g.i) return { error: 'wrong_question' };
    var box = g.answers[g.i] || (g.answers[g.i] = {});
    if (box[id]) return { ok: true, duplicate: true };
    if (g.phase !== 'question' || now > g.endAt + LATE_MS) return { error: 'closed' };
    if (now < g.startAt - 150) return { error: 'too_soon' };
    if (!(choice >= 0 && choice < 4) || choice !== Math.floor(choice)) return { error: 'bad_choice' };
    var ms = Math.max(0, Math.min(now, g.endAt) - g.startAt);
    box[id] = { choice: choice, ms: ms };
    bump(g);
    return { ok: true, allIn: everyoneAnswered(g) };
  }
  function activeIds(g) { return Object.keys(g.players).filter(function (k) { return !g.players[k].removed; }); }
  function everyoneAnswered(g) { var box = g.answers[g.i] || {}, ids = activeIds(g); return ids.length > 0 && ids.every(function (id) { return box[id]; }); }

  // Révélation : calcule les points de la question (une seule fois).
  function reveal(g) {
    if (g.phase !== 'question') return { error: 'not_open' };
    var q = current(g), box = g.answers[g.i] || {};
    g.phase = 'reveal';
    activeIds(g).forEach(function (id) {
      var p = g.players[id], a = box[id], ok = !!a && a.choice === q.correct;
      p.streak = ok ? p.streak + 1 : 0; p.best = Math.max(p.best, p.streak);
      var s = scoreAnswer({ correct: ok, ms: a ? a.ms : 0, limitMs: g.limitMs, streak: p.streak, double: q.double });
      p.last = s.points; p.score += s.points;
      if (ok) { p.right++; p.timeRight += a.ms; if (!g.fastest || a.ms < g.fastest.ms) g.fastest = { id: id, ms: a.ms, seq: g.i }; }
      if (a) { a.correct = ok; a.points = s.points; a.streakBonus = s.streakBonus; }
    });
    bump(g); return { ok: true };
  }
  function showBoard(g) { if (g.phase === 'reveal') { g.phase = 'board'; bump(g); } }
  function finish(g) { g.phase = 'podium'; bump(g); return { ok: true, finished: true }; }

  function distribution(g) {
    var box = g.answers[g.i] || {}, d = [0, 0, 0, 0];
    Object.keys(box).forEach(function (id) { if (g.players[id] && !g.players[id].removed) d[box[id].choice]++; });
    return d;
  }
  // Statistiques de fin de partie.
  function finalStats(g) {
    var rk = ranking(g.players), streak = null;
    Object.keys(g.players).forEach(function (id) { var p = g.players[id]; if (!p.removed && p.best > 1 && (!streak || p.best > streak.n)) streak = { id: id, name: p.name, n: p.best }; });
    var hardest = null;
    for (var i = 0; i <= g.i && i < g.questions.length; i++) {
      var box = g.answers[i] || {}, ids = Object.keys(box); if (!ids.length) continue;
      var rate = ids.filter(function (id) { return box[id].correct; }).length / ids.length;
      if (!hardest || rate < hardest.rate) hardest = { seq: i, rate: rate, text: g.questions[i].text };
    }
    var f = g.fastest && g.players[g.fastest.id] ? { name: g.players[g.fastest.id].name, ms: g.fastest.ms } : null;
    return { ranking: rk, fastest: f, streak: streak, hardest: hardest, played: Math.min(g.i + 1, g.questions.length) };
  }

  // Message d'état envoyé à tous les téléphones (aucune bonne réponse avant la révélation).
  function publicState(g, now) {
    var q = current(g), st = { v: g.version, gid: g.id, phase: g.phase, n: g.questions.length, i: g.i, limit: g.limitMs };
    var rk = ranking(g.players);
    st.players = rk.length;
    st.ids = rk.map(function (p) { return p.id; });   // accusé d'inscription
    st.roster = g.phase === 'lobby' ? rk.map(function (p) { return [p.id, p.name, p.avatar]; }) : undefined;
    if (q && (g.phase === 'question' || g.phase === 'reveal' || g.phase === 'board')) {
      st.q = { text: q.text, options: q.options, cat: q.cat, level: q.level, double: q.double };
      if (g.phase === 'question') {
        st.pre = Math.max(0, g.startAt - now);
        st.left = Math.max(0, g.endAt - now);
        var box = g.answers[g.i] || {};
        st.got = Object.keys(box);                     // accusés de réception (identifiants seulement)
      } else {
        st.q.correct = q.correct; st.q.explanation = q.explanation; st.q.qid = q.id; st.q.url = q.sourceUrl || ''; st.dist = distribution(g);
      }
    }
    if (g.phase === 'reveal' || g.phase === 'board' || g.phase === 'podium') {
      var box2 = g.answers[g.i] || {};
      // score de chacun : [id, score, rang, points de la question, série, ms si juste, réponse choisie (-1 = aucune)]
      st.scores = rk.map(function (p) { var a = box2[p.id]; return [p.id, p.score, p.rank, p.last, p.streak, a && a.correct ? a.ms : -1, a ? a.choice : -1]; });
      st.top = rk.slice(0, 5).map(function (p) { return [p.name, p.avatar, p.score, p.last]; });
    }
    if (g.phase === 'podium') { var fs = finalStats(g); st.fastest = fs.fastest; st.streak = fs.streak && { name: fs.streak.name, n: fs.streak.n }; st.played = fs.played; }
    return st;
  }

  // Code de partie à 5 chiffres (pas de 0 au début, pour qu'on puisse le dicter dans le bus).
  function makePin(rnd) { rnd = rnd || Math.random; return String(10000 + Math.floor(rnd() * 90000)); }

  global.MDCampus = {
    MAX_POINTS: MAX_POINTS, MIN_POINTS: MIN_POINTS, GRACE_MS: GRACE_MS, LATE_MS: LATE_MS, STREAK_STEP: STREAK_STEP, STREAK_CAP: STREAK_CAP,
    SOURCES: SOURCES, SOURCE_LABEL: SOURCE_LABEL, AVATARS: AVATARS,
    hash: hash, rng: rng, shuffle: shuffle,
    fromTours: fromTours, tourTitles: tourTitles, fromLessons: fromLessons, fromHistory: fromHistory, fromArch: fromArch, buildBank: buildBank, poolFor: poolFor, countBy: countBy,
    plannedLevel: plannedLevel, readMs: readMs, buildGame: buildGame, speedPoints: speedPoints, scoreAnswer: scoreAnswer, ranking: ranking,
    createGame: createGame, join: join, removePlayer: removePlayer, startQuestion: startQuestion, answer: answer, everyoneAnswered: everyoneAnswered,
    reveal: reveal, showBoard: showBoard, finish: finish, distribution: distribution, finalStats: finalStats, publicState: publicState, current: current,
    makePin: makePin, cleanName: cleanName
  };
})(typeof window !== 'undefined' ? window : globalThis);
