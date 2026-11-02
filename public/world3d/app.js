// Moreh Derech NEXT — monde 3D jouable (premier site : théâtre romain de Césarée).
// Moteur générique piloté par le registre sites/<id>.json ; constructeurs par site (sites/<constructeur>.js).
// Logique pure (missions, validation, qualité) : world-core.js (window.MDWorld). Progression : MDProgress.saveArch (même système que « אדריכלות קלאסית »).
import * as THREE from 'three';
import { initMaterials, credits } from './materials.js';
import { buildEnvironment } from './environment.js';
import { Player } from './player.js';
import { loadPalette, applyOriginal, wanted, mountToggle } from '../polychromy.js';

const W = window.MDWorld, P = window.MDProgress;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const params = new URLSearchParams(location.search), SITE_ID = /^[a-z-]+$/.test(params.get('site') || '') ? params.get('site') : 'caesarea';
const KEY = 'mdl_world3d_v1:' + SITE_ID;
const BUILDERS = { 'caesarea-theatre': () => import('./sites/caesarea-theatre.js').then(m => m.buildCaesarea) };

const T = {
  he: { load: 'טוען את העולם…', steps: ['נתוני האתר', 'טקסטורות', 'בניית התקופה העתיקה', 'בניית המצב היום', 'סביבה: שמיים, ים וחוף', 'התנגשויות', 'הכנת הגרפיקה', 'מוכן'], cmp: 'השוואה', era: 'תקופה', mis: 'משימה', info: 'מידע', fly: 'מעוף', walk: 'הליכה',
    ghost: 'להציג את המבנים העתיקים בשקיפות מעל ההריסות', set: 'הגדרות', quality: 'איכות גרפית', auto: 'אוטומטי', low: 'נמוכה', medium: 'בינונית', high: 'גבוהה', fps: 'קצב מדוד', sound: 'צלילי רקע', on: 'פועל', off: 'כבוי', lang: 'שפה', credits: 'מקורות, רישיונות ונכסים',
    missions: 'משימות', start: 'להתחיל', done: '✓ הושלמה', next: 'הבא ◀', reveal: 'פתיחת התשובה', finish: 'סיום', quick: 'שאלה', quickQ: 'לאיזה חלק זה שייך?', right: '✅ נכון!', wrong: '❌ לא נכון — ', reliab: 'אמינות התקופה',
    hintD: 'לחצו על המסך כדי להסתובב עם העכבר · WASD לתנועה · Shift לריצה · לחיצה = בחירה · Esc לשחרור', hintM: 'אגודל שמאל = הליכה · גרירה = הסתכלות · נגיעה קצרה = בחירה',
    cert: { attested: 'מתועד', probable: 'סביר', hypothetical: 'השערה', modern: 'מודרני', error: 'טעות מכוונת' }, parts: { cavea: 'קוואה (יציע)', orchestra: 'אורכסטרה', scaena: 'סקנה (בניין הבמה)', modern: 'תוספת מודרנית', city: 'העיר והחומה' },
    found: 'נמצא', miss: 'זה לא אחת הטעויות', already: 'כבר נמצא', mDone: '🏆 המשימה הושלמה!', saved: ' · נשמר במסע שלי', goTo: 'גשו אל החלק המסומן ונגעו בו:', choose: 'לאיזו תקופה שייך?', lost: 'נעלם', modernF: 'מודרני',
    exam: 'שאלה', examHelp: 'כתבו, פתחו את התשובה וסמנו מה הזכרתם (אין ציון אוטומטי).', paused: 'המשחק בהשהיה', srcT: 'מקורות', noGL: 'הדפדפן הזה לא מציג תלת-ממד (WebGL).', choose3: 'בחרו חלק בעולם',
    planned: 'אתרים הבאים (בהכנה)', resume: 'המשך', tapStart: 'לחצו כדי להתחיל' },
  fr: { load: 'Chargement du monde…', steps: ['Données du site', 'Textures', 'Construction de l’Antiquité', 'Construction de l’état actuel', 'Environnement : ciel, mer, plage', 'Collisions', 'Préparation graphique', 'Prêt'], cmp: 'Comparer', era: 'Époque', mis: 'Mission', info: 'Infos', fly: 'Survol', walk: 'À pied',
    ghost: 'Afficher les bâtiments antiques en transparence sur les ruines', set: 'Réglages', quality: 'Qualité graphique', auto: 'Auto', low: 'Faible', medium: 'Moyenne', high: 'Élevée', fps: 'Images/s mesurées', sound: 'Ambiance sonore', on: 'Activée', off: 'Coupée', lang: 'Langue', credits: 'Sources, licences et assets',
    missions: 'Missions', start: 'Commencer', done: '✓ Terminée', next: 'Suivant ▶', reveal: 'Voir le corrigé', finish: 'Terminer', quick: 'Question', quickQ: 'À quelle partie appartient-il ?', right: '✅ Juste !', wrong: '❌ Non — ', reliab: 'Fiabilité de l’époque',
    hintD: 'Clique sur la scène pour regarder à la souris · WASD pour marcher · Maj pour courir · clic = sélectionner · Échap pour libérer', hintM: 'Pouce gauche = marcher · glisser = regarder · tap court = sélectionner',
    cert: { attested: 'Attesté', probable: 'Probable', hypothetical: 'Hypothèse', modern: 'Moderne', error: 'Erreur volontaire' }, parts: { cavea: 'Cavea (gradins)', orchestra: 'Orchestra', scaena: 'Scaena (bâtiment de scène)', modern: 'Ajout moderne', city: 'Ville et muraille' },
    found: 'trouvé', miss: 'Ce n’est pas une des erreurs', already: 'Déjà trouvé', mDone: '🏆 Mission accomplie !', saved: ' · enregistré dans « המסע שלי »', goTo: 'Va jusqu’à l’élément signalé et touche-le :', choose: 'À quelle époque appartient-il ?', lost: 'disparu', modernF: 'moderne',
    exam: 'Question', examHelp: 'Écris, ouvre le corrigé et coche ce que tu as cité (pas de correction automatique).', paused: 'Jeu en pause', srcT: 'Sources', noGL: 'Ce navigateur n’affiche pas la 3D (WebGL).', choose3: 'Choisis un élément dans le monde',
    planned: 'Prochains sites (en préparation)', resume: 'Reprendre', tapStart: 'Toucher pour commencer' },
  en: { load: 'Loading the world…', steps: ['Site data', 'Textures', 'Building antiquity', 'Building today', 'Environment: sky, sea, beach', 'Collisions', 'Preparing graphics', 'Ready'], cmp: 'Compare', era: 'Period', mis: 'Mission', info: 'Info', fly: 'Fly', walk: 'Walk',
    ghost: 'Show the ancient buildings as a transparent overlay on the ruins', set: 'Settings', quality: 'Graphics quality', auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', fps: 'Measured FPS', sound: 'Ambient sound', on: 'On', off: 'Off', lang: 'Language', credits: 'Sources, licences and assets',
    missions: 'Missions', start: 'Start', done: '✓ Done', next: 'Next ▶', reveal: 'Show the answer', finish: 'Finish', quick: 'Question', quickQ: 'Which part does it belong to?', right: '✅ Correct!', wrong: '❌ No — ', reliab: 'Reliability of this period',
    hintD: 'Click the scene to look with the mouse · WASD to walk · Shift to run · click = select · Esc to release', hintM: 'Left thumb = walk · drag = look · short tap = select',
    cert: { attested: 'Attested', probable: 'Probable', hypothetical: 'Hypothesis', modern: 'Modern', error: 'Deliberate error' }, parts: { cavea: 'Cavea (seating)', orchestra: 'Orchestra', scaena: 'Scaena (stage building)', modern: 'Modern addition', city: 'City and wall' },
    found: 'found', miss: 'That is not one of the errors', already: 'Already found', mDone: '🏆 Mission complete!', saved: ' · saved to your journey', goTo: 'Walk to the marked element and tap it:', choose: 'Which period does it belong to?', lost: 'gone', modernF: 'modern',
    exam: 'Question', examHelp: 'Write, open the model answer and tick what you covered (no automatic grading).', paused: 'Game paused', srcT: 'Sources', noGL: 'This browser cannot display 3D (WebGL).', choose3: 'Pick an element in the world',
    planned: 'Next sites (in preparation)', resume: 'Resume', tapStart: 'Tap to start' }
};

