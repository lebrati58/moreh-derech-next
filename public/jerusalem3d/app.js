// Moreh Derech NEXT — Jérusalem, Vieille Ville en 3D.
// Données : jerusalem3d/monuments.json (fiches : Drive d'abord) + jerusalem3d/geo.json (géographie réelle,
// générée par tools/build-jerusalem3d.mjs). Aucune coordonnée saisie à la main : tout objet est posé sur un repère
// Wikidata ou sur un tracé OpenStreetMap ; un objet sans repère reste dans la liste, sans position dans la scène.
// Quiz 3D : préparés (API window.MDJerusalem3D) mais NON affichés tant que monuments.quiz3dEnabled === false.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const EXAG = 1.5; // relief exagéré ×1,5 pour la lisibilité (indiqué dans la légende)

const UI = {
  he: { map: 'מפה', title: 'ירושלים · העיר העתיקה', sub: 'שחזור לפי מקורות — לא עיר דמיונית', old: 'שרידים מתקופה קודמת', today: 'קו החומה של היום', exag: 'גובה הקרקע ×1.5', sites: 'אתרים', all: 'כל האתרים בתקופה', noPos: 'ללא מיקום בסצנה', dims: 'ממדים מתועדים', remains: 'מה נשאר היום', debate: 'מחלוקת', other: 'מקורות אחרים', note: 'על הסימון בסצנה', sources: 'מקורות', show: '📍 הראו בסצנה', drive: 'מסמך קורס', primary: 'מקור קדום', online: 'מקור מקוון', period: 'תקופה', list2d: 'מפה דו-ממדית', loadErr: 'לא ניתן לטעון את הנתונים. נסו שוב עם חיבור.', geoMissing: 'נתוני המפה עוד לא נוצרו (geo.json).', noWebgl: 'הטלפון לא תומך בתלת-ממד — מוצגת מפה דו-ממדית.', toggleToday: 'קו החומה של היום', toggle2d: 'דו-ממד / תלת-ממד', home: 'חזרה למבט הכללי', list: 'רשימת האתרים', attr: 'מיקומים: ויקינתונים · תוואים: © תורמי OpenStreetMap · גבהים: ' },
  fr: { map: 'Carte', title: 'Jérusalem · Vieille Ville', sub: 'Reconstitution sourcée — pas une ville imaginaire', old: 'Vestiges d’une période antérieure', today: 'Tracé actuel des murailles', exag: 'Relief ×1,5', sites: 'sites', all: 'Tous les sites de la période', noPos: 'Sans position dans la scène', dims: 'Dimensions documentées', remains: 'Ce qui reste aujourd’hui', debate: 'Débat', other: 'Autre avis', note: 'À propos du repère', sources: 'Sources', show: '📍 Montrer dans la scène', drive: 'Document du cours', primary: 'Source antique', online: 'Source en ligne', period: 'Période', list2d: 'Plan 2D', loadErr: 'Impossible de charger les données. Réessayez avec une connexion.', geoMissing: 'Les données géographiques (geo.json) ne sont pas encore générées.', noWebgl: 'Ce téléphone ne gère pas la 3D — plan 2D affiché.', toggleToday: 'Tracé actuel', toggle2d: '2D / 3D', home: 'Vue d’ensemble', list: 'Liste des sites', attr: 'Positions : Wikidata · Tracés : © contributeurs OpenStreetMap · Relief : ' },
  en: { map: 'Map', title: 'Jerusalem · Old City', sub: 'Source-based reconstruction — not an imaginary city', old: 'Remains from an earlier period', today: 'Today’s wall line', exag: 'Relief ×1.5', sites: 'sites', all: 'All sites in this period', noPos: 'No position in the scene', dims: 'Documented dimensions', remains: 'What remains today', debate: 'Debate', other: 'Other view', note: 'About the marker', sources: 'Sources', show: '📍 Show in scene', drive: 'Course document', primary: 'Ancient source', online: 'Online source', period: 'Period', list2d: '2D plan', loadErr: 'Could not load the data. Try again online.', geoMissing: 'Geographic data (geo.json) not generated yet.', noWebgl: 'This phone does not support 3D — showing the 2D plan.', toggleToday: 'Today’s walls', toggle2d: '2D / 3D', home: 'Overview', list: 'Site list', attr: 'Positions: Wikidata · Lines: © OpenStreetMap contributors · Relief: ' },
  ru: { map: 'Карта', title: 'Иерусалим · Старый город', sub: 'Реконструкция по источникам — не вымышленный город', old: 'Остатки более раннего периода', today: 'Нынешняя линия стен', exag: 'Рельеф ×1,5', sites: 'объектов', all: 'Все объекты периода', noPos: 'Без места в сцене', dims: 'Документированные размеры', remains: 'Что сохранилось', debate: 'Спор', other: 'Другое мнение', note: 'О метке', sources: 'Источники', show: '📍 Показать в сцене', drive: 'Документ курса', primary: 'Древний источник', online: 'Онлайн-источник', period: 'Период', list2d: 'План 2D', loadErr: 'Не удалось загрузить данные.', geoMissing: 'Географические данные (geo.json) ещё не созданы.', noWebgl: 'Телефон не поддерживает 3D — показан план 2D.', toggleToday: 'Нынешние стены', toggle2d: '2D / 3D', home: 'Общий вид', list: 'Список объектов', attr: 'Координаты: Wikidata · Линии: © участники OpenStreetMap · Рельеф: ' }
};
let lang = store.get('mdl_mode_lang', store.get('mdl_lang', 'he')); if (!UI[lang]) lang = 'he';
const t = k => UI[lang][k] || UI.he[k] || k;
const tx = o => (o && (o[lang] || o.he)) || '';

