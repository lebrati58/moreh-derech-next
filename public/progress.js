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

  // Enregistre le meilleur résultat d'une question (une bonne réponse n'est jamais perdue).
  function mark(qid, ok) { const g = data(); if (!g.q[qid]) g.q[qid] = ok ? 1 : -1; else if (ok) g.q[qid] = 1; ls.set(GKEY, g); }
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
  function totals() {
    const g = data(); let points = 0, st = 0, answered = 0; const tours = new Set(), gold = new Set();
    Object.entries(g.lv).forEach(([k, s]) => {
      const [t, l] = k.split('-'); points += s.correct * Number(l) * 100; answered += s.answered;
      if (s.total && s.answered >= s.total && s.correct / s.total >= PASS) { st++; tours.add(t); }
    });
    tours.forEach(t => { if (stars(t) === 3) gold.add(t); });
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
        await rpc('class_score_submit', { p_token: p.id, p_name: p.name, p_points: t.points, p_stars: t.stars, p_gold: t.gold, p_answered: t.answered });
      } else if (p.published) {
        await rpc('class_score_delete', { p_token: p.id });
      }
      if (p.consent && p.name) { if (!p.published) ls.set(PKEY, Object.assign(player(), { published: true })); }
      else if (p.published) ls.set(PKEY, Object.assign(player(), { published: false }));
    } catch (e) { /* hors ligne ou SQL pas encore installé : on réessaiera au prochain envoi */ }
  }
  const leaderboard = () => rpc('class_leaderboard', {});

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

  window.MDProgress = { player, setPlayer, mark, saveLevel, level, star, stars, started, totals, starText, submit, leaderboard, askName, PASS };
})();
