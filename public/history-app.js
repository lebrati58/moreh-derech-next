/* Moreh Derech NEXT — « ציר הזמן והחידון » (history.html).
   Navigation par ancres (#/timeline, #/event/<id>, #/quiz, #/play, #/result) : le bouton « retour » du téléphone
   ferme la fiche, revient aux réglages, etc. Une partie en cours est sauvegardée sur le téléphone et reprend là où elle était. */
(function () {
  'use strict';
  const H = window.MDHistory, P = window.MDProgress || null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/["'״׳„”“\-–—,.():]/g, ' ').replace(/\s+/g, ' ').trim();
  const fmt = n => Number(n || 0).toLocaleString('he-IL');
  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const RUN_KEY = 'mdl_hist_run_v1', LAST_KEY = 'mdl_hist_last_v1', PREF_KEY = 'mdl_hist_pref_v1';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const say = t => { $('live').textContent = ''; setTimeout(() => { $('live').textContent = t; }, 30); };

  let DATA = null, PER = {}, EV = {};
  let tl = { period: 'all', q: '' }, visible = [];
  let pref = Object.assign({ mode: 'practice', period: 'all', count: 10, timed: true, types: 'mix' }, store.get(PREF_KEY, {}));
  let run = null, timer = null, ticker = null, sheetFromApp = false, lastFocus = null, announced = {};

  // ======================= données =======================
  fetch('history-events.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    const errs = H.validate(d);
    if (errs.length) console.error('history-events.json', errs);
    DATA = d; H.setPeriods(d.periods); d.periods.forEach(p => { PER[p.id] = p; }); d.events.forEach(e => { EV[e.id] = e; });
    run = loadRun();
    buildStatic();
    window.addEventListener('hashchange', route);
    route();
  }).catch(e => {
    console.error(e);
    $('vTimeline').hidden = false;
    $('list').innerHTML = '<p class="empty">לא הצלחנו לטעון את האירועים. בדקו את החיבור ונסו שוב.</p>';
  });

  const pcolor = id => (PER[id] && PER[id].color) || '#ffd878';
  const styleP = id => `--pc:${pcolor(id)}`;
  const status = id => (P && P.historyStats ? P.historyStats().status(id) : 0);

  // ======================= navigation =======================
  function parse() {
    const h = location.hash.replace(/^#\/?/, ''), [path, qs] = h.split('?');
    const parts = (path || 'timeline').split('/');
    return { view: parts[0] || 'timeline', id: parts[1] ? decodeURIComponent(parts[1]) : null, params: new URLSearchParams(qs || '') };
  }
  function go(hash, replace) { if (replace) location.replace(hash); else location.hash = hash; }
  function show(view) {
    ['vTimeline', 'vQuiz', 'vPlay', 'vResult'].forEach(v => { $(v).hidden = v !== view; });
    const quizSide = view !== 'vTimeline';
    if (quizSide) { $('tabQuiz').setAttribute('aria-current', 'page'); $('tabTimeline').removeAttribute('aria-current'); }
    else { $('tabTimeline').setAttribute('aria-current', 'page'); $('tabQuiz').removeAttribute('aria-current'); }
    $('tabQuiz').href = run && run.phase !== 'done' ? '#/play' : '#/quiz';
  }
  let prevView = null;
  function route() {
    const r = parse();
    if (prevView === 'play' && r.view !== 'play') pauseRun('nav');
    if (r.view === 'event' && EV[r.id]) {
      if ($('vTimeline').hidden) { show('vTimeline'); renderTimeline(); }
      openSheet(r.id);
    } else if (r.view === 'quiz') {
      const per = r.params.get('period'), mode = r.params.get('mode');
      if (per && (per === 'all' || PER[per])) pref.period = per;
      if (mode === 'exam' || mode === 'practice') pref.mode = mode;
      show('vQuiz'); renderSetup(); scrollTop();
    } else if (r.view === 'play') {
      if (!run || run.phase === 'done') { go('#/quiz', true); return; }
      show('vPlay'); renderPlay();
      if (run.paused === 'nav') resumeRun();
    } else if (r.view === 'result') {
      const last = store.get(LAST_KEY, null);
      if (!last) { go('#/quiz', true); return; }
      show('vResult'); renderResult(last); scrollTop();
    } else {
      const per = r.params.get('period'), ev = r.params.get('event');
      if (per && (per === 'all' || PER[per])) tl.period = per;
      show('vTimeline'); renderTimeline();
      if (ev && EV[ev]) { go('#/event/' + ev, true); return; }
      if (per) scrollTop();
    }
    if (r.view !== 'event') closeSheet(r.view === 'timeline');
    prevView = r.view;
  }
  function scrollTop() { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); }

  // ======================= frise =======================
  function spans() {
    const ids = DATA.periods.map(p => p.id), out = {};
    ids.forEach((id, i) => {
      const evs = DATA.events.filter(e => e.period === id), from = evs[0].year;
      const nextFirst = i < ids.length - 1 ? DATA.events.find(e => e.period === ids[i + 1]).year : 638;
      out[id] = { from, to: nextFirst };
    });
    return out;
  }
  function buildStatic() {
    const n = DATA.events.length, first = DATA.events[0], last = DATA.events[n - 1];
    $('heroSub').textContent = `${n} אירועים · מ־${H.formatYear(first.year)} ועד ${H.formatYear(last.year)} · בוחרים תקופה, פותחים כרטיס ומתאמנים`;
    const sp = spans(), total = sp[DATA.periods[DATA.periods.length - 1].id].to - sp[DATA.periods[0].id].from;
    $('eras').innerHTML = DATA.periods.map(p => `<button type="button" data-p="${p.id}" style="${styleP(p.id)};flex:${Math.max(4, Math.round((sp[p.id].to - sp[p.id].from) / total * 100))}" aria-pressed="false" aria-label="${esc(p.name)} · ${esc(p.range)}" title="${esc(p.name)} · ${esc(p.range)}"><span aria-hidden="true">${p.icon}</span></button>`).join('');
    $('eraFrom').textContent = H.formatYear(sp[DATA.periods[0].id].from);
    $('eraTo').textContent = '638 לספירה';
    $('eras').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; setTlPeriod(tl.period === b.dataset.p ? 'all' : b.dataset.p); });
    const chips = [`<button type="button" data-p="all" aria-pressed="true">כל התקופות</button>`].concat(DATA.periods.map(p => `<button type="button" data-p="${p.id}" style="${styleP(p.id)}" aria-pressed="false"><span class="dot" aria-hidden="true"></span>${esc(p.short)}</button>`)).join('');
    $('pchips').innerHTML = chips;
    $('pchips').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) setTlPeriod(b.dataset.p); });
    $('q').addEventListener('input', () => { tl.q = $('q').value; renderTimeline(); });
    $('qClear').addEventListener('click', () => { $('q').value = ''; tl.q = ''; renderTimeline(); $('q').focus(); });
    $('reset').addEventListener('click', () => { $('q').value = ''; tl.q = ''; setTlPeriod('all'); });
    $('list').addEventListener('click', e => {
      const ev = e.target.closest('[data-ev]'); if (ev) { sheetFromApp = true; lastFocus = ev; go('#/event/' + ev.dataset.ev); return; }
      const pq = e.target.closest('[data-quiz]'); if (pq) go('#/quiz?period=' + pq.dataset.quiz);
    });
    $('footT').innerHTML = `📚 התאריכים נבדקו מול <a href="${esc(DATA.course.taarichon.url)}" target="_blank" rel="noopener noreferrer">תאריכון הקורס</a> והתקצירים המאורגנים בתיקיית הקורס. ליד כל אירוע כתוב אם התאריך מופיע בחומרי הקורס, אם הוא מקורב או שנוי במחלוקת. אירועים שתאריכם שנוי במחלוקת מופיעים באימון בלבד, לא במבחן. זה כלי חזרה — לא תחליף לחומר הרשמי.`;
    // quiz
    $('qpchips').innerHTML = chips.replace('aria-pressed="true"', 'aria-pressed="false"');
    $('qpchips').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { pref.period = b.dataset.p; savePref(); renderSetup(); } });
    document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => { pref.mode = b.dataset.mode; savePref(); renderSetup(); }));
    $('counts').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { pref.count = Number(b.dataset.n); savePref(); renderSetup(); } });
    $('timed').addEventListener('change', () => { pref.timed = $('timed').checked; savePref(); renderSetup(); });
    $('qtypes').addEventListener('click', e => { const b = e.target.closest('[data-ty]'); if (b) { pref.types = b.dataset.ty; savePref(); renderSetup(); } });
    $('start').addEventListener('click', () => startRun({ mode: pref.mode, period: pref.period, count: pref.count, types: pref.types, timed: pref.mode === 'exam' ? true : pref.timed }));
    $('startReview').addEventListener('click', () => { const m = P ? P.historyStats().mistakes.filter(id => EV[id]) : []; if (m.length) startRun({ mode: 'practice', review: true, period: 'all', ids: m, count: m.length, types: pref.types, timed: pref.timed }); });
    // jeu
    $('answers').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b && !b.disabled) pick(Number(b.dataset.i)); });
    $('check').addEventListener('click', () => { if (run && run.sel && run.sel.length) answer(run.sel.slice()); });
    $('next').addEventListener('click', nextQuestion);
    $('fb').addEventListener('click', e => { if (e.target.closest('a[href^="#/event/"]')) { sheetFromApp = true; lastFocus = $('next'); } });
    $('pauseBtn').addEventListener('click', () => { if (run && run.phase === 'question' && !run.paused) pauseRun('user'); });
    $('resumeBtn').addEventListener('click', resumeRun);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (parse().view === 'play') pauseRun('bg'); saveRun(); } });
    window.addEventListener('pagehide', () => { if (run && run.phase === 'question' && !run.paused) pauseRun('bg'); saveRun(); });
    // fiche
    $('sheetBackdrop').addEventListener('click', requestCloseSheet);
    $('sheet').addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'close') requestCloseSheet();
      else if (a.dataset.act === 'nav') go('#/event/' + a.dataset.id, true);
      else if (a.dataset.act === 'quiz') go('#/quiz?period=' + a.dataset.p);
    });
    $('resultCard').addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const last = store.get(LAST_KEY, null); if (!last) return;
      if (a.dataset.act === 'again') startRun(Object.assign({}, last.config));
      else if (a.dataset.act === 'fix') startRun({ mode: 'practice', review: true, period: 'all', ids: last.wrongIds, count: last.wrongIds.length, types: last.config.types, timed: last.config.timed });
      else if (a.dataset.act === 'ev') { sheetFromApp = true; lastFocus = a; go('#/event/' + a.dataset.id); }
    });
  }
  function setTlPeriod(p) { tl.period = p; renderTimeline(); const r = parse(); if (r.view === 'timeline') history.replaceState(null, '', '#/timeline' + (p !== 'all' ? '?period=' + p : '')); }
  function matches(e) {
    if (tl.period !== 'all' && e.period !== tl.period) return false;
    const q = norm(tl.q); if (!q) return true;
    const p = PER[e.period];
    const hay = norm([e.title, e.desc, e.note, e.q, H.yearLabel(e), String(Math.abs(e.year)), p.name, p.short].join(' '));
    return q.split(' ').every(w => hay.includes(w));
  }
  function renderTimeline() {
    if (!DATA) return;
    visible = DATA.events.filter(matches);
    document.querySelectorAll('#pchips [data-p], #eras [data-p]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === tl.period)));
    $('qClear').hidden = !tl.q; $('reset').hidden = tl.period === 'all' && !tl.q;
    const st = P && P.historyStats ? P.historyStats() : null, mastered = st ? st.mastered.filter(id => EV[id]).length : 0;
    $('count').textContent = visible.length === DATA.events.length ? `${visible.length} אירועים` : `${visible.length} מתוך ${DATA.events.length} אירועים`;
    $('heroStats').innerHTML = `<span>✅ ${mastered}/${DATA.events.length} אירועים שעניתם נכון</span>` + (st && st.points ? `<span>🏆 ${fmt(st.points)} נק׳ במבחנים</span>` : '');
    if (!visible.length) { $('list').innerHTML = '<p class="empty">לא נמצאו אירועים. נסו מילה אחרת או את כל התקופות.</p>'; return; }
    const groups = DATA.periods.map(p => ({ p, evs: visible.filter(e => e.period === p.id) })).filter(g => g.evs.length);
    $('list').innerHTML = groups.map(({ p, evs }) => `<section class="period" style="${styleP(p.id)}" aria-labelledby="ph-${p.id}">
      <header class="phead"><span class="pi" aria-hidden="true">${p.icon}</span><div><h2 id="ph-${p.id}">${esc(p.name)}</h2><small>${esc(p.range)} · ${evs.length === 1 ? 'אירוע אחד' : evs.length + ' אירועים'}</small></div><button type="button" class="pq" data-quiz="${p.id}" aria-label="חידון על ${esc(p.name)}">🎯 <span>חידון</span></button></header>
      <ol class="line">${evs.map(evItem).join('')}</ol></section>`).join('');
  }
  function evItem(e) {
    const s = status(e.id), tags = [];
    if (e.certainty === 'approx') tags.push('<span class="tag">≈ מקורב</span>');
    if (e.certainty === 'disputed') tags.push('<span class="tag warn">⚖️ במחלוקת</span>');
    if (e.source === 'course-diff') tags.push('<span class="tag warn">⚠️ לבדיקה</span>');
    if (s === 1) tags.push('<span class="tag ok">✓ ידעתי</span>'); else if (s === -1) tags.push('<span class="tag miss">🔁 לחזרה</span>');
    return `<li><button type="button" class="ev${s === 1 ? ' ok' : s === -1 ? ' miss' : ''}" data-ev="${e.id}" aria-haspopup="dialog"><span class="knot" aria-hidden="true"><i></i></span><span class="box"><span class="yr">${esc(H.yearLabel(e))}</span><h3>${esc(e.title)}</h3><p>${esc(e.desc)}</p>${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</span></button></li>`;
  }

  // ======================= fiche =======================
  function openSheet(id) {
    const e = EV[id], p = PER[e.period], list = visible.length ? visible : DATA.events;
    let i = list.findIndex(x => x.id === id); const nav = i >= 0 ? list : DATA.events; if (i < 0) i = nav.findIndex(x => x.id === id);
    const prev = nav[i - 1], next = nav[i + 1], doc = e.doc || p.doc, s = status(id);
    const links = [`<a class="course" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer"><span class="i" aria-hidden="true">📚</span><span>לחומרי הקורס<small>${esc(doc.title)} ↗</small></span></a>`];
    if (p.lessons) links.push(`<a href="${esc(p.lessons.url)}" target="_blank" rel="noopener noreferrer"><span class="i" aria-hidden="true">🗂️</span><span>סיכומי השיעורים<small>${esc(p.lessons.title)} ↗</small></span></a>`);
    links.push(`<a href="${esc(DATA.course.taarichon.url)}" target="_blank" rel="noopener noreferrer"><span class="i" aria-hidden="true">📅</span><span>תאריכון הקורס<small>לבדיקת התאריך ↗</small></span></a>`);
    if (e.j3d) links.push(`<a href="jerusalem3d.html?period=${e.j3d}"><span class="i" aria-hidden="true">🏛️</span><span>ירושלים בתלת־ממד<small>העיר בתקופה הזאת</small></span></a>`);
    (e.sites || []).forEach(sid => links.push(`<a href="site3d.html?site=${esc(sid)}"><span class="i" aria-hidden="true">🏛️</span><span>${esc(DATA.sites3d[sid])} בתלת־ממד<small>האתר באפליקציה</small></span></a>`));
    $('sheet').setAttribute('style', styleP(e.period));
    $('sheet').innerHTML = `<div class="sh-top"><div class="sh-art" style="flex:1"><span class="big" aria-hidden="true">${p.icon}</span><span><b>${esc(H.yearLabel(e))}</b><small>${esc(p.name)} · ${esc(p.range)}</small></span></div><button type="button" class="x" data-act="close" aria-label="סגירה">✕</button></div>
      <h2 id="shTitle">${esc(e.title)}</h2>
      <p class="d">${esc(e.desc)}</p>
      ${e.certainty !== 'firm' ? `<div class="tags" style="margin:0 0 6px"><span class="tag${e.certainty === 'disputed' ? ' warn' : ''}">${esc(H.CERT_LABEL[e.certainty])}</span>${e.examReady ? '' : '<span class="tag warn">באימון בלבד, לא במבחן</span>'}</div>` : (e.examReady ? '' : '<div class="tags"><span class="tag warn">באימון בלבד, לא במבחן</span></div>')}
      ${e.note ? `<div class="note">⚠️ ${esc(e.note)}</div>` : ''}
      <p class="src">${esc(H.SOURCE_LABEL[e.source])}${s === 1 ? ' · ✓ עניתם נכון בחידון' : s === -1 ? ' · 🔁 טעיתם בחידון — כדאי לחזור' : ''}</p>
      <div class="lk">${links.join('')}</div>
      <div class="sh-acts"><button type="button" class="btn go" data-act="quiz" data-p="${e.period}">🎯 חידון על ${esc(p.short)}</button>
      <button type="button" class="btn" data-act="nav" data-id="${prev ? prev.id : ''}" ${prev ? '' : 'disabled'}>→ הקודם</button><button type="button" class="btn" data-act="nav" data-id="${next ? next.id : ''}" ${next ? '' : 'disabled'}>הבא ←</button></div>`;
    const wrap = $('sheetWrap'), wasOpen = !wrap.hidden;
    wrap.hidden = false; document.body.classList.add('locked');
    $('sheet').scrollTop = 0;
    if (!wasOpen) { $('sheet').querySelector('.x').focus(); document.addEventListener('keydown', trap); }
    else $('shTitle').setAttribute('tabindex', '-1'), $('shTitle').focus();
  }
  function trap(e) {
    if ($('sheetWrap').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); requestCloseSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = [...$('sheet').querySelectorAll('a[href],button:not([disabled])')]; if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  function requestCloseSheet() {
    if (sheetFromApp && history.length > 1) { sheetFromApp = false; history.back(); }
    else go('#/timeline' + (tl.period !== 'all' ? '?period=' + tl.period : ''), true);
  }
  function closeSheet(restore) {
    if ($('sheetWrap').hidden) return;
    $('sheetWrap').hidden = true; document.body.classList.remove('locked'); document.removeEventListener('keydown', trap);
    if (restore) {
      if (lastFocus && !document.contains(lastFocus) && lastFocus.dataset && lastFocus.dataset.ev) lastFocus = document.querySelector(`[data-ev="${lastFocus.dataset.ev}"]`);
      if (lastFocus && document.contains(lastFocus) && lastFocus.offsetParent) lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  // ======================= quiz : réglages =======================
  function savePref() { store.set(PREF_KEY, pref); }
  function renderSetup() {
    if (pref.period !== 'all' && !PER[pref.period]) pref.period = 'all';
    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === pref.mode)));
    document.querySelectorAll('#qpchips [data-p]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === pref.period)));
    if (!H.TYPE_GROUPS[pref.types]) pref.types = 'mix';
    document.querySelectorAll('#qtypes [data-ty]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ty === pref.types)));
    const size = H.pool(DATA, { mode: pref.mode, period: pref.period }).length, all = H.pool(DATA, { period: pref.period }).length;
    const max = H.maxQuestions(DATA, { mode: pref.mode, period: pref.period, types: pref.types }), top = Math.min(max, 60);
    const opts = [10, 20, 40].filter(n => n < top).concat([top]);
    if (!opts.includes(pref.count)) pref.count = opts[0];
    $('counts').innerHTML = opts.map(n => `<button type="button" data-n="${n}" aria-pressed="${n === pref.count}">${n === max ? 'הכול · ' + n : n}</button>`).join('');
    $('timedWrap').hidden = pref.mode === 'exam'; $('timed').checked = pref.timed !== false;
    const excluded = all - size;
    $('rules').innerHTML = (pref.mode === 'exam'
      ? ['⏳ 30 שניות לשאלה (45 בשאלות עם כמה תשובות). נגמר הזמן = טעות.', '🏆 נכון = 100 + 3 × שניות שנותרו + בונוס רצף (עד +100).', '📈 בכל אירוע נספר רק השיא שלכם — משחק חוזר לא מכפיל נקודות.', '🙈 התשובות וההסברים מוצגים בסוף. בזמן השהיה השאלה מוסתרת.'].concat(excluded ? [`⚖️ ${excluded} אירועים שתאריכם שנוי במחלוקת או לא אחיד בחומרי הקורס — רק באימון.`] : [])
      : ['📖 אחרי כל תשובה: הסבר, השנים של כל האפשרויות וקישור לחומר הקורס.', pref.timed !== false ? '⏳ 30 שניות לשאלה (אפשר לכבות את השעון).' : '🐢 בלי שעון — לומדים בנחת.', '🎯 ניקוד אימון לא נספר בטבלת הכיתה.']
    ).concat(pref.types === 'mix' || pref.types === 'multi' ? ['☑️ בשאלות „אילו…?” יש כמה תשובות נכונות: מסמנים את כולן ולוחצים „בדיקה”.'] : []).map(t => `<li>${esc(t)}</li>`).join('');
    const st = P && P.historyStats ? P.historyStats() : null, mis = st ? st.mistakes.filter(id => EV[id]) : [];
    $('startReview').hidden = !mis.length; $('startReview').textContent = `🔁 לתרגל רק את הטעויות שלי (${mis.length})`;
    $('resume').hidden = !(run && run.phase !== 'done');
    if (run && run.phase !== 'done') $('resumeTxt').textContent = `${run.mode === 'exam' ? '🏆 מבחן' : '📖 אימון'} · שאלה ${Math.min(run.i + 1, run.questions.length)} מתוך ${run.questions.length} · ${fmt(run.score)} נק׳`;
    if (st) {
      $('kpis').innerHTML = `<div><strong>${fmt(st.points)}</strong><span>נק׳ שיא במבחנים</span></div><div><strong>${st.mastered.filter(id => EV[id]).length}/${DATA.events.length}</strong><span>אירועים שידעתי</span></div><div><strong>${mis.length}</strong><span>לחזרה</span></div>`;
      const runs = st.runs.slice(-5).reverse();
      $('runs').innerHTML = runs.length ? runs.map(r => `<li><span>${r.mode === 'exam' ? '🏆 מבחן' : '📖 אימון'} · ${esc(r.period === 'all' ? 'כל התקופות' : (PER[r.period] ? PER[r.period].short : r.period))} · ${new Date(r.at).toLocaleDateString('he-IL')}</span><b>${r.correct}/${r.total} · ${fmt(r.score)}</b></li>`).join('') : '<li><span>עוד לא שיחקתם. בהצלחה!</span></li>';
    }
  }

  // ======================= quiz : partie =======================
  function startRun(cfg) {
    const seed = uuid();
    const types = H.TYPE_GROUPS[cfg.types] ? cfg.types : 'mix';
    const questions = H.buildRun(DATA, { mode: cfg.mode, period: cfg.period, ids: cfg.ids, count: cfg.count, seed, types });
    if (!questions.length) return;
    clearInterval(ticker); ticker = null;
    run = { v: 1, runId: seed, mode: cfg.mode, review: !!cfg.review, period: cfg.period || 'all', timed: cfg.mode === 'exam' ? true : cfg.timed !== false,
      config: { mode: cfg.mode, period: cfg.period || 'all', count: cfg.count, timed: cfg.timed, ids: cfg.ids, review: !!cfg.review, types },
      questions, sel: [], i: 0, answers: [], score: 0, streak: 0, bestStreak: 0,
      activeMs: 0, phase: 'question', left: null, paused: null, startedAt: Date.now() };
    run.paused = 'nav'; newTimer(); saveRun();
    if (parse().view === 'play') { renderPlay(); resumeRun(); }
    else go('#/play');
  }
  function limit() { return run.timed ? H.questionMs(run.questions[run.i]) : 3600000; }
  function newTimer(left) { timer = new H.Timer(limit()); if (left != null) timer.left = left; announced = {}; }
  function saveRun() { if (!run) return; if (timer && run.phase === 'question') run.left = timer.remaining(); run.savedAt = Date.now(); store.set(RUN_KEY, run); }
  function loadRun() {
    const r = store.get(RUN_KEY, null);
    if (!r || r.v !== 1 || r.phase === 'done' || !Array.isArray(r.questions) || Date.now() - (r.savedAt || 0) > 864e5) { store.del(RUN_KEY); return null; }
    if (!r.questions.every(q => EV[q.eventId])) { store.del(RUN_KEY); return null; }
    if (r.phase === 'question') r.paused = r.paused || 'nav';
    newTimerFor(r); return r;
  }
  function newTimerFor(r) { timer = new H.Timer(r.timed ? H.questionMs(r.questions[r.i]) : 3600000); if (r.left != null) timer.left = r.left; }

  function renderPlay() {
    const q = run.questions[run.i], e = EV[q.eventId], p = PER[e.period], n = run.questions.length;
    $('qcard').setAttribute('style', styleP(e.period));
    const need = q.multi ? q.options.filter(o => o.correct).length : 0;
    $('qtag').textContent = `${p.icon} ${p.short}` + (run.mode === 'exam' ? ' · מבחן' : run.review ? ' · חזרה על טעויות' : ' · אימון') + (q.multi ? (need > 1 ? ` · ☑️ ${need} תשובות נכונות` : ' · ☑️ תשובה נכונה אחת') : '');
    $('qtext').textContent = q.prompt;
    $('qhint').hidden = !q.multi; $('qhint').textContent = H.multiHint(q);
    $('hPos').textContent = `שאלה ${run.i + 1} מתוך ${n}`;
    const pct = Math.round((run.i + (run.phase === 'answered' ? 1 : 0)) / n * 100);
    $('fill').style.width = pct + '%'; $('track').setAttribute('aria-valuenow', String(pct));
    $('hScore').textContent = fmt(run.score); $('hStreak').textContent = run.streak;
    $('clock').classList.toggle('off', !run.timed); $('pauseBtn').hidden = run.phase !== 'question';
    const a = run.phase === 'answered' ? run.answers[run.i] : null, sel = run.sel || [];
    $('answers').classList.toggle('txt', q.type !== 'date' && q.type !== 'century');
    $('answers').setAttribute('aria-label', q.multi ? 'תשובות — אפשר לסמן כמה' : 'תשובות');
    $('answers').innerHTML = q.options.map((o, i) => {
      let cls = 'ans';
      if (!a && q.multi && sel.includes(i)) cls += ' sel';
      if (a) {
        const picked = a.chosenIdx ? a.chosenIdx.includes(i) : a.chosen === o.value;
        if (run.mode === 'exam') cls += picked ? (o.correct ? ' picked-ok' : ' picked-bad') : ' dim';
        else cls += o.correct ? ' correct' : picked ? ' wrong' : ' dim';
      }
      const picked = a && (a.chosenIdx ? a.chosenIdx.includes(i) : a.chosen === o.value);
      return `<button type="button" class="${cls}" data-i="${i}" ${a ? 'disabled' : ''}${q.multi && !a ? ` aria-pressed="${sel.includes(i)}"` : ''}><kbd aria-hidden="true">${i + 1}</kbd>${esc(o.label)}${a && run.mode !== 'exam' && o.correct ? ' ✓' : ''}${picked && !o.correct ? ' ✗' : ''}</button>`;
    }).join('');
    $('check').hidden = !(q.multi && !a); $('check').disabled = !sel.length;
    $('check').textContent = sel.length ? `✔ בדיקה (${sel.length} מתוך ${need} נבחרו)` : (need > 1 ? `✔ בדיקה — סמנו ${need} תשובות` : '✔ בדיקה — סמנו תשובה אחת');
    renderFeedback(a, e);
    $('next').hidden = !a; $('next').textContent = run.i === n - 1 ? '🏁 לתוצאות' : 'לשאלה הבאה ←';
    updateClock();
    const paused = run.phase === 'question' && run.paused && run.paused !== 'nav';
    $('pausew').hidden = !paused; $('qcard').classList.toggle('blur', !!paused);
    if (run.paused === 'user') $('pauseTxt').textContent = 'השעון עצר. השאלה מוסתרת עד שתמשיכו.';
    if (run.paused === 'bg') $('pauseTxt').textContent = 'יצאתם מהאפליקציה — השעון עצר והשאלה מוסתרת.';
  }
  function renderFeedback(a, e) {
    const fb = $('fb'); if (!a) { fb.hidden = true; fb.className = 'fb'; return; }
    fb.hidden = false;
    const p = PER[e.period], doc = e.doc || p.doc;
    if (run.mode === 'exam') {
      fb.className = 'fb ' + (a.correct ? 'good' : 'bad');
      fb.innerHTML = a.correct ? `<strong>✅ נכון! <span class="pts">+${a.points}</span></strong>` : `<strong>${a.timedOut ? '⌛ נגמר הזמן' : '❌ לא נכון'}</strong>התשובה הנכונה תופיע בסיכום.`;
      return;
    }
    fb.className = 'fb ' + (a.correct ? 'good' : 'bad');
    const q = run.questions[run.i], answerTxt = q.type === 'date' ? H.yearLabel(e) : H.correctLabel(q);
    // Pour les questions sur plusieurs événements : chaque option avec son année, dans l'ordre du temps (on apprend aussi les leurres).
    const evOpts = q.options.map(o => EV[o.value]).filter(Boolean);
    const years = evOpts.length === q.options.length ? `<ul class="yrs">${evOpts.slice().sort((x, y) => x.year - y.year).map(x => `<li class="${q.options.find(o => o.value === x.id).correct ? 'ok' : ''}"><b>${esc(H.yearLabel(x))}</b> ${esc(x.title)}</li>`).join('')}</ul>` : '';
    fb.innerHTML = `<strong>${a.correct ? `✅ נכון! <span class="pts">+${a.points}</span>` : (a.timedOut ? '⌛ נגמר הזמן — ' : '❌ ') + 'התשובה: ' + esc(answerTxt)}</strong>${years || `${esc(e.title)} (${esc(H.yearLabel(e))}) — ${esc(e.desc)}`}${e.note && !years ? `<br><small>⚠️ ${esc(e.note)}</small>` : ''}<br><a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">📚 לחומרי הקורס ↗</a> · <a href="#/event/${e.id}">📖 לכרטיס האירוע</a>`;
  }
  function updateClock() {
    const full = run ? H.questionMs(run.questions[run.i]) : H.DURATION_MS;
    const left = run && run.phase === 'question' ? timer.remaining() : (run && run.answers[run.i] ? Math.max(0, full - run.answers[run.i].msUsed) : full);
    const secs = run && run.timed ? Math.ceil(left / 1000) : '∞';
    $('hSec').textContent = secs;
    const frac = run && run.timed ? Math.max(0, Math.min(1, left / full)) : 1;
    $('ring').setAttribute('stroke-dashoffset', String((226.2 * (1 - frac)).toFixed(1)));
    $('clock').classList.toggle('urgent', !!(run && run.timed && run.phase === 'question' && left <= 8000));
    $('clock').classList.toggle('paused', !(run && run.phase === 'question' && !run.paused));
    $('clock').setAttribute('aria-label', run && run.timed ? `נותרו ${secs} שניות` : 'בלי שעון');
  }
  function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(() => {
      if (!run || run.phase !== 'question' || run.paused) { clearInterval(ticker); ticker = null; return; }
      updateClock();
      if (run.timed) {
        const s = Math.ceil(timer.remaining() / 1000);
        if ((s === 10 || s === 5) && !announced[s]) { announced[s] = 1; $('liveTimer').textContent = `נותרו ${s} שניות`; }
        if (timer.expired()) answer(null);
      }
    }, 100);
  }
  // Question simple : un toucher = réponse. Plusieurs réponses : un toucher coche/décoche, puis « בדיקה ».
  function pick(i) {
    if (!run || run.phase !== 'question' || run.paused) return;
    const q = run.questions[run.i];
    if (!q.multi) { answer(i); return; }
    run.sel = run.sel || [];
    run.sel = run.sel.includes(i) ? run.sel.filter(x => x !== i) : run.sel.concat([i]);
    saveRun(); renderPlay();
  }
  function answer(idx) {
    if (!run || run.phase !== 'question' || run.paused) return;
    timer.pause(); clearInterval(ticker); ticker = null;
    const q = run.questions[run.i], left = timer.remaining(), used = Math.min(limit(), limit() - left);
    const idxs = idx == null ? null : (Array.isArray(idx) ? idx.slice().sort((x, y) => x - y) : [idx]);
    const correct = H.isCorrect(q, idxs), timedOut = idx == null;
    const values = idxs ? idxs.map(i => q.options[i].value) : null, want = q.options.filter(o => o.correct).map(o => o.value);
    const pts = H.scoreAnswer(correct, run.timed ? left : 0, run.streak);
    run.streak = correct ? run.streak + 1 : 0; run.bestStreak = Math.max(run.bestStreak, run.streak);
    run.score += pts; run.activeMs += used;
    run.answers[run.i] = { eventId: q.eventId, questionId: q.id, type: q.type, chosen: values ? (q.multi ? values : values[0]) : null, chosenIdx: idxs,
      expected: q.multi ? want : want[0], chosenLabel: H.answerLabel(q, idxs), expectedLabel: H.correctLabel(q), prompt: q.prompt, correct, timedOut, msUsed: Math.round(used), points: pts };
    run.phase = 'answered'; run.left = null; run.sel = []; saveRun();
    renderPlay();
    say(correct ? `נכון, ${pts} נקודות` : timedOut ? 'נגמר הזמן' : 'לא נכון');
    cheer(correct, pts);
    $('next').focus({ preventScroll: true });
    if (!reduceMotion()) $('next').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function nextQuestion() {
    if (!run || run.phase !== 'answered') return;
    if (run.i >= run.questions.length - 1) { finish(); return; }
    run.i++; run.phase = 'question'; run.paused = null; run.sel = []; newTimer(); saveRun();
    renderPlay(); timer.start(); startTicker();
    $('qtext').focus({ preventScroll: true }); window.scrollTo({ top: $('vPlay').offsetTop - 70, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
  function pauseRun(why) {
    if (!run || run.phase !== 'question' || run.paused) return;
    timer.pause(); clearInterval(ticker); ticker = null; run.paused = why; saveRun();
    if (parse().view === 'play') renderPlay();
  }
  function resumeRun() {
    if (!run || run.phase !== 'question') { if (run) run.paused = null; return; }
    run.paused = null; renderPlay(); timer.start(); startTicker(); saveRun();
    $('qtext').focus({ preventScroll: true });
  }
  function onKey(e) {
    if (parse().view !== 'play' || !run || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[1-9]$/.test(e.key) && run.phase === 'question' && !run.paused) { const b = $('answers').querySelector(`[data-i="${Number(e.key) - 1}"]`); if (b) { e.preventDefault(); pick(Number(e.key) - 1); } }
    if (e.key === 'Enter' && run.phase === 'question' && !run.paused && run.questions[run.i].multi && run.sel && run.sel.length && document.activeElement !== $('check')) { e.preventDefault(); answer(run.sel.slice()); }
  }
  function finish() {
    if (!run || run.phase === 'done') return;
    run.phase = 'done';
    const rec = H.buildResult(run, DATA);
    let saved = { saved: false, gained: 0 };
    try { if (P && P.saveHistory) saved = P.saveHistory(rec); } catch (e) { console.error(e); }
    try { window.dispatchEvent(new CustomEvent('moreh-dereh:quiz-complete', { detail: rec })); } catch (e) {}
    const wrongIds = rec.answerDetails.filter(a => !a.correct).map(a => a.eventId);
    store.set(LAST_KEY, { record: rec, gained: saved.gained || 0, saved: !!saved.saved, wrongIds, config: run.config });
    store.del(RUN_KEY); run = null; clearInterval(ticker); ticker = null;
    go('#/result', true);
  }

  // ======================= résultat =======================
  function renderResult(last) {
    const r = last.record, pct = r.total ? Math.round(r.correct / r.total * 100) : 0, exam = r.mode === 'exam';
    const wrong = r.answerDetails.filter(a => !a.correct);
    const head = pct === 100 ? '🏆 מושלם!' : pct >= 80 ? '🎉 מצוין!' : pct >= 60 ? '👏 יפה מאוד!' : '💪 ממשיכים להתאמן';
    const mins = Math.max(1, Math.round(r.durationMs / 60000));
    $('resultCard').innerHTML = `<h2 style="margin:0 0 6px">${head}</h2>
      <div class="big">${r.correct} / ${r.total}</div>
      <div class="pts">🏆 ${fmt(r.score)} נקודות</div>
      <p class="sub">${pct}% נכון · 🔥 רצף שיא ${r.bestStreak} · ⏱ כ־${mins} דק׳</p>
      ${exam ? `<span class="badge">${last.gained > 0 ? `📈 +${fmt(last.gained)} נקודות חדשות במסע שלך` : '📈 אין שיא חדש הפעם — רק השיא בכל אירוע נספר'}</span>` : `<span class="badge practice">📖 ${last.config && last.config.review ? 'חזרה על טעויות' : 'אימון'} — הניקוד לא נספר לטבלה</span>`}
      <div class="racts">
        ${wrong.length ? `<button type="button" class="btn go" data-act="fix">🔁 לתרגל את ${wrong.length} הטעויות</button>` : ''}
        <button type="button" class="btn ${wrong.length ? '' : 'go'}" data-act="again">↻ עוד סיבוב באותן הגדרות</button>
        <a class="btn mint" href="#/timeline" style="display:grid;place-items:center;text-decoration:none">⏳ לציר הזמן</a>
        <a class="btn" href="journey.html" style="display:grid;place-items:center;text-decoration:none">📈 המסע שלי</a>
      </div>
      ${wrong.length ? `<h3 style="text-align:start;margin:20px 0 0;font-size:16px">${exam ? '📋 התשובות הנכונות' : '📋 לחזור על'}</h3><ul class="recap">${wrong.map(a => { const e = EV[a.eventId]; if (!e) return ''; return `<li><button type="button" data-act="ev" data-id="${e.id}" style="${styleP(e.period)}"><span><b>${esc(e.title)}</b><small>${a.prompt && a.type !== 'date' ? esc(a.prompt) + '<br>' : ''}${a.timedOut ? '⌛ נגמר הזמן' : 'ענית: ' + esc(a.chosenLabel || (a.chosen == null ? '—' : H.formatYear(a.chosen)))}${a.expectedLabel && a.type !== 'date' ? ' · נכון: ' + esc(a.expectedLabel) : ''}</small></span><span class="yr">${esc(H.yearLabel(e))}</span></button></li>`; }).join('')}</ul>` : '<p class="sub" style="margin-top:16px">כל התשובות נכונות! 🌟</p>'}`;
    if (!reduceMotion() && pct >= 80) burst(window.innerWidth / 2, 120, 60);
  }

  // ======================= effets =======================
  const CHEERS = ['✅ כל הכבוד!', '🎉 מעולה!', '⭐ בול!', '👏 יפה מאוד!', '🚀 מדויק!'];
  function cheer(ok, pts) {
    const card = $('qcard');
    if (!ok) { if (!reduceMotion() && card.animate) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'ease-out' }); return; }
    if (navigator.vibrate) try { navigator.vibrate(18); } catch (e) {}
    const head = $('fb').querySelector('strong'); if (head && run && run.mode !== 'exam') head.firstChild.textContent = CHEERS[Math.floor(Math.random() * CHEERS.length)] + ' ';
    if (run && run.streak >= 3 && [3, 5, 10, 15, 20].includes(run.streak)) toast(run.streak >= 10 ? `🏆 ${run.streak} ברצף! מורה דרך אמיתי` : `🔥 ${run.streak} ברצף!`);
    if (reduceMotion()) return;
    const btn = $('answers').querySelector('.correct,.picked-ok'); if (!btn) return;
    const r = btn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, run && run.streak >= 5 ? 44 : 28);
    const plus = document.createElement('div'); plus.className = 'fx-plus'; plus.textContent = '+' + pts;
    plus.style.left = (r.left + r.width / 2 - 24) + 'px'; plus.style.top = (r.top - 6) + 'px'; document.body.appendChild(plus);
    const target = $('hScore').getBoundingClientRect();
    plus.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${target.left - r.left - r.width / 2 + 30}px,${target.top - r.top}px) scale(.7)`, opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => plus.remove();
  }
  function burst(x, y, n) {
    const layer = $('fx'), cols = ['#ffd878', '#6ee9cf', '#94b8ff', '#ff9fd0', '#d6a6ff'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.background = cols[i % cols.length]; layer.appendChild(p);
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 140, dx = Math.cos(a) * d, dy = Math.sin(a) * d - 60;
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}px,${dy + 160}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => p.remove();
    }
  }
  function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 1900); }

  // Accès pour les tests et pour d'autres modules du jeu.
  window.MDHistoryApp = { state: () => run, data: () => DATA };
})();
