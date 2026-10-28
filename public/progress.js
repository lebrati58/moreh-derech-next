// Moreh Derech NEXT — progression « à la Zelda » + concours de la classe.
// Tout est d'abord enregistré SUR LE TÉLÉPHONE (localStorage) : meilleur résultat par question,
// et résumé par סיור/niveau. Une étoile ⭐ = un niveau terminé avec au moins 60 % de bonnes réponses ;
// 3 étoiles = סיור en or sur la carte.
// Le score n'est envoyé au tableau de la classe QUE si l'élève a donné son prénom ET son accord.
(function () {
  'use strict';
  const PKEY = 'mdl_player_v1', GKEY = 'mdl_progress_v1', PASS = 0.6;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function player() {
    const p = ls.get(PKEY, {});
    if (!p.id || !/^[0-9a-f-]{36}$/i.test(p.id)) { p.id = uuid(); ls.set(PKEY, p); }
    return p;
  }
  function setPlayer(patch) { const p = Object.assign(player(), patch, { asked: true }); ls.set(PKEY, p); submitSoon(); return p; }
  function data() { const g = ls.get(GKEY, {}); g.q = g.q || {}; g.lv = g.lv || {}; return g; }

  // Date locale du téléphone (AAAA-MM-JJ) : le « jour » du joueur, pas celui de UTC.
  function today(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(key, n) { const [y, m, dd] = key.split('-').map(Number); return today(new Date(y, m - 1, dd + n)); }

  // Enregistre le meilleur résultat d'une question (une bonne réponse n'est jamais perdue)
  // et l'activité du jour (pour la série de jours et le graphique des 14 derniers jours).
  function mark(qid, ok) {
    const g = data(); if (!g.q[qid]) g.q[qid] = ok ? 1 : -1; else if (ok) g.q[qid] = 1;
    g.days = g.days || {}; const k = today(), d = g.days[k] || (g.days[k] = { a: 0, c: 0 });
    d.a++; if (ok) d.c++;
    const keys = Object.keys(g.days).sort(); while (keys.length > 120) delete g.days[keys.shift()];
    ls.set(GKEY, g);
  }
  // Suivi : questions ratées et jamais corrigées (à revoir), série de jours joués, historique.
  function mistakes() { const g = data(); return Object.keys(g.q).filter(id => g.q[id] === -1); }
  function result(qid) { return data().q[qid] || 0; }
  function history(n) { const g = data(), days = g.days || {}, out = []; let k = today();
    for (let i = 0; i < (n || 14); i++) { out.unshift(Object.assign({ day: k }, days[k] || { a: 0, c: 0 })); k = addDays(k, -1); } return out; }
  function dayStreak() {
    const days = data().days || {}; let k = today(); if (!days[k]) k = addDays(k, -1);
    let n = 0; while (days[k] && days[k].a > 0) { n++; k = addDays(k, -1); } return n;
  }
  function accuracy() { const v = Object.values(data().q); return v.length ? Math.round(v.filter(x => x === 1).length / v.length * 100) : 0; }

  // Défi du jour : 5 questions tirées selon la date, identiques pour toute la classe
  // (2 קל, 2 בינוני, 1 קשה), parmi les questions des 22 סיורים.
  function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dailyPick(questions, day) {
    day = day || today(); let seed = seedOf('mdl-daily-' + day);
    const rnd = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
    const out = [], used = new Set();
    [1, 1, 2, 2, 3].forEach(lv => {
      const pool = (questions || []).filter(q => q.level === lv && !used.has(q.id) && q.tourId !== 'road67');
      if (!pool.length) return; const q = pool[Math.floor(rnd() * pool.length)]; used.add(q.id); out.push(q);
    });
    return out;
  }
  function dailyResult(day) { return (data().daily || {})[day || today()] || null; }
  function saveDaily(right, total) { const g = data(); g.daily = g.daily || {}; const k = today();
    if (!g.daily[k]) g.daily[k] = { right, total }; // le premier essai du jour compte, les suivants sont de l'entraînement
    const keys = Object.keys(g.daily).sort(); while (keys.length > 120) delete g.daily[keys.shift()];
    ls.set(GKEY, g); return g.daily[k]; }
  function dailyStreak() { const d = data().daily || {}; let k = today(); if (!d[k]) k = addDays(k, -1);
    let n = 0; while (d[k]) { n++; k = addDays(k, -1); } return n; }
  // Résumé d'un niveau de סיור, calculé à partir de la liste des questions de ce niveau.
  function saveLevel(tour, level, ids) {
    const g = data(); let answered = 0, correct = 0;
    ids.forEach(id => { if (g.q[id]) { answered++; if (g.q[id] === 1) correct++; } });
    g.lv[tour + '-' + level] = { total: ids.length, answered, correct };
    ls.set(GKEY, g); submitSoon();
    return g.lv[tour + '-' + level];
  }
  function level(tour, lv) { return data().lv[tour + '-' + lv] || null; }
  function star(tour, lv) { const s = level(tour, lv); return !!(s && s.total && s.answered >= s.total && s.correct / s.total >= PASS); }
  function stars(tour) { return [1, 2, 3].filter(l => star(tour, l)).length; }
  function started(tour) { return [1, 2, 3].some(l => { const s = level(tour, l); return s && s.answered > 0; }); }
  // ---- ציר הזמן והחידון (history.html) ----
  // Par événement historique : h.ev[id] = { ok: 1|-1 (une bonne réponse n'est jamais perdue),
  //   x: 1 si tenté en mode examen, best: meilleur score d'examen (≤ 290) }.
  // Seul le MEILLEUR score d'examen de chaque événement compte dans les points : rejouer ne double jamais rien.
  // h.runs : 30 dernières parties (résumé), h.seen : identifiants de parties déjà enregistrées (anti-doublon).
  const HIST_MAX = 290;
  function hdata(g) { g.h = g.h || {}; g.h.ev = g.h.ev || {}; g.h.runs = g.h.runs || []; g.h.seen = g.h.seen || []; return g.h; }
  function saveHistory(rec) {
    if (!rec || rec.version !== 1 || !Array.isArray(rec.answerDetails) || !rec.runId) return { saved: false, reason: 'invalid' };
    const g = data(), h = hdata(g);
    if (h.seen.includes(rec.runId)) return { saved: false, reason: 'duplicate' };
    const before = historyPoints(h), exam = rec.mode === 'exam';
    let right = 0;
    rec.answerDetails.forEach(a => {
      if (!a || typeof a.eventId !== 'string' || !/^[a-z0-9-]{2,60}$/.test(a.eventId)) return;
      const e = h.ev[a.eventId] || (h.ev[a.eventId] = {});
      if (a.correct) { e.ok = 1; right++; } else if (e.ok !== 1) e.ok = -1;
      if (exam) { e.x = 1; const p = Math.max(0, Math.min(HIST_MAX, Number(a.points) || 0)); if (!(e.best >= p)) e.best = p; }
    });
    g.days = g.days || {}; const k = today(), d = g.days[k] || (g.days[k] = { a: 0, c: 0 });
    d.a += rec.answerDetails.length; d.c += right;
    h.seen.push(rec.runId); while (h.seen.length > 60) h.seen.shift();
    h.runs.push({ id: rec.runId, at: rec.completedAt, mode: rec.mode, period: rec.period, score: rec.score, correct: rec.correct, total: rec.total, ms: rec.durationMs });
    while (h.runs.length > 30) h.runs.shift();
    ls.set(GKEY, g);
    const after = historyPoints(h);
    if (exam) submitSoon();
    return { saved: true, gained: after - before, points: after };
  }
  function historyPoints(h) { return Object.values(h.ev).reduce((n, e) => n + (e.best || 0), 0); }
  function historyStats() {
    const h = hdata(data()), ev = h.ev, ids = Object.keys(ev);
    return { points: historyPoints(h), tried: ids.filter(id => ev[id].x).length, mastered: ids.filter(id => ev[id].ok === 1),
      mistakes: ids.filter(id => ev[id].ok === -1), runs: h.runs.slice(), best: id => (ev[id] && ev[id].best) || 0, status: id => (ev[id] && ev[id].ok) || 0 };
  }

  function totals() {
    const g = data(); let points = 0, st = 0, answered = 0; const tours = new Set(), gold = new Set();
    Object.entries(g.lv).forEach(([k, s]) => {
      const [t, l] = k.split('-'); points += s.correct * Number(l) * 100; answered += s.answered;
      if (s.total && s.answered >= s.total && s.correct / s.total >= PASS) { st++; tours.add(t); }
    });
    tours.forEach(t => { if (stars(t) === 3) gold.add(t); });
    // Quiz historique : meilleur score d'examen par événement (≤ 290 < 300, donc compatible avec la borne serveur points ≤ answered × 300).
    const h = hdata(g); points += historyPoints(h); answered += Object.values(h.ev).filter(e => e.x).length;
    return { points, stars: st, gold: gold.size, answered };
  }
  const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  // ---- envoi au tableau de la classe (seulement avec accord) ----
  let timer = null;
  function submitSoon() { clearTimeout(timer); timer = setTimeout(submit, 1500); }
  async function rpc(fn, args) {
    const cfg = window.MDL_CONFIG; if (!cfg) throw new Error('no_config');
    const r = await fetch(cfg.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', cache: 'no-store',
      headers: Object.assign({ 'Content-Type': 'application/json', apikey: cfg.anonKey },
        /^eyJ/.test(cfg.anonKey) ? { Authorization: 'Bearer ' + cfg.anonKey } : {}),
      body: JSON.stringify(args)
    });
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }
  async function submit() {
    const p = player();
    try {
      if (p.consent && p.name) {
        const t = totals();
        const a = { p_token: p.id, p_name: p.name, p_points: t.points, p_stars: t.stars, p_gold: t.gold, p_answered: t.answered };
        // v2 (code de classe) ; si le serveur n'a que la v1, on envoie au tableau général
        try { await rpc('class_submit', Object.assign({ p_class: classCode() }, a)); }
        catch (e) { if (!/http_404/.test(e.message) || classCode()) throw e; await rpc('class_score_submit', a); }
      } else if (p.published) {
        await rpc('class_score_delete', { p_token: p.id });
      }
      if (p.consent && p.name) { if (!p.published) ls.set(PKEY, Object.assign(player(), { published: true })); }
      else if (p.published) ls.set(PKEY, Object.assign(player(), { published: false }));
    } catch (e) { /* hors ligne ou SQL pas encore installé : on réessaiera au prochain envoi */ }
  }
  // Code de classe : un tableau par classe (« יובל-2026 »). Vide = tableau général.
  const normCode = c => String(c || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9א-תа-яё-]/g, '').slice(0, 24);
  const classCode = () => normCode(player().classCode);
  function setClassCode(c) { const p = Object.assign(player(), { classCode: normCode(c) }); ls.set(PKEY, p); submitSoon(); return p.classCode; }
  async function leaderboard() {
    try { return await rpc('class_board', { p_class: classCode() }); }
    catch (e) { if (/http_404/.test(e.message) && !classCode()) return rpc('class_leaderboard', {}); if (/http_404/.test(e.message)) e.v2missing = true; throw e; }
  }

  // ---- fenêtre « prénom + accord » ----
  const CSS = `.pg-wrap{position:fixed;inset:0;z-index:2600;display:flex;align-items:flex-end;justify-content:center;background:#03081acc}
.pg-sheet{width:min(520px,100%);background:#121b45;color:#eef3ff;border:1px solid #4a5c99;border-bottom:0;border-radius:22px 22px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));font-family:system-ui,-apple-system,'Segoe UI','Arial Hebrew',Arial,sans-serif;direction:rtl;text-align:right}
.pg-sheet h2{margin:0 0 4px;font-size:21px}.pg-sheet p{margin:0 0 14px;color:#b5c3ee;font-size:14.5px;line-height:1.45}
.pg-sheet label{display:block;font-weight:800;font-size:13px;color:#b5c3ee;margin:0 0 6px}
.pg-sheet input[type=text]{width:100%;box-sizing:border-box;border-radius:13px;border:1px solid #4a5c99;background:#0b1232;color:#fff;font:17px inherit;font-family:inherit;padding:12px}
.pg-sheet .pg-consent{display:flex;color:#eef3ff;gap:10px;align-items:flex-start;margin:14px 0 4px;padding:12px;border-radius:14px;background:#1a2459;border:1px solid #4a5c99;font-weight:700;font-size:14.5px;cursor:pointer}
.pg-consent input{width:22px;height:22px;flex:none;margin:0;accent-color:#ffd878}
.pg-small{font-size:12.5px!important;margin:6px 0 0!important}
.pg-row{display:flex;gap:9px;margin-top:16px}.pg-row button{flex:1;min-height:50px;border-radius:14px;font:900 16px inherit;font-family:inherit;cursor:pointer}
.pg-go{border:0;background:#ffd878;color:#111d45}.pg-later{border:1px solid #4a5c99;background:transparent;color:#dfe6ff}
.pg-err{color:#ffb4b4;min-height:1.1em;margin:8px 0 0;font-size:13.5px;font-weight:700}`;
  function askName(opts) {
    opts = opts || {};
    if (!document.getElementById('pgStyle')) { const s = document.createElement('style'); s.id = 'pgStyle'; s.textContent = CSS; document.head.appendChild(s); }
    const p = player(), w = document.createElement('div');
    w.className = 'pg-wrap';
    w.innerHTML = `<form class="pg-sheet" role="dialog" aria-modal="true" aria-labelledby="pgT" novalidate>
      <h2 id="pgT">🏆 מי משחק?</h2>
      <p>ההתקדמות שלך נשמרת בטלפון: כל רמה שמסיימים עם 60% ומעלה = ⭐, ושלושה כוכבים צובעים את הסיור בזהב על המפה.</p>
      <label for="pgName">שם פרטי</label>
      <input id="pgName" type="text" maxlength="20" autocomplete="given-name" value="${esc(p.name || '')}" placeholder="למשל: נועה">
      <label class="pg-consent"><input id="pgOk" type="checkbox" ${p.consent ? 'checked' : ''}><span>אני מסכים/ה לפרסם את השם הפרטי והניקוד שלי בטבלת התחרות של הכיתה</span></label>
      <p class="pg-small">אפשר לשנות או לבטל בכל רגע — ואז השם יורד מהטבלה. בלי הסכמה, הניקוד נשאר רק אצלך.</p>
      <p class="pg-err" id="pgErr" role="alert"></p>
      <div class="pg-row"><button type="submit" class="pg-go">שמירה ←</button><button type="button" class="pg-later">${p.asked ? 'ביטול' : 'אחר כך'}</button></div>
    </form>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); if (opts.onClose) opts.onClose(player()); };
    w.querySelector('.pg-later').onclick = () => { if (!p.asked) setPlayer({}); close(); };
    w.addEventListener('click', e => { if (e.target === w) close(); });
    w.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const name = w.querySelector('#pgName').value.trim().replace(/\s+/g, ' '), ok = w.querySelector('#pgOk').checked;
      if (ok && !/^[A-Za-z\u00C0-\u024F\u0400-\u04FF\u05D0-\u05EA\u0600-\u06FF][A-Za-z\u00C0-\u024F\u0400-\u04FF\u05D0-\u05EA\u0600-\u06FF\u05F3 '.\-]{0,19}$/.test(name)) { w.querySelector('#pgErr').textContent = 'כדי להופיע בטבלה צריך שם פרטי (אותיות בלבד, עד 20).'; return; }
      setPlayer({ name, consent: ok && !!name }); submit(); close();
    });
    setTimeout(() => w.querySelector('#pgName').focus(), 60);
  }

  window.MDProgress = { player, setPlayer, mark, saveLevel, level, star, stars, started, totals, starText, submit, leaderboard, classCode, setClassCode, normCode, askName, PASS,
    today, mistakes, result, history, dayStreak, accuracy, dailyPick, dailyResult, saveDaily, dailyStreak, saveHistory, historyStats };
})();