const S = ls.get(KEY, {});
let lang = S.lang || (() => { try { const l = localStorage.getItem('mdl_mode_lang') || localStorage.getItem('mdl_lang'); return ['he', 'fr', 'en'].includes(l) ? l : 'he'; } catch (e) { return 'he'; } })();
const t = () => T[lang];
const L = o => (o && (o[lang] || o.he)) || '';
let site, world, env, player, renderer, scene, camera, sel = null, mission = null, missionRun = null, clockT = 0;
const state = { era: S.era === 'ancient' ? 'ancient' : 'present', compare: false, mix: 0.5, ghost: false, quality: S.quality || 'auto', level: 'medium', sound: S.sound !== false, done: S.done || {}, fps: 0 };

function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  $('lEra').textContent = t().era; $('lCmp').textContent = t().cmp; $('lMis').textContent = t().mis; $('lInfo').textContent = t().info; $('lFly').textContent = player && player.mode === 'fly' ? t().walk : t().fly;
  $('ghostTxt').textContent = t().ghost; if (site) { $('cmpL').textContent = L(site.periods.find(p => p.id === 'present').names); $('cmpR').textContent = L(site.periods.find(p => p.id === 'ancient').names); }
  $('hint').textContent = matchMedia('(pointer:coarse)').matches ? t().hintM : t().hintD; updateBadge(); updateProg(); drawObjective();
}
function setLoad(step, frac) { const st = t().steps; $('loadStep').textContent = `${Math.min(step + 1, st.length)}/${st.length} · ${st[step] || ''}`; $('loadBar').style.width = Math.round(Math.min(1, (step + (frac || 0)) / (st.length - 1)) * 100) + '%'; }
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

