// דפי חזרה — fiches de révision des סיורים (données : fiches/index.json + fiches/<id>.json, construites par tools/build-fiches.mjs)
(() => {
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'mdl_fiches_done';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
  const memoKey = 'mdl_fiches_memo';
  const getMemo = () => { try { return localStorage.getItem(memoKey) === '1'; } catch { return false; } };
  const setMemo = v => { try { localStorage.setItem(memoKey, v ? '1' : '0'); } catch {} };
  const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : ''; };
  const json = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw Error(u); return r.json(); });
  let index = null;

  const srcLinks = list => (list || []).slice(0, 2).map(u => `<a class="src" href="${esc(u)}" target="_blank" rel="noopener" title="מקור">📄</a>`).join('');
  const pts = (items, hide) => `<ul class="pts">${items.map(p => `<li><span class="${hide ? 'hide' : ''}">${esc(p.t)}</span>${srcLinks(p.src)}</li>`).join('')}</ul>`;

  function list() {
    document.title = 'דפי חזרה | מורה דרך';
    const done = load();
    const tile = f => {
      const n = (done[f.id] || []).length, p = f.stops ? Math.round(100 * n / f.stops) : 0;
      return `<a class="tile" href="#/${esc(f.id)}" data-q="${esc(f.title + ' ' + (f.route || []).join(' '))}">
        <div class="ring" style="--p:${p}"><span>${n}/${f.stops}</span></div>
        <div><b>${esc(f.title)}</b><small>${esc((f.route || []).slice(0, 4).join(' · '))}${(f.route || []).length > 4 ? ' …' : ''}</small></div></a>`;
    };
    const trips = index.fiches.filter(f => f.kind === 'trip');
    const tours = index.fiches.filter(f => f.kind !== 'trip');
    app.innerHTML = `<a class="back" href="index.html">→ מורה דרך</a>
      <h1>📘 דפי חזרה</h1>
      <p class="muted">כל סיור בדף אחד: הסיפור בקצרה, התחנות לפי הסדר, מה חובה לדעת, תאריכים ומושגים. כל משפט מגיע משאלה מאומתת במשחק, עם קישור למקור.</p>
      <input class="search" type="search" placeholder="🔎 חיפוש סיור או מקום…" aria-label="חיפוש">
      ${trips.length ? `<div class="group">🚶 הסיורים בירושלים (יציאות הכיתה)</div>${trips.map(tile).join('')}` : ''}
      <div class="group">🗺️ הסיורים של הקורס</div>${tours.map(tile).join('')}`;
    app.querySelector('.search').addEventListener('input', e => {
      const v = e.target.value.trim();
      app.querySelectorAll('.tile').forEach(t => { t.hidden = v && !t.dataset.q.includes(v); });
    });
  }

  async function fiche(id) {
    const meta = index.fiches.find(f => f.id === id);
    if (!meta) { location.hash = ''; return; }
    app.innerHTML = '<p class="muted">טוען…</p>';
    const f = await json(`fiches/${encodeURIComponent(id)}.json?v=${index.v}`);
    document.title = `${f.title} | דפי חזרה`;
    const memo = getMemo();
    const done = load(); const mine = new Set(done[id] || []);
    const quiz = f.kind === 'trip' ? `return-bus.html?date=${encodeURIComponent(f.date)}` : `guided-tour.html?tour=${encodeURIComponent(f.id)}&mode=quiz`;
    app.innerHTML = `<a class="back" href="#/">→ כל דפי החזרה</a>
      <div class="hero"><div class="date">${f.kind === 'trip' ? '🚶 יציאת הכיתה' : '🗺️ סיור'}${f.date ? ' · ' + fmtDate(f.date) : ''} · ${f.stops.length} תחנות</div>
        <h1>${esc(f.title)}</h1><p class="big">${esc(f.oneLiner)}</p>
        <ol class="route">${f.stops.map((s, i) => `<li><a href="#/${esc(id)}/${i}" data-i="${i}" class="${mine.has(i) ? 'done' : ''}"><i>${i + 1}</i>${esc(s.name)}</a></li>`).join('')}</ol></div>
      <div class="toolbar"><div class="seg" role="group" aria-label="מצב">
        <button data-m="0" aria-pressed="${!memo}">📖 קריאה</button><button data-m="1" aria-pressed="${memo}">🧠 שינון</button></div>
        <button class="icon" id="print" title="הדפסה">🖨️</button></div>
      <div class="bar" aria-hidden="true"><div style="width:${Math.round(100 * mine.size / f.stops.length)}%"></div></div>
      <p class="note" id="prog">${mine.size} מתוך ${f.stops.length} תחנות סומנו „אני יודע/ת”</p>
      <div id="body" class="${memo ? 'memo' : ''}">
      <section class="box must"><h2>⭐ חובה לדעת</h2><p class="hint">נסו להיזכר, ואז הקישו על השורה כדי לבדוק.</p>${pts(f.mustKnow, true)}</section>
      ${f.stops.map((s, i) => `<section class="box stop ${mine.has(i) ? 'ok' : ''}" id="s${i}"><header><span class="num">${i + 1}</span><div>
        <h2>${esc(s.name)}</h2>${s.oneLine ? `<p class="one">${esc(s.oneLine)}</p>` : ''}</div></header>
        <p class="hint">מה אתם זוכרים על המקום הזה? הקישו כדי לגלות.</p>${pts(s.points, true)}
        <button class="knew" data-i="${i}" aria-pressed="${mine.has(i)}">${mine.has(i) ? '✅ אני יודע/ת' : '☐ אני יודע/ת את התחנה הזאת'}</button></section>`).join('')}
      ${f.dates.length ? `<section class="box"><h2>📅 ציר זמן</h2><ol class="tl">${f.dates.map(d => `<li><b>${esc(d.when)}</b><span class="hide">${esc(d.what)}</span>${srcLinks(d.src)}</li>`).join('')}</ol></section>` : ''}
      ${f.terms.length ? `<section class="box"><h2>🔤 מושגים</h2><dl class="terms">${f.terms.map(d => `<div><dt>${esc(d.term)}</dt><dd><span class="hide">${esc(d.def)}</span>${srcLinks(d.src)}</dd></div>`).join('')}</dl></section>` : ''}
      ${f.trick ? `<section class="box trick"><h2>💡 טריק לזכירה</h2><p>${esc(f.trick)}</p></section>` : ''}
      </div>
      <div class="actions"><a class="cta" href="${quiz}">🎯 לבחון את עצמי על הסיור</a><a class="cta alt" href="#/">📘 לכל דפי החזרה</a></div>
      <p class="note">כל משפט כאן נכתב מתוך שאלות המשחק (חומרי הקורס${f.kind === 'trip' ? ' והקלטות הסיור' : ''}). 📄 = המקור. ${f.kind === 'trip' ? 'חלק מהחומר מתמלול אוטומטי של ההקלטה ולא נבדק ע״י אדם.' : ''}</p>`;

    const body = app.querySelector('#body');
    app.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.m === '1'; setMemo(m); body.classList.toggle('memo', m);
      body.querySelectorAll('.hide.shown').forEach(x => x.classList.remove('shown'));
      app.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    body.addEventListener('click', e => { const h = e.target.closest('.hide'); if (h && body.classList.contains('memo')) h.classList.add('shown'); });
    app.querySelector('#print').addEventListener('click', () => window.print());
    app.querySelectorAll('.knew').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i, d = load(), s = new Set(d[id] || []);
      s.has(i) ? s.delete(i) : s.add(i); d[id] = [...s].sort((a, c) => a - c); save(d);
      const on = s.has(i);
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✅ אני יודע/ת' : '☐ אני יודע/ת את התחנה הזאת';
      app.querySelector(`#s${i}`).classList.toggle('ok', on);
      app.querySelector(`.route a[data-i="${i}"]`).classList.toggle('done', on);
      app.querySelector('.bar div').style.width = Math.round(100 * s.size / f.stops.length) + '%';
      app.querySelector('#prog').textContent = `${s.size} מתוך ${f.stops.length} תחנות סומנו „אני יודע/ת”`;
    }));
    const m = /^#\/[^/]+\/(\d+)$/.exec(location.hash);
    if (m) app.querySelector('#s' + m[1])?.scrollIntoView(); else window.scrollTo(0, 0);
  }

  function route() {
    const m = /^#\/([^/]+)/.exec(location.hash);
    (m ? fiche(decodeURIComponent(m[1])) : Promise.resolve(list())).catch(() => { app.innerHTML = '<p>לא הצלחנו לטעון את הדף. נסו שוב.</p><a href="#/">חזרה</a>'; });
  }
  json('fiches/index.json').then(d => { index = d; route(); window.addEventListener('hashchange', () => {
    const m = /^#\/([^/]+)\/(\d+)$/.exec(location.hash);
    if (m && app.querySelector('#s' + m[2])) { app.querySelector('#s' + m[2]).scrollIntoView({ behavior: 'smooth' }); return; }
    route();
  }); }).catch(() => { app.innerHTML = '<p>דפי החזרה עוד לא זמינים.</p>'; });
})();
