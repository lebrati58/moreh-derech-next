// מורה דרך EXAM — interface (RTL, mobile d'abord). Logique : exam-core.js. Contenu : models.json + golan-south.json.
// Progression gardée dans le téléphone (localStorage « mdl_exam_v1 ») : aucun compte, aucun numéro, rien n'est envoyé.
(function () {
  'use strict';
  const C = window.MDExamCore;
  const app = document.getElementById('app');
  const KEY = 'mdl_exam_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

  // ---------- Langue de l'accompagnement (le contenu d'examen reste en hébreu) ----------
  const T = {
    he: { title: 'אתגר המבחן', sub: 'מורה דרך EXAM — מתכננים יום טיול, בוחרים אתרים וכותבים הדרכות, כמו בפרק השני של המבחן.', today: 'משימת היום', missions: 'משימות', soon: 'בקרוב', locked: 'נפתח ברמה 2', guided: 'אימון מודרך', errors: 'מצא את הטעות', exam: 'סימולציית מבחן', progress: 'ההתקדמות שלי', badges: 'תגים', weak: 'חזרה ממוקדת', noweak: 'עוד אין מספיק נתונים — שחקו משימה אחת.', back: 'חזרה', hint: 'רמז', model: 'תשובה לדוגמה', compare: 'השוואה', improve: 'לשפר את התשובה', check: 'בדיקה', reset: 'מחדש', next: 'הלאה', prev: 'הקודם', start: 'להתחיל', submit: 'הגשה', sources: 'מקורות', indicative: 'הערכה פדגוגית בלבד — לא נמצא מחוון רשמי. הניקוד לפי הכללים שבחומר הקורס.', map: 'מפה', lang: 'FR', mine: 'התשובה שלי', words: 'מילים', time: 'זמן', level: 'רמה' },
    fr: { title: 'Exam Challenge', sub: 'Moreh Derech EXAM — préparer une journée, choisir les sites et rédiger les interventions, comme dans la 2e partie de l’examen.', today: 'Mission du jour', missions: 'Missions', soon: 'Bientôt', locked: 'Débloqué au niveau 2', guided: 'Entraînement guidé', errors: 'Trouve les erreurs', exam: 'Examen blanc', progress: 'Ma progression', badges: 'Badges', weak: 'Révision ciblée', noweak: 'Pas encore assez de données — joue une mission.', back: 'Retour', hint: 'Indice', model: 'Réponse modèle', compare: 'Comparer', improve: 'Améliorer ma réponse', check: 'Vérifier', reset: 'Recommencer', next: 'Suivant', prev: 'Précédent', start: 'Commencer', submit: 'Rendre', sources: 'Sources', indicative: 'Évaluation pédagogique indicative — aucune grille officielle trouvée. Le score suit les règles des documents du cours.', map: 'Carte', lang: 'עב', mine: 'Ma réponse', words: 'mots', time: 'Temps', level: 'Niveau' }
  };
  let lang = 'he'; try { lang = localStorage.getItem('mdl_exam_lang') || 'he'; } catch (e) {}
  const t = k => (T[lang] || T.he)[k] || T.he[k] || k;

  // ---------- Sauvegarde ----------
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  let S = Object.assign({ xp: 0, badges: [], aw: {}, cats: {}, sites: {}, drafts: {}, exams: {}, history: [] }, load());
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function award(key, xp) { if (S.aw[key]) return 0; S.aw[key] = 1; return gain(xp); }
  function gain(xp) {
    const before = C.level(S.xp).n; S.xp += xp; save();
    if (xp > 0) toast(`+${xp} XP`);
    if (C.level(S.xp).n > before) { celebrate('🎉 ' + t('level') + ' ' + C.level(S.xp).n + ' — ' + C.level(S.xp).he); }
    return xp;
  }
  const TAGS = { road: '🚌 הדרכת דרך', view: '🔭 תצפית', geology: '🪨 גאולוגיה', judaism: '✡️ יהדות', synagogue: '🕍 בית כנסת עתיק', christianity: '✝️ נצרות', new_testament: '📖 ברית חדשה', hellenistic_roman: '🏛️ הלניסטי-רומי', byzantine: '⛪ ביזנטי', archaeology: '⛏️ ארכאולוגיה', battle: '⚔️ קרב', yom_kippur: '🎖️ מלחמת יום הכיפורים', heritage: '🏅 מורשת', personal_story: '🎙️ סיפור אישי', water: '💧 מים', city: '🏙️ עיר עתיקה', bible: '📜 תנ״ך', geography: '🗺️ גאוגרפיה' };
  const BADGES = {
    first: ['🧭', 'צעד ראשון', 'בחרתם אתרים למשימה'],
    clock: ['⏱️', 'שומר הזמן', 'לוח זמנים תקין'],
    w180: ['🎯', '180 בדיוק', 'יחידה קצרה בטווח 170–180 מילים'],
    long: ['📜', 'הדרכה מורחבת', 'יחידה מורחבת שעברה את הבדיקה'],
    road: ['🚌', 'מדריך דרך', 'הדרכת דרך שעברה את הבדיקה'],
    hunter: ['🔎', 'צייד טעויות', '10 טעויות שנמצאו'],
    exam: ['🏅', 'מוכן למבחן', 'ציון 80% ומעלה בסימולציה'],
    examdone: ['⏳', 'סימולציה ראשונה', 'הגשתם סימולציה מלאה']
  };
  function badge(id) { if (S.badges.includes(id)) return; S.badges.push(id); save(); celebrate(BADGES[id][0] + ' ' + BADGES[id][1]); }
  function noteErr(cat, n) { if (!cat) return; const c = S.cats[cat] || (S.cats[cat] = { err: 0, ok: 0 }); c.err += n || 1; save(); }
  function noteOk(cat) { const c = S.cats[cat] || (S.cats[cat] = { err: 0, ok: 0 }); c.ok++; save(); }
  function noteSite(id, ok) { if (!id) return; const s = S.sites[id] || (S.sites[id] = { ok: 0, err: 0 }); s[ok ? 'ok' : 'err']++; save(); }

  // ---------- Petits effets ----------
  function toast(msg) {
    let el = $('#xToast'); if (!el) { el = document.createElement('div'); el.id = 'xToast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.className = 'show'; clearTimeout(el._t); el._t = setTimeout(() => { el.className = ''; }, 1800);
  }
  function celebrate(msg) {
    toast(msg);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 26; i++) { const s = document.createElement('span'); s.textContent = ['⭐', '✨', '🎉', '🏆'][i % 4]; s.style.left = (Math.random() * 100) + '%'; s.style.animationDelay = (Math.random() * .6) + 's'; box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  }

  // ---------- Données ----------
  let MODELS, DATA, P;
  const srcLink = (key, label) => {
    if (Array.isArray(key)) return key.map(k => srcLink(k, label)).join(' ');
    const s = (DATA.sources[key] || MODELS.planRules && { lesson26: MODELS.planRules.source, roadTips: MODELS.roadTips.source, longRules: MODELS.longRules.source }[key]);
    if (key === 'guide') return '<span class="src">🧑‍🏫 כלל המדריך</span>';
    if (!s) return key === 'model' ? '<span class="src">📐 תנאי המבחן</span>' : '';
    const href = s.url || ('https://drive.google.com/open?id=' + encodeURIComponent(s.id));
    return `<a class="src" href="${esc(href)}" target="_blank" rel="noopener">📄 ${esc(label || s.title)}</a>`;
  };
  const statusChips = p => (p.status || []).map(s => `<span class="st st-${s}">${esc(DATA.statusLabels[s])}</span>`).join('');

  // ---------- Carte (MapLibre + relief si possible, sinon plan schématique) ----------
  let mlPromise = null;
  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (mlPromise) return mlPromise;
    const CDNS = ['https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl', 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl'];
    const tryCdn = (i) => new Promise((res, rej) => {
      if (i >= CDNS.length) return rej(new Error('load'));
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = CDNS[i] + '.css'; document.head.appendChild(css);
      const sc = document.createElement('script'); sc.src = CDNS[i] + '.js';
      const to = setTimeout(() => { sc.remove(); tryCdn(i + 1).then(res, rej); }, 9000);
      sc.onload = () => { clearTimeout(to); window.maplibregl ? res(window.maplibregl) : tryCdn(i + 1).then(res, rej); };
      sc.onerror = () => { clearTimeout(to); tryCdn(i + 1).then(res, rej); };
      document.head.appendChild(sc);
    });
    mlPromise = (/[?&]nomap\b/.test(location.search) || !navigator.onLine) ? Promise.reject(new Error('offline')) : tryCdn(0);
    mlPromise.catch(() => { mlPromise = null; });   // on pourra réessayer
    return mlPromise;
  }
  // Itinéraire routier via le serveur public OSRM (OpenStreetMap). Estimation « sans embouteillages », jamais une invention :
  // la source est affichée. En cas d'échec (hors ligne, serveur occupé), on reste sur les distances aériennes.
  function osrmRoute(points) {
    const ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 9000);
    const url = 'https://router.project-osrm.org/route/v1/driving/' + points.map(p => p.lon + ',' + p.lat).join(';') + '?overview=full&geometries=geojson';
    return fetch(url, { signal: ctl && ctl.signal }).then(r => r.json()).then(j => {
      if (t) clearTimeout(t);
      const r = j && j.routes && j.routes[0]; if (!r) return null;
      return { feature: { type: 'Feature', geometry: r.geometry }, legs: r.legs.map(l => ({ km: Math.round(l.distance / 100) / 10, min: Math.round(l.duration / 60) })), km: Math.round(r.distance / 100) / 10, min: Math.round(r.duration / 60) };
    });
  }
  function mapBox(el, opts) {
    // opts : { pick(id) | null, mark: {id: label}, onSite(id) }
    el.innerHTML = '<div class="mapwrap"><div class="map" role="application" aria-label="מפת דרום רמת הגולן"></div><div class="maplegend">📍 לחצו על נקודה · 🚌 קו מקווקו = סכמטי, לא תוואי כביש</div></div>';
    const holder = $('.map', el);
    const sites = DATA.sites;
    const click = id => { if (opts.pick) opts.pick(id); else siteSheet(id); };
    const svgFallback = why => {
      holder.classList.add('svg');
      const W = 360, H = 240, lo = [35.62, 35.87], la = [32.76, 32.89];
      const x = l => Math.round((l - lo[0]) / (lo[1] - lo[0]) * W), y = l => Math.round((la[1] - l) / (la[1] - la[0]) * H);
      const r789 = DATA.roads.find(r => r.line), a = P[r789.line[0]], b = P[r789.line[1]];
      holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="מפה סכמטית"><rect width="${W}" height="${H}" rx="14" fill="#13234d"/>
        <text x="10" y="${H / 2}" fill="#7fb6ff" font-size="12" font-weight="800">← הכנרת (מערב)</text>
        <line x1="${x(a.lon)}" y1="${y(a.lat)}" x2="${x(b.lon)}" y2="${y(b.lat)}" stroke="#ffd878" stroke-width="2" stroke-dasharray="5 4"/>
        ${sites.map(s => `<g class="pt" data-id="${s.id}" tabindex="0" role="button" aria-label="${esc(s.short)}"><circle cx="${x(s.lon)}" cy="${y(s.lat)}" r="9" fill="${opts.mark && opts.mark[s.id] ? '#6ee9cf' : '#ff8f8f'}" stroke="#fff" stroke-width="2"/>
          <text x="${x(s.lon)}" y="${s.id === 'kursi' ? y(s.lat) + 22 : y(s.lat) - 13}" text-anchor="${s.id === 'kursi' ? 'start' : 'middle'}" fill="#fff" font-size="12" font-weight="800">${esc(s.short)}${opts.mark && opts.mark[s.id] ? ' · ' + esc(opts.mark[s.id]) : ''}</text></g>`).join('')}
      </svg><div class="mapnote">${why === 'offline' ? 'מפה סכמטית (ללא חיבור)' : 'מפה סכמטית — המפה האמיתית לא נטענה (' + esc(why) + ')'} · מיקומים לפי Wikidata ${why !== 'offline' || navigator.onLine ? '<button type="button" class="mini" data-retry>🗺️ לנסות שוב מפה אמיתית</button>' : ''}</div>`;
      $$('.pt', holder).forEach(g => { g.addEventListener('click', () => click(g.dataset.id)); g.addEventListener('keydown', e => { if (e.key === 'Enter') click(g.dataset.id); }); });
      const rb = $('[data-retry]', holder); if (rb) rb.addEventListener('click', () => { mlPromise = null; mapBox(el, opts); });
    };
    loadMapLibre().then(ml => {
      let map;
      try {
        map = new ml.Map({ container: holder, style: 'https://tiles.openfreemap.org/styles/liberty', center: [35.735, 32.83], zoom: 10.4, pitch: 50, bearing: -15, attributionControl: { compact: true } });
      } catch (e) { return svgFallback('webgl'); }
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-left');
      map.on('error', () => {});
      map.on('load', () => {
        try {
          map.addSource('dem', { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 13, attribution: 'Terrain: Mapzen/AWS' });
          map.setTerrain({ source: 'dem', exaggeration: 1.6 });
        } catch (e) {}
        const r = DATA.roads.find(x => x.line);
        map.addSource('r789', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: r.line.map(id => [P[id].lon, P[id].lat]) } } });
        map.addLayer({ id: 'r789', type: 'line', source: 'r789', paint: { 'line-color': '#f0b44c', 'line-width': 3, 'line-dasharray': [2, 2] } });
        // Trajet réel par les routes (OSRM / OpenStreetMap) entre les visites, dans l'ordre des numéros
        const seq = Object.entries(opts.mark || {}).filter(([, v]) => /^\d+$/.test(v)).sort((a, b) => +a[1] - +b[1]).map(([id]) => P[id]).filter(Boolean);
        if (seq.length >= 1 && (DATA.anchors || [])[0]) { seq.unshift(DATA.anchors[0]); seq.push(DATA.anchors[0]); }
        if (seq.length >= 2) osrmRoute(seq).then(geo => {
          if (!geo || !map.getStyle()) return;
          map.addSource('route', { type: 'geojson', data: geo.feature });
          map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#6ee9cf', 'line-width': 4 } });
          if (opts.onRoute) opts.onRoute(geo);
        }).catch(() => {});
      });
      sites.forEach(s => {
        const m = document.createElement('button'); m.type = 'button'; m.className = 'mk' + (opts.mark && opts.mark[s.id] ? ' on' : ''); m.dataset.id = s.id;
        m.innerHTML = `<b>${esc(s.short)}</b>${opts.mark && opts.mark[s.id] ? '<i>' + esc(opts.mark[s.id]) + '</i>' : ''}`;
        m.addEventListener('click', e => { e.stopPropagation(); click(s.id); });
        new ml.Marker({ element: m, anchor: 'bottom' }).setLngLat([s.lon, s.lat]).addTo(map);
      });
      el._map = map;
    }).catch(e => svgFallback(String(e && e.message)));
  }
  const ST = { yes: ['✅', 'יש'], unknown: ['❓', 'לברר'], caution: ['⚠️', 'שימו לב'], no: ['⛔', 'אין'] };
  function logisticsHtml(p, compact) {
    const L = p.logistics2; if (!L) return '';
    const row = (ico, lab, v) => v ? `<li><span class="lk">${ico} ${lab}</span><span>${esc(v.he)} ${v.src ? srcLink(v.src, 'מקור') : ''}</span></li>` : '';
    const flag = (ico, lab, v) => v ? `<li class="st-${v.status}"><span class="lk">${ico} ${lab}</span><span><b>${ST[v.status][1]}</b> — ${esc(v.he)} ${v.src ? srcLink(v.src, 'מקור') : ''}</span></li>` : '';
    const nav = C.navLinks(null, p);
    return `<div class="logi"><h4>🧾 לוגיסטיקה לתכנון</h4><ul>
      ${row('🕘', 'שעות', L.hours)}${row('⏮️', 'כניסה אחרונה', L.lastEntry)}${row('💳', 'תשלום', L.price)}
      ${flag('🚻', 'שירותים', L.toilets)}${flag('🅿️', 'חניה לאוטובוס', L.parking)}${flag('🎫', 'קופה / המתנה', L.queue)}
      ${row('📞', 'טלפון', L.phone)}${row('👥', 'קבוצות', L.group)}
      <li><span class="lk">🧭 ניווט</span><span><a href="${nav.waze}" target="_blank" rel="noopener">Waze</a> · <a href="${nav.google}" target="_blank" rel="noopener">Google Maps</a></span></li></ul>
      ${compact ? '' : '<p class="muted">מה שלא אומת במקורות מסומן ״לברר״ — במבחן כותבים את זה בעמודת ״תיאומים ומנהלות״ (לברר שירותים, חניה, תשלום).</p>'}</div>`;
  }
  // Bloc d'un site dans un panneau : en-tête bien visible (numéro, nom, statut) + logistique.
  function siteBlock(p, n, mv) {
    const arrows = mv ? `<span class="mv"><button type="button" data-mv="${p.id}:-1" aria-label="להעלות" ${mv.up ? '' : 'disabled'}>▲</button><button type="button" data-mv="${p.id}:1" aria-label="להוריד" ${mv.down ? '' : 'disabled'}>▼</button></span>` : '';
    return `<div class="pi"><div class="pih"><span class="num">${n}</span><span class="nm">📍 ${esc(p.he)}</span>${arrows}<span class="chips">${statusChips(p)}</span></div>${logisticsHtml(p, true)}</div>`;
  }
  function siteSheet(id) {
    const p = P[id]; if (!p) return;
    const m = S.sites[id] || { ok: 0, err: 0 }, tot = m.ok + m.err;
    const sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', p.he);
    sheet.innerHTML = `<div class="sheet-in"><button type="button" class="x" aria-label="סגירה">✕</button>
      <h3>${esc(p.he)}</h3><div class="chips">${statusChips(p)}</div>
      ${p.periods ? `<p class="per">🕰️ ${p.periods.map(esc).join(' · ')}</p>` : ''}
      ${p.hours ? `<p>🕘 ${esc(p.hours.he)}</p>` : '<p class="muted">🕘 שעות פתיחה: לא צוינו בחומר</p>'}
      ${p.access ? `<p>🚌 ${esc(p.access.he)}</p>` : ''}
      ${p.logistics ? `<p>📞 ${esc(p.logistics.he)}</p>` : ''}
      <p class="muted">⏳ משך ביקור: ${p.visit ? esc(p.visit) : 'לא צוין בחומר — לא ממציאים'}</p>
      ${logisticsHtml(p)}
      <ul class="facts">${(p.facts || []).map(f => `<li>${esc(f.he)} ${srcLink(f.src, '')}</li>`).join('')}</ul>
      ${(p.conflicts || []).map(c => `<p class="conf">⚠️ ${esc(c.he)}</p>`).join('')}
      ${p.note ? `<p class="conf">ℹ️ ${esc(p.note)}</p>` : ''}
      <p class="mast">רמת שליטה: ${tot ? Math.round(100 * m.ok / tot) + '%' : '—'} (${m.ok} ✔ · ${m.err} ✗)</p>
      <div class="srcs">${(p.sources || []).map(k => srcLink(k)).join('')}</div></div>`;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    $('.x', sheet).addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    $('.x', sheet).focus();
  }

  // ---------- Horloge à boutons (pas de clavier) ----------
  function timeButton(k, v, label) { return `<button type="button" class="tbtn" data-t="${k}" data-v="${esc(v || '')}" aria-label="${esc(label)}">${v ? esc(v) : '--:--'}</button>`; }
  function clockPick(value, label, cb, base) {
    // Simple : une heure en grand, on ajuste avec ±5 / ±15 / ±1h, puis ✔. Point de départ : la valeur, sinon l'heure précédente, sinon 08:00.
    let m = C.toMin(value) ?? C.toMin(base) ?? C.toMin('08:00');
    const sheet = document.createElement('div'); sheet.className = 'sheet clock'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', label);
    const close = () => sheet.remove();
    sheet.innerHTML = `<div class="sheet-in"><h3>${esc(label)}</h3><div class="cval" id="cv"></div>
      <div class="cbtns"><button type="button" data-d="-60">−1h</button><button type="button" data-d="-15">−15</button><button type="button" data-d="-5">−5</button><button type="button" data-d="5">+5</button><button type="button" data-d="15">+15</button><button type="button" data-d="60">+1h</button></div>
      <div class="acts"><button type="button" class="btn" id="cok">✔ אישור</button><button type="button" class="btn ghost" id="cx">ביטול</button></div></div>`;
    const show = () => { $('#cv', sheet).textContent = C.fmt(m); };
    $$('[data-d]', sheet).forEach(b => b.addEventListener('click', () => { m = Math.max(0, Math.min(23 * 60 + 55, m + +b.dataset.d)); show(); }));
    $('#cok', sheet).addEventListener('click', () => { close(); cb(C.fmt(m)); });
    $('#cx', sheet).addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    document.body.appendChild(sheet); show();
  }
  function wireClocks(box, onPick) {
    $$('.tbtn', box).forEach(b => b.addEventListener('click', () => {
      // sans valeur : on part de l'heure précédente de la ligne / du tableau
      const row = b.closest('.pr'), prev = row ? (b.dataset.t.startsWith('end') ? $('.tbtn[data-t^="start"]', row).dataset.v : (row.previousElementSibling && $('.tbtn[data-t^="end"]', row.previousElementSibling) || {}).dataset?.v) : '';
      clockPick(b.dataset.v, b.getAttribute('aria-label'), v => onPick(b.dataset.t, v, b), prev);
    }));
  }

  // ---------- Éditeur d'intervention ----------
  function wordBadge(n, kind) {
    const w = C.wordState(n, kind, MODELS.models.school5.limits);
    const lab = w.state === 'over' ? `חריגה! ${n}/${w.max}` : w.state === 'ok' ? `${n}/${w.max} ✔` : `${n}/${w.max}`;
    return `<span class="wc wc-${w.state}">${lab}</span>`;
  }
  function editor(box, u, o) {
    // o : { kind, siteChoices:[ids], fixedSite, onChange }
    const long = o.kind === 'long';
    const opt = id => `<option value="${id}" ${u.site === id ? 'selected' : ''}>${esc(P[id].short)}</option>`;
    box.innerHTML = `<div class="ed">
      ${o.fixedSite ? `<p class="edsite">📍 <b>${esc(P[o.fixedSite].he)}</b></p>` : `<label>האתר<select data-f="site"><option value="">— בחירה —</option>${o.siteChoices.map(opt).join('')}</select></label>`}
      ${long ? `<label>הנושא<input data-f="topic" value="${esc(u.topic)}" placeholder="למשל: בית הכנסת והמעיין"></label>` : ''}
      <label>${long ? 'מיקום מדויק' : 'הנקודה'} — היכן המדריך והיכן המודרכים<input data-f="place" value="${esc(u.place)}" placeholder="${long ? '1) … 2) … 3) …' : 'למשל: ברחבה מול החזית, הקבוצה בחצי גורן'}"></label>
      <div class="row2"><label>משך ההדרכה (דק׳)<input data-f="minutes" type="number" inputmode="numeric" min="0" max="240" value="${esc(u.minutes)}"></label>
      <label>אמצעי הדרכה <span data-c="method"></span><input data-f="method" value="${esc(u.method)}" placeholder="עד 20 מילים"></label></div>
      <label class="tx">כתיבה — ${long ? 'עד 400 מילים · פתיחה / מה רואים / סיכום' : 'עד 180 מילים'} <span data-c="text"></span>
      <textarea data-f="text" rows="${long ? 14 : 8}" dir="rtl" placeholder="${long ? 'פסקה ראשונה: פתיחה (מי, מה, למה)…\n\nפסקה שנייה: מה רואים, מוליכים בין 2–3 נקודות…\n\nפסקה שלישית: סיכום' : 'פתיחה — מה רואים — סיום ומעבר'}">${esc(u.text)}</textarea></label>
      <div class="wcbar" aria-live="polite"><span class="wcl">מילים</span><b data-c="big"></b><span class="wcm" data-c="max"></span><div class="bar"><i></i></div></div></div>`;
    const upd = () => {
      $('[data-c="text"]', box).innerHTML = wordBadge(C.wordCount(u.text), long ? 'long' : 'short');
      const nn = C.wordCount(u.text), st = C.wordState(nn, long ? 'long' : 'short', MODELS.models.school5.limits);
      $('[data-c="big"]', box).textContent = nn; $('[data-c="max"]', box).textContent = '/ ' + st.max + (st.state === 'over' ? ' — חריגה!' : st.state === 'ok' ? ' ✔' : '');
      $('.wcbar', box).className = 'wcbar ' + st.state;
      const mw = C.wordCount(u.method);
      $('[data-c="method"]', box).innerHTML = `<span class="wc wc-${mw > 20 ? 'over' : mw ? 'ok' : 'low'}">${mw}/20</span>`;
      const max = long ? 400 : 180, n = C.wordCount(u.text);
      const bar = $('.bar i', box); bar.style.width = Math.min(100, 100 * n / max) + '%'; bar.className = C.wordState(n, long ? 'long' : 'short', MODELS.models.school5.limits).state;
    };
    $$('[data-f]', box).forEach(inp => inp.addEventListener('input', () => { u[inp.dataset.f] = inp.value; upd(); o.onChange && o.onChange(); }));
    upd();
  }
  function checklist(res, withCats) {
    return `<ul class="checks">${res.items.map(i => `<li class="${i.ok ? 'ok' : 'bad'}">${i.ok ? '✔' : '✗'} ${esc(i.he)}${!i.ok && withCats && i.cat ? ` <small>(${esc(C.CATS[i.cat] || i.cat)})</small>` : ''}</li>`).join('')}</ul>`;
  }
  const ADVICE = {
    fit: 'בדקו שהאתר עונה בדיוק על ניסוח היחידה בשאלון.', fields: 'מלאו את כל השדות: הנקודה, משך, אמצעי הדרכה (עד 20 מילים).',
    words: 'שמרו על המגבלה: 180 מילים ליחידה קצרה, 400 למורחבת. טקסט חורג נבדק בלי השורות האחרונות.',
    structure: 'פתחו ב״איפה אנחנו ולמה זה חשוב״, תארו את מה שרואים (״הביטו…״, ״מימיננו…״) וסיימו במעבר: ״עכשיו נמשיך…״.',
    facts: 'תקנו את העובדה המסומנת לפי החומר — ובדקו תיארוך ותקופה.'
  };
  function improveTips(res) {
    const parts = [...new Set(res.items.filter(i => !i.ok).map(i => i.part).filter(Boolean))];
    return parts.length ? `<ul class="tips">${parts.map(p => `<li>💡 ${esc(ADVICE[p])}</li>`).join('')}</ul>` : '<p class="good">✨ אין מה לשפר לפי הבדיקה האוטומטית. קראו בקול ובדקו שהטקסט נשמע טבעי.</p>';
  }

  // ---------- Écrans ----------
  function shell(inner, opts) {
    const L = C.level(S.xp);
    app.innerHTML = `<header class="top">
      <a class="home" href="${opts && opts.back ? esc(opts.back) : 'index.html'}"><span aria-hidden="true">→</span> ${opts && opts.back ? t('back') : 'Moreh Derech'}</a>
      <div class="tr"><span class="xp" title="XP">⭐ ${S.xp} · ${t('level')} ${L.n}</span><button type="button" class="lng" id="lng">${t('lang')}</button></div></header>${inner}`;
    $('#lng').addEventListener('click', () => { lang = lang === 'he' ? 'fr' : 'he'; try { localStorage.setItem('mdl_exam_lang', lang); } catch (e) {} route(); });
    window.scrollTo(0, 0);
  }

  function viewHome() {
    const L = C.level(S.xp), daily = C.dailyMission(new Date(), DATA.missions);
    const rec = C.recommend(Object.fromEntries(Object.entries(S.cats).map(([k, v]) => [k, v.err])), DATA);
    const locked = m => m.level > 1 && L.n < 2;
    const card = m => `<article class="mcard ${locked(m) ? 'lock' : ''}"><div class="me">${m.emoji}</div><div class="mt"><h3>${esc(m.he)}</h3><p>${esc(m.group)}</p>
      ${locked(m) ? `<p class="lk">🔒 ${t('locked')}</p>` : `<div class="modes"><a href="#/m/${m.id}/guided">🧭 ${t('guided')}</a><a href="#/m/${m.id}/errors">🔎 ${t('errors')}</a><a href="#/m/${m.id}/exam">⏱️ ${t('exam')}</a></div>`}</div></article>`;
    const catRows = Object.entries(S.cats).filter(([, v]) => v.err + v.ok).sort((a, b) => b[1].err - a[1].err).slice(0, 6);
    shell(`<section class="hero"><div class="eyebrow">MOREH DERECH EXAM · אתגר המבחן</div><h1>🎓 ${t('title')}</h1><p>${t('sub')}</p>
      <a class="btn tiyul" href="#/tiyul">🧑‍🏫 הפוך: אני אומר מה אני רוצה — האפליקציה מציעה מסלול</a>
      <div class="lvl"><div class="lvlt"><b>${t('level')} ${L.n} — ${esc(L.he)}</b><bdi dir="ltr">${S.xp}${L.to ? ' / ' + L.to : ''} XP</bdi></div><div class="lb"><i style="width:${L.pct}%"></i></div></div></section>
      <section class="daily"><div class="eyebrow">☀️ ${t('today')}</div><h2>${daily.emoji} ${esc(daily.he)}</h2><p>${esc(daily.brief)}</p>
        <div class="modes big"><a href="#/m/${daily.id}/guided">🧭 ${t('guided')}</a><a href="#/m/${daily.id}/errors">🔎 ${t('errors')}</a><a href="#/m/${daily.id}/exam">⏱️ ${t('exam')}</a></div></section>
      <h2 class="sec">🗺️ ${t('missions')} — ${esc(DATA.he)}</h2>
      <div id="homeMap"></div>
      <div class="mlist">${DATA.missions.map(card).join('')}</div>
      <div class="mlist soon">${['גליל עליון וחרמון', 'ירושלים', 'מדבר יהודה וים המלח', 'מישור החוף'].map(r => `<article class="mcard lock"><div class="me">🔒</div><div class="mt"><h3>${esc(r)}</h3><p>${t('soon')}</p></div></article>`).join('')}</div>
      <h2 class="sec">📈 ${t('progress')}</h2>
      <section class="panel"><h3>🎯 ${t('weak')}</h3>${rec ? `<p>הכי הרבה טעויות: <b>${esc(rec.he)}</b> (${rec.count}).</p>${rec.sets.length ? `<a class="btn" href="#/m/${daily.id}/errors/${rec.sets[0]}">🔎 תרגול ממוקד</a>` : ''}` : `<p class="muted">${t('noweak')}</p>`}
        ${catRows.length ? `<ul class="stats">${catRows.map(([k, v]) => `<li><span>${esc(C.CATS[k] || k)}</span><span class="sb"><i style="width:${Math.round(100 * v.ok / (v.ok + v.err))}%"></i></span><small>${v.ok}✔ ${v.err}✗</small></li>`).join('')}</ul>` : ''}</section>
      <section class="panel"><h3>🏅 ${t('badges')}</h3><div class="bdg">${Object.entries(BADGES).map(([k, b]) => `<div class="b ${S.badges.includes(k) ? 'on' : ''}" title="${esc(b[2])}"><span>${b[0]}</span><small>${esc(b[1])}</small></div>`).join('')}</div></section>
      <p class="foot">${t('indicative')}<br>📄 ${MODELS.models.school5.sources.map(s => `<a href="https://drive.google.com/open?id=${esc(s.id)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</p>`);
    mapBox($('#homeMap'), {});
  }

  function missionHead(m, mode) {
    const model = MODELS.models.school5;
    return `<section class="brief"><div class="eyebrow">${m.emoji} ${esc(DATA.he)} · ${esc(m.group)}</div><h1>${esc(m.he)}</h1><p>${esc(m.brief)} ${esc(model.day.he)}</p>
      <nav class="mtabs">${[['guided', '🧭', t('guided')], ['errors', '🔎', t('errors')], ['exam', '⏱️', t('exam')]].map(([k, i, l]) => `<a href="#/m/${m.id}/${k}" ${mode === k ? 'aria-current="page"' : ''}>${i} ${l}</a>`).join('')}</nav></section>`;
  }

  // ===== MODE 1 : entraînement guidé =====
  function viewGuided(m, step) {
    const D = S.drafts[m.id] || (S.drafts[m.id] = { picks: {}, plan: [], units: {}, long: {}, hint: {} });
    step = Math.max(1, Math.min(4, +step || 1));
    const steps = ['בחירת אתרים', 'לוח זמנים', 'יחידה קצרה', 'יחידה מורחבת'];
    shell(missionHead(m, 'guided') + `<ol class="stepper">${steps.map((s, i) => `<li class="${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}"><a href="#/m/${m.id}/guided/${i + 1}">${i + 1}. ${s}</a></li>`).join('')}</ol><div id="stepBody"></div>
      <div class="nav2">${step > 1 ? `<a class="btn ghost" href="#/m/${m.id}/guided/${step - 1}">${t('prev')}</a>` : '<span></span>'}${step < 4 ? `<a class="btn" href="#/m/${m.id}/guided/${step + 1}">${t('next')} ←</a>` : `<a class="btn" href="#/m/${m.id}/exam">⏱️ ${t('exam')}</a>`}</div>`, { back: '#/' });
    const body = $('#stepBody');
    if (step === 1) stepSites(m, D, body);
    if (step === 2) stepPlan(m, D, body);
    if (step === 3) stepShort(m, D, body);
    if (step === 4) stepLong(m, D, body);
  }
  const placeChoices = () => DATA.roads.map(r => r.id).concat(DATA.sites.map(s => s.id));

  function stepSites(m, D, body) {
    let active = null;
    const marks = () => { const o = {}; m.slots.forEach((s, i) => { if (D.picks[s.id] && P[D.picks[s.id]].type === 'site') o[D.picks[s.id]] = String(i + 1); }); if (D.picks.long) o[D.picks.long] = '★'; return o; };
    const draw = (res) => {
      const row = (sl, i, label) => {
        const r = res && res.find(x => x.slot === sl.id);
        return `<li class="slot ${active === sl.id ? 'act' : ''} ${r ? (r.ok ? 'ok' : 'bad') : ''}"><div class="sh"><b>${label}</b> ${esc(sl.he)}</div>
          <div class="sp"><select data-slot="${sl.id}" aria-label="${esc(sl.he)}"><option value="">— בחירה —</option>${placeChoices().map(id => `<option value="${id}" ${D.picks[sl.id] === id ? 'selected' : ''}>${esc(P[id].short)}${P[id].type === 'road' ? ' 🚌' : ''}</option>`).join('')}</select>
          <button type="button" class="pin" data-act="${sl.id}" aria-label="בחירה על המפה">📍</button></div>
          ${D.hint[sl.id] ? `<p class="hint">💡 ${esc(hintFor(sl, D.hint[sl.id]))}</p>` : ''}${r ? `<p class="fb">${r.ok ? '✔' : '✗'} ${esc(r.he)}</p>` : ''}
          <button type="button" class="mini" data-hint="${sl.id}">💡 ${t('hint')}${D.hint[sl.id] ? ' ' + D.hint[sl.id] + '/3' : ''}</button></li>`;
      };
      body.innerHTML = `<p class="lead">לכל יחידה בוחרים אתר מתאים. כל יחידה בנקודה אחרת, והמורחבת — באתר ״שלא נכלל ביחידות הקצרות״. אפשר ללחוץ 📍 ואז על נקודה במפה.</p>
        <div id="sMap"></div><ol class="slots">${m.slots.map((s, i) => row(s, i, (i + 1) + '.')).join('')}${row(Object.assign({ id: 'long' }, m.long), 0, '★')}</ol>
        <div class="acts"><button type="button" class="btn" id="chk">✔ ${t('check')}</button><button type="button" class="btn ghost" id="mdl">👀 ${t('model')}</button><button type="button" class="btn ghost" id="rst">↺ ${t('reset')}</button></div><div id="out"></div>`;
      mapBox($('#sMap', body), { mark: marks(), pick: active ? id => { D.picks[active] = id; active = null; save(); draw(); } : null });
      $$('select[data-slot]', body).forEach(sel => sel.addEventListener('change', () => { D.picks[sel.dataset.slot] = sel.value; save(); draw(); }));
      $$('[data-act]', body).forEach(b => b.addEventListener('click', () => { active = active === b.dataset.act ? null : b.dataset.act; draw(); toast(active ? 'לחצו על אתר במפה' : ''); }));
      $$('[data-hint]', body).forEach(b => b.addEventListener('click', () => { const k = b.dataset.hint; D.hint[k] = Math.min(3, (D.hint[k] || 0) + 1); save(); draw(res); }));
      $('#chk', body).addEventListener('click', () => {
        const r = C.checkSlots(m, D.picks, DATA);
        r.forEach(x => { noteSite(x.site, x.ok); if (x.ok) { award(`${m.id}:slot:${x.slot}`, 10); noteOk('site'); } else noteErr(x.cat); });
        if (r.every(x => x.ok)) { badge('first'); celebrate('✔ כל האתרים מתאימים!'); }
        draw(r);
      });
      $('#mdl', body).addEventListener('click', () => {
        $('#out', body).innerHTML = `<div class="panel"><h3>👀 ${t('model')}</h3><ol>${m.slots.map(s => `<li><b>${esc(P[s.best].short)}</b> — ${esc(s.why)}</li>`).join('')}<li>★ <b>${esc(P[m.long.best].short)}</b>${m.long.trap ? ' — ⚠️ ' + esc(m.long.trap) : ''}</li></ol></div>`;
      });
      $('#rst', body).addEventListener('click', () => { D.picks = {}; D.hint = {}; save(); draw(); });
    };
    draw();
  }
  function hintFor(sl, lvl) {
    const need = sl.need.map(n => ({ road: 'מקטע נסיעה (הדרכת דרך)', view: 'נקודת תצפית', yom_kippur: 'מלחמת יום הכיפורים', christianity: 'נצרות', hellenistic_roman: 'התקופה ההלניסטית-רומית', new_testament: 'הברית החדשה', city: 'עיר עתיקה', judaism: 'יהדות', geology: 'גאולוגיה', synagogue: 'בית כנסת עתיק' }[n] || n)).join(' / ');
    if (lvl === 1) return 'מה הנושא? ' + need + '.';
    const cands = Object.values(P).filter(p => C.fits(p, sl.need)).map(p => p.short);
    if (lvl === 2) return 'מועמדים: ' + cands.join(', ') + '.';
    return P[sl.best].short + ' — ' + (sl.why || sl.he);
  }

  // Une étape du programme = une carte : n°, heures en gros (début → fin · durée), quoi, logistique, site, poubelle.
  function planRow(r, i, sites) {
    const a = C.toMin(r.start), b = C.toMin(r.end), dur = a !== null && b !== null && b >= a ? (b - a) + ' דק׳' : '';
    return `<div class="pr" data-i="${i}">
      <div class="prh"><span class="prn">${i + 1}</span>${timeButton('start:' + i, r.start, 'שעת התחלה')}<span class="arr">←</span>${timeButton('end:' + i, r.end, 'שעת סיום')}<span class="dur">${dur}</span><button type="button" class="del" data-del="${i}" aria-label="מחיקה">🗑️</button></div>
      <input aria-label="פירוט המסלול" data-k="what" value="${esc(r.what)}" placeholder="מה עושים: נסיעה / הדרכה / ארוחה…">
      <input aria-label="תיאומים ומנהלות" data-k="log" value="${esc(r.log)}" placeholder="תיאומים ומנהלות: תשלום, שירותים, תיאום…">
      <select aria-label="אתר" data-k="site"><option value="">📍 אתר (אם זו הדרכה באתר)</option>${sites.map(s => `<option value="${s.id}" ${r.site === s.id ? 'selected' : ''}>${esc(s.short)}</option>`).join('')}</select></div>`;
  }
  // Infos pour construire le programme : sites choisis à l'étape 1 (heures, toilettes, parking) + trajets à vérifier.
  // Ordre des visites (modifiable avec ▲ ▼) : D.order, complété par les sites choisis à l'étape 1.
  function visitOrder(m, D) {
    const picked = [...new Set(m.slots.map(s => D.picks[s.id]).concat([D.picks.long]).filter(Boolean))].filter(id => P[id] && P[id].type === 'site');
    const kept = (D.order || []).filter(id => picked.includes(id));
    return kept.concat(picked.filter(id => !kept.includes(id)));
  }
  function planInfoHtml(m, D) {
    const sites = visitOrder(m, D);
    if (!sites.length) return '<p class="muted">בחרו אתרים בשלב 1 כדי לראות כאן שעות, שירותים וחניה.</p>';
    const start = (DATA.anchors || [])[0];
    const L = C.legs(sites, DATA, start);
    const last = P[sites[sites.length - 1]];
    const back = start ? { from: last, to: start, km: C.distanceKm(last, start), nav: C.navLinks(last, start) } : null;
    const leg = l => `<li><span>${esc(l.from.short || l.from.he)} ← ${esc(l.to.short || l.to.he)}</span><span>~${l.km} ק״מ אווירי · <a href="${l.nav.google}" target="_blank" rel="noopener">זמן ב-Google</a> · <a href="${l.nav.waze}" target="_blank" rel="noopener">Waze</a></span></li>`;
    return `<details class="panel info" open><summary><b>📋 מידע לתכנון — האתרים שבחרתם</b></summary>
      <div id="pMap"></div>
      <p class="muted">סדר הביקור: שנו עם החצים ▲ ▼ — המספרים על המפה והנסיעות מתעדכנים.</p>
      ${sites.map((id, i) => siteBlock(P[id], i + 1, { up: i > 0, down: i < sites.length - 1 })).join('')}
      <h4>🚌 נסיעות — לפי סדר הבחירה (אפשר לשנות בלוח)</h4><ul class="legs">${L.map(leg).join('')}${back ? leg(back) : ''}</ul>
      <p class="muted">המרחק הוא בקו אווירי בלבד. זמן נסיעה אמיתי בודקים ב-Google Maps / Waze (״נסיעה ללא פקקים״), ורושמים בלוח. במבחן אין אפליקציה — כדאי לזכור סדרי גודל.</p></details>`;
  }
  function stepPlan(m, D, body) {
    const model = MODELS.models.school5;
    if (!D.plan.length) D.plan = [{ start: model.day.start, end: '', what: 'מפגש ואיסוף: ' + ((DATA.anchors || [{}])[0].he || ''), log: 'לבדוק שכולם הגיעו' }];
    const draw = res => {
      body.innerHTML = `<p class="lead">${esc(model.day.he)} עמודת המשך מחושבת לבד. כל שורה מתחילה בשעת הסיום של הקודמת. זמני נסיעה — רק ממה שאתם יודעים; האפליקציה לא ממציאה אותם.</p>
        ${planInfoHtml(m, D)}
        <div class="plan">${D.plan.map((r, i) => planRow(r, i, DATA.sites)).join('')}</div>
        <div class="acts"><button type="button" class="btn ghost" id="add">➕ שורה</button><button type="button" class="btn" id="chk">✔ ${t('check')}</button><button type="button" class="btn ghost" id="hnt">💡 ${t('hint')}</button><button type="button" class="btn ghost" id="mdl">👀 דוגמה מהקורס</button><button type="button" class="btn ghost" id="rst">↺ ${t('reset')}</button></div>
        <div id="out">${res ? `<div class="panel"><h3>תוצאה: ${Math.round(res.frac * 100)}%</h3>${checklist(res, true)}</div>` : ''}</div>`;
      const setRow = (i, k, v) => { D.plan[i][k] = v; if (k === 'end' && D.plan[i + 1] && !D.plan[i + 1].start) D.plan[i + 1].start = v; save(); draw(res); };
      $$('.pr input, .pr select', body).forEach(inp => inp.addEventListener('change', () => setRow(+inp.closest('.pr').dataset.i, inp.dataset.k, inp.value.trim())));
      wireClocks(body, (key, v) => { const [k, i] = key.split(':'); setRow(+i, k, v); });
      const vo = visitOrder(m, D);
      if ($('#pMap', body)) mapBox($('#pMap', body), { mark: Object.fromEntries(vo.map((id, i) => [id, String(i + 1)])), onRoute: geo => {
        const lis = $$('.legs li', body); geo.legs.forEach((l, i) => { if (lis[i]) lis[i].insertAdjacentHTML('beforeend', `<span class="osrm">🛣️ ${l.km} ק״מ · ~${l.min} דק׳ <small>(OSRM/OpenStreetMap, ללא פקקים)</small></span>`); });
        const tot = $('.legs', body); if (tot) tot.insertAdjacentHTML('afterend', `<p class="muted osrm-tot">סה״כ נסיעה לפי OSRM: ${geo.km} ק״מ · ~${Math.floor(geo.min / 60)}:${String(geo.min % 60).padStart(2, '0')} שעות (הערכה ללא פקקים — לבדוק גם ב-Waze)</p>`);
      } });
      $$('[data-mv]', body).forEach(b => b.addEventListener('click', () => {
        const [id, d] = b.dataset.mv.split(':'), o = visitOrder(m, D), i = o.indexOf(id), j = i + (+d);
        if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; D.order = o; save(); draw(res);
        const el = $(`[data-mv="${id}:${d}"]`, body); if (el) el.scrollIntoView({ block: 'center' });
      }));
      $$('[data-del]', body).forEach(b => b.addEventListener('click', () => {
        const r = D.plan[+b.dataset.del];
        if ((r.what || r.log || r.site) && !confirm('למחוק את השורה ״' + (r.what || r.start) + '״?')) return;
        D.plan.splice(+b.dataset.del, 1);
        if (!D.plan.length) D.plan.push({ start: model.day.start, end: '', what: 'מפגש ואיסוף: ' + ((DATA.anchors || [{}])[0].he || ''), log: 'לבדוק שכולם הגיעו' });   // jamais de tableau vide
        save(); draw();
      }));
      $('#add', body).addEventListener('click', () => { const last = D.plan[D.plan.length - 1]; D.plan.push({ start: last ? last.end : '', end: '', what: '', log: '' }); save(); draw(); });
      $('#rst', body).addEventListener('click', () => { if (!confirm('למחוק את כל לוח הזמנים ולהתחיל מחדש?')) return; D.plan = []; save(); stepPlan(m, D, body); });
      $('#hnt', body).addEventListener('click', () => { $('#out', body).innerHTML = `<div class="panel"><h3>💡 שיעור 26 — כתיבת לו״ז</h3><ul class="tips">${MODELS.planRules.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${srcLink('lesson26')}</div>`; });
      $('#mdl', body).addEventListener('click', () => {
        $('#out', body).innerHTML = `<div class="panel"><h3>👀 דוגמה מהשיעור: ״מקורות הירקון״ (משפחות)</h3><p class="muted">זו דוגמת המרצה מהקורס, לא תשובה למשימה הזו — כדי לראות את הצורה.</p>
          <ul class="ex"><li>08:00 · מסוף אוטובוסים — איסוף · לבדוק שכולם הגיעו</li><li>08:00–08:30 · נסיעה לפארק לאומי מגדל צדק</li><li>08:30–10:00 · מגדל צדק — סיפור המקום ותצפית · תשלום כניסה, שירותים</li><li>…</li><li>12:30–13:30 · ארוחת צהריים — עצמית, אין מקורות אוכל במקום</li><li>…</li><li>17:30–18:00 · נסיעה לקניון — פיזור</li></ul>${srcLink('lesson26')}</div>`;
      });
      $('#chk', body).addEventListener('click', () => {
        const sites = Object.values(D.picks).filter(Boolean);
        const r = C.checkPlan(D.plan, { model, data: DATA, sites });
        r.items.forEach(x => x.ok ? noteOk(x.cat || 'time') : noteErr(x.cat));
        if (r.frac >= .8) { award(`${m.id}:plan`, 40); badge('clock'); }
        draw(r);
      });
    };
    draw();
  }

  function unitStep(m, D, body, kind) {
    const model = MODELS.models.school5, long = kind === 'long';
    const slotId = long ? 'long' : (D.cur || m.slots[0].id);
    const sl = long ? m.long : m.slots.find(s => s.id === slotId);
    const u = long ? D.long : (D.units[slotId] || (D.units[slotId] = {}));
    if (!u.site && D.picks[slotId]) u.site = D.picks[slotId];
    const draw = (res, extra) => {
      const modelFor = () => long ? DATA.models['long_' + u.site] : DATA.models[u.site];
      body.innerHTML = `${long ? '' : `<div class="unitsel">${m.slots.map((s, i) => `<button type="button" class="${s.id === slotId ? 'on' : ''}" data-u="${s.id}">${i + 1}</button>`).join('')}</div>`}
        <p class="lead"><b>${esc(sl.he)}</b>${!u.site ? ' — בחרו אתר (או חזרו לשלב 1).' : ''}</p><div id="ed"></div>
        <div class="acts"><button type="button" class="btn" id="chk">✔ ${t('check')}</button><button type="button" class="btn ghost" id="imp">✨ ${t('improve')}</button><button type="button" class="btn ghost" id="mdl">👀 ${t('model')}</button><button type="button" class="btn ghost" id="cmp">⚖️ ${t('compare')}</button><button type="button" class="btn ghost" id="rst">↺ ${t('reset')}</button></div>
        <div id="out">${res ? `<div class="panel"><h3>תוצאה: ${Math.round(res.frac * 100)}%</h3>${checklist(res, true)}</div>` : ''}${extra || ''}</div>`;
      editor($('#ed', body), u, { kind, siteChoices: placeChoices(), onChange: save });
      $$('[data-u]', body).forEach(b => b.addEventListener('click', () => { D.cur = b.dataset.u; save(); unitStep(m, D, body, kind); }));
      const ctx = () => ({ model, data: DATA, need: sl.need, shortSites: long ? m.slots.map(s => (D.units[s.id] || {}).site || D.picks[s.id]).filter(Boolean) : null });
      $('#chk', body).addEventListener('click', () => {
        const r = C.checkUnit(Object.assign({ kind }, u), ctx());
        r.items.forEach(x => x.ok ? (x.part && noteOk(x.part === 'fit' ? 'site' : x.part)) : noteErr(x.cat));
        noteSite(u.site, r.frac >= .85);
        if (r.frac >= .85) {
          award(`${m.id}:${slotId}:${u.site}`, long ? 50 : 30);
          if (long) badge('long'); else if (P[u.site] && P[u.site].type === 'road') badge('road');
          const n = C.wordCount(u.text); if (!long && n >= 170 && n <= 180) badge('w180');
        }
        draw(r);
      });
      $('#imp', body).addEventListener('click', () => { const r = C.checkUnit(Object.assign({ kind }, u), ctx()); draw(r, `<div class="panel"><h3>✨ ${t('improve')}</h3>${improveTips(r)}</div>`); });
      const modelHtml = mo => mo ? `<p class="meta">📍 ${esc(mo.place)} · ⏱️ ${mo.minutes} דק׳ · 🧰 ${esc(mo.method)}</p><div class="mtext">${esc(mo.text).replace(/\n\n/g, '</p><p>').replace(/^/, '<p>') + '</p>'}</div><p class="muted">${C.wordCount(mo.text)} מילים · תשובה לדוגמה שנכתבה מחומר הקורס — לא תשובה רשמית.${mo.limited ? ' ⚠️ החומר על האתר הזה חלקי (טרם אומת).' : ''}</p><div class="srcs">${(mo.src || []).map(k => srcLink(k)).join('')}</div>` : '<p class="muted">אין עדיין תשובה לדוגמה לאתר הזה במשימה הזו.</p>';
      $('#mdl', body).addEventListener('click', () => { draw(null, `<div class="panel"><h3>👀 ${t('model')}</h3>${modelHtml(modelFor())}</div>`); });
      $('#cmp', body).addEventListener('click', () => { draw(null, `<div class="cmp"><div class="panel"><h3>${t('mine')} (${C.wordCount(u.text)})</h3><div class="mtext"><p>${esc(u.text || '—').replace(/\n\n/g, '</p><p>')}</p></div></div><div class="panel"><h3>👀 ${t('model')}</h3>${modelHtml(modelFor())}</div></div>`); });
      $('#rst', body).addEventListener('click', () => { Object.keys(u).forEach(k => { if (k !== 'site') delete u[k]; }); save(); draw(); });
    };
    draw();
  }
  const stepShort = (m, D, body) => unitStep(m, D, body, 'short');
  const stepLong = (m, D, body) => unitStep(m, D, body, 'long');

  // ===== MODE 2 : trouve les erreurs =====
  function viewErrors(m, setId) {
    const sets = DATA.errorSets;
    const set = sets.find(s => s.id === setId) || sets[0];
    const picks = {};
    shell(missionHead(m, 'errors') + `<div class="esets">${sets.map(s => `<a href="#/m/${m.id}/errors/${s.id}" class="${s.id === set.id ? 'on' : ''}">${esc(s.he)}</a>`).join('')}</div>
      <p class="lead">${set.plan ? 'לוח זמנים עם בעיות.' : 'קטע הדרכה עם טעויות.'} לחצו על כל שורה שגויה, ובחרו את סוג הטעות. אחר כך — בדיקה.</p>
      <ol class="eitems">${set.items.map((it, i) => `<li data-i="${i}"><button type="button" class="eit">${esc(it.he)}</button><div class="ecat" hidden>${['period', 'geo', 'chronology', 'orientation', 'time', 'visibility', 'site'].map(c => `<button type="button" data-c="${c}">${esc(C.CATS[c])}</button>`).join('')}</div><div class="eres"></div></li>`).join('')}</ol>
      <div class="acts"><button type="button" class="btn" id="chk">✔ ${t('check')}</button><a class="btn ghost" href="#/m/${m.id}/errors/${set.id}?r=${Date.now()}">↺ ${t('reset')}</a></div><div id="out"></div>`, { back: '#/' });
    $$('.eitems li').forEach(li => {
      const i = +li.dataset.i;
      $('.eit', li).addEventListener('click', () => { if (picks[i]) { delete picks[i]; li.classList.remove('mk'); $('.ecat', li).hidden = true; } else { picks[i] = true; li.classList.add('mk'); $('.ecat', li).hidden = false; } });
      $$('[data-c]', li).forEach(b => b.addEventListener('click', () => { picks[i] = b.dataset.c; $$('[data-c]', li).forEach(x => x.classList.toggle('on', x === b)); }));
    });
    $('#chk').addEventListener('click', () => {
      const g = C.gradeErrors(set, picks);
      let found = 0, missed = 0, fals = 0;
      g.forEach(r => {
        const it = set.items[r.i], li = $(`.eitems li[data-i="${r.i}"]`);
        li.classList.add('r-' + r.result);
        const lab = { found: '✔ נמצאה', missed: '✗ פספוס', false: '✗ זה דווקא נכון', clean: '' }[r.result];
        $('.eres', li).innerHTML = lab ? `<p><b>${lab}</b>${r.catOk === false ? ' · סוג הטעות: ' + esc(C.CATS[it.cat]) : ''}${it.fix ? ' — ' + esc(it.fix) : ''} ${srcLink(it.src, 'מקור')}</p>` : '';
        if (r.result === 'found') { found++; noteOk(it.cat); } if (r.result === 'missed') { missed++; noteErr(it.cat); } if (r.result === 'false') fals++;
      });
      S.found = (S.found || 0) + found; save();
      award(`${set.id}:${found}:${missed}:${fals}`, found * 5);
      if (S.found >= 10) badge('hunter');
      $('#out').innerHTML = `<div class="panel"><h3>${found} נמצאו · ${missed} פוספסו · ${fals} סומנו בטעות</h3>${missed === 0 && fals === 0 ? '<p class="good">🎉 מושלם!</p>' : '<p>אפשר לנסות שוב, או לעבור לסט אחר.</p>'}</div>`;
      if (missed === 0 && fals === 0) celebrate('🔎 מושלם!');
    });
  }

  // ===== MODE 3 : examen blanc =====
  let tick = null;
  function viewExam(m) {
    const E = S.exams[m.id];
    if (!E || E.done) return examSetup(m, E);
    const model = MODELS.models[E.model], slots = C.examSlots(m, model);
    const left = () => Math.max(0, E.startedAt + E.minutes * 60000 - Date.now());
    const tabs = [['plan', 'תוכנית']].concat(slots.map((s, i) => ['u' + s.id, String(i + 1)])).concat([['long', 'מורחבת']]);
    const cur = E.tab || 'plan';
    shell(`<section class="brief exam"><div class="timer" id="tmr" aria-live="off"><span class="hg">⏳</span><b id="tm"></b></div><h1>⏱️ ${esc(m.he)}</h1><p>${esc(m.brief)} ${esc(model.day.he)}</p><p class="muted">${esc(model.he)} · ללא עזרה</p>
      <nav class="xtabs">${tabs.map(([k, l]) => `<button type="button" data-t="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</nav></section><div id="xb"></div>
      <div class="acts"><button type="button" class="btn" id="sub">📝 ${t('submit')}</button></div>`, { back: '#/' });
    const body = $('#xb');
    const showT = () => { const ms = left(), mm = Math.floor(ms / 60000), ss = Math.floor(ms / 1000) % 60; $('#tm').textContent = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; $('#tmr').classList.toggle('low', ms < 10 * 60000); if (!ms) submit(true); };
    clearInterval(tick); tick = setInterval(() => { if (!document.getElementById('tm')) return clearInterval(tick); showT(); }, 1000); showT();
    $$('[data-t]').forEach(b => b.addEventListener('click', () => { E.tab = b.dataset.t; save(); viewExam(m); }));
    if (cur === 'plan') {
      const D = { picks: {}, plan: E.plan };
      // éditeur de programme sans aide
      const draw = () => {
        body.innerHTML = `<div class="plan">${E.plan.map((r, i) => planRow(r, i, DATA.sites)).join('')}</div><div class="acts"><button type="button" class="btn ghost" id="add">➕ שורה</button></div>`;
        const setRow = (i, k, v) => { E.plan[i][k] = v; if (k === 'end' && E.plan[i + 1] && !E.plan[i + 1].start) E.plan[i + 1].start = v; save(); draw(); };
        $$('.pr input, .pr select', body).forEach(inp => inp.addEventListener('change', () => setRow(+inp.closest('.pr').dataset.i, inp.dataset.k, inp.value.trim())));
        wireClocks(body, (key, v) => { const [k, i] = key.split(':'); setRow(+i, k, v); });
        $$('[data-del]', body).forEach(b => b.addEventListener('click', () => { E.plan.splice(+b.dataset.del, 1); if (!E.plan.length) E.plan.push({ start: model.day.start, end: '', what: '', log: '' }); save(); draw(); }));
        $('#add', body).addEventListener('click', () => { const last = E.plan[E.plan.length - 1]; E.plan.push({ start: last ? last.end : '', end: '', what: '', log: '' }); save(); draw(); });
      };
      if (!E.plan.length) E.plan.push({ start: '08:00', end: '', what: '', log: '' });
      draw(); void D;
    } else if (cur === 'long') {
      body.innerHTML = `<p class="lead"><b>${esc(m.long.he)}</b></p><div id="ed"></div>`;
      editor($('#ed', body), E.long, { kind: 'long', siteChoices: DATA.sites.map(s => s.id), onChange: save });
    } else {
      const s = slots.find(x => 'u' + x.id === cur), u = E.units[s.id] || (E.units[s.id] = {});
      body.innerHTML = `<p class="lead"><b>${esc(s.he)}</b></p><div id="ed"></div>`;
      editor($('#ed', body), u, { kind: 'short', siteChoices: placeChoices(), onChange: save });
    }
    $('#sub').addEventListener('click', () => submit(false));
    function submit(auto) {
      if (!auto && !confirm('להגיש את המבחן?')) return;
      clearInterval(tick);
      const res = C.scoreExam(E, model, m, DATA);
      E.done = true; E.result = res; E.finishedAt = Date.now(); save();
      res.parts.forEach(p => p.res.items.forEach(x => { if (!x.ok) noteErr(x.cat); }));
      S.history.push({ m: m.id, at: E.finishedAt, pct: res.pct }); save();
      gain(Math.max(10, res.pct)); badge('examdone'); if (res.pct >= 80) badge('exam');
      if (auto) toast('⏰ הזמן נגמר — המבחן הוגש');
      location.hash = `#/m/${m.id}/result`;
    }
  }
  function examSetup(m, prev) {
    shell(missionHead(m, 'exam') + `<section class="panel"><h3>⏱️ ${t('exam')}</h3><p>תוכנית יום, יחידות קצרות ויחידה מורחבת. בלי רמזים ובלי תשובות לדוגמה. בסוף — תיקון מפורט, ציון ומקורות.</p>
      <label class="fl">מודל<select id="mdlSel">${Object.entries(MODELS.models).map(([k, v]) => `<option value="${k}" ${k === MODELS.default ? 'selected' : ''}>${esc(v.he)}</option>`).join('')}</select></label>
      <label class="fl">זמן<select id="durSel"><option value="180">3 שעות — כמו במבחן</option><option value="90">90 דקות — תרגול</option><option value="45">45 דקות — קצר</option></select></label>
      <p class="muted">${t('indicative')}</p><div class="acts"><button type="button" class="btn" id="go">▶ ${t('start')}</button>${prev && prev.done ? `<a class="btn ghost" href="#/m/${m.id}/result">📊 התוצאה הקודמת</a>` : ''}</div></section>`, { back: '#/' });
    $('#go').addEventListener('click', () => {
      S.exams[m.id] = { model: $('#mdlSel').value, minutes: +$('#durSel').value, startedAt: Date.now(), plan: [], units: {}, long: {}, tab: 'plan' }; save();
      viewExam(m);
    });
  }
  function viewResult(m) {
    const E = S.exams[m.id];
    if (!E || !E.result) { location.hash = `#/m/${m.id}/exam`; return; }
    const r = E.result, model = MODELS.models[E.model];
    const slots = C.examSlots(m, model);
    const modelFor = p => p.id === 'long' ? DATA.models['long_' + m.long.best] : p.slot ? DATA.models[(m.slots.find(s => s.id === p.slot) || {}).best] : null;
    shell(missionHead(m, 'exam') + `<section class="score"><div class="big"><bdi dir="ltr">${r.total ? `${r.got} / ${r.max}` : `${r.pct}%`}</bdi></div><p>${r.total ? r.pct + '% · ' : ''}${esc(model.he)}</p><p class="muted">⚠️ ${t('indicative')}${model.pointsNote ? ' ' + esc(model.pointsNote) : ''}</p></section>
      ${r.parts.map(p => { const mo = modelFor(p); return `<details class="panel part"><summary><b>${esc(p.he)}</b><bdi dir="ltr">${p.got} / ${p.max}</bdi></summary>${checklist(p.res, true)}${mo ? `<details class="mo"><summary>👀 ${t('model')}</summary><p class="meta">📍 ${esc(mo.place)} · 🧰 ${esc(mo.method)}</p><div class="mtext"><p>${esc(mo.text).replace(/\n\n/g, '</p><p>')}</p></div><div class="srcs">${(mo.src || []).map(k => srcLink(k)).join('')}</div></details>` : ''}</details>`; }).join('')}
      <div class="acts"><button type="button" class="btn" id="again">↺ סימולציה חדשה</button><a class="btn ghost" href="#/m/${m.id}/guided">🧭 ${t('guided')}</a></div>
      <p class="foot">${t('sources')}: ${MODELS.models.school5.sources.map(s => `<a href="https://drive.google.com/open?id=${esc(s.id)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</p>`, { back: '#/' });
    $('#again').addEventListener('click', () => { delete S.exams[m.id]; save(); location.hash = `#/m/${m.id}/exam`; viewExam(m); });
    void slots;
  }

  // ===== « À l'envers » : planificateur de tiyul =====
  function viewTiyul() {
    const F = S.tiyul || (S.tiyul = { group: '', tags: [], count: 4, road: true, startTime: '08:00', endTime: '18:00' });
    const tagKeys = Object.keys(TAGS).filter(k => k === 'road' || DATA.sites.some(s => (s.tags || []).includes(k)));
    shell(`<section class="brief"><div class="eyebrow">🧑‍🏫 ${esc(DATA.he)}</div><h1>תכנון טיול — הפוך</h1><p>אתם מורי הדרך: כתבו מה הקבוצה רוצה, והאפליקציה מציעה מסלולים מהאתרים שנלמדו, עם לוח זמנים ראשוני, מה לברר, ויחידות הדרכה מוכנות לתרגול.</p></section>
      <section class="panel"><label class="fl">הקבוצה (חופשי)<input id="tGroup" value="${esc(F.group)}" placeholder="למשל: משפחות עם ילדים, 40 איש, אוטובוס"></label>
      <p class="fl"><b>מה רוצים לראות?</b></p><div class="tagpick">${tagKeys.map(k => `<button type="button" data-tag="${k}" class="${F.tags.includes(k) ? 'on' : ''}" aria-pressed="${F.tags.includes(k)}">${TAGS[k]}</button>`).join('')}</div>
      <div class="row3"><label class="fl">כמה אתרים<select id="tCount">${[2, 3, 4, 5].map(n => `<option value="${n}" ${F.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="fl">התחלה${timeButton('startTime', F.startTime, 'שעת התחלה')}</div><div class="fl">סיום${timeButton('endTime', F.endTime, 'שעת סיום')}</div></div>
      <p class="muted">יציאה וחזרה: ${esc((DATA.anchors || [{}])[0].he || '')}. זמני נסיעה לא מומצאים — בלוח יש שורות נסיעה ריקות לבדיקה ב-Waze.</p>
      <div class="acts"><button type="button" class="btn" id="tGo">✨ להציע מסלולים</button></div></section><div id="tOut"></div>`, { back: '#/' });
    wireClocks(app, (k, v, b) => { F[k] = v || (k === 'startTime' ? '08:00' : '18:00'); b.dataset.v = F[k]; b.textContent = F[k]; save(); });
    $$('[data-tag]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.tag; if (k === 'road') { F.road = !F.road; } F.tags = F.tags.includes(k) ? F.tags.filter(x => x !== k) : F.tags.concat(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); save(); }));
    $('#tGo').addEventListener('click', () => {
      F.group = $('#tGroup').value.trim(); F.count = +$('#tCount').value; F.road = F.tags.includes('road'); save();
      const res = C.suggest({ tags: F.tags.filter(t => t !== 'road'), count: F.count, road: F.road, start: (DATA.anchors || [])[0], startTime: F.startTime, endTime: F.endTime }, DATA);
      $('#tOut').innerHTML = res.length ? res.map((r, i) => `<article class="panel prop"><h3>הצעה ${i + 1}: ${r.sites.map(s => esc(s.short)).join(' ← ')}</h3>
        <p class="muted">🚌 ~${r.km} ק״מ אווירי בין התחנות${r.roads.length ? ' · הדרכת דרך: ' + r.roads.map(x => esc(x.short)).join(', ') : ''}</p>
        ${r.missing.length ? `<p class="conf">⚠️ לא נמצא אתר ל: ${r.missing.map(t => esc(TAGS[t] || t)).join(', ')}</p>` : '<p class="good">✔ כל מה שביקשתם מכוסה</p>'}
        ${r.warnings.map(w => `<p class="conf">ℹ️ ${esc(w)}</p>`).join('')}
        <ul class="legs">${r.legs.map(l => `<li><span>${esc(l.from.short || l.from.he)} ← ${esc(l.to.short || l.to.he)}</span><span>~${l.km} ק״מ · <a href="${l.nav.google}" target="_blank" rel="noopener">זמן ב-Google</a></span></li>`).join('')}</ul>
        <details class="mo"><summary>📋 לוח זמנים ראשוני (${r.plan.length} שורות) ומה לברר</summary><ul class="ex">${r.plan.map(p => `<li><b>${esc(p.start || '…')}${p.end ? '–' + esc(p.end) : ''}</b> ${esc(p.what)}${p.log ? ' · <i>' + esc(p.log) + '</i>' : ''}</li>`).join('')}</ul></details>
        <details class="mo"><summary>🧾 לוגיסטיקה של כל אתר</summary>${r.sites.map((s, j) => siteBlock(s, j + 1)).join('')}</details>
        <p class="muted">🎤 יחידות לתרגול: ${r.units.map(u => `${esc(P[u.site].short)} ${u.model ? '✔' : '—'}${u.long ? ' (גם מורחבת)' : ''}`).join(' · ')}</p>
        <div class="acts"><button type="button" class="btn" data-open="${i}">🧭 לפתוח כמשימה ולתרגל</button></div></article>`).join('') : '<p class="panel">לא נמצאו אתרים מתאימים — בחרו פחות נושאים.</p>';
      $$('[data-open]').forEach(b => b.addEventListener('click', () => {
        const r = res[+b.dataset.open];
        const slots = (r.roads[0] ? [{ id: 'r', he: 'יחידת הדרכת דרך: ' + r.roads[0].short, need: ['road'], best: r.roads[0].id, why: '' }] : []).concat(r.sites.map((s, i) => ({ id: 's' + i, he: 'יחידה ב' + s.short, need: s.tags, best: s.id, why: '' })));
        const longSite = r.sites.find(s => DATA.models['long_' + s.id]) || r.sites[r.sites.length - 1];
        const shortSlots = slots.filter(s => s.best !== longSite.id);
        S.custom = { id: 'custom', he: 'הטיול שלי: ' + r.sites.map(s => s.short).join(' ← '), emoji: '🧑‍🏫', level: 1, group: F.group || 'הקבוצה שלי', brief: `${F.group ? F.group + '. ' : ''}יום טיול בדרום רמת הגולן לפי הבחירה שלכם. יציאה וחזרה: ${(DATA.anchors || [{}])[0].he || ''}.`, slots: shortSlots, long: { he: 'יחידת הדרכה מורחבת: ' + longSite.he, need: longSite.tags, best: longSite.id } };
        const picks = {}; shortSlots.forEach(s => { picks[s.id] = s.best; }); picks.long = longSite.id;
        S.drafts.custom = { picks, plan: r.plan.map(p => Object.assign({}, p)), units: {}, long: {}, hint: {} }; save();
        location.hash = '#/m/custom/guided/1';
      }));
      window.scrollTo(0, $('#tOut').offsetTop - 10);
    });
  }

  // ---------- Routeur ----------
  function route() {
    const h = location.hash.replace(/\?.*$/, ''), p = h.split('/');
    if (p[1] === 'tiyul') return viewTiyul();
    if (p[1] === 'm') {
      const m = DATA.missions.find(x => x.id === p[2]) || (p[2] === 'custom' && S.custom) || null;
      if (!m) return viewHome();
      if (m.level > 1 && C.level(S.xp).n < 2 && !/[?&]all\b/.test(location.search)) { toast('🔒 ' + t('locked')); return viewHome(); }
      if (p[3] === 'errors') return viewErrors(m, p[4]);
      if (p[3] === 'exam') return viewExam(m);
      if (p[3] === 'result') return viewResult(m);
      return viewGuided(m, p[4]);
    }
    viewHome();
  }
  window.addEventListener('hashchange', route);
  Promise.all([fetch('exam/models.json').then(r => r.json()), fetch('exam/golan-south.json').then(r => r.json())]).then(([mo, d]) => {
    MODELS = mo; DATA = d; P = C.places(d);
    document.documentElement.lang = 'he';
    route();
  }).catch(() => { app.innerHTML = '<p class="panel">לא ניתן לטעון את התוכן. בדקו את החיבור ונסו שוב.</p>'; });
  window.MDExamApp = { state: () => S };
})();
