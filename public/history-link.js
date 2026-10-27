/* Moreh Derech NEXT — lien « ⏳ ציר הזמן » depuis les pages 3D.
   site3d.html : vers l'événement lié au site (ex. מצדה → נפילת מצדה).
   jerusalem3d.html : vers la période de la frise correspondant à la période affichée (événement « mdl:period »). */
(function () {
  'use strict';
  var top = document.querySelector('.top'); if (!top || !window.fetch) return;
  var a = document.createElement('a');
  a.className = 'hist-link'; a.hidden = true; a.textContent = '⏳'; a.setAttribute('aria-label', 'ציר הזמן והחידון'); a.title = 'ציר הזמן והחידון';
  var langs = top.querySelector('.langs'); top.insertBefore(a, langs || null);
  var data = null, pending = null;
  function forPeriod(n) {
    if (!data) { pending = n; return; }
    var p = data.periods.filter(function (x) { return x.j3d === n; })[0];
    a.hidden = !p; if (p) { a.href = 'history.html#/timeline?period=' + p.id; a.title = 'ציר הזמן — ' + p.name; a.setAttribute('aria-label', a.title); }
  }
  window.addEventListener('mdl:period', function (e) { forPeriod(Number(e.detail && e.detail.n)); });
  fetch('history-events.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
    data = d;
    if (/site3d\.html$/.test(location.pathname)) {
      var site = (new URLSearchParams(location.search).get('site') || 'masada').replace(/[^a-z]/g, '');
      var ev = d.events.filter(function (e) { return (e.sites || []).indexOf(site) >= 0; })[0];
      if (ev) { a.href = 'history.html#/event/' + ev.id; a.hidden = false; a.title = 'ציר הזמן — ' + ev.title; a.setAttribute('aria-label', a.title); }
    } else if (pending != null) forPeriod(pending);
  }).catch(function () {});
})();
