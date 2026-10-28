// Moreh Derech NEXT — Jérusalem 3D, outils « musée » :
//  🚶 visite au niveau des rues (hauteur des yeux, marches et dallages suivis, pas de traversée des murs) ;
//  ⇄ comparaison de deux époques sans bouger la caméra ;
//  🎓 mode apprentissage « איפה זה? » : retrouver les monuments dans la scène, étiquettes masquées.
// Rien n'est inventé ici : ces outils ne font que parcourir les monuments et les sources déjà dans monuments.json.
import * as THREE from 'three';

const T = {
  he: { walk: 'סיור בגובה הרחוב', walkOut: 'חזרה למבט מלמעלה', walkHint: 'גררו כדי להסתכל · חצים כדי ללכת', fwd: 'קדימה', back: 'אחורה', left: 'שמאלה', right: 'ימינה', fast: 'מהר',
    cmp2: 'השוואה בין שתי תקופות', cmpPick: 'עם איזו תקופה להשוות?', cmpSwap: 'החלפה', close: 'סגירה',
    learn: 'מצב לימוד — איפה זה?', learnAsk: 'געו במקום:', good: '✔ נכון!', bad: '✘ זה', badEnd: '— הנה המקום הנכון', score: 'ניקוד', next: 'הבא', end: 'סיום', done: 'סיימתם!', none: 'אין מספיק אתרים בתקופה הזו', skip: 'דלג' },
  fr: { walk: 'Visite au niveau des rues', walkOut: 'Revenir à la vue aérienne', walkHint: 'Glisser pour regarder · flèches pour marcher', fwd: 'Avancer', back: 'Reculer', left: 'Gauche', right: 'Droite', fast: 'Vite',
    cmp2: 'Comparer deux époques', cmpPick: 'Comparer avec quelle époque ?', cmpSwap: 'Basculer', close: 'Fermer',
    learn: 'Mode apprentissage — Où est-ce ?', learnAsk: 'Touchez :', good: '✔ Exact !', bad: '✘ Ceci est', badEnd: '— voici le bon endroit', score: 'Score', next: 'Suivant', end: 'Terminer', done: 'Terminé !', none: 'Pas assez de sites à cette époque', skip: 'Passer' },
  en: { walk: 'Street-level visit', walkOut: 'Back to aerial view', walkHint: 'Drag to look · arrows to walk', fwd: 'Forward', back: 'Back', left: 'Left', right: 'Right', fast: 'Fast',
    cmp2: 'Compare two periods', cmpPick: 'Compare with which period?', cmpSwap: 'Switch', close: 'Close',
    learn: 'Learning mode — Where is it?', learnAsk: 'Tap:', good: '✔ Correct!', bad: '✘ That is', badEnd: '— here is the right place', score: 'Score', next: 'Next', end: 'Finish', done: 'Done!', none: 'Not enough sites in this period', skip: 'Skip' },
  ru: { walk: 'Прогулка по улицам', walkOut: 'Вернуться к виду сверху', walkHint: 'Тяните, чтобы смотреть · стрелки — идти', fwd: 'Вперёд', back: 'Назад', left: 'Влево', right: 'Вправо', fast: 'Быстро',
    cmp2: 'Сравнить две эпохи', cmpPick: 'С какой эпохой сравнить?', cmpSwap: 'Переключить', close: 'Закрыть',
    learn: 'Режим обучения — где это?', learnAsk: 'Коснитесь:', good: '✔ Верно!', bad: '✘ Это', badEnd: '— вот правильное место', score: 'Счёт', next: 'Дальше', end: 'Завершить', done: 'Готово!', none: 'В эту эпоху мало объектов', skip: 'Пропустить' },
};
const CSS = `
#mtWalkPad{position:fixed;z-index:30;inset-inline-end:12px;bottom:calc(200px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,52px);gap:6px;direction:ltr}
#mtWalkPad button{border-radius:14px;border:1px solid #ffffff55;background:#0b1230cc;color:#fff;font-size:22px;font-weight:900;touch-action:none;user-select:none;-webkit-user-select:none}
#mtWalkPad button[aria-pressed=true]{background:#f6c445;color:#1c1f45}
#mtWalkPad .up{grid-column:2}#mtWalkPad .lt{grid-column:1;grid-row:2}#mtWalkPad .dn{grid-column:2;grid-row:2}#mtWalkPad .rt{grid-column:3;grid-row:2}#mtWalkPad .fa{grid-column:3;grid-row:1;font-size:13px}
.mtBar{position:fixed;z-index:31;top:calc(78px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);max-width:min(560px,calc(100vw - 24px));display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;padding:9px 12px;border-radius:16px;background:#0b1230e6;border:1px solid #ffffff40;color:#fff;font-weight:800;font-size:14px;box-shadow:0 6px 20px #0008}
.mtBar button{border-radius:12px;border:1px solid #ffffff55;background:#26355f;color:#fff;font-weight:900;padding:8px 12px;font-size:14px}
.mtBar button.on{background:var(--c,#f6c445);color:var(--ink,#1c1f45);border-color:#fff}
.mtBar .q{font-size:16px}.mtBar .q b{color:#ffe08a}
.mtPick{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;width:100%;max-height:45vh;overflow:auto}
.mtPick button{text-align:start;background:#16224a}
body.mtLearn #labels{display:none}
body.mtWalk .tools,body.mtWalk .legend{opacity:.35}
`;

