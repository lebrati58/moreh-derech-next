/* Moreh Derech NEXT — accès partagé aux données des סיורים.
   Une seule source pour les compteurs : tout est calculé depuis guided-quiz.json, jamais codé en dur. */
(function (global) {
  'use strict';
  var ALIAS = { arad: '03', carmel: '02', galil: '22' };

  // Identifiant de circuit d'une question : "01".."22" ou "road67".
  function tourOf(q) {
    if (q.tourId) return q.tourId;
    var m = /^tour(\d\d)$/.exec(q.source || '');
    return m ? m[1] : (ALIAS[q.source] || q.source || null);
  }

  // Accepte "04", "4", "tour04", "arad"… → "04" ; "road67" ; sinon null.
  function normalizeTourParam(value) {
    var v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'road67' || v === 'all') return v;
    if (ALIAS[v]) return ALIAS[v];
    var m = /^(?:tour)?(\d{1,2})$/.exec(v);
    if (m) { var n = Number(m[1]); if (n >= 1 && n <= 22) return (n < 10 ? '0' : '') + n; }
    return null;
  }

  function counts(questions) {
    var out = { total: 0, byLevel: { 1: 0, 2: 0, 3: 0 }, byTour: {} };
    (questions || []).forEach(function (q) {
      var t = tourOf(q);
      out.total++;
      out.byLevel[q.level] = (out.byLevel[q.level] || 0) + 1;
      var b = out.byTour[t] || (out.byTour[t] = { 1: 0, 2: 0, 3: 0, total: 0 });
      b[q.level] = (b[q.level] || 0) + 1; b.total++;
    });
    return out;
  }

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  global.MDTours = { tourOf: tourOf, normalizeTourParam: normalizeTourParam, counts: counts, getJSON: getJSON };
})(window);
