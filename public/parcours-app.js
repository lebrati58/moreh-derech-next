/* Moreh Derech NEXT — « סיפורי דרך » : un seul lecteur pour tous les parcours (route 67 = modèle de référence).
   #/                 liste des parcours publiés (?preview=1 : aussi les brouillons, pour Lionel)
   #/t/ID             accueil du parcours : carte, sources, choix du mode
   #/t/ID/study/N     מצב לימוד : lieu N, ce que dit le prof, questions avec réponse et explication
   #/t/ID/exam        מצב מבחן : chronomètre, score, sans solution avant la fin
   #/t/ID/result      correction détaillée avec les sources
   Déplacement : manuel, simulation, ou GPS réel (gps-engine.js, le même moteur que la route 67). */
(function () {
  'use strict';
  const G = window.MDL_GPS, E = window.MDTourEngine, P = window.MDProgress || null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('he-IL');
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const PREVIEW = /[?&]preview=1\b/.test(location.search);
  const RUN_KEY = 'mdl_tour_run_v1', LAST_KEY = 'mdl_tour_last_v1';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const ss = { get(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const say = t => { $('live').textContent = ''; setTimeout(() => { $('live').textContent = t; }, 30); };
  const SIDE = { right: { he: 'מימין', arrow: '▶' }, left: { he: 'משמאל', arrow: '◀' } };
  const TYPE = { mcq: '❓ שאלה', recognize: '👀 זיהוי מהאוטובוס', error: '🔎 מצאו את הטעות', side: '↔️ ימין או שמאל' };

  let INDEX = null, T = null, GP = null, map = null, layers = null, markers = [], bus = null, routeBounds = null;
  let ride = { mode: 'manual', sim: null, trk: null, watch: null, tick: null, mul: 8 };
  let run = null, timer = null, ticker = null;
  const cache = {};

  // ------------------------------------------------------------------ données
  const getJSON = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  async function loadTour(id) {
    if (cache[id]) return cache[id];
    const t = await getJSON('tours/' + encodeURIComponent(id) + '.json');
    t.isPublic = E.publishable(t);
    t.qAll = (t.questions || []);
    cache[id] = t; return t;
  }
  const visibleTour = t => t && (t.isPublic || PREVIEW);

  // ------------------------------------------------------------------ navigation
  function parse() { const h = location.hash.replace(/^#\/?/, ''); const parts = h.split('/'); return { view: parts[0] || 'list', id: parts[1] ? decodeURIComponent(parts[1]) : null, sub: parts[2] || 'home', n: Number(parts[3] || 0) }; }
  function go(h, replace) { if (replace) location.replace(h); else location.hash = h; }
  async function route() {
    const r = parse();
    if (r.view !== 't') stopRide();
    if (r.view === 't' && r.sub !== 'exam') pauseRun('nav');
    try {
      if (r.view === 't' && r.id) {
        const t = await loadTour(r.id);
        if (!visibleTour(t)) { renderBlocked(t); return; }
        if (T !== t) { T = t; GP = t.route && t.route.geometry ? G.prepare(E.toGpsRoute(t)) : null; buildMap(); }
        if (r.sub === 'study') renderStudy(Math.max(0, Math.min(t.stops.length - 1, r.n)));
        else if (r.sub === 'exam') renderExam();
        else if (r.sub === 'result') renderResult();
        else renderHome();
      } else { T = null; await renderList(); }
    } catch (e) { console.error(e); $('view').innerHTML = `<div class="card"><h2>⚠️ לא הצלחנו לטעון את המסלול</h2><p>${esc(e.message)}</p><a class="btn" href="#/">לכל המסלולים</a></div>`; $('below').innerHTML = ''; showMap(false); }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ liste
  async function renderList() {
    showMap(false);
    if (!INDEX) INDEX = await getJSON('tours/index.json');
    const list = INDEX.tours.filter(t => t.public || PREVIEW);
    $('view').innerHTML = `<section class="hero"><div class="eyebrow">★ ROAD STORIES · MAP · QUIZ ★</div><h1>🛣️ סיפורי דרך</h1><p>הנסיעה עצמה היא חלק מהחומר: מה רואים מימין ומשמאל, ומה המורה הסביר בדרך. לומדים על המפה — ואז נבחנים.</p></section>`;
    $('below').innerHTML = `<div class="tlist">${list.map(t => `<a class="titem" href="#/t/${esc(t.id)}"><span class="n">${t.id === 'road67' ? '67' : esc(t.id)}</span><span><b>${esc(t.title)}</b><small>${esc(t.subtitle || '')} · ${t.stops} מקומות · ${t.questions} שאלות</small>${t.public ? '' : `<span class="badge ${esc(t.status)}">טיוטה · ${esc(E.STATUS_LABEL[t.status].he)}${t.issues ? ' · ' + t.issues + ' בעיות' : ''}</span>`}</span></a>`).join('')}</div>
      <p class="foot">מסלול 67 הוא מסלול הייחוס. מסלולים נוספים נבנים מהקלטות המורה בסיורים, ומתפרסמים רק אחרי בדיקה: מיקום כל מקום (ויקיפדיה/ויקינתונים), הצד שבו הוא נראה מהאוטובוס, ומקור לכל שאלה.${PREVIEW ? '' : ' <a href="?preview=1#/">תצוגת טיוטות (לצוות)</a>'}</p>`;
  }
  function renderBlocked(t) {
    showMap(false);
    $('view').innerHTML = `<div class="card"><h2>🔒 המסלול עוד לא פורסם</h2><p>„${esc(t.title)}” נמצא בבדיקה (${esc(E.STATUS_LABEL[t.status].he)}).</p><a class="btn" href="#/">לכל המסלולים</a></div>`;
    $('below').innerHTML = '';
  }
  const draftNote = t => t.isPublic ? '' : `<div class="draft">🧪 <b>טיוטה — לא אומתה ולא פורסמה לתלמידים.</b> ${esc(t.statusNote || '')}${t.check && t.check.errors.length ? `<br>⛔ ${t.check.errors.length} בעיות חוסמות (למשל: ${esc(t.check.errors[0])}).` : ''}${t.check && t.check.warnings.length ? `<br>⚠️ ${t.check.warnings.length} אזהרות.` : ''}<br>בטיוטה הניקוד לא נספר.</div>`;

  // ------------------------------------------------------------------ carte
  function showMap(on) { $('mapWrap').hidden = !on; if (on && map) setTimeout(() => map.invalidateSize(), 30); }
  function buildMap() {
    if (!window.L || !GP) { if (map) { map.remove(); map = null; } return; }
    if (map) { map.remove(); map = null; }
    map = L.map('map', { zoomControl: true, attributionControl: true, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, className: 'osm-dark', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · Wikidata' }).addTo(map);
    layers = L.layerGroup().addTo(map);
    const line = L.polyline(T.route.geometry, { color: '#ffd878', weight: 5, opacity: .9, dashArray: T.route.status === 'verified' ? null : '10 8' }).addTo(layers);
    markers = T.stops.map((s, i) => s.coord ? L.marker([s.coord.lat, s.coord.lon], { icon: pin(i, ''), keyboard: false, title: s.name }).addTo(layers).on('click', () => { if (parse().sub === 'study') go(`#/t/${T.id}/study/${i}`); }) : null);
    routeBounds = line.getBounds(); map.fitBounds(routeBounds, { padding: [24, 24] });
    bus = null;
  }
  function pin(i, cls, label) { return L.divIcon({ className: '', html: `<div class="pin ${cls}">${label == null ? i + 1 : label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }); }
  function paintPins(cur, opts) {
    opts = opts || {};
    markers.forEach((m, i) => { if (!m) return; const cls = opts.target === i ? 'target' : i === cur ? 'cur' : opts.mute ? 'mute' : i < cur ? 'done' : '';
      m.setIcon(pin(i, cls, opts.target === i ? '?' : opts.hideNumbers ? '' : null)); m.options.title = opts.hideNames ? '' : T.stops[i].name; });
    const s = T.stops[cur];
    // la carte peut avoir été dimensionnée cachée : on recadre après l'affichage
    setTimeout(() => { if (!map) return; map.invalidateSize(); if (s && s.coord && opts.focus !== false) map.setView([s.coord.lat, s.coord.lon], Math.max(map.getZoom(), opts.zoom || 13), { animate: !reduce() }); else if (routeBounds) map.fitBounds(routeBounds, { padding: [24, 24] }); }, 40);
  }
  function moveBus(lat, lon) {
    if (!map) return;
    if (!bus) bus = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="bus" aria-hidden="true">🚌</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: false }).addTo(map);
    else bus.setLatLng([lat, lon]);
  }

  // ------------------------------------------------------------------ accueil du parcours
  function sourcesBox(t) {
    const out = [];
    if (t.transcript) out.push(`<a href="${esc(t.transcript.url)}" target="_blank" rel="noopener noreferrer">🎙️ ${esc(t.transcript.title)} ↗<br><small style="color:var(--soft)">${esc(t.transcript.note || '')}</small></a>`);
    (t.docs || []).forEach(d => out.push(`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">📚 ${esc(d.title)} ↗</a>`));
    if (t.route) out.push(`<div>🗺️ התוואי: ${t.route.status === 'verified' ? 'מאומת בנסיעה' : 'משוער'} · ${esc(t.route.source || '')}. מיקומי המקומות: ויקיפדיה/ויקינתונים.</div>`);
    return `<div class="srcs">${out.join('')}</div>`;
  }
  function renderHome() {
    const t = T, st = P && P.tourStats ? P.tourStats(t.id) : null, nExam = E.questionsFor(t, 'exam').length;
    $('view').innerHTML = `<section class="hero"><div class="eyebrow">★ ${t.id === 'road67' ? 'ROAD 67 · REFERENCE' : 'TOUR ' + esc(t.id)} ★</div><h1>${esc(t.title)}</h1><p>${esc(t.subtitle || '')}</p></section>${draftNote(t)}`;
    showMap(!!GP);
    if (GP) paintPins(-1, { focus: false }); else $('view').insertAdjacentHTML('beforeend', `<div class="nomap">🗺️ המפה תופיע אחרי שליפת מיקומי המקומות מוויקיפדיה (GitHub Actions). אפשר כבר ללמוד ברשימה.</div>`);
    $('below').innerHTML = `<div class="modes">
        <a class="mode" href="#/t/${esc(t.id)}/study/0"><b>📖 מצב לימוד</b><small>נוסעים לאורך המסלול: מה רואים, מה המורה אמר, ושאלות עם תשובה והסבר מיד.</small></a>
        <a class="mode exam" href="#/t/${esc(t.id)}/exam"><b>🎯 מצב מבחן</b><small>${nExam} שאלות · 30 שניות לשאלה · זיהוי מקומות ומציאת טעויות · התשובות בסוף.</small></a>
      </div>
      ${st && (st.known.length || st.mistakes.length) ? `<div class="card"><h2>📊 ההתקדמות שלי</h2><p style="margin:0">✅ ${st.known.length} שאלות שידעתי · 🔁 ${st.mistakes.length} לחזרה${st.points ? ' · 🏆 ' + fmt(st.points) + ' נק׳ שיא במבחן' : ''}</p></div>` : ''}
      <div class="card"><h2>📎 מקורות</h2>${sourcesBox(t)}<p class="foot" style="margin-top:10px">🎙️ = מה שהמורה אמר בהקלטה (ציטוט) · 📚 = מסמך הקורס · 🌐 = השלמה חיצונית. שאלות שמבוססות על אנקדוטה או שעוד לא נבדקו מופיעות רק במצב לימוד.</p></div>`;
  }

  // ------------------------------------------------------------------ מצב לימוד
  const answered = () => ss.get('mdl_tour_study_' + T.id, {});
  const saveAnswered = a => ss.set('mdl_tour_study_' + T.id, a);
  function sideBox(s) {
    if (!s.side || !s.side.teacher) return '';
    const S = SIDE[s.side.teacher], warn = s.side.agree === false;
    return `<div class="side${warn ? ' warn' : ''}"><span class="arrow" aria-hidden="true">${S.arrow}</span><span>${S.he} לאוטובוס, לפי המורה${s.sideQuote ? `<small style="display:block;color:var(--soft);font-weight:600">„${esc(s.sideQuote)}”</small>` : ''}${warn ? '<small style="display:block;color:#ffe2a6">⚠️ לפי המפה הצד אחר — לבדיקה</small>' : s.side.agree ? '<small style="display:block;color:#a6f5d2">✓ תואם את המפה</small>' : ''}</span></div>`;
  }
  function renderStudy(i) {
    const t = T, s = t.stops[i], qs = t.qAll.filter(q => q.stop === s.id), a = answered();
    $('view').innerHTML = `${draftNote(t)}<div class="stopbar"><button type="button" id="prevStop" aria-label="המקום הקודם" ${i ? '' : 'disabled'}>›</button><div class="t"><small>📖 מצב לימוד · ${i + 1} מתוך ${t.stops.length}</small><b>${esc(s.name)}</b></div><button type="button" id="nextStop" aria-label="המקום הבא" ${i < t.stops.length - 1 ? '' : 'disabled'}>‹</button></div>
      ${GP ? `<div class="rides" role="group" aria-label="איך נוסעים"><button type="button" data-ride="manual" aria-pressed="${ride.mode === 'manual'}">👆 ידני</button><button type="button" data-ride="sim" aria-pressed="${ride.mode === 'sim'}">🧪 נסיעה מדומה</button><button type="button" data-ride="gps" aria-pressed="${ride.mode === 'gps'}">📍 GPS באוטובוס</button></div><div class="ctl" id="rideCtl"></div>` : ''}`;
    showMap(!!GP); if (GP) paintPins(i, { zoom: 13 });
    $('below').innerHTML = `${sideBox(s)}${s.look ? `<p class="look">👀 ${esc(s.look)}</p>` : ''}
      ${(s.story || []).length ? `<div class="card"><h2>🎙️ מה המורה אמר כאן</h2>${s.story.map(x => `<div class="quote">„${esc(x)}”<small>${t.transcript ? 'מתוך ' + esc(t.transcript.title) : 'מתוך מסמכי ההדרכה'}</small></div>`).join('')}</div>` : ''}
      ${qs.map(q => qCard(q, a[q.id], true)).join('') || '<p class="foot">אין שאלה במקום הזה.</p>'}
      <div class="row2"><a class="btn" href="#/t/${esc(t.id)}">⌂ למסלול</a><a class="btn go" href="#/t/${esc(t.id)}/exam">🎯 למבחן</a></div>`;
    $('prevStop').onclick = () => go(`#/t/${t.id}/study/${i - 1}`, true);
    $('nextStop').onclick = () => go(`#/t/${t.id}/study/${i + 1}`, true);
    document.querySelectorAll('[data-ride]').forEach(b => b.onclick = () => setRide(b.dataset.ride, i));
    $('below').querySelectorAll('.q').forEach(el => el.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b || b.disabled) return;
      const q = t.qAll.find(x => x.id === el.dataset.q), aa = answered(); aa[q.id] = Number(b.dataset.i); saveAnswered(aa);
      el.outerHTML = qCard(q, aa[q.id], true); say(aa[q.id] === q.correct ? 'נכון' : 'לא נכון — התשובה הנכונה מסומנת');
    }));
    rideControls(i);
  }
  function sourcesHTML(q) {
    return (q.sources || []).map(x => `<span class="s">${E.SOURCE_LABEL[x.kind]}${x.title ? ' · ' + (x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>` : esc(x.title)) : ''}${x.quote ? `<br>„${esc(x.quote)}”` : ''}</span>`).join('');
  }
  function qCard(q, chosen, reveal) {
    const done = chosen != null;
    const cert = q.certainty === 'anecdote' ? ' · 💬 אנקדוטה (לא במבחן)' : q.certainty === 'check' ? ' · ⚠️ לבדיקה (לא במבחן)' : q.certainty === 'approx' ? ' · ≈ מקורב' : '';
    return `<article class="q" data-q="${esc(q.id)}"><span class="qtag">${TYPE[q.type]}${cert}</span><h3>${esc(q.prompt)}</h3>
      ${q.options.map((o, k) => { let c = 'ans'; if (done && reveal) c += k === q.correct ? ' correct' : k === chosen ? ' wrong' : ' dim'; return `<button type="button" class="${c}" data-i="${k}" ${done ? 'disabled' : ''}>${esc(o)}${done && reveal && k === q.correct ? ' ✓' : ''}</button>`; }).join('')}
      ${done && reveal ? `<div class="fb ${chosen === q.correct ? 'good' : 'bad'}"><b>${chosen === q.correct ? '✅ נכון!' : '❌ לא בדיוק.'}</b> ${esc(q.explanation)}${sourcesHTML(q)}</div>` : ''}</article>`;
  }

  // ------------------------------------------------------------------ déplacement (simulation / GPS)
  function stopRide() {
    clearInterval(ride.tick); ride.tick = null; ride.sim = null;
    if (ride.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(ride.watch); ride.watch = null; ride.trk = null;
  }
  function setRide(mode, i) {
    stopRide(); ride.mode = mode;
    document.querySelectorAll('[data-ride]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ride === mode)));
    if (mode === 'sim') {
      ride.sim = new G.Simulator(GP, {});
      const st = GP.stops.find(x => x.id === T.stops[i].id); if (st) ride.sim.s = Math.max(0, st.zoneStart - 200);
      ride.tick = setInterval(() => { const fix = ride.sim.step(0.2 * ride.mul, Date.now()); if (fix) onPosition(ride.sim.s, fix.lat, fix.lon); if (ride.sim.done) { clearInterval(ride.tick); say('הגענו לסוף המסלול'); } }, 200);
    } else if (mode === 'gps') {
      if (!navigator.geolocation) { $('rideCtl').textContent = 'אין GPS בדפדפן הזה.'; return; }
      ride.trk = new G.Tracker(GP);
      ride.watch = navigator.geolocation.watchPosition(p => {
        ride.trk.update({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, heading: p.coords.heading, timestamp: p.timestamp });
        moveBus(p.coords.latitude, p.coords.longitude);
        const st = ride.trk.status ? ride.trk.status(Date.now()) : { mode: ride.trk.mode };
        $('rideCtl').textContent = ride.trk.s == null ? '📡 מחפש את המסלול…' : st.mode === 'off_route' ? '⚠️ מחוץ למסלול' : '📍 על המסלול';
        if (ride.trk.s != null) onPosition(ride.trk.s, null, null);
      }, () => { $('rideCtl').textContent = '⚠️ לא קיבלנו מיקום. אפשר להמשיך ידנית.'; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    rideControls(i);
  }
  function rideControls() {
    const c = $('rideCtl'); if (!c) return;
    if (ride.mode === 'sim') { c.innerHTML = `מהירות: <button type="button" data-mul="4">×4</button><button type="button" data-mul="8">×8</button><button type="button" data-mul="20">×20</button> · המקום הבא נפתח לבד`; c.querySelectorAll('[data-mul]').forEach(b => b.onclick = () => { ride.mul = Number(b.dataset.mul); }); }
    else if (ride.mode === 'manual') c.textContent = 'עוברים בין המקומות עם החצים.';
  }
  function onPosition(s, lat, lon) {
    if (lat != null) moveBus(lat, lon);
    const r = parse(); if (r.sub !== 'study') return;
    // le lieu « actif » est le dernier dont la zone a commencé : on n'avance que vers l'avant
    let idx = -1; GP.stops.forEach(st => { if (s >= st.zoneStart) idx = T.stops.findIndex(x => x.id === st.id); });
    if (idx > r.n) { if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {} go(`#/t/${T.id}/study/${idx}`, true); }
  }

  // ------------------------------------------------------------------ מצב מבחן
  function newRun() {
    const qs = E.questionsFor(T, 'exam');
    run = { v: 1, runId: uuid(), tourId: T.id, mode: 'exam', ids: qs.map(q => q.id), i: 0, answers: [], score: 0, streak: 0, activeMs: 0, phase: 'question', left: null, paused: 'nav', draft: !T.isPublic };
    saveRun();
  }
  function saveRun() { if (!run) return; if (timer && run.phase === 'question') run.left = timer.remaining(); store.set(RUN_KEY, run); }
  function loadRun() { const r = store.get(RUN_KEY, null); return r && r.v === 1 && r.tourId === T.id && r.phase !== 'done' ? r : null; }
  function pauseRun(why) { if (!run || run.phase !== 'question' || run.paused) return; if (timer) timer.pause(); clearInterval(ticker); ticker = null; run.paused = why; saveRun(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden && parse().sub === 'exam') { pauseRun('bg'); if (run) renderExam(); } });
  function renderExam() {
    if (!run || run.tourId !== T.id) run = loadRun();
    if (!run) { renderExamSetup(); return; }
    const q = T.qAll.find(x => x.id === run.ids[run.i]);
    if (!q) { finish(); return; }
    const s = T.stops.find(x => x.id === q.stop), si = T.stops.indexOf(s);
    timer = new E.Timer(E.DURATION_MS); if (run.left != null) timer.left = run.left;
    const a = run.phase === 'answered' ? run.answers[run.i] : null;
    $('view').innerHTML = `${draftNote(T)}<div class="hud"><div class="s"><span>🏆 ניקוד</span><strong id="hScore">${fmt(run.score)}</strong></div><div style="text-align:center;flex:1"><small style="color:var(--soft)">🎯 מבחן · שאלה ${run.i + 1} מתוך ${run.ids.length}</small><div class="timebar" id="tb"><span id="tbFill" style="width:100%"></span></div><b id="hSec" style="direction:ltr;display:inline-block">30</b></div><div class="s"><span>🔥 רצף</span><strong>${run.streak}</strong></div></div>`;
    showMap(!!GP);
    if (GP && si >= 0) paintPins(si, { target: q.type === 'recognize' ? si : null, mute: true, hideNames: true, hideNumbers: true, zoom: 13 });
    if (run.paused && run.phase === 'question' && run.paused !== 'nav') {
      $('below').innerHTML = `<div class="paused"><b>⏸ המבחן מושהה</b><p style="color:var(--soft)">השעון עצר והשאלה מוסתרת.</p><button type="button" class="btn go" id="resume">▶ ממשיכים</button></div>`;
      $('resume').onclick = () => { run.paused = null; renderExam(); }; return;
    }
    $('below').innerHTML = `<article class="q"><span class="qtag">${TYPE[q.type]}</span><h3 id="qt" tabindex="-1">${esc(q.prompt)}</h3>
      ${q.options.map((o, k) => { let c = 'ans'; if (a) c += k === a.chosen ? ' picked' : ' dim'; return `<button type="button" class="${c}" data-i="${k}" ${a ? 'disabled' : ''}><b aria-hidden="true" style="color:#7d86b3">${k + 1}.</b> ${esc(o)}</button>`; }).join('')}
      ${a ? `<div class="fb ${a.correct ? 'good' : 'bad'}"><b>${a.correct ? '✅ נכון! +' + a.points : a.timedOut ? '⌛ נגמר הזמן' : '❌ לא נכון'}</b> — התשובות וההסברים בסוף המבחן.</div><button type="button" class="btn go" id="next" style="width:100%;margin-top:12px">${run.i === run.ids.length - 1 ? '🏁 לתוצאות ולתיקון' : 'לשאלה הבאה ←'}</button>` : ''}</article>
      <div class="row2"><button type="button" class="btn" id="pauseBtn" ${a ? 'disabled' : ''}>⏸ השהיה</button><a class="btn" href="#/t/${esc(T.id)}">יציאה (נשמר)</a></div>`;
    $('below').querySelectorAll('[data-i]').forEach(b => b.onclick = () => answer(Number(b.dataset.i)));
    if ($('next')) { $('next').onclick = next; $('next').focus({ preventScroll: true }); }
    $('pauseBtn').onclick = () => { pauseRun('user'); renderExam(); };
    if (!a) { run.paused = null; timer.start(); tick(); clearInterval(ticker); ticker = setInterval(tick, 100); $('qt').focus({ preventScroll: true }); }
    else { $('hSec').textContent = '—'; }
  }
  function renderExamSetup() {
    const qs = E.questionsFor(T, 'exam'), all = T.qAll.length;
    showMap(!!GP); if (GP) paintPins(-1, { focus: false });
    $('view').innerHTML = `${draftNote(T)}<section class="hero"><div class="eyebrow">★ EXAM · 30 SEC ★</div><h1>🎯 מצב מבחן</h1><p>${esc(T.title)}</p></section>`;
    $('below').innerHTML = `<div class="card"><h2>איך זה עובד</h2><ul style="margin:0;padding-inline-start:20px;line-height:1.8;color:var(--soft)">
      <li>${qs.length} שאלות לפי סדר המסלול (מתוך ${all}; אנקדוטות ושאלות שעוד לא נבדקו — רק בלימוד).</li><li>⏳ 30 שניות לשאלה. נגמר הזמן = טעות.</li>
      <li>👀 בשאלות זיהוי, המקום מסומן במפה בלי שם — מזהים אותו לבד.</li><li>🔎 בשאלות „מצאו את הטעות” — בוחרים את המשפט השגוי.</li>
      <li>🏆 נכון = 100 + 3 × השניות שנותרו + בונוס רצף. ${T.isPublic ? 'השיא בכל שאלה נספר במסע שלך.' : 'בטיוטה הניקוד לא נספר.'}</li><li>📋 בסוף: תיקון מלא עם ההסבר והמקור של כל שאלה.</li></ul>
      <button type="button" class="btn go" id="startExam" style="width:100%;margin-top:14px" ${qs.length ? '' : 'disabled'}>מתחילים ←</button></div>`;
    $('startExam').onclick = () => { newRun(); renderExam(); };
  }
  function tick() {
    if (!run || run.phase !== 'question' || run.paused) { clearInterval(ticker); return; }
    const left = timer.remaining(), sec = Math.ceil(left / 1000);
    if ($('hSec')) $('hSec').textContent = sec; if ($('tbFill')) $('tbFill').style.width = (left / E.DURATION_MS * 100) + '%';
    if ($('tb')) $('tb').classList.toggle('urgent', left <= 8000);
    if (timer.expired()) answer(null);
  }
  function answer(k) {
    if (!run || run.phase !== 'question' || run.paused) return;
    timer.pause(); clearInterval(ticker);
    const q = T.qAll.find(x => x.id === run.ids[run.i]), left = timer.remaining(), correct = k === q.correct;
    const pts = E.scoreAnswer(correct, left, run.streak);
    run.streak = correct ? run.streak + 1 : 0; run.score += pts; run.activeMs += E.DURATION_MS - left;
    run.answers[run.i] = { questionId: q.id, stop: q.stop, chosen: k, correct, timedOut: k == null, points: pts, msUsed: Math.round(E.DURATION_MS - left) };
    run.phase = 'answered'; run.left = null; saveRun(); say(correct ? 'נכון' : k == null ? 'נגמר הזמן' : 'לא נכון');
    if (correct && navigator.vibrate) try { navigator.vibrate(18); } catch (e) {}
    renderExam();
  }
  function next() { if (run.i >= run.ids.length - 1) { finish(); return; } run.i++; run.phase = 'question'; run.paused = null; run.left = null; saveRun(); renderExam(); }
  function finish() {
    if (!run || run.phase === 'done') return;
    run.phase = 'done';
    const rec = E.result(T, run);
    let saved = { saved: false, gained: 0 };
    try { if (P && P.saveTourRun) saved = P.saveTourRun(rec, { draft: run.draft }); } catch (e) { console.error(e); }
    try { window.dispatchEvent(new CustomEvent('moreh-dereh:tour-complete', { detail: rec })); } catch (e) {}
    store.set(LAST_KEY, { tourId: T.id, record: rec, gained: saved.gained || 0, counted: !!saved.counted, correction: E.correction(T, run) });
    store.del(RUN_KEY); run = null; go(`#/t/${T.id}/result`, true);
  }
  function renderResult() {
    const last = store.get(LAST_KEY, null);
    if (!last || last.tourId !== T.id) { go(`#/t/${T.id}`, true); return; }
    const r = last.record, pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
    showMap(false);
    $('view').innerHTML = `${draftNote(T)}<section class="card res"><h2>${pct >= 80 ? '🎉 מצוין!' : pct >= 60 ? '👏 יפה!' : '💪 ממשיכים ללמוד'}</h2><div class="big">${r.correct} / ${r.total}</div><p style="font-size:20px;font-weight:900;margin:4px 0">🏆 ${fmt(r.score)} נקודות</p>
      <p style="color:var(--soft)">${last.counted ? (last.gained > 0 ? `📈 +${fmt(last.gained)} נקודות חדשות במסע שלך` : '📈 אין שיא חדש — רק השיא בכל שאלה נספר') : 'הניקוד לא נספר (טיוטה)'}</p>
      <div class="row2"><a class="btn go" href="#/t/${esc(T.id)}/exam">↻ מבחן חוזר</a><a class="btn" href="#/t/${esc(T.id)}/study/0">📖 לימוד</a></div></section>`;
    $('below').innerHTML = `<h2 style="font-size:17px;margin:18px 0 0">📋 תיקון מפורט</h2><ul class="corr">${last.correction.map(c => `<li class="${c.correct ? 'ok' : ''}"><b>${c.correct ? '✅' : c.timedOut ? '⌛' : '❌'} ${esc(c.place || '')} — ${esc(c.prompt)}</b>${c.correct ? '' : `תשובתך: ${esc(c.chosen == null ? '—' : c.chosen)}<br>`}התשובה: <b style="display:inline">${esc(c.expected)}</b><br>${esc(c.explanation)}${c.sources.map(x => `<span class="src">${E.SOURCE_LABEL[x.kind]}${x.title ? ' · ' + (x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>` : esc(x.title)) : ''}${x.quote ? ' — „' + esc(x.quote) + '”' : ''}</span>`).join('')}</li>`).join('')}</ul>`;
  }

  document.addEventListener('keydown', e => {
    if (parse().sub !== 'exam' || !run || run.phase !== 'question' || run.paused || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key)) { const k = Number(e.key) - 1; const q = T.qAll.find(x => x.id === run.ids[run.i]); if (q && k < q.options.length) { e.preventDefault(); answer(k); } }
  });
  window.MDTourApp = { state: () => run, tour: () => T, ride: () => ride };
  route();
})();
