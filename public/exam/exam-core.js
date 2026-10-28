// מורה דרך EXAM — logique pure (sans DOM) : comptage de mots, contrôles, score indicatif, progression.
// Chargé dans le navigateur (window.MDExamCore) et dans les tests Node (module.exports).
// Toutes les règles viennent des documents du cours (models.json / golan-south.json) ; aucun מחוון officiel n'existe :
// le score est une ÉVALUATION PÉDAGOGIQUE INDICATIVE.
(function (root) {
  'use strict';

  // Comme le compteur du cahier d'examen (Excel : espaces + 1 après TRIM) : des mots séparés par des blancs.
  function wordCount(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }
  // Couleur du cahier : jaune sous le seuil vert, vert jusqu'à la limite, rouge au-delà.
  function wordState(n, kind, limits) {
    const max = kind === 'long' ? limits.longWords : kind === 'method' ? limits.methodWords : limits.shortWords;
    const green = kind === 'long' ? limits.longGreenFrom : kind === 'method' ? 1 : limits.shortGreenFrom;
    if (n > max) return { state: 'over', max };
    if (n >= green) return { state: 'ok', max };
    return { state: 'low', max };
  }

  const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  function places(data) {
    const all = {};
    (data.sites || []).forEach(s => { all[s.id] = Object.assign({ type: 'site' }, s); });
    (data.roads || []).forEach(r => { all[r.id] = Object.assign({ type: 'road' }, r); });
    return all;
  }

  // ---------- Choix des lieux ----------
  function fits(place, need) { return !!place && (need || []).some(t => (place.tags || []).includes(t)); }
  function checkSlots(mission, picks, data) {
    const P = places(data), res = [], used = {};
    mission.slots.forEach(sl => {
      const id = picks[sl.id], p = P[id];
      const r = { slot: sl.id, site: id || null, ok: false, cat: null, he: '' };
      if (!id) { r.he = 'לא נבחר אתר'; r.cat = 'site'; }
      else if (!fits(p, sl.need)) { r.he = `${p.short} לא מתאים לדרישה: ״${sl.he}״`; r.cat = 'site'; }
      else if (used[id]) { r.he = `${p.short} כבר נבחר ליחידה אחרת — כל יחידה בנקודה אחרת`; r.cat = 'site'; }
      else { r.ok = true; r.he = sl.why || 'מתאים'; }
      if (id) used[id] = true;
      res.push(r);
    });
    const L = picks.long, lp = P[L];
    const lr = { slot: 'long', site: L || null, ok: false, cat: null, he: '' };
    if (!L) { lr.he = 'לא נבחר אתר ליחידה המורחבת'; lr.cat = 'site'; }
    else if (!fits(lp, mission.long.need)) { lr.he = `${lp.short} לא מתאים: ״${mission.long.he}״`; lr.cat = 'site'; }
    else if (used[L]) { lr.he = 'היחידה המורחבת חייבת להיות באתר ״שלא נכלל ביחידות הקצרות״'; lr.cat = 'site'; }
    else { lr.ok = true; lr.he = mission.long.trap ? '✔ — ' + mission.long.trap : 'מתאים'; }
    res.push(lr);
    return res;
  }

  // ---------- Programme (לוח זמנים) ----------
  function checkPlan(rows, ctx) {
    const day = ctx.model.day, items = [];
    const add = (ok, he, cat, w) => items.push({ ok: !!ok, he, cat: ok ? null : (cat || 'time'), w: w || 1 });
    const R = (rows || []).filter(r => (r.start || r.end || r.what || '').trim && (String(r.start || '') + String(r.end || '') + String(r.what || '')).trim());
    if (!R.length) { add(false, 'לוח הזמנים ריק', 'time', 4); return finish(items); }
    if (R.length < 4) add(false, `לוח זמנים חלקי (${R.length} שורות) — יום שלם כולל נסיעות, אתרים, ארוחה ופיזור`, 'time', 10);
    const partial = Math.min(1, R.length / 4);
    const s0 = toMin(R[0].start), eN = toMin(R[R.length - 1].end || R[R.length - 1].start);
    add(s0 === toMin(day.start), `תחילת היום ב-${day.start}` + (s0 !== null && s0 !== toMin(day.start) ? ` (כתוב ${R[0].start})` : ''), 'time', 2);
    add(eN !== null && eN <= toMin(day.end), `סיום עד ${day.end}`, 'time', 2);
    let cont = true, valid = true;
    R.forEach((r, i) => {
      const a = toMin(r.start), b = toMin(r.end);
      if (a === null || (r.end && b === null) || (b !== null && b < a)) valid = false;
      if (i && toMin(R[i - 1].end) !== null && a !== null && a !== toMin(R[i - 1].end)) cont = false;
    });
    add(valid, 'כל שורה: שעת התחלה ושעת סיום תקינות (שעת הסיום אחרי ההתחלה)', 'time', 2);
    add(cont, 'כל שורה מתחילה בשעת הסיום של הקודמת — בלי חורים ובלי חפיפות', 'time', 2);
    add(/מפגש|איסוף|נקודת יציאה/.test(R[0].what || ''), 'נקודת מפגש בשורה הראשונה', 'time', 1);
    add(/פיזור/.test((R[R.length - 1].what || '') + (R[R.length - 1].log || '')), 'נקודת פיזור בשורה האחרונה', 'time', 1);
    add(R.some(r => /נסיעה/.test(r.what || '')), 'הנסיעות מופיעות בלוח הזמנים', 'route', 1);
    // Déjeuner (règle du guide) : 1 h, pas avant 12:00, pas après 14:00.
    const lunch = R.find(r => /צהר|ארוחה/.test((r.what || '') + (r.log || '')));
    add(!!lunch, 'ארוחת צהריים בלוח הזמנים', 'time', 2);
    if (lunch) {
      const a = toMin(lunch.start), b = toMin(lunch.end);
      add(a !== null && b !== null && b - a === 60, `ארוחת צהריים: שעה אחת בדיוק${a !== null && b !== null ? ` (כתוב ${b - a} דק׳)` : ''}`, 'time', 2);
      add(a !== null && a >= toMin('12:00') && b !== null && b <= toMin('14:00'), 'ארוחת צהריים בין 12:00 ל-14:00 (לא מתחילה לפני 12:00, לא מסתיימת אחרי 14:00)', 'time', 2);
    }
    const siteRows = R.filter(r => r.site);
    add(siteRows.length && siteRows.every(r => (r.log || '').trim().length > 2), 'עמודת ״תיאומים ומנהלות״ מלאה בשורות האתרים (תשלום, שירותים, תיאום)', 'logistics', 2);
    const want = ctx.sites || [];
    const P = places(ctx.data);
    want.filter(id => P[id] && P[id].type === 'site').forEach(id => {
      add(R.some(r => r.site === id), `${P[id].short} — מופיע בלוח הזמנים`, 'route', 1);
    });
    // heures d'ouverture connues (documents du cours)
    R.forEach(r => {
      const p = P[r.site]; if (!p || !p.hours) return;
      const h = (p.hours[day.season] || {})[day.weekday]; if (!h) return;
      const a = toMin(r.start), b = toMin(r.end);
      if (a === null || b === null) return;
      add(a >= toMin(h[0]) && b <= toMin(h[1]), `${p.short}: בתוך שעות הפתיחה (${h[0]}–${h[1]})`, 'time', 2);
    });
    const res = finish(items);
    res.frac = Math.round(res.frac * partial * 1000) / 1000;   // 1 ou 2 lignes ne valent pas un programme
    return res;
  }

  // ---------- Intervention (courte / développée) ----------
  function findPitfalls(text, placeId, data) {
    const out = [], P = places(data), p = P[placeId];
    const scope = p && p.type === 'road' ? 'road' : placeId;
    // On découpe en phrases pour tester les négations (« לא », « אינו ») dans la même phrase.
    const sentences = String(text || '').split(/(?<=[.!?״])\s+|\n+/);
    (data.pitfalls || []).forEach(pf => {
      if (pf.site !== '*' && pf.site !== scope) return;
      const re = new RegExp(pf.re);
      sentences.forEach(s => {
        const m = re.exec(s); if (!m) return;
        if (pf.unless && new RegExp(pf.unless).test(s)) return;
        if (pf.badUnless && m[1] && m[1] === pf.badUnless) return;
        if (!out.some(o => o.he === pf.he)) out.push({ he: pf.he, cat: pf.cat, src: pf.src, quote: s.trim().slice(0, 90) });
      });
    });
    return out;
  }

  function checkUnit(u, ctx) {
    const lim = ctx.model.limits, long = u.kind === 'long', items = [];
    const add = (ok, he, cat, part) => items.push({ ok: !!ok, he, cat: ok ? null : cat, part });
    const P = places(ctx.data), p = P[u.site];
    // 1. lieu
    if (ctx.need) add(fits(p, ctx.need), p ? `${p.short} מתאים לדרישת היחידה` : 'נבחר אתר', 'site', 'fit');
    if (long && ctx.shortSites) add(p && !ctx.shortSites.includes(u.site), 'האתר לא נכלל ביחידות הקצרות', 'site', 'fit');
    // 2. champs du formulaire
    add(wordCount(u.place) >= 3, long ? 'מיקום מדויק (היכן המדריך והיכן המודרכים)' : 'הנקודה: היכן המדריך והיכן המודרכים', 'fields', 'fields');
    add(+u.minutes > 0, 'משך ההדרכה', 'fields', 'fields');
    const mw = wordCount(u.method);
    add(mw > 0 && mw <= lim.methodWords, `אמצעי הדרכה (עד ${lim.methodWords} מילים — כתוב ${mw})`, 'fields', 'fields');
    if (long) add(wordCount(u.topic) > 0, 'הנושא', 'fields', 'fields');
    // 3. longueur
    const n = wordCount(u.text), ws = wordState(n, long ? 'long' : 'short', lim);
    add(n >= (long ? 150 : 60), `אורך מספיק (${n} מילים)`, 'words', 'words');
    add(ws.state !== 'over', `עד ${ws.max} מילים` + (ws.state === 'over' ? ` — חריגה של ${n - ws.max}: ״${ctx.model.overflowRule || 'יש לקצר'}״` : ''), 'words', 'words');
    // 4. structure (שיעור 23 + טופס 180)
    const t = String(u.text || ''), first = t.split(/[.!?]/)[0] || '', paras = t.split(/\n\s*\n/).filter(x => x.trim());
    const last = (t.trim().split(/(?<=[.!?])\s+/).pop() || '');
    const isRoad = p && p.type === 'road';
    add(/אנחנו|הגענו|עומדים|ברוכים|שלום|בוקר טוב|יצאנו|נמצאים/.test(first), 'פתיחה: איפה אנחנו ומה המקום (מי, מה, למה)', 'structure', 'structure');
    add(/הביטו|שימו לב|מולנו|לפנינו|מימינ|משמאל|רואים|מתחתינו|סביבנו|תסתכלו/.test(t), 'תיאור של מה שרואים', 'structure', 'structure');
    add(/לסיכום|נמשיך|ניכנס|נעבור|נצא|נרד|נלך|נעלה|בהמשך|עוד מעט|עכשיו נ/.test(last + ' ' + (long ? paras.slice(-1)[0] || '' : last)), 'סיום / מעבר לנקודה הבאה', 'structure', 'structure');
    if (isRoad) add(/אני /.test(first + t.slice(0, 120)), 'הדרכת דרך: להציג את עצמכם ואת המקטע', 'structure', 'structure');
    if (long) {
      add(paras.length >= 3, `שלושה חלקים: פתיחה, מה רואים, סיכום (${paras.length} פסקאות)`, 'structure', 'structure');
      add(/נעבור|נמשיך|נצא|ניכנס|נרד|נלך|בואו/.test(t), 'מוליכים את המודרכים בין 2–3 נקודות באתר', 'structure', 'structure');
    }
    // 5. faits
    const pf = findPitfalls(t + ' ' + (u.method || ''), u.site, ctx.data);
    if (pf.length) pf.forEach(x => add(false, 'בדיקת עובדות: ' + x.he, x.cat, 'facts'));
    else add(true, 'לא נמצאו טעויות עובדתיות מוכרות (בדיקה אוטומטית חלקית)', null, 'facts');
    const res = finish(items, { fit: .25, fields: .25, words: .2, structure: .15, facts: .15 });
    if (!n) res.frac = 0;                 // rien d'écrit : aucun point, même si d'autres champs sont remplis
    return res;
  }

  // fraction pondérée par « parties » (chaque partie = moyenne de ses contrôles)
  function finish(items, weights) {
    let frac;
    if (weights) {
      let s = 0, wsum = 0;
      Object.keys(weights).forEach(k => {
        const its = items.filter(i => i.part === k); if (!its.length) return;
        s += weights[k] * its.filter(i => i.ok).length / its.length; wsum += weights[k];
      });
      frac = wsum ? s / wsum : 0;
    } else {
      const tot = items.reduce((a, i) => a + (i.w || 1), 0);
      frac = tot ? items.reduce((a, i) => a + (i.ok ? (i.w || 1) : 0), 0) / tot : 0;
    }
    return { items, frac: Math.round(frac * 1000) / 1000 };
  }

  // ---------- Score d'un examen blanc ----------
  function scoreExam(ans, model, mission, data) {
    const slots = examSlots(mission, model);
    const parts = [];
    const shortSites = slots.map(s => (ans.units[s.id] || {}).site).filter(Boolean);
    const planPart = model.parts.find(p => p.id === 'plan'), shortPart = model.parts.find(p => p.id === 'short'), longPart = model.parts.find(p => p.id === 'long');
    const eq = model.total ? null : 100 / (2 + slots.length);       // modèle sans barème publié : poids égaux, en %
    const plan = checkPlan(ans.plan, { model, data, sites: shortSites.concat(ans.long && ans.long.site ? [ans.long.site] : []) });
    parts.push({ id: 'plan', he: 'תוכנית יום הטיול', max: planPart.points || eq, got: (planPart.points || eq) * plan.frac, res: plan });
    slots.forEach((s, i) => {
      const u = Object.assign({ kind: 'short' }, ans.units[s.id] || {});
      const r = checkUnit(u, { model, data, need: s.need });
      const max = shortPart.pointsEach || eq;
      parts.push({ id: 'u' + s.id, he: `יחידה קצרה ${i + 1}: ${s.he}`, max, got: max * r.frac, res: r, slot: s.id });
    });
    const lu = Object.assign({ kind: 'long' }, ans.long || {});
    const lr = checkUnit(lu, { model, data, need: mission.long.need, shortSites });
    parts.push({ id: 'long', he: 'יחידת הדרכה מורחבת', max: longPart.points || eq, got: (longPart.points || eq) * lr.frac, res: lr });
    const got = parts.reduce((a, p) => a + p.got, 0), max = parts.reduce((a, p) => a + p.max, 0);
    parts.forEach(p => { p.got = Math.round(p.got * 2) / 2; p.max = Math.round(p.max * 10) / 10; });
    return { parts, got: Math.round(got * 2) / 2, max: Math.round(max), pct: Math.round(100 * got / max), indicative: true, total: model.total };
  }
  // 6 interventions (sujets du ministère) : une intervention « au choix, liée au thème » s'ajoute aux 5 de la mission.
  function examSlots(mission, model) {
    const n = (model.parts.find(p => p.id === 'short') || {}).count || mission.slots.length;
    const s = mission.slots.slice(0, n);
    while (s.length < n) s.push({ id: 'x' + s.length, he: 'יחידה נוספת לבחירתכם, הקשורה לנושא הסיור', need: ['road', 'view', 'judaism', 'christianity', 'battle', 'archaeology', 'geology', 'city'], why: '' });
    return s;
  }

  // ---------- « Trouve les erreurs » ----------
  function gradeErrors(set, picks) {
    // picks : { index: true }  — l'élève marque une phrase comme fausse (+ catégorie facultative)
    return set.items.map((it, i) => {
      const marked = !!picks[i];
      const r = { i, marked, ok: it.ok };
      if (!it.ok && marked) r.result = 'found';
      else if (!it.ok && !marked) r.result = 'missed';
      else if (it.ok && marked) r.result = 'false';
      else r.result = 'clean';
      r.catOk = !it.ok && marked && picks[i] !== true ? picks[i] === it.cat : null;
      return r;
    });
  }

  // ---------- Progression ----------
  const LEVELS = [
    [0, 'חניך'], [120, 'מדריך מתלמד'], [300, 'מורה דרך צעיר'], [600, 'מורה דרך'], [1000, 'מורה דרך בכיר'], [1600, 'מומחה הגולן']
  ];
  function level(xp) {
    let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    const next = LEVELS[i + 1];
    return { n: i + 1, he: LEVELS[i][1], from: LEVELS[i][0], to: next ? next[0] : null, pct: next ? Math.round(100 * (xp - LEVELS[i][0]) / (next[0] - LEVELS[i][0])) : 100 };
  }
  const CATS = {
    period: 'תקופה היסטורית', site: 'התאמת אתר להנחיה', geo: 'גאוגרפיה וגאולוגיה', chronology: 'כרונולוגיה',
    route: 'מסלול ונסיעות', orientation: 'כיוונים (ימין/שמאל, צפון/דרום)', time: 'זמנים ושעות פתיחה',
    visibility: 'מה רואים מהאוטובוס', words: 'מספר מילים', structure: 'מבנה ההדרכה', fields: 'שדות חובה', logistics: 'תיאומים ומנהלות'
  };
  // Révision ciblée : la catégorie la plus fréquente → les séries d'erreurs qui l'entraînent.
  function recommend(errorsByCat, data) {
    const top = Object.entries(errorsByCat || {}).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const sets = (data.errorSets || []).filter(s => s.items.some(i => !i.ok && i.cat === top[0])).map(s => s.id);
    return { cat: top[0], he: CATS[top[0]] || top[0], count: top[1], sets };
  }
  function dailyMission(date, missions) {
    const d = new Date(date), day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    return missions[((day % missions.length) + missions.length) % missions.length];
  }

  // Distance à vol d'oiseau (km). Ce n'est PAS un temps de trajet : les trajets se vérifient dans Waze / Google Maps.
  function distanceKm(a, b) {
    const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
  }
  function navLinks(from, to) {
    const ll = p => `${p.lat},${p.lon}`;
    return {
      google: from ? `https://www.google.com/maps/dir/?api=1&origin=${ll(from)}&destination=${ll(to)}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${ll(to)}`,
      waze: `https://waze.com/ul?ll=${ll(to)}&navigate=yes`
    };
  }
  // Étapes du programme (sites choisis, dans l'ordre) → segments avec distance aérienne et liens de navigation.
  function legs(ids, data, start) {
    const P = places(data), seq = (start ? [start] : []).concat(ids.map(id => P[id]).filter(p => p && p.type === 'site'));
    const out = [];
    for (let i = 1; i < seq.length; i++) out.push({ from: seq[i - 1], to: seq[i], km: distanceKm(seq[i - 1], seq[i]), nav: navLinks(seq[i - 1], seq[i]) });
    return out;
  }

  // ---------- « À l'envers » : le guide dit ce qu'il veut, l'app propose des parcours ----------
  // prefs : { tags:[...], count:3..5, road:bool, start:{lat,lon,...}|null }
  // Chaque proposition : sites (ordre de proximité depuis le départ), étapes de route, couverture des souhaits,
  // trajets (distance aérienne seulement), brouillon de לוח זמנים SANS temps inventés, et unités modèles disponibles.
  function suggest(prefs, data) {
    const P = places(data), want = prefs.tags || [], n = Math.max(2, Math.min(5, prefs.count || 4));
    const sites = data.sites.map(s => {
      const hit = want.filter(t => (s.tags || []).includes(t));
      const verified = (s.status || []).includes('visited') ? 1 : 0;
      return { s, hit, score: hit.length * 10 + verified * 2 + (s.hours ? 1 : 0) };
    }).filter(x => !want.length || x.hit.length).sort((a, b) => b.score - a.score);
    const order = list => orderSites(list, prefs.start);
    const build = picked => {
      const ids = picked.map(s => s.id), ord = order(picked);
      const covered = want.filter(t => picked.some(s => (s.tags || []).includes(t)));
      const roads = prefs.road ? (data.roads || []).filter(r => !r.line || r.line.every(id => ids.includes(id) || id === 'kursi')) : [];
      const L = legs(ord.map(s => s.id), data, prefs.start);
      const plan = draftPlan(ord, prefs);
      const units = ord.map(s => ({ site: s.id, model: !!(data.models && data.models[s.id]), long: !!(data.models && data.models['long_' + s.id]) }));
      return { sites: ord, roads, covered, missing: want.filter(t => !covered.includes(t)), legs: L, km: Math.round(L.reduce((a, l) => a + l.km, 0) * 10) / 10, plan, units,
        warnings: ord.filter(s => (s.status || []).includes('unverified')).map(s => s.short + ' — החומר חלקי (טרם אומת)') };
    };
    const out = [], seen = new Set();
    const push = picked => { const key = picked.map(s => s.id).sort().join(','); if (picked.length && !seen.has(key)) { seen.add(key); out.push(build(picked)); } };
    // 1) couverture gloutonne des souhaits, 2) les mieux notés, 3) variante sans les sites non vérifiés
    const greedy = []; const left = new Set(want);
    for (const x of sites) { if (greedy.length >= n) break; if (!want.length || x.hit.some(t => left.has(t)) || greedy.length < n && left.size === 0) { greedy.push(x.s); x.hit.forEach(t => left.delete(t)); } }
    for (const x of sites) { if (greedy.length >= n) break; if (!greedy.includes(x.s)) greedy.push(x.s); }
    push(greedy);
    push(sites.slice(0, n).map(x => x.s));
    push(sites.filter(x => !(x.s.status || []).includes('unverified')).slice(0, n).map(x => x.s));
    return out.slice(0, 3);
  }

  // Ordre le plus logique : plus proche voisin depuis le point de départ (sans inventer de temps de route).
  function orderSites(list, start) {
    const rest = list.slice(), out = []; let cur = start || rest[0];
    while (rest.length) { rest.sort((a, b) => distanceKm(cur, a) - distanceKm(cur, b)); const x = rest.shift(); out.push(x); cur = x; }
    return out;
  }
  // Brouillon de לוח זמנים : rendez-vous, trajet + site pour chaque visite, déjeuner, retour. Horaires laissés vides.
  function draftPlan(ord, prefs) {
    prefs = prefs || {};
    const plan = [{ start: prefs.startTime || '08:00', end: '', what: 'מפגש ואיסוף: ' + ((prefs.start && prefs.start.he) || 'נקודת המפגש'), log: 'לבדוק שכולם הגיעו' }];
    ord.forEach((s, i) => {
      const L2 = s.logistics2 || {};
      plan.push({ start: '', end: '', what: 'נסיעה ל' + s.short + ' (זמן: לבדוק ב-Waze)', log: '' });
      const todo = ['toilets', 'parking', 'queue'].filter(k => L2[k] && L2[k].status === 'unknown').map(k => ({ toilets: 'שירותים', parking: 'חניה', queue: 'המתנה בקופה' })[k]);
      plan.push({ start: '', end: '', what: s.he, site: s.id, log: [L2.price && !/חינם|לא/.test(L2.price.he) ? 'תשלום כניסה' : '', todo.length ? 'לברר: ' + todo.join(', ') : '', L2.group ? 'תיאום קבוצה' : ''].filter(Boolean).join(' · ') });
      if (i === Math.min(1, ord.length - 1)) plan.push({ start: '', end: '', what: 'ארוחת צהריים — שעה אחת, בין 12:00 ל-14:00', log: 'לבדוק אם יש מקום לאכול — אחרת ארוחה עצמית' });
    });
    plan.push({ start: '', end: prefs.endTime || '18:00', what: 'נסיעה חזרה ופיזור: ' + ((prefs.start && prefs.start.he) || 'נקודת הפיזור'), log: 'פיזור' });
    return plan;
  }

  const api = { orderSites, draftPlan, suggest, distanceKm, navLinks, legs, wordCount, wordState, toMin, fmt, places, fits, checkSlots, checkPlan, checkUnit, findPitfalls, scoreExam, examSlots, gradeErrors, level, LEVELS, CATS, recommend, dailyMission };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MDExamCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