export function install(api) {
  const L = () => T[api.lang] || T.he, $ = id => document.getElementById(id);
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  const menu = $('toolsMenu');
  const mk = (id, ico, key) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.setAttribute('aria-pressed', 'false'); b.innerHTML = `<span class="ti">${ico}</span><span class="tl"></span>`; b.dataset.k = key; menu.appendChild(b); return b; };
  const bWalk = mk('bWalk', '🚶', 'walk'), bCmp = mk('bCmp2', '⇄', 'cmp2'), bLearn = mk('bLearn', '🎓', 'learn');
  const relabel = () => [bWalk, bCmp, bLearn].forEach(b => { b.querySelector('.tl').textContent = L()[b.dataset.k]; b.title = L()[b.dataset.k]; });
  relabel(); document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setTimeout(relabel, 30)));
  const bar = (html) => { let d = $('mtBar'); if (!d) { d = document.createElement('div'); d.id = 'mtBar'; d.className = 'mtBar'; d.setAttribute('role', 'status'); document.body.appendChild(d); } d.innerHTML = html; return d; };
  const noBar = () => { const d = $('mtBar'); if (d) d.remove(); };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------ 🚶 visite au niveau des rues
  const EYE = 1.65, STEP = 0.9, BODY = 0.45;            // hauteur des yeux, marche franchissable, distance aux murs (m)
  const W = { on: false, yaw: 0, pitch: 0, keys: new Set(), fast: false, t: 0, floorAt: 0 };
  const down = new THREE.Raycaster(), ahead = new THREE.Raycaster();
  // sol réel : premier objet sous les pieds (dallage, marche, esplanade), sinon le relief
  function floorY(x, z, from) {
    down.set(new THREE.Vector3(x, from + STEP + 0.2, z), new THREE.Vector3(0, -1, 0)); down.far = 400;
    const h = down.intersectObjects(api.pickTargets(), true).find(i => i.object.isMesh && i.object.visible && !(i.object.material && i.object.material.transparent && i.object.material.opacity < 0.5));
    const g = api.ground(x, z);
    return h ? Math.max(h.point.y, g) : g;
  }
  function blocked(pos, dir, feet) {
    ahead.set(new THREE.Vector3(pos.x, feet + STEP + 0.3, pos.z), dir); ahead.far = BODY + 0.4;
    return ahead.intersectObjects(api.pickTargets(), true).some(i => i.object.isMesh && i.object.visible);
  }
  function startPoint() {
    const p5 = api.period === 5, pool = p5 && api.monument('jerusalem_siloam_pool'), tm = api.tm;
    const a = (pool && api.anchorXZ(pool.anchor)) || api.anchorXZ('jaffa_gate') || [0, 0];
    const target = tm ? [tm.cx, tm.cz] : [a[0], a[1] - 100];
    return { x: a[0], z: a[1], yaw: Math.atan2(-(target[0] - a[0]), -(target[1] - a[1])) };
  }
  function aim() {
    const c = api.camera; c.rotation.order = 'YXZ'; c.rotation.set(W.pitch, W.yaw, 0);
    const d = new THREE.Vector3(0, 0, -1).applyEuler(c.rotation); api.controls.target.copy(c.position).addScaledVector(d, 40);
  }
  function walkOn() {
    if (learnOn()) learnOff(); const sp = startPoint(), c = api.camera;
    W.on = true; W.yaw = sp.yaw; W.pitch = 0; api.setWalking(true); document.body.classList.add('mtWalk');
    W.floorAt = floorY(sp.x, sp.z, api.ground(sp.x, sp.z) + 60); c.position.set(sp.x, W.floorAt + EYE, sp.z); c.near = 0.3; c.updateProjectionMatrix(); aim();
    const pad = document.createElement('div'); pad.id = 'mtWalkPad';
    pad.innerHTML = `<button class="up" data-k="f" aria-label="${L().fwd}">▲</button><button class="fa" data-k="fast" aria-pressed="false" aria-label="${L().fast}">×4</button><button class="lt" data-k="l" aria-label="${L().left}">⟲</button><button class="dn" data-k="b" aria-label="${L().back}">▼</button><button class="rt" data-k="r" aria-label="${L().right}">⟳</button>`;
    document.body.appendChild(pad);
    pad.addEventListener('pointerdown', e => { const b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); if (b.dataset.k === 'fast') { W.fast = !W.fast; b.setAttribute('aria-pressed', String(W.fast)); return; } W.keys.add(b.dataset.k); b.setPointerCapture(e.pointerId); });
    const up = e => { const b = e.target.closest('[data-k]'); if (b) W.keys.delete(b.dataset.k); }; pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    bar(`<span>🚶 ${esc(L().walkHint)}</span><button type="button" id="mtWalkOut">${esc(L().walkOut)}</button>`); $('mtWalkOut').onclick = walkOff;
    bWalk.setAttribute('aria-pressed', 'true'); W.t = performance.now(); requestAnimationFrame(walkTick);
  }
  function walkOff() {
    if (!W.on) return; W.on = false; W.keys.clear(); const c = api.camera; c.near = 2; c.updateProjectionMatrix();
    const p = c.position.clone(); api.controls.target.set(p.x, api.ground(p.x, p.z), p.z); c.position.set(p.x - 160, p.y + 260, p.z + 220);
    api.setWalking(false); document.body.classList.remove('mtWalk'); const pad = $('mtWalkPad'); if (pad) pad.remove(); noBar(); bWalk.setAttribute('aria-pressed', 'false');
  }
  function walkTick(now) {
    if (!W.on) return; requestAnimationFrame(walkTick);
    const dt = Math.min(0.25, (now - W.t) / 1000); W.t = now; const k = W.keys;
    const turn = (k.has('l') || k.has('ArrowLeft') ? 1 : 0) - (k.has('r') || k.has('ArrowRight') ? 1 : 0); W.yaw += turn * 1.6 * dt;
    const mv = (k.has('f') || k.has('ArrowUp') || k.has('w') ? 1 : 0) - (k.has('b') || k.has('ArrowDown') || k.has('s') ? 1 : 0);
    const c = api.camera;
    if (mv) {
      const dir = new THREE.Vector3(-Math.sin(W.yaw), 0, -Math.cos(W.yaw)).multiplyScalar(Math.sign(mv)), sp = 1.6 * (W.fast || k.has('Shift') ? 4 : 1); // pas de marche (m/s)
      W.blocked = blocked(c.position, dir, W.floorAt);
      if (!W.blocked) {
        const nx = c.position.x + dir.x * sp * dt, nz = c.position.z + dir.z * sp * dt, f = floorY(nx, nz, W.floorAt);
        if (f - W.floorAt <= STEP) { c.position.x = nx; c.position.z = nz; W.floorAt = f; } else W.blocked = 'step';   // une marche se monte, un mur non
      }
    }
    c.position.y += (W.floorAt + EYE - c.position.y) * Math.min(1, dt * 10); aim();
  }
  // regard à la souris / au doigt
  let drag = null;
  addEventListener('pointerdown', e => { if (W.on && e.target.tagName === 'CANVAS') drag = [e.clientX, e.clientY]; });
  addEventListener('pointermove', e => { if (!W.on || !drag) return; W.yaw += (e.clientX - drag[0]) * 0.004; W.pitch = THREE.MathUtils.clamp(W.pitch + (e.clientY - drag[1]) * 0.003, -1.2, 1.2); drag = [e.clientX, e.clientY]; aim(); });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('keydown', e => { if (!W.on || /INPUT|TEXTAREA/.test(e.target.tagName)) return; W.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key); if (e.key.startsWith('Arrow')) e.preventDefault(); if (e.key === 'Escape') walkOff(); });
  addEventListener('keyup', e => { W.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  bWalk.onclick = () => (W.on ? walkOff() : walkOn());

  // ------------------------------------------------------------ ⇄ deux époques, même point de vue
  const C = { a: null, b: null };
  const periodName = n => { const p = api.periods.find(x => x.n === n); return p ? api.tx(p.name) : '' };
  const chip = n => { const b = document.querySelector(`#strip [data-p="${n}"]`); return b ? `--c:${b.style.getPropertyValue('--c')};--ink:${b.style.getPropertyValue('--ink')}` : ''; };
  function cmpBar() {
    const cur = api.period;
    bar(`<span>⇄</span><button type="button" class="${cur === C.a ? 'on' : ''}" style="${chip(C.a)}" data-go="${C.a}">${esc(periodName(C.a))}</button><button type="button" id="mtSwap">${esc(L().cmpSwap)}</button><button type="button" class="${cur === C.b ? 'on' : ''}" style="${chip(C.b)}" data-go="${C.b}">${esc(periodName(C.b))}</button><button type="button" id="mtCmpX" aria-label="${esc(L().close)}">✕</button>`);
    $('mtBar').onclick = e => { const g = e.target.closest('[data-go]'); if (g) { api.goPeriod(Number(g.dataset.go), true); cmpBar(); } };
    $('mtSwap').onclick = () => { api.goPeriod(api.period === C.a ? C.b : C.a, true); cmpBar(); };
    $('mtCmpX').onclick = cmpOff;
  }
  function cmpOn() {
    if (learnOn()) learnOff(); C.a = api.period; bCmp.setAttribute('aria-pressed', 'true');
    bar(`<span>${esc(L().cmpPick)}</span><div class="mtPick">${api.periods.filter(p => p.n !== C.a).map(p => `<button type="button" data-b="${p.n}" style="border-inline-start:6px solid ${chip(p.n).match(/--c:([^;]*)/)?.[1] || '#fff'}">${esc(api.tx(p.name))}</button>`).join('')}</div><button type="button" id="mtCmpX">✕</button>`);
    $('mtBar').onclick = e => { const b = e.target.closest('[data-b]'); if (b) { C.b = Number(b.dataset.b); api.goPeriod(C.b, true); cmpBar(); } };
    $('mtCmpX').onclick = cmpOff;
  }
  function cmpOff() { C.a = C.b = null; noBar(); bCmp.setAttribute('aria-pressed', 'false'); }
  bCmp.onclick = () => (C.a ? cmpOff() : cmpOn());

  // ------------------------------------------------------------ 🎓 « איפה זה? » — retrouver les monuments
  const G = { on: false, list: [], i: 0, score: 0, total: 5, waiting: false };
  // un seul écouteur : pendant le jeu, toucher un monument répond à la question (la fiche ne s'ouvre pas)
  document.addEventListener('mdj3d-pick', e => { if (G.on && G.waiting) answer(e.detail); });
  const learnOn = () => G.on;
  function candidates() {
    return api.placedIds().map(api.monument).filter(m => m && api.inPeriod(m) && m.from <= api.period && !m.wall && !['valley', 'marker'].includes(m.shape && m.shape.type))
      .filter(m => { const b = api._bounds(m.id); return b && b[0].every(Number.isFinite); });
  }
  function ask() {
    if (G.i >= G.list.length) return finish();
    const m = G.list[G.i];
    bar(`<span class="q">${esc(L().learnAsk)} <b>${esc(api.tx(m.name))}</b></span><span>${esc(L().score)}: ${G.score}/${G.list.length}</span><button type="button" id="mtSkip">${esc(L().skip)}</button><button type="button" id="mtLearnX" aria-label="${esc(L().close)}">✕</button>`);
    $('mtLearnX').onclick = learnOff; $('mtSkip').onclick = () => { G.waiting = false; api.flyTo(m.id); G.i++; setTimeout(() => G.on && ask(), 1200); };
    G.waiting = true;
  }
  function answer(id) {
    const m = G.list[G.i]; G.waiting = false;
    const ok = id === m.id; if (ok) G.score++;
    const got = id && api.monument(id);
    bar(`<span class="q">${ok ? esc(L().good) : `${esc(L().bad)} ${esc(got ? api.tx(got.name) : '?')} ${esc(L().badEnd)}`}</span><button type="button" id="mtNext">${esc(G.i + 1 < G.list.length ? L().next : L().end)}</button>`);
    api.flyTo(m.id); G.i++; $('mtNext').onclick = ask;
  }
  function finish() {
    bar(`<span class="q">🎓 ${esc(L().done)} ${esc(L().score)}: <b>${G.score}/${G.list.length}</b></span><button type="button" id="mtLearnX">${esc(L().close)}</button>`); $('mtLearnX').onclick = learnOff;
  }
  function learnStart() {
    if (W.on) walkOff(); if (C.a) cmpOff();
    const all = candidates(); if (all.length < 3) { bar(`<span>${esc(L().none)}</span><button type="button" id="mtLearnX">✕</button>`); $('mtLearnX').onclick = learnOff; return; }
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    Object.assign(G, { on: true, list: all.slice(0, G.total), i: 0, score: 0 }); api.setPickMode(true); document.body.classList.add('mtLearn'); bLearn.setAttribute('aria-pressed', 'true');
    api.homeView(true); ask();
  }
  function learnOff() { G.on = false; G.waiting = false; api.setPickMode(false); document.body.classList.remove('mtLearn'); bLearn.setAttribute('aria-pressed', 'false'); noBar(); api.highlight(null); }
  bLearn.onclick = () => (G.on ? learnOff() : learnStart());

  return { walkOn, walkOff, cmpOn, learnStart, learnOff, get state() { return { walking: W.on, blocked: W.blocked, x: api.camera.position.x, z: api.camera.position.z, compare: [C.a, C.b], learn: G.on && { i: G.i, score: G.score, n: G.list.length, target: G.list[G.i] && G.list[G.i].id } }; } };
}
