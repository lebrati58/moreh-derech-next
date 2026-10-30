/* Moreh Derech NEXT — visite guidée de première ouverture.
   Lionel (le guide) présente l'accueil étape par étape, avec un projecteur sur chaque zone.
   Se lance seul à la première visite ; se relance avec ?tour=1 ou window.MDOnboarding.start(). */
(function () {
  'use strict';
  var KEY = 'mdl_onboarded_v1';
  var AVATAR = 'assets/guide-lionel.webp';

  var T = {
    he: {
      name: 'ליונל · המורה דרך שלכם', next: 'הבא', back: 'הקודם', skip: 'דלגו', done: 'יאללה, מתחילים!', later: 'אחר כך',
      step: '{i} מתוך {n}', replay: 'הדרכה: איך משתמשים באפליקציה',
      s: [
        ['שלום, אני ליונל! 👋', 'אני אהיה המורה דרך שלכם באפליקציה. בחצי דקה אראה לכם איך מתכוננים כאן למבחן.'],
        ['כל יום מתחילים כאן ☀️', 'אתגר היום: כמה שאלות קצרות מכל הסיורים. 5 דקות ביום, ושומרים על רצף 🔥.'],
        ['המסע שלי 📈', 'כאן רואים את הכוכבים, ואת הטעויות שצריך לתקן. כל טעות חוזרת אליכם עד שהיא נלמדת.'],
        ['תאריכים ותקופות ⏳', 'חידון האירועים וציר הזמן: מחורבן הבית הראשון ועד הכיבוש הפרסי.'],
        ['22 הסיורים על המפה 🧭', 'בוחרים סיור, עוברים בין האתרים על המפה, ועונים על שאלות בכל תחנה. בשלוש רמות קושי.'],
        ['הכנה למבחן 🎓', 'מתכננים יום טיול וכותבים הדרכה, כמו בפרק השני של המבחן. עם תשובות לדוגמה.'],
        ['האתרים בתלת-ממד 🏛️', 'ירושלים, מצדה, קיסריה ועוד: מסובבים את המודל ולוחצים על כל חלק.'],
        ['זהו, אתם מוכנים! 🚌', 'ההמלצה שלי: מתחילים עכשיו באתגר היום. אפשר לראות את ההדרכה שוב בתחתית העמוד.']
      ]
    },
    fr: {
      name: 'Lionel · votre guide', next: 'Suivant', back: 'Retour', skip: 'Passer', done: 'Allez, on commence !', later: 'Plus tard',
      step: '{i} sur {n}', replay: 'Visite guidée : comment utiliser l’appli',
      s: [
        ['Salut, moi c’est Lionel ! 👋', 'Je suis votre guide dans l’appli. En 30 secondes, je vous montre comment réviser l’examen ici.'],
        ['Chaque jour, on commence ici ☀️', 'Le défi du jour : quelques questions rapides sur tous les סיורים. 5 minutes par jour, et on garde sa série 🔥.'],
        ['Mon parcours 📈', 'Vos étoiles et les erreurs à corriger. Chaque erreur revient jusqu’à ce qu’elle soit acquise.'],
        ['Dates et périodes ⏳', 'Le quiz des événements et la frise : de la destruction du Premier Temple à la conquête perse.'],
        ['Les 22 סיורים sur la carte 🧭', 'Choisissez un סיור, avancez de site en site sur la carte et répondez à chaque étape. Trois niveaux.'],
        ['Préparer l’examen 🎓', 'Planifier une journée et rédiger le guidage, comme dans la 2e partie de l’examen, avec des réponses modèles.'],
        ['Les sites en 3D 🏛️', 'Jérusalem, Massada, Césarée… Tournez la maquette et touchez chaque élément.'],
        ['C’est parti ! 🚌', 'Mon conseil : commencez maintenant par le défi du jour. La visite se relance en bas de la page.']
      ]
    },
    en: {
      name: 'Lionel · your guide', next: 'Next', back: 'Back', skip: 'Skip', done: 'Let’s go!', later: 'Later',
      step: '{i} of {n}', replay: 'Tour: how to use the app',
      s: [
        ['Hi, I’m Lionel! 👋', 'I’ll be your guide in the app. In 30 seconds I’ll show you how to prepare for the exam here.'],
        ['Start here every day ☀️', 'Today’s challenge: a few quick questions from all the tours. 5 minutes a day keeps your streak 🔥.'],
        ['My journey 📈', 'Your stars and the mistakes to fix. Each mistake comes back until you’ve learned it.'],
        ['Dates and periods ⏳', 'The events quiz and the timeline: from the First Temple’s destruction to the Persian conquest.'],
        ['The 22 tours on the map 🧭', 'Pick a tour, move from site to site on the map and answer at each stop. Three levels.'],
        ['Exam prep 🎓', 'Plan a tour day and write your guiding, like part two of the exam, with model answers.'],
        ['Sites in 3D 🏛️', 'Jerusalem, Masada, Caesarea… Spin the model and tap each part.'],
        ['You’re ready! 🚌', 'My tip: start with today’s challenge now. You can replay this tour at the bottom of the page.']
      ]
    }
  };
  T.ru = T.en;

  // Cible de chaque étape (null = bulle centrée, sans projecteur)
  var TARGETS = [null, '.qt-daily', '.qt-journey', '.hist', 'a.map-banner[href*="guided"]', '.exam-box', '.j3d', null];

  function lang() { var l = document.documentElement.lang || 'he'; return T[l] ? l : 'he'; }
  function txt() { return T[lang()]; }
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }
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
    '@media(prefers-reduced-motion:reduce){.ob-spot,.ob-card,.ob-veil{transition:none}}';

  var root, spot, card, i = 0, lastFocus = null;

  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div');
    root.innerHTML = '<div class="ob-veil"></div><div class="ob-spot" hidden></div>' +
      '<div class="ob-card" role="dialog" aria-modal="true" aria-labelledby="obT" aria-describedby="obP">' +
      '<div class="ob-head"><img class="ob-av" src="' + AVATAR + '" alt="" width="96" height="96" decoding="async">' +
      '<div><span class="ob-who" id="obWho"></span><b class="ob-t" id="obT"></b></div></div>' +
      '<p class="ob-p" id="obP"></p>' +
      '<div class="ob-foot"><div class="ob-dots" id="obDots" aria-hidden="true"></div><span class="sr" id="obStep"></span>' +
      '<button type="button" class="ob-btn ob-ghost" id="obBack"></button><button type="button" class="ob-btn ob-go" id="obNext"></button></div></div>';
    document.body.appendChild(root);
    spot = root.querySelector('.ob-spot'); card = root.querySelector('.ob-card');
    root.querySelector('#obNext').onclick = function () { go(i + 1); };
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
    root.querySelector('#obT').textContent = s[0];
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
    root.querySelector('#obNext').focus({ preventScroll: true });
  }

  function finish(startDaily) {
    markSeen();
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

  window.MDOnboarding = { start: start };
  function init() {
    replayButton();
    if (/[?&]tour=1/.test(location.search) || !seen()) setTimeout(start, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