let DATA = null, GEO = null, period = Number(store.get('mdl_j3d_period', '5')) || 5, showToday = store.get('mdl_j3d_today', '1') === '1', selected = null;
let mode2d = false, pickMode = false;

// ---------- géographie : lat/lon → mètres locaux (x = est, z = sud) ----------
let LAT0, LON0, KX, KZ = 110574;
const toXZ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
let demH = null, demMin = 0;
function ground(x, z) {
  if (!GEO || !GEO.dem) return 0;
  const d = GEO.dem, lat = LAT0 - z / KZ, lon = LON0 + x / KX;
  const r = (d.north - lat) / d.stepLat, c = (lon - d.west) / d.stepLon;
  const r0 = Math.max(0, Math.min(d.rows - 2, Math.floor(r))), c0 = Math.max(0, Math.min(d.cols - 2, Math.floor(c)));
  const fr = Math.max(0, Math.min(1, r - r0)), fc = Math.max(0, Math.min(1, c - c0));
  const H = (rr, cc) => { const v = demH[rr * d.cols + cc]; return v == null ? demMin : v; };
  const h = H(r0, c0) * (1 - fr) * (1 - fc) + H(r0, c0 + 1) * (1 - fr) * fc + H(r0 + 1, c0) * fr * (1 - fc) + H(r0 + 1, c0 + 1) * fr * fc;
  return (h - demMin) * EXAG;
}
function anchorXZ(id) { const a = GEO && GEO.anchors && GEO.anchors[id]; return a ? toXZ(a.lat, a.lon) : null; }
function shapeByName(name, kind) { return (GEO.shapes || []).filter(s => s.kind === (kind || 'outline') && s.name === name).sort((a, b) => b.pts.length - a.pts.length)[0] || null; }
// Axes principaux d'un contour (pour aligner Temple, Antonia, Portique royal sur l'esplanade réelle).
function frameOf(shape) {
  const P = shape.pts.map(p => toXZ(p[0], p[1]));
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cz = P.reduce((s, p) => s + p[1], 0) / P.length;
  let sxx = 0, szz = 0, sxz = 0; P.forEach(([x, z]) => { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); });
  let ang = 0.5 * Math.atan2(2 * sxz, sxx - szz); // grand axe
  // on veut l'axe « nord-sud » : celui qui est le plus proche de z
  let ux = Math.cos(ang), uz = Math.sin(ang); if (Math.abs(uz) < Math.abs(ux)) { ang += Math.PI / 2; ux = Math.cos(ang); uz = Math.sin(ang); }
  if (uz < 0) { ux = -ux; uz = -uz; } // u pointe vers le sud
  const vx = -uz, vz = ux; // perpendiculaire (est/ouest)
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  P.forEach(([x, z]) => { const u = (x - cx) * ux + (z - cz) * uz, v = (x - cx) * vx + (z - cz) * vz; umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); });
  return { P, cx, cz, ux, uz, vx, vz, umin, umax, vmin, vmax, rotY: -Math.atan2(uz, ux) + Math.PI / 2 };
}

