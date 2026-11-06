/* Moreh Derech NEXT — « מבחן מחצית » : simulation d'une vraie épreuve de la partie A (parta.html#/mt…).
   #/mt      présentation, règles, meilleur score, reprise
   #/mt/a    45 questions à choix multiples (une feuille, comme sur papier)
   #/mt/b    45 questions à compléter
   #/mt/r    correction : note /40, auto-vérification des réponses libres, révision
   Deux modes : « סימולציה » (aucune réponse avant la remise, chrono 90′) et « תרגול » (réponse et explication tout de suite).
   Données : parta/midterm-<id>.json (tools/build-parta.mjs). Logique de note : MDPartA.scoreMidterm. Brouillon dans localStorage. */
(function () {
  'use strict';
  const C = window.MDPartA;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const LETTERS = ['א', 'ב', 'ג', 'ד'];
  const EXAM = '2026-b', KEY = 'mdl_midterm_' + EXAM, BEST = 'mdl_midterm_best_' + EXAM;
  const drive = id => 'https://drive.google.com/open?id=' + encodeURIComponent(id);
  let M = null, timer = null;
  let S = store.get(KEY, null);   // { mode, mcq, fill, self, startedAt, submittedAt, only }
  const save = () => store.set(KEY, S);
  const load = async () => { if (!M) { const r = await fetch('parta/midterm-' + EXAM + '.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); M = await r.json(); } return M; };
  const fmtPts = x => (Math.round(x * 2) / 2).toLocaleString('he-IL');
  const topicName = id => { const b = window.MDPartAApp && window.MDPartAApp.bank(); const t = b && b.topics.find(x => x.id === id); return t ? t.emoji + ' ' + t.he : ''; };
  const flagNote = q => (q.flags || []).map(f => f === 'check' ? '<span class="flag warn">⚠️ לא מצאנו בחומר הקורס — לוודא</span>' : f === 'fixed' ? '<span class="flag">✏️ תוקן לעומת קובץ התשובות</span>' : f === 'added' ? '<span class="flag">➕ לא היה בקובץ התשובות</span>' : '').join('');
  function fixBar() {
    const tb = document.querySelector('.md-tabbar'), h = tb ? tb.offsetHeight : 0;
    document.documentElement.style.setProperty('--tb', h + 'px');
    document.documentElement.style.setProperty('--tbpad', h ? '0px' : 'env(safe-area-inset-bottom, 0px)');
  }

  async function show(h) {
    clearInterval(timer); timer = null;
    $('back').hidden = false; $('back').href = h === '#/mt' ? '#/' : '#/mt'; $('back').textContent = h === '#/mt' ? '🎓 נושאים' : '📝 מבחן מחצית';
    try { await load(); } catch (e) { $('app').innerHTML = '<div class="card">לא ניתן לטעון את המבחן.</div>'; return; }
    if (h === '#/mt/a' || h === '#/mt/b') { if (!S) { location.hash = '#/mt'; return; } if (S.submittedAt && S.mode === 'exam') { location.hash = '#/mt/r'; return; } return sheet(h === '#/mt/a' ? 'mcq' : 'fill'); }
    if (h === '#/mt/r') { if (!S) { location.hash = '#/mt'; return; } return result(); }
    return intro();
  }

  // ------------------------------------------------------------------ présentation
  function intro() {
    const R = M.rules, best = store.get(BEST, null);
    const inProgress = S && !S.submittedAt;
    $('app').innerHTML = `
      <section class="hero"><div class="eyebrow">${esc(M.course)} · סימולציה</div><h1>📝 ${esc(M.title)}</h1>
        <p>המבחן האמיתי, כלשונו: ${R.questions} שאלות אמריקאיות ו-${R.questions} שאלות השלמה. עונים על ${R.answer} בכל חלק, כל שאלה ${fmtPts(R.points)} נק׳.</p>
        <div class="stats"><span>🎯 ${R.answer * R.points * 2} נק׳</span><span>⏱️ ${R.minutes} דק׳</span>${best ? `<span>🏆 שיא: ${fmtPts(best.got)} / ${best.max}</span>` : ''}</div></section>
      <section class="card"><h2>📋 הכללים, כמו במבחן</h2>
        <ul class="rules">
          <li>${R.answer} מתוך ${R.questions} בכל חלק. <b>מי שעונה על יותר — רק ${R.answer} הראשונות נספרות</b>, אז דלגו על השאלות שאתם הכי פחות בטוחים בהן.</li>
          <li>אין ניקוד שלילי: עדיף לענות על ${R.answer} בדיוק.</li>
          <li>בשאלות ההשלמה הבדיקה אוטומטית. תשובה בניסוח אחר עוברת לבדיקה עצמית מול התשובה לדוגמה.</li>
        </ul></section>
      <section class="card"><h2>🧭 איך מתאמנים?</h2>
        <div class="modes">
          <button class="mode" data-mode="exam"><span class="e">⏱️</span><span><b>סימולציה מלאה</b><small>${R.minutes} דק׳, בלי תשובות עד ההגשה, ציון בסוף</small></span></button>
          <button class="mode" data-mode="practice"><span class="e">📖</span><span><b>תרגול עם תשובות</b><small>התשובה וההסבר מיד אחרי כל שאלה</small></span></button>
        </div>
        ${inProgress ? `<p class="resume">יש מבחן פתוח (${S.mode === 'exam' ? 'סימולציה' : 'תרגול'}, ${answeredCount()} תשובות). <a href="#/mt/a">להמשיך ▶️</a></p>` : ''}
        ${S && S.submittedAt ? `<p class="resume"><a href="#/mt/r">📊 לתוצאה האחרונה</a></p>` : ''}</section>
      <p class="foot">📄 ${M.sources.map(s => `<a href="${drive(s.id)}" target="_blank" rel="noopener">${esc(s.title)}</a> <small>(${esc(s.note)})</small>`).join('<br>📄 ')}<br>${esc(M.note)}</p>`;
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      if (inProgress && !confirm('להתחיל מחדש? התשובות של המבחן הפתוח יימחקו.')) return;
      S = { mode: b.dataset.mode, mcq: {}, fill: {}, self: {}, startedAt: Date.now(), submittedAt: null }; save(); location.hash = '#/mt/a';
    });
    fixBar();
  }
  const answeredCount = () => Object.keys(S.mcq || {}).length + Object.values(S.fill || {}).filter(v => String(v).trim()).length;

  // ------------------------------------------------------------------ feuille d'examen
  function sheet(kind) {
    const list = (S.only ? (kind === 'mcq' ? M.mcq : M.fill).filter(q => S.only[kind] && S.only[kind].includes(q.n)) : kind === 'mcq' ? M.mcq : M.fill);
    const practice = S.mode === 'practice';
    $('app').innerHTML = `
      <div class="sbar" id="sbar">
        <div class="tabs2"><a href="#/mt/a" aria-current="${kind === 'mcq'}">א. אמריקאיות</a><a href="#/mt/b" aria-current="${kind === 'fill'}">ב. השלמה</a></div>
        <div class="sline"><span id="cnt"></span>${S.mode === 'exam' ? '<span class="clock" id="clock"></span>' : '<span>📖 תרגול</span>'}</div></div>
      <section class="card sheet" id="sheet">${list.length ? list.map(q => kind === 'mcq' ? mcqHTML(q, practice) : fillHTML(q, practice)).join('') : '<p>אין כאן שאלות לתרגל — <a href="#/mt/b">לחלק ב׳</a></p>'}</section>
      <div class="go">${kind === 'mcq' ? '<a class="btn" href="#/mt/b" style="display:flex;align-items:center;justify-content:center;text-decoration:none">לחלק ב׳ ⏭️</a>' : '<a class="btn" href="#/mt/a" style="display:flex;align-items:center;justify-content:center;text-decoration:none">⏮️ לחלק א׳</a>'}<button class="btn big" id="submit">📨 הגשה</button></div>`;
    const sh = $('sheet');
    sh.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const n = +b.dataset.n, k = +b.dataset.k;
      if (practice && Number.isInteger(S.mcq[n])) return;       // en mode תרגול, la première réponse est définitive
      if (S.mcq[n] === k) delete S.mcq[n]; else S.mcq[n] = k;     // retoucher = effacer (comme gommer sur papier)
      save(); redrawQ(n, 'mcq', practice); counts(kind);
    });
    sh.querySelectorAll('.fin').forEach(inp => {
      inp.oninput = () => { S.fill[inp.dataset.n] = inp.value; save(); counts(kind); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (practice) checkFill(+inp.dataset.n); else { const nx = sh.querySelector(`.fin[data-n="${+inp.dataset.n + 1}"]`); if (nx) nx.focus(); } } };
    });
    sh.querySelectorAll('[data-check]').forEach(b => b.onclick = () => checkFill(+b.dataset.check));
    sh.querySelectorAll('[data-self]').forEach(b => b.onclick = () => { const [n, v] = b.dataset.self.split(':'); S.self[n] = v === '1'; save(); redrawQ(+n, 'fill', true); });
    $('submit').onclick = submit;
    counts(kind);
    if (S.mode === 'exam') tick();
    fixBar();
  }
  function checkFill(n) { S.checked = S.checked || {}; S.checked[n] = true; save(); redrawQ(n, 'fill', true); }
  function redrawQ(n, kind, practice) {
    const el = document.getElementById(kind + '-' + n), q = (kind === 'mcq' ? M.mcq : M.fill).find(x => x.n === n);
    if (!el || !q) return;
    const tmp = document.createElement('div'); tmp.innerHTML = kind === 'mcq' ? mcqHTML(q, practice) : fillHTML(q, practice);
    const nu = tmp.firstElementChild; el.replaceWith(nu);
    nu.querySelectorAll('.opt').forEach(b => b.onclick = () => { const k = +b.dataset.k; if (practice && Number.isInteger(S.mcq[n])) return; if (S.mcq[n] === k) delete S.mcq[n]; else S.mcq[n] = k; save(); redrawQ(n, 'mcq', practice); counts(kind); });
    nu.querySelectorAll('.fin').forEach(inp => { inp.oninput = () => { S.fill[n] = inp.value; save(); counts(kind); }; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); checkFill(n); } }; });
    nu.querySelectorAll('[data-check]').forEach(b => b.onclick = () => checkFill(n));
    nu.querySelectorAll('[data-self]').forEach(b => b.onclick = () => { const v = b.dataset.self.split(':')[1]; S.self[n] = v === '1'; save(); redrawQ(n, 'fill', true); });
  }
  function explain(q, ok) {
    return `<div class="expl ${ok === true ? 'ok' : ok === false ? 'bad' : ''}">${q.options ? `<b>${ok ? '✅ נכון' : '❌ התשובה: ' + LETTERS[q.correct] + '. ' + esc(q.options[q.correct])}</b><br>` : ''}${esc(q.explanation)}<div class="tags"><span>${esc(topicName(q.topic))}</span>${flagNote(q)}</div></div>`;
  }
  function mcqHTML(q, practice) {
    const given = S.mcq[q.n], done = practice && Number.isInteger(given);
    return `<div class="qq" id="mcq-${q.n}"><p class="qt"><span class="num">${q.n}</span>${esc(q.q)}</p>
      <div class="opts">${q.options.map((o, k) => `<button class="opt${given === k ? ' on' : ''}${done ? (k === q.correct ? ' ok' : given === k ? ' bad' : ' dim') : ''}" data-n="${q.n}" data-k="${k}" aria-pressed="${given === k}" ${done ? 'disabled' : ''}><span class="k">${LETTERS[k]}</span><span>${esc(o)}</span></button>`).join('')}</div>
      ${done ? explain(q, given === q.correct) : ''}</div>`;
  }
  function fillHTML(q, practice) {
    const v = S.fill[q.n] || '', checked = practice && S.checked && S.checked[q.n] && v.trim();
    let out = '';
    if (checked) {
      const auto = C.matchFill(v, q.answers), self = S.self[q.n];
      const ok = auto === true ? true : typeof self === 'boolean' ? self : null;
      out = `<div class="expl ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><b>${ok === true ? '✅ נכון' : ok === false ? '❌ לא מדויק' : '🤔 ניסוח אחר — בדיקה עצמית'}</b> · תשובה לדוגמה: <b>${esc(q.answers[0])}</b>${q.answers.length > 1 ? ` <small>(מתקבל גם: ${q.answers.slice(1, 5).map(esc).join(', ')})</small>` : ''}<br>${esc(q.explanation)}
        ${auto !== true ? `<div class="selfck"><button class="btn mint" data-self="${q.n}:1">✔ צדקתי</button><button class="btn" data-self="${q.n}:0">✖ טעיתי</button></div>` : ''}
        <div class="tags"><span>${esc(topicName(q.topic))}</span>${flagNote(q)}</div></div>`;
    }
    return `<div class="qq" id="fill-${q.n}"><label class="qt" for="fi-${q.n}"><span class="num">${q.n}</span>${esc(q.q)}</label>
      <div class="frow"><input class="fin" id="fi-${q.n}" data-n="${q.n}" value="${esc(v)}" autocomplete="off" enterkeyhint="${practice ? 'done' : 'next'}" dir="rtl" ${checked ? 'readonly' : ''}>${practice && !checked ? `<button class="btn" data-check="${q.n}">בדיקה</button>` : ''}</div>${out}</div>`;
  }
  function counts(kind) {
    const R = M.rules, n = kind === 'mcq' ? Object.keys(S.mcq).length : Object.values(S.fill).filter(v => String(v).trim()).length;
    const el = $('cnt'); if (!el) return;
    el.innerHTML = `ענית על <b>${n}</b> / ${R.answer}` + (n > R.answer ? ` <span class="over">⚠️ ${n - R.answer} האחרונות לא ייספרו</span>` : n === R.answer ? ' ✅' : '');
  }
  function tick() {
    const end = S.startedAt + M.rules.minutes * 60000;
    const draw = () => {
      const c = $('clock'); if (!c) { clearInterval(timer); return; }
      const left = Math.max(0, end - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      c.textContent = `⏳ ${m}:${String(s).padStart(2, '0')}`; c.classList.toggle('low', left < 10 * 60000);
      if (!left) { clearInterval(timer); alert('נגמר הזמן — המבחן מוגש.'); finish(); }
    };
    draw(); timer = setInterval(draw, 1000);
  }
  function submit() {
    const R = M.rules, a = Object.keys(S.mcq).length, b = Object.values(S.fill).filter(v => String(v).trim()).length;
    const warn = [];
    if (a < R.answer) warn.push(`בחלק א׳ ענית רק על ${a} מתוך ${R.answer}.`);
    if (b < R.answer) warn.push(`בחלק ב׳ ענית רק על ${b} מתוך ${R.answer}.`);
    if (a > R.answer || b > R.answer) warn.push('ענית על יותר מ-' + R.answer + ' שאלות בחלק: רק ה-' + R.answer + ' הראשונות ייספרו.');
    if (warn.length && !confirm(warn.join('\n') + '\n\nלהגיש בכל זאת?')) return;
    finish();
  }
  function finish() {
    S.submittedAt = Date.now(); save();
    const r = C.scoreMidterm(M, S);
    if (!r.pending && !S.only) { const best = store.get(BEST, null); if (!best || r.got > best.got) store.set(BEST, { got: r.got, max: r.max, at: new Date().toISOString().slice(0, 10) }); }
    location.hash = '#/mt/r';
  }

  // ------------------------------------------------------------------ correction
  function result() {
    const r = C.scoreMidterm(M, S), R = M.rules;
    const pend = [...r.fill.items.filter(i => i.counted && i.ok === 'pending')];
    const wrongM = r.mcq.items.filter(i => i.ok === false), wrongF = r.fill.items.filter(i => i.ok === false);
    const skipped = r.mcq.items.filter(i => i.ok === null).length + r.fill.items.filter(i => i.ok === null).length;
    const pct = r.pct, g = pct >= 85 ? ['🏆', 'רמת מבחן — מצוין!'] : pct >= 70 ? ['⭐', 'טוב מאוד'] : pct >= 55 ? ['📖', 'עובר — כדאי לחזור על הטעויות'] : ['💪', 'בשביל זה מתאמנים'];
    const qOf = (k, n) => (k === 'mcq' ? M.mcq : M.fill).find(q => q.n === n);
    const row = (k, i) => { const q = qOf(k, i.n); return `<div><span>${i.counted ? '❌' : '⏸️'}</span><span><b>${k === 'mcq' ? 'א' : 'ב'}${i.n}. ${esc(q.q)}</b><br>${k === 'mcq' ? `התשובה שלך: ${esc(q.options[i.given])}<br>✅ ${LETTERS[q.correct]}. ${esc(q.options[q.correct])}` : `התשובה שלך: ${esc(i.given)}<br>✅ ${esc(q.answers[0])}`}<br><small>${esc(q.explanation)}</small> ${flagNote(q)}</span></div>`; };
    $('app').innerHTML = `
      <section class="card res"><div class="big">${g[0]}</div><h2>${g[1]}</h2>
        <div class="score"><bdi dir="ltr">${fmtPts(r.got)} / ${r.max}</bdi></div><p>${pct}% · אמריקאיות <bdi dir="ltr">${fmtPts(r.mcq.got)}/${r.mcq.max}</bdi> · השלמה <bdi dir="ltr">${fmtPts(r.fill.got)}/${r.fill.max}</bdi></p>
        ${r.pending ? `<p class="over">🤔 עוד ${r.pending} תשובות לבדיקה עצמית — הציון יעלה אם צדקתם.</p>` : ''}
        ${r.mcq.ignored.length || r.fill.ignored.length ? `<p class="over">⏸️ לא נספרו (מעל ${R.answer}): ${r.mcq.ignored.map(n => 'א' + n).concat(r.fill.ignored.map(n => 'ב' + n)).join(', ')}</p>` : ''}
        ${skipped ? `<p>דילגת על ${skipped} שאלות.</p>` : ''}</section>
      ${pend.length ? `<section class="card"><h2>🤔 בדיקה עצמית</h2><p class="lead">ניסחתם אחרת מהתשובה לדוגמה. היו כנים 🙂</p><div class="rev">${pend.map(i => { const q = qOf('fill', i.n); return `<div><span>${i.n}</span><span><b>${esc(q.q)}</b><br>שלך: <b>${esc(i.given)}</b> · לדוגמה: <b>${esc(q.answers[0])}</b><div class="selfck"><button class="btn mint" data-self="${i.n}:1">✔ צדקתי</button><button class="btn" data-self="${i.n}:0">✖ טעיתי</button></div></span></div>`; }).join('')}</div></section>` : ''}
      ${byTopic(r)}
      ${wrongM.length || wrongF.length ? `<section class="card"><h2>🔁 לחזור על (${wrongM.length + wrongF.length})</h2><div class="rev">${wrongM.map(i => row('mcq', i)).join('')}${wrongF.map(i => row('fill', i)).join('')}</div></section>` : '<section class="card"><h2>🎯 בלי טעויות!</h2></section>'}
      <section class="card"><h2>🗝️ התשובות לשאלות שלא ענית</h2><details><summary>להציג (${skipped})</summary><div class="rev">${r.mcq.items.filter(i => i.ok === null).map(i => { const q = qOf('mcq', i.n); return `<div><span>א${i.n}</span><span><b>${esc(q.q)}</b><br>✅ ${esc(q.options[q.correct])}</span></div>`; }).join('')}${r.fill.items.filter(i => i.ok === null).map(i => { const q = qOf('fill', i.n); return `<div><span>ב${i.n}</span><span><b>${esc(q.q)}</b><br>✅ ${esc(q.answers[0])}</span></div>`; }).join('')}</div></details></section>
      <div class="go"><a class="btn" href="#/mt" style="display:flex;align-items:center;justify-content:center;text-decoration:none">📝 מבחן מחצית</a>${wrongM.length || wrongF.length ? '<button class="btn mint" id="redo">🔁 תרגול הטעויות</button>' : ''}</div>`;
    document.querySelectorAll('[data-self]').forEach(b => b.onclick = () => { const [n, v] = b.dataset.self.split(':'); S.self[n] = v === '1'; save(); const rr = C.scoreMidterm(M, S); if (!rr.pending && !S.only) { const best = store.get(BEST, null); if (!best || rr.got > best.got) store.set(BEST, { got: rr.got, max: rr.max, at: new Date().toISOString().slice(0, 10) }); } result(); });
    const rd = $('redo'); if (rd) rd.onclick = () => {
      S = { mode: 'practice', mcq: {}, fill: {}, self: {}, startedAt: Date.now(), submittedAt: null, only: { mcq: wrongM.map(i => i.n), fill: wrongF.map(i => i.n) } }; save();
      location.hash = wrongM.length ? '#/mt/a' : '#/mt/b';
    };
    fixBar();
  }
  // points perdus par thème → lien vers le thème dans la banque « לפי נושאים »
  function byTopic(r) {
    const lost = {};
    [['mcq', r.mcq], ['fill', r.fill]].forEach(([k, p]) => p.items.forEach(i => { if (i.counted && i.ok === false) { const q = (k === 'mcq' ? M.mcq : M.fill).find(x => x.n === i.n); lost[q.topic] = (lost[q.topic] || 0) + 1; } }));
    const top = Object.entries(lost).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!top.length) return '';
    return `<section class="card"><h2>🎯 איפה הלכו הנקודות</h2><div class="rev">${top.map(([t, n]) => `<div><span>${n}×</span><span><b>${esc(topicName(t) || t)}</b> · <a href="#/" data-topic-go="${esc(t)}">לתרגל את הנושא ▶️</a></span></div>`).join('')}</div></section>`;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-topic-go]'); if (!a) return;
    try { const k = 'mdl_parta_v1', p = JSON.parse(localStorage.getItem(k) || '{}'); p.topic = a.dataset.topicGo; localStorage.setItem(k, JSON.stringify(p)); } catch (err) {}
    e.preventDefault(); location.hash = '#/'; location.reload();
  });

  window.MDPartAMidterm = { show, state: () => S, data: () => M };
})();