// ======================= démarrage =======================
async function boot() {
  $('loadTitle').textContent = '🏛️'; $('loadSub').textContent = t().load; setLoad(0);
  site = await (await fetch(`world3d/sites/${SITE_ID}.json`, { cache: 'no-cache' })).json();
  const err = W.validate(site); if (err.length) console.warn('site', err);
  $('loadTitle').textContent = L(site.names);
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
  state.level = state.quality === 'auto' ? W.autoQuality({ mobile, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory }) : state.quality;
  const Q = W.QUALITY[state.level];
  try { renderer = new THREE.WebGLRenderer({ antialias: state.level !== 'low', powerPreference: 'high-performance' }); }
  catch (e) { $('loadSub').textContent = t().noGL; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dpr)); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 5000);
  // textures : progression réelle du LoadingManager
  const manager = new THREE.LoadingManager(); manager.onProgress = (u, a, b) => setLoad(1, a / b);
  setLoad(1); await initMaterials(manager, renderer);
  await frame(); setLoad(2);
  const build = await BUILDERS[site.builder]();
  world = build({ detail: Q.detail });
  scene.add(world.eras.ancient, world.eras.present);
  await frame(); setLoad(3); await frame(); setLoad(4);
  env = await buildEnvironment({ renderer, scene, Q, plan: world.plan, manager });
  await new Promise(r => { if (manager.itemsLoaded === manager.itemsTotal) r(); else { const prev = manager.onLoad; manager.onLoad = () => { prev && prev(); r(); }; setTimeout(r, 15000); } });
  setLoad(5); await frame();
  player = new Player(camera, renderer.domElement, { bounds: site.bounds, height: env.height });
  player.joyEl = $('joy'); player.knobEl = $('knob'); player.wantLock = !matchMedia('(pointer:coarse)').matches;
  player.onSelect = pt => select(pt);
  applyEra(); setupPoly();
  const sp = S.pos && S.pos.length === 3 ? S.pos : site.spawn.pos;
  player.place(sp, S.yaw ?? site.spawn.yaw, S.pitch ?? -0.05);
  setLoad(6); await frame();
  renderer.compile(scene, camera);
  setLoad(7);
  $('load').hidden = true;
  applyLang(); bindUI(); minimapInit();
  renderer.setAnimationLoop(loop);
  document.body.dataset.ready = '1';
}

// ======================= צבעים מקוריים (polychromy.json) =======================
// Seulement l'état antique : l'état actuel montre déjà la pierre telle qu'on la voit aujourd'hui. Les erreurs volontaires ne changent pas.
let POLY = null, polyUsed = [];
function polyKeys(m) {
  const tag = m.userData.tag, slot = m.material && m.material.userData && m.material.userData.slot, sid = site.id;
  if (!tag || String(tag).startsWith('err')) return [];
  return [sid + ':' + tag, slot && sid + ':slot:' + slot, slot && 'slot:' + slot];
}
function applyPoly() { if (!world || !POLY) return; polyUsed = applyOriginal(world.eras.ancient, 'world3d', polyKeys, POLY.on, { clone: true }); applyEra(); POLY.refresh(); }
function setupPoly() {
  if (POLY) return;
  const lang = document.documentElement.lang || 'he';
  POLY = mountToggle($('side'), { className: 'rb', lang, label: '<span>🎨<small>' + ({ he: 'צבעים', fr: 'Couleurs', en: 'Colours' }[lang] || 'צבעים') + '</small></span>', used: () => polyUsed,
    onChange: on => { if (on && state.era === 'present' && !state.compare) { state.era = 'ancient'; } loadPalette().then(applyPoly); } });
  if (wanted()) loadPalette().then(() => POLY.set(true));
}