// ---------- interface ----------
function applyUI() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('bToday').title = t('toggleToday'); $('b2d').title = t('toggle2d'); $('bHome').title = t('home'); $('bList').title = t('list');
  $('bToday').setAttribute('aria-label', t('toggleToday')); $('b2d').setAttribute('aria-label', t('toggle2d')); $('bHome').setAttribute('aria-label', t('home')); $('bList').setAttribute('aria-label', t('list'));
  if (!DATA) return;
  const C = DATA.certainty;
  $('legend').innerHTML = Object.keys(C).map(k => `<span><i style="background:${C[k].color}"></i><em>${esc(tx(C[k].name))}</em></span>`).join('') +
    `<span class="old"><i></i><em>${esc(t('old'))}</em></span><span class="today"><i></i><em>${esc(t('today'))}</em></span><span class="more">${esc(t('exag'))}</span><span class="more attrl">${esc(t('attr') + ((GEO && GEO.dem && GEO.dem.source) || '—'))}</span>`;
  renderStrip(); renderPeriod(); if (selected) openSheet(selected);
}
function renderStrip() {
  $('strip').innerHTML = DATA.periods.map(p => `<button type="button" data-p="${p.n}" aria-pressed="${p.n === period}">${esc(tx(p.name))}<small>${esc(tx(p.dates))}</small></button>`).join('');
  const cur = $('strip').querySelector('[aria-pressed=true]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}
const inPeriod = m => m.from <= period && period <= m.to;
const isNow = m => m.from === period;
function renderPeriod() {
  const p = DATA.periods.find(x => x.n === period);
  $('pName').textContent = tx(p.name); $('pDates').textContent = tx(p.dates);
  $('pCount').textContent = '📋 ' + DATA.monuments.filter(inPeriod).length + ' ' + t('sites');
  document.querySelectorAll('#strip [data-p]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.p) === period)));
  $('bToday').setAttribute('aria-pressed', String(showToday));
  if (mode2d) draw2d(); else rebuildScene();
}
function srcIcon(k) { return k === 'drive' ? '📄' : k === 'primary' ? '📜' : '🌐'; }
function openSheet(id) {
  const m = DATA.monuments.find(x => x.id === id); if (!m) return;
  selected = id; const C = DATA.certainty[m.certainty], p = DATA.periods.find(x => x.n === m.from);
  const sec = (k, v, cls) => v ? (cls ? `<div class="box ${cls}"><b>${esc(t(k))}:</b> ${esc(tx(v))}</div>` : `<div class="k">${esc(t(k))}</div><p>${esc(tx(v))}</p>`) : '';
  $('sBody').innerHTML = `<h2 id="sTitle">${esc(tx(m.name))}</h2>
    <div class="badges"><span class="badge c" style="--c:${C.color}">${esc(tx(C.name))}</span><span class="badge">${esc(t('period'))}: ${esc(tx(p.name))} · ${esc(tx(p.dates))}</span></div>
    <p>${esc(tx(m.text))}</p>${sec('dims', m.dims)}${sec('remains', m.remains)}${sec('debate', m.debate, 'debate')}${sec('other', m.otherView, 'other')}${sec('note', m.placementNote, 'note')}
    <div class="k">${esc(t('sources'))}</div><ul>${m.sources.map(s => `<li>${srcIcon(s.kind)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a> <small style="color:var(--soft)">(${esc(t(s.kind))})</small></li>`).join('')}</ul>
    ${placed.has(id) ? `<div class="acts"><button type="button" id="sShow">${esc(t('show'))}</button></div>` : `<div class="box note">${esc(t('noPos'))}</div>`}`;
  $('sheet').classList.add('open');
  const b = $('sShow'); if (b) b.onclick = () => { $('sheet').classList.remove('open'); flyTo(id); };
  updateLabelSel();
}
function openList() {
  const items = DATA.monuments.filter(inPeriod), C = DATA.certainty;
  selected = null;
  const row = m => `<button type="button" data-id="${m.id}"><i style="background:${isNow(m) ? C[m.certainty].color : '#c9ccd6'}"></i><span>${esc(tx(m.name))}<small>${esc(tx(C[m.certainty].name))}${placed.has(m.id) ? '' : ' · ' + esc(t('noPos'))}</small></span></button>`;
  $('sBody').innerHTML = `<h2 id="sTitle">${esc(t('all'))}</h2><div class="list">${items.filter(isNow).map(row).join('')}${items.filter(m => !isNow(m)).length ? `<div class="k">${esc(t('old'))}</div>` + items.filter(m => !isNow(m)).map(row).join('') : ''}</div>`;
  $('sheet').classList.add('open');
  $('sBody').querySelectorAll('[data-id]').forEach(b => b.onclick = () => openSheet(b.dataset.id));
}
$('sClose').onclick = () => { $('sheet').classList.remove('open'); selected = null; updateLabelSel(); };
$('strip').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; period = Number(b.dataset.p); store.set('mdl_j3d_period', String(period)); $('sheet').classList.remove('open'); selected = null; renderPeriod(); if (!mode2d && camera) homeView(true); });
$('pCount').onclick = openList; $('bList').onclick = openList;
$('bToday').onclick = () => { showToday = !showToday; store.set('mdl_j3d_today', showToday ? '1' : '0'); renderPeriod(); };
$('legend').onclick = () => $('legend').classList.toggle('full');
$('bHome').onclick = () => { if (!mode2d) homeView(true); };
$('b2d').onclick = () => setMode2d(!mode2d);
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { lang = b.dataset.lang; store.set('mdl_mode_lang', lang); applyUI(); });

// ---------- scène 3D ----------
let renderer, scene, camera, controls, world, labelsEl = $('labels'), labels = [], pickables = [], placed = new Set(), raf = 0;
const MAT = {};
function mat(color, opts) { const k = color + JSON.stringify(opts || {}); return MAT[k] || (MAT[k] = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}))); }
function webglOK() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
function init3d() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  $('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#9fc3e6'); scene.fog = new THREE.Fog('#9fc3e6', 1800, 4200);
  camera = new THREE.PerspectiveCamera(45, 1, 2, 9000);
  scene.add(new THREE.HemisphereLight('#ffffff', '#6b5a40', 1.1));
  const sun = new THREE.DirectionalLight('#fff3dd', 1.6); sun.position.set(-600, 900, -300); scene.add(sun);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 60; controls.maxDistance = 3500; controls.screenSpacePanning = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  buildTerrain();
  world = new THREE.Group(); scene.add(world);
  // sélection par toucher
  const ray = new THREE.Raycaster(), v = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const r = renderer.domElement.getBoundingClientRect(); v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, camera); const hit = ray.intersectObjects(pickables, false)[0];
    if (hit && hit.object.userData.id) { document.dispatchEvent(new CustomEvent('mdj3d-pick', { detail: hit.object.userData.id })); if (!pickMode) openSheet(hit.object.userData.id); }
  });
  window.addEventListener('resize', resize); resize(); homeView(false); loop();
}
function resize() { if (!renderer) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1 ? 62 : 45; camera.updateProjectionMatrix(); }
function buildTerrain() {
  const d = GEO.dem, g = new THREE.BufferGeometry(), pos = [], col = [], idx = [];
  const hmax = Math.max(...demH.filter(v => v != null)), lo = new THREE.Color('#8d7a5a'), mid = new THREE.Color('#c9b48a'), hi = new THREE.Color('#e9dcbc'), c = new THREE.Color();
  for (let r = 0; r < d.rows; r++) for (let k = 0; k < d.cols; k++) {
    const [x, z] = toXZ(d.north - r * d.stepLat, d.west + k * d.stepLon), hv = demH[r * d.cols + k] ?? demMin, f = (hv - demMin) / Math.max(1, hmax - demMin);
    pos.push(x, (hv - demMin) * EXAG, z);
    if (f < 0.5) c.copy(lo).lerp(mid, f * 2); else c.copy(mid).lerp(hi, (f - 0.5) * 2); col.push(c.r, c.g, c.b);
  }
  for (let r = 0; r < d.rows - 1; r++) for (let k = 0; k < d.cols - 1; k++) { const a = r * d.cols + k, b = a + 1, cc = a + d.cols, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
}
function homeView(anim) {
  // Cadrage sur les sites de la période affichée (repères Wikidata) ; sinon centre de la Vieille Ville.
  const pts = DATA.monuments.filter(m => isNow(m) && m.anchor && anchorXZ(m.anchor)).map(m => anchorXZ(m.anchor));
  const a = anchorXZ('jaffa_gate'), b = anchorXZ('lions_gate');
  if (pts.length < 2 && a && b) pts.push(a, b);
  const c = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [0, 0];
  const spread = Math.max(150, ...pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])));
  const dist = Math.max(650, Math.min(2100, spread * 3.2)), gy = ground(c[0], c[1]);
  const target = new THREE.Vector3(c[0], gy, c[1] + 40), eye = new THREE.Vector3(c[0] - dist * 0.08, gy + dist * 0.68, c[1] + dist * 0.72);
  if (anim) tween(eye, target); else { camera.position.copy(eye); controls.target.copy(target); controls.update(); }
}
let tw = null;
function tween(eye, target) { tw = { t0: performance.now(), dur: 900, e0: camera.position.clone(), t0v: controls.target.clone(), e1: eye, t1: target }; }
function flyTo(id) {
  const o = pickables.find(p => p.userData.id === id); if (!o || mode2d) return;
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), s = Math.max(60, b.getSize(new THREE.Vector3()).length());
  tween(new THREE.Vector3(c.x - s * 1.4, c.y + s * 1.3, c.z + s * 1.6), c); highlight(id);
}
let hl = null;
function highlight(id) {
  if (hl) { hl.forEach(o => { o.material = o.userData.baseMat; }); hl = null; }
  if (!id) return; hl = pickables.filter(p => p.userData.id === id);
  hl.forEach(o => { o.material = mat('#ffffff', { emissive: '#ffd878', emissiveIntensity: 0.6 }); });
  selected = id; updateLabelSel();
}
function clearWorld() { while (world.children.length) { const o = world.children.pop(); o.geometry && o.geometry.dispose && o.geometry.dispose(); } pickables = []; placed = new Set(); labels.forEach(l => l.el.remove()); labels = []; hl = null; }
function add(mesh, m, now) { mesh.userData = { id: m.id, baseMat: mesh.material }; world.add(mesh); pickables.push(mesh); placed.add(m.id); return mesh; }
function label(m, x, y, z, now, stack) {
  const el = document.createElement('div'); el.className = 'lb' + (now ? '' : ' old'); el.textContent = tx(m.name);
  el.style.setProperty('--c', now ? DATA.certainty[m.certainty].color : '#c9ccd6'); el.onclick = () => openSheet(m.id); labelsEl.appendChild(el);
  labels.push({ el, p: new THREE.Vector3(x, y, z), id: m.id, dy: stack * 24 });
}
function updateLabelSel() { labels.forEach(l => l.el.classList.toggle('sel', l.id === selected)); }
// sommet de l'esplanade : même calcul que le volume « osm » du mont du Temple (h = 12 → +4,8)
const tmTop = f => ground(f.cx, f.cz) + 12 * 0.4;
function cub(v, unit) { return unit === 'cubit' ? v * DATA.cubitMeters : v; }
function box(w, h, d, color, x, y, z, rotY, opts) { const g = new THREE.BoxGeometry(w, h, d); const o = new THREE.Mesh(g, mat(color, opts)); o.position.set(x, y + h / 2, z); if (rotY) o.rotation.y = rotY; return o; }
function rebuildScene() {
  if (!world) return; clearWorld();
  const C = DATA.certainty, stackAt = {};
  // tracé actuel des murailles (référence, en pointillé)
  const walls = (GEO.shapes || []).filter(s => s.kind === 'wall');
  if (showToday && period !== 11) {
    const pts = []; walls.forEach(s => { for (let i = 1; i < s.pts.length; i++) { const [x1, z1] = toXZ(...s.pts[i - 1]), [x2, z2] = toXZ(...s.pts[i]); pts.push(x1, ground(x1, z1) + 3, z1, x2, ground(x2, z2) + 3, z2); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 8, gapSize: 6 })); l.computeLineDistances(); world.add(l);
  }
  const tm = shapeByName('Temple Mount'), TMF = tm ? frameOf(tm) : null;
  for (const m of DATA.monuments.filter(inPeriod)) {
    const now = isNow(m), color = now ? C[m.certainty].color : '#c9ccd6', glass = { transparent: m.certainty !== 'attested', opacity: m.certainty === 'hypothesis' ? 0.55 : 0.8 };
    let sh = m.shape || {}, at = m.anchor ? anchorXZ(m.anchor) : null, top = null;
    if (sh.type === 'none') continue;
    if (sh.type === 'osm' && tm) {
      const f = TMF, s = new THREE.Shape(f.P.map(([x, z]) => new THREE.Vector2(x, -z)));
      const base = Math.min(...f.P.map(([x, z]) => ground(x, z))), topY = ground(f.cx, f.cz) + sh.h * 0.4;
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(4, topY - base), bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
      add(new THREE.Mesh(g, mat(now ? '#d9c9a3' : '#cfc7b4')), m, now); top = [f.cx, topY + 8, f.cz];
      if (now) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color })); world.add(e); }
    } else if (sh.type === 'osmwalls') {
      const inst = []; walls.forEach(s => { for (let i = 1; i < s.pts.length; i++) inst.push([toXZ(...s.pts[i - 1]), toXZ(...s.pts[i])]); });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(color), inst.length), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      inst.forEach(([[x1, z1], [x2, z2]], i) => { const len = Math.hypot(x2 - x1, z2 - z1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, gy = Math.min(ground(x1, z1), ground(x2, z2));
        q.setFromAxisAngle(up, -Math.atan2(z2 - z1, x2 - x1)); M4.compose(new THREE.Vector3(mx, gy + sh.h / 2, mz), q, new THREE.Vector3(len + 1.5, sh.h, 3.5)); im.setMatrixAt(i, M4); });
      add(im, m, now);
      const jg = anchorXZ('jaffa_gate'); if (jg) top = [jg[0], ground(...jg) + 30, jg[1] + 40];
    } else if (sh.type === 'osmfoot' && shapeByName(sh.match)) {
      const f = frameOf(shapeByName(sh.match)), sp = new THREE.Shape(f.P.map(([x, z]) => new THREE.Vector2(x, -z)));
      const y = TMF && sh.match !== 'Church of the Holy Sepulchre' ? tmTop(TMF) : Math.min(...f.P.map(([x, z]) => ground(x, z)));
      const g = new THREE.ExtrudeGeometry(sp, { depth: sh.h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
      add(new THREE.Mesh(g, mat(color)), m, now); top = [f.cx, y + sh.h + 8, f.cz];
    } else if (sh.type === 'edge' && TMF) {
      const f = TMF, len = f.vmax - f.vmin, cx = f.cx + f.ux * (f.umax - sh.w / 2) + f.vx * (f.vmin + f.vmax) / 2, cz = f.cz + f.uz * (f.umax - sh.w / 2) + f.vz * (f.vmin + f.vmax) / 2;
      const y = ground(f.cx, f.cz) + 4, o = box(len * 0.92, sh.h, sh.w, color, cx, y, cz, f.rotY + Math.PI / 2, glass); add(o, m, now); top = [cx, y + sh.h + 6, cz];
    } else if (at) {
      let [x, z] = at; const gy = ground(x, z), rot = (sh.alignTo && TMF) ? TMF.rotY : 0;
      if (sh.type === 'marker' || sh.type === 'osmfoot') { const o = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 22, 10), mat(color)); o.position.set(x, gy + 11, z); add(o, m, now); const s = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 10), mat(color)); s.position.set(x, gy + 25, z); add(s, m, now); top = [x, gy + 32, z]; }
      else if (sh.type === 'gate') { add(box(14, 13, 14, color, x, gy, z), m, now); top = [x, gy + 20, z]; }
      else if (sh.type === 'tower' || sh.type === 'block' || sh.type === 'fortress') {
        const w = cub(sh.w, sh.unit), d = cub(sh.d, sh.unit), h = sh.unit === 'm_cubit' ? sh.h * DATA.cubitMeters : cub(sh.h, sh.unit);
        const y = sh.alignTo === 'temple_mount' && TMF ? tmTop(TMF) : gy;
        add(box(w, h, d, color, x, y, z, rot, m.certainty === 'attested' ? null : glass), m, now); top = [x, y + h + 6, z];
      } else if (sh.type === 'wall') { add(box(sh.len, sh.h, sh.w, color, x, gy, z, 0), m, now); top = [x, gy + sh.h + 8, z]; }
      else if (sh.type === 'platform') {
        const from = anchorXZ(sh.fromAnchor) || at, cx = from[0], cz = from[1] + sh.d / 2 + 15;
        add(box(sh.w, sh.h, sh.d, color, cx, ground(cx, cz), cz, 0, glass), m, now); top = [cx, ground(cx, cz) + sh.h + 10, cz];
      } else if (sh.type === 'dome') {
        const dsh = sh.match && shapeByName(sh.match); if (dsh) { const f = frameOf(dsh); x = f.cx; z = f.cz; sh = Object.assign({}, sh, { r: Math.max(f.umax - f.umin, f.vmax - f.vmin) / 2 }); }
        const y = TMF ? tmTop(TMF) : gy, o = new THREE.Mesh(new THREE.CylinderGeometry(sh.r, sh.r, sh.h * 0.45, 8), mat(color)); o.position.set(x, y + sh.h * 0.225, z); add(o, m, now);
        const dm = new THREE.Mesh(new THREE.SphereGeometry(sh.r * 0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(now ? '#e8c45a' : '#c9ccd6')); dm.position.set(x, y + sh.h * 0.45 + sh.h * 0.12, z); dm.scale.y = 1.3; add(dm, m, now);
        const dr = new THREE.Mesh(new THREE.CylinderGeometry(sh.r * 0.42, sh.r * 0.42, sh.h * 0.12, 16), mat(color)); dr.position.set(x, y + sh.h * 0.51, z); add(dr, m, now); top = [x, y + sh.h + 8, z];
      }
    }
    if (top) { const k = top.map(v => Math.round(v / 25)).join(','); stackAt[k] = (stackAt[k] || 0) + 1; label(m, top[0], top[1], top[2], now, stackAt[k] - 1); }
  }
  updateLabelSel();
}
const vtmp = new THREE.Vector3();
function loop() {
  raf = requestAnimationFrame(loop);
  if (tw) { const k = Math.min(1, (performance.now() - tw.t0) / tw.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; camera.position.lerpVectors(tw.e0, tw.e1, e); controls.target.lerpVectors(tw.t0v, tw.t1, e); if (k >= 1) tw = null; }
  if (mode2d) return;
  controls.update(); renderer.render(scene, camera);
  const w = innerWidth, h = innerHeight;
  for (const l of labels) {
    vtmp.copy(l.p).project(camera);
    const vis = vtmp.z < 1 && vtmp.x > -1.1 && vtmp.x < 1.1 && vtmp.y > -1.1 && vtmp.y < 1.1;
    l.el.style.display = vis ? '' : 'none';
    if (vis) l.el.style.transform = `translate(-50%,-100%) translate(${((vtmp.x + 1) / 2 * w).toFixed(1)}px,${((1 - vtmp.y) / 2 * h - l.dy).toFixed(1)}px)`, l.el.style.left = '0', l.el.style.top = '0';
  }
}

// ---------- plan 2D (sans WebGL, ou au choix) ----------
function setMode2d(v) {
  mode2d = v; document.body.classList.toggle('mode2d', v); $('b2d').setAttribute('aria-pressed', String(v));
  labels.forEach(l => l.el.style.display = v ? 'none' : ''); if (v) draw2d(); else { if (!renderer) init3d(); rebuildScene(); }
}
let vb = null;
function draw2d() {
  const svg = $('plan2d'), C = DATA.certainty, P = [];
  const all = []; (GEO.shapes || []).forEach(s => s.pts.forEach(p => all.push(toXZ(...p))));
  Object.values(GEO.anchors || {}).forEach(a => all.push(toXZ(a.lat, a.lon)));
  if (!vb) { const xs = all.map(p => p[0]), zs = all.map(p => p[1]); const x0 = Math.min(...xs) - 120, z0 = Math.min(...zs) - 160, x1 = Math.max(...xs) + 120, z1 = Math.max(...zs) + 320; vb = [x0, z0, x1 - x0, z1 - z0]; }
  svg.setAttribute('viewBox', vb.join(' '));
  const poly = (s, st) => `<polyline points="${s.pts.map(p => toXZ(...p).map(v => v.toFixed(1)).join(',')).join(' ')}" ${st}/>`;
  (GEO.shapes || []).filter(s => s.kind === 'wall').forEach(s => P.push(poly(s, `fill="none" stroke="${period === 11 ? C.attested.color : '#ffffff'}" stroke-width="${period === 11 ? 6 : 2}" ${period === 11 || !showToday ? '' : 'stroke-dasharray="8 6"'} opacity="${period === 11 || showToday ? 1 : 0}"`)));
  const tm = shapeByName('Temple Mount');
  for (const m of DATA.monuments.filter(inPeriod)) {
    const now = isNow(m), col = now ? C[m.certainty].color : '#c9ccd6', sh = m.shape || {};
    const foot = (sh.type === 'osmfoot' || sh.type === 'dome') && sh.match && shapeByName(sh.match);
    if (foot) P.push(`<g data-id="${m.id}">${poly(foot, `fill="${col}" fill-opacity=".8" stroke="#0b1230" stroke-width="2"`)}</g>`);
    if (sh.type === 'osm' && tm) { P.push(`<g data-id="${m.id}">${poly(tm, `fill="${now ? '#d9c9a3' : '#8f8a7c'}" stroke="${col}" stroke-width="3"`)}</g>`); continue; }
    const at = sh.type === 'platform' ? (() => { const f = anchorXZ(sh.fromAnchor); return f ? [f[0], f[1] + sh.d / 2 + 15] : null; })() : (m.anchor ? anchorXZ(m.anchor) : (sh.type === 'edge' && tm ? (() => { const f = frameOf(tm); return [f.cx + f.ux * f.umax, f.cz + f.uz * f.umax]; })() : null));
    if (!at || sh.type === 'none' || sh.type === 'osmwalls') continue;
    placed.add(m.id);
    P.push(sh.type === 'platform' ? `<rect data-id="${m.id}" x="${at[0] - sh.w / 2}" y="${at[1] - sh.d / 2}" width="${sh.w}" height="${sh.d}" fill="${col}" fill-opacity=".45" stroke="${col}" stroke-width="2"/>`
      : `<circle data-id="${m.id}" cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="13" fill="${col}" stroke="#0b1230" stroke-width="4"/>`);
    P.push(`<text data-id="${m.id}" x="${at[0].toFixed(1)}" y="${(at[1] - 20).toFixed(1)}" text-anchor="middle" font-size="30" font-weight="800" fill="#fff" stroke="#0b1230" stroke-width="5" paint-order="stroke">${esc(tx(m.name))}</text>`);
  }
  svg.innerHTML = P.join('');
}
$('plan2d').addEventListener('click', e => { const g = e.target.closest('[data-id]'); if (g) openSheet(g.dataset.id); });
// zoom / déplacement du plan 2D (molette, pincement, glisser)
(function () {
  const svg = $('plan2d'), pts = new Map(); let last = null;
  const toUser = (cx, cy) => { const r = svg.getBoundingClientRect(), s = Math.max(vb[2] / r.width, vb[3] / r.height); return [vb[0] + (cx - r.left) * s, vb[1] + (cy - r.top) * s, s]; };
  svg.addEventListener('wheel', e => { e.preventDefault(); const [ux, uy] = toUser(e.clientX, e.clientY), k = e.deltaY > 0 ? 1.15 : 1 / 1.15; vb = [ux - (ux - vb[0]) * k, uy - (uy - vb[1]) * k, vb[2] * k, vb[3] * k]; svg.setAttribute('viewBox', vb.join(' ')); }, { passive: false });
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    const s = toUser(0, 0)[2];
    if (pts.size === 1) { vb[0] -= (e.clientX - prev[0]) * s; vb[1] -= (e.clientY - prev[1]) * s; }
    else if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (last) { const k = last / d, [ux, uy] = toUser((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); vb = [ux - (ux - vb[0]) * k, uy - (uy - vb[1]) * k, vb[2] * k, vb[3] * k]; } last = d; }
    svg.setAttribute('viewBox', vb.join(' '));
  });
  const up = e => { pts.delete(e.pointerId); last = null; }; svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
})();

