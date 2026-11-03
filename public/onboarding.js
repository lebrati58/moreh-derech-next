/* Moreh Derech NEXT — le guide Lionel.
   1re visite : il demande le prénom (gardé dans le téléphone seulement, jamais envoyé) puis présente l'accueil étape par étape.
   Ensuite, à chaque ouverture de l'appli (une fois par session) : un accueil personnalisé (prénom, défi du jour, série, erreurs à corriger)
   avec accès à la visite complète. Case « לא להציג שוב » pour ne plus le voir ; le bouton en bas de l'accueil et ?tour=1 le relancent. */
(function () {
  'use strict';
  var KEY = 'mdl_onboarded_v2', NEVER = 'mdl_guide_never', NAME = 'mdl_guide_name', SESSION = 'mdl_guide_session';
  var AVATAR = 'assets/guide-lionel.webp';

  var T = {
    he: {
      ask: 'איך קוראים לך?', askPh: 'שם פרטי (לא חובה)', askNote: 'נשמר רק בטלפון שלך.', never: 'לא להציג שוב',
      hi: 'שלום שוב{n}! 👋', hiNew: 'שלום{n}! 👋', close: 'סגירה', tour: 'סיור מודרך באפליקציה', goDaily: 'לאתגר היום ☀️', goFix: 'לתקן טעויות 📈', goOn: 'יאללה, ממשיכים',
      dailyTodo: 'אתגר היום עוד מחכה לך — 5 דקות.', dailyDone: 'כבר עשית את אתגר היום — כל הכבוד!', streak: 'רצף של {k} ימים 🔥 — לא לשבור אותו!', fix: 'יש {k} טעויות לתיקון במסע שלך.', none: 'מה לומדים היום? בחרו סיור על המפה או אתר בתלת-ממד.',
      name: 'ליונל · המורה דרך שלכם', next: 'הבא', back: 'הקודם', skip: 'דלגו', done: 'יאללה, מתחילים!', later: 'אחר כך',
      step: '{i} מתוך {n}', replay: 'הדרכה: איך משתמשים באפליקציה',
      s: [
        ['שלום, אני ליונל! 👋', 'אני אהיה המורה דרך שלכם באפליקציה. בחצי דקה אראה לכם איך מתכוננים כאן למבחן.'],
        ['כל יום מתחילים כאן ☀️', 'אתגר היום: כמה שאלות קצרות מכל הסיורים. 5 דקות ביום, ושומרים על רצף 🔥.'],
        ['המסע שלי 📈', 'כאן רואים את הכוכבים, ואת הטעויות שצריך לתקן. כל טעות חוזרת אליכם עד שהיא נלמדת.'],
        ['תאריכים ותקופות ⏳', 'חידון האירועים וציר הזמן: מהתקופה הכלקוליתית ועד מדינת ישראל — לפי חומרי הקורס.'],
        ['22 הסיורים על המפה 🧭', 'בוחרים סיור, עוברים בין האתרים על המפה, ועונים על שאלות בכל תחנה. בשלוש רמות קושי.'],
        ['הכנה למבחן 🎓', 'מתכננים יום טיול וכותבים הדרכה, כמו בפרק השני של המבחן. עם תשובות לדוגמה.'],
        ['האתרים בתלת-ממד 🏛️', 'ירושלים, מצדה, קיסריה ועוד: מסובבים את המודל ולוחצים על כל חלק.'],
        ['הסרגל למטה 🧭', 'בכל עמוד: 🏠 בית, 🗺️ מפה, 📈 המסע שלי ו-🏆 הכיתה — תחרות הכיתה ולוח המובילים.'],
        ['שלושת הקווים ☰ עוד', 'כאן כל השאר: 🎓 אתגר המבחן, 🌿 ספריית רט״ג, ספריית הסיורים, קטעי דרך של הקהילה, הוספת מסמך, יצירת מסלול, חידון חי לקבוצה, ו-💡 רעיון או טעות לצוות.'],
        ['זהו, אתם מוכנים! 🚌', 'ההמלצה שלי: מתחילים עכשיו באתגר היום. אפשר לראות את ההדרכה שוב בתחתית העמוד.']
      ]
    },
    fr: {
      ask: 'Comment tu t’appelles ?', askPh: 'Prénom (facultatif)', askNote: 'Gardé seulement dans ton téléphone.', never: 'Ne plus afficher',
      hi: 'Re-bonjour{n} ! 👋', hiNew: 'Bonjour{n} ! 👋', close: 'Fermer', tour: 'Visite guidée de l’appli', goDaily: 'Au défi du jour ☀️', goFix: 'Corriger mes erreurs 📈', goOn: 'Allez, on continue',
      dailyTodo: 'Le défi du jour t’attend — 5 minutes.', dailyDone: 'Défi du jour déjà fait — bravo !', streak: 'Série de {k} jours 🔥 — ne la casse pas !', fix: '{k} erreurs à corriger dans ton parcours.', none: 'On révise quoi aujourd’hui ? Un סיור sur la carte ou un site en 3D.',
      name: 'Lionel · votre guide', next: 'Suivant', back: 'Retour', skip: 'Passer', done: 'Allez, on commence !', later: 'Plus tard',
      step: '{i} sur {n}', replay: 'Visite guidée : comment utiliser l’appli',
      s: [
        ['Salut, moi c’est Lionel ! 👋', 'Je suis votre guide dans l’appli. En 30 secondes, je vous montre comment réviser l’examen ici.'],
        ['Chaque jour, on commence ici ☀️', 'Le défi du jour : quelques questions rapides sur tous les סיורים. 5 minutes par jour, et on garde sa série 🔥.'],
        ['Mon parcours 📈', 'Vos étoiles et les erreurs à corriger. Chaque erreur revient jusqu’à ce qu’elle soit acquise.'],
        ['Dates et périodes ⏳', 'Le quiz des événements et la frise : de l’époque chalcolithique à l’État d’Israël, d’après le cours.'],
        ['Les 22 סיורים sur la carte 🧭', 'Choisissez un סיור, avancez de site en site sur la carte et répondez à chaque étape. Trois niveaux.'],
        ['Préparer l’examen 🎓', 'Planifier une journée et rédiger le guidage, comme dans la 2e partie de l’examen, avec des réponses modèles.'],
        ['Les sites en 3D 🏛️', 'Jérusalem, Massada, Césarée… Tournez la maquette et touchez chaque élément.'],
        ['La barre du bas 🧭', 'Sur chaque page : 🏠 Accueil, 🗺️ Carte, 📈 Mon parcours et 🏆 Classe — le concours et le classement.'],
        ['Les trois traits ☰ Plus', 'Tout le reste est ici : 🎓 Défi de l’examen, 🌿 Bibliothèque RTG, bibliothèque des סיורים, parcours de la communauté, ajouter un document, créer un parcours, quiz en direct pour un groupe, et 💡 une idée ou une erreur à signaler.'],
        ['C’est parti ! 🚌', 'Mon conseil : commencez maintenant par le défi du jour. La visite se relance en bas de la page.']
      ]
    },
    en: {
      ask: 'What’s your name?', askPh: 'First name (optional)', askNote: 'Kept on your phone only.', never: 'Don’t show again',
      hi: 'Welcome back{n}! 👋', hiNew: 'Hi{n}! 👋', close: 'Close', tour: 'Guided tour of the app', goDaily: 'Today’s challenge ☀️', goFix: 'Fix my mistakes 📈', goOn: 'Let’s go',
      dailyTodo: 'Today’s challenge is waiting — 5 minutes.', dailyDone: 'Today’s challenge done — well done!', streak: '{k}-day streak 🔥 — keep it going!', fix: '{k} mistakes to fix in your journey.', none: 'What shall we study today? A tour on the map or a 3D site.',
      name: 'Lionel · your guide', next: 'Next', back: 'Back', skip: 'Skip', done: 'Let’s go!', later: 'Later',
      step: '{i} of {n}', replay: 'Tour: how to use the app',
      s: [
        ['Hi, I’m Lionel! 👋', 'I’ll be your guide in the app. In 30 seconds I’ll show you how to prepare for the exam here.'],
        ['Start here every day ☀️', 'Today’s challenge: a few quick questions from all the tours. 5 minutes a day keeps your streak 🔥.'],
        ['My journey 📈', 'Your stars and the mistakes to fix. Each mistake comes back until you’ve learned it.'],
        ['Dates and periods ⏳', 'The events quiz and the timeline: from the Chalcolithic to the State of Israel, following the course.'],
        ['The 22 tours on the map 🧭', 'Pick a tour, move from site to site on the map and answer at each stop. Three levels.'],
        ['Exam prep 🎓', 'Plan a tour day and write your guiding, like part two of the exam, with model answers.'],
        ['Sites in 3D 🏛️', 'Jerusalem, Masada, Caesarea… Spin the model and tap each part.'],
        ['The bottom bar 🧭', 'On every page: 🏠 Home, 🗺️ Map, 📈 My journey and 🏆 Class — the class contest and leaderboard.'],
        ['The three lines ☰ More', 'Everything else is here: 🎓 Exam challenge, 🌿 Parks Authority library, tour library, community routes, add a document, create a route, live group quiz, and 💡 an idea or mistake to report.'],
        ['You’re ready! 🚌', 'My tip: start with today’s challenge now. You can replay this tour at the bottom of the page.']
      ]
    }
  };
  T.ru = T.en;

  // Cible de chaque étape (null = bulle centrée, sans projecteur)
  var TARGETS = [null, '.qt-daily', '.qt-journey', '.hist', 'a.map-banner[href*="guided"]', '.exam-box', '.j3d', '#mdTabbar', '#mdMore', null];

  function lang() { var l = document.documentElement.lang || 'he'; return T[l] ? l : 'he'; }
  function txt() { return T[lang()]; }
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  function get(k, store) { try { return (store || localStorage).getItem(k) || ''; } catch (e) { return ''; } }
  function set(k, v, store) { try { if (v) (store || localStorage).setItem(k, v); else (store || localStorage).removeItem(k); } catch (e) {} }
  function userName() { var n = get(NAME); if (!n && window.MDProgress) { try { n = (MDProgress.player().name || ''); } catch (e) {} } return String(n).trim().slice(0, 24); }
  function withName(tpl) { var n = userName(); return tpl.replace('{n}', n ? (lang() === 'fr' ? ' ' : ', ') + n : ''); }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css =
    '.ob-veil{position:fixed;inset:0;z-index:200;background:#020616c4;transition:opacity .25s}' +
    '.ob-spot{position:fixed;z-index:201;border-radius:20px;box-shadow:0 0 0 3px #ffd878,0 0 0 9999px #020616c4;pointer-events:none;transition:top .3s,left .3s,width .3s,height .3s}' +
    '.ob-card{position:fixed;z-index:202;inset-inline:12px;max-width:520px;margin-inline:auto;background:#16224a;border:1px solid #ffd87899;border-radius:22px;padding:16px 16px 14px;color:#fff;box-shadow:0 14px 40px #000b;font-family:inherit;transition:top .3s,bottom .3s}' +
    '.ob-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}' +
    '.ob-av{flex:none;width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #ffd878;box-shadow:0 4px 0 #8a4a10;background:#22306a}' +
    '.ob-card.big .ob-av{width:96px;height:96px}' +
    '.ob-who{font-size:13px;font-weight:800;color:#ffd878}' +
    '.ob-t{display:block;font-size:19px;font-weight:1000;line-height:1.25;margin-top:2px}' +
    '.ob-p{margin:0;font-size:16px;line-height:1.55;color:#e6ecff}' +
    '.ob-foot{display:flex;align-items:center;gap:8px;margin-top:14px}' +
    '.ob-dots{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:5px}.ob-dots i{width:7px;height:7px;border-radius:50%;background:#3d5190}.ob-dots i.on{background:#ffd878;width:18px;border-radius:4px}' +
    '.ob-btn{min-height:44px;white-space:nowrap;border:0;border-radius:13px;padding:10px 16px;font:inherit;font-size:15px;font-weight:900;cursor:pointer}' +
    '.ob-go{background:#ffd66e;color:#1c1f45;box-shadow:0 4px 0 #b98a2e}' +
    '.ob-ghost{background:transparent;color:#aebce6;border:1px solid #3d5190}' +
    '.ob-btn:focus-visible{outline:2px solid #94f5de;outline-offset:2px}' +
    '.ob-replay{display:flex;align-items:center;justify-content:center;gap:10px;margin:12px auto 0;padding:8px 14px;min-height:44px;border-radius:12px;background:transparent;border:1px dashed #3d5190;color:#aebce6;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}' +
    '.ob-replay img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #ffd878}' +
    '.ob-ask{margin:12px 0 2px}.ob-ask label{display:block;font-size:13px;font-weight:800;color:#ffd878;margin-bottom:6px}' +
    '.ob-ask input{width:100%;box-sizing:border-box;min-height:46px;border-radius:13px;border:1px solid #3d5190;background:#0b1232;color:#fff;font:inherit;font-size:17px;padding:10px 12px}' +
    '.ob-ask small{display:block;margin-top:5px;font-size:12px;color:#aebce6}' +
    '.ob-never{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:#aebce6;cursor:pointer}.ob-never input{width:20px;height:20px;margin:0;accent-color:#ffd878}' +
    '.ob-tips{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:6px;font-size:15.5px;line-height:1.45;color:#e6ecff}' +
    '.ob-x{position:absolute;top:8px;inset-inline-end:8px;min-width:40px;min-height:40px;border:0;background:none;color:#aebce6;font-size:20px;cursor:pointer}' +
    '.ob-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.ob-acts .ob-btn{flex:1 1 auto}' +
    '@media(prefers-reduced-motion:reduce){.ob-spot,.ob-card,.ob-veil{transition:none}}';

  var root, spot, card, i = 0, lastFocus = null;

  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div');
    root.innerHTML = '<div class="ob-veil"></div><div class="ob-spot" hidden></div>' +
      '<div class="ob-card" role="dialog" aria-modal="true" aria-labelledby="obT" aria-describedby="obP">' +
      '<div class="ob-head"><img class="ob-av" src="' + AVATAR + '" alt="" width="96" height="96" decoding="async">' +
      '<div><span class="ob-who" id="obWho"></span><b class="ob-t" id="obT"></b></div></div>' +
      '<p class="ob-p" id="obP"></p><div class="ob-ask" id="obAsk" hidden><label for="obName"></label><input id="obName" type="text" autocomplete="given-name" maxlength="24" enterkeyhint="next"><small></small></div>' +
      '<div class="ob-foot"><div class="ob-dots" id="obDots" aria-hidden="true"></div><span class="sr" id="obStep"></span>' +
      '<button type="button" class="ob-btn ob-ghost" id="obBack"></button><button type="button" class="ob-btn ob-go" id="obNext"></button></div>' +
      '<label class="ob-never"><input type="checkbox" id="obNever"><span></span></label></div>';
    document.body.appendChild(root);
    spot = root.querySelector('.ob-spot'); card = root.querySelector('.ob-card');
    root.querySelector('#obNext').onclick = function () { if (i === 0) saveName(); go(i + 1); };
    root.querySelector('#obName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveName(); go(1); } });
    root.querySelector('#obNever').checked = get(NEVER) === '1';
    root.querySelector('#obBack').onclick = function () { if (i === 0 || i === TARGETS.length - 1) finish(false); else go(i - 1); };
    root.querySelector('.ob-veil').onclick = function () {};
    document.addEventListener('keydown', onKey);
    addEventListener('resize', place); addEventListener('scroll', place, { passive: true });
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') finish(false);
    else if (e.key === 'Tab') { // garder le focus dans la bulle
      var b = card.querySelectorAll('button'), f = b[0], l = b[b.length - 1];
      if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
      else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
    }
  }

  function target() { var s = TARGETS[i]; return s ? document.querySelector(s) : null; }

  function place() {
    if (!root) return;
    var el = target(), pad = 6;
    if (!el) { spot.hidden = true; root.querySelector('.ob-veil').style.opacity = 1; card.style.top = '50%'; card.style.bottom = 'auto'; card.style.transform = 'translateY(-50%)'; return; }
    var r = el.getBoundingClientRect();
    spot.hidden = false; root.querySelector('.ob-veil').style.opacity = 0;
    spot.style.top = (r.top - pad) + 'px'; spot.style.left = (r.left - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
    card.style.transform = 'none';
    var below = r.top + r.height / 2 < innerHeight / 2; // cible en haut → bulle en bas, et inversement
    if (below) { card.style.top = 'auto'; card.style.bottom = 'calc(14px + env(safe-area-inset-bottom))'; }
    else { card.style.bottom = 'auto'; card.style.top = 'calc(14px + env(safe-area-inset-top))'; }
  }

  function go(n) {
    var t = txt(), N = TARGETS.length;
    if (n >= N) { finish(true); return; }
    i = Math.max(0, n);
    var s = t.s[i];
    root.querySelector('#obWho').textContent = t.name;
    var title = s[0];
    if (i === 0) title = withName(t.hiNew) + ' ' + title.replace(/^[^,!]*[,!]\s*/, '').replace(/👋/, '');
    else if ((i === 1 || i === N - 1) && userName()) title = userName() + (lang() === 'fr' ? ', ' : ', ') + title;
    root.querySelector('#obT').textContent = title.trim();
    var ask = root.querySelector('#obAsk'); ask.hidden = i !== 0;
    if (i === 0) { ask.querySelector('label').textContent = t.ask; var inp = ask.querySelector('input'); inp.placeholder = t.askPh; inp.value = userName(); ask.querySelector('small').textContent = t.askNote; }
    root.querySelector('.ob-never span').textContent = t.never;
    root.querySelector('#obP').textContent = s[1];
    root.querySelector('#obStep').textContent = t.step.replace('{i}', i + 1).replace('{n}', N);
    root.querySelector('#obDots').innerHTML = TARGETS.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('');
    var last = i === N - 1;
    root.querySelector('#obNext').textContent = last ? t.done : t.next;
    root.querySelector('#obBack').textContent = i === 0 ? t.skip : last ? t.later : t.back;
    card.classList.toggle('big', !TARGETS[i]);
    var el = target();
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight - 260) el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
    place(); setTimeout(place, reduce ? 0 : 380);
    if (i === 0 && !userName()) setTimeout(function () { var x = root && root.querySelector('#obName'); if (x) x.focus({ preventScroll: true }); }, 60); else root.querySelector('#obNext').focus({ preventScroll: true });
  }

  function saveName() { var x = root && root.querySelector('#obName'); if (x) set(NAME, x.value.trim().slice(0, 24)); }
  function keepNever() { var c = root && root.querySelector('#obNever'); if (c) set(NEVER, c.checked ? '1' : ''); }
  function finish(startDaily) {
    keepNever(); markSeen();
    document.removeEventListener('keydown', onKey);
    removeEventListener('resize', place); removeEventListener('scroll', place);
    if (root) root.remove(); root = null;
    if (startDaily) { var d = document.querySelector('.qt-daily'); if (d) { location.href = d.getAttribute('href'); return; } }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function start() {
    if (root) return;
    lastFocus = document.activeElement;
    scrollTo(0, 0);
    build(); go(0);
  }

  // Accueil personnalisé à chaque ouverture (après la 1re visite complète)
  function welcome() {
    if (root) return;
    var t = txt(), P = window.MDProgress, tips = [], daily = null, streak = 0, fix = 0;
    try { daily = P && P.dailyResult(); streak = P ? P.dailyStreak() : 0; fix = P ? P.mistakes().length : 0; } catch (e) {}
    tips.push(daily ? t.dailyDone : t.dailyTodo);
    if (streak > 1) tips.push(t.streak.replace('{k}', streak));
    if (fix > 0) tips.push(t.fix.replace('{k}', fix));
    if (daily && !fix) tips.push(t.none);
    var main = !daily ? ['daily', t.goDaily] : fix ? ['fix', t.goFix] : ['close', t.goOn];
    lastFocus = document.activeElement;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div');
    root.innerHTML = '<div class="ob-veil"></div><div class="ob-card big" role="dialog" aria-modal="true" aria-labelledby="obT" style="top:50%;transform:translateY(-50%)">' +
      '<button type="button" class="ob-x" aria-label="' + esc(t.close) + '">✕</button>' +
      '<div class="ob-head"><img class="ob-av" src="' + AVATAR + '" alt="" width="96" height="96"><div><span class="ob-who">' + esc(t.name) + '</span><b class="ob-t" id="obT">' + esc(withName(t.hi)) + '</b></div></div>' +
      '<ul class="ob-tips">' + tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<div class="ob-acts"><button type="button" class="ob-btn ob-ghost" id="obTour">' + esc(t.tour) + '</button><button type="button" class="ob-btn ob-go" id="obMain">' + esc(main[1]) + '</button></div>' +
      '<label class="ob-never"><input type="checkbox" id="obNever"' + (get(NEVER) === '1' ? ' checked' : '') + '><span>' + esc(t.never) + '</span></label></div>';
    document.body.appendChild(root); card = root.querySelector('.ob-card');
    function close() { keepNever(); document.removeEventListener('keydown', esc1); if (root) root.remove(); root = null; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    function esc1(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', esc1);
    root.querySelector('.ob-x').onclick = close;
    root.querySelector('#obTour').onclick = function () { close(); start(); };
    root.querySelector('#obMain').onclick = function () {
      var sel = main[0] === 'daily' ? '.qt-daily' : main[0] === 'fix' ? '.qt-journey' : null, a = sel && document.querySelector(sel);
      close(); if (a) location.href = a.getAttribute('href');
    };
    root.querySelector('#obMain').focus({ preventScroll: true });
  }

  function replayButton() {
    var anchor = document.querySelector('.guide-link');
    if (!anchor || document.getElementById('obReplay')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ob-replay'; b.id = 'obReplay';
    b.innerHTML = '<img src="' + AVATAR + '" alt="" width="30" height="30"><span></span>';
    b.onclick = start;
    anchor.insertAdjacentElement('afterend', b);
    function label() { b.querySelector('span').textContent = txt().replay; }
    label(); addEventListener('md-lang', label);
  }

  window.MDOnboarding = { start: start, welcome: welcome };
  function init() {
    replayButton();
    if (/[?&]tour=1/.test(location.search)) { setTimeout(start, 500); return; }
    if (navigator.webdriver && get('mdl_guide_test') !== '1') return;   // tests automatisés : pas de guide, sauf demande explicite
    if (get(NEVER) === '1' || get(SESSION, sessionStorage) === '1') return;   // déjà vu pendant cette ouverture de l'appli
    set(SESSION, '1', sessionStorage);
    setTimeout(seen() ? welcome : start, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