// ======================= époques =======================
function setOpacity(group, o, tint) {
  group.traverse(m => { if (!m.isMesh || !m.visible && m.userData.hiddenCollider) return; const mat = m.material; if (!mat || !mat.isMaterial || m.userData.tag === undefined) return;
    const tr = o < 0.999; if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; } mat.opacity = o; mat.depthWrite = !tr;
    if (tint !== undefined && mat.emissive && !(sel && sel.meshes.includes(m))) { mat.emissive.set(tint ? '#6ee9cf' : '#000000'); mat.emissiveIntensity = tint ? 0.35 : 1; }
    m.castShadow = !tr && m.userData.cast !== false; });
}
function applyEra() {
  const A = world.eras.ancient, Pr = world.eras.present;
  if (state.compare) {
    A.visible = Pr.visible = true;
    if (state.ghost) { setOpacity(Pr, 1, false); setOpacity(A, 0.38, true); }
    else { setOpacity(Pr, 1 - state.mix * 0.999, false); setOpacity(A, Math.max(0.001, state.mix), false); }
  } else { A.visible = state.era === 'ancient'; Pr.visible = state.era === 'present'; setOpacity(A, 1, false); setOpacity(Pr, 1, false); }
  world.errors.visible = !!(mission && mission.type === 'errors') && A.visible;
  // collisions : époque affichée (en comparaison, l'état actuel)
  if (player) player.setColliders(world.colliders[state.compare || state.era === 'present' ? 'present' : 'ancient']);
  updateBadge(); S.era = state.era; save();
}
function updateBadge() {
  if (!site) return; const p = site.periods.find(x => x.id === state.era);
  $('eraBadge').className = 'era ' + (state.compare ? '' : state.era); $('eraTxt').textContent = state.compare ? `${t().cmp}` : L(p.names) + ' · ' + L(p.date).split(' — ')[0];
  $('btnCmp').setAttribute('aria-pressed', state.compare); $('cmp').hidden = !state.compare;
  $('monName').textContent = sel ? L(sel.el.names) : L(site.names);
}

// ======================= sélection =======================
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
function select(pt) {
  if (pt) { const r = renderer.domElement.getBoundingClientRect(); v2.set((pt.x - r.left) / r.width * 2 - 1, -(pt.y - r.top) / r.height * 2 + 1); } else v2.set(0, 0);
  camera.updateMatrixWorld(); ray.setFromCamera(v2, camera); ray.far = 400;
  const vis = world.pickables.filter(m => isShown(m)).concat(env.sea);
  const hit = ray.intersectObjects(vis, false)[0];
  if (!hit) return;
  const m = hit.object, tag = m.userData.tag, era = m.userData.era === 'both' ? (state.compare ? 'present' : state.era) : m.userData.era;
  const el = W.elementForTag(site, tag, era, { errors: mission && mission.type === 'errors' });
  if (!el) return;
  highlight(el, era);
  const res = mission && missionRun ? onMissionPick(el, era) : null;
  if (!res || res === 'info') openInfo(el, era);
}
function isShown(m) { let o = m; while (o) { if (!o.visible) return false; o = o.parent; } return !m.material || m.material.opacity > 0.05; }
function highlight(el, era) {
  if (sel) sel.meshes.forEach(m => { if (m.material.emissive) { m.material.emissive.set('#000'); m.material.emissiveIntensity = 1; } });
  const eras = era ? [era] : ['ancient', 'present'];
  const meshes = []; eras.forEach(e => el.tags.forEach(tg => (world.tagMeshes[e][tg] || []).forEach(m => meshes.push(m))));
  meshes.forEach(m => { if (m.material.emissive) { m.material.emissive.set('#ffb347'); m.material.emissiveIntensity = 0.32; } });
  sel = { el, era, meshes }; updateBadge();
}
function srcList(keys) { return keys.map(k => { const s = site.sources[k]; return s ? (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)) : ''; }).join('<br>'); }
function openInfo(el, era) {
  const per = site.periods.find(p => p.id === era);
  sheet(`<div><span class="cert ${el.certainty}">${t().cert[el.certainty]}</span><span style="font-size:12px;color:var(--soft)">${esc(L(per.names))}</span></div>
    <h2>${esc(L(el.names))}</h2>${el.la && el.la !== '—' ? `<div class="la">${esc(el.la)}</div>` : ''}<p>${esc(L(el.info))}</p>
    ${el.certainty !== 'error' ? `<div class="row"><button class="btn" id="qBtn">❓ ${t().quick}</button></div><div id="qBox"></div>` : ''}
    ${el.sources.length ? `<div class="srcs"><b>${t().srcT}</b><br>${srcList(el.sources)}</div>` : ''}
    <div class="srcs"><b>${t().reliab}:</b> ${esc(L(per.reliabilityNote))}</div>`);
  const q = $('qBtn'); if (q) q.onclick = () => quickQuestion(el);
}
// Question liée à l'objet : à quelle partie du théâtre appartient-il ?
function quickQuestion(el) {
  const parts = ['cavea', 'orchestra', 'scaena', 'modern'], ans = el.part === 'city' || el.part === 'error' ? null : el.part;
  if (!ans) return;
  $('qBox').innerHTML = `<p><b>${t().quickQ}</b></p><div class="opts">${parts.map(p => `<button data-p="${p}">${esc(t().parts[p])}</button>`).join('')}</div>`;
  $('qBox').querySelectorAll('button').forEach(b => b.onclick = () => {
    const ok = b.dataset.p === ans; $('qBox').querySelectorAll('button').forEach(x => { x.disabled = true; if (x.dataset.p === ans) x.classList.add('good'); else if (x === b) x.classList.add('bad'); });
    if (P && P.saveArch) P.saveArch({ version: 1, kind: 'arch', mode: 'world-quick', scene: site.id.replace(/-/g, ''), runId: uuid(), completedAt: new Date().toISOString(), answerDetails: [{ itemId: 'P:' + site.id.replace(/-/g, '') + ':' + el.id, correct: ok, points: ok ? 150 : 0 }], correct: ok ? 1 : 0, total: 1, score: ok ? 150 : 0 });
    toast(ok ? t().right : t().wrong + t().parts[ans], ok);
  });
}