// ---------- API préparée pour les futurs quiz 3D (phase 2 — non affichée) ----------
window.MDJerusalem3D = {
  get quizEnabled() { return !!(DATA && DATA.quiz3dEnabled === true); },
  setPeriod(n) { period = n; renderPeriod(); },
  flyTo, highlight, openSheet,
  monument: id => DATA && DATA.monuments.find(m => m.id === id),
  // Pour une question « localisation » : appelle cb(id) au prochain toucher d'un monument.
  pickOnce(cb) { pickMode = true; const h = e => { pickMode = false; document.removeEventListener('mdj3d-pick', h); cb(e.detail); }; document.addEventListener('mdj3d-pick', h); }
};

// ---------- démarrage ----------
Promise.all([fetch('jerusalem3d/monuments.json', { cache: 'no-cache' }).then(r => r.json()), fetch('jerusalem3d/geo.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)])
  .then(([d, g]) => {
    DATA = d; GEO = g;
    const q = new URLSearchParams(location.search), qp = Number(q.get('period')); if (qp >= 1 && qp <= 11) period = qp;
    if (!DATA.periods.some(p => p.n === period)) period = 5;
    if (!GEO || !GEO.dem) { $('msg').textContent = t('geoMissing'); applyUI(); return; }
    LAT0 = (GEO.box.n + GEO.box.s) / 2; LON0 = (GEO.box.e + GEO.box.w) / 2; KX = 111320 * Math.cos(LAT0 * Math.PI / 180);
    demH = GEO.dem.heights; demMin = Math.min(...demH.filter(v => v != null));
    $('msg').style.display = 'none';
    const want2d = q.get('view') === '2d' || !webglOK();
    if (!want2d) init3d();
    applyUI();
    if (want2d) { setMode2d(true); if (!webglOK()) { $('msg').style.display = ''; $('msg').textContent = t('noWebgl'); setTimeout(() => $('msg').style.display = 'none', 2500); } }
    const id = q.get('site'); if (id) setTimeout(() => { openSheet(id); flyTo(id); }, 400);
  })
  .catch(e => { console.error(e); $('msg').textContent = t('loadErr'); });
