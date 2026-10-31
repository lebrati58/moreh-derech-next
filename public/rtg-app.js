// ספריית רט״ג — lecteur du catalogue (rtg/catalog.json, métadonnées seulement) + faits par document (rtg/facts/<id>.json,
// chargés à la demande). Les PDF ne sont pas hébergés : bouton vers la source officielle de רשות הטבע והגנים.
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let lang = 'he'; try { lang = localStorage.getItem('mdl_mode_lang') || localStorage.getItem('mdl_lang') || 'he'; } catch (e) {}
  const T = {
    he: { title: 'ספריית רט״ג', sub: 'מדריכים, עלונים, מפות ופעילויות של רשות הטבע והגנים — חיפוש לפי אתר, אזור, תקופה ונושא.', search: 'חיפוש: אתר, אזור, נושא, מילה…', all: 'כל הספרייה',
      type: 'סוג', lang: 'שפה', region: 'אזור', period: 'תקופה', any: 'הכול', results: 'מסמכים', more: 'עוד תוצאות', none: 'לא נמצאו מסמכים. נסו מילה אחרת או הסירו מסנן.',
      guide: 'מדריך למדריך', brochure: 'עלון אתר', map: 'מפה', activity: 'פעילות לימודית', article: 'מאמר / גיליון', other: 'אחר',
      pages: 'עמודים', auto: 'סיווג אוטומטי — טרם אומת', open: '📄 לפתוח את המסמך באתר רט״ג', noUrl: 'אין עדיין קישור רשמי ישיר למסמך הזה.', source: 'עמוד המקור',
      linked: 'קשור במשחק', facts: 'מידע מהמסמך (עם עמוד)', noFacts: 'המידע מהמסמך עוד לא עובד — רק הפרטים הבסיסיים.', status: 'מצב הטקסט',
      st_text: 'טקסט נקרא', st_ocr: 'נקרא ב-OCR', st_partial: 'נקרא חלקית', st_needs_ocr: 'דורש OCR', st_failed: 'לא נקרא', ocrNote: 'עמודים ב-OCR — ייתכנו שגיאות',
      onlyGuides: 'רק מדריך למדריך', file: 'שם הקובץ', credit: 'כל הזכויות שמורות לרשות הטבע והגנים. הקבצים אינם מאוחסנים באפליקציה.', doc: 'מסמך', fact: 'עובדה מתועדת', tip: 'הצעה להדרכה' },
    fr: { title: 'Bibliothèque RTG', sub: 'Guides, brochures, cartes et activités de l’Autorité des parcs — recherche par site, région, période et sujet.', search: 'Rechercher : site, région, sujet, mot…', all: 'Toute la bibliothèque',
      type: 'Type', lang: 'Langue', region: 'Région', period: 'Période', any: 'Tout', results: 'documents', more: 'Plus de résultats', none: 'Aucun document. Essayez un autre mot ou retirez un filtre.',
      guide: 'מדריך למדריך', brochure: 'Brochure de site', map: 'Carte', activity: 'Activité pédagogique', article: 'Article / numéro', other: 'Autre',
      pages: 'pages', auto: 'classement automatique — à vérifier', open: '📄 Ouvrir le document sur le site RTG', noUrl: 'Pas encore de lien officiel direct pour ce document.', source: 'Page source',
      linked: 'Lié dans le jeu', facts: 'Informations du document (avec page)', noFacts: 'Le contenu n’est pas encore exploité — seulement la fiche.', status: 'État du texte',
      st_text: 'texte lu', st_ocr: 'lu par OCR', st_partial: 'lu partiellement', st_needs_ocr: 'OCR nécessaire', st_failed: 'illisible', ocrNote: 'pages lues par OCR — erreurs possibles',
      onlyGuides: 'Seulement les guides', file: 'Fichier', credit: 'Tous droits réservés à l’Autorité des parcs. Les fichiers ne sont pas hébergés dans l’appli.', doc: 'document', fact: 'fait documenté', tip: 'suggestion pédagogique' }
  };
  const t = k => (T[lang] || T.he)[k] || T.he[k] || k;
  const LANGS = { he: 'עברית', en: 'English', ar: 'العربية', ru: 'Русский', mixed: 'מעורב' };
  const S = { q: '', ty: '', lg: '', rg: '', per: '', guides: false, n: 40 };
  let CAT = null;
  const view = $('#view');

  const norm = s => String(s || '').normalize('NFC').toLowerCase().replace(/[״"׳'`(),.:;–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  const regionOf = d => d.rg || (Array.isArray(d.rga) ? d.rga.join(', ') : d.rga) || '';
  const perOf = d => [].concat(d.per || d.pera || []).join(', ');
  function hay(d) {
    return d._h || (d._h = norm([d.t, d.f, d.site, regionOf(d), perOf(d), (d.th || []).join(' '), (d.ln || []).map(l => l.he).join(' '), t(d.ty)].join(' ')));
  }
  function filtered() {
    const words = norm(S.q).split(' ').filter(Boolean);
    return CAT.docs.filter(d => (!S.ty || d.ty === S.ty) && (!S.lg || d.lg === S.lg) && (!S.rg || regionOf(d).includes(S.rg)) && (!S.per || perOf(d).includes(S.per))
      && (!S.guides || d.ty === 'guide') && words.every(w => hay(d).includes(w)));
  }
  const opts = (vals, cur) => vals.map(v => `<option value="${esc(v[0])}" ${cur === v[0] ? 'selected' : ''}>${esc(v[1])}</option>`).join('');
  function uniq(list) { return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')); }

  function docItem(d) {
    const st = d.st && d.st !== 'text' ? `<span class="bd ${d.st === 'failed' || d.st === 'needs_ocr' ? 'x' : 'w'}">${esc(t('st_' + d.st))}</span>` : '';
    return `<a class="doc ${d.ty === 'guide' ? 'guide' : ''}" href="#/d/${esc(d.id)}"><b>${esc(d.t)}</b>
      <small>${esc(t(d.ty))}${d.pg ? ' · ' + d.pg + ' ' + t('pages') : ''}${d.lg ? ' · ' + esc(LANGS[d.lg] || d.lg) : ''}${regionOf(d) ? ' · ' + esc(regionOf(d)) : ''}</small>
      <span class="badges">${d.ty === 'guide' ? `<span class="bd g">⭐ ${t('guide')}</span>` : ''}${d.rga && !d.rg ? `<span class="bd w">${t('auto')}</span>` : ''}${st}${d.ln ? `<span class="bd">🔗 ${d.ln.length}</span>` : ''}${d.fx ? '<span class="bd g">🎮 חידון</span>' : ''}${d.u ? '' : '<span class="bd x">∅ URL</span>'}</span></a>`;
  }
  function renderList() {
    const res = filtered(), types = ['guide', 'brochure', 'map', 'activity', 'article', 'other'];
    const regions = uniq(CAT.docs.flatMap(d => (d.rg ? [d.rg] : [].concat(d.rga || [])))), pers = uniq(CAT.docs.flatMap(d => [].concat(d.per || d.pera || []))), lgs = uniq(CAT.docs.map(d => d.lg));
    view.innerHTML = `<section class="hero"><div class="eyebrow">ISRAEL NATURE AND PARKS AUTHORITY</div><h1>🌿 ${t('title')}</h1><p>${t('sub')}</p></section>
      <div class="search"><input id="q" type="search" enterkeyhint="search" placeholder="${esc(t('search'))}" value="${esc(S.q)}" aria-label="${esc(t('search'))}"></div>
      <div class="filters" role="group">
        <button type="button" class="tg" id="g" aria-pressed="${S.guides}">⭐ ${t('onlyGuides')}</button>
        <select id="ty" aria-label="${t('type')}"><option value="">${t('type')}: ${t('any')}</option>${opts(types.map(x => [x, t(x)]), S.ty)}</select>
        <select id="rg" aria-label="${t('region')}"><option value="">${t('region')}: ${t('any')}</option>${opts(regions.map(x => [x, x]), S.rg)}</select>
        <select id="per" aria-label="${t('period')}"><option value="">${t('period')}: ${t('any')}</option>${opts(pers.map(x => [x, x]), S.per)}</select>
        <select id="lg" aria-label="${t('lang')}"><option value="">${t('lang')}: ${t('any')}</option>${opts(lgs.map(x => [x, LANGS[x] || x]), S.lg)}</select>
      </div>
      <p class="count" aria-live="polite">${res.length} ${t('results')}</p>
      <div class="list">${res.slice(0, S.n).map(docItem).join('') || `<p class="empty">${t('none')}</p>`}</div>
      ${res.length > S.n ? `<button type="button" class="more" id="more">${t('more')} (${res.length - S.n})</button>` : ''}
      <p class="note">${esc(CAT.note || '')} · ${esc(t('credit'))}</p>`;
    const q = $('#q'); let tm;
    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { S.q = q.value; S.n = 40; const pos = q.selectionStart; renderList(); const q2 = $('#q'); q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }, 180); });
    $('#g').addEventListener('click', () => { S.guides = !S.guides; S.n = 40; renderList(); });
    for (const k of ['ty', 'rg', 'per', 'lg']) $('#' + k).addEventListener('change', e => { S[k] = e.target.value; S.n = 40; renderList(); });
    const m = $('#more'); if (m) m.addEventListener('click', () => { S.n += 40; renderList(); });
  }
  function linkHref(l) { return l.k === 'exam' ? `exam.html#/` + (l.mission ? `m/${encodeURIComponent(l.mission)}/guided/1` : '') : `parcours.html#/t/${encodeURIComponent(l.tour)}`; }
  function renderDoc(id) {
    const d = CAT.docs.find(x => x.id === id);
    if (!d) { view.innerHTML = `<p class="empty">${t('none')}</p>`; return; }
    view.innerHTML = `<section class="card"><h2>${esc(d.t)}</h2>
      <div class="badges">${d.ty === 'guide' ? `<span class="bd g">⭐ ${t('guide')}</span>` : `<span class="bd">${esc(t(d.ty))}</span>`}${d.st ? `<span class="bd ${d.st === 'text' || d.st === 'ocr' ? '' : 'x'}">${esc(t('st_' + d.st))}</span>` : ''}</div>
      <dl class="kv" style="margin-top:10px">
        ${d.site ? `<dt>📍</dt><dd>${esc(d.site)}</dd>` : ''}
        <dt>${t('region')}</dt><dd>${esc(regionOf(d) || '—')}${d.rga && !d.rg ? ` <span class="bd w">${t('auto')}</span>` : ''}</dd>
        ${perOf(d) ? `<dt>${t('period')}</dt><dd>${esc(perOf(d))}${d.pera && !d.per ? ` <span class="bd w">${t('auto')}</span>` : ''}</dd>` : ''}
        <dt>${t('lang')}</dt><dd>${esc(LANGS[d.lg] || d.lg || '—')}</dd>
        <dt>${t('pages')}</dt><dd>${d.pg || '—'}${d.ocr ? ` · ${d.ocr} ${t('ocrNote')}` : ''}</dd>
        ${(d.th || []).length ? `<dt>#</dt><dd>${esc(d.th.join(' · '))}</dd>` : ''}
        <dt>${t('file')}</dt><dd style="word-break:break-all">${esc(d.f)}</dd>
      </dl>
      ${d.u ? `<a class="btn" href="${esc(d.u)}" target="_blank" rel="noopener noreferrer">${t('open')}</a>` : `<p class="empty">${t('noUrl')}</p>`}
      ${d.sp ? `<a class="btn ghost" href="${esc(d.sp)}" target="_blank" rel="noopener noreferrer">🔗 ${t('source')}</a>` : ''}</section>
      ${d.ln ? `<section class="card"><h2>🔗 ${t('linked')}</h2><div class="links">${d.ln.map(l => `<a href="${linkHref(l)}">${l.k === 'exam' ? '🎓' : '🛣️'} ${esc(l.he)}${l.auto ? ' <small>(' + t('auto') + ')</small>' : ''}</a>`).join('')}</div></section>` : ''}
      <section class="card"><h2>📌 ${t('facts')}</h2><div id="facts">${d.fx ? '…' : `<p class="note">${t('noFacts')}</p>`}</div></section>
      <p class="note">${esc(t('credit'))}</p>`;
    if (d.fx) fetch('rtg/facts/' + encodeURIComponent(d.id) + '.json').then(r => r.json()).then(F => { $('#facts').innerHTML = factsHtml(F, d); wireQuiz(); })
      .catch(() => { $('#facts').innerHTML = `<p class="note">${t('noFacts')}</p>`; });
    window.scrollTo(0, 0);
  }
  const TOPICS = { history: '📜 היסטוריה וכרונולוגיה', archaeology: '🏛️ ארכאולוגיה ושרידים', geo: '🌿 גאוגרפיה, גאולוגיה וסביבה', stations: '📍 תחנות ונקודות תצפית', guiding: '🎤 להדרכה ולסיפור דרך' };
  const pg = n => `עמ׳ ${esc(n)}`;
  function factsHtml(F, d) {
    const items = F.items || [];
    const groups = Object.keys(TOPICS).map(k => [k, items.filter(x => x.topic === k)]).filter(([, l]) => l.length);
    const fact = x => `<div class="fact">${x.kind === 'tip' ? '💡 ' : ''}${esc(x.he)}<small>${x.kind === 'tip' ? t('tip') : t('fact')} · ${pg(x.page)}${x.quote ? ' · ״' + esc(x.quote) + '״' : ''}</small></div>`;
    return `${(F.stations || []).length ? `<h3>🚏 תחנות המסלול</h3><ol>${F.stations.map(s => `<li>${esc(s.he)} <small class="note">(${pg(s.page)})</small></li>`).join('')}</ol>` : ''}
      ${groups.map(([k, l]) => `<details ${k === 'stations' ? 'open' : ''}><summary><b>${TOPICS[k]}</b> (${l.length})</summary>${l.map(fact).join('')}</details>`).join('')}
      ${(F.sheet || []).length ? `<details><summary><b>🗒️ דף חזרה</b></summary><ul>${F.sheet.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      ${(F.questions || []).length ? `<a class="btn" href="#/q/${esc(d.id)}">🎮 חידון רט״ג — ${F.questions.length} שאלות, נקודות למסע</a><h3>❓ שאלות לתרגול</h3>${[1, 2, 3].map(lv => F.questions.filter(q => q.level === lv).map(q => `<div class="fact quiz"><span class="bd ${lv === 3 ? 'g' : lv === 2 ? 'w' : ''}">רמה ${lv}</span> ${esc(q.q)}
        <button type="button" class="more" data-ans>👀 תשובה מצופה</button><div hidden><b>מה צריך להופיע:</b><ul>${(q.expected || []).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${(q.accept || []).length ? `<b>גם מתקבל:</b> ${esc(q.accept.join(' · '))}` : ''}<small>מקור: ${esc(d.t)}, ${(q.refs || []).map(pg).join(', ')}</small></div></div>`).join('')).join('')}` : ''}
      <p class="note">✔ עובדה = מופיעה במסמך בעמוד המצוין · 💡 הצעה = הצעה להדרכה מתוך המסמך עצמו.</p>`;
  }
  function wireQuiz() { $$('[data-ans]').forEach(b => b.addEventListener('click', () => { const box = b.nextElementSibling; box.hidden = !box.hidden; b.textContent = box.hidden ? '👀 תשובה מצופה' : '🙈 להסתיר'; })); }
  // ---------- חידון רט״ג : réponse ouverte, chrono, auto-vérification des éléments attendus, points au מסע ----------
  // Niveau 1 : 60 s · niveau 2 : 120 s · niveau 3 : 180 s. Score d'une question = part des éléments attendus trouvés
  // (mots-clés repérés dans la réponse, puis cases que l'élève confirme honnêtement) × plafond du niveau (100/200/290).
  const QT = { 1: 60, 2: 120, 3: 180 }, QP = { 1: 100, 2: 200, 3: 290 };
  const P = () => window.MDProgress || null;
  const words = s => norm(s).split(' ').filter(w => w.length >= 3);
  function hits(answer, expected) {   // élément attendu « trouvé » si un de ses mots significatifs (≥4 car.) figure dans la réponse
    const a = ' ' + norm(answer) + ' ';
    return expected.map(e => { const ws = words(e).filter(w => w.length >= 4 || /^\d+$/.test(w)); return ws.length > 0 && ws.some(w => a.includes(' ' + w) || a.includes(w + ' ') || a.includes(w)); });
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  function renderQuiz(id) {
    const d = CAT.docs.find(x => x.id === id);
    if (!d || !d.fx) { view.innerHTML = `<p class="empty">${t('none')}</p>`; return; }
    fetch('rtg/facts/' + encodeURIComponent(id) + '.json').then(r => r.json()).then(F => {
      const qs = (F.questions || []).map((q, i) => Object.assign({ i }, q)).sort((a, b) => a.level - b.level);
      const Q = { i: 0, answers: [], timer: null, left: 0, runId: uuid(), started: Date.now() };
      const stats = P() && P().tourStats ? P().tourStats('rtg:' + id) : null;
      const draw = () => {
        if (Q.i >= qs.length) return finish();
        const q = qs[Q.i]; Q.left = QT[q.level] || 90; Q.answered = false;
        view.innerHTML = `<section class="hero"><div class="eyebrow">חידון רט״ג · ${esc(F.site || d.t)}</div><h1>שאלה ${Q.i + 1} / ${qs.length}</h1><p><span class="bd ${q.level === 3 ? 'g' : q.level === 2 ? 'w' : ''}">רמה ${q.level}</span> ⏱️ <b id="tm">${Q.left}</b> שנ׳ · עד ${QP[q.level]} נק׳</p></section>
          <section class="card"><h2 style="font-size:17px;line-height:1.5">${esc(q.q)}</h2>
          <textarea id="ans" rows="5" dir="rtl" style="width:100%;border-radius:12px;border:2px solid var(--line2);background:#0f1840;color:inherit;padding:10px;font:inherit" placeholder="כתבו את התשובה במילים שלכם…"></textarea>
          <button type="button" class="btn" id="chk">✔ לבדוק</button><div id="res"></div></section>`;
        const ta = $('#ans'); ta.focus();
        clearInterval(Q.timer); Q.timer = setInterval(() => { Q.left--; const el = $('#tm'); if (el) el.textContent = Q.left; if (Q.left <= 0) { clearInterval(Q.timer); check(true); } }, 1000);
        $('#chk').addEventListener('click', () => check(false));
      };
      const check = timeout => {
        if (Q.answered) return; Q.answered = true; clearInterval(Q.timer);
        const q = qs[Q.i], ans = ($('#ans') || {}).value || '', exp = q.expected || [], h = hits(ans, exp);
        $('#ans').disabled = true; $('#chk').hidden = true;
        $('#res').innerHTML = `<div class="fact" style="margin-top:12px">${timeout ? '<p><b>⏰ נגמר הזמן.</b></p>' : ''}<p><b>מה היה צריך להופיע</b> — סמנו ביושר מה כתבתם (הזיהוי האוטומטי מסמן מראש):</p>
          ${exp.map((e, k) => `<label style="display:flex;gap:8px;align-items:flex-start;min-height:40px;margin:4px 0"><input type="checkbox" data-k="${k}" ${h[k] && !timeout ? 'checked' : ''} style="width:22px;height:22px;flex:none"> <span>${esc(e)}</span></label>`).join('')}
          ${(q.accept || []).length ? `<p class="note">גם מתקבל: ${esc(q.accept.join(' · '))}</p>` : ''}
          <p class="note">מקור: ${esc(d.t)}, ${(q.refs || []).map(pg).join(', ')} · <a href="#/d/${esc(id)}">📚 לפתוח את המסמך</a></p>
          <button type="button" class="btn" id="nxt">${Q.i + 1 < qs.length ? 'לשאלה הבאה ←' : '🏁 לסיים'}</button></div>`;
        $('#nxt').addEventListener('click', () => {
          const ticked = $$('#res input[type=checkbox]').filter(c => c.checked).length;
          const frac = exp.length ? ticked / exp.length : 0, pts = Math.round(frac * QP[q.level]);
          Q.answers.push({ questionId: 'q' + q.i, correct: frac >= .6, points: pts, frac, level: q.level, timeout });
          Q.i++; draw();
        });
      };
      const finish = () => {
        const total = Q.answers.reduce((n, a) => n + a.points, 0), right = Q.answers.filter(a => a.correct).length;
        let saved = null;
        if (P() && P().saveTourRun) saved = P().saveTourRun({ version: 1, kind: 'rtg', tourId: 'rtg:' + id, runId: Q.runId, mode: 'exam', completedAt: new Date().toISOString(), score: total, correct: right, total: qs.length, answerDetails: Q.answers.map(a => ({ questionId: a.questionId, correct: a.correct, points: a.points })) });
        view.innerHTML = `<section class="hero"><div class="eyebrow">חידון רט״ג · ${esc(F.site || d.t)}</div><h1>${right} / ${qs.length}</h1><p>${total} נקודות${saved && saved.saved ? (saved.gained > 0 ? ` · 🏆 +${saved.gained} נקודות חדשות למסע (רק השיא לכל שאלה נספר)` : ' · השיא שלכם כבר גבוה יותר') : ''}</p></section>
          <section class="card"><h2>📋 סיכום לפי שאלה</h2><ol>${Q.answers.map((a, k) => `<li>${a.correct ? '✅' : a.timeout ? '⏰' : '🔁'} רמה ${a.level} · ${Math.round(a.frac * 100)}% · ${a.points} נק׳ — ${esc(qs[k].q)}</li>`).join('')}</ol>
          <button type="button" class="btn" id="again">🔁 עוד פעם</button><a class="btn ghost" href="#/d/${esc(id)}">📚 חזרה למסמך</a></section>
          <p class="note">הניקוד מבוסס על הסימון שלכם — חידון להתאמנות, לא מבחן רשמי. ${esc(t('credit'))}</p>`;
        $('#again').addEventListener('click', () => renderQuiz(id));
      };
      view.innerHTML = `<section class="hero"><div class="eyebrow">חידון רט״ג</div><h1>🎮 ${esc(F.site || d.t)}</h1><p>${qs.length} שאלות בשלוש רמות · תשובה חופשית עם שעון · בסוף כל שאלה מסמנים מה היה בתשובה · הנקודות נכנסות למסע שלכם.${stats && stats.points ? ` שיא נוכחי: ${stats.points} נק׳.` : ''}</p></section>
        <section class="card"><ul><li>רמה 1 — לזכור עובדה אחת (60 שנ׳)</li><li>רמה 2 — להסביר ולקשר (120 שנ׳)</li><li>רמה 3 — ליישם בהדרכה (180 שנ׳)</li></ul><button type="button" class="btn" id="go">▶ להתחיל</button><a class="btn ghost" href="#/d/${esc(id)}">📚 קודם לקרוא את המסמך</a></section>`;
      $('#go').addEventListener('click', draw);
    }).catch(() => { view.innerHTML = `<p class="empty">${t('noFacts')}</p>`; });
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    $('#back').hidden = h[0] !== 'd' && h[0] !== 'q';
    if (h[0] === 'q' && h[1]) return renderQuiz(decodeURIComponent(h[1]));
    if (h[0] === 'd' && h[1]) return renderDoc(decodeURIComponent(h[1]));
    const p = new URLSearchParams(location.search);
    if (p.get('q') && !S.q) S.q = p.get('q');
    renderList();
  }
  $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  fetch('rtg/catalog.json').then(r => r.json()).then(c => { CAT = c; window.addEventListener('hashchange', route); route(); })
    .catch(() => { view.innerHTML = '<p class="empty">לא ניתן לטעון את הספרייה. בדקו את החיבור.</p>'; });
  window.MDRtg = { state: () => S, catalog: () => CAT };
})();