// ======================= missions =======================
function openMissions() {
  const planned = [];
  sheet(`<h2>🎯 ${t().missions}</h2><div class="mlist">${site.missions.map(m => `<button data-m="${m.id}" class="${state.done[m.id] ? 'done' : ''}"><span class="i">${m.icon}</span><span><b>${esc(L(m.names))}</b><small>${state.done[m.id] ? t().done + ' · ' : ''}${esc(L(m.brief))}</small></span></button>`).join('')}</div>`);
  $('sheetBody').querySelectorAll('[data-m]').forEach(b => b.onclick = () => startMission(b.dataset.m));
}
function startMission(id) {
  mission = W.mission(site, id); missionRun = W.startMission(site, id); missionRun.runId = uuid();
  closeSheet();
  if (mission.type === 'identify' || mission.type === 'errors') { state.compare = false; state.era = mission.era || 'ancient'; }
  if (mission.type === 'compare') { state.compare = true; state.ghost = false; $('ghost').checked = false; }
  applyEra(); drawObjective();
  if (mission.type === 'chronology') chronoStep();
  if (mission.type === 'exam') examStep();
}
function onMissionPick(el, era) {
  if (mission.type === 'chronology') {
    const it = W.chronoItem(site, missionRun); if (it && el.id === it.element) { chronoAsk(it); return 'handled'; } return 'info';
  }
  if (mission.type === 'exam') return 'info';
  if (mission.type === 'compare' && !state.compare) return 'info';
  const r = W.pick(site, missionRun, el, { era }), mtype = mission.type;
  if (r.status === 'found') { toast(`✓ ${L(el.names)} — ${t().found}` + (mission.type === 'compare' ? ` (${mission.lost.includes(el.id) ? t().lost : t().modernF})` : ''), true); drawObjective(); if (missionRun.done) finishMission(); return mtype === 'errors' ? 'info' : 'handled'; }
  if (r.status === 'miss') { toast(t().miss, false); return 'handled'; }
  if (r.status === 'already') { toast(t().already, true); return 'handled'; }
  return 'info';
}
function chronoStep() {
  const it = W.chronoItem(site, missionRun); if (!it) return finishMission();
  if (state.compare || state.era !== it.era) { state.compare = false; state.era = it.era; applyEra(); }
  const el = W.element(site, it.element); highlight(el, it.era); drawObjective();
}
function chronoAsk(it) {
  const m = mission;
  sheet(`<h2>⏳ ${esc(L(it.q))}</h2><p>${t().choose}</p><div class="opts">${m.choices.map(c => `<button data-c="${c.id}">${esc(L(c.names))}</button>`).join('')}</div><div id="chFb"></div>`);
  $('sheetBody').querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const r = W.answerChrono(site, missionRun, b.dataset.c);
    $('sheetBody').querySelectorAll('[data-c]').forEach(x => { x.disabled = true; if (x.dataset.c === r.answer) x.classList.add('good'); else if (x === b) x.classList.add('bad'); });
    const el = W.element(site, it.element);
    $('chFb').innerHTML = `<p>${r.ok ? t().right : t().wrong}</p><p>${esc(L(el.info))}</p><div class="row"><button class="btn" id="chNext">${t().next}</button></div>`;
    $('chNext').onclick = () => { closeSheet(); if (missionRun.done) finishMission(); else chronoStep(); };
  });
}
function examStep() {
  const i = missionRun.step, q = site.questions[i]; if (!q) return finishMission();
  sheet(`<div style="font-size:12px;color:var(--soft)">${t().exam} ${i + 1} / ${site.questions.length}</div><h2>${esc(L(q.q))}</h2><p style="color:var(--soft)">${t().examHelp}</p>
    <textarea id="exA"></textarea><div class="row"><button class="btn" id="exR">${t().reveal}</button></div><ul class="kp" id="exK" hidden></ul><div class="row"><button class="btn" id="exN" hidden>${i === site.questions.length - 1 ? t().finish : t().next}</button></div>`, true);
  $('exR').onclick = () => { $('exA').readOnly = true; $('exK').hidden = false; $('exR').hidden = true; $('exN').hidden = false;
    $('exK').innerHTML = q.points[lang].map(p => `<li><label><input type="checkbox"> <span>${esc(p)}</span></label></li>`).join(''); };
  $('exN').onclick = () => { const c = $('exK').querySelectorAll('input:checked').length, sc = W.scoreOpen(c, q.points[lang].length);
    missionRun.answers.push({ id: q.id, ok: sc.ok, points: sc.points }); if (sc.ok) missionRun.found.push(q.id); missionRun.step++;
    if (missionRun.step >= site.questions.length) { missionRun.done = true; closeSheet(); finishMission(); } else examStep(); };
}
function finishMission() {
  const rec = W.missionResult(site, missionRun, missionRun.runId); const saved = P && P.saveArch ? P.saveArch(rec) : null;
  state.done[mission.id] = Date.now(); S.done = state.done; save();
  toast(t().mDone + (saved && saved.saved ? t().saved : ''), true);
  mission = null; missionRun = null; world.errors.visible = false; drawObjective(); updateProg(); applyEra();
}
function drawObjective() {
  const o = $('obj'); if (!mission || !missionRun) { o.hidden = true; return; }
  o.hidden = false; let chips = '';
  if (mission.type === 'identify') chips = mission.targets.map(k => `<span class="${missionRun.found.includes(k) ? 'on' : ''}">${esc(t().parts[k])}</span>`).join('');
  if (mission.type === 'compare') chips = [...mission.lost, ...mission.modern].map(k => `<span class="${missionRun.found.includes(k) ? 'on' : ''}">${missionRun.found.includes(k) ? esc(L(W.element(site, k).names)) : (mission.lost.includes(k) ? '🏛️ ' + t().lost : '🔧 ' + t().modernF)}</span>`).join('');
  if (mission.type === 'errors') chips = mission.errors.map((k, i) => `<span class="${missionRun.found.includes(k) ? 'on' : ''}">${missionRun.found.includes(k) ? esc(L(W.element(site, k).names)) : '?'}</span>`).join('');
  let txt = L(mission.brief);
  if (mission.type === 'chronology') { const it = W.chronoItem(site, missionRun); txt = it ? `${t().goTo} <b>${esc(L(W.element(site, it.element).names))}</b>` : ''; chips = `<span>${missionRun.step} / ${missionRun.total}</span>`; }
  o.innerHTML = `<b>${mission.icon} ${esc(L(mission.names))}</b> — ${mission.type === 'chronology' ? txt : esc(txt)} <span class="prog">${missionRun.found.length}/${missionRun.total}</span><div class="chips">${chips}</div>`;
}
function updateProg() { if (!site) return; const n = site.missions.filter(m => state.done[m.id]).length; $('prog').textContent = `🎯 ${n}/${site.missions.length}`; }

