/* Moreh Derech NEXT — « הדרכת דרך — מדריך באוטובוס » (page hadracha.html).
   #/                         liste des parcours (?preview=1 : aussi les brouillons — pour Lionel)
   #/r/ID?dir=fwd|rev&mode=study|practice
   Déplacement : 🧪 simulation (vitesse réglable), 📍 GPS (gps-engine.js, le moteur de la route 67), 👆 manuel.
   Décision « quand parler » : hadracha-engine.js. Rien n'est envoyé au serveur ; le repérage reste sur le téléphone
   jusqu'à l'export. */
(function () {
  'use strict';
  const G = window.MDL_GPS, H = window.MDHadracha;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PREVIEW = /[?&]preview=1\b/.test(location.search);
  const SCOUT_KEY = 'mdl_hadracha_scout_v1', PREF_KEY = 'mdl_hadracha_pref_v1';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const say = t => { const l = $('live'); if (!l) return; l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); };
  const SIDE_HE = H.SIDE_HE, ARROW = { right: '👉', left: '👈', ahead: '⬆️', along: '↔️' };
  const KIND = { transcript: '🎙️ הקלטת המורה', 'course-doc': '📚 דף הקורס', 'student-notes': '📝 סיכום תלמיד', 'ai-edited': '🤖 עיבוד AI (לא ציטוט)', 'author-script': '✍️ תסריט', external: '🌐 מקור חיצוני' };
  const MIN_V = 50 / 3.6;          // en GPS : à l'arrêt (feu rouge), on raisonne comme à 50 km/h pour ne pas parler trop tard
  const fmtM = m => (m >= 1000 ? (m / 1000).toFixed(1) + ' ק״מ' : Math.max(0, Math.round(m / 10) * 10) + ' מ׳');
  const fmtS = s => { s = Math.max(0, Math.round(s)); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + ' שנ׳'; };

  let INDEX = null, R = null, P = null, Prev = null, map = null, lay = null, busM = null;
  const cache = {};
  // état du trajet
  const S = { dir: 'fwd', mode: 'study', ride: 'sim', s: 0, v: 80 / 3.6, mul: 1, running: false, clock: 0,
    done: new Set(), cur: null, revealed: false, audio: false, follow: true, trk: null, watch: null, gps: 'off', timer: null, last: 0, wake: null };
  const pref = store.get(PREF_KEY, {});
  if (pref.kmh) S.v = pref.kmh / 3.6;
  if (pref.mul) S.mul = pref.mul;

  const getJSON = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  async function loadRoute(id) {
    if (cache[id]) return cache[id];
    const r = await getJSON('hadracha/' + encodeURIComponent(id) + '.json');
    r.isPublic = r.status === 'pret' && r.published === true && !(r.check && r.check.errors.length);
    cache[id] = r; return r;
  }
  const visible = r => r && (r.isPublic || PREVIEW);

  // ------------------------------------------------------------------ repère d'un sens (miroir exact, comme au build)
  const LEN = () => P.length;   // (pas « L » : c'est Leaflet)
  const toF = s => (S.dir === 'rev' ? LEN() - s : s);
  const at = s => { const p = G.pointAt(P, Math.max(0, Math.min(LEN(), toF(s)))); return [p.lat, p.lon]; };
  // lieux du sens courant, prêts pour le moteur (textes déjà rendus pour le côté de ce sens)
  function poisFor(dir) {
    const D = R.directions[dir];
    return D.pois.map(x => {
      const base = R.pois.find(p => p.id === x.id) || {};
      return { id: x.id, name: base.name, category: base.category, prio: base.prio, visibility: base.visibility || {}, facts: base.facts || [],
        anchorNote: base.anchorNote, confidence: base.confidence, sAbeam: x.sAbeam, offRoadM: x.offRoadM, side: x.side, sideCheck: x.sideCheck,
        road: x.road, commentary: x.text };
    });
  }
  let POIS = [];
  const vEff = () => (S.ride === 'gps' ? Math.max(S.v || 0, MIN_V) : S.v);

  // ------------------------------------------------------------------ routeur
  function route() {
    stopRide();
    const h = location.hash || '#/';
    const m = h.match(/^#\/r\/([a-z0-9-]+)(?:\?(.*))?$/);
    if (m) {
      const q = new URLSearchParams(m[2] || '');
      S.dir = q.get('dir') === 'rev' ? 'rev' : 'fwd';
      S.mode = q.get('mode') === 'practice' ? 'practice' : 'study';
      return showRoute(m[1]);
    }
    return showList();
  }
  addEventListener('hashchange', route);
  const link = (id, o) => `#/r/${id}?dir=${o.dir || S.dir}&mode=${o.mode || S.mode}`;

  async function showList() {
    $('back').hidden = true;
    const app = $('app');
    app.innerHTML = `<section class="hero"><div class="eyebrow">הדרכת דרך</div><h1>🚌 מדריך באוטובוס</h1>
      <p>ההסבר מתחיל <b>לפני</b> האתר, כדי שיהיה זמן לספר — ואז: «תסתכלו ימינה». בוחרים יעד מסבידור מרכז, כיוון, ומצב.</p></section>
      <div id="rl"><div class="card">טוען…</div></div>`;
    try { INDEX = INDEX || await getJSON('hadracha/index.json'); } catch (e) { $('rl').innerHTML = '<div class="card">לא ניתן לטעון את רשימת המסלולים.</div>'; return; }
    const rows = INDEX.routes.filter(r => r.public || PREVIEW);
    $('rl').innerHTML = rows.length ? rows.map(r => `<a class="ritem" href="${link(r.id, { dir: 'fwd', mode: 'study' })}">
        <span class="n">🛣️</span><span><b>${esc(r.title)}</b><small>${r.km} ק״מ · ${r.pois} אתרים · ${r.analysis === 'analyse' ? '✅ נבדק בשטח' : r.analysis === 'partiel' ? '🟡 נבדק חלקית — נראוּת משוערת' : '⏳ לא נותח'}</small>
        ${r.public ? '' : '<small>🧪 טיוטה — תצוגה מקדימה בלבד</small>'}</span></a>`).join('')
      : '<div class="card">עדיין אין מסלול מאושר. המסלולים בבדיקה.</div>';
  }

  // ------------------------------------------------------------------ page d'un parcours
  async function showRoute(id) {
    $('back').hidden = false;
    const app = $('app');
    app.innerHTML = '<div class="card">טוען…</div>';
    try { R = await loadRoute(id); } catch (e) { app.innerHTML = '<div class="card">המסלול לא נמצא.</div>'; return; }
    if (!visible(R)) { app.innerHTML = '<div class="card">המסלול הזה עדיין בבדיקה ואינו פתוח.</div>'; return; }
    if (!R.route) { app.innerHTML = '<div class="card">אין עדיין תוואי למסלול הזה.</div>'; return; }
    P = G.prepare({ geometry: R.route.geometry });
    Prev = G.prepare({ geometry: R.route.geometry.slice().reverse() });
    POIS = poisFor(S.dir);
    resetRide();
    const D = R.directions[S.dir];
    app.innerHTML = `
      <section class="hero"><div class="eyebrow">הדרכת דרך · ${S.dir === 'fwd' ? 'הלוך' : 'חזור'}</div><h1>${esc(D.label)}</h1>
        <p>${esc(R.roads)} · ${(D.lengthM / 1000).toFixed(1)} ק״מ · ${POIS.length} אתרים</p></section>
      ${R.isPublic ? '' : `<div class="draft">🧪 <b>טיוטה לבדיקה.</b> הצדדים ונקודות ההפעלה מחושבים מהתוואי; הנראוּת <b>משוערת</b> — לא נבדקה בנסיעה. ${esc(R.statusNote || '')}</div>`}
      <div class="seg" role="group" aria-label="כיוון">
        <button data-dir="fwd" aria-pressed="${S.dir === 'fwd'}">➡️ הלוך</button><button data-dir="rev" aria-pressed="${S.dir === 'rev'}">⬅️ חזור</button></div>
      <div class="seg" role="group" aria-label="מצב">
        <button data-mode="study" aria-pressed="${S.mode === 'study'}">📖 מצב לימוד</button><button data-mode="practice" aria-pressed="${S.mode === 'practice'}">🎤 תרגול הדרכה</button></div>
      <section id="now" class="now" aria-live="polite"></section>
      <div id="map" role="img" aria-label="מפת המסלול"></div>
      <div class="legend"><span>🚌 האוטובוס</span><span>🟡 מתחילים לדבר</span><span>👁️ מסתכלים</span><span>① האתר</span></div>
      <section class="card" aria-label="נסיעה">
        <div class="seg" role="group" aria-label="תנועה" style="grid-template-columns:1fr 1fr 1fr;margin-top:0">
          <button data-ride="sim" aria-pressed="${S.ride === 'sim'}">🧪 סימולציה</button>
          <button data-ride="gps" aria-pressed="${S.ride === 'gps'}">📍 GPS</button>
          <button data-ride="manual" aria-pressed="${S.ride === 'manual'}">👆 ידני</button></div>
        <div class="ctl" id="simctl">
          <button class="btn big" id="play">▶️ התחלה</button>
          <button class="btn" id="restart" aria-label="מההתחלה">⏮️</button>
          <button class="btn" id="mul">⏩ ×${S.mul}</button>
          <label>מהירות <input type="range" id="kmh" min="30" max="110" step="5" value="${Math.round(S.v * 3.6)}"><b id="kmhv">${Math.round(S.v * 3.6)}</b> קמ״ש</label></div>
        <div class="ctl" id="manctl" hidden><button class="btn big" id="next">⏭️ הבא</button><span>כל לחיצה מקדמת לשלב הבא: התחלת ההסבר ← «תסתכלו» ← האתר הבא.</span></div>
        <div class="ctl"><button class="btn" id="audio" aria-pressed="${S.audio}">${S.audio ? '🔊 קריינות פועלת' : '🔈 קריינות'}</button>
          <button class="btn" id="follow" aria-pressed="${S.follow}">${S.follow ? '🎯 המפה עוקבת' : '🗺️ מפה חופשית'}</button></div>
        <div class="status" id="st"></div>
      </section>
      <section class="card" id="scoutc" aria-label="סיור הכנה">
        <details><summary>🛰️ סיור הכנה — מה באמת רואים מהכביש</summary>
          <p class="status">בנסיעה אמיתית (GPS), כשהאתר <b>מופיע</b> — לוחצים «👁️ רואים עכשיו». אם הוא מוסתר — «🚫 לא רואים». זה הופך את הנראוּת המשוערת לנראוּת שנבדקה. הנתונים נשמרים בטלפון בלבד, עד הייצוא.</p>
          <div class="scout"><button class="btn mint" id="seeY">👁️ רואים עכשיו</button><button class="btn" id="seeN">🚫 לא רואים</button></div>
          <div class="status" id="scoutst"></div>
          <div class="ctl"><button class="btn" id="exp">⬇️ ייצוא</button><button class="btn" id="clr">🗑️ מחיקה</button></div></details>
      </section>
      <section class="card"><h2>🗒️ האתרים בדרך</h2><div class="list" id="list"></div></section>
      <p class="foot">תוואי: ${esc(R.route.source)}. קואורדינטות: ויקיפדיה/ויקינתונים. נקודות ההפעלה מחושבות לפי אורך ההסבר ומהירות האוטובוס (כ-2.2 מילים בשנייה). המערכת לא קובעת שאתר נראה — רק סיור בשטח קובע.</p>`;
    app.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => { location.hash = link(R.id, { dir: b.dataset.dir }); });
    app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { location.hash = link(R.id, { mode: b.dataset.mode }); });
    app.querySelectorAll('[data-ride]').forEach(b => b.onclick = () => setRide(b.dataset.ride));
    $('play').onclick = togglePlay; $('restart').onclick = () => { stopRide(); resetRide(); paint(true); };
    $('mul').onclick = () => { S.mul = { 1: 4, 4: 10, 10: 1 }[S.mul] || 1; $('mul').textContent = '⏩ ×' + S.mul; savePref(); if (S.mul > 1 && S.audio) note('🔊 הקריינות מתאימה למהירות ×1.'); };
    $('kmh').oninput = e => { S.v = +e.target.value / 3.6; $('kmhv').textContent = e.target.value; savePref(); drawTriggers(); paint(true); };
    $('next').onclick = manualNext;
    $('audio').onclick = () => { S.audio = !S.audio; if (!S.audio) speak(null); $('audio').setAttribute('aria-pressed', S.audio); $('audio').textContent = S.audio ? '🔊 קריינות פועלת' : '🔈 קריינות'; if (S.audio && !heVoice()) note('לא נמצא קול עברי בטלפון — ייתכן שהקריינות לא תעבוד.'); };
    $('follow').onclick = () => { S.follow = !S.follow; $('follow').setAttribute('aria-pressed', S.follow); $('follow').textContent = S.follow ? '🎯 המפה עוקבת' : '🗺️ מפה חופשית'; };
    $('seeY').onclick = () => scout(true); $('seeN').onclick = () => scout(false);
    $('exp').onclick = exportScout; $('clr').onclick = () => { store.set(SCOUT_KEY, []); scoutStatus(); };
    drawMap(); setRide(S.ride, true); scoutStatus(); paint(true);
  }
  const savePref = () => store.set(PREF_KEY, { kmh: Math.round(S.v * 3.6), mul: S.mul });
  const note = t => { const e = $('st'); if (e) { e.textContent = t; e.className = 'status'; } };

  // ------------------------------------------------------------------ carte
  function drawMap() {
    if (map) { map.remove(); map = null; }
    if (!window.L) return;
    const L = window.L;
    map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, className: 'osm-dark', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · OSRM · Wikidata' }).addTo(map);
    const line = L.polyline(R.route.geometry, { color: '#ffd878', weight: 5, opacity: .85 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [18, 18] });
    lay = { pins: {}, trg: L.layerGroup().addTo(map) };
    POIS.forEach((p, i) => {
      const c = R.pois.find(x => x.id === p.id).coord;
      lay.pins[p.id] = L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', html: `<div class="pin">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), title: p.name.he })
        .bindTooltip(`${i + 1}. ${p.name.he} — ${SIDE_HE[p.side] || ''}`).addTo(map);
    });
    busM = L.marker(at(S.s), { icon: L.divIcon({ className: '', html: '<div class="bus">🚌</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), zIndexOffset: 1000, keyboard: false }).addTo(map);
    drawTriggers();
  }
  function drawTriggers() {
    if (!lay) return;
    const L = window.L;
    lay.trg.clearLayers();
    for (const p of POIS) {
      const t = H.trigger(p, S.dir, vEff());
      L.marker(at(t.sTrig), { icon: L.divIcon({ className: '', html: '<div class="trg"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false })
        .bindTooltip(`🟡 מתחילים לדבר: ${p.name.he}`).addTo(lay.trg);
      if (!t.noLook) L.marker(at(t.sObs), { icon: L.divIcon({ className: '', html: '<div class="obs">👁️</div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false })
        .bindTooltip(`👁️ ${p.name.he} — ${SIDE_HE[p.side] || ''}`).addTo(lay.trg);
    }
  }

  // ------------------------------------------------------------------ déplacement
  function resetRide() {
    S.s = 0; S.clock = 0; S.done = new Set(); S.cur = null; S.revealed = false; S.running = false; S.gps = 'off';
    if (S.ride === 'gps') S.trk = new G.Tracker(S.dir === 'rev' ? Prev : P);
  }
  function setRide(r, silent) {
    stopRide(); S.ride = r;
    document.querySelectorAll('[data-ride]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ride === r));
    if ($('simctl')) $('simctl').hidden = r !== 'sim';
    if ($('manctl')) $('manctl').hidden = r !== 'manual';
    if (r === 'gps') startGPS(); else if (r === 'manual') { startClock(); note('👆 מצב ידני: «הבא» מקדם בין השלבים. מתאים כשאין GPS.'); }
    else if (!silent) note('🧪 סימולציה: האוטובוס הווירטואלי נוסע במהירות שבחרתם.');
    paint(true);
  }
  function togglePlay() {
    if (S.ride !== 'sim') return;
    if (S.running) { stopRide(); $('play').textContent = '▶️ המשך'; }
    else { if (S.s >= LEN() - 1) resetRide(); S.running = true; startClock(); $('play').textContent = '⏸️ עצירה'; }
  }
  function startClock() {
    clearInterval(S.timer); S.last = performance.now();
    S.timer = setInterval(() => { const n = performance.now(), dt = Math.min(1, (n - S.last) / 1000); S.last = n; tick(dt); }, 250);
  }
  function stopRide() {
    clearInterval(S.timer); S.timer = null; S.running = false;
    if (S.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(S.watch);
    S.watch = null; speak(null);
    if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
  }
  function startGPS() {
    S.trk = new G.Tracker(S.dir === 'rev' ? Prev : P);
    if (!navigator.geolocation) { S.gps = 'unavailable'; note('⚠️ אין GPS בדפדפן הזה — עברו למצב ידני.'); return; }
    S.gps = 'searching'; note('📍 מחפשים את האוטובוס על המסלול…');
    S.watch = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      S.trk.update({ lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, speed: c.speed, heading: c.heading, timestamp: pos.timestamp || Date.now() });
      S.lastFix = { lat: c.latitude, lon: c.longitude, acc: Math.round(c.accuracy) };
    }, err => { S.gps = err.code === 1 ? 'denied' : 'error'; note(err.code === 1 ? '⚠️ אין הרשאת מיקום — עברו למצב ידני.' : '⚠️ ה-GPS לא זמין כרגע.'); },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { S.wake = w; }).catch(() => {});
    startClock();
  }
  const GPS_MSG = { searching: '📍 מחפשים את האוטובוס על המסלול…', inaccurate: '⚠️ GPS לא מדויק — מחכים', off_route: '⚠️ מחוץ למסלול — עברו למצב ידני אם זה נמשך', wrong_dir: '⚠️ נראה שאתם בכיוון ההפוך — החליפו הלוך/חזור', stale: '⚠️ אין מיקום עדכני', lost: '⚠️ ה-GPS אבד — עברו למצב ידני' };

  // Une étape du temps. dt = secondes réelles. Le texte est « dit » en temps simulé (×mul).
  function tick(dt) {
    const sdt = dt * (S.ride === 'sim' ? S.mul : 1);
    S.clock += sdt;
    if (S.ride === 'sim' && S.running) {
      S.s = Math.min(LEN(), S.s + S.v * sdt);
      if (S.s >= LEN()) { S.running = false; clearInterval(S.timer); $('play').textContent = '▶️ שוב'; }
    } else if (S.ride === 'gps' && S.trk) {
      const st = S.trk.status(Date.now());
      S.gps = st;
      if (st === 'ok' && S.trk.s != null) {
        const k = LEN() / (S.dir === 'rev' ? Prev.length : P.length);
        S.s = Math.max(S.s, S.trk.s * k);
        if (S.trk.speed != null) S.v = S.trk.speed;
        note(`📍 ${Math.round((S.v || 0) * 3.6)} קמ״ש · ק״מ ${(S.s / 1000).toFixed(1)}${S.lastFix ? ' · דיוק ' + S.lastFix.acc + ' מ׳' : ''}`);
      } else { const e = $('st'); if (e) { e.textContent = GPS_MSG[st] || ''; e.className = 'status bad'; } }
    }
    step();
    paint(false);
  }

  // ------------------------------------------------------------------ « quand parler » : machine à états
  // cur = { poi, short, phase: 'intro' | 'look', t0, tLook }
  function step() {
    const v = vEff();
    if (S.cur) {
      const c = S.cur, t = H.trigger(c.poi, S.dir, v), d = t.dur;
      if (c.phase === 'intro') {
        const introDone = S.clock - c.t0 >= (c.short ? d.short : d.intro);
        if (c.short || t.noLook) { if (introDone) enterLook(); }
        else if (S.s >= t.sObs - v * H.REACT_SEC || (S.ride === 'manual' && c.force)) enterLook();
        else if (S.s > t.sVisEnd) finish();
      } else {
        const lookSec = (c.short ? 0 : d.cue + d.look) + H.REACT_SEC;
        if (S.clock - c.tLook >= lookSec || (!t.noLook && S.s > t.sVisEnd + 200)) finish();
      }
      return;
    }
    if (S.ride === 'manual') return;            // en manuel, c'est « הבא » qui lance
    const dec = H.decide(POIS, S.dir, S.s, v, { spoken: S.done });
    if (dec.action === 'start') begin(dec.poi, false);
    else if (dec.action === 'start_short') begin(dec.poi, true);
    else if (dec.action === 'missed') { S.done.add(dec.poi.id); S.missed = { poi: dec.poi, at: S.clock }; }
  }
  function begin(poi, short) {
    S.cur = { poi, short, phase: 'intro', t0: S.clock }; S.revealed = false; S.missed = null;
    const c = poi.commentary;
    if (short) speak(c.short); else speak(c.intro);
    say(`${poi.name.he} — ${short ? 'גרסה קצרה' : 'מתחילים להסביר'}`);
    paint(true);
  }
  function enterLook() {
    const c = S.cur; c.phase = 'look'; c.tLook = S.clock;
    const t = H.trigger(c.poi, S.dir, vEff());
    if (!c.short) speak([c.poi.commentary.cue, c.poi.commentary.look].filter(Boolean).join(' '));
    if (!t.noLook && c.poi.side && c.poi.side !== 'along') { say('תסתכלו ' + (H.LOOK[c.poi.side] || '')); if (navigator.vibrate) try { navigator.vibrate([120, 60, 120]); } catch (e) {} }
    paint(true);
  }
  function finish() { if (S.cur) S.done.add(S.cur.poi.id); S.cur = null; paint(true); }
  function manualNext() {
    const v = vEff();
    if (S.cur && S.cur.phase === 'intro') { const t = H.trigger(S.cur.poi, S.dir, v); S.s = Math.max(S.s, t.sObs); S.cur.force = true; step(); paint(true); return; }
    if (S.cur) finish();
    const nx = POIS.filter(p => !S.done.has(p.id)).map(p => ({ p, t: H.trigger(p, S.dir, v) })).sort((a, b) => a.t.sTrig - b.t.sTrig)[0];
    if (!nx) { S.s = LEN(); paint(true); return; }
    S.s = Math.max(S.s, nx.t.sTrig); begin(nx.p, false);
  }

  // ------------------------------------------------------------------ voix (synthèse du téléphone, si elle parle hébreu)
  let VOICE = null;
  function heVoice() {
    if (!('speechSynthesis' in window)) return null;
    if (VOICE) return VOICE;
    VOICE = speechSynthesis.getVoices().find(v => /^he|^iw/i.test(v.lang)) || null; return VOICE;
  }
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { VOICE = null; heVoice(); };
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (!text || !S.audio || S.mode === 'practice') return;
    const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, '')); u.lang = 'he-IL'; u.rate = 1; const v = heVoice(); if (v) u.voice = v;
    try { speechSynthesis.speak(u); } catch (e) {}
  }

  // ------------------------------------------------------------------ affichage
  let lastKey = '';
  function paint(force) {
    if (!$('now')) return;
    if (busM) { const ll = at(S.s); busM.setLatLng(ll); if (S.follow && (S.running || S.ride !== 'sim')) map.panTo(ll, { animate: false }); }
    const v = vEff(), key = [S.cur && S.cur.poi.id, S.cur && S.cur.phase, S.revealed, S.mode, S.done.size, S.missed && S.missed.poi.id].join('|');
    if (force || key !== lastKey) { lastKey = key; drawNow(v); drawList(v); pins(); }
    else updateCountdown(v);
  }
  function srcList(p) {
    return `<details><summary>📚 מקורות ובדיקה</summary><div class="srcs">${p.facts.map(f => {
      const s = R.sources[f.source] || { kind: 'external', title: f.ref || 'מקור חיצוני' };
      const tt = `${KIND[s.kind] || ''} · ${esc(s.title)}${f.ref ? ' — ' + esc(f.ref) : ''}${f.certainty === 'approx' ? ' · ⚠️ בקירוב' : f.certainty === 'check' ? ' · ❓ לבדוק' : ''}`;
      const body = `<b>${esc(f.he)}</b><br><small>${tt}</small>${f.correction ? `<br><small>✏️ תיקון: ${esc(f.correction)}</small>` : ''}`;
      return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${body}</a>` : `<div>${body}</div>`;
    }).join('')}${p.anchorNote ? `<div><small>📍 ${esc(p.anchorNote)}</small></div>` : ''}</div></details>`;
  }
  function tags(p, t) {
    const out = [`<span class="tag">כביש ${esc(p.road || '—')}</span>`, `<span class="tag">${fmtM(p.offRoadM)} מהכביש</span>`];
    if (t.noLook) out.push('<span class="tag nv">🚇 לא נראה מהכביש</span>');
    else if (t.visibility !== 'verified') out.push('<span class="tag warn">⚠️ נראוּת משוערת</span>');
    if (p.sideCheck && p.sideCheck.agree) out.push('<span class="tag">✅ צד: המורה + חישוב</span>');
    else if (p.sideCheck && p.sideCheck.from === 'teacher') out.push('<span class="tag warn">צד: לפי המורה</span>');
    else if (p.sideCheck && p.sideCheck.from === 'computed') out.push('<span class="tag warn">צד: לפי חישוב</span>');
    return `<div class="meta">${out.join('')}</div>`;
  }
  const sideBox = p => (p.side === 'right' || p.side === 'left') ? `<div class="side ${p.side}"><span>${ARROW[p.side]}</span><span>תסתכלו ${H.LOOK[p.side]}</span></div>`
    : p.side === 'along' ? `<div class="side"><span>↔️</span><span>לאורך הכביש</span></div>` : '';
  function hidden(what) {
    return S.revealed ? '' : `<div class="hide">🎤 <b>תורכם להדריך</b> — ${what}<br><button class="btn" id="reveal">👁️ להציג את הטקסט</button></div>`;
  }
  function drawNow(v) {
    const box = $('now'), prac = S.mode === 'practice';
    box.className = 'now';
    if (S.cur) {
      const p = S.cur.poi, c = p.commentary, t = H.trigger(p, S.dir, v);
      if (S.cur.phase === 'intro') {
        box.classList.add('intro');
        box.innerHTML = `<div class="k">${S.cur.short ? '⚡ גרסה קצרה — איחרנו קצת' : '🎙️ מתחילים להסביר עכשיו'}</div><h3>${esc(p.name.he)} <small style="font-weight:600;color:var(--soft)">${esc(SIDE_HE[p.side] || '')}</small></h3>${tags(p, t)}
          ${prac ? hidden('הקדמה, לפני שרואים את האתר') : ''}
          ${!prac || S.revealed ? `<p class="say">${esc(S.cur.short ? c.short : c.intro)}</p>` : ''}
          ${t.noLook || S.cur.short ? '' : '<div class="bar"><i id="pbar"></i></div><div class="status" id="cd"></div>'}
          ${prac ? '' : srcList(p)}`;
      } else {
        box.classList.add('cue');
        box.innerHTML = `<div class="k">${t.noLook ? '🚇 מדברים בזמן המעבר' : '👁️ עכשיו מסתכלים'}</div><h3>${esc(p.name.he)}</h3>
          ${t.noLook ? '' : sideBox(p)}
          ${prac ? hidden('הפנו את הקבוצה לאתר וספרו מה רואים') : ''}
          ${!prac || S.revealed ? `${c.cue && !S.cur.short ? `<p class="say"><b>${esc(c.cue)}</b></p>` : ''}<p class="say look">${esc(S.cur.short ? '' : c.look)}</p>` : ''}
          ${prac ? '' : srcList(p)}`;
      }
      const rv = $('reveal'); if (rv) rv.onclick = () => { S.revealed = true; paint(true); };
      updateCountdown(v); return;
    }
    if (S.missed && S.clock - S.missed.at < 12) {
      box.classList.add('missed');
      box.innerHTML = `<div class="k">⏭️ עברנו את האתר</div><h3>${esc(S.missed.poi.name.he)}</h3><p class="say">כבר מאוחר מדי להתחיל — לא מסבירים אתר שכבר עברנו. ממשיכים לבא.</p>`;
      return;
    }
    const nx = nextUp(v);
    if (!nx) { box.innerHTML = `<div class="k">🏁 סוף המסלול</div><h3>${S.s >= LEN() - 50 ? 'הגענו' : 'אין עוד אתרים בדרך'}</h3><p class="say">${S.done.size} אתרים הוסברו.</p>`; return; }
    box.innerHTML = `<div class="k">⏳ האתר הבא</div><h3>${esc(nx.p.name.he)} · ${esc(SIDE_HE[nx.p.side] || '')}</h3>${tags(nx.p, nx.t)}
      <p class="say" id="cd2"></p><p class="status">🟡 ההסבר יתחיל ${fmtM(nx.t.leadM)} לפני האתר, כדי לסיים את ההקדמה לפני שהוא נראה.</p>
      ${S.ride === 'manual' ? '<p class="status">👆 לחצו «הבא» כשהגעתם לנקודה הצהובה.</p>' : ''}`;
    updateCountdown(v);
  }
  const nextUp = v => POIS.filter(p => !S.done.has(p.id)).map(p => ({ p, t: H.trigger(p, S.dir, v) }))
    .filter(x => x.t.sVisEnd > S.s).sort((a, b) => a.t.sTrig - b.t.sTrig)[0] || null;
  function updateCountdown(v) {
    if (S.cur && S.cur.phase === 'intro') {
      const t = H.trigger(S.cur.poi, S.dir, v), tot = Math.max(1, t.sObs - (S.cur.sStart ?? (S.cur.sStart = S.s)));
      const left = Math.max(0, t.sObs - S.s);
      const b = $('pbar'); if (b) b.style.width = Math.min(100, 100 * (1 - left / tot)) + '%';
      const cd = $('cd'); if (cd) cd.textContent = `👁️ מסתכלים בעוד ${fmtS(left / v)} (${fmtM(left)})`;
      return;
    }
    const cd = $('cd2'); if (!cd) return;
    const nx = nextUp(v); if (!nx) return;
    const m = nx.t.sTrig - S.s;
    cd.textContent = m > 0 ? `מתחילים להסביר בעוד ${fmtS(m / v)} · ${fmtM(m)}` : 'מתחילים עכשיו';
  }
  function drawList(v) {
    const el = $('list'); if (!el) return;
    el.innerHTML = POIS.map((p, i) => {
      const t = H.trigger(p, S.dir, v), done = S.done.has(p.id), cur = S.cur && S.cur.poi.id === p.id;
      const dist = t.sTrig - S.s;
      return `<div class="li${done ? ' done' : ''}${cur ? ' cur' : ''}"><span class="s">${i + 1} · ${esc(SIDE_HE[p.side] || '')}</span>
        <span><b>${esc(p.name.he)}</b><small>${esc(p.name.fr || '')}${t.noLook ? ' · 🚇 לא נראה' : ''}</small></span>
        <span class="d">${done ? '✓' : cur ? '🎙️' : dist > 0 ? 'בעוד ' + fmtM(dist) : 'עכשיו'}<br><small>ק״מ ${(p.sAbeam / 1000).toFixed(1)}</small></span></div>`;
    }).join('');
  }
  function pins() {
    if (!lay) return;
    POIS.forEach(p => { const m = lay.pins[p.id]; if (!m) return; const el = m.getElement && m.getElement(); const d = el && el.firstChild; if (!d) return;
      d.className = 'pin' + (S.cur && S.cur.poi.id === p.id ? ' cur' : S.done.has(p.id) ? ' done' : ''); });
  }

  // ------------------------------------------------------------------ repérage
  function scout(seen) {
    const v = vEff(), p = (S.cur && S.cur.poi) || (nextUp(v) || {}).p;
    if (!p) return;
    const rec = store.get(SCOUT_KEY, []);
    rec.push({ route: R.id, dir: S.dir, poi: p.id, seen, s: Math.round(S.s), sAbeam: p.sAbeam, beforeM: Math.round(p.sAbeam - S.s),
      ride: S.ride, kmh: Math.round(v * 3.6), at: new Date().toISOString(), fix: S.ride === 'gps' ? S.lastFix || null : null });
    store.set(SCOUT_KEY, rec);
    scoutStatus(`${seen ? '👁️' : '🚫'} נרשם: ${p.name.he} — ${Math.abs(Math.round(p.sAbeam - S.s))} מ׳ ${p.sAbeam >= S.s ? 'לפני' : 'אחרי'} האתר${S.ride !== 'gps' ? ' (בסימולציה — לבדיקה בלבד)' : ''}`);
  }
  function scoutStatus(msg) {
    const e = $('scoutst'); if (!e) return;
    const n = store.get(SCOUT_KEY, []).filter(r => !R || r.route === R.id).length;
    e.textContent = (msg ? msg + ' · ' : '') + `${n} רישומים בטלפון.`;
  }
  function exportScout() {
    const rec = store.get(SCOUT_KEY, []);
    const blob = new Blob([JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), records: rec }, null, 1)], { type: 'application/json' });
    const name = `hadracha-siyur-hachana-${new Date().toISOString().slice(0, 10)}.json`;
    const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'סיור הכנה — הדרכת דרך' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ------------------------------------------------------------------ crochets de test
  window.MDHadrachaApp = { state: () => S, pois: () => POIS, route: () => R,
    goto: s => { S.s = s; step(); paint(true); }, tick: (sec, n) => { for (let i = 0; i < (n || 1); i++) tick(sec); } };
  route();
})();
