// Moreh Derech NEXT — « 💡 רעיון או בעיה? » : bouton présent sur toutes les pages.
// Les élèves envoient une idée, un bug ou une erreur dans une question (RPC feedback_submit).
// Jamais de position GPS : seul un petit contexte (page, סיור, niveau, question) accompagne le message.
// Options : <script src="feedback.js" data-offset="70"> remonte le bouton flottant (px) ;
//           data-float="0" supprime le bouton flottant (les éléments [data-feedback] ouvrent quand même la fenêtre).
// Une page peut fournir window.MDL_FEEDBACK_CTX = () => ({ tour, level, mode, question, stop }).
(function () {
  'use strict';
  const me = document.currentScript;
  const offset = Number(me && me.dataset.offset) || 0;
  const showFloat = !(me && me.dataset.float === '0');
  const KINDS = [
    ['idea', '💡', 'רעיון'],
    ['bug', '🐞', 'משהו לא עובד'],
    ['question', '❓', 'טעות בשאלה'],
    ['other', '💬', 'אחר']
  ];
  const ERR = {
    too_short: 'כתבו לפחות כמה מילים 🙂', too_long: 'ההודעה ארוכה מדי (עד 2000 תווים).',
    sender_hour_limit: 'שלחתם הרבה הודעות בשעה האחרונה — נסו שוב מאוחר יותר.',
    site_hour_limit: 'יש עומס כרגע — נסו שוב בעוד כמה דקות.'
  };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function senderId() {
    let id = ls.get('mdl_fb_sender');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
      ls.set('mdl_fb_sender', id);
    }
    return id;
  }
  function context() {
    let c = {};
    try { if (typeof window.MDL_FEEDBACK_CTX === 'function') c = window.MDL_FEEDBACK_CTX() || {}; } catch (e) {}
    const q = new URLSearchParams(location.search);
    ['tour', 'level', 'mode'].forEach(k => { if (c[k] == null && q.get(k)) c[k] = q.get(k); });
    const out = {};
    ['tour', 'level', 'mode', 'question', 'stop'].forEach(k => { if (c[k] != null && c[k] !== '' && c[k] !== 'all') out[k] = String(c[k]).slice(0, 80); });
    return out;
  }
  function pageName() { return (location.pathname.split('/').pop() || 'index.html') + location.search; }
  async function send(payload) {
    const cfg = window.MDL_CONFIG;
    if (!cfg) throw new Error('no_config');
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(cfg.url + '/rest/v1/rpc/feedback_submit', {
        method: 'POST', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json', apikey: cfg.anonKey },
          /^eyJ/.test(cfg.anonKey) ? { Authorization: 'Bearer ' + cfg.anonKey } : {}),
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('http_' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const css = `
.fb-fab{position:fixed;z-index:2400;left:14px;bottom:calc(14px + ${offset}px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:6px;height:44px;padding:0 15px 0 13px;border-radius:999px;border:1px solid #ffd878;background:#1b2552;color:#ffe9a8;font:800 14px system-ui,-apple-system,'Segoe UI',Arial,sans-serif;box-shadow:0 8px 22px #0007;cursor:pointer}
.fb-fab span{font-size:18px}
.fb-wrap{position:fixed;inset:0;z-index:2500;display:flex;align-items:flex-end;justify-content:center;background:#03081acc}
.fb-wrap[hidden]{display:none}
.fb-sheet{width:min(560px,100%);max-height:92vh;overflow:auto;background:#121b45;color:#eef3ff;border:1px solid #4a5c99;border-bottom:0;border-radius:22px 22px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));font-family:system-ui,-apple-system,'Segoe UI','Arial Hebrew',Arial,sans-serif;direction:rtl;text-align:right}
.fb-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
.fb-head h2{flex:1;margin:0;font-size:19px}.fb-head p{margin:4px 0 0;color:#b5c3ee;font-size:13.5px;font-weight:500}
.fb-x{flex:none;width:36px;height:36px;border-radius:50%;border:1px solid #4a5c99;background:#1d2860;color:#fff;font-size:16px;cursor:pointer}
.fb-kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.fb-kinds button{display:flex;align-items:center;gap:8px;min-height:46px;padding:8px 12px;border-radius:13px;border:1px solid #4a5c99;background:#1a2459;color:#eef3ff;font:700 14.5px inherit;font-family:inherit;cursor:pointer;text-align:right}
.fb-kinds button span{font-size:19px}
.fb-kinds button[aria-pressed="true"]{background:#ffd878;color:#111d45;border-color:#ffd878}
.fb-sheet label{display:block;font-size:13px;font-weight:800;color:#b5c3ee;margin:10px 0 5px}
.fb-sheet textarea,.fb-sheet input{width:100%;box-sizing:border-box;border-radius:13px;border:1px solid #4a5c99;background:#0b1232;color:#fff;font:16px inherit;font-family:inherit;padding:11px 12px}
.fb-sheet textarea{min-height:120px;resize:vertical}
.fb-ctx{margin:9px 0 0;font-size:12px;color:#93a3d6}
.fb-send{width:100%;margin-top:14px;min-height:50px;border:0;border-radius:14px;background:#6ee9cf;color:#062a24;font:900 16px inherit;font-family:inherit;cursor:pointer}
.fb-send:disabled{opacity:.6}
.fb-msg{min-height:1.2em;margin:9px 0 0;font-size:14px;font-weight:700}
.fb-msg.bad{color:#ffb4b4}.fb-msg.ok{color:#8ff0c8}
.fb-done{text-align:center;padding:18px 6px 8px}.fb-done div{font-size:46px}.fb-done h3{margin:8px 0 4px;font-size:20px}.fb-done p{color:#b5c3ee;margin:0 0 14px}
@media (prefers-reduced-motion:no-preference){.fb-sheet{animation:fbUp .22s ease-out}@keyframes fbUp{from{transform:translateY(30px);opacity:.4}}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const wrap = document.createElement('div');
  wrap.className = 'fb-wrap'; wrap.hidden = true;
  wrap.innerHTML = `<section class="fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fbTitle">
  <div class="fb-head"><div><h2 id="fbTitle">💡 רעיון, בעיה או טעות?</h2><p>ההודעה מגיעה ישירות לצוות. אפשר לכתוב בכל שפה.</p></div><button type="button" class="fb-x" aria-label="סגירה">✕</button></div>
  <form class="fb-form" novalidate>
    <div class="fb-kinds" role="group" aria-label="סוג ההודעה">${KINDS.map(k => `<button type="button" data-kind="${k[0]}" aria-pressed="false"><span aria-hidden="true">${k[1]}</span>${k[2]}</button>`).join('')}</div>
    <label for="fbText">מה רציתם לספר?</label>
    <textarea id="fbText" maxlength="2000" placeholder="למשל: בשאלה על מצדה התשובה הנכונה לא נכונה, כי…"></textarea>
    <label for="fbName">שם (לא חובה)</label>
    <input id="fbName" maxlength="60" autocomplete="name" placeholder="כדי שנוכל לחזור אליכם">
    <p class="fb-ctx" id="fbCtx"></p>
    <button class="fb-send" type="submit">שליחה ←</button>
    <p class="fb-msg" id="fbMsg" role="status" aria-live="polite"></p>
  </form></section>`;
  document.body.appendChild(wrap);
  const $ = s => wrap.querySelector(s);
  let kind = 'idea', lastFocus = null;

  function setKind(k) { kind = k; wrap.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === k))); }
  function ctxLine() {
    const c = context(), parts = [];
    if (c.tour) parts.push('סיור ' + c.tour);
    if (c.level) parts.push('רמה ' + c.level);
    if (c.question) parts.push('שאלה ' + c.question);
    return 'יישלח יחד עם: ' + (pageName().split('?')[0]) + (parts.length ? ' · ' + parts.join(' · ') : '') + ' (בלי מיקום)';
  }
  function open(k) {
    lastFocus = document.activeElement;
    setKind(k || (ls.get('mdl_fb_kind') || 'idea'));
    $('#fbText').value = ls.get('mdl_fb_draft') || '';
    $('#fbName').value = ls.get('mdl_fb_name') || '';
    $('#fbCtx').textContent = ctxLine();
    $('#fbMsg').textContent = ''; $('#fbMsg').className = 'fb-msg';
    wrap.hidden = false; document.documentElement.style.overflow = 'hidden';
    setTimeout(() => $('#fbText').focus(), 60);
  }
  function close() {
    wrap.hidden = true; document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  window.MDLFeedback = { open };

  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('.fb-x') || e.target.closest('[data-fb-close]')) return close();
    const kb = e.target.closest('[data-kind]'); if (kb) { setKind(kb.dataset.kind); ls.set('mdl_fb_kind', kb.dataset.kind); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.hidden) close(); });
  wrap.addEventListener('input', e => { if (e.target.id === 'fbText') ls.set('mdl_fb_draft', e.target.value); if (e.target.id === 'fbName') ls.set('mdl_fb_name', e.target.value); });
  wrap.addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('#fbText').value.trim(), msg = $('#fbMsg'), btn = $('.fb-send');
    if (text.length < 5) { msg.className = 'fb-msg bad'; msg.textContent = ERR.too_short; $('#fbText').focus(); return; }
    btn.disabled = true; btn.textContent = 'שולח…'; msg.textContent = '';
    try {
      const r = await send({ p_kind: kind, p_message: text, p_author: $('#fbName').value.trim(), p_page: pageName(), p_context: context(), p_sender: senderId() });
      if (r && r.error) throw Object.assign(new Error(r.error), { code: r.error });
      ls.set('mdl_fb_draft', '');
      wrap.querySelector('.fb-sheet').innerHTML = `<div class="fb-done"><div>🙏</div><h3>תודה! ההודעה נשלחה</h3><p>הצוות קורא כל הודעה.</p><button type="button" class="fb-send" data-fb-close>סגירה</button></div>`;
      setTimeout(() => { if (!wrap.hidden) close(); rebuild(); }, 2600);
    } catch (err) {
      msg.className = 'fb-msg bad';
      msg.textContent = ERR[err.code] || 'השליחה לא הצליחה (אין חיבור?). הטקסט נשמר — נסו שוב בעוד רגע.';
    } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'שליחה ←'; } }
  });
  // Après un envoi réussi, on remet le formulaire en place pour un prochain message.
  const formHtml = wrap.querySelector('.fb-sheet').innerHTML;
  function rebuild() { wrap.querySelector('.fb-sheet').innerHTML = formHtml; }
  const origOpen = open;
  window.MDLFeedback.open = k => { if (!wrap.querySelector('.fb-form')) rebuild(); origOpen(k); };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-feedback]');
    if (t) { e.preventDefault(); window.MDLFeedback.open(t.dataset.feedback || undefined); }
  });
  if (showFloat) {
    const fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'fb-fab'; fab.setAttribute('aria-label', 'רעיון או בעיה? כתבו לנו');
    fab.innerHTML = '<span aria-hidden="true">💡</span>רעיון / בעיה';
    fab.addEventListener('click', () => window.MDLFeedback.open());
    document.body.appendChild(fab);
  }
})();