// ======================= réglages, sources =======================
function openSettings() {
  const q = ['auto', 'low', 'medium', 'high'];
  sheet(`<h2>⚙️ ${t().set}</h2><div class="set">
    <div><b>${t().lang}</b><div class="seg">${['he', 'fr', 'en'].map(l => `<button data-l="${l}" aria-pressed="${l === lang}">${{ he: 'עברית', fr: 'Français', en: 'English' }[l]}</button>`).join('')}</div></div>
    <div><b>${t().quality}</b> <small style="color:var(--soft)">(${t()[state.level]})</small><div class="seg">${q.map(x => `<button data-q="${x}" aria-pressed="${x === state.quality}">${t()[x]}</button>`).join('')}</div></div>
    <div><b>${t().fps}</b>: <span id="fpsNow">${state.fps ? state.fps.toFixed(0) : '…'}</span></div>
    <div><b>${t().sound}</b><div class="seg"><button data-s="1" aria-pressed="${state.sound}">${t().on}</button><button data-s="0" aria-pressed="${!state.sound}">${t().off}</button></div></div>
    <button class="btn alt" id="credBtn">📜 ${t().credits}</button></div>`);
  $('sheetBody').querySelectorAll('[data-l]').forEach(b => b.onclick = () => { lang = b.dataset.l; S.lang = lang; save(); applyLang(); openSettings(); });
  $('sheetBody').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { state.quality = b.dataset.q; S.quality = state.quality; save(); savePos(); location.reload(); });
  $('sheetBody').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { state.sound = b.dataset.s === '1'; S.sound = state.sound; save(); state.sound ? audioOn() : audioOff(); openSettings(); });
  $('credBtn').onclick = openCredits;
}
function openCredits() {
  const c = credits(), m = c.manifest || { slots: {} };
  const tex = Object.entries(m.slots || {}).map(([k, s]) => `<li>${esc(k)} : <a href="${esc(s.page)}" target="_blank" rel="noopener">${esc(s.name)}</a> — ${esc(s.authors.join(', '))} · CC0</li>`).join('');
  const all = Object.keys(site.sources).map(k => `<li>${srcList([k])}</li>`).join('');
  const dims = site.dimensions;
  sheet(`<h2>📜 ${t().credits}</h2>
    <p><b>Antiquité / ${esc(L(site.periods[1].names))}</b> : ${esc(L(site.periods[1].reliabilityNote))}</p>
    <p><b>${esc(L(site.periods[0].names))}</b> : ${esc(L(site.periods[0].reliabilityNote))}</p>
    <p>Cavea : ${dims.caveaDiameter.value} m (${dims.caveaDiameter.alt} m selon theatrum.de) · orchestra ${dims.orchestraDiameter.value} m · ${dims.rows.ima}+${dims.rows.summa} rangs (hypothèse) · scène ${dims.stage.length}×${dims.stage.depth} m (hypothèse) · mur de scène ${dims.scaenaeFronsHeight.value} m (hypothèse).</p>
    <div class="srcs"><b>${t().srcT}</b><ul>${all}</ul></div>
    <div class="srcs"><b>Textures PBR et ciel HDR — Poly Haven, CC0</b><ul>${tex}${m.hdri ? `<li>HDRI : <a href="${esc(m.hdri.page)}" target="_blank" rel="noopener">${esc(m.hdri.name)}</a> — ${esc(m.hdri.authors.join(', '))} · CC0</li>` : ''}</ul>
    ${c.procedural.length ? `Textures procédurales de secours : ${esc(c.procedural.join(', '))}` : ''} Motifs peints de l'orchestra, cannelures et inscription : dessinés par le programme (hypothèse).</div>
    <div class="srcs"><b>Logiciels</b> : three.js r169 (MIT) · three-mesh-bvh 0.9.1 (MIT). Ambiance sonore synthétisée en direct (WebAudio).</div>`);
}

