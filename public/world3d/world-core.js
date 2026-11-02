/* Moreh Derech NEXT — mondes 3D : logique pure (sans DOM ni three.js).
   Validation d'un site (sites/<id>.json), états de mission, score, enregistrement de progression.
   Chargé tel quel par world3d.html et par les tests Node (vm) : expose window.MDWorld / globalThis.MDWorld. */
(function (global) {
  'use strict';
  var LANGS = ['he', 'fr', 'en'];
  var CERTAINTY = ['attested', 'probable', 'hypothetical', 'modern', 'error'];
  var MISSION_TYPES = ['identify', 'chronology', 'compare', 'errors', 'exam'];
  var MAX_POINTS = 290;

  function tri(o) { return o && LANGS.every(function (l) { return typeof o[l] === 'string' && o[l].length; }); }
  function validate(site) {
    var err = [];
    if (!site || !/^[a-z-]+$/.test(site.id || '')) return ['id'];
    if (!tri(site.names)) err.push('names');
    var periods = {}; (site.periods || []).forEach(function (p) { periods[p.id] = 1; if (!tri(p.names) || !tri(p.reliabilityNote)) err.push('period ' + p.id); });
    if (!periods.present || !periods.ancient) err.push('periods present+ancient');
    var els = {}, parts = {};
    (site.elements || []).forEach(function (e) {
      if (!/^[A-Za-z0-9]{1,12}$/.test(e.id) || els[e.id]) err.push('element id ' + e.id); els[e.id] = e; parts[e.part] = 1;
      if (!tri(e.names) || !tri(e.info)) err.push('element text ' + e.id);
      if (CERTAINTY.indexOf(e.certainty) < 0) err.push('certainty ' + e.id);
      if (!Array.isArray(e.tags) || !e.tags.length) err.push('tags ' + e.id);
      (e.eras || []).forEach(function (r) { if (!periods[r]) err.push('era ' + e.id + ':' + r); });
      (e.sources || []).forEach(function (s) { if (!site.sources || !site.sources[s]) err.push('source ' + e.id + ':' + s); });
      if (e.certainty !== 'error' && e.certainty !== 'modern' && !(e.sources || []).length) err.push('no source ' + e.id);
    });
    (site.missions || []).forEach(function (m) {
      if (MISSION_TYPES.indexOf(m.type) < 0) err.push('mission type ' + m.id);
      if (!tri(m.names) || !tri(m.brief)) err.push('mission text ' + m.id);
      (m.targets || []).forEach(function (t) { if (!parts[t]) err.push('target ' + m.id + ':' + t); });
      (m.items || []).forEach(function (it) { if (!els[it.element]) err.push('item ' + m.id + ':' + it.element); if (!(m.choices || []).some(function (c) { return c.id === it.answer; })) err.push('answer ' + it.element); });
      ['lost', 'modern', 'errors'].forEach(function (k) { (m[k] || []).forEach(function (id) { if (!els[id]) err.push(k + ' ' + m.id + ':' + id); }); });
    });
    (site.questions || []).forEach(function (q) {
      if (!/^A-[a-z]+-\d{2}$/.test(q.id)) err.push('question id ' + q.id);
      if (!tri(q.q)) err.push('question text ' + q.id);
      LANGS.forEach(function (l) { if (!q.points || !Array.isArray(q.points[l]) || q.points[l].length < 3) err.push('points ' + q.id + ':' + l); });
      if (q.points && q.points.he && LANGS.some(function (l) { return q.points[l].length !== q.points.he.length; })) err.push('points length ' + q.id);
    });
    return err;
  }

  function element(site, id) { for (var i = 0; i < site.elements.length; i++) if (site.elements[i].id === id) return site.elements[i]; return null; }
  // Élément touché à partir d'une étiquette de maillage et de l'époque affichée.
  function elementForTag(site, tag, era, opts) {
    opts = opts || {};
    var cands = site.elements.filter(function (e) { return e.tags.indexOf(tag) >= 0 && (!era || e.eras.indexOf(era) >= 0) && (e.certainty !== 'error' || opts.errors); });
    // le plus spécifique d'abord (moins d'étiquettes), les erreurs avant tout en mission « erreurs »
    cands.sort(function (a, b) { return (b.certainty === 'error') - (a.certainty === 'error') || a.tags.length - b.tags.length; });
    return cands[0] || null;
  }

  // ---- missions ----
  function startMission(site, id) {
    var m = null; site.missions.forEach(function (x) { if (x.id === id) m = x; });
    if (!m) return null;
    var s = { id: m.id, type: m.type, found: [], misses: 0, done: false, step: 0, answers: [], picks: [] };
    if (m.type === 'identify') s.total = m.targets.length;
    if (m.type === 'chronology') s.total = m.items.length;
    if (m.type === 'compare') s.total = m.lost.length + m.modern.length;
    if (m.type === 'errors') s.total = m.errors.length;
    if (m.type === 'exam') s.total = site.questions.length;
    return s;
  }
  function mission(site, id) { var m = null; site.missions.forEach(function (x) { if (x.id === id) m = x; }); return m; }

  // Retourne { status: 'found'|'already'|'miss'|'ignore', key } et met l'état à jour.
  function pick(site, state, el, ctx) {
    if (!state || state.done || !el) return { status: 'ignore' };
    var m = mission(site, state.id), key = null;
    if (m.type === 'identify') key = m.targets.indexOf(el.part) >= 0 ? el.part : null;
    else if (m.type === 'compare') key = (m.lost.indexOf(el.id) >= 0 || m.modern.indexOf(el.id) >= 0) ? el.id : null;
    else if (m.type === 'errors') key = m.errors.indexOf(el.id) >= 0 ? el.id : null;
    else return { status: 'ignore' };
    state.picks.push(el.id);
    if (!key) { if (m.type === 'errors') state.misses++; return { status: m.type === 'errors' ? 'miss' : 'ignore' }; }
    if (state.found.indexOf(key) >= 0) return { status: 'already', key: key };
    state.found.push(key);
    if (state.found.length >= state.total) state.done = true;
    return { status: 'found', key: key };
  }
  function chronoItem(site, state) { var m = mission(site, state.id); return m.items[state.step] || null; }
  function answerChrono(site, state, choice) {
    var m = mission(site, state.id), it = m.items[state.step]; if (!it || state.done) return null;
    var ok = choice === it.answer; state.answers.push({ element: it.element, ok: ok, choice: choice });
    if (ok) state.found.push(it.element);
    state.step++; if (state.step >= m.items.length) state.done = true;
    return { ok: ok, answer: it.answer };
  }
  function scoreOpen(checked, total) { if (!total) return { ratio: 0, points: 0, ok: false }; var c = Math.max(0, Math.min(total, checked | 0)), r = c / total; return { ratio: r, points: Math.round(MAX_POINTS * r), ok: r >= 0.75 }; }

  // Résultat au format de MDProgress.saveArch (même système de points que « אדריכלות קלאסית »).
  function missionResult(site, state, runId) {
    var m = mission(site, state.id), details = [];
    if (m.type === 'exam') details = state.answers.map(function (a) { return { itemId: a.id, correct: a.ok, points: a.points }; });
    else if (m.type === 'chronology') details = state.answers.map(function (a) { return { itemId: 'P:' + site.id.replace(/-/g, '') + ':' + a.element, correct: a.ok, points: a.ok ? 200 : 0 }; });
    else details = state.found.map(function (k) { return { itemId: 'P:' + site.id.replace(/-/g, '') + ':' + k, correct: true, points: Math.max(60, 200 - 40 * state.misses) }; });
    var correct = details.filter(function (d) { return d.correct; }).length;
    return { version: 1, kind: 'arch', mode: 'world-' + m.type, scene: site.id.replace(/-/g, ''), runId: runId, completedAt: new Date().toISOString(),
      answerDetails: details, correct: correct, total: details.length, score: details.reduce(function (n, d) { return n + d.points; }, 0), durationMs: 0 };
  }

  // ---- réglages graphiques ----
  var QUALITY = {
    low: { dpr: 1, shadows: false, shadowMap: 0, detail: 0, far: 260, water: 0 },
    medium: { dpr: 1.25, shadows: true, shadowMap: 1024, detail: 1, far: 380, water: 1 },
    high: { dpr: 2, shadows: true, shadowMap: 2048, detail: 2, far: 520, water: 2 }
  };
  function autoQuality(info) {
    info = info || {};
    var mobile = !!info.mobile, cores = info.cores || 4, mem = info.memory || 4;
    if (mobile) return (cores >= 8 && mem >= 6) ? 'medium' : 'low';
    return cores >= 8 ? 'high' : 'medium';
  }
  // Ajustement dynamique : si la moyenne mesurée reste sous 28 i/s, on descend d'un cran.
  function adapt(level, avgFps) { if (avgFps < 28) return level === 'high' ? 'medium' : 'low'; return level; }

  global.MDWorld = { LANGS: LANGS, CERTAINTY: CERTAINTY, MISSION_TYPES: MISSION_TYPES, QUALITY: QUALITY, validate: validate, element: element, elementForTag: elementForTag,
    startMission: startMission, mission: mission, pick: pick, chronoItem: chronoItem, answerChrono: answerChrono, scoreOpen: scoreOpen, missionResult: missionResult,
    autoQuality: autoQuality, adapt: adapt };
})(typeof window !== 'undefined' ? window : globalThis);
