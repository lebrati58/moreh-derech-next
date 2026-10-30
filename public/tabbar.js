// Barre d'onglets fixe en bas de l'écran (accueil, carte, mon parcours, classe, plus).
// Inclure avec <script src="tabbar.js"></script> en fin de <body>.
// La langue suit localStorage (mdl_mode_lang / mdl_lang) ; l'accueil envoie l'événement « md-lang » quand elle change.
(function () {
  'use strict';
  if (document.getElementById('mdTabbar')) return;

  var T = {
    he: { exam: 'אתגר המבחן', examSub: 'מתכננים יום טיול וכותבים הדרכות', home: 'בית', map: 'מפה', journey: 'המסע', klass: 'הכיתה', more: 'עוד', moreTitle: 'עוד', close: 'סגירה',
      rtg: 'ספריית רט״ג', rtgSub: 'מדריכים, עלונים ומפות של רשות הטבע והגנים', lib: 'ספריית הסיורים', libSub: 'כל 22 הסיורים והמסמכים', comm: 'קטעי דרך של הקהילה', commSub: 'מסלולים שתלמידים שיתפו',
      doc: 'הוספת מסמך לסיור', docSub: 'PDF או Word לסיור קיים', create: 'יצירת מסלול חדש', createSub: 'קטע דרך עם שאלות משלכם',
      guide: 'חידון חי לקבוצה', guideSub: 'להפעלה באוטובוס · מדריכים ותלמידי הקורס', fb: 'רעיון, בעיה או טעות?', fbSub: 'ההודעה מגיעה ישירות לצוות' },
    fr: { exam: 'Défi de l’examen', examSub: 'Journée, sites et interventions', home: 'Accueil', map: 'Carte', journey: 'Parcours', klass: 'Classe', more: 'Plus', moreTitle: 'Plus', close: 'Fermer',
      rtg: 'Bibliothèque RTG', rtgSub: 'Guides, brochures et cartes de l’Autorité des parcs', lib: 'Bibliothèque des sorties', libSub: 'Les 22 סיורים et leurs documents', comm: 'Parcours de la communauté', commSub: 'Trajets partagés par les élèves',
      doc: 'Ajouter un document', docSub: 'PDF ou Word pour une sortie', create: 'Créer un parcours', createSub: 'Un trajet avec vos propres questions',
      guide: 'Quiz en direct', guideSub: 'Lancer pour un groupe · guides et élèves du cours', fb: 'Une idée, un bug, une erreur ?', fbSub: 'Le message arrive directement à l’équipe' },
    en: { exam: 'Exam challenge', examSub: 'Plan a day, write guiding units', home: 'Home', map: 'Map', journey: 'Journey', klass: 'Class', more: 'More', moreTitle: 'More', close: 'Close',
      rtg: 'INPA library', rtgSub: 'Guides, brochures and maps from the Parks Authority', lib: 'Tour library', libSub: 'All 22 tours and their documents', comm: 'Community routes', commSub: 'Routes shared by students',
      doc: 'Add a document', docSub: 'PDF or Word for a tour', create: 'Create a route', createSub: 'A road segment with your own questions',
      guide: 'Live group quiz', guideSub: 'Run it on the bus · guides and course students', fb: 'Idea, bug or mistake?', fbSub: 'Your message goes straight to the team' },
    ru: { exam: 'Экзамен', examSub: 'План дня и тексты экскурсий', home: 'Главная', map: 'Карта', journey: 'Мой путь', klass: 'Класс', more: 'Ещё', moreTitle: 'Ещё', close: 'Закрыть',
      rtg: 'Библиотека УПП', rtgSub: 'Путеводители, буклеты и карты Управления парков', lib: 'Библиотека экскурсий', libSub: 'Все 22 экскурсии и документы', comm: 'Маршруты сообщества', commSub: 'Маршруты от учеников',
      doc: 'Добавить документ', docSub: 'PDF или Word для экскурсии', create: 'Создать маршрут', createSub: 'Участок дороги со своими вопросами',
      guide: 'Живая викторина', guideSub: 'Для группы · гиды и ученики курса', fb: 'Идея, ошибка или проблема?', fbSub: 'Сообщение сразу получит команда' }
  };

  var TABS = [
    { k: 'home', icon: '🏠', href: 'index.html', match: /(^|\/)(index\.html)?$/ },
    { k: 'map', icon: '🗺️', href: 'map.html', match: /map\.html$/ },
    { k: 'journey', icon: '📈', href: 'journey.html', match: /journey\.html$/ },
    { k: 'klass', icon: '🏆', href: 'class.html', match: /class\.html$/ }
  ];
  var MORE = [
    { k: 'exam', icon: '🎓', href: 'exam.html' },
    { k: 'rtg', icon: '🌿', href: 'rtg.html' },
    { k: 'lib', icon: '📚', href: 'tour-catalog.html' },
    { k: 'comm', icon: '🌍', href: 'community-library.html' },
    { k: 'doc', icon: '📄', href: 'contribute.html' },
    { k: 'create', icon: '✨', href: 'community.html' },
    { k: 'guide', icon: '🚌', href: 'guide.html' }
  ];

  var css = '' +
    '.md-tabbar{position:fixed;inset-inline:0;bottom:0;z-index:60;display:grid;grid-template-columns:repeat(5,1fr);background:#0d1638f2;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid #34478a;padding:4px 4px calc(4px + env(safe-area-inset-bottom));font-family:inherit}' +
    '.md-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:54px;border:0;background:none;color:#aab8e4;text-decoration:none;font-weight:700;font-size:11.5px;line-height:1.15;font-family:inherit;border-radius:12px;cursor:pointer;padding:4px 2px}' +
    '.md-tab .ti{font-size:22px;line-height:1;filter:grayscale(.5);opacity:.8}' +
    '.md-tab[aria-current=page]{color:#fff}.md-tab[aria-current=page] .ti{filter:none;opacity:1}' +
    '.md-tab[aria-current=page]::after{content:"";width:18px;height:3px;border-radius:3px;background:#94f5de;margin-top:2px}' +
    '.md-tab:focus-visible{outline:2px solid #94f5de}' +
    '.md-sheet-bg{position:fixed;inset:0;z-index:70;background:#0009}.md-sheet-bg[hidden]{display:none}' +
    '.md-sheet{position:absolute;inset-inline:0;bottom:0;max-width:640px;margin:auto;background:#151f4a;border:1px solid #4b6096;border-bottom:0;border-radius:22px 22px 0 0;padding:10px 14px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px #000a;color:#eef3ff}' +
    '.md-sheet-head{display:flex;align-items:center;justify-content:space-between;margin:2px 4px 8px}.md-sheet-head b{font-size:18px}' +
    '.md-sheet-x{border:0;background:#22306a;color:#fff;border-radius:50%;width:40px;height:40px;font-size:18px;cursor:pointer}' +
    '.md-sheet-item{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:9px 8px;border:0;border-radius:14px;background:none;color:#eef3ff;text-decoration:none;text-align:start;font-weight:800;font-size:15px;line-height:1.25;font-family:inherit;cursor:pointer}' +
    '.md-sheet-item:hover,.md-sheet-item:focus-visible{background:#1f2c5e}' +
    '.md-sheet-item .si{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#22306a;font-size:20px}' +
    '.md-sheet-item small{display:block;font-weight:600;color:#b5c3ee;font-size:12.5px;margin-top:2px}' +
    '.md-sheet hr{border:0;border-top:1px solid #2e3f7a;margin:6px 4px}' +
    'body.md-has-tabbar{padding-bottom:calc(70px + env(safe-area-inset-bottom))}';

  function lang() {
    var l = 'he';
    try { l = localStorage.getItem('mdl_mode_lang') || localStorage.getItem('mdl_lang') || 'he'; } catch (e) {}
    return T[l] ? l : 'he';
  }

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var bar = document.createElement('div'); bar.id = 'mdTabbar'; bar.className = 'md-tabbar'; bar.setAttribute('role', 'navigation');
  var bg = document.createElement('div'); bg.className = 'md-sheet-bg'; bg.hidden = true;
  document.body.appendChild(bar); document.body.appendChild(bg); document.body.classList.add('md-has-tabbar');

  var path = location.pathname;
  var current = 'more';
  TABS.forEach(function (t) { if (t.match.test(path)) current = t.k; });
  if (!/guide\.html$|tour-catalog|community|contribute/.test(path) && current === 'more') current = '';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var L = lang(), t = T[L];
    bar.setAttribute('aria-label', t.home + ' · ' + t.more);
    bar.innerHTML = TABS.map(function (x) {
      return '<a class="md-tab" href="' + x.href + '"' + (current === x.k ? ' aria-current="page"' : '') + '><span class="ti" aria-hidden="true">' + x.icon + '</span>' + esc(t[x.k]) + '</a>';
    }).join('') + '<button type="button" class="md-tab" id="mdMore" aria-haspopup="dialog"' + (current === 'more' ? ' aria-current="page"' : '') + '><span class="ti" aria-hidden="true">☰</span>' + esc(t.more) + '</button>';
    var fb = window.MDLFeedback ? '<hr><button type="button" class="md-sheet-item" data-feedback><span class="si" aria-hidden="true">💡</span><span>' + esc(t.fb) + '<small>' + esc(t.fbSub) + '</small></span></button>' : '';
    bg.innerHTML = '<div class="md-sheet" role="dialog" aria-modal="true" aria-label="' + esc(t.moreTitle) + '"><div class="md-sheet-head"><b>' + esc(t.moreTitle) + '</b><button type="button" class="md-sheet-x" aria-label="' + esc(t.close) + '">✕</button></div>' +
      MORE.map(function (x, i) {
        return (x.k === 'guide' ? '<hr>' : '') + '<a class="md-sheet-item" href="' + x.href + '"><span class="si" aria-hidden="true">' + x.icon + '</span><span>' + esc(t[x.k]) + '<small>' + esc(t[x.k + 'Sub']) + '</small></span></a>';
      }).join('') + fb + '</div>';
    document.getElementById('mdMore').addEventListener('click', open);
  }
  function open() { bg.hidden = false; var x = bg.querySelector('.md-sheet-x'); if (x) x.focus(); }
  function close() { bg.hidden = true; }
  bg.addEventListener('click', function (e) {
    if (e.target === bg || e.target.closest('.md-sheet-x') || e.target.closest('[data-feedback]')) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !bg.hidden) close(); });
  window.addEventListener('md-lang', render);
  window.addEventListener('load', render);
  render();
})();