// ======================= interface =======================
function sheet(html, keep) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; if (document.pointerLockElement) document.exitPointerLock(); }
function closeSheet() { $('sheet').hidden = true; }
let toastT = 0; function toast(msg, ok) { const e = $('toast'); e.textContent = msg; e.style.background = ok ? 'var(--ok)' : 'var(--bad)'; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, 2600); }
function bindUI() {
  $('sheetX').onclick = closeSheet;
  $('btnEra').onclick = () => { state.compare = false; state.era = state.era === 'present' ? 'ancient' : 'present'; applyEra(); toast(L(site.periods.find(p => p.id === state.era).names) + ' — ' + L(site.periods.find(p => p.id === state.era).date), true); };
  $('btnCmp').onclick = () => { state.compare = !state.compare; applyEra(); };
  $('cmpRange').oninput = e => { state.mix = e.target.value / 100; applyEra(); };
  $('ghost').onchange = e => { state.ghost = e.target.checked; applyEra(); };
  $('btnMis').onclick = openMissions;
  $('btnInfo').onclick = () => sel ? openInfo(sel.el, sel.era || state.era) : sheet(`<h2>${esc(L(site.names))}</h2><p>${t().choose3}</p><p>${esc(L(site.periods.find(p => p.id === state.era).reliabilityNote))}</p><div class="srcs"><b>${t().planned}</b>: ${PLANNED.map(s => esc(L(s.names))).join(' · ')}</div>`);
  $('btnFly').onclick = () => { player.setMode(player.mode === 'fly' ? 'walk' : 'fly'); $('btnFly').setAttribute('aria-pressed', player.mode === 'fly'); applyLang(); };
  $('btnSet').onclick = openSettings;
  $('back').href = document.referrer && new URL(document.referrer).origin === location.origin ? document.referrer : 'architecture.html';
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  document.addEventListener('pointerlockchange', () => { $('cross').hidden = !document.pointerLockElement; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('pagehide', savePos);
  $('resume').onclick = resume;
  renderer.domElement.addEventListener('pointerdown', () => { if (state.sound) audioOn(); }, { once: true });
}
let paused = false;
function pause() { if (paused) return; paused = true; savePos(); renderer.setAnimationLoop(null); audioOff(true); $('pause').hidden = false; }
function resume() { paused = false; $('pause').hidden = true; last = performance.now(); renderer.setAnimationLoop(loop); if (state.sound) audioOn(); }
function save() { ls.set(KEY, S); }
function savePos() { if (!player) return; S.pos = [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)]; S.yaw = player.yaw; S.pitch = player.pitch; save(); }

// ======================= mini-carte =======================
let mctx;
function minimapInit() { mctx = $('mini').getContext('2d'); }
function minimap() {
  const c = mctx, W2 = 236, k = 1.05, cx = W2 / 2, cy = W2 / 2, p = player.pos, pl = world.plan;
  c.clearRect(0, 0, W2, W2); c.save(); c.translate(cx, cy);
  const ang = player.mode === 'walk' ? player.yaw : 0; c.rotate(ang); c.scale(k, k); c.translate(-p.x, -p.z);
  const X = x => x, Z = z => z;
  c.fillStyle = '#2a6f95'; c.fillRect(pl.shoreX - 400, -400, 400, 800);
  c.fillStyle = '#d9c79f33'; c.fillRect(pl.shoreX, -400, 800, 800);
  c.strokeStyle = '#ffd878'; c.lineWidth = 3;
  [pl.outer, pl.ima, pl.orchestra].forEach(r => { c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); c.stroke(); });
  c.fillStyle = '#e8dcc8'; c.fillRect(pl.sf.rear, -pl.stage.z, -pl.sf.rear, pl.stage.z * 2);
  c.fillStyle = '#c9b48d'; c.fillRect(-60, pl.wallZ - 1, 150, 2);
  if (mission && missionRun && mission.type === 'chronology') { const it = W.chronoItem(site, missionRun); if (it && sel) { const b = new THREE.Box3(); sel.meshes.forEach(m => b.expandByObject(m)); const ce = b.getCenter(new THREE.Vector3()); c.fillStyle = '#ff5c8a'; c.beginPath(); c.arc(ce.x, ce.z, 4, 0, 7); c.fill(); } }
  c.restore();
  c.fillStyle = '#6ee9cf'; c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx - 6, cy + 6); c.lineTo(cx + 6, cy + 6); c.closePath(); c.fill();
}

