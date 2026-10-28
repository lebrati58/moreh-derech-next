// Moreh Derech NEXT — accès réservé aux élèves de la liste (numéro de teoudat zehout).
// Chargé dans le <head> de chaque page (sauf inbox.html, où l'admin gère la liste).
// • Le serveur décide : tant que la liste est vide (ou que access_control.sql n'est pas installé), tout reste ouvert.
// • Le numéro n'est JAMAIS gardé dans le téléphone : seulement un jeton de session renvoyé par le serveur.
// • Hors connexion, un téléphone déjà connecté continue de marcher.
(function () {
  'use strict';
  var KEY = 'mdl_access_v1', RECHECK = 12 * 3600 * 1000;
  var root = document.documentElement;
  var st = document.createElement('style');
  st.textContent = 'html.mdl-gate body{visibility:hidden}' +
    '#mdlGate{visibility:visible;position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at 50% 0,#2c2a7a,#081027 70%);color:#f4f6ff;font-family:system-ui,-apple-system,"Segoe UI","Arial Hebrew",Arial,sans-serif;direction:rtl}' +
    '#mdlGate form{width:100%;max-width:380px;text-align:center;background:#111a3d;border:1px solid #3f5290;border-radius:22px;padding:26px 20px;box-shadow:0 12px 40px #000a}' +
    '#mdlGate img{width:84px;height:84px;border-radius:20px;background:#fff;margin-bottom:10px}' +
    '#mdlGate h1{font-size:22px;margin:0 0 6px}#mdlGate p{margin:0 0 16px;color:#a9b8df;font-size:14.5px;line-height:1.5}' +
    '#mdlGate input{width:100%;box-sizing:border-box;height:54px;border-radius:14px;border:2px solid #5868a8;background:#0b1433;color:#fff;font-size:22px;font-weight:800;text-align:center;letter-spacing:2px;direction:ltr}' +
    '#mdlGate button{width:100%;height:52px;margin-top:12px;border:0;border-radius:14px;background:#ffd66e;color:#1c1f45;font-size:18px;font-weight:900;cursor:pointer}' +
    '#mdlGate button:disabled{opacity:.6}#mdlGate .err{min-height:22px;margin:10px 0 0;color:#ff9aa8;font-weight:800;font-size:14px}' +
    '#mdlGate small{display:block;margin-top:14px;color:#8f9fca;font-size:12px;line-height:1.45}';
  (document.head || root).appendChild(st);
  root.classList.add('mdl-gate');

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function open() { root.classList.remove('mdl-gate'); var g = document.getElementById('mdlGate'); if (g) g.remove(); }
  var s = load();
  // déjà vérifié récemment : la page s'affiche tout de suite, on revérifie en arrière-plan
  if (s.token && Date.now() - (s.checked || 0) < RECHECK) open();

  function config() {
    return new Promise(function (res) {
      if (window.MDL_CONFIG) return res(window.MDL_CONFIG);
      var sc = document.createElement('script'); sc.src = 'config.js';
      sc.onload = function () { res(window.MDL_CONFIG || null); }; sc.onerror = function () { res(null); };
      document.head.appendChild(sc);
    });
  }
  function rpc(fn, args) {
    return config().then(function (cfg) {
      if (!cfg) throw new Error('no_config');
      var ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 9000);
      var h = { 'Content-Type': 'application/json', apikey: cfg.anonKey };
      if (/^eyJ/.test(cfg.anonKey)) h.Authorization = 'Bearer ' + cfg.anonKey;
      return fetch(cfg.url + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', headers: h, body: JSON.stringify(args || {}), signal: ctl && ctl.signal })
        .then(function (r) { if (t) clearTimeout(t); if (!r.ok) { var e = new Error('http_' + r.status); e.status = r.status; throw e; } return r.json(); });
    });
  }

  var MSG = {
    not_allowed: 'המספר לא נמצא ברשימת התלמידים. פנו למדריך.',
    invalid_tz: 'מספר תעודת זהות לא תקין — בדקו את הספרות.',
    too_many_attempts: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
    offline: 'אין חיבור לשרת. התחברו לאינטרנט ונסו שוב.'
  };
  function showLogin(note) {
    if (document.getElementById('mdlGate')) return;
    var g = document.createElement('div'); g.id = 'mdlGate';
    g.innerHTML = '<form novalidate><img src="assets/moreh-derech-next-driver.webp" alt=""><h1>כניסה לתלמידי הקורס</h1>' +
      '<p>האפליקציה פתוחה כרגע רק לתלמידי הקורס. הקלידו את מספר תעודת הזהות שלכם.</p>' +
      '<label for="mdlTz" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">מספר תעודת זהות</label>' +
      '<input id="mdlTz" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="000000000">' +
      '<button type="submit">כניסה</button><div class="err" role="alert"></div>' +
      '<small>🔒 המספר נשלח לבדיקה בלבד ואינו נשמר בטלפון. בשרת נשמרת רק טביעה מוצפנת שלו.</small></form>';
    (document.body || root).appendChild(g);
    var f = g.querySelector('form'), inp = g.querySelector('input'), btn = g.querySelector('button'), err = g.querySelector('.err');
    if (note) err.textContent = note;
    setTimeout(function () { inp.focus(); }, 50);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      rpc('access_login', { p_tz: inp.value }).then(function (r) {
        btn.disabled = false;
        if (r && r.ok) { save({ token: r.token, checked: Date.now() }); inp.value = ''; open(); return; }
        err.textContent = MSG[r && r.error] || MSG.not_allowed;
      }).catch(function () { btn.disabled = false; err.textContent = MSG.offline; });
    });
  }

  function decide() {
    var s = load();
    var call = s.token ? rpc('access_check', { p_token: s.token }) : rpc('access_required');
    call.then(function (r) {
      if (!r || !r.required) { if (s.token) save(Object.assign(s, { checked: Date.now() })); return open(); } // liste vide : ouvert
      if (s.token && r.ok) { save(Object.assign(s, { checked: Date.now() })); return open(); }
      save({}); root.classList.add('mdl-gate'); showLogin(s.token ? 'הגישה שלכם הסתיימה. הקלידו שוב את המספר.' : '');
    }).catch(function (e) {
      if (e && e.status === 404) return open();          // access_control.sql pas encore installé : rien n'est fermé
      if (s.token) return open();                          // hors connexion, déjà connecté : on laisse passer
      showLogin(MSG.offline);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decide); else decide();
  window.MDAccess = { logout: function () { save({}); location.reload(); } };
})();
