/* Moreh Derech NEXT — « מבחן חלק א׳ » : quiz à choix multiples par thème (parta.html).
   #/                 choix du thème et du niveau
   #/play             manche de 10 questions (chronomètre, explication après chaque réponse)
   #/result           score, révision des erreurs
   #/rishui           « ממבחני רישוי » : vraies questions d'examens (parta/rishui.json, solution non officielle)
   La banque vient de parta/bank.json (construite par tools/build-parta.mjs). Les points vont dans progress.js (savePartA). */
(function () {
  'use strict';
  const C = window.MDPartA, P = window.MDProgress || null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'mdl_parta_v1', RUN = 'mdl_parta_run_v1';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const ss = { get(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const say = t => { const l = $('live'); if (!l) return; l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); };
  const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה'];
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  let BANK = null, RISHUI = null;
  const pref = store.get(KEY, { topic: 'all', level: 0 });
  const rpref = store.get(KEY + '_rishui', { topic: 'all', era: 'all' });
  let run = ss.get(RUN, null);     // { items, i, answers, topic, level, runId, startedAt, t0 }
  let timer = null;

  const getJSON = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  async function load() { if (!BANK) BANK = await getJSON('parta/bank.json'); return BANK; }
  async function loadRishui() { if (!RISHUI) RISHUI = await getJSON('parta/rishui.json'); return RISHUI; }

  function route() {
    clearInterval(timer); timer = null;
    const h = location.hash || '#/';
    if (h === '#/play') return showPlay();
    if (h === '#/result') return showResult();
    if (h === '#/rishui') return showRishui();
    return showHome();
  }
  addEventListener('hashchange', route);
  function fixBar() {
    const tb = document.querySelector('.md-tabbar'), h = tb ? tb.offsetHeight : 0;
    document.documentElement.style.setProperty('--tb', h + 'px');
    document.documentElement.style.setProperty('--tbpad', h ? '0px' : 'env(safe-area-inset-bottom, 0px)');
  }

  // ------------------------------------------------------------------ accueil
  async function showHome() {
    $('back').hidden = true;
    const app = $('app'); app.innerHTML = '<div class="card">טוען…</div>';
    try { await load(); } catch (e) { app.innerHTML = '<div class="card">לא ניתן לטעון את בנק השאלות.</div>'; return; }
    const st = P && P.partAStats ? P.partAStats() : { points: 0, known: [], mistakes: [], seen: [], status: () => 0 };
    const active = new Set(BANK.questions.map(q => q.id));
    st.known = st.known.filter(id => active.has(id));
    st.mistakes = st.mistakes.filter(id => active.has(id));
    const total = BANK.questions.length, known = st.known.length;
    const groups = [...new Set(BANK.topics.map(t => t.group))];
    const topicBtn = t => {
      const qs = BANK.questions.filter(q => q.topic === t.id), k = qs.filter(q => st.status(q.id) === 1).length;
      return `<button class="tp" data-topic="${t.id}" aria-pressed="${pref.topic === t.id}" ${qs.length ? '' : 'disabled'}><span class="e">${t.emoji}</span><span style="flex:1;min-width:0"><b>${esc(t.he)}</b><small>${qs.length ? `${k}/${qs.length} ידועות` : 'בקרוב'}</small>${t.coverageNote ? `<small>${esc(t.coverageNote)}</small>` : ''}${qs.length ? `<span class="bar"><i style="width:${Math.round(100 * k / qs.length)}%"></i></span>` : ''}</span></button>`;
    };
    app.innerHTML = `
      <section class="hero"><div class="eyebrow">הכנה למבחן · חלק א׳</div><h1>🎓 מבחן חלק א׳ — לפי נושאים</h1>
        <p>שאלות אמריקאיות בנושאי הבחינה, עם הסבר וקטע מאומת ממסמכי הקורס אחרי כל תשובה. עד 10 שאלות בסבב.</p>
        <div class="stats"><span>📚 ${total} שאלות</span><span>✅ ${known} ידועות</span><span>🏆 ${st.points.toLocaleString('he-IL')} נק׳</span>${st.mistakes.length ? `<span>🔁 ${st.mistakes.length} לתיקון</span>` : ''}</div></section>
      <a class="tp rishui-link" href="#/rishui" style="margin-top:12px;text-decoration:none"><span class="e">📜</span><span style="flex:1;min-width:0"><b>חדש: ממבחני רישוי</b><small>שאלות אמיתיות ממבחני משרד התיירות, 2000–2024, לפי נושא או לפי מבחן</small></span><span aria-hidden="true">⬅️</span></a>
      <section class="card"><h2>⚡ רמת קושי</h2>
        <div class="levels" role="group">${[[0, '🎲 הכול'], [1, '🌱 קל'], [2, '⭐ בינוני'], [3, '🔥 קשה']].map(([l, t]) => `<button data-level="${l}" aria-pressed="${pref.level === l}">${t}</button>`).join('')}</div></section>
      <section class="card"><h2>📚 נושא</h2>
        <div class="topics"><button class="tp" data-topic="all" aria-pressed="${pref.topic === 'all'}"><span class="e">🎲</span><span><b>מעורב — כל הנושאים</b><small>כמו במבחן האמיתי</small></span></button>
        ${st.mistakes.length ? `<button class="tp" data-topic="review" aria-pressed="${pref.topic === 'review'}"><span class="e">🔁</span><span><b>תיקון טעויות</b><small>${st.mistakes.length} שאלות שטעיתם בהן</small></span></button>` : ''}</div>
        ${groups.map(g => `<div class="grp">${esc(g)}</div><div class="topics">${BANK.topics.filter(t => t.group === g).map(topicBtn).join('')}</div>`).join('')}</section>
      <p class="foot">השאלות נכתבו במקור עבור המשחק לפי פרקי בחינת משרד התיירות ואומתו מול מקורות פתוחים (ויקיפדיה, רט״ג, אתרים רשמיים). מקור מצורף לכל שאלה. טעות? לחצו 💡 רעיון/בעיה.</p>
      <div class="go"><button class="btn big" id="start">▶️ ${run && run.i < run.items.length ? 'להמשיך את הסבב' : 'להתחיל סבב'}</button></div>`;
    app.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { pref.level = +b.dataset.level; store.set(KEY, pref); app.querySelectorAll('[data-level]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    app.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => { pref.topic = b.dataset.topic; store.set(KEY, pref); app.querySelectorAll('[data-topic]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('start').onclick = () => { if (!(run && !run.src && run.i < run.items.length && run.topic === pref.topic && run.level === pref.level)) newRun(); location.hash = '#/play'; };
    fixBar();
  }

  // ------------------------------------------------------------------ ממבחני רישוי
  async function showRishui() {
    $('back').hidden = false;
    const app = $('app'); app.innerHTML = '<div class="card">טוען…</div>';
    try { await load(); await loadRishui(); } catch (e) { app.innerHTML = '<div class="card">לא ניתן לטעון את שאלות המבחנים.</div>'; return; }
    const st = P && P.partAStats ? P.partAStats() : { known: [], mistakes: [], status: () => 0 };
    const ids = new Set(RISHUI.questions.map(q => q.id)), kind = new Map(RISHUI.sources.map(x => [x.key, x.kind]));
    const mistakes = st.mistakes.filter(id => ids.has(id)), known = st.known.filter(id => ids.has(id)).length;
    const inEra = q => rpref.era === 'all' || (rpref.era === 'new') === (kind.get(q.src) === 'exam');
    const topicBtn = t => {
      const qs = RISHUI.questions.filter(q => q.topic === t.id && inEra(q)), k = qs.filter(q => st.status(q.id) === 1).length;
      return `<button class="tp" data-topic="${t.id}" aria-pressed="${rpref.topic === t.id}" ${qs.length ? '' : 'disabled'}><span class="e">${t.emoji}</span><span style="flex:1;min-width:0"><b>${esc(t.he)}</b><small>${qs.length ? `${k}/${qs.length} ידועות` : 'אין שאלות'}</small>${qs.length ? `<span class="bar"><i style="width:${Math.round(100 * k / qs.length)}%"></i></span>` : ''}</span></button>`;
    };
    const groups = [...new Set(BANK.topics.map(t => t.group))];
    const nEra = e => RISHUI.questions.filter(q => e === 'all' || (e === 'new') === (kind.get(q.src) === 'exam')).length;
    app.innerHTML = `
      <section class="hero"><div class="eyebrow">הכנה למבחן · חלק א׳</div><h1>📜 ממבחני רישוי</h1>
        <p>שאלות אמיתיות ממבחני הרישוי של משרד התיירות, מתוך הקובץ של אפרת נקש. סדר התשובות נשמר כמו במבחן.</p>
        <p style="margin-top:6px"><b>⚠️ פתרון לא רשמי:</b> הקובץ אינו כולל פתרונות. כל שאלה נפתרה בנפרד, ומוצגות רק שאלות שהתשובה עליהן בטוחה. מצאתם טעות? 💡 רעיון/בעיה.</p>
        <div class="stats"><span>📚 ${RISHUI.questions.length} שאלות</span><span>✅ ${known} ידועות</span>${mistakes.length ? `<span>🔁 ${mistakes.length} לתיקון</span>` : ''}</div></section>
      <section class="card"><h2>🗓️ אילו מבחנים</h2>
        <div class="levels" role="group" style="grid-template-columns:repeat(3,1fr)">${[['all', '🎲 הכול'], ['new', '🆕 2018–2024'], ['old', '📚 עד 2017']].map(([e, t]) => `<button data-era="${e}" aria-pressed="${rpref.era === e}">${t}<br><small style="font-weight:700">${nEra(e)}</small></button>`).join('')}</div></section>
      <section class="card"><h2>📚 נושא</h2>
        <div class="topics"><button class="tp" data-topic="all" aria-pressed="${rpref.topic === 'all'}"><span class="e">🎲</span><span><b>מעורב — כל הנושאים</b><small>כמו במבחן האמיתי</small></span></button>
        ${mistakes.length ? `<button class="tp" data-topic="review" aria-pressed="${rpref.topic === 'review'}"><span class="e">🔁</span><span><b>תיקון טעויות</b><small>${mistakes.length} שאלות שטעיתם בהן</small></span></button>` : ''}</div>
        ${groups.map(g => `<div class="grp">${esc(g)}</div><div class="topics">${BANK.topics.filter(t => t.group === g).map(topicBtn).join('')}</div>`).join('')}</section>
      <p class="foot">מקור השאלות: <a href="https://docs.google.com/document/d/1wocBDJn9CqnjmXn-2i9O74AMWuR5P0abn1rPa6wDVFg/edit" target="_blank" rel="noopener">״קישורים לשאלות על נושאי הלימוד בקורס מורי דרך״ — אפרת נקש</a>. ליד כל תשובה: קישור לקובץ ומספר השאלה בו. שאלות שתלויות במפה, שהתיישנו או שהפתרון שלהן לא ודאי — הושמטו.</p>
      <div class="go"><a class="btn" href="#/" style="display:flex;align-items:center;justify-content:center;text-decoration:none">🎓 בנק הקורס</a><button class="btn big" id="rstart">▶️ ${run && run.src === 'rishui' && run.i < run.items.length ? 'להמשיך את הסבב' : 'להתחיל סבב'}</button></div>`;
    app.querySelectorAll('[data-era]').forEach(b => b.onclick = () => { rpref.era = b.dataset.era; store.set(KEY + '_rishui', rpref); showRishui(); });
    app.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => { rpref.topic = b.dataset.topic; store.set(KEY + '_rishui', rpref); app.querySelectorAll('[data-topic]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('rstart').onclick = () => { if (!(run && run.src === 'rishui' && run.i < run.items.length && run.topic === rpref.topic && run.era === rpref.era)) newRishuiRun(); location.hash = '#/play'; };
    fixBar();
  }
  function newRishuiRun(ids) {
    const st = P && P.partAStats ? P.partAStats() : { seen: [], mistakes: [] };
    const o = { topic: rpref.topic === 'review' ? 'all' : rpref.topic, era: rpref.era, seed: uuid(), avoid: st.seen, n: C.ROUND };
    if (ids) { o.ids = ids; o.avoid = []; o.n = ids.length; }
    else if (rpref.topic === 'review') { const known = new Set(RISHUI.questions.map(q => q.id)); o.ids = st.mistakes.filter(id => known.has(id)); o.avoid = []; }
    run = { src: 'rishui', items: C.pickRishui(RISHUI, o), i: 0, answers: {}, topic: rpref.topic, era: rpref.era, level: 0, runId: uuid(), startedAt: new Date().toISOString(), t0: null };
    ss.set(RUN, run);
  }
  function newRun() {
    const st = P && P.partAStats ? P.partAStats() : { seen: [], mistakes: [] };
    const o = { topic: pref.topic === 'review' ? 'all' : pref.topic, level: pref.level, seed: uuid(), avoid: st.seen, n: C.ROUND };
    if (pref.topic === 'review') { o.ids = st.mistakes; o.avoid = []; }
    const items = C.pick(BANK, o);
    run = { items, i: 0, answers: {}, topic: pref.topic, level: pref.level, runId: uuid(), startedAt: new Date().toISOString(), t0: null };
    ss.set(RUN, run);
  }

  // ------------------------------------------------------------------ manche
  async function showPlay() {
    $('back').hidden = false;
    try { await load(); } catch (e) { $('app').innerHTML = '<div class="card">לא ניתן לטעון את בנק השאלות.</div>'; return; }
    if (run && run.src === 'rishui') { try { await loadRishui(); } catch (e) {} }
    if (!run || !run.items.length) { newRun(); if (!run.items.length) { $('app').innerHTML = '<div class="card">אין עדיין שאלות בנושא הזה. <a href="#/">חזרה</a></div>'; return; } }
    if (run.i >= run.items.length) { location.hash = '#/result'; return; }
    const it = run.items[run.i], L = C.LEVELS[it.level], topic = BANK.topics.find(t => t.id === it.topic) || {};
    const answered = run.answers[it.id];
    const app = $('app');
    app.innerHTML = `
      <section class="card">
        <div class="qhead"><span>${esc(topic.emoji || '')} ${esc(topic.he || '')} · ${it.rishui ? '📜 ' + esc(it.rishui.year || 'ממבחני רישוי') : esc(L.label)}</span><span>${run.i + 1} / ${run.items.length}</span></div>
        <div class="timer" id="timer"><i id="tbar"></i></div>
        <p class="q" id="q">${esc(it.q)}</p>
        <div class="answers" id="answers">${it.options.map((o, k) => `<button class="ans" data-k="${k}"><span class="k">${LETTERS[k]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <div id="expl"></div>
      </section>
      <div class="go"><button class="btn" id="quit">✖️ סיום</button><button class="btn big" id="next" hidden>הבא ⏭️</button></div>`;
    fixBar();
    $('quit').onclick = () => { clearInterval(timer); finishRun(); };
    $('next').onclick = () => { run.i++; ss.set(RUN, run); if (run.i >= run.items.length) finishRun(); else showPlay(); };
    if (answered) { reveal(it, answered.choice, answered.ms, true); return; }
    run.t0 = Date.now(); ss.set(RUN, run);
    app.querySelectorAll('.ans').forEach(b => b.onclick = () => answer(it, +b.dataset.k));
    clearInterval(timer);
    timer = setInterval(() => {
      const left = Math.max(0, L.ms - (Date.now() - run.t0));
      const bar = $('tbar'), tm = $('timer'); if (!bar) { clearInterval(timer); return; }
      bar.style.width = (100 * left / L.ms) + '%'; if (left < 10000) tm.classList.add('low');
      if (left <= 0) { clearInterval(timer); answer(it, -1); }
    }, 250);
    document.onvisibilitychange = () => { if (document.hidden && run && run.t0) { run.paused = Date.now(); } else if (run && run.paused) { run.t0 += Date.now() - run.paused; run.paused = null; } };
  }
  function answer(it, k) {
    clearInterval(timer);
    const ms = Date.now() - (run.t0 || Date.now());
    run.answers[it.id] = { choice: k, ms }; ss.set(RUN, run);
    reveal(it, k, ms, false);
  }
  function illustrationHTML(it) {
    const img = it.illustration;
    if (!img || !/^assets\/learning\/[a-z0-9-]+\.(png|webp|jpg)$/.test(img.src)) return '';
    const link = /^https:\/\/www\.canva\.com\/M\/[A-Za-z0-9_-]+$/.test(img.url || '') ? img.url : null;
    return `<figure class="learning-illustration"><img src="${esc(img.src)}" alt="${esc(img.alt || '')}" width="200" height="200" loading="lazy"><figcaption>${esc(img.caption || '')}${link ? `<br><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">🖼️ פתיחת האיור ב־Canva</a>` : ''}</figcaption></figure>`;
  }
  function reveal(it, k, ms, restored) {
    const ok = k === it.correct;
    document.querySelectorAll('.ans').forEach(b => { const i = +b.dataset.k; b.disabled = true; b.classList.add(i === it.correct ? 'ok' : i === k ? 'bad' : 'dim'); });
    const streak = (() => { let s = 0; for (let j = run.i - 1; j >= 0; j--) { const a = run.answers[run.items[j].id]; if (a && a.choice === run.items[j].correct) s++; else break; } return s + (ok ? 1 : 0); })();
    const p = C.points(ok, ms, it.level, streak);
    $('expl').innerHTML = `<div class="expl ${ok ? 'ok' : 'bad'}"><b>${ok ? '✅ נכון!' : k === -1 ? '⏰ נגמר הזמן' : '❌ לא נכון'}</b> ${ok ? `<span class="pts">+${p}</span>` : `— התשובה: <b>${esc(it.options[it.correct])}</b>`}<br>${esc(it.explanation)}${illustrationHTML(it)}
      ${it.rishui ? `<div class="rishui-src">📜 שאלה ${it.rishui.n} · ${esc(it.rishui.title)}${it.rishui.year ? ' · ' + esc(it.rishui.year) : ''}<br><small>💡 פתרון לא רשמי${it.conf === 'medium' ? ' · כדאי לבדוק מול חומר הקורס' : ''}</small><br><a href="${esc(it.rishui.url)}" target="_blank" rel="noopener">📄 לקובץ השאלות (אפרת נקש)</a></div>` : ''}
      ${it.source && it.source.url ? `<br><a href="${esc(it.source.url)}" target="_blank" rel="noopener">📚 ${esc(it.source.title || 'מקור')}</a>` : ''}
      ${it.source && it.source.quote ? `<details class="source-evidence"><summary>📖 הקטע בקורס שמבסס את התשובה</summary><blockquote dir="auto">${esc(it.source.quote)}</blockquote><small>נבדק מול מסמך הקורס: ${esc(it.source.verifiedAt || '')}</small></details>` : ''}
      ${it.tags.length ? `<div class="tags">${it.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}</div>`;
    if (!restored) { say(ok ? 'נכון' : 'לא נכון'); if (navigator.vibrate && !ok) try { navigator.vibrate(80); } catch (e) {} }
    $('next').hidden = false; $('next').textContent = run.i + 1 >= run.items.length ? '🏁 לתוצאה' : 'הבא ⏭️';
    if (!reduce()) $('next').focus();
  }
  function finishRun() {
    if (!run) { location.hash = '#/'; return; }
    const done = run.items.filter(it => run.answers[it.id]);
    if (done.length) {
      const rec = C.record(done, run.answers, { mode: run.src === 'rishui' ? 'rishui' : 'round', topic: run.topic, level: run.level, runId: run.runId });
      run.rec = rec; run.saved = P && P.savePartA ? P.savePartA(rec) : null;
    } else run.rec = null;
    run.i = run.items.length; ss.set(RUN, run);
    location.hash = '#/result';
  }

  // ------------------------------------------------------------------ résultat
  async function showResult() {
    $('back').hidden = false;
    try { await load(); if (run && run.src === 'rishui') await loadRishui(); } catch (e) {}
    const app = $('app');
    if (!run || !run.rec) { app.innerHTML = '<div class="card">לא נענו שאלות. <a href="#/">חזרה לנושאים</a></div>'; return; }
    const r = run.rec, g = C.grade(r.correct, r.total);
    const wrong = run.items.filter(it => run.answers[it.id] && run.answers[it.id].choice !== it.correct);
    app.innerHTML = `
      <section class="card res"><div class="big">${g.emoji}</div><h2>${esc(g.he)}</h2>
        <div class="score">${r.score.toLocaleString('he-IL')}</div><p>${r.correct} מתוך ${r.total} נכונות${run.saved && run.saved.saved ? ` · +${run.saved.gained.toLocaleString('he-IL')} נק׳ למסע שלי` : ''}</p></section>
      ${wrong.length ? `<section class="card"><h2>🔁 לחזור על</h2><div class="rev">${wrong.map(it => `<div><span>❌</span><span><b>${esc(it.q)}</b><br>✅ ${esc(it.options[it.correct])}<br><small>${esc(it.explanation)}</small></span></div>`).join('')}</div></section>` : '<section class="card"><h2>🎯 בלי טעויות!</h2></section>'}
      <div class="go"><a class="btn" href="${run.src === 'rishui' ? '#/rishui' : '#/'}" style="display:flex;align-items:center;justify-content:center;text-decoration:none">${run.src === 'rishui' ? '📜 מבחנים' : '🎓 נושאים'}</a><button class="btn big" id="again">▶️ סבב נוסף</button>${wrong.length ? '<button class="btn mint" id="redo">🔁 רק הטעויות</button>' : ''}</div>`;
    fixBar();
    if (run.src === 'rishui') {
      $('again').onclick = () => { newRishuiRun(); location.hash = '#/play'; };
      const rr = $('redo'); if (rr) rr.onclick = () => { newRishuiRun(wrong.map(w => w.id)); location.hash = '#/play'; };
      return;
    }
    $('again').onclick = () => { newRun(); location.hash = '#/play'; };
    const rd = $('redo'); if (rd) rd.onclick = () => { const items = C.pick(BANK, { ids: wrong.map(w => w.id), seed: uuid(), n: wrong.length }); run = { items, i: 0, answers: {}, topic: run.topic, level: run.level, runId: uuid(), startedAt: new Date().toISOString(), t0: null }; ss.set(RUN, run); location.hash = '#/play'; };
  }

  window.MDPartAApp = { state: () => ({ run, pref, rpref }), bank: () => BANK, rishui: () => RISHUI, newRun, newRishuiRun };
  route();
})();
