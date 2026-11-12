// « 🏆 אלוף הקורס » — interface (hôte + joueurs). Logique : campus-core.js ; réseau : campus-net.js.
// L'hôte (n'importe quel élève, sans mot de passe) ouvre une salle avec un code à 5 chiffres ;
// les autres entrent le code (ou scannent le QR). L'hôte arbitre : chrono, points, classement, podium.
(function () {
  'use strict';
  var C = window.MDCampus, NET = window.MDCampusNet;
  var app = document.getElementById('app');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var HKEY = 'mdc_host_v1', MKEY = 'mdc_me_v1', UKEY = 'mdc_used_v1', SKEY = 'mdc_sound_v1';
  var SHAPES = ['▲', '◆', '●', '■'];
  var LV = { 1: '🌱 קל', 2: '⭐ בינוני', 3: '🔥 קשה' };
  var REVEAL_MS = 6500, BOARD_MS = 5000, BEAT_MS = 2000;
  var uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); };
  var params = new URLSearchParams(location.search);
  var netKeep = params.get('net') ? '&net=' + encodeURIComponent(params.get('net')) : '';

  // ---------- petits outils ----------
  function toast(msg, ms) { var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, ms || 2600); }
  function setNet(s) {
    var el = document.getElementById('net'); el.hidden = false; el.className = 'pill net ' + s;
    document.getElementById('netTxt').textContent = s === 'online' ? (NET.isLocal() ? 'מחובר (מקומי)' : 'מחובר') : s === 'offline' ? 'אין חיבור — מנסה שוב' : 'מתחבר…';
  }
  var sound = ls.get(SKEY, true), actx = null;
  function beep(f, d, type, vol) {
    if (!sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(vol || 0.08, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch (e) {}
  }
  function jingle(ok) { if (ok) { beep(660, 0.12); setTimeout(function () { beep(880, 0.18); }, 110); setTimeout(function () { beep(1175, 0.25); }, 230); } else { beep(220, 0.35, 'sawtooth', 0.05); } }
  function buzz(ms) { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {} }
  var sndBtn = document.getElementById('snd');
  function sndUi() { sndBtn.textContent = sound ? '🔊' : '🔇'; sndBtn.setAttribute('aria-pressed', String(sound)); }
  sndBtn.onclick = function () { sound = !sound; ls.set(SKEY, sound); sndUi(); if (sound) beep(880, 0.1); };
  sndUi();
  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var box = document.getElementById('confetti'), set = ['🎉', '✨', '🏆', '⭐', '🎊', '🟨', '🟦', '🟥', '🟩'];
    box.innerHTML = '';
    for (var i = 0; i < 70; i++) {
      var e = document.createElement('i'); e.textContent = set[i % set.length];
      e.style.left = (Math.random() * 100) + 'vw'; e.style.animationDuration = (2.6 + Math.random() * 2.6) + 's'; e.style.animationDelay = (Math.random() * 1.6) + 's';
      box.appendChild(e);
    }
    setTimeout(function () { box.innerHTML = ''; }, 7000);
  }
  function srcLink(u) { return /^https:\/\/(drive|docs)\.google\.com\//.test(u || '') ? '<br><a href="' + esc(u) + '" target="_blank" rel="noopener" style="color:var(--soft);font-size:13px">📄 למסמך בדרייב</a>' : ''; }
  function fmtS(ms) { return (ms / 1000).toFixed(ms < 10000 ? 2 : 1); }
  function joinLink(pin) { return location.origin + location.pathname + '?pin=' + pin + netKeep; }

  // ---------- banque (chargée seulement par l'hôte) ----------
  var bankP = null;
  function loadBank() {
    if (bankP) return bankP;
    var get = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }).catch(function () { return null; }); };
    bankP = Promise.all([get('guided-quiz.json'), get('history-events.json'), get('architecture/data.json'), get('siyurim-catalog.json'), get('campus/lessons.json')]).then(function (r) {
      var bank = C.buildBank({ tours: r[0], H: window.MDHistory, history: r[1], arch: r[2], catalog: r[3], lessons: r[4] });
      var topics = (r[4] && r[4].topics) || [], label = {};
      topics.forEach(function (t) { label[t.id] = (t.emoji ? t.emoji + ' ' : '') + t.he; });
      bank.meta = { tourTitles: C.tourTitles(r[3]), lessonOrder: topics.map(function (t) { return t.id; }), lessonLabel: label };
      return bank;
    });
    return bankP;
  }

  // =====================================================================
  // ACCUEIL
  // =====================================================================
  function home() {
    var host = ls.get(HKEY, null);
    var resume = host && host.game && host.game.phase !== 'podium' && Date.now() - (host.savedAt || 0) < 6 * 3600e3;
    app.innerHTML =
      '<section class="hero"><div class="cup" aria-hidden="true">🏆</div><h1>אלוף הקורס</h1>' +
      '<p class="sub">כל הכיתה משחקת יחד — בקמפוס או באוטובוס. שאלות מכל הקורס, שעון לכל שאלה, ומי שעונה נכון <b>וגם מהר</b> עולה לפודיום.</p></section>' +
      '<div class="how"><div><b>⚡</b>מהירות = נקודות<br>עד 1000 לשאלה</div><div><b>🔥</b>רצף תשובות<br>נותן בונוס</div><div><b>👑</b>שאלת האלוף<br>בסוף — כפול!</div></div>' +
      '<div class="card"><h2>🎮 להצטרף למשחק</h2><label class="f" for="pin">קוד המשחק (5 ספרות)</label>' +
      '<input class="t pin" id="pin" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="•••••" value="' + esc(params.get('pin') || '') + '">' +
      '<button class="btn" id="go" type="button">להצטרף ▶</button><div class="err" id="err"></div></div>' +
      '<div class="card"><h2>🎤 לפתוח משחק לכיתה</h2><p class="sub">טלפון אחד (או מחשב מחובר למקרן) מנהל את המשחק: בוחרים נושאים, מציגים את הקוד, והשאר מצטרפים.</p>' +
      (resume ? '<button class="btn mint" id="resume" type="button">↩️ לחזור למשחק הפתוח (קוד ' + esc(host.pin) + ')</button>' : '') +
      '<button class="btn ghost" id="host" type="button">לפתוח משחק חדש</button></div>';
    var pin = document.getElementById('pin');
    pin.oninput = function () { pin.value = pin.value.replace(/\D/g, '').slice(0, 5); };
    var go = function () { if (!/^\d{5}$/.test(pin.value)) { document.getElementById('err').textContent = 'הקוד הוא 5 ספרות — מבקשים אותו מהמנחה'; return; } playerStart(pin.value); };
    document.getElementById('go').onclick = go;
    pin.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    document.getElementById('host').onclick = function () { hostSetup(); };
    if (resume) document.getElementById('resume').onclick = function () { hostResume(host); };
  }

  // =====================================================================
  // JOUEUR
  // =====================================================================
  var P = null;   // état du joueur
  function me() {
    var m = ls.get(MKEY, {});
    if (!m.id) { m.id = uid(); ls.set(MKEY, m); }
    if (!m.name) { try { var pl = window.MDProgress && MDProgress.player(); if (pl && pl.name) m.name = pl.name; } catch (e) {} }
    return m;
  }
  function playerStart(pin) {
    var m = me();
    app.innerHTML = '<div class="card"><h2>מי משחק?</h2><p class="sub">קוד המשחק: <b style="direction:ltr;display:inline-block">' + esc(pin) + '</b></p>' +
      '<label class="f" for="nm">השם שיופיע בטבלה</label><input class="t" id="nm" maxlength="20" autocomplete="nickname" value="' + esc(m.name || '') + '" placeholder="למשל: ליונל">' +
      '<label class="f">הדמות שלי</label><div class="avs" id="avs">' + C.AVATARS.map(function (a) { return '<button type="button" data-a="' + a + '" aria-pressed="' + (a === m.avatar) + '" aria-label="' + a + '">' + a + '</button>'; }).join('') + '</div>' +
      '<button class="btn" id="in" type="button">נכנסים! 🚀</button><div class="err" id="err"></div></div>';
    var av = m.avatar || C.AVATARS[C.hash(m.id) % C.AVATARS.length];
    var mark = function () { [].forEach.call(document.querySelectorAll('#avs button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.a === av)); }); };
    mark();
    document.getElementById('avs').onclick = function (e) { var b = e.target.closest('button'); if (b) { av = b.dataset.a; mark(); } };
    var nm = document.getElementById('nm');
    var enter = function () {
      var name = C.cleanName(nm.value);
      if (!name) { document.getElementById('err').textContent = 'כותבים שם (אפשר גם כינוי)'; return; }
      m.name = name; m.avatar = av; ls.set(MKEY, m);
      try { history.replaceState(null, '', '?pin=' + pin + netKeep); } catch (e) {}
      playerConnect(pin, m);
    };
    document.getElementById('in').onclick = enter;
    nm.onkeydown = function (e) { if (e.key === 'Enter') enter(); };
    if (!m.name) nm.focus();
  }

  function playerConnect(pin, m) {
    if (P && P.net) P.net.close();
    P = { pin: pin, me: m, hid: null, st: null, joinedAt: 0, lastJoin: 0, lastAns: 0, ans: null, deadline: 0, startLocal: 0, qkey: '', marked: {}, renderedKey: '', online: false, seenAt: 0 };
    app.innerHTML = '<div class="card" style="text-align:center"><div class="cup" style="font-size:48px">📡</div><h2>מתחברים למשחק ' + esc(pin) + '…</h2><p class="sub" id="wait">מחפשים את המנחה</p></div>';
    P.net = NET.connect(pin, {
      onStatus: function (s) { setNet(s); P.online = s === 'online'; if (P.online) { sendJoin(true); P.net.send('hello', { id: m.id }); } },
      onMessage: playerMsg
    });
    clearInterval(P.loop);
    P.loop = setInterval(playerTick, 250);
    setTimeout(function () { if (P && !P.st) { var w = document.getElementById('wait'); if (w) w.textContent = 'עדיין לא מצאנו משחק עם הקוד הזה. בודקים את הקוד מול המנחה — או מחכים שהמנחה יפתח את החדר.'; } }, 6000);
  }
  function sendJoin(force) {
    if (!P || !P.online) return;
    var now = Date.now(); if (!force && now - P.lastJoin < 1500) return;
    P.lastJoin = now; P.net.send('join', { id: P.me.id, name: P.me.name, avatar: P.me.avatar });
  }
  function playerMsg(ev, st) {
    if (ev !== 'state' || !st || !st.hid) return;
    if (P.hid && st.hid !== P.hid) {
      // un autre hôte sur le même code : on reste sur le premier, sauf s'il ne parle plus depuis 15 s
      if (Date.now() - P.seenAt < 15000) return;
    }
    if (P.st && P.st.hid === st.hid && P.st.gid === st.gid && st.v < P.st.v) return;   // message en retard
    P.hid = st.hid; P.seenAt = Date.now();
    var key = st.gid + ':' + st.i;
    if (st.phase === 'question' && P.qkey !== key) {
      P.qkey = key; P.ans = null; P.startLocal = Date.now() + (st.pre || 0); P.deadline = Date.now() + st.left - 120;
      buzz(40);
    }
    if (st.phase === 'question' && P.qkey === key) {
      // recalage doux si le message arrive tard (jamais plus tard que ce que l'hôte annonce)
      P.deadline = Math.min(P.deadline, Date.now() + st.left);
    }
    var prev = P.st; P.st = st;
    var inGame = (st.ids || []).indexOf(P.me.id) >= 0;
    if (!inGame) sendJoin(false);
    else if (!P.joinedAt) P.joinedAt = Date.now();
    playerRender(prev);
  }
  function playerTick() {
    if (!P || !P.st) return;
    var st = P.st, now = Date.now();
    if (st.phase === 'question') {
      // réponse pas encore confirmée par l'hôte : on la renvoie
      if (P.ans && P.ans.key === P.qkey && (st.got || []).indexOf(P.me.id) < 0 && now - P.lastAns > 1100) {
        P.lastAns = now; P.net.send('answer', { id: P.me.id, gid: st.gid, i: st.i, c: P.ans.c });
      }
      var bar = document.getElementById('tbar'), num = document.getElementById('tnum');
      if (now < P.startLocal) {
        var r = document.getElementById('readyN'); if (r) r.textContent = Math.ceil((P.startLocal - now) / 1000);
      } else if (document.getElementById('readyN')) { playerRender(st); }
      if (bar && num && now >= P.startLocal) {
        var left = Math.max(0, P.deadline - now), frac = left / st.limit;
        bar.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
        var s = Math.ceil(left / 1000); if (num.textContent !== String(s)) { num.textContent = s; num.className = s <= 5 ? 'hot' : ''; if (s <= 5 && s > 0 && !P.ans) beep(520, 0.05, 'square', 0.03); }
        if (left <= 0 && !P.ans) { var a = document.getElementById('ans'); if (a && !a.dataset.closed) { a.dataset.closed = '1'; [].forEach.call(a.querySelectorAll('button'), function (b) { b.disabled = true; b.classList.add('dim'); }); var w = document.getElementById('pmsg'); if (w) w.innerHTML = '<div class="sent"><div class="big">⏰</div><b>הזמן נגמר…</b></div>'; } }
      }
    }
  }
  function myScore(st) { var row = (st.scores || []).filter(function (r) { return r[0] === P.me.id; })[0]; return row ? { score: row[1], rank: row[2], last: row[3], streak: row[4], ms: row[5], choice: row[6] } : null; }
  function head(st) {
    return '<div class="qhead"><span>שאלה ' + (st.i + 1) + ' / ' + st.n + '</span><span class="lv">' + (LV[st.q.level] || '') + '</span><span>' + esc(st.q.cat || '') + '</span></div>' +
      (st.q.double ? '<div class="double">👑 שאלת האלוף — נקודות כפולות!</div>' : '');
  }
  function playerRender(prev) {
    var st = P.st, m = P.me, now = Date.now(), key = st.phase + ':' + st.gid + ':' + st.i;
    // la salle d'attente se redessine (arrivées), les autres écrans seulement quand ils changent
    var inGame = (st.ids || []).indexOf(m.id) >= 0;
    var rkey = key + (now < P.startLocal ? ':pre' : '') + (P.ans ? ':a' : '') + (inGame ? ':in' : '') + (st.phase === 'question' && (st.got || []).indexOf(m.id) >= 0 ? ':ok' : '');
    if (st.phase !== 'lobby' && P.renderedKey === rkey) {
      var gn = document.getElementById('gotN'); if (gn && st.phase === 'question') gn.textContent = (st.got || []).length + ' / ' + st.players + ' ענו';
      return;
    }
    P.renderedKey = rkey;
    if (st.phase === 'lobby') {
      var sig = JSON.stringify([st.roster, inGame, st.n]);
      if (P.lobbySig === sig && document.getElementById('edit')) return;
      P.lobbySig = sig;
      app.innerHTML = '<div class="card pinbox"><div class="lbl">' + (inGame ? '✅ נכנסת למשחק!' : 'נרשמים…') + '</div><div style="font-size:54px;margin:8px 0">' + esc(m.avatar) + '</div><h2>' + esc(m.name) + '</h2>' +
        '<p class="sub">מחכים שהמנחה יתחיל. בינתיים — מי עוד כאן:</p><div class="roster">' +
        (st.roster || []).map(function (r) { return '<span class="who' + (r[0] === m.id ? ' me' : '') + '">' + esc(r[2]) + ' ' + esc(r[1]) + '</span>'; }).join('') + '</div>' +
        '<div class="count">' + st.players + ' שחקנים · ' + st.n + ' שאלות</div><button class="btn ghost small" id="edit" type="button" style="margin:12px auto 0;display:flex">✏️ לשנות שם או דמות</button></div>';
      document.getElementById('edit').onclick = function () { playerStart(P.pin); };
      return;
    }
    if (st.phase === 'question') {
      if (now < P.startLocal) {
        app.innerHTML = head(st) + '<div class="qtext">' + esc(st.q.text) + '</div><div class="ready"><div class="ring" id="readyN">' + Math.ceil((P.startLocal - now) / 1000) + '</div><br>קוראים את השאלה… התשובות מגיעות!</div>';
        return;
      }
      var got = (st.got || []).indexOf(m.id) >= 0;
      if (got && !P.ans) P.ans = { key: P.qkey, c: -1, ms: -1 };       // page rechargée : l'hôte a déjà notre réponse
      app.innerHTML = head(st) + '<div class="qtext">' + esc(st.q.text) + '</div>' +
        '<div class="timer"><i id="tbar"></i></div><div class="tnum"><span id="gotN">' + (st.got || []).length + ' / ' + st.players + ' ענו</span><b id="tnum"></b></div>' +
        '<div class="ans" id="ans">' + st.q.options.map(function (o, i) {
          var cls = 'o' + i + (P.ans ? (P.ans.c === i ? ' pick' : ' dim') : '');
          return '<button type="button" class="' + cls + '" data-i="' + i + '"' + (P.ans || !inGame ? ' disabled' : '') + '><span class="s" aria-hidden="true">' + SHAPES[i] + '</span>' + esc(o) + '</button>';
        }).join('') + '</div><div id="pmsg">' +
        (!inGame ? '<div class="sent"><b>⏳ נרשמים למשחק… אפשר לענות מהשאלה הבאה</b></div>' :
          P.ans ? '<div class="sent"><div class="big">' + (got ? '✅' : '📤') + '</div><b>' + (got ? (P.ans.ms >= 0 ? 'התשובה נקלטה תוך ' + fmtS(P.ans.ms) + ' שנ׳' : 'התשובה שלך כבר נקלטה') : 'שולחים…') + '</b><p class="sub">מחכים לשאר הכיתה</p></div>' : '') + '</div>';
      document.getElementById('ans').onclick = function (e) {
        var b = e.target.closest('button'); if (!b || P.ans || Date.now() > P.deadline) return;
        var c = +b.dataset.i;
        P.ans = { key: P.qkey, c: c, ms: Math.max(0, Date.now() - P.startLocal) };
        P.lastAns = Date.now(); P.net.send('answer', { id: m.id, gid: st.gid, i: st.i, c: c });
        buzz(25); beep(740, 0.06);
        P.renderedKey = ''; playerRender();
      };
      playerTick();
      return;
    }
    if (st.phase === 'reveal') {
      var my = myScore(st), mine = my && my.choice >= 0 ? my.choice : null, ok = mine === st.q.correct;
      var cls = mine == null ? 'none' : ok ? 'ok' : 'bad';
      // banque des 22 סיורים : la réponse compte aussi dans « המסע שלי » (et les erreurs à revoir)
      if (inGame && mine != null && st.q.qid && /^t:/.test(st.q.qid) && !P.marked[key]) { P.marked[key] = 1; try { MDProgress.mark(st.q.qid.slice(2), ok); } catch (e) {} }
      if (!P.marked['snd' + key]) { P.marked['snd' + key] = 1; if (mine != null) { jingle(ok); buzz(ok ? 60 : [80, 60, 80]); } }
      app.innerHTML = head(st) + '<div class="qtext" style="font-size:17px">' + esc(st.q.text) + '</div>' +
        '<div class="result ' + cls + '"><div class="em">' + (mine == null ? '😶' : ok ? '🎉' : '😬') + '</div>' +
        '<div style="font-weight:1000;font-size:20px">' + (mine == null ? 'לא הספקת לענות' : ok ? 'נכון!' : 'לא נכון') + '</div>' +
        (my ? '<div class="pts">+' + my.last + '</div><div class="det">' + (ok && my.ms >= 0 ? '<span>⚡ ' + fmtS(my.ms) + ' שנ׳</span>' : '') + (my.streak > 1 ? '<span>🔥 רצף ' + my.streak + '</span>' : '') + '<span>🏅 מקום ' + my.rank + ' מתוך ' + st.players + '</span></div>' : '') + '</div>' +
        '<div class="expl"><b>✔ ' + esc(st.q.options[st.q.correct]) + '</b>' + (st.q.explanation ? '<br>' + esc(st.q.explanation) : '') + srcLink(st.q.url) + '</div>';
      return;
    }
    if (st.phase === 'board') {
      var my2 = myScore(st);
      app.innerHTML = '<h2 style="text-align:center;margin-top:12px">📊 הטבלה אחרי ' + (st.i + 1) + ' שאלות</h2>' + boardHtml(st, m.id) +
        (my2 && my2.rank > 5 ? '<div class="rankline">אתם במקום ' + my2.rank + ' עם ' + my2.score + ' נק׳</div>' : '') +
        (st.i + 1 === st.n - 1 ? '<div class="double" style="margin-top:14px">👑 השאלה הבאה היא שאלת האלוף — כפול נקודות!</div>' : '');
      return;
    }
    if (st.phase === 'podium') {
      var my3 = myScore(st);
      app.innerHTML = podiumHtml(st, m.id) + (my3 ? '<div class="rankline">' + (my3.rank === 1 ? '👑 אלוף הקורס!' : my3.rank <= 3 ? '🥇🥈🥉 על הפודיום!' : 'סיימת במקום ' + my3.rank) + ' · ' + my3.score + ' נק׳</div>' : '') +
        '<a class="btn ghost" href="journey.html">📈 המסע שלי</a><a class="btn ghost" href="index.html">🏠 לדף הבית</a>';
      if (!P.marked['podium' + st.gid]) { P.marked['podium' + st.gid] = 1; confetti(); if (my3 && my3.rank <= 3) jingle(true); }
    }
  }
  function boardHtml(st, myId) {
    var ids = {}; (st.scores || []).forEach(function (r) { ids[r[2]] = r[0]; });
    return '<ol class="board">' + (st.top || []).map(function (r, k) {
      return '<li' + (ids[k + 1] === myId ? ' class="me"' : '') + '><span class="r">' + (k + 1) + '</span><span class="a">' + esc(r[1]) + '</span><span class="nm">' + esc(r[0]) + '</span><span class="sc">' + r[2] + '</span>' + (r[3] ? '<span class="d">+' + r[3] + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function podiumHtml(st, myId) {
    var t = st.top || [], cell = function (k, cls) {
      var r = t[k]; if (!r) return '<div></div>';
      return '<div class="step ' + cls + '">' + (k === 0 ? '<span class="crown">👑</span>' : '') + '<div class="av">' + esc(r[1]) + '</div><div class="nm">' + esc(r[0]) + '</div><div class="sc">' + r[2] + '</div><div class="blk">' + (k + 1) + '</div></div>';
    };
    return '<h1 style="text-align:center;margin-top:12px">🏆 אלוף הקורס</h1><div class="podium">' + cell(1, 'p2') + cell(0, 'p1') + cell(2, 'p3') + '</div>' +
      '<div class="stats">' + (st.fastest ? '<div>⚡ התשובה הכי מהירה<b>' + esc(st.fastest.name) + ' · ' + fmtS(st.fastest.ms) + ' שנ׳</b></div>' : '') +
      (st.streak ? '<div>🔥 הרצף הכי ארוך<b>' + esc(st.streak.name) + ' · ' + st.streak.n + ' ברצף</b></div>' : '') +
      '<div>👥 שחקנים<b>' + st.players + '</b></div><div>❓ שאלות<b>' + (st.played || st.n) + '</b></div></div>' +
      (t.length > 3 ? '<ol class="board" start="4">' + t.slice(3).map(function (r, k) { return '<li><span class="r">' + (k + 4) + '</span><span class="a">' + esc(r[1]) + '</span><span class="nm">' + esc(r[0]) + '</span><span class="sc">' + r[2] + '</span></li>'; }).join('') + '</ol>' : '');
  }

  // =====================================================================
  // HÔTE
  // =====================================================================
  var H = null;
  function hostSetup() {
    var prev = ls.get(HKEY, {}) || {}, s = Object.assign({ count: 15, seconds: 20, sources: C.SOURCES.slice(), subs: null, double: true, auto: true }, prev.settings || {});
    if (!s.subs) { s.subs = { tours: [], lessons: [] }; s.sources = C.SOURCES.slice(); }     // anciens réglages : tout le cours
    s.subs.tours = s.subs.tours || []; s.subs.lessons = s.subs.lessons || [];
    var SUBS = { tours: 'אילו סיורים?', lessons: 'אילו שיעורים?' };
    app.innerHTML = '<div class="card"><h2>🎤 משחק חדש</h2><p class="sub" id="bankInfo">טוען את בנק השאלות…</p>' +
      '<label class="f">נושאים</label><div class="chips" id="srcs"></div>' +
      Object.keys(SUBS).map(function (k) {
        return '<div id="box-' + k + '"><label class="f">' + SUBS[k] + ' <small style="color:var(--soft);font-weight:700">(בלי בחירה = הכול)</small></label><div class="chips subs" data-src="' + k + '" id="sub-' + k + '"></div>' +
          '<div class="row" style="margin-top:6px"><button class="chip" type="button" data-none="' + k + '">לנקות את הבחירה</button></div></div>';
      }).join('') +
      '<label class="f">כמה שאלות?</label><div class="chips" id="cnt"></div>' +
      '<label class="f">זמן לכל שאלה</label><div class="chips" id="sec"></div>' +
      '<label class="switch"><span>👑 שאלת האלוף בסוף (נקודות כפולות)</span><input type="checkbox" id="dbl"' + (s.double ? ' checked' : '') + '></label>' +
      '<label class="switch"><span>⏩ מעבר אוטומטי בין השאלות</span><input type="checkbox" id="auto"' + (s.auto ? ' checked' : '') + '></label>' +
      '<p class="note">השאלות מסודרות מהקל לקשה. לפני כל שאלה יש כמה שניות קריאה, ורק אז מופיעות התשובות והשעון מתחיל — כך נמדדת מהירות הידיעה, לא מהירות הקריאה. תשובה נכונה: 500–1000 נק׳ לפי המהירות, +50 לכל תשובה ברצף. כל השאלות לקוחות מחומרי הקורס בדרייב.</p>' +
      '<button class="btn" id="open" type="button" disabled>לפתוח חדר 🚪</button><button class="btn ghost" id="back" type="button">חזרה</button></div>';
    document.getElementById('back').onclick = home;
    loadBank().then(function (bank) {
      var info = document.getElementById('bankInfo'); if (!info) return;
      var cnt = function (src) { return C.countBy(bank, function (q) { return q.src === src; }); };
      // sous-thèmes : nom affiché + nombre de questions, dans l'ordre du cours
      var subList = { tours: [], lessons: [] };
      Object.keys(subList).forEach(function (k) {
        var n = {}; bank.forEach(function (q) { if (q.src === k) n[q.sub] = (n[q.sub] || 0) + 1; });
        var order = k === 'tours' ? Object.keys(n).sort(function (a, b) { return (a === 'road67') - (b === 'road67') || a.localeCompare(b); }) : (bank.meta.lessonOrder || []).filter(function (id) { return n[id]; });
        subList[k] = order.map(function (id) { return { id: id, n: n[id], label: k === 'tours' ? (bank.meta.tourTitles[id] || id) : bank.meta.lessonLabel[id] || id }; });
        s.subs[k] = s.subs[k].filter(function (id) { return n[id]; });
      });
      function draw() {
        var avail = C.poolFor(bank, s).length;
        document.getElementById('srcs').innerHTML = C.SOURCES.filter(function (k) { return cnt(k); }).map(function (k) { return '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (s.sources.indexOf(k) >= 0) + '">' + C.SOURCE_LABEL[k] + ' <small>' + cnt(k) + '</small></button>'; }).join('');
        Object.keys(subList).forEach(function (k) {
          document.getElementById('box-' + k).hidden = s.sources.indexOf(k) < 0 || !subList[k].length;
          document.getElementById('sub-' + k).innerHTML = subList[k].map(function (x) { return '<button type="button" class="chip" data-sub="' + esc(x.id) + '" aria-pressed="' + (s.subs[k].indexOf(x.id) >= 0) + '">' + esc(x.label) + ' <small>' + x.n + '</small></button>'; }).join('');
        });
        document.getElementById('cnt').innerHTML = [10, 15, 20, 30, 60, 69].concat(avail > 69 ? [Math.min(100, avail)] : []).filter(function (n, i, a) { return a.indexOf(n) === i; }).map(function (n) { return '<button type="button" class="chip" data-n="' + n + '" aria-pressed="' + (s.count === n) + '">' + n + '</button>'; }).join('');
        document.getElementById('sec').innerHTML = [10, 15, 20, 30].map(function (n) { return '<button type="button" class="chip" data-s="' + n + '" aria-pressed="' + (s.seconds === n) + '">' + n + ' שנ׳</button>'; }).join('');
        info.innerHTML = '<b>' + bank.length + '</b> שאלות בבנק · <b>' + avail + '</b> בבחירה הנוכחית';
        document.getElementById('open').disabled = avail < 3;
      }
      draw();
      document.getElementById('srcs').onclick = function (e) { var b = e.target.closest('[data-k]'); if (!b) return; var k = b.dataset.k, i = s.sources.indexOf(k); if (i >= 0) { if (s.sources.length > 1) s.sources.splice(i, 1); } else s.sources.push(k); draw(); };
      [].forEach.call(document.querySelectorAll('.subs'), function (box) {
        box.onclick = function (e) {
          var b = e.target.closest('[data-sub]'); if (!b) return; var L = s.subs[box.dataset.src], i = L.indexOf(b.dataset.sub); if (i >= 0) L.splice(i, 1); else L.push(b.dataset.sub);
          // choisir un sous-thème = jouer seulement ce qui est choisi : les autres sources sans choix précis sont désactivées
          var picked = Object.keys(s.subs).filter(function (k) { return s.subs[k].length; });
          s.sources = picked.length ? picked : C.SOURCES.slice();
          draw();
        };
      });
      [].forEach.call(document.querySelectorAll('[data-none]'), function (b) { b.onclick = function () { s.subs[b.dataset.none] = []; var picked = Object.keys(s.subs).filter(function (k) { return s.subs[k].length; }); s.sources = picked.length ? picked : C.SOURCES.slice(); draw(); }; });
      document.getElementById('cnt').onclick = function (e) { var b = e.target.closest('[data-n]'); if (b) { s.count = +b.dataset.n; draw(); } };
      document.getElementById('sec').onclick = function (e) { var b = e.target.closest('[data-s]'); if (b) { s.seconds = +b.dataset.s; draw(); } };
      document.getElementById('open').onclick = function () {
        s.double = document.getElementById('dbl').checked; s.auto = document.getElementById('auto').checked;
        Object.keys(subList).forEach(function (k) { if (s.subs[k].length === subList[k].length) s.subs[k] = []; });
        var qs = newQuestions(bank, s);
        if (!qs.length) { toast('אין מספיק שאלות בבחירה הזאת'); return; }
        hostOpen(s, qs);
      };
    });
  }
  function newQuestions(bank, s) { return C.buildGame(bank, { count: s.count, sources: s.sources, subs: s.subs, tours: s.tours, seed: uid(), avoid: ls.get(UKEY, []), finalDouble: s.double }); }

  function hostOpen(settings, questions, keepPin, keepPlayers) {
    var pin = keepPin || C.makePin(), hid = (H && H.hid) || uid();
    var g = C.createGame(questions, { id: uid().slice(0, 8), seconds: settings.seconds });
    if (keepPlayers) Object.keys(keepPlayers).forEach(function (id) { var p = keepPlayers[id]; if (!p.removed) C.join(g, id, p.name, p.avatar); });
    startHost({ pin: pin, hid: hid, settings: settings, game: g, paused: false, phaseAt: Date.now() }, !keepPin);
  }
  function hostResume(saved) { startHost({ pin: saved.pin, hid: saved.hid, settings: saved.settings, game: saved.game, paused: !!saved.paused, phaseAt: saved.phaseAt || Date.now() }, false); toast('המשחק חודש — השחקנים מתחברים מחדש לבד'); }

  function startHost(h, checkPin) {
    if (H && H.net) { H.net.close(); clearInterval(H.loop); }
    if (P && P.net) { P.net.close(); clearInterval(P.loop); P = null; }
    H = h; H.lastV = 0; H.lastSend = 0; H.lastAnswerAt = 0; H.saveV = 0; H.clash = false;
    try { history.replaceState(null, '', location.pathname + (netKeep ? '?' + netKeep.slice(1) : '') + '#/host'); } catch (e) {}
    H.net = NET.connect(H.pin, {
      onStatus: function (s) { setNet(s); if (s === 'online') hostSend(true); },
      onMessage: hostMsg
    });
    H.loop = setInterval(hostTick, 200);
    // code déjà utilisé par un autre hôte ? on le saura s'il diffuse ; on change alors de code.
    H.clashCheck = !!checkPin;
    setTimeout(function () { if (H) H.clashCheck = false; }, 3500);
    hostRender(true);
  }
  function hostSave() {
    if (!H || H.saveV === H.game.version) return;
    H.saveV = H.game.version;
    ls.set(HKEY, { pin: H.pin, hid: H.hid, settings: H.settings, game: H.game, paused: H.paused, phaseAt: H.phaseAt, savedAt: Date.now() });
  }
  function hostSend(force) {
    if (!H) return;
    var now = Date.now(), g = H.game;
    if (!force && g.version === H.lastV && now - H.lastSend < BEAT_MS) return;
    var st = C.publicState(g, now); st.hid = H.hid; st.paused = H.paused;
    H.lastV = g.version; H.lastSend = now;
    H.net.send('state', st);
  }
  function hostMsg(ev, p) {
    if (!H || !p) return;
    var g = H.game, now = Date.now();
    if (ev === 'state' && p.hid && p.hid !== H.hid && H.clashCheck) {
      // deux salles avec le même code : on prend un autre code tant que personne n'est entré
      H.clashCheck = false;
      if (!Object.keys(g.players).length) { H.net.close(); clearInterval(H.loop); var s = H; H = null; s.pin = C.makePin(); startHost(s, true); toast('הקוד היה תפוס — נבחר קוד חדש'); }
      return;
    }
    if (ev === 'hello') { hostSend(true); return; }
    if (ev === 'join') {
      var r = C.join(g, String(p.id || ''), p.name, p.avatar);
      if (r.ok) { if (g.phase === 'lobby') beep(990, 0.07); hostSend(true); }
      return;
    }
    if (ev === 'answer') {
      if (p.gid !== g.id) return;
      var a = C.answer(g, String(p.id || ''), p.i, p.c, now);
      if (a.ok && !a.duplicate) H.lastAnswerAt = now;
      hostSend(true);
    }
  }
  function next() {
    var g = H.game, now = Date.now();
    if (g.phase === 'lobby' || g.phase === 'board') {
      if (g.i + 1 >= g.questions.length) C.finish(g); else C.startQuestion(g, now);
      if (g.phase === 'question') { var used = ls.get(UKEY, []); used.push(C.current(g).id); ls.set(UKEY, used.slice(-800)); }
    } else if (g.phase === 'question') C.reveal(g);
    else if (g.phase === 'reveal') { if (g.i + 1 >= g.questions.length) C.finish(g); else C.showBoard(g); }
    H.phaseAt = now; hostSend(true); hostSave(); hostRender(true);
  }
  function hostTick() {
    if (!H) return;
    var g = H.game, now = Date.now();
    if (g.phase === 'question') {
      var all = C.everyoneAnswered(g);
      if (now >= g.endAt + 800 || (all && now - H.lastAnswerAt > 700 && now > g.startAt)) { next(); return; }
      hostTimer(now);
    } else if (H.settings.auto && !H.paused) {
      if (g.phase === 'reveal' && now - H.phaseAt > REVEAL_MS) next();
      else if (g.phase === 'board' && now - H.phaseAt > BOARD_MS) next();
    }
    if (g.version !== H.renderV) { H.renderV = g.version; hostRender(false); }
    hostSend(false); hostSave();
  }
  function hostTimer(now) {
    var g = H.game, bar = document.getElementById('tbar'), num = document.getElementById('tnum'), rd = document.getElementById('readyN');
    if (now < g.startAt) { if (rd) rd.textContent = Math.ceil((g.startAt - now) / 1000); return; }
    if (rd) { hostRender(true); return; }
    if (!bar) return;
    var left = Math.max(0, g.endAt - now), s = Math.ceil(left / 1000);
    bar.style.transform = 'scaleX(' + (left / g.limitMs).toFixed(3) + ')';
    if (num.textContent !== String(s)) { num.textContent = s; num.className = s <= 5 ? 'hot' : ''; if (s <= 5 && s > 0) beep(520, 0.05, 'square', 0.03); }
  }

  var hostKey = '';
  function hostRender(force) {
    var g = H.game, now = Date.now(), st = C.publicState(g, now), key = g.phase + ':' + g.i + ':' + (g.phase === 'question' && now < g.startAt ? 'pre' : '');
    if (!force && key === hostKey && g.phase === 'question') { var c0 = document.getElementById('cnt'); if (c0) c0.textContent = Object.keys(g.answers[g.i] || {}).length + ' / ' + C.ranking(g.players).length + ' ענו'; return; }
    if (!force && key === hostKey && g.phase !== 'lobby') return;
    hostKey = key;
    var link = joinLink(H.pin), qn = 'שאלה ' + (g.i + 1) + ' / ' + g.questions.length;
    if (g.phase === 'lobby') {
      var rk = C.ranking(g.players);
      app.innerHTML = '<div class="card pinbox host"><div class="lbl">באפליקציה: 🏆 אלוף הקורס ← להצטרף · הקוד:</div><div class="big" id="bigPin">' + esc(H.pin) + '</div>' +
        '<div class="qr" id="qr"></div><div class="row"><button class="btn ghost small" id="share" type="button">📤 לשלוח ב־WhatsApp</button><button class="btn ghost small" id="copy" type="button">🔗 להעתיק קישור</button></div>' +
        '<h2 style="margin-top:16px">👥 ' + rk.length + ' שחקנים</h2><div class="roster" id="roster">' + rk.map(function (p) { return '<span class="who">' + esc(p.avatar) + ' ' + esc(p.name) + ' <button type="button" data-rm="' + esc(p.id) + '" aria-label="להוציא את ' + esc(p.name) + '">✕</button></span>'; }).join('') + '</div>' +
        (rk.length ? '' : '<p class="count">מחכים לשחקנים הראשונים…</p>') +
        '<button class="btn" id="start" type="button"' + (rk.length ? '' : ' disabled') + '>▶ להתחיל (' + g.questions.length + ' שאלות · ' + (g.limitMs / 1000) + ' שנ׳)</button>' +
        '<button class="btn ghost" id="cancel" type="button">✕ לסגור את החדר</button>' +
        '<p class="note">רוצים לשחק גם אתם? פותחים את הקישור בטלפון אחר. המנחה רואה את השאלות ואת התשובות הנכונות רק בסוף כל שאלה.</p></div>';
      try { if (window.qrcode) { var q = window.qrcode(0, 'M'); q.addData(link); q.make(); document.getElementById('qr').innerHTML = q.createSvgTag(5, 2); } } catch (e) {}
      document.getElementById('start').onclick = next;
      document.getElementById('cancel').onclick = function () { if (confirm('לסגור את החדר? השחקנים יצטרכו קוד חדש.')) hostClose(); };
      document.getElementById('copy').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('הקישור הועתק'); }, function () { prompt('הקישור:', link); }); };
      document.getElementById('share').onclick = function () {
        var txt = '🏆 אלוף הקורס — משחק חי!\nקוד: ' + H.pin + '\n' + link;
        if (navigator.share) navigator.share({ text: txt }).catch(function () {}); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
      };
      document.getElementById('roster').onclick = function (e) { var b = e.target.closest('[data-rm]'); if (b && confirm('להוציא את השחקן מהמשחק?')) { C.removePlayer(g, b.dataset.rm); hostSend(true); hostRender(true); } };
      return;
    }
    var q = C.current(g);
    var bar = '<div class="hostbar">' + (g.phase === 'question' ? '<button class="btn ghost small" id="skip" type="button">⏹ לסגור את השאלה</button>' :
      g.phase === 'podium' ? '' : '<button class="btn small" id="nx" type="button">' + (g.phase === 'reveal' && g.i + 1 >= g.questions.length ? '🏆 לפודיום' : 'הבא ▶') + '</button>' +
      (H.settings.auto ? '<button class="btn ghost small" id="pz" type="button">' + (H.paused ? '▶ להמשיך אוטומטית' : '⏸ עצירה') + '</button>' : '')) + '</div>';
    var qhead = '<div class="qhead"><span>' + qn + '</span><span class="lv">' + (LV[q.level] || '') + '</span><span>' + esc(q.cat) + '</span></div>' + (q.double ? '<div class="double">👑 שאלת האלוף — נקודות כפולות!</div>' : '');
    if (g.phase === 'question') {
      var box = g.answers[g.i] || {}, n = Object.keys(box).length;
      if (now < g.startAt) {
        app.innerHTML = '<div class="host">' + qhead + '<div class="qtext">' + esc(q.text) + '</div><div class="ready"><div class="ring" id="readyN">' + Math.ceil((g.startAt - now) / 1000) + '</div><br>קוראים… התשובות מגיעות</div></div>';
        return;
      }
      app.innerHTML = '<div class="host">' + qhead + '<div class="qtext">' + esc(q.text) + '</div><div class="timer"><i id="tbar"></i></div>' +
        '<div class="tnum"><span id="cnt">' + n + ' / ' + C.ranking(g.players).length + ' ענו</span><b id="tnum"></b></div>' +
        '<div class="ans">' + q.options.map(function (o, i) { return '<div class="o' + i + '"><span class="s" aria-hidden="true">' + SHAPES[i] + '</span>' + esc(o) + '</div>'; }).join('') + '</div>' + bar + '</div>';
      document.getElementById('skip').onclick = function () { next(); };
      hostTimer(now);
      return;
    }
    if (g.phase === 'reveal') {
      var d = C.distribution(g), tot = d.reduce(function (a, b) { return a + b; }, 0) || 1;
      app.innerHTML = '<div class="host">' + qhead + '<div class="qtext" style="font-size:19px">' + esc(q.text) + '</div><div class="ans">' + q.options.map(function (o, i) {
        return '<div class="o' + i + (i === q.correct ? ' good' : ' dim') + '"><span class="s" aria-hidden="true">' + SHAPES[i] + '</span>' + esc(o) + '<span class="n">' + d[i] + '</span><span class="bar" style="transform:scaleX(' + (d[i] / tot).toFixed(2) + ')"></span></div>';
      }).join('') + '</div><div class="expl"><b>✔ ' + esc(q.options[q.correct]) + '</b>' + (q.explanation ? '<br>' + esc(q.explanation) : '') + srcLink(q.sourceUrl) + '</div>' + bar + '</div>';
    } else if (g.phase === 'board') {
      app.innerHTML = '<div class="host"><h2 style="text-align:center;margin-top:12px">📊 הטבלה אחרי ' + (g.i + 1) + ' שאלות</h2>' + boardHtml(st, '') +
        (g.i + 1 === g.questions.length - 1 && g.questions[g.i + 1].double ? '<div class="double" style="margin-top:14px">👑 השאלה הבאה: שאלת האלוף — כפול נקודות!</div>' : '') + bar + '</div>';
    } else if (g.phase === 'podium') {
      var fs = C.finalStats(g); st.fastest = fs.fastest; st.streak = fs.streak; st.played = fs.played;
      app.innerHTML = '<div class="host">' + podiumHtml(st, '') +
        '<button class="btn" id="again" type="button">🔁 עוד סיבוב (אותם שחקנים, שאלות חדשות)</button>' +
        '<button class="btn ghost" id="setup" type="button">⚙️ משחק חדש עם הגדרות אחרות</button><button class="btn ghost" id="end" type="button">✕ לסגור את החדר</button></div>';
      if (!H.cheered) { H.cheered = true; confetti(); jingle(true); }
      document.getElementById('again').onclick = function () {
        loadBank().then(function (bank) {
          var s = H.settings, qs = newQuestions(bank, s);
          H.cheered = false; hostOpen(s, qs, H.pin, H.game.players);
        });
      };
      document.getElementById('setup').onclick = function () { hostClose(true); hostSetup(); };
      document.getElementById('end').onclick = function () { hostClose(); };
      return;
    }
    var nx = document.getElementById('nx'); if (nx) nx.onclick = next;
    var pz = document.getElementById('pz'); if (pz) pz.onclick = function () { H.paused = !H.paused; H.phaseAt = Date.now(); hostSave(); hostRender(true); hostSend(true); };
  }
  function hostClose(silent) {
    if (!H) return;
    clearInterval(H.loop); H.net.close(); H = null; ls.del(HKEY);
    try { history.replaceState(null, '', location.pathname + (netKeep ? '?' + netKeep.slice(1) : '')); } catch (e) {}
    if (!silent) home();
  }

  // Accès en lecture pour les tests navigateur (aucune action possible par ici).
  window.MDCampusApp = { host: function () { return H; }, player: function () { return P; } };

  // ---------- démarrage ----------
  if (/^#\/host/.test(location.hash)) {
    var saved = ls.get(HKEY, null);
    if (saved && saved.game && Date.now() - (saved.savedAt || 0) < 6 * 3600e3) hostResume(saved); else hostSetup();
  } else if (/^\d{5}$/.test(params.get('pin') || '')) {
    var mm = me();
    if (mm.name && mm.avatar && params.get('edit') !== '1') playerConnect(params.get('pin'), mm); else playerStart(params.get('pin'));
  } else home();
})();
