/* Moreh Derech NEXT — « אדריכלות קלאסית » : logique partagée (sans DOM).
   Données : architecture/data.json (14 maquettes, 162 éléments, 83 questions ouvertes).
   Chargé tel quel par architecture.html et par les tests Node (vm) : expose window.MDArch / globalThis.MDArch. */
(function (global) {
  'use strict';

  var MAX_POINTS = 290;            // même plafond par élément que le quiz d'histoire (< 300, borne serveur)
  var ROUND_MS = 25000;            // 25 s par manche de zihouï
  var ROUND_KINDS = ['find', 'name', 'latin'];
  var TAG = /^[a-zA-Z0-9]{1,12}$/;

  function validate(d) {
    var err = [];
    if (!d || !Array.isArray(d.scenes) || !Array.isArray(d.open)) return ['structure'];
    var groups = {}; (d.groups || []).forEach(function (g) { groups[g.id] = 1; });
    var sids = {}, oids = {}, cats = {};
    (d.openCats || []).forEach(function (c) { cats[c.id] = 1; });
    d.scenes.forEach(function (s) {
      if (!/^[a-z]+$/.test(s.id) || sids[s.id]) err.push('scene id ' + s.id); sids[s.id] = 1;
      if (!groups[s.group]) err.push('group ' + s.id);
      if (!s.he || !s.intro || !Array.isArray(s.cam) || !Array.isArray(s.tgt)) err.push('scene fields ' + s.id);
      (s.src || []).forEach(function (k) { if (!d.sources || !d.sources[k]) err.push('source ' + s.id + ':' + k); });
      if (!Array.isArray(s.parts) || s.parts.length < 4) err.push('parts ' + s.id);
      var tags = {}, names = {};
      (s.parts || []).forEach(function (p) {
        if (!TAG.test(p.t) || tags[p.t]) err.push('tag ' + s.id + ':' + p.t); tags[p.t] = 1;
        if (names[p.he]) err.push('name ' + s.id + ':' + p.he); names[p.he] = 1;
        if (!p.he || !p.d || !p.la) err.push('part fields ' + s.id + ':' + p.t);
        if (!Array.isArray(p.p) || p.p.length !== 3 || !p.p.every(isFinite)) err.push('pos ' + s.id + ':' + p.t);
      });
    });
    d.open.forEach(function (q) {
      if (!/^A-[a-z]+-\d{2}$/.test(q.id) || oids[q.id]) err.push('open id ' + q.id); oids[q.id] = 1;
      if (!cats[q.cat]) err.push('open cat ' + q.id);
      if (!q.question || !Array.isArray(q.points) || q.points.length < 3) err.push('open fields ' + q.id);
    });
    return err;
  }

  // Identifiant stable d'un élément : « P:<maquette>:<étiquette> ».
  function partId(sceneId, tag) { return 'P:' + sceneId + ':' + tag; }
  function scene(d, id) { for (var i = 0; i < d.scenes.length; i++) if (d.scenes[i].id === id) return d.scenes[i]; return null; }

  // Générateur pseudo-aléatoire reproductible (tests) ; Math.random sinon.
  function rng(seed) {
    if (seed == null) return Math.random;
    var h = seed >>> 0 || 1;
    return function () { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  }
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Leurres : d'abord les autres éléments de la même maquette, puis, si besoin, d'autres maquettes (noms différents).
  function decoys(d, s, part, field, r) {
    var seen = {}; seen[part[field]] = 1;
    var pool = shuffle(s.parts.filter(function (p) { return p !== part && p[field] && p[field] !== '—'; }), r), out = [];
    pool.forEach(function (p) { if (out.length < 3 && !seen[p[field]]) { seen[p[field]] = 1; out.push(p[field]); } });
    if (out.length < 3) shuffle(d.scenes, r).forEach(function (o) { o.parts.forEach(function (p) {
      if (out.length < 3 && p[field] && p[field] !== '—' && !seen[p[field]]) { seen[p[field]] = 1; out.push(p[field]); } }); });
    return out;
  }

  // Une manche : find (toucher le bon numéro), name (élément surligné → son nom), latin (nom hébreu → terme latin).
  function buildRound(d, s, part, kind, r) {
    var id = partId(s.id, part.t);
    if (kind === 'find') return { kind: 'find', id: id, scene: s.id, tag: part.t, prompt: part.he, answer: part.t };
    var field = kind === 'latin' ? 'la' : 'he';
    var opts = shuffle([part[field]].concat(decoys(d, s, part, field, r)), r);
    return { kind: kind, id: id, scene: s.id, tag: part.t, prompt: kind === 'latin' ? part.he : null, options: opts, answer: opts.indexOf(part[field]) };
  }

  // Partie de zihouï : n manches sur une maquette (ou toutes), types mélangés, chaque élément au plus une fois.
  function buildRun(d, opts) {
    opts = opts || {};
    var r = rng(opts.seed), kinds = opts.kinds && opts.kinds.length ? opts.kinds : ROUND_KINDS;
    var scenes = opts.scene && opts.scene !== 'all' ? [scene(d, opts.scene)].filter(Boolean) : d.scenes;
    var items = [];
    scenes.forEach(function (s) { s.parts.forEach(function (p) { if (!(kinds.length === 1 && kinds[0] === 'latin' && p.la === '—')) items.push({ s: s, p: p }); }); });
    items = shuffle(items, r).slice(0, Math.max(1, Math.min(opts.n || 10, items.length)));
    // « find » n'a de sens que si la maquette est affichée : en mode « toutes », chaque manche charge sa maquette.
    return items.map(function (it, i) {
      var k = kinds[i % kinds.length];
      if (k === 'latin' && it.p.la === '—') k = 'name';
      return buildRound(d, it.s, it.p, k, r);
    });
  }

  function isCorrect(round, answer) { return round.kind === 'find' ? answer === round.answer : answer === round.answer; }

  // Points d'une manche : 100 si juste + jusqu'à 90 pour la vitesse + 20 par bonne réponse d'affilée (max 5) → 290.
  function scoreRound(ok, ms, streak, limit) {
    if (!ok) return 0;
    limit = limit || ROUND_MS;
    var speed = Math.round(90 * Math.max(0, 1 - Math.max(0, ms) / limit));
    return Math.min(MAX_POINTS, 100 + speed + 20 * Math.min(5, Math.max(0, streak)));
  }

  // Question ouverte : l'élève coche les points clés qu'il a cités. ≥ 75 % = réussie.
  function scoreOpen(checked, total) {
    if (!total) return { ratio: 0, points: 0, ok: false };
    var c = Math.max(0, Math.min(total, checked | 0)), ratio = c / total;
    return { ratio: ratio, points: Math.round(MAX_POINTS * ratio), ok: ratio >= 0.75 };
  }
  function grade(ratio) { return ratio >= 0.75 ? 'good' : ratio >= 0.5 ? 'mid' : 'bad'; }

  function openPool(d, opts) {
    opts = opts || {};
    return d.open.filter(function (q) {
      return (!opts.cats || !opts.cats.length || opts.cats.indexOf(q.cat) >= 0) && (!opts.level || opts.level === 'all' || q.level === +opts.level) && (!opts.ids || opts.ids.indexOf(q.id) >= 0);
    });
  }
  function buildOpenRun(d, opts) { opts = opts || {}; var p = shuffle(openPool(d, opts), rng(opts.seed)); return opts.n && opts.n !== 'all' ? p.slice(0, +opts.n) : p; }

  // Résultat versionné, enregistré par MDProgress.saveArch (ne touche pas aux autres jeux).
  function buildResult(o) {
    var details = (o.details || []).map(function (a) { return { itemId: a.itemId, correct: !!a.correct, points: Math.max(0, Math.min(MAX_POINTS, a.points | 0)) }; });
    var correct = details.filter(function (a) { return a.correct; }).length;
    return { version: 1, kind: 'arch', mode: o.mode, scene: o.scene || 'all', runId: o.runId, completedAt: o.completedAt || new Date().toISOString(),
      answerDetails: details, correct: correct, total: details.length, score: details.reduce(function (n, a) { return n + a.points; }, 0), durationMs: o.durationMs | 0 };
  }

  function counts(d) { return { scenes: d.scenes.length, parts: d.scenes.reduce(function (n, s) { return n + s.parts.length; }, 0), open: d.open.length }; }

  global.MDArch = { MAX_POINTS: MAX_POINTS, ROUND_MS: ROUND_MS, ROUND_KINDS: ROUND_KINDS, validate: validate, partId: partId, scene: scene, rng: rng, shuffle: shuffle,
    buildRound: buildRound, buildRun: buildRun, isCorrect: isCorrect, scoreRound: scoreRound, scoreOpen: scoreOpen, grade: grade, openPool: openPool, buildOpenRun: buildOpenRun,
    buildResult: buildResult, counts: counts };
})(typeof window !== 'undefined' ? window : globalThis);