// ======================= son (synthétisé) =======================
let actx = null, gain = null;
function audioOn() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const len = actx.sampleRate * 4, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0); let b = 0;
      for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
      const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const swell = actx.createGain(); swell.gain.value = 0.5; const lfo = actx.createOscillator(); lfo.frequency.value = 0.11; const lg = actx.createGain(); lg.gain.value = 0.35; lfo.connect(lg).connect(swell.gain); lfo.start();
      const pan = actx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 30; pan.positionX.value = world.plan.shoreX - 10; pan.positionY.value = 0; pan.positionZ.value = 0;
      gain = actx.createGain(); gain.gain.value = 0;
      src.connect(lp).connect(swell).connect(pan).connect(gain).connect(actx.destination); src.start();
    }
    actx.resume(); gain.gain.setTargetAtTime(0.22, actx.currentTime, 0.8);
  } catch (e) {}
}
function audioOff(suspend) { if (!actx) return; gain.gain.setTargetAtTime(0, actx.currentTime, 0.2); if (suspend) setTimeout(() => actx && actx.suspend(), 400); }
function audioListener() { if (!actx || actx.state !== 'running') return; const l = actx.listener, p = camera.position, f = new THREE.Vector3(); camera.getWorldDirection(f);
  if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; } }

// ======================= boucle =======================
let last = performance.now(), fpsN = 0, fpsT = 0, posT = 0, mapT = 0, lowStreak = 0;
const fpsLog = [];
function loop() {
  const now = performance.now(), dt = (now - last) / 1000; last = now; clockT += dt;
  player.update(dt); env.update(clockT, player.mode === 'walk' ? player.pos : player.orbit.target);
  renderer.render(scene, camera);
  fpsN++; fpsT += dt; if (fpsT >= 2) { state.fps = fpsN / fpsT; fpsLog.push(+state.fps.toFixed(1)); if (fpsLog.length > 30) fpsLog.shift(); fpsN = 0; fpsT = 0; const e = $('fpsNow'); if (e) e.textContent = state.fps.toFixed(0);
    if (state.quality === 'auto') { lowStreak = state.fps < 28 ? lowStreak + 1 : 0; if (lowStreak >= 3 && state.level !== 'low') { state.level = W.adapt(state.level, state.fps); const Q = W.QUALITY[state.level]; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dpr)); renderer.setSize(innerWidth, innerHeight); if (!Q.shadows) { renderer.shadowMap.enabled = false; env.sun.castShadow = false; } lowStreak = 0; } } }
  mapT += dt; if (mapT > 0.1) { minimap(); mapT = 0; audioListener(); }
  posT += dt; if (posT > 5) { savePos(); posT = 0; }
}
const PLANNED = [];
window.MDWorldApp = { state: () => ({ ...state, mission: mission && mission.id, run: missionRun, mode: player && player.mode, pos: player && player.pos.toArray(), sel: sel && sel.el.id, fpsLog: fpsLog.slice() }),
  site: () => site, world: () => world, player: () => player, camera: () => camera, select, startMission, setEra: e => { state.compare = false; state.era = e; applyEra(); }, setCompare: (on, mix, ghost) => { state.compare = on; state.mix = mix ?? state.mix; state.ghost = !!ghost; applyEra(); },
  pickElement: (id, era) => { const el = W.element(site, id); highlight(el, era); const r = mission && missionRun ? onMissionPick(el, era) : null; if (!r || r === 'info') openInfo(el, era); return r; },
  answerChrono: c => { const b = document.querySelector(`[data-c="${c}"]`); b && b.click(); } };
fetch('world3d/sites/index.json').then(r => r.json()).then(j => j.sites.filter(s => s.status === 'planned').forEach(s => PLANNED.push(s))).catch(() => {});
boot().catch(e => { console.error(e); $('loadSub').textContent = '⚠️ ' + e.message; });
