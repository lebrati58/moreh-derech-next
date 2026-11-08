/* Mode Confort — indépendant du niveau choisi (Amateur, Explorateur, Doctorant, Guide).
 * Gros caractères, boutons élargis, contraste élevé, lecture vocale des questions et réponses
 * (vitesse réglable) et désactivation facultative du chronomètre dans les quiz d'entraînement.
 * Tout reste dans le téléphone (localStorage) : rien n'est envoyé, aucune donnée de jeu n'est modifiée.
 * À charger dans le <head> : les classes sont posées avant l'affichage (pas de clignotement).
 * API : window.MDComfort = { get, set, open, noTimer, speak, readCurrent, stop }  ·  évènement window 'md-comfort'. */
(function () {
  'use strict';
  if (window.MDComfort) return;
  var KEY = 'mdl_comfort_v1';
  var DEF = { on: false, size: 125, wide: true, contrast: true, voice: true, auto: true, rate: 1, noTimer: false };
  var SIZES = [100, 125, 150];
  var me = document.currentScript, HOME = !!(me && me.dataset.scope === 'home');
  var html = document.documentElement;

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = typeof s[k] === typeof DEF[k] ? s[k] : DEF[k]; });
    if (SIZES.indexOf(o.size) === -1) o.size = DEF.size;
    o.rate = Math.min(1.6, Math.max(0.6, Math.round(o.rate * 10) / 10));
    return o;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // ---------- 1. Classes sur <html> (avant l'affichage) ----------
  function apply() {
    var on = S.on;
    html.classList.toggle('cf-on', on);
    html.classList.toggle('cf-big', on && S.size > 100);
    html.classList.toggle('cf-wide', on && S.wide);
    html.classList.toggle('cf-contrast', on && S.contrast);
    html.classList.toggle('cf-home', HOME);
    // Zoom de la mise en page plafonné pour garder au moins 320 px de largeur utile (sinon les pages débordent
    // sur un téléphone) ; le reste de l'agrandissement est appliqué au texte des questions, réponses et explications.
    var want = (on ? S.size : 100) / 100, w = window.innerWidth || html.clientWidth || 360;
    var layout = Math.min(want, Math.max(1, Math.floor(w / 320 * 100) / 100));
    html.style.setProperty('--cf-zoom', String(layout));
    html.style.setProperty('--cf-text', String(Math.round(want / layout * 100) / 100));
  }
  apply();
  window.addEventListener('resize', function () { if (S.on) apply(); });

  var Y = '#ffe14d';
  var css =
    /* Gros caractères : zoom réel (le texte ET la mise en page grandissent, comme le zoom du navigateur). */
    'html.cf-big body{zoom:var(--cf-zoom)}' +
    'html.cf-big.cf-home body{zoom:1}html.cf-big.cf-home body>main{zoom:var(--cf-zoom)}' + /* accueil : la barre du haut garde sa taille (elle déborderait à 150 %) */
    'html.cf-big .top{flex-wrap:wrap}' +
    'html.cf-big .exam-modes{grid-template-columns:repeat(2,1fr)!important}html.cf-big .exam-modes a{padding:6px 4px!important;text-align:center}' +
    'html.cf-big :is(#qtext,.question h2,.question-text,.qtext,#pPrompt,.card p.q,.answers,#answers,.opts,#pOpts,.feedback,.fb,#expl,.qhint,[data-comfort-q],.cf-text){zoom:var(--cf-text)}' +
    /* Boutons élargis */
    'html.cf-wide :is(button,[role=button],select,a.go,a.cta,a.btn,.btn,.cta){min-height:56px}' +
    'html.cf-wide :is(.answers,#answers,.opts,#pOpts){display:grid!important;grid-template-columns:1fr!important;gap:12px!important}' +
    'html.cf-wide :is(.answers,#answers,.opts,#pOpts)>button,html.cf-wide button.ans{width:100%!important;min-height:64px!important;padding:14px 16px!important;font-size:1.12em!important;line-height:1.35!important}' +
    'html.cf-wide input[type=checkbox],html.cf-wide input[type=radio]{width:24px;height:24px}' +
    /* Contraste élevé : noir / blanc / jaune ; les états (bonne / mauvaise réponse, choisi) restent distincts. */
    'html.cf-contrast{color-scheme:dark}' +
    'html.cf-contrast body{background:#000!important;background-image:none!important;color:#fff!important}' +
    'html.cf-contrast body :not(img,video,canvas,svg,svg *,iframe,picture,.leaflet-container,.leaflet-container *,.cf-keep,.cf-keep *,.ob-veil,.ob-spot){background-image:none!important;text-shadow:none!important;box-shadow:none!important}' +
    'html.cf-contrast body :is(main,section,article,header,footer,nav,aside,div,p,li,ul,ol,a,button,label,span,small,b,strong,em,i,h1,h2,h3,h4,h5,td,th,details,summary,fieldset,form,dialog):not(.cf-keep,.cf-keep *,.leaflet-container *,.ob-veil,.ob-spot){background-color:#000!important;color:#fff!important;border-color:#fff!important}' +
    /* la visite guidée garde son voile et son projecteur */
    'html.cf-contrast .ob-spot{box-shadow:0 0 0 4px ' + Y + ',0 0 0 9999px #000d!important}html.cf-contrast .ob-card{border:2px solid ' + Y + '!important}' +
    'html.cf-contrast body :is(main,section,article,.card,.question,.shell>*,dialog){background-color:#000!important}' +
    'html.cf-contrast body :is(button,[role=button],a.go,a.cta,a.btn,.btn,.cta,a.mini,a.map-banner,a.campus,a.j3d,a.exam-main,a.qt-daily,a.qt-journey,a.qt-history,a.hist-tl,select,input,textarea):not(.cf-keep *){background-color:#000!important;color:#fff!important;border:2px solid ' + Y + '!important}' +
    'html.cf-contrast body a:not([class]){color:' + Y + '!important;text-decoration:underline!important}' +
    'html.cf-contrast.cf-on.cf-on body :is([aria-pressed=true],[aria-checked=true],[aria-selected=true],[aria-current=page],[aria-current=true],.selected,.sel,.picked)' +
    '{background-color:' + Y + '!important;color:#000!important;border-color:' + Y + '!important}' +
    'html.cf-contrast.cf-on.cf-on body :is([aria-pressed=true],[aria-checked=true],[aria-selected=true],[aria-current=page],[aria-current=true],.selected,.sel,.picked) *{color:#000!important}' +
    'html.cf-contrast.cf-on.cf-on body :is([aria-pressed=true],[aria-checked=true],[aria-selected=true],[aria-current=page],[aria-current=true],.selected,.sel,.picked,.correct,.good,.ok,.right,.win,.wrong,.badp,.bad,.err,.lose) *{background-color:transparent!important}' +
    'html.cf-contrast.cf-on.cf-on body :is(.correct,.good,.ok,.right,.win){background-color:#005a24!important;color:#fff!important;border:3px solid #7dff9b!important}' +
    'html.cf-contrast.cf-on.cf-on body :is(.wrong,.badp,.bad,.err,.lose){background-color:#7a0010!important;color:#fff!important;border:3px solid #ff9aa5!important}' +
    'html.cf-contrast body :is(.timer,.track,[role=progressbar]){background-color:#333!important;border:1px solid #fff!important}' +
    'html.cf-contrast.cf-on.cf-on body :is(.timer>i,#tbar,#pTimer,.track>span,#fill,[role=progressbar]>*){background-color:' + Y + '!important}' +
    'html.cf-contrast body :is(:focus-visible){outline:3px solid ' + Y + '!important;outline-offset:2px!important}' +
    'html.cf-contrast body :disabled{opacity:1!important}' +
    /* Boutons flottants et panneau du mode Confort (toujours lisibles, jamais zoomés deux fois) */
    '.cf-fab{position:fixed;z-index:2300;inset-inline-end:12px;bottom:calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}' +
    'html.cf-on:not(.cf-home) body{padding-bottom:calc(150px + env(safe-area-inset-bottom))}' + /* le dernier bouton ne reste pas sous les boutons flottants */
    '.cf-fab.tabbar{bottom:calc(78px + env(safe-area-inset-bottom))}' +
    '.cf-fab button{min-width:52px;min-height:52px;border-radius:50%;border:2px solid ' + Y + ';background:#101a3d;color:#fff;font:900 18px/1 system-ui,Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px #0008}' +
    '.cf-fab button.on{background:' + Y + ';color:#000}' +
    '.cf-fab button:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
    '.cf-veil{position:fixed;inset:0;z-index:2600;background:#000b;display:flex;align-items:flex-end;justify-content:center}' +
    '.cf-panel{width:min(520px,100%);max-height:92dvh;overflow:auto;background:#0b1430;color:#fff;border:2px solid ' + Y + ';border-radius:20px 20px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));font:16px/1.45 system-ui,-apple-system,Arial,sans-serif}' +
    '@media(min-width:700px){.cf-veil{align-items:center}.cf-panel{border-radius:20px}}' +
    '.cf-panel h2{margin:0 0 4px;font-size:21px}.cf-panel .cf-sub{margin:0 0 14px;color:#dbe4ff;font-size:14.5px}' +
    '.cf-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:8px 0;border-top:1px solid #2c3b6e}' +
    '.cf-row label,.cf-row .lb{flex:1;font-weight:700;font-size:17px;cursor:pointer}.cf-row small{display:block;font-weight:500;font-size:13.5px;color:#c9d5f5}' +
    '.cf-row input[type=checkbox]{width:28px;height:28px;flex:none;accent-color:' + Y + ';cursor:pointer}' +
    '.cf-rate{flex-wrap:wrap}.cf-row input[type=range]{flex:1;min-width:0;height:36px;accent-color:' + Y + '}' +
    '.cf-seg{display:flex;gap:6px}.cf-seg button,.cf-btn{min-height:48px;min-width:56px;border-radius:12px;border:2px solid #6c80bd;background:#16224a;color:#fff;font:800 16px system-ui,Arial,sans-serif;padding:6px 12px;cursor:pointer}' +
    '.cf-seg button[aria-pressed=true]{background:' + Y + ';color:#000;border-color:' + Y + '}' +
    '.cf-master{border-top:0}.cf-master .lb{font-size:19px}' +
    '.cf-dis{opacity:.45;pointer-events:none}' +
    '.cf-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}.cf-btn.main{background:' + Y + ';color:#000;border-color:' + Y + '}' +
    '.cf-note{margin:8px 0 0;font-size:13.5px;color:#c9d5f5}' +
    '.cf-panel :focus-visible{outline:3px solid #fff;outline-offset:2px}' +
    '.cf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
  var st = document.createElement('style'); st.id = 'cf-style'; st.textContent = css;
  (document.head || html).appendChild(st);

  // ---------- 2. Textes (4 langues) ----------
  var TX = {
    he: { title: '♿ מצב נוחות', sub: 'לא תלוי ברמה שבחרתם. ההגדרות נשמרות רק בטלפון הזה.', master: 'להפעיל מצב נוחות', size: 'אותיות גדולות', wide: 'כפתורים רחבים', wideS: 'תשובה אחת בכל שורה', contrast: 'ניגודיות גבוהה', contrastS: 'שחור, לבן וצהוב', voice: 'הקראה של השאלות והתשובות', voiceS: 'בקול של הטלפון', auto: 'להקריא אוטומטית כל שאלה חדשה', rate: 'מהירות הקראה', test: '🔊 ניסיון', noTimer: 'בלי שעון', noTimerS: 'בחידוני אימון (מבחן חלק א׳, ציר הזמן, אדריכלות). מבחן, סימולציה ומשחק הכיתה החי נשארים עם שעון.', done: 'סיום', reset: 'איפוס', fab: 'מצב נוחות', read: 'להקריא את השאלה', stop: 'עצירת ההקראה', answer: 'תשובה', sample: 'שלום! זו דוגמה למהירות ההקראה.', noVoice: 'לא נמצא בטלפון קול בשפה הזו. אפשר להוסיף אותו בהגדרות ההקראה של הטלפון.', noSpeech: 'הדפדפן הזה לא תומך בהקראה.' },
    fr: { title: '♿ Mode Confort', sub: 'Indépendant du niveau choisi. Réglages gardés uniquement sur ce téléphone.', master: 'Activer le mode Confort', size: 'Gros caractères', wide: 'Boutons élargis', wideS: 'une réponse par ligne', contrast: 'Contraste élevé', contrastS: 'noir, blanc et jaune', voice: 'Lecture vocale des questions et réponses', voiceS: 'avec la voix du téléphone', auto: 'Lire automatiquement chaque nouvelle question', rate: 'Vitesse de lecture', test: '🔊 Essayer', noTimer: 'Sans chronomètre', noTimerS: 'dans les quiz d’entraînement (examen partie A, frise, architecture). L’examen, la simulation et le jeu de classe en direct restent chronométrés.', done: 'Terminé', reset: 'Réinitialiser', fab: 'Mode Confort', read: 'Lire la question', stop: 'Arrêter la lecture', answer: 'Réponse', sample: 'Bonjour ! Voici la vitesse de lecture.', noVoice: 'Aucune voix dans cette langue sur le téléphone. Vous pouvez l’ajouter dans les réglages de synthèse vocale.', noSpeech: 'Ce navigateur ne permet pas la lecture vocale.' },
    en: { title: '♿ Comfort mode', sub: 'Independent of the level you chose. Settings stay on this phone only.', master: 'Turn on comfort mode', size: 'Large text', wide: 'Wide buttons', wideS: 'one answer per row', contrast: 'High contrast', contrastS: 'black, white and yellow', voice: 'Read questions and answers aloud', voiceS: 'using the phone’s voice', auto: 'Read each new question automatically', rate: 'Reading speed', test: '🔊 Try', noTimer: 'No timer', noTimerS: 'in practice quizzes (Part A exam, timeline, architecture). The exam, the simulation and the live class game keep their timer.', done: 'Done', reset: 'Reset', fab: 'Comfort mode', read: 'Read the question', stop: 'Stop reading', answer: 'Answer', sample: 'Hello! This is the reading speed.', noVoice: 'No voice for this language on this phone. You can add one in the phone’s text-to-speech settings.', noSpeech: 'This browser cannot read aloud.' },
    ru: { title: '♿ Режим комфорта', sub: 'Не зависит от выбранного уровня. Настройки хранятся только на этом телефоне.', master: 'Включить режим комфорта', size: 'Крупный шрифт', wide: 'Широкие кнопки', wideS: 'один ответ в строке', contrast: 'Высокий контраст', contrastS: 'чёрный, белый и жёлтый', voice: 'Озвучивать вопросы и ответы', voiceS: 'голосом телефона', auto: 'Автоматически читать каждый новый вопрос', rate: 'Скорость чтения', test: '🔊 Проверить', noTimer: 'Без таймера', noTimerS: 'в тренировочных тестах (экзамен часть А, хронология, архитектура). Экзамен, симуляция и живая игра класса остаются с таймером.', done: 'Готово', reset: 'Сбросить', fab: 'Режим комфорта', read: 'Прочитать вопрос', stop: 'Остановить чтение', answer: 'Ответ', sample: 'Здравствуйте! Это скорость чтения.', noVoice: 'На телефоне нет голоса для этого языка. Его можно добавить в настройках синтеза речи.', noSpeech: 'Этот браузер не умеет читать вслух.' }
  };
  function uiLang() {
    var l = '';
    try { l = localStorage.getItem('mdl_mode_lang') || localStorage.getItem('mdl_lang') || ''; } catch (e) {}
    if (HOME) l = html.lang || l; // l'accueil traduit tout : on suit sa langue affichée
    return TX[l] ? l : (TX[html.lang] ? html.lang : 'he');
  }
  function t() { return TX[uiLang()]; }

  // ---------- 3. Lecture vocale ----------
  var synth = window.speechSynthesis || null, Utter = window.SpeechSynthesisUtterance || null;
  var LOCALE = { he: 'he-IL', fr: 'fr-FR', en: 'en-US', ru: 'ru-RU' };
  function textLang(s) {
    if (/[֐-׿]/.test(s)) return 'he';
    if (/[Ѐ-ӿ]/.test(s)) return 'ru';
    var u = uiLang(); return u === 'fr' || u === 'en' ? u : 'en';
  }
  function clean(s) {
    return String(s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ')
      .replace(/[▶◀→←↗✔✕⏳⏱️]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function voiceFor(lang) {
    if (!synth) return null;
    var vs = synth.getVoices() || [], loc = LOCALE[lang].toLowerCase();
    return vs.filter(function (v) { return (v.lang || '').toLowerCase().replace('_', '-') === loc; })[0] ||
      vs.filter(function (v) { return (v.lang || '').toLowerCase().indexOf(lang) === 0 || (lang === 'he' && /^iw/i.test(v.lang || '')); })[0] || null;
  }
  var lastWarn = 0;
  function speak(parts, opts) {
    opts = opts || {};
    if (!synth || !Utter) { if (opts.user) announce(t().noSpeech); return false; }
    synth.cancel();
    if (typeof parts === 'string') parts = [parts];
    var list = parts.map(clean).filter(Boolean);
    if (!list.length) return false;
    var missing = false;
    list.forEach(function (s) {
      var lg = textLang(s), u = new Utter(s), v = voiceFor(lg);
      u.lang = LOCALE[lg]; if (v) u.voice = v; else if (synth.getVoices().length) missing = true;
      u.rate = opts.rate || S.rate; u.pitch = 1;
      u.onend = u.onerror = function () { setTimeout(syncFab, 30); };
      synth.speak(u);
    });
    if (missing && opts.user && Date.now() - lastWarn > 8000) { lastWarn = Date.now(); announce(t().noVoice); }
    syncFab(true);
    return true;
  }
  function stop() { if (synth) synth.cancel(); syncFab(false); }
  function speaking() { return !!(synth && (synth.speaking || synth.pending)); }

  // Repère la question affichée et ses réponses, sur toutes les pages de jeu du site.
  var QSEL = '[data-comfort-q], #qtext, .question h2, .question-text, .qtext, #pPrompt b, .card p.q';
  var ASEL = '[data-comfort-a], .answers button, .answers .ans, #pOpts button, button.ans';
  function shown(el) { return !!(el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'); }
  function current() {
    var q = Array.prototype.filter.call(document.querySelectorAll(QSEL), shown)[0];
    if (!q) return null;
    var seen = [], answers = [];
    Array.prototype.forEach.call(document.querySelectorAll(ASEL), function (b) {
      if (!shown(b) || seen.indexOf(b) !== -1 || b.closest('.cf-fab,.cf-veil')) return;
      seen.push(b); var c = b.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('.k,[aria-hidden=true]'), function (k) { k.remove(); }); var x = clean(c.textContent); if (x) answers.push(x);
    });
    return { q: clean(q.textContent), answers: answers };
  }
  function readCurrent(user) {
    var c = current(); if (!c || !c.q) return false;
    var A = t().answer, parts = [c.q];
    c.answers.forEach(function (a, i) { parts.push(A + ' ' + (i + 1) + '. ' + a); });
    return speak(parts, { user: user });
  }

  // Lecture automatique : à chaque nouvelle question (pas quand la même question se met à jour après la réponse).
  var lastQ = '', debounce = null;
  function watch() {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      var c = current(), q = c ? c.q : '';
      if (q && q !== lastQ) { lastQ = q; if (S.on && S.voice && S.auto) readCurrent(false); }
      else if (!q) lastQ = '';
      syncFab();
    }, 450);
  }

  // ---------- 4. Boutons flottants (pages de jeu) et panneau ----------
  var fab = null, live = null;
  function announce(msg) {
    if (!live) { live = document.createElement('div'); live.className = 'cf-sr cf-keep'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
    live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 50);
    if (fab) { var b = fab.querySelector('.cf-read'); if (b) b.title = msg; }
  }
  function buildFab() {
    if (fab || HOME || !document.body) return;
    fab = document.createElement('div'); fab.className = 'cf-fab cf-keep';
    fab.innerHTML = '<button type="button" class="cf-read" hidden></button><button type="button" class="cf-open">Aa</button>';
    fab.querySelector('.cf-open').addEventListener('click', function () { open(this); });
    fab.querySelector('.cf-read').addEventListener('click', function () { if (speaking()) stop(); else readCurrent(true); });
    document.body.appendChild(fab);
    syncFab();
  }
  function syncFab(force) {
    if (!fab) return;
    fab.classList.toggle('tabbar', !!document.getElementById('mdTabbar'));
    var o = fab.querySelector('.cf-open'), r = fab.querySelector('.cf-read'), T = t();
    o.classList.toggle('on', S.on); o.setAttribute('aria-pressed', String(S.on)); o.setAttribute('aria-label', T.fab); o.title = T.fab;
    var can = S.on && S.voice && !!current(), talk = force === true || (force !== false && speaking());
    r.hidden = !can; r.textContent = talk ? '⏹' : '🔊'; r.classList.toggle('on', talk);
    r.setAttribute('aria-label', talk ? T.stop : T.read); r.title = talk ? T.stop : T.read;
  }

  var veil = null, opener = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function open(from) {
    if (veil) return;
    opener = from || document.activeElement;
    var T = t(), dir = uiLang() === 'he' ? 'rtl' : 'ltr';
    veil = document.createElement('div'); veil.className = 'cf-veil cf-keep';
    veil.innerHTML = '<div class="cf-panel" role="dialog" aria-modal="true" aria-labelledby="cfT" dir="' + dir + '" lang="' + uiLang() + '">' +
      '<h2 id="cfT">' + esc(T.title) + '</h2><p class="cf-sub">' + esc(T.sub) + '</p>' +
      '<div class="cf-row cf-master"><label for="cfOn" class="lb">' + esc(T.master) + '</label><input type="checkbox" id="cfOn"></div>' +
      '<div class="cf-opts">' +
      '<div class="cf-row"><span class="lb" id="cfSizeL">' + esc(T.size) + '</span><div class="cf-seg" role="group" aria-labelledby="cfSizeL">' +
      SIZES.map(function (z) { return '<button type="button" data-size="' + z + '">' + z + '%</button>'; }).join('') + '</div></div>' +
      '<div class="cf-row"><label for="cfWide">' + esc(T.wide) + '<small>' + esc(T.wideS) + '</small></label><input type="checkbox" id="cfWide"></div>' +
      '<div class="cf-row"><label for="cfContrast">' + esc(T.contrast) + '<small>' + esc(T.contrastS) + '</small></label><input type="checkbox" id="cfContrast"></div>' +
      '<div class="cf-row"><label for="cfVoice">' + esc(T.voice) + '<small>' + esc(T.voiceS) + '</small></label><input type="checkbox" id="cfVoice"></div>' +
      '<div class="cf-row cf-v"><label for="cfAuto">' + esc(T.auto) + '</label><input type="checkbox" id="cfAuto"></div>' +
      '<div class="cf-row cf-v cf-rate"><label for="cfRate" style="flex:1 1 100%">' + esc(T.rate) + ' <b id="cfRateV"></b></label><input type="range" id="cfRate" min="0.6" max="1.6" step="0.1"><button type="button" class="cf-btn" id="cfTest">' + esc(T.test) + '</button></div>' +
      '<div class="cf-row"><label for="cfTimer">' + esc(T.noTimer) + '<small>' + esc(T.noTimerS) + '</small></label><input type="checkbox" id="cfTimer"></div>' +
      '</div>' +
      (synth ? '' : '<p class="cf-note">' + esc(T.noSpeech) + '</p>') +
      '<div class="cf-actions"><button type="button" class="cf-btn" id="cfReset">' + esc(T.reset) + '</button><button type="button" class="cf-btn main" id="cfDone">' + esc(T.done) + '</button></div></div>';
    document.body.appendChild(veil);
    var P = veil.querySelector('.cf-panel'), $ = function (id) { return P.querySelector('#' + id); };
    function fill() {
      $('cfOn').checked = S.on; $('cfWide').checked = S.wide; $('cfContrast').checked = S.contrast; $('cfVoice').checked = S.voice;
      $('cfAuto').checked = S.auto; $('cfRate').value = String(S.rate); $('cfRateV').textContent = '×' + S.rate.toFixed(1); $('cfTimer').checked = S.noTimer;
      $('cfRate').setAttribute('aria-valuetext', '×' + S.rate.toFixed(1));
      P.querySelectorAll('[data-size]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.size === S.size)); });
      P.querySelector('.cf-opts').classList.toggle('cf-dis', !S.on);
      P.querySelectorAll('.cf-opts input,.cf-opts button').forEach(function (x) { x.disabled = !S.on; });
      P.querySelectorAll('.cf-v').forEach(function (r) { r.classList.toggle('cf-dis', !S.on || !S.voice); r.querySelectorAll('input,button').forEach(function (x) { x.disabled = !S.on || !S.voice; }); });
      if (!synth) { $('cfVoice').disabled = true; }
    }
    function bind(id, key) { $(id).addEventListener('change', function () { set(key, this.checked); fill(); }); }
    bind('cfOn', 'on'); bind('cfWide', 'wide'); bind('cfContrast', 'contrast'); bind('cfVoice', 'voice'); bind('cfAuto', 'auto'); bind('cfTimer', 'noTimer');
    $('cfRate').addEventListener('input', function () { set('rate', +this.value); $('cfRateV').textContent = '×' + S.rate.toFixed(1); $('cfRate').setAttribute('aria-valuetext', '×' + S.rate.toFixed(1)); });
    $('cfTest').addEventListener('click', function () { speak(t().sample, { user: true }); });
    P.querySelectorAll('[data-size]').forEach(function (b) { b.addEventListener('click', function () { set('size', +b.dataset.size); fill(); }); });
    $('cfReset').addEventListener('click', function () { var on = S.on; S = Object.assign({}, DEF, { on: on }); commit(); fill(); });
    $('cfDone').addEventListener('click', close);
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    veil.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(P.querySelectorAll('button,input'), function (x) { return !x.disabled; }), a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    fill(); $('cfOn').focus();
  }
  function close() {
    if (!veil) return; veil.remove(); veil = null;
    if (opener && opener.focus && opener.isConnected) opener.focus();
  }

  function commit() {
    save(); apply(); syncFab();
    if (!S.on || !S.voice) stop();
    try { window.dispatchEvent(new CustomEvent('md-comfort', { detail: get() })); } catch (e) {}
  }
  function set(k, v) {
    if (typeof k === 'object') { Object.keys(k).forEach(function (x) { if (x in DEF) S[x] = k[x]; }); }
    else if (k in DEF) S[k] = v;
    S = (function () { var o = Object.assign({}, S); if (SIZES.indexOf(o.size) === -1) o.size = DEF.size; o.rate = Math.min(1.6, Math.max(0.6, Math.round(o.rate * 10) / 10)); return o; })();
    commit();
  }
  function get() { return Object.assign({}, S); }

  window.MDComfort = {
    get: get, set: set, open: open, close: close, stop: stop, readCurrent: function () { return readCurrent(true); },
    speak: function (s) { return speak(s, { user: true }); },
    /** Les quiz d'entraînement demandent ici s'ils doivent lancer leur chronomètre. */
    noTimer: function () { return !!(S.on && S.noTimer); }
  };

  // Réglage modifié dans un autre onglet → appliqué ici aussi.
  window.addEventListener('storage', function (e) { if (e.key === KEY) { S = load(); apply(); syncFab(); } });
  window.addEventListener('md-lang', function () { syncFab(); });
  window.addEventListener('pagehide', function () { if (synth) synth.cancel(); });
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', function () {});

  function boot() {
    buildFab();
    if (window.MutationObserver) new MutationObserver(function (recs) {
      // nos propres boutons et annonces ne comptent pas comme une nouvelle question
      for (var i = 0; i < recs.length; i++) { var n = recs[i].target; n = n.nodeType === 1 ? n : n.parentNode; if (!(n && n.closest && n.closest('.cf-keep'))) { watch(); return; } }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
