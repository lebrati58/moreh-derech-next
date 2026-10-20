// Navigation du guide — V3 (route 67) : GPS réel, simulation de trajet, enregistrement de trace, carte.
// Tout se passe SUR LE TÉLÉPHONE DU GUIDE : aucune position n'est envoyée au serveur ni aux élèves.
// Le GPS et le simulateur utilisent le même moteur (gps-engine.js). Le moteur SUGGÈRE ; seul le bouton
// « 📣 פרסם שאלה » du mode réel publie (et jamais le simulateur).
(function () {
  const G = window.MDL_GPS;
  const { esc, store } = window.MDL;
  const ROUTE_URL = 'v3/road67-route.json';
  const L = {
    he: { soon: 'בקרוב', approach: 'מתקרבים — להכין את השאלה', now: 'עכשיו — אפשר לפרסם', next: 'הבא',
      left: '👈 שמאל', right: 'ימין 👉' },
  };
  const fmtDist = m => m == null ? '–' : (m >= 1000 ? (m / 1000).toFixed(1) + ' ק״מ' : Math.max(0, Math.round(m / 10) * 10) + ' מ׳');
  const fmtEta = s => s == null ? '–' : (s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' דק׳' : s + ' שנ׳');
  const STATUS = {
    off: ['GPS כבוי — מצב ידני', 'warn'],
    searching: ['מחפש מיקום… (אפשר להמשיך ידנית)', 'warn'],
    ok: ['📍 GPS פעיל', ''],
    inaccurate: ['⚠️ מיקום לא מדויק — עבור למצב ידני', 'bad'],
    stale: ['⚠️ מיקום ישן — עבור למצב ידני', 'bad'],
    lost: ['⚠️ אין קליטת GPS — עבור למצב ידני', 'bad'],
    off_route: ['⚠️ מחוץ למסלול המתוכנן — עבור למצב ידני', 'bad'],
    wrong_dir: ['⚠️ כיוון נסיעה הפוך למסלול — עבור למצב ידני', 'bad'],
    denied: ['⚠️ אין הרשאת מיקום — מצב ידני', 'bad'],
    insecure: ['⚠️ GPS דורש HTTPS — מצב ידני', 'bad'],
    timeout: ['⚠️ GPS לא הגיב — עבור למצב ידני (ממשיך לנסות)', 'bad'],
    nosignal: ['⚠️ אין קליטת GPS — עבור למצב ידני (ממשיך לנסות)', 'bad']
  };

  function create(deps) {
    // deps: { getS, getAlang, act, toast, openGuide, rpcBank, isOpenable, offset }
    let route = store.get('mdl_v3_route') || null, P = null, loadErr = '';
    let override = store.get('mdl_v3_override') || null;
    let watchId = null, wake = null, lastFix = null, gpsErr = '', autoTried = false;
    // liste des 14 lieux : repliée par défaut, et reste comme le guide l'a laissée malgré les rafraîchissements
    const listOpen = { real: false, sim: false };
    document.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.navlist) listOpen[d.dataset.navlist] = d.open; }, true);
    const sk0 = store.get('mdl_v3_skip') || {};
    const real = { on: false, trk: null, skipped: new Set(sk0.ids || []), pinned: null, gameId: sk0.gid || null };
    const saveSkip = () => store.set('mdl_v3_skip', { gid: real.gameId, ids: [...real.skipped] });
    const sim = { on: false, run: false, mul: 4, auto: true, cur: null, warned: new Set(), trk: null, eng: null, now: 0, used: new Set(), skipped: new Set(), pinned: null,
                  phase: 'waiting', openAt: null, revAt: null, timer: null, log: [], bankQs: null, lastLevel: '' };
    const rec = { on: false, pts: store.get('mdl_v3_rec') || [], anchors: store.get('mdl_v3_rec_anchors') || {} };
    let paintTimer = null;

    async function load() {
      try {
        const r = await fetch(ROUTE_URL, { cache: 'no-cache' });
        if (r.ok) { route = await r.json(); store.set('mdl_v3_route', route); }
      } catch { /* hors ligne : copie locale */ }
      if (!route) { loadErr = 'קובץ המסלול לא נטען (אין חיבור).'; return; }
      rebuild();
    }
    function rebuild() {
      P = G.prepare(route, override);
      real.trk = new G.Tracker(P);
      if (sim.on) { sim.trk = new G.Tracker(P); sim.eng = new G.Simulator(P); }
    }

    // --------------------------------------------------------------- Questions (banque V3)
    const S = () => deps.getS();
    function questions() {
      const s = S();
      if (s && s.game && s.game.bank === 'V3' && !sim.on) return s.questions || [];
      return (s && s.game && s.game.bank === 'V3' ? s.questions : sim.bankQs) || store.get('mdl_v3_bank') || [];
    }
    const qOf = stop => questions().find(q => q.ext_key === 'v3:' + stop.question) || null;
    const lang = () => deps.getAlang();
    const tr = (q, field) => {
      const g = q && q.guide_i18n ? (q.guide_i18n[lang()] || q.guide_i18n.he || {}) : {};
      return g[field] || '';
    };
    const qText = q => {
      if (!q) return { text: '', options: [], lang: 'he' };
      const t = lang() !== 'he' && q.i18n && q.i18n[lang()];
      return t ? { text: t.text, options: t.options, lang: lang() } : { text: q.text, options: q.options, lang: 'he' };
    };
    const nm = o => o ? (o[lang()] || o.he || '') : '';
    const dirOf = l => `lang="${l}" dir="${l === 'he' ? 'rtl' : 'ltr'}"`;

    // --------------------------------------------------------------- Géolocalisation (réel + enregistrement)
    function needWatch() { return real.on || rec.on; }
    function startWatch() {
      if (watchId !== null) return;
      if (!navigator.geolocation || !window.isSecureContext) { gpsErr = 'insecure'; paint(); return; }
      gpsErr = '';
      watchId = navigator.geolocation.watchPosition(onFix, e => {
        gpsErr = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'nosignal';
        if (e.code === 1) { real.on = false; rec.on = false; stopWatch(); deps.toast('אין הרשאת מיקום — ממשיכים במצב ידני'); }
        paint();
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
      // garder l'écran allumé : sinon le navigateur suspend le GPS
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { if (wake === w) wake = null; }); }).catch(() => {});
    }
    // le navigateur relâche l'écran allumé quand on change d'appli : on le redemande au retour
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && watchId !== null && !wake && 'wakeLock' in navigator)
        navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { if (wake === w) wake = null; }); }).catch(() => {});
    });
    function stopWatch() {
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (wake) { wake.release().catch(() => {}); wake = null; }
    }
    function onFix(p) {
      const f = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy,
        speed: p.coords.speed, heading: p.coords.heading, timestamp: p.timestamp || Date.now() };
      lastFix = f; gpsErr = '';
      if (real.on && real.trk) real.trk.update(f);
      if (rec.on && f.accuracy <= 35) {
        const last = rec.pts[rec.pts.length - 1];
        if (!last || Math.hypot((f.lat - last[0]) * 111000, (f.lon - last[1]) * 93500) > 12) {
          rec.pts.push([+f.lat.toFixed(6), +f.lon.toFixed(6)]);
          if (rec.pts.length % 10 === 0) store.set('mdl_v3_rec', rec.pts);
        }
      }
      paint();
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && needWatch() && 'wakeLock' in navigator && !wake) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {});
    });

    // --------------------------------------------------------------- Contexte de jeu
    function realCtx(now) {
      const s = S(), g = s && s.game, c = s && s.current, off = deps.offset();
      const used = new Set(questions().filter(q => q.used).map(q => q.ext_key.replace(/^v3:/, '')));
      if (g && real.gameId !== g.id) {           // nouvelle partie : on oublie les lieux passés à la main
        real.skipped.clear(); real.pinned = null; real.gameId = g.id; saveSkip();
      }
      return { now, used, skipped: real.skipped, pinned: real.pinned, includeSpares: false,
        phase: g ? g.phase : 'waiting',
        lastOpenAt: c && c.opened_at ? Date.parse(c.opened_at) - off : null,
        revealedAt: c && c.revealed_at ? Date.parse(c.revealed_at) - off : null };
    }
    function simCtx() {
      return { now: sim.now, used: sim.used, skipped: sim.skipped, pinned: sim.pinned, includeSpares: false,
        phase: sim.phase, lastOpenAt: sim.openAt, revealedAt: sim.revAt };
    }

    // --------------------------------------------------------------- Rendu de la carte « prochain lieu »
    function sideHtml(stop) {
      // les deux documents d'accord = côté affiché tel quel ; un seul document = côté + sa source
      const sd = stop.side || {};
      const side = sd.value === 'left' ? L.he.left : sd.value === 'right' ? L.he.right : '';
      return `${side ? `<span class="sideok">${side}</span>` : ''}
        ${!sd.verified && sd.docs ? `<span class="small muted" ${dirOf(lang())}>${side ? ' · ' : ''}${esc(nm(sd.docs))}</span>` : ''}`;
    }
    function card(pl, mode) {
      const simMode = mode === 'sim';
      if (!P) return `<p class="small">${esc(loadErr || 'טוען מסלול…')}</p>`;
      if (pl.finish) return finishCard(pl, simMode);
      const n = pl.next;
      if (!n) return `<div class="lvl"><b>אין עוד נקודות מומלצות.</b> אפשר לבחור ידנית מהרשימה.</div>`;
      const st = n.stop, q = qOf(st), qt = qText(q);
      const lvl = n.level || 0;
      const head = lvl === 3 ? `🟢 ${L.he.now}` : lvl === 2 ? `🟠 ${L.he.approach}` : lvl === 1 ? `🟡 ${L.he.soon} — ${esc(nm(st.name))}` : `⏭️ ${L.he.next}: ${esc(nm(st.name))}`;
      const hold = pl.hold;
      const holdTxt = !hold ? '' : hold.reason === 'question_open' ? '❓ שאלה פתוחה — ממתינים לסגירה ולחשיפה'
        : hold.reason === 'speaking' ? `🎤 זמן ההדרכה שלך — אין צורך למהר (עוד ${hold.waitSec} שנ׳)`
        : `⏳ מומלץ לחכות עוד ${hold.waitSec} שנ׳ (דקה וחצי בין שאלות)`;
      const showQ = lvl >= 2 || !pl.gps;
      // en simulation, seules les « publications » simulées comptent (la vraie partie n'est pas touchée)
      const canPub = !(hold && hold.reason === 'question_open') && q && (simMode ? !sim.used.has(st.question) : !q.used);
      return `<div class="lvl l${lvl} ${hold ? 'hold' : ''}">
        <div class="lvlh">${head}</div>
        ${holdTxt ? `<div class="navstat warn">${holdTxt}</div>` : ''}
        ${pl.squeezed ? `<div class="navstat warn">⚠️ אין זמן גם ל״${esc(nm(pl.squeezed.name))}״ וגם לשאלת הסיום לפני ארומה — מומלץ לדלג.
            <button class="btn ghost small" data-nav="skip" data-stop="${pl.squeezed.id}" style="margin-top:6px">⏭️ דלג על ${esc(nm(pl.squeezed.name))}</button></div>` : ''}
        ${n.tooLate ? '<div class="navstat bad">⚠️ ייתכן שאין מספיק זמן לפני ארומה</div>' : ''}
        <div class="navgrid">
          <span class="full">📍 <b>${esc(nm(st.name))}</b>${st.main ? '' : ' · 🔁 חלופית'}${st.final ? ' · 🏁 שאלת הסיום' : ''}</span>
          <span class="full">🛣️ ${pl.road ? esc(nm(pl.road.label)) : '—'}</span>
          <span>⏱️ ${pl.gps ? (n.inZone ? 'עכשיו' : (pl.speed ? '' : '~') + fmtEta(n.etaSec)) : '–'}</span>
          <span>📏 ${pl.gps ? (n.inZone ? 'באזור' : fmtDist(n.distM)) : '–'}</span>
          <span class="full">${sideHtml(st)}</span>
          <span class="full" ${dirOf(lang())}>👀 ${esc(nm(st.look))}</span>
        </div>
        ${q ? `<div class="small muted">❓ השאלה המומלצת</div>
          <div class="navq" ${dirOf(qt.lang)}>${esc(qt.text)}</div>
          ${showQ ? `<div class="small" style="color:var(--ok);font-weight:800" ${dirOf(qt.lang)}>✔ ${esc(qt.options[q.correct_index] || '')}</div>
            <details ${lvl >= 2 ? 'open' : ''}><summary class="small" style="cursor:pointer;font-weight:800">🎤 מה להגיד · 💡 אנקדוטה</summary>
              <div class="small" ${dirOf(lang())} style="margin-top:6px">🎤 ${esc(tr(q, 'script'))}</div>
              <div class="small" ${dirOf(lang())} style="margin-top:6px">💡 ${esc(tr(q, 'fact'))}</div>
              ${tr(q, 'caution') ? `<div class="caution small" ${dirOf(lang())}>⚠️ ${esc(tr(q, 'caution'))}</div>` : ''}
            </details>` : ''}`
          : '<p class="small muted">השאלה לא נמצאה בבנק V3 (הריצו את migration_v3.sql).</p>'}
        <div class="row" style="margin-top:10px">
          ${canPub ? (simMode
            ? `<button class="btn ghost" data-nav="simpub" data-stop="${st.id}">🧪 ניסיון בלבד — לא נשלח לתלמידים</button>`
            : `<button class="btn sun" data-nav="publish" data-stop="${st.id}" style="font-size:22px">📣 פרסם שאלה</button>`) : ''}
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn ghost small" data-nav="skip" data-stop="${st.id}">⏭️ דלג</button>
          <button class="btn ghost small" data-nav="back">⏮️ חזרה</button>
          ${q ? `<button class="btn ghost small" data-nav="guide" data-q="${q.id}">🎤 הדרכה</button>` : ''}
        </div>
      </div>`;
    }
    function finishCard(pl, simMode) {
      const fin = P.stops.find(s => s.final), q = fin && qOf(fin);
      const said = pl.done;
      if (pl.arrived) return `<div class="lvl finishcard"><div class="lvlh">☕ הגענו לארומה יקנעם</div>
        <p class="small">סוף המסלול. אפשר עדיין לפרסם שאלה ידנית מהרשימה.</p>${simMode ? '<span class="simtag">סימולציה</span>' : ''}</div>`;
      return `<div class="lvl finishcard">
        <div class="lvlh">🏁 סיום ההדרכה — מתקרבים לארומה יקנעם</div>
        <p class="small">${said ? 'שאלת הסיום כבר נשאלה. אין שאלות נוספות.' : 'אין מספיק זמן לשאלה נוספת לפני ההגעה. אפשר לקרוא את טקסט הסיום אם הזמן מאפשר.'}
          ${pl.destEtaSec != null ? ` · עד ארומה: ~${fmtEta(pl.destEtaSec)}` : ''}</p>
        ${q && !said ? `<div class="guide-text" ${dirOf(lang())} style="font-size:18px">🎤 ${esc(tr(q, 'script'))}</div>` : ''}
        ${simMode ? '<span class="simtag">סימולציה</span>' : ''}
      </div>`;
    }
    function statusLine(pl, mode) {
      if (mode === 'sim') {
        const f = sim.lastFix;
        return `<div class="navstat ${STATUS[pl.status] ? STATUS[pl.status][1] : ''}"><span class="simtag">🧪 סימולציה</span>
          ${esc(STATUS[pl.status] ? STATUS[pl.status][0] : pl.status)} · ק״מ ${pl.km != null ? pl.km.toFixed(1) : '–'}
          · ${pl.speed ? Math.round(pl.speed * 3.6) + ' קמ״ש' : '–'} · דיוק ${f ? '±' + Math.round(f.accuracy) + ' מ׳' : '–'}
          · עד ארומה ${fmtEta(pl.destEtaSec)}</div>`;
      }
      const st = (real.on || gpsErr === 'denied' || gpsErr === 'insecure') && gpsErr ? gpsErr : (real.on ? pl.status : 'off');
      const [txt, cls] = STATUS[st] || [st, 'warn'];
      const age = lastFix ? Math.round((Date.now() - lastFix.timestamp) / 1000) : null;
      return `<div class="navstat ${cls}">${esc(txt)}${real.on && lastFix ? ` · דיוק ±${Math.round(lastFix.accuracy)} מ׳ · לפני ${age} שנ׳` : ''}
        ${real.on && pl.km != null ? ` · ק״מ ${pl.km.toFixed(1)} · ${pl.speed ? Math.round(pl.speed * 3.6) + ' קמ״ש' : '–'} · עד ארומה ${fmtEta(pl.destEtaSec)}` : ''}</div>`;
    }
    function list(pl, mode) {
      const ctx = mode === 'sim' ? simCtx() : realCtx(Date.now());
      const passed = new Set(pl.passed.map(i => i.stop.id));
      return `<details ${listOpen[mode] ? 'open' : ''} data-navlist="${mode}"><summary style="font-weight:800;cursor:pointer">📋 כל ${P.stops.length} הנקודות (בחירה ידנית)</summary>
        <ul class="navlist">${P.stops.map(st => {
          const q = qOf(st), used = ctx.used.has(st.question), sk = ctx.skipped.has(st.id);
          const tag = used ? '✔ נשאלה' : sk ? '⏭️ דילגנו' : passed.has(st.id) ? '⚠️ עברנו' : st.main ? '' : '🔁 חלופית';
          return `<li class="${used || sk ? 'done' : ''}"><span class="k">${st.main ? `<b>${numOf(st)}</b> · ` : ''}ק״מ ${(st.s / 1000).toFixed(1)}</span>
            <span class="grow">${esc(nm(st.name))} <small class="muted">${tag}</small></span>
            ${sk ? `<button class="btn ghost small" data-nav="unskip" data-stop="${st.id}">↩️</button>`
              : !used && q ? `<button class="btn ghost small" data-nav="pin" data-stop="${st.id}">📌 בחר</button>` : ''}</li>`;
        }).join('')}</ul></details>`;
    }

    // Numéro affiché d'un lieu (1, 2, 3… dans l'ordre du trajet) — plus lisible que l'identifiant S11, S12…
    function numOf(st) { return P.stops.filter(x => x.main).sort((a, b) => a.s - b.s).indexOf(st) + 1; }

    // --------------------------------------------------------------- Carte SVG du trajet
    function mapSvg(pos) {
      if (!P) return '';
      const xs = P.pts.map(p => p.x), ys = P.pts.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const W = 360, H = 210, pad = 18, k = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
      const X = x => pad + (x - minX) * k, Y = y => H - pad - (y - minY) * k;
      const line = P.pts.map(p => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ');
      const dot = s => { const p = G.pointAt(P, s); return [X(p.x), Y(p.y)]; };
      // numéros alternés au-dessus / en dessous du trait pour que les lieux proches ne se chevauchent pas
      const stops = P.stops.filter(st => st.main).map(st => { const [x, y] = dot(st.s), n = numOf(st);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#0b4a6b"/><text x="${x.toFixed(1)}" y="${(n % 2 ? y - 9 : y + 17).toFixed(1)}" font-size="11" font-weight="700" text-anchor="middle" fill="#0b4a6b">${n}</text>`; }).join('');
      const [dx, dy] = dot(P.dest.s);
      let me = '';
      if (pos) { const p = P.proj.fwd(pos.lat, pos.lon); me = `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="8" fill="#f08a24" stroke="#fff" stroke-width="3"/>`; }
      return `<svg class="routemap" viewBox="0 0 ${W} ${H}" role="img" aria-label="מפת המסלול">
        <polyline points="${line}" fill="none" stroke="${P.verified ? '#2e9d52' : '#0b4a6b'}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" ${P.verified ? '' : 'stroke-dasharray="10 6"'}/>
        ${stops}<text x="${dx.toFixed(1)}" y="${(dy + 4).toFixed(1)}" font-size="18" text-anchor="middle">☕</text>${me}
        <text x="${W - 6}" y="${H - 6}" font-size="10" fill="#555" direction="rtl" text-anchor="start">${P.verified ? 'מסלול מוקלט/מאומת' : 'מסלול משוער (קו מקווקו) — לאמת'}</text></svg>`;
    }
    function gmapsLink() {
      if (!route) return '#';
      const pts = route.geometry, o = pts[0], d = route.destination.point;
      const w = [4, 7, 9, 11].map(i => pts[i].join(',')).join('|');
      return `https://www.google.com/maps/dir/?api=1&origin=${o.join(',')}&destination=${d.join(',')}&waypoints=${encodeURIComponent(w)}&travelmode=driving`;
    }

    // --------------------------------------------------------------- Panneau du direct (GPS réel)
    function liveHtml() { return `<div class="card nav" id="navroot">${livePanel()}</div>`; }
    function livePanel() {
      if (!P) { if (!load._p) load._p = load().then(paint); return '<h2>🧭 ניווט חכם — כביש 67</h2><p class="small">טוען מסלול…</p>'; }
      const pl = G.plan(P, real.on ? real.trk : null, realCtx(Date.now()));
      // GPS déjà autorisé avant un rechargement de la page : on le relance tout seul
      if (!real.on && !autoTried && store.get('mdl_gps_on') && !gpsErr) { autoTried = true; real.on = true; real.trk = new G.Tracker(P); startWatch(); }
      return `<h2>🧭 ניווט חכם — כביש 67</h2>
        ${statusLine(pl, 'real')}
        ${real.on
          ? '<button class="btn ghost small" data-nav="gps-off" style="margin-top:4px">⏹ עצור GPS</button>'
          : `<button class="btn ok" data-nav="gps-on" style="font-size:22px">📍 להפעיל GPS</button>
             <p class="small" style="margin:6px 0 0">הטלפון ישאל <b>״לאפשר גישה למיקום?״</b> ← ללחוץ <b>אפשר / Allow</b>.</p>`}
        ${gpsErr === 'denied' ? `<div class="navstat bad small">המיקום חסום. לפתוח מחדש:<br>
            <b>אנדרואיד (Chrome):</b> 🔒 ליד הכתובת ← הרשאות ← מיקום ← לאפשר.<br>
            <b>אייפון:</b> הגדרות ← פרטיות ← שירותי מיקום ← Safari ← ״בזמן השימוש״, ואז לרענן את הדף.<br>
            בינתיים הכול עובד ידנית: 📌 בחר ← 📣.</div>` : ''}
        <p class="small muted" style="margin:6px 0 0">🔒 המיקום לא יוצא מהטלפון · 🔆 להשאיר את המסך דלוק · שום דבר לא נשלח בלי ״📣 פרסם שאלה״.</p>
        ${card(pl, 'real')}
        ${list(pl, 'real')}
        <button class="btn ghost small" data-nav="to-sim" style="margin-top:10px">🧪 סימולציה (ניסיון בלבד)</button>`;
    }

    // --------------------------------------------------------------- Page « מסלול » : carte, simulation, enregistrement
    function routeHtml() { return `<div id="navtrack" class="card track-card"></div><div id="navroute">${routePanel()}</div>`; }

    // Bande « le bus roule » : créée une seule fois, seul le bus se déplace (animation fluide)
    const BUS = `<svg viewBox="0 0 70 34" width="62" height="30" aria-hidden="true"><g class="tbody">
      <rect x="2" y="2" width="62" height="24" rx="6" fill="#f08a24"/><rect x="2" y="19" width="62" height="3" fill="#d56f12"/>
      ${[8, 20, 32, 44].map(x => `<rect x="${x}" y="6" width="9" height="8" rx="2" fill="#e3f3f7"/>`).join('')}
      <rect x="56" y="6" width="6" height="11" rx="2" fill="#e3f3f7"/></g>
      ${[16, 52].map(cx => `<g class="twheel" style="transform-origin:${cx}px 27px"><circle cx="${cx}" cy="27" r="6" fill="#102029"/><circle cx="${cx}" cy="27" r="2.4" fill="#9aa"/><rect x="${cx - 0.6}" y="22" width="1.2" height="10" fill="#9aa"/></g>`).join('')}</svg>`;
    function trackInner() {
      const D = P.dest.s, used = sim.used;
      return `<div class="track" dir="ltr">
        <span class="tl tl-start">🚩 זכרון יעקב</span><span class="tl tl-end">ארומה ☕</span>
        <div class="troad"></div>
        ${P.stops.filter(st => st.main).map(st => `<div class="tstop ${used.has(st.question) ? 'done' : ''}" style="left:${(100 * st.s / D).toFixed(1)}%"><i>${numOf(st)}</i></div>`).join('')}
        <div class="tbus" id="tbus">${BUS}</div></div>
        <div class="tnext" id="tnext"></div>`;
    }
    function paintTrack() {
      const t = document.getElementById('navtrack'); if (!t) return;
      if (!P || !sim.on) { t.style.display = 'none'; t.innerHTML = ''; t.dataset.k = ''; return; }
      t.style.display = '';
      const k = sim.used.size + ':' + lang() + ':' + P.length;
      if (t.dataset.k !== k) { t.innerHTML = trackInner(); t.dataset.k = k; }
      const s = sim.trk && sim.trk.s != null ? sim.trk.s : 0;
      const bus = document.getElementById('tbus');
      bus.style.left = `calc(${(100 * Math.min(1, s / P.dest.s)).toFixed(2)}% - 31px)`;
      t.querySelector('.track').classList.toggle('running', sim.run);
      // un seul nom affiché : le prochain lieu devant le bus (les 14 noms ne tiennent pas sur un téléphone)
      const nx = P.stops.filter(st => st.main && !sim.used.has(st.question) && st.s >= s - 150).sort((a, b) => a.s - b.s)[0];
      const txt = nx ? `▶ הבא: ${numOf(nx)} · ${nm(nx.name)}` : '☕ ארומה';
      const tn = document.getElementById('tnext'); if (tn.textContent !== txt) tn.textContent = txt;
    }
    function routePanel() {
      if (!P) { if (!load._p) load._p = load().then(paint); return '<div class="card">טוען מסלול…</div>'; }
      const pl = sim.on ? G.plan(P, sim.trk, simCtx()) : null;
      const pos = sim.on ? sim.lastFix : (real.on && lastFix ? lastFix : null);
      const it = route.itinerary || {};
      return `
        <div class="card"><h2>🧪 סימולציית נסיעה — כביש 67</h2>
          <div class="navstat warn"><b>🧪 זו סימולציה — שום דבר לא נשלח לתלמידים.</b><br>כדי לשלוח שאלה אמיתית: ⚙️ → 🔄 משחק חדש → V3, ואז בלשונית 📡 שידור חי ← ״📣 פרסם שאלה״.</div>
          <div class="simbar">
            ${sim.run ? '<button class="btn ghost" data-nav="sim-pause">⏸️ עצור</button>' : '<button class="btn ok" data-nav="sim-play">▶️ הפעל</button>'}
            <button class="btn ghost" data-nav="sim-speed">⏩ ×${sim.mul}</button>
            <button class="btn ghost" data-nav="sim-reset">⏮️</button>
          </div>
          ${sim.on ? statusLine(pl, 'sim') + simStage() + card(pl, 'sim') : '<p class="small">לחצו ▶️ כדי להתחיל.</p>'}
          <details style="margin-top:8px"><summary class="small" style="font-weight:800;cursor:pointer">⚙️ אפשרויות ותקלות לבדיקה</summary>
            <label class="optrow" style="font-weight:700"><input type="checkbox" data-nav="sim-auto" ${sim.auto ? 'checked' : ''} style="width:22px;height:22px"> 🤖 לפרסם אוטומטית בכל 🟢 (רק בסימולציה)</label>
            <div class="faults">${[['noisy', 'GPS לא מדויק'], ['lost', 'GPS אבד'], ['stale', 'מיקום ישן'], ['wrongWay', 'כיוון הפוך'],
              ['parallel', 'כביש מקביל'], ['rush', 'התקרבות מהירה לארומה']].map(([k, t]) =>
              `<label><input type="checkbox" data-nav="fault" data-k="${k}" ${sim.faults && sim.faults[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
            <div class="simbar"><button class="btn ghost small" data-nav="sim-jump">⏭️ +1 ק״מ</button>
              <button class="btn ghost small" data-nav="sim-miss">🦘 החמצת נקודה</button></div>
          </details>
          ${sim.on ? list(pl, 'sim') : ''}
          ${sim.log.length ? `<details><summary class="small" style="cursor:pointer">📜 יומן הסימולציה (${sim.log.length})</summary><ol class="small">${sim.log.map(l => `<li>${esc(l)}</li>`).join('')}</ol></details>` : ''}
        </div>
        <div class="card"><h2>🗺️ זכרון יעקב → ארומה יקנעם</h2>
          ${mapSvg(pos)}
          <p class="small">אורך משוער: ${(P.dest.s / 1000).toFixed(1)} ק״מ · כביש 67 עד מחלף עין תות, ואז כביש 6 צפונה (קטע ללא אגרה) עד מחלף יקנעם.</p>
          <a class="btn ghost small" target="_blank" rel="noopener" href="${gmapsLink()}" style="text-align:center;text-decoration:none">🧭 לבדוק את המסלול ב-Google Maps</a>
          <details style="margin-top:8px"><summary class="small" style="font-weight:800;cursor:pointer">ℹ️ מסלול נבחר, חלופות ומה צריך לאשר</summary>
            <p class="small" dir="ltr" lang="fr">${esc(it.chosen || '')}</p>
            <ul class="small" dir="ltr" lang="fr">${(it.alternatives || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
            <p class="small" dir="ltr" lang="fr"><b>À confirmer :</b></p>
            <ul class="small" dir="ltr" lang="fr">${(it.toConfirm || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
            <p class="small" dir="ltr" lang="fr">${esc(route.statusNote || '')}</p>
          </details></div>
        <details class="card"><summary style="font-weight:800;cursor:pointer">🛰️ הקלטת המסלול (לא חובה — לפעם הבאה)</summary>
          <p class="small">הטלפון מקליט את הכביש האמיתי בזמן הנסיעה. אחר כך ״💾 שמירה כמסלול מאומת״ — והמרחקים יהיו מדויקים יותר בפעם הבאה. נשמר בטלפון בלבד.</p>
          <p class="small"><b>${rec.pts.length}</b> נקודות מוקלטות · ${Object.keys(rec.anchors).length} נקודות מסומנות ${override ? '· ✅ מסלול מוקלט פעיל' : '· מסלול משוער פעיל'}</p>
          <div class="simbar">
            ${rec.on ? '<button class="btn bad" data-nav="rec-stop">⏹ עצור הקלטה</button>' : '<button class="btn ok" data-nav="rec-start">⏺ התחל הקלטה</button>'}
            <button class="btn ghost" data-nav="rec-save" ${rec.pts.length < 20 ? 'disabled' : ''}>💾 שמירה כמסלול מאומת</button>
          </div>
          <label for="markstop">📌 סמן את המקום הנוכחי בתור:</label>
          <div class="row"><select id="markstop">${P.stops.map(st => `<option value="${st.id}">${esc(st.id + ' — ' + nm(st.name))}</option>`).join('')}</select>
            <button class="btn ghost small" data-nav="rec-mark" style="flex:none;width:auto">📌 סמן כאן</button></div>
          <div class="simbar">
            <button class="btn ghost" data-nav="rec-export">⬇️ ייצוא GeoJSON</button>
            <label class="btn ghost" style="text-align:center;margin:0">⬆️ ייבוא GPX/GeoJSON<input type="file" accept=".gpx,.json,.geojson,application/json,application/gpx+xml" data-nav="rec-import" hidden></label>
            ${override ? '<button class="btn ghost" data-nav="rec-clear">🗑️ חזרה למסלול המשוער</button>' : ''}
          </div></details>`;
    }

    // Ce que vivent les élèves pendant la simulation : question → 45 s → réponse + texte micro
    function simStage() {
      const st = sim.cur; if (!st || sim.phase === 'waiting') return '';
      const q = qOf(st), qt = qText(q);
      if (!q) return '';
      if (sim.phase === 'open') {
        const left = Math.max(0, 45 - Math.floor((sim.now - sim.openAt) / 1000));
        return `<div class="lvl l2 stage"><div class="lvlh">📣 שאלה בסימולציה — עונים… ⏱️ ${left} שנ׳</div>
          <div class="navq" ${dirOf(qt.lang)}>${esc(qt.text)}</div>
          <ol class="small" ${dirOf(qt.lang)}>${qt.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>
          <p class="small muted">(בסימולציה — לא נשלח לתלמידים)</p></div>`;
      }
      if (sim.phase === 'revealed' && sim.now - sim.revAt < 60000) {
        return `<div class="lvl l3 stage"><div class="lvlh">👁️ התשובה נחשפה — עכשיו מדברים במיקרופון</div>
          <div class="small" style="color:var(--ok);font-weight:800" ${dirOf(qt.lang)}>✔ ${esc(qt.options[q.correct_index] || '')}</div>
          <div ${dirOf(lang())} style="margin-top:8px;font-size:17px">🎤 ${esc(tr(q, 'script'))}</div>
          <div class="small" ${dirOf(lang())} style="margin-top:8px">💡 ${esc(tr(q, 'fact'))}</div></div>`;
      }
      return '';
    }
    function simPublish(stop) {
      sim.used.add(stop.question); sim.phase = 'open'; sim.openAt = sim.now; sim.pinned = null; sim.cur = stop;
      simLog('📣 פורסמה (סימולציה, לא נשלחה): ' + nm(stop.name));
      if (navigator.vibrate) navigator.vibrate(60);
    }

    // --------------------------------------------------------------- Simulation
    async function simEnsureBank() {
      const s = S();
      if (s && s.game && s.game.bank === 'V3') return;
      if (sim.bankQs) return;
      try { const r = await deps.rpcBank('V3'); sim.bankQs = r.questions || []; store.set('mdl_v3_bank', sim.bankQs); }
      catch { sim.bankQs = store.get('mdl_v3_bank') || []; }
    }
    function simStart() {
      if (!P) return;
      if (!sim.on) {
        Object.assign(sim, { on: true, trk: new G.Tracker(P), eng: new G.Simulator(P), now: Date.now(), used: new Set(), skipped: new Set(),
          pinned: null, phase: 'waiting', openAt: null, revAt: null, log: [], lastFix: null, lastLevel: '', cur: null, warned: new Set() });
        sim.faults = sim.eng.faults;
        simEnsureBank().then(paint);
      }
      sim.run = true;
      clearInterval(sim.timer);
      sim.timer = setInterval(simTick, 500);
    }
    function simTick() {
      const dt = 0.5 * sim.mul;
      sim.now += dt * 1000;
      // déroulé d'une question simulée : 45 s de réponse, puis « révélée »
      if (sim.phase === 'open' && sim.now - sim.openAt >= 45000) { sim.phase = 'revealed'; sim.revAt = sim.now; simLog('תשובה נחשפה (סימולציה)'); }
      const f = sim.eng.step(dt, sim.now);
      if (f) { sim.lastFix = f; sim.trk.update(f); }
      const pl = G.plan(P, sim.trk, simCtx());
      const k = (pl.next ? pl.next.stop.id + ':' + pl.next.level : '-') + (pl.finish ? ':fin' : '') + ':' + pl.status;
      if (k !== sim.lastLevel) {
        sim.lastLevel = k;
        if (pl.finish) simLog('🏁 סיום — אין שאלות חדשות');
        else if (pl.next && pl.next.level) simLog(['', '🟡', '🟠', '🟢'][pl.next.level] + ' ' + nm(pl.next.stop.name) + ' · ' + fmtEta(pl.next.etaSec));
        if (pl.status !== 'ok') simLog('GPS: ' + (STATUS[pl.status] ? STATUS[pl.status][0] : pl.status));
      }
      // publication automatique au 🟢 (simulation seulement : rien n'est envoyé)
      const green = sim.auto && pl.next && pl.next.level === 3 && !pl.hold && !pl.finish && !sim.used.has(pl.next.stop.question);
      // délai court en temps SIMULÉ (5 s) et au moins 0,8 s à l'écran : ne décale pas le bus en vitesse rapide
      if (!green) sim.greenSince = null;
      else if (!sim.greenSince) sim.greenSince = { sim: sim.now, real: Date.now() };
      else if (sim.now - sim.greenSince.sim >= 5000 && Date.now() - sim.greenSince.real >= 800) { sim.greenSince = null; simPublish(pl.next.stop); }
      for (const it of pl.passed) if (it.stop.main && !sim.warned.has(it.stop.id)) { sim.warned.add(it.stop.id); simLog('⚠️ עברנו את ' + nm(it.stop.name) + ' בלי לשאול'); }
      if (sim.eng.done) { sim.run = false; clearInterval(sim.timer); simLog('☕ הגענו לארומה'); }
      paint();
    }
    function simLog(t) {
      const min = sim.trk && sim.trk.s != null ? ' (ק״מ ' + (sim.trk.s / 1000).toFixed(1) + ')' : '';
      sim.log.push(t + min); if (sim.log.length > 80) sim.log.shift();
    }

    // --------------------------------------------------------------- Actions
    async function onAction(el, ev) {
      const a = el.dataset.nav, stopId = el.dataset.stop;
      const stop = P && P.stops.find(s => s.id === stopId);
      switch (a) {
        case 'gps-on': real.on = true; real.trk = new G.Tracker(P); store.set('mdl_gps_on', 1); startWatch(); break;
        case 'gps-off': real.on = false; store.del('mdl_gps_on'); if (!needWatch()) stopWatch(); break;
        case 'to-sim': deps.showRoute(); return;
        case 'publish': {
          const q = stop && qOf(stop); if (!q) return;
          if (!deps.isOpenable()) return deps.toast('יש שאלה פתוחה — סגרו אותה קודם.');
          if (q.selection === 'SPARE' && !q.enabled) await deps.act('admin_toggle_spare', { p_question_id: q.id, p_on: true });
          await deps.act('admin_open_question', { p_question_id: q.id }, 'השאלה פורסמה 📣');
          real.pinned = null; break;
        }
        case 'simpub':
          if (stop) simPublish(stop);
          break;
        case 'sim-auto': sim.auto = el.checked; break;
        case 'skip': {
          const set = sim.on && el.closest('#navroute') ? sim.skipped : real.skipped;
          if (stop) set.add(stop.id);
          if (set === real.skipped) saveSkip();
          if (sim.on && set === sim.skipped) simLog('⏭️ דילוג: ' + nm(stop.name));
          break;
        }
        case 'unskip': {
          const set = sim.on && el.closest('#navroute') ? sim.skipped : real.skipped;
          set.delete(stopId); saveSkip(); break;
        }
        case 'back': {
          // revoir le dernier lieu passé ou sauté
          const isSim = sim.on && el.closest('#navroute');
          const set = isSim ? sim.skipped : real.skipped;
          const last = [...set].pop();
          if (last) { set.delete(last); if (!isSim) saveSkip(); }
          const pl = G.plan(P, isSim ? sim.trk : (real.on ? real.trk : null), isSim ? simCtx() : realCtx(Date.now()));
          const prev = last || (pl.passed.length ? pl.passed[pl.passed.length - 1].stop.id : null);
          if (isSim) sim.pinned = prev; else real.pinned = prev;
          if (!prev) deps.toast('אין נקודה קודמת לחזור אליה');
          break;
        }
        case 'pin':
          if (sim.on && el.closest('#navroute')) sim.pinned = stopId; else real.pinned = stopId;
          if (el.closest('#busroot')) { bus.pick = false; bus.menu = false; const c = S() && S().current; if (c) bus.seen = c.question_id; }
          break;
        case 'bus-menu': bus.menu = !bus.menu; bus.pick = false; break;
        case 'bus-pick': bus.pick = true; bus.menu = false; break;
        case 'bus-close': bus.menu = false; bus.pick = false; break;
        case 'bus-rank': bus.menu = false; paint(); { const r = document.getElementById('busrank'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return;
        case 'bus-next': { const c = S() && S().current; if (c) bus.seen = c.question_id; break; }
        case 'bus-full': bus.menu = false; deps.setBus(false); return;
        case 'guide': deps.openGuide(+el.dataset.q); return;
        case 'sim-play': simStart(); break;
        case 'sim-pause': sim.run = false; clearInterval(sim.timer); break;
        case 'sim-speed': sim.mul = { 1: 2, 2: 4, 4: 8, 8: 16, 16: 1 }[sim.mul] || 4; break;
        case 'sim-reset': clearInterval(sim.timer); sim.on = false; sim.run = false; sim.log = []; sim.lastFix = null; break;
        case 'sim-jump': if (sim.on) sim.eng.jump(1000); break;
        case 'sim-miss': if (sim.on) { sim.eng.jump(1500); simLog('🦘 קפיצה — החמצת נקודה'); } break;
        case 'fault': if (sim.on) { sim.eng.faults[el.dataset.k] = el.checked; simLog((el.checked ? '⚠️ ' : '✔ ') + el.parentElement.textContent.trim()); } else { el.checked = false; deps.toast('הפעילו קודם את הסימולציה ▶️'); } break;
        case 'rec-start': rec.on = true; startWatch(); deps.toast('ההקלטה התחילה — השאירו את המסך דלוק'); break;
        case 'rec-stop': rec.on = false; store.set('mdl_v3_rec', rec.pts); if (!needWatch()) stopWatch(); break;
        case 'rec-mark': {
          if (!lastFix || lastFix.accuracy > 35) return deps.toast('אין מיקום מדויק כרגע');
          const id = document.getElementById('markstop').value;
          rec.anchors[id] = [+lastFix.lat.toFixed(6), +lastFix.lon.toFixed(6)];
          store.set('mdl_v3_rec_anchors', rec.anchors); deps.toast('📌 סומן: ' + id); break;
        }
        case 'rec-save':
          if (rec.pts.length < 20) return;
          if (!confirm('להשתמש בהקלטה כמסלול המאומת בטלפון הזה?')) return;
          override = { geometry: rec.pts.slice(), anchors: Object.assign({}, rec.anchors), recordedAt: new Date().toISOString() };
          store.set('mdl_v3_override', override); rebuild(); deps.toast('✅ המסלול המוקלט פעיל'); break;
        case 'rec-clear':
          if (!confirm('לחזור למסלול המשוער? (ההקלטה עצמה נשמרת)')) return;
          override = null; store.del('mdl_v3_override'); rebuild(); break;
        case 'rec-export': {
          const geo = { type: 'FeatureCollection', features: [
            { type: 'Feature', properties: { name: 'ROAD67 recorded', recordedAt: new Date().toISOString() },
              geometry: { type: 'LineString', coordinates: (override ? override.geometry : rec.pts).map(([la, lo]) => [lo, la]) } },
            ...Object.entries(override ? override.anchors : rec.anchors).map(([k, [la, lo]]) =>
              ({ type: 'Feature', properties: { stop: k }, geometry: { type: 'Point', coordinates: [lo, la] } }))] };
          const blob = new Blob([JSON.stringify(geo)], { type: 'application/geo+json' });
          const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'road67-recorded.geojson';
          document.body.appendChild(l); l.click(); l.remove(); return;
        }
      }
      paint();
    }
    async function onImport(input) {
      const f = input.files && input.files[0]; if (!f) return;
      try {
        const text = await f.text();
        const pts = G.parseTrack(text);
        if (pts.length < 10) throw new Error('few');
        let anchors = {};
        try { const j = JSON.parse(text); (j.features || []).forEach(ft => { if (ft.properties && ft.properties.stop && ft.geometry.type === 'Point') anchors[ft.properties.stop] = [ft.geometry.coordinates[1], ft.geometry.coordinates[0]]; }); } catch { /* GPX */ }
        override = { geometry: pts, anchors, recordedAt: new Date().toISOString(), imported: f.name };
        store.set('mdl_v3_override', override); rebuild(); deps.toast('✅ המסלול יובא (' + pts.length + ' נקודות)');
      } catch { deps.toast('הקובץ לא זוהה כמסלול GPX/GeoJSON'); }
      input.value = ''; paint();
    }
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-nav]');
      if (!el || el.tagName === 'INPUT') return;
      onAction(el, e);
    });
    document.addEventListener('change', e => {
      const el = e.target.closest('input[data-nav]'); if (!el) return;
      if (el.dataset.nav === 'rec-import') onImport(el); else onAction(el, e);
    });

    // --------------------------------------------------------------- Mode bus : un seul écran, un gros bouton
    // Le guide parle au micro : pas de défilement, un bouton toujours au même endroit dont le texte suit
    // l'étape (publier → attendre → révéler → suivante), sa phrase 🎤 en grand, vibration aux moments clés.
    const bus = { seen: null, menu: false, pick: false, buzz: {}, touch: false, body: '' };
    const buzz = (k, pattern) => { if (bus.buzz[k]) return; bus.buzz[k] = 1; try { navigator.vibrate && navigator.vibrate(pattern || 200); } catch { /* */ } };
    const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    function busHtml() {
      keepAwake();
      return `<div id="busroot" class="bus"><div id="busbody"></div>
        <div class="busbar"><button type="button" class="btn ghost busmore" data-nav="bus-menu" aria-label="עוד">⋯</button><button type="button" id="busact" class="btn busact"></button></div>
        <div id="bussheet"></div></div>`;
    }
    function keepAwake() {
      if (!wake && 'wakeLock' in navigator && document.visibilityState === 'visible')
        navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { if (wake === w) wake = null; }); }).catch(() => {});
    }
    function top3(s) {
      const lb = (s.leaderboard || []).slice(0, 3);
      return lb.length ? `<div class="bustop3">${lb.map((r, i) => `${['🥇', '🥈', '🥉'][i]} <b dir="auto">${esc(r.name)}</b> ${r.score}`).join(' · ')}</div>` : '';
    }
    // classement complet, en bas de l'écran (on y descend quand on veut l'annoncer)
    function rankHtml(s) {
      const lb = s.leaderboard || [];
      return `<div class="busrank" id="busrank"><h3>🏆 דירוג (${lb.length})</h3>
        ${lb.length ? `<ol class="lb">${lb.map(r => `<li><span class="pos">${r.rank}</span><span class="nm" dir="auto">${esc(r.name)}</span>
          <span class="cr">${r.correct}/${r.answered} ✔</span><span class="sc">${r.score}</span></li>`).join('')}</ol>` : '<p class="small muted">אין עדיין משתתפים</p>'}</div>`;
    }
    function busView() {
      const s = S(), g = s && s.game, c = s && s.current, now = Date.now(), off = deps.offset();
      if (!P) return { body: `<p class="small">${esc(loadErr || 'טוען מסלול…')}</p>`, label: '…', disabled: true };
      const pl = G.plan(P, real.on ? real.trk : null, realCtx(now));
      const openMs = c && c.opened_at ? now - (Date.parse(c.opened_at) - off) : 0;
      const head = `<div class="bustop"><span>👥 ${s.online}</span>
        <span>✍️ ${c && (g.phase === 'open' || g.phase === 'closed') ? c.answers + '/' + s.online : '–'}</span>
        <span>${g.phase === 'open' ? '⏱ ' + mmss(openMs) : ''}</span>
        <span class="gpsdot ${real.on ? (pl.status === 'ok' ? 'on' : 'warn') : 'off'}">GPS</span></div>`;
      // bandeau de couleur : où on en est sur la route (lisible du coin de l'œil)
      const n = pl.next, lvl = n ? n.level || 0 : 0;
      const cq = c ? deps.qt(c) : null, bq = c ? questions().find(q => q.id === c.question_id) : null;
      // pendant une question (ouverte → révélée), le bandeau montre SON lieu, pas le suivant
      const busy = c && g.phase !== 'waiting' && !(g.phase === 'revealed' && bus.seen === c.question_id);
      const curStop = busy && bq ? P.stops.find(st => 'v3:' + st.question === bq.ext_key) : null;
      let band;
      if (curStop) band = `<div class="busband cur">❓ ${numOf(curStop) || ''} · ${esc(nm(curStop.name))}</div>`;
      else if (!real.on) band = `<button type="button" class="busband off" data-nav="gps-on">📍 GPS כבוי — לגעת כאן כדי להפעיל${n ? ' · הבא: ' + esc(nm(n.stop.name)) : ''}</button>`;
      else if (pl.status !== 'ok' && pl.status !== 'searching') band = `<div class="busband bad">${esc(STATUS[pl.status] ? STATUS[pl.status][0] : pl.status)}${n ? ' · ' + esc(nm(n.stop.name)) : ''}</div>`;
      else if (n) {
        const sd = n.stop.side || {}, side = sd.value === 'left' ? ' · 👈 שמאל' : sd.value === 'right' ? ' · ימין 👉' : '';
        band = `<div class="busband l${lvl}">${['⚪', '🟡', '🟠', '🟢'][lvl]} ${esc(nm(n.stop.name))} · ${n.inZone ? 'עכשיו' : fmtDist(n.distM)}${side}</div>`;
        if (lvl === 3) buzz('green:' + n.stop.id, [200, 100, 200]);
      } else band = `<div class="busband l0">${pl.finish || pl.arrived ? '☕ סוף המסלול' : 'מחפש מיקום…'}</div>`;

      const right = cq ? `<div class="busok" ${dirOf(cq.lang)}>✔ ${esc(cq.options[c.correct_index] || '')}</div>` : '';
      if (g.paused) return { body: head + band + '<div class="busq">⏸️ המשחק מושהה</div>', label: '▶️ להמשיך', a: 'unpause', cls: 'go' };
      if (c && g.phase === 'open') {
        const minLeft = (g.min_answer_sec || 30) * 1000 - openMs;
        if (minLeft <= 0) buzz('min:' + c.question_id);
        if (s.online > 0 && c.answers >= s.online) buzz('all:' + c.question_id, [100, 80, 100, 80, 100]);
        return { body: head + band + `<div class="busq" ${dirOf(cq.lang)}>${esc(cq.text)}</div>
            <div class="buscount">${c.answers} / ${s.online} ענו</div>${right}`,
          label: minLeft > 0 ? `⏳ ${Math.ceil(minLeft / 1000)} שנ׳` : '👁️ לסגור ולחשוף',
          a: minLeft > 0 ? null : 'reveal', disabled: minLeft > 0, cls: minLeft > 0 ? 'wait' : 'go' };
      }
      if (c && g.phase === 'closed')
        return { body: head + band + `<div class="busq" ${dirOf(cq.lang)}>${esc(cq.text)}</div><div class="buscount">${c.answers} תשובות</div>${right}`,
          label: '👁️ לחשוף תשובה', a: 'reveal', cls: 'go' };
      if (c && g.phase === 'revealed' && bus.seen !== c.question_id) {
        // le moment de parler : la phrase du micro, en grand, sans fenêtre à ouvrir
        return { body: head + band + right + `<div class="busscript" ${dirOf(lang())}>🎤 ${esc(tr(bq, 'script'))}</div>
            ${tr(bq, 'fact') ? `<details class="busmore-txt"><summary>💡 אם יש זמן</summary><div ${dirOf(lang())}>${esc(tr(bq, 'fact'))}</div></details>` : ''}${top3(s)}`,
          label: '➡️ לשאלה הבאה', nav: 'bus-next', cls: 'next' };
      }
      if (!n || pl.finish) return { body: head + band + '<div class="busq">אין עוד נקודות מומלצות.</div>', label: '📋 לבחור נקודה', nav: 'bus-pick', cls: 'next' };
      const q = qOf(n.stop), t = qText(q), hold = pl.hold;
      const wait = hold && hold.reason !== 'question_open' ? `<div class="bushold">⏳ ${hold.reason === 'speaking' ? 'זמן ההסבר שלך' : 'רווח בין שאלות'} — עוד ${hold.waitSec} שנ׳ (אפשר גם עכשיו)</div>` : '';
      return { body: head + band + wait + (q ? `<div class="busq" ${dirOf(t.lang)}>${esc(t.text)}</div>
          <div class="busok" ${dirOf(t.lang)}>✔ ${esc(t.options[q.correct_index] || '')}</div>
          ${n.stop.look ? `<div class="small muted" ${dirOf(lang())}>👀 ${esc(nm(n.stop.look))}</div>` : ''}` : '<p class="small">השאלה לא נמצאה.</p>'),
        label: '📣 לפרסם שאלה', nav: q ? 'publish' : null, stop: n.stop.id, disabled: !q, cls: lvl === 3 ? 'go pulse' : 'early' };
    }
    function busSheet() {
      const s = S(), g = s && s.game, pl = P ? G.plan(P, real.on ? real.trk : null, realCtx(Date.now())) : null, n = pl && pl.next;
      if (bus.pick) {
        const ctx = realCtx(Date.now());
        return `<div class="bussheet"><div class="sheet">
          <h2 style="margin:0 0 8px">📋 לבחור נקודה</h2>
          ${P.stops.filter(st => st.main && !ctx.used.has(st.question)).map(st => `<button type="button" class="btn ghost busli" data-nav="pin" data-stop="${st.id}">${numOf(st)} · ${esc(nm(st.name))}</button>`).join('') || '<p>כל השאלות נשאלו.</p>'}
          <button type="button" class="btn ghost" data-nav="bus-close">✖ סגירה</button></div></div>`;
      }
      if (!bus.menu) return '';
      const c = s.current;
      return `<div class="bussheet"><div class="sheet">
        ${n && g.phase !== 'open' ? `<button type="button" class="btn ghost busli" data-nav="skip" data-stop="${n.stop.id}">⏭️ לדלג על ${esc(nm(n.stop.name))}</button>
          <button type="button" class="btn ghost busli" data-nav="back">⏮️ הנקודה הקודמת</button>` : ''}
        <button type="button" class="btn ghost busli" data-nav="bus-rank">🏆 הדירוג המלא</button>
        <button type="button" class="btn ghost busli" data-nav="bus-pick">📋 לבחור נקודה מהרשימה</button>
        ${c && (g.phase === 'open' || g.phase === 'revealed') ? `<button type="button" class="btn ghost busli" data-nav="guide" data-q="${c.question_id}">🎤 הדף המלא של השאלה</button>` : ''}
        ${g.phase === 'open' ? '<button type="button" class="btn ghost busli" data-a="force" style="color:var(--bad)">⚠️ סגירת חירום (לפני 30 שנ׳)</button>' : ''}
        ${real.on ? '<button type="button" class="btn ghost busli" data-nav="gps-off">⏹ לכבות GPS</button>' : '<button type="button" class="btn ghost busli" data-nav="gps-on">📍 להפעיל GPS</button>'}
        <a class="btn ghost busli" target="_blank" rel="noopener" href="${deps.waHref()}">💬 לשלוח את הקישור בוואטסאפ</a>
        ${g.phase !== 'open' ? '<button type="button" class="btn ghost busli" data-a="pause">⏸️ השהיה</button><button type="button" class="btn ghost busli" data-a="finish">🏁 סיום המשחק והזוכים</button>' : ''}
        <button type="button" class="btn ghost busli" data-nav="bus-full">🧰 המסך המלא</button>
        <button type="button" class="btn" data-nav="bus-close">✖ סגירה</button></div></div>`;
    }
    function paintBus() {
      const root = document.getElementById('busroot'); if (!root || bus.touch) return;
      const v = busView();
      v.body += rankHtml(S());
      if (v.body !== bus.body) { document.getElementById('busbody').innerHTML = v.body; bus.body = v.body; }
      const b = document.getElementById('busact');
      if (b.textContent !== v.label) b.textContent = v.label;
      b.className = 'btn busact ' + (v.cls || ''); b.disabled = !!v.disabled;
      ['a', 'nav', 'stop'].forEach(k => { if (v[k]) b.dataset[k] = v[k]; else delete b.dataset[k]; });
      const sh = busSheet(), el = document.getElementById('bussheet');
      if (el._h !== sh) { el.innerHTML = sh; el._h = sh; }
    }
    // ne jamais redessiner sous le doigt (un appui ne doit pas tomber dans le vide)
    document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('#busroot')) bus.touch = true; }, true);
    document.addEventListener('pointerup', () => { bus.touch = false; }, true);
    document.addEventListener('pointercancel', () => { bus.touch = false; }, true);
    // une action du menu ferme le menu
    document.addEventListener('click', e => {
      if (e.target.closest('#bussheet [data-a], #bussheet a, #bussheet [data-nav]')) { bus.menu = false; bus.pick = false; setTimeout(paintBus, 0); }
    }, true);

    // --------------------------------------------------------------- Rafraîchissement en place (sans tout redessiner)
    function paint() {
      paintTrack();
      paintBus();
      const a = document.getElementById('navroot');
      const typing = el => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== 'checkbox';
      if (a && !(a.contains(document.activeElement) && typing(document.activeElement))) { const o = a.querySelector('details[open]'); a.innerHTML = livePanel(); if (o) keepOpen(a, o); }
      const b = document.getElementById('navroute');
      if (b && !(b.contains(document.activeElement) && typing(document.activeElement))) { const o = [...b.querySelectorAll('details[open]')].map(d => d.querySelector('summary').textContent); b.innerHTML = routePanel(); restoreOpen(b, o); }
    }
    function keepOpen(root, old) { const t = old.querySelector('summary') && old.querySelector('summary').textContent; restoreOpen(root, [t]); }
    function restoreOpen(root, titles) { root.querySelectorAll('details').forEach(d => { const s = d.querySelector('summary'); if (s && titles.includes(s.textContent)) d.open = true; }); }
    paintTimer = setInterval(paint, 1000);
    load().then(paint);

    return { liveHtml, routeHtml, busHtml, paint, stopAll() { real.on = false; rec.on = false; stopWatch(); },
      get simOn() { return sim.on; }, get P() { return P; }, _sim: sim, _real: real };
  }

  window.MDL_NAV = { create };
})();
