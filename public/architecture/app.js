// Moreh Derech NEXT — « אדריכלות קלאסית » : interface (3D, jeu de zihouï, questions ouvertes).
// Logique pure : arch-core.js (window.MDArch). Maquettes : scenes.js. Données : data.json.
// Routes : #/explore[/<maquette>[/<n° élément>]] · #/play[/<maquette>] · #/open · #/bank
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene } from './scenes.js';
import { loadPalette, applyOriginal, wanted, mountToggle } from '../polychromy.js';

const A = window.MDArch, P = window.MDProgress;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const PREF = 'mdl_arch_pref_v1';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

let D = null;
const S = { view: null, scene: null, sel: -1, pinMode: 'explore', run: null, open: null, pref: ls.get(PREF, {}) };

// ======================= 3D =======================
let renderer = null, scene3, camera, controls, current = null, goal = new THREE.Vector3(), moving = false;
const v3 = new THREE.Vector3(), clock = new THREE.Clock();
let pinClick = null, pinVisible = () => true;
function init3d() {
  const stage = $('stage');
  try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false }); }
  catch (e) { stage.insertAdjacentHTML('beforeend', '<div class="nogl">התלת-ממד לא נתמך בדפדפן הזה.<br>אפשר עדיין לעבור על רשימת החלקים ולשחק "המונח הלטיני".</div>'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor('#26305f');
  stage.prepend(renderer.domElement);
  scene3 = new THREE.Scene();
  scene3.fog = new THREE.Fog('#26305f', 90, 220);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 4; controls.maxDistance = 95;
  scene3.add(new THREE.HemisphereLight('#fff6e8', '#6b5d48', 1.6));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.4); sun.position.set(18, 30, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 100 }); sun.shadow.bias = -0.0005;
  scene3.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: '#b9ab89', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true; scene3.add(ground);
  new ResizeObserver(resize).observe(stage); resize();
  renderer.setAnimationLoop(loop);
}
function resize() { if (!renderer) return; const st = $('stage'), w = st.clientWidth, h = st.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); const first = !camera.aspect || Math.sign(camera.aspect - 1) !== Math.sign(w / h - 1); camera.aspect = w / h; camera.updateProjectionMatrix(); if (first && S.scene && current) camReset(); }
function loop() {
  if (!current) return;
  if (moving) { const d = v3.copy(goal).sub(controls.target).multiplyScalar(0.08); controls.target.add(d); camera.position.add(d); if (d.length() < 0.002) moving = false; }
  controls.update(); if (current.update && !reduce) current.update(clock.getElapsedTime());
  renderer.render(scene3, camera);
  const st = $('stage'), w = st.clientWidth, h = st.clientHeight, pins = $('pins').children;
  S.scene.parts.forEach((p, k) => { const el = pins[k]; if (!el) return; if (!pinVisible(k)) { el.hidden = true; return; }
    v3.set(p.p[0], p.p[1], p.p[2]).project(camera); if (v3.z > 1) { el.hidden = true; return; }
    el.hidden = false; el.style.transform = `translate(${(v3.x * .5 + .5) * w - 15}px,${(-v3.y * .5 + .5) * h - 15}px)`; });
}
function loadScene(id) {
  const s = A.scene(D, id); if (!s) return;
  if (S.scene && S.scene.id === id && current) { camReset(); return; }
  S.scene = s; S.sel = -1;
  if (renderer) {
    if (current) { scene3.remove(current.group); current.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    current = buildScene(id); scene3.add(current.group); camReset(); clock.start(); applyPoly();
  }
  $('pins').innerHTML = s.parts.map((p, k) => `<button type="button" class="pin" data-k="${k}" aria-label="${k + 1}"><b>${k + 1}</b><span>${esc(p.he)}</span></button>`).join('');
  $('pins').querySelectorAll('.pin').forEach(b => b.onclick = () => pinClick && pinClick(+b.dataset.k));
  $('hudNote').textContent = s.note || '';
}
function camReset() { if (!renderer) return; const k = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 1.1 : 1;
  camera.position.set(...S.scene.cam.map((c, i) => S.scene.tgt[i] + (c - S.scene.tgt[i]) * k)); controls.target.set(...S.scene.tgt); goal.set(...S.scene.tgt); moving = false; controls.update(); }
function focusPart(k) { if (!renderer || k < 0) return; goal.set(...S.scene.parts[k].p); moving = true; }
function highlight(k, color) {
  if (!current) return;
  Object.values(current.tags).forEach(ms => ms.forEach(m => { if (m.material && m.material.emissive) m.material.emissive.set(0x000000); }));
  if (k < 0) return;
  (current.tags[S.scene.parts[k].t] || []).forEach(m => { if (m.material && m.material.emissive) { m.material.emissive.set(color || '#e0607e'); m.material.emissiveIntensity = 0.55; } });
}
function pinClass(k, cls) { const el = $('pins').children[k]; if (el) el.className = 'pin ' + (cls || ''); }
function mountStage(slot) { $(slot).appendChild($('stage')); resize(); }
// ---- צבעים מקוריים (polychromy.json) ----
let polyUsed = [], POLY = null;
function applyPoly() {
  if (!current || !POLY) return;
  const rev = new Map(); Object.entries(current.tags).forEach(([t, ms]) => ms.forEach(m => rev.set(m, t)));
  const sid = S.scene.id;
  polyUsed = applyOriginal(current.group, 'architecture', m => { const t = rev.get(m), r = m.userData.role; return t ? [r && sid + ':' + t + ':' + r, sid + ':' + t, sid + ':*'] : [sid + ':*']; }, POLY.on, { clone: true });
  if (S.sel >= 0) highlight(S.sel); POLY.refresh();
}
POLY = mountToggle(document.querySelector('#stage .hudR') || document.body, { className: 'poly-btn', used: () => polyUsed, onChange: () => loadPalette().then(applyPoly) });
if (wanted()) loadPalette().then(() => POLY.set(true));
$('recenter').onclick = () => { camReset(); if (S.view === 'explore') { S.sel = -1; highlight(-1); markExplore(); showIntro(); } };

// ======================= vues =======================
const VIEWS = ['vExplore', 'vPlaySet', 'vPlay', 'vOpenSet', 'vOpen', 'vBank', 'vResult'];
function show(v) { const was = S.shown; S.shown = v; VIEWS.forEach(x => $(x).hidden = x !== v);
  document.body.dataset.view = v === 'vExplore' ? 'explore' : 'other'; $('app').classList.toggle('playing', v === 'vPlay');
  if (was !== v || v === 'vPlay' || v === 'vOpen') scrollTo(0, 0);
  const tab = v.startsWith('vExplore') ? 'tabExplore' : v.startsWith('vPlay') ? 'tabPlay' : (v.startsWith('vOpen') || v === 'vBank') ? 'tabOpen' : S.lastTab;
  ['tabExplore', 'tabPlay', 'tabOpen'].forEach(t => t === tab ? $(t).setAttribute('aria-current', 'page') : $(t).removeAttribute('aria-current'));
  if (tab) S.lastTab = tab; }
function stats() {
  const c = A.counts(D), st = P && P.archStats ? P.archStats() : null;
  const known = st ? st.known.filter(id => id.startsWith('P:')).length : 0, okOpen = st ? st.known.filter(id => id.startsWith('A-')).length : 0;
  $('stats').innerHTML = `<span>🏛️ ${c.scenes} דגמים</span><span>🔢 ${known}/${c.parts} חלקים</span><span>✍️ ${okOpen}/${c.open} שאלות</span>${st && st.points ? `<span>🏆 ${st.points.toLocaleString('he-IL')}</span>` : ''}`;
}
function sceneKnown(s) { if (!P || !P.archStats) return 0; const st = P.archStats(); return s.parts.filter(p => st.status(A.partId(s.id, p.t)) === 1).length; }

// ---------- חקירה ----------
function drawGroups() {
  $('groups').innerHTML = D.groups.map(g => `<div class="grp"><b>${g.icon} ${esc(g.he)}</b><div class="srow">${D.scenes.filter(s => s.group === g.id).map(s => {
    const k = sceneKnown(s); return `<button type="button" data-s="${s.id}" aria-pressed="${S.scene && S.scene.id === s.id}">${s.icon} ${esc(s.he)}${k ? ` <span class="ok">✓${k}/${s.parts.length}</span>` : ''}</button>`; }).join('')}</div></div>`).join('');
  $('groups').querySelectorAll('button').forEach(b => b.onclick = () => { location.hash = '#/explore/' + b.dataset.s; });
}
function srcHtml(s) { return (s.src || []).map(k => { const x = D.sources[k]; return x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>` : esc(x.label); }).join(' · '); }
function showIntro() {
  const s = S.scene;
  $('detail').innerHTML = `<div class="meta"><span class="la">${esc(s.la)}</span></div><h2>${s.icon} ${esc(s.he)}</h2><p>${esc(s.intro)}</p><p class="src">מקור: ${srcHtml(s)}</p><p class="empty">גררו כדי לסובב, צבטו לזום, ונגעו במספר.</p>`;
}
function markExplore() {
  const st = P && P.archStats ? P.archStats() : null;
  [...$('pins').children].forEach((b, k) => b.className = 'pin' + (k === S.sel ? ' sel' : ''));
  $('plist').querySelectorAll('button').forEach((b, k) => b.classList.toggle('sel', k === S.sel));
  if (st) $('plist').querySelectorAll('.st').forEach((el, k) => { const v = st.status(A.partId(S.scene.id, S.scene.parts[k].t)); el.textContent = v === 1 ? '✅' : v === -1 ? '🔁' : ''; });
}
function pickExplore(k, noRoute) {
  S.sel = k; const p = S.scene.parts[k];
  highlight(k); focusPart(k); markExplore();
  $('detail').innerHTML = `<div class="meta">${k + 1} / ${S.scene.parts.length} · ${esc(S.scene.he)}</div><h2>${esc(p.he)}</h2>${p.la && p.la !== '—' ? `<div class="la">${esc(p.la)}</div>` : ''}<p>${esc(p.d)}</p>${p.w ? `<p class="where"><b>איפה רואים:</b> ${esc(p.w)}</p>` : ''}`;
  if (!noRoute) history.replaceState(null, '', '#/explore/' + S.scene.id + '/' + (k + 1));
}
function openExplore(id, n) {
  show('vExplore'); S.view = 'explore'; $('vExplore').className = 'explore';
  loadScene(id || (S.scene && S.scene.id) || S.pref.scene || 'orders'); S.pref.scene = S.scene.id; ls.set(PREF, S.pref);
  mountStage('slotExplore'); drawGroups(); highlight(-1);
  pinVisible = () => true; pinClick = k => pickExplore(k);
  $('plist').innerHTML = S.scene.parts.map((p, k) => `<li><button type="button" data-k="${k}"><span class="n">${k + 1}</span><span><span class="h">${esc(p.he)}</span><br><span class="l la">${esc(p.la)}</span></span><span class="st"></span></button></li>`).join('');
  $('plist').querySelectorAll('button').forEach(b => b.onclick = () => pickExplore(+b.dataset.k));
  $('playThis').href = '#/play/' + S.scene.id;
  if (n && n >= 1 && n <= S.scene.parts.length) pickExplore(n - 1, true); else { S.sel = -1; showIntro(); markExplore(); }
}

// ---------- משחק זיהוי ----------
function openPlaySet(sceneId) {
  show('vPlaySet'); S.view = 'playset';
  const cur = sceneId || S.pref.playScene || 'all'; S.pref.playScene = cur;
  $('pScene').innerHTML = `<button type="button" data-s="all" aria-pressed="${cur === 'all'}">🌍 כל הדגמים</button>` + D.scenes.map(s => `<button type="button" data-s="${s.id}" aria-pressed="${cur === s.id}">${s.icon} ${esc(s.he)}</button>`).join('');
  $('pScene').querySelectorAll('button').forEach(b => b.onclick = () => { S.pref.playScene = b.dataset.s; ls.set(PREF, S.pref); $('pScene').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const kinds = S.pref.kinds || A.ROUND_KINDS;
  $('pKinds').querySelectorAll('.mode').forEach(b => { b.setAttribute('aria-pressed', kinds.includes(b.dataset.k)); b.onclick = () => {
    const on = b.getAttribute('aria-pressed') !== 'true'; if (!on && $('pKinds').querySelectorAll('[aria-pressed=true]').length === 1) return;
    b.setAttribute('aria-pressed', on); S.pref.kinds = [...$('pKinds').querySelectorAll('[aria-pressed=true]')].map(x => x.dataset.k); ls.set(PREF, S.pref); }; });
  const n = String(S.pref.n || 10);
  $('pN').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.n === n); b.onclick = () => { S.pref.n = +b.dataset.n; ls.set(PREF, S.pref); $('pN').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); }; });
  const mis = P && P.archStats ? P.archStats().mistakes.filter(id => id.startsWith('P:')) : [];
  $('pReview').hidden = !mis.length; $('pReview').textContent = `🔁 תיקון טעויות (${mis.length})`;
}
$('pStart').onclick = () => startPlay();
$('pReview').onclick = () => startPlay(P.archStats().mistakes.filter(id => id.startsWith('P:')));
function startPlay(ids) {
  let rounds;
  if (ids && ids.length) {
    const r = A.rng(), kinds = S.pref.kinds || A.ROUND_KINDS;
    rounds = A.shuffle(ids, r).slice(0, 15).map((id, i) => { const [, sid, tag] = id.split(':'); const s = A.scene(D, sid); const p = s && s.parts.find(x => x.t === tag); return p ? A.buildRound(D, s, p, kinds[i % kinds.length], r) : null; }).filter(Boolean);
  } else rounds = A.buildRun(D, { scene: S.pref.playScene || 'all', n: S.pref.n || 10, kinds: S.pref.kinds || A.ROUND_KINDS });
  if (!renderer) rounds.forEach(r => { if (r.kind === 'find') { const s = A.scene(D, r.scene), p = s.parts.find(x => x.t === r.tag); Object.assign(r, A.buildRound(D, s, p, 'latin', A.rng())); } });
  S.run = { id: uuid(), rounds, i: 0, details: [], score: 0, streak: 0, t0: Date.now(), review: !!ids, sceneLabel: S.pref.playScene || 'all' };
  location.hash = '#/play/go';
}
let timer = null, tStart = 0, answered = false;
function playRound() {
  const R = S.run, r = R.rounds[R.i]; show('vPlay'); S.view = 'play'; $('vExplore').className = '';
  loadScene(r.scene); mountStage('slotPlay'); highlight(-1); answered = false;
  const s = S.scene, k = s.parts.findIndex(p => p.t === r.tag);
  $('pNum').textContent = `שאלה ${R.i + 1} / ${R.rounds.length}`; $('pScore').textContent = `🏆 ${R.score}`; $('pStreak').textContent = R.streak > 1 ? `🔥 ${R.streak} ברצף` : '';
  $('pFb').hidden = true; $('pNext').hidden = true; $('pOpts').innerHTML = '';
  [...$('pins').children].forEach(b => b.className = 'pin');
  if (r.kind === 'find') {
    $('pPrompt').innerHTML = `<small>👆 גע בחלק · ${esc(s.he)}</small><b>${esc(r.prompt)}</b>`;
    pinVisible = () => true; pinClick = j => answer(s.parts[j].t, j);
  } else {
    $('pPrompt').innerHTML = r.kind === 'name' ? `<small>🔦 איך נקרא החלק המסומן? · ${esc(s.he)}</small><b>החלק המהבהב בדגם</b>` : `<small>🏺 המונח הלטיני · ${esc(s.he)}</small><b>${esc(r.prompt)}</b>`;
    pinVisible = j => j === k; pinClick = null; if (r.kind === 'name') { highlight(k); pinClass(k, 'target'); } else highlight(k);
    focusPart(k);
    $('pOpts').innerHTML = r.options.map((o, j) => `<button type="button" data-j="${j}" class="${r.kind === 'latin' ? 'la' : ''}">${esc(o)}</button>`).join('');
    $('pOpts').querySelectorAll('button').forEach(b => b.onclick = () => answer(+b.dataset.j));
  }
  tStart = performance.now(); clearInterval(timer);
  const bar = $('pTimer'); bar.style.transform = 'scaleX(1)';
  timer = setInterval(() => { const left = 1 - (performance.now() - tStart) / A.ROUND_MS; bar.style.transform = `scaleX(${Math.max(0, left)})`; if (left <= 0) answer(null); }, 100);
}
function answer(a, pinIdx) {
  if (answered) return; answered = true; clearInterval(timer);
  const R = S.run, r = R.rounds[R.i], s = S.scene, k = s.parts.findIndex(p => p.t === r.tag), part = s.parts[k];
  const ms = performance.now() - tStart, ok = a !== null && A.isCorrect(r, a);
  R.streak = ok ? R.streak + 1 : 0;
  const pts = A.scoreRound(ok, ms, R.streak - 1);
  R.score += pts; R.details.push({ itemId: r.id, correct: ok, points: pts, kind: r.kind });
  $('pScore').textContent = `🏆 ${R.score}`; $('pStreak').textContent = R.streak > 1 ? `🔥 ${R.streak} ברצף` : '';
  pinClick = null;
  if (r.kind === 'find') { pinVisible = () => true; if (pinIdx != null && pinIdx !== k) pinClass(pinIdx, 'badp'); pinClass(k, 'good'); }
  else { pinVisible = j => j === k; pinClass(k, 'good'); $('pOpts').querySelectorAll('button').forEach((b, j) => { if (j === r.answer) b.classList.add('good'); else if (j === a) b.classList.add('badp'); b.disabled = true; }); }
  highlight(k, ok ? '#18aa7b' : '#d85660'); focusPart(k);
  $('pFb').className = 'fb ' + (ok ? 'good' : 'badp'); $('pFb').hidden = false;
  $('pFb').innerHTML = `<b>${ok ? `✅ נכון! +${pts}` : a === null ? '⏰ נגמר הזמן' : '❌ לא נכון'}</b><div><b style="display:inline;font-size:16px">${esc(part.he)}</b> · <span class="la">${esc(part.la)}</span></div><p>${esc(part.d)}</p>`;
  try { $('pFb').scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) {}
  $('pNext').hidden = false; $('pNext').textContent = R.i === R.rounds.length - 1 ? 'לתוצאה ◀' : 'הבא ◀'; $('pNext').focus({ preventScroll: true });
}
$('pNext').onclick = () => { const R = S.run; if (R.i < R.rounds.length - 1) { R.i++; playRound(); } else finishPlay(); };
$('pQuit').onclick = () => { clearInterval(timer); if (S.run && S.run.details.length) finishPlay(); else location.hash = '#/play'; };
function finishPlay() {
  const R = S.run; clearInterval(timer);
  const rec = A.buildResult({ mode: 'zihoui', scene: R.sceneLabel, runId: R.id, details: R.details, durationMs: Date.now() - R.t0 });
  const saved = P && P.saveArch ? P.saveArch(rec) : null;
  S.lastResult = { type: 'play', rec, saved };
  location.hash = '#/result';
}

// ---------- שאלות פתוחות ----------
function openOpenSet() {
  show('vOpenSet'); S.view = 'openset';
  const cats = S.pref.cats || D.openCats.map(c => c.id);
  $('oCats').innerHTML = D.openCats.map(c => `<button type="button" data-c="${c.id}" aria-pressed="${cats.includes(c.id)}">${esc(c.he)} <small>(${D.open.filter(q => q.cat === c.id).length})</small></button>`).join('');
  $('oCats').querySelectorAll('button').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; if (!on && $('oCats').querySelectorAll('[aria-pressed=true]').length === 1) return;
    b.setAttribute('aria-pressed', on); S.pref.cats = [...$('oCats').querySelectorAll('[aria-pressed=true]')].map(x => x.dataset.c); ls.set(PREF, S.pref); poolInfo(); });
  const n = String(S.pref.on || 10), l = String(S.pref.ol || 'all');
  $('oN').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.n === n); b.onclick = () => { S.pref.on = b.dataset.n; ls.set(PREF, S.pref); $('oN').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); }; });
  $('oL').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === l); b.onclick = () => { S.pref.ol = b.dataset.l; ls.set(PREF, S.pref); $('oL').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); poolInfo(); }; });
  poolInfo();
  const mis = P && P.archStats ? P.archStats().mistakes.filter(id => id.startsWith('A-')) : [];
  $('oReview').hidden = !mis.length; $('oReview').textContent = `🔁 שאלות שלא הצלחתי (${mis.length})`;
}
function poolInfo() { const n = A.openPool(D, { cats: S.pref.cats, level: S.pref.ol }).length; $('oPool').textContent = `${n} שאלות זמינות בבחירה הזו.`; $('oStart').disabled = !n; }
$('oStart').onclick = () => startOpen(A.buildOpenRun(D, { cats: S.pref.cats, level: S.pref.ol, n: S.pref.on || 10 }));
$('oReview').onclick = () => { const ids = P.archStats().mistakes.filter(id => id.startsWith('A-')); startOpen(A.buildOpenRun(D, { ids })); };
function startOpen(qs) { if (!qs.length) return; S.open = { id: uuid(), qs, i: 0, details: [], answers: [], t0: Date.now() }; location.hash = '#/open/go'; }
function openRound() {
  const O = S.open, q = O.qs[O.i]; show('vOpen'); S.view = 'open';
  const cat = D.openCats.find(c => c.id === q.cat);
  $('oNum').textContent = `שאלה ${O.i + 1} / ${O.qs.length}`; $('oCat').textContent = cat ? cat.he : '';
  $('oQ').innerHTML = (q.course ? '<span class="tag">קורס</span>' : '') + esc(q.question);
  $('oAns').value = O.answers[O.i] || ''; $('oAns').disabled = false; $('oKey').hidden = true; $('oReveal').hidden = false; $('oNext').hidden = true;
  $('oAns').focus({ preventScroll: true });
}
$('oReveal').onclick = () => {
  const O = S.open, q = O.qs[O.i]; $('oAns').disabled = true; O.answers[O.i] = $('oAns').value;
  $('oKp').innerHTML = q.points.map((p, j) => `<li><label><input type="checkbox" data-j="${j}"><span>${esc(p)}</span></label></li>`).join('');
  $('oKp').querySelectorAll('input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
  $('oKey').hidden = false; $('oReveal').hidden = true; $('oNext').hidden = false; $('oNext').textContent = O.i === O.qs.length - 1 ? 'לתוצאה ◀' : 'הבא ◀';
};
function recordOpen() { const O = S.open, q = O.qs[O.i]; const c = $('oKp').querySelectorAll('input:checked').length, sc = A.scoreOpen(c, q.points.length);
  O.details.push({ itemId: q.id, correct: sc.ok, points: sc.points, got: c, tot: q.points.length }); }
$('oNext').onclick = () => { recordOpen(); const O = S.open; if (O.i < O.qs.length - 1) { O.i++; openRound(); } else finishOpen(); };
$('oQuit').onclick = () => { const O = S.open; if (!$('oKey').hidden) recordOpen(); if (O && O.details.length) finishOpen(); else location.hash = '#/open'; };
function finishOpen() {
  const O = S.open; const rec = A.buildResult({ mode: 'open', runId: O.id, details: O.details, durationMs: Date.now() - O.t0 });
  const saved = P && P.saveArch ? P.saveArch(rec) : null; S.lastResult = { type: 'open', rec, saved, O }; location.hash = '#/result';
}

// ---------- בנק ----------
function openBank() {
  show('vBank'); S.view = 'bank';
  const draw = () => { const t = $('bSearch').value.trim();
    $('bank').innerHTML = D.openCats.map(c => { const qs = D.open.filter(q => q.cat === c.id && (!t || (q.question + q.points.join(' ')).includes(t))); if (!qs.length) return '';
      return `<h3 style="margin:14px 0 4px">${esc(c.he)} <small class="la" style="color:var(--soft);font-size:11px">${esc(c.la)}</small></h3>` + qs.map(q => `<details><summary>${q.course ? '<span class="tag">קורס</span>' : ''}${esc(q.question)}</summary><div class="in"><ul class="ostatic">${q.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div></details>`).join(''); }).join('') || '<p class="empty">לא נמצאו שאלות.</p>'; };
  $('bSearch').oninput = draw; draw();
}

// ---------- résultat ----------
function openResult() {
  const L = S.lastResult; if (!L) { location.hash = '#/explore'; return; }
  show('vResult'); S.view = 'result';
  const rec = L.rec, ratio = rec.total ? rec.correct / rec.total : 0, g = A.grade(ratio);
  $('rKind').textContent = L.type === 'play' ? '🎯 משחק זיהוי' : '✍️ שאלות פתוחות';
  $('rBig').className = 'big ' + g; $('rBig').textContent = `${rec.correct}/${rec.total}`;
  const gained = L.saved && L.saved.saved ? L.saved.gained : 0;
  $('rTxt').innerHTML = `🏆 ${rec.score} נקודות במשחק${gained ? ` · <b>+${gained}</b> לניקוד במסע שלי` : ''}. ${ratio >= .75 ? 'מוכנים למבחן!' : ratio >= .5 ? 'בסיס טוב — חסרים פרטים.' : 'כדאי לחזור על החלקים באדום.'}`;
  const bad = rec.answerDetails.filter(a => !a.correct);
  $('rFix').hidden = !bad.length;
  if (L.type === 'play') {
    $('rRev').innerHTML = rec.answerDetails.map(a => { const [, sid, tag] = a.itemId.split(':'), s = A.scene(D, sid), k = s.parts.findIndex(p => p.t === tag), p = s.parts[k];
      return `<details><summary><span class="pill ${a.correct ? 'good' : 'bad'}">${a.correct ? '✓' : '✗'}</span>${esc(p.he)} <span class="la" style="color:var(--soft);font-size:13px">${esc(p.la)}</span></summary><div class="in"><p style="margin:0;line-height:1.55">${esc(p.d)}</p><a class="cta alt" href="#/explore/${sid}/${k + 1}">🧭 לראות בדגם</a></div></details>`; }).join('');
    $('rAgain').onclick = () => startPlay(); $('rFix').onclick = () => startPlay(bad.map(a => a.itemId));
  } else {
    const O = L.O;
    $('rRev').innerHTML = O.details.map((a, i) => { const q = D.open.find(x => x.id === a.itemId), r = a.got / a.tot;
      return `<details><summary><span class="pill ${A.grade(r)}">${a.got}/${a.tot}</span>${esc(q.question)}</summary><div class="in">${O.answers[i] && O.answers[i].trim() ? `<div class="mine">${esc(O.answers[i])}</div>` : ''}<ul class="ostatic">${q.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div></details>`; }).join('');
    $('rAgain').onclick = () => location.hash = '#/open'; $('rFix').onclick = () => startOpen(A.buildOpenRun(D, { ids: bad.map(a => a.itemId) }));
  }
  stats();
}

// ======================= routeur =======================
function route() {
  if (!D) return;
  clearInterval(timer);
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'play' && h[1] === 'go' && S.run) return playRound();
  if (h[0] === 'play') return openPlaySet(h[1] && A.scene(D, h[1]) ? h[1] : null);
  if (h[0] === 'open' && h[1] === 'go' && S.open) return openRound();
  if (h[0] === 'open') return openOpenSet();
  if (h[0] === 'bank') return openBank();
  if (h[0] === 'result') return openResult();
  openExplore(h[1] && A.scene(D, h[1]) ? h[1] : null, +h[2] || 0);
}
document.addEventListener('keydown', e => {
  if (S.view === 'play' && !answered && /^[1-4]$/.test(e.key) && $('pOpts').children.length) answer(+e.key - 1);
});
window.MDArchApp = { state: () => S, data: () => D, hasGL: () => !!renderer };

(async function boot() {
  try { D = await (await fetch('architecture/data.json', { cache: 'no-cache' })).json(); }
  catch (e) { $('stats').innerHTML = '<span>⚠️ לא הצלחנו לטעון את הנתונים. נסו לרענן.</span>'; return; }
  const err = A.validate(D); if (err.length) console.warn('architecture/data.json', err);
  $('foot').textContent = D.note;
  init3d(); stats();
  addEventListener('hashchange', route); route();
  document.body.dataset.ready = '1';
})();
