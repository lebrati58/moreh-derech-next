// Moreh Derech NEXT — sites archéologiques en 3D (Massada, Césarée, Beit Shean).
// Même principe que Jérusalem 3D : relief réel (SRTM), positions réelles (Wikipédia/Wikidata, OpenStreetMap), fiches sourcées
// (cours d'abord), trois niveaux de certitude. Données : sites3d/<site>/site.json (fiches) + sites3d/<site>/geo.json (géographie).
import { renderTimeline, markTimeline, pickStyle } from '../era-timeline.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import * as JM from '../jerusalem3d/models.js';
import * as SM from './models.js';
import { stone, flat, groundMaterial } from '../jerusalem3d/materials.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
const QS = new URLSearchParams(location.search);
const SITE = (QS.get('site') || 'masada').replace(/[^a-z]/g, '');

const UI = {
  he: { map: 'מפה', sub: 'שחזור לפי מקורות — לא אתר דמיוני', sites: 'אתרים', all: 'כל האתרים בתקופה', old: 'שרידים מתקופה קודמת', period: 'תקופה', sources: 'מקורות', drive: 'מסמך קורס', primary: 'מקור קדום', online: 'מקור מקוון', show: '📍 הראו בסצנה', dims: 'ממדים מתועדים', remains: 'מה נשאר היום', debate: 'מחלוקת', other: 'מקורות אחרים', note: 'על הסימון בסצנה', function: 'תפקיד', events: 'אירועים', builtBy: 'נבנה בידי', schem: 'מידות לפי המקורות; פרטים משוחזרים', noPos: 'ללא מיקום בסצנה', home: 'חזרה למבט הכללי', list: 'רשימת האתרים', tools: 'כלים', colors: 'צבעים לפי ודאות / חומרים מציאותיים', quality: 'איכות תצוגה: גבוהה / חסכונית', preparing: 'מכין את התלת-ממד…', loadErr: 'לא ניתן לטעון את הנתונים. נסו שוב עם חיבור.', geoMissing: 'נתוני המפה של האתר עוד לא נוצרו.', noWebgl: 'הטלפון לא תומך בתלת-ממד.', prevP: 'התקופה הקודמת', nextP: 'התקופה הבאה', pickP: 'בחירת תקופה', exag: 'תבליט אמיתי (SRTM 30 מ׳)', attr: 'מיקומים: ויקינתונים · תוואים: © תורמי OpenStreetMap · גבהים: ', otherSites: 'אתרים נוספים בתלת-ממד' },
  fr: { map: 'Carte', sub: 'Reconstitution sourcée — pas un site imaginaire', sites: 'sites', all: 'Tous les sites de la période', old: 'Vestiges d’une période antérieure', period: 'Période', sources: 'Sources', drive: 'Document du cours', primary: 'Source antique', online: 'Source en ligne', show: '📍 Montrer dans la scène', dims: 'Dimensions documentées', remains: 'Ce qui reste aujourd’hui', debate: 'Débat', other: 'Autre avis', note: 'À propos du repère', function: 'Fonction', events: 'Événements', builtBy: 'Bâti par', schem: 'Dimensions d’après les sources ; détails reconstitués', noPos: 'Sans position dans la scène', home: 'Vue d’ensemble', list: 'Liste des sites', tools: 'Outils', colors: 'Couleurs de certitude / matériaux réalistes', quality: 'Qualité : haute / économe', preparing: 'Préparation de la 3D…', loadErr: 'Impossible de charger les données. Réessayez avec une connexion.', geoMissing: 'La géographie de ce site n’est pas encore générée.', noWebgl: 'Ce téléphone ne gère pas la 3D.', prevP: 'Époque précédente', nextP: 'Époque suivante', pickP: 'Choisir l’époque', exag: 'Relief réel (SRTM 30 m)', attr: 'Positions : Wikidata · Tracés : © contributeurs OpenStreetMap · Relief : ', otherSites: 'Autres sites en 3D' },
  en: { map: 'Map', sub: 'Source-based reconstruction — not an imaginary site', sites: 'sites', all: 'All sites in this period', old: 'Remains from an earlier period', period: 'Period', sources: 'Sources', drive: 'Course document', primary: 'Ancient source', online: 'Online source', show: '📍 Show in scene', dims: 'Documented dimensions', remains: 'What remains today', debate: 'Debate', other: 'Other view', note: 'About the marker', function: 'Function', events: 'Events', builtBy: 'Built by', schem: 'Dimensions from the sources; details reconstructed', noPos: 'No position in the scene', home: 'Overview', list: 'Site list', tools: 'Tools', colors: 'Certainty colours / realistic materials', quality: 'Quality: high / light', preparing: 'Preparing the 3D view…', loadErr: 'Could not load the data. Try again online.', geoMissing: 'The geography of this site has not been generated yet.', noWebgl: 'This phone does not support 3D.', prevP: 'Previous period', nextP: 'Next period', pickP: 'Choose the period', exag: 'True relief (SRTM 30 m)', attr: 'Positions: Wikidata · Lines: © OpenStreetMap contributors · Relief: ', otherSites: 'Other 3D sites' },
  ru: { map: 'Карта', sub: 'Реконструкция по источникам — не вымышленное место', sites: 'объектов', all: 'Все объекты периода', old: 'Остатки более раннего периода', period: 'Период', sources: 'Источники', drive: 'Документ курса', primary: 'Древний источник', online: 'Онлайн-источник', show: '📍 Показать в сцене', dims: 'Документированные размеры', remains: 'Что сохранилось', debate: 'Спор', other: 'Другое мнение', note: 'О метке', function: 'Назначение', events: 'События', builtBy: 'Построено', schem: 'Размеры по источникам; детали реконструированы', noPos: 'Без места в сцене', home: 'Общий вид', list: 'Список объектов', tools: 'Инструменты', colors: 'Цвета достоверности / реальные материалы', quality: 'Качество: высокое / экономное', preparing: 'Подготовка 3D…', loadErr: 'Не удалось загрузить данные.', geoMissing: 'География этого места ещё не создана.', noWebgl: 'Телефон не поддерживает 3D.', prevP: 'Предыдущая эпоха', nextP: 'Следующая эпоха', pickP: 'Выбрать эпоху', exag: 'Реальный рельеф (SRTM 30 м)', attr: 'Координаты: Wikidata · Линии: © участники OpenStreetMap · Рельеф: ', otherSites: 'Другие места в 3D' }
};
let lang = store.get('mdl_mode_lang', store.get('mdl_lang', 'he')); if (!UI[lang]) lang = 'he';
const t = k => UI[lang][k] || UI.he[k] || k;
const tx = o => (o && (o[lang] || o.he)) || '';

let DATA = null, GEO = null, period = 0, selected = null;
let quality = QS.get('q') || store.get('mdl_j3d_q', (window.matchMedia && matchMedia('(pointer:coarse)').matches) ? 'low' : 'high');
let realistic = store.get('mdl_j3d_real', '1') === '1';
let LAT0, LON0, KX, KZ = 110574, demH = null, demMin = 0, seaY = null;
const toXZ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
function ground(x, z) {
  const d = GEO.dem, lat = LAT0 - z / KZ, lon = LON0 + x / KX;
  const r = (d.north - lat) / d.stepLat, c = (lon - d.west) / d.stepLon;
  const r0 = Math.max(0, Math.min(d.rows - 2, Math.floor(r))), c0 = Math.max(0, Math.min(d.cols - 2, Math.floor(c)));
  const fr = Math.max(0, Math.min(1, r - r0)), fc = Math.max(0, Math.min(1, c - c0));
  const H = (rr, cc) => { const v = demH[rr * d.cols + cc]; return v == null ? demMin : v; };
  return H(r0, c0) * (1 - fr) * (1 - fc) + H(r0, c0 + 1) * (1 - fr) * fc + H(r0 + 1, c0) * fr * (1 - fc) + H(r0 + 1, c0 + 1) * fr * fc - demMin;
}

// ---------- positions : repères, formes OpenStreetMap, coordonnées publiées ----------
function anchorXZ(id) { const a = GEO.anchors && GEO.anchors[id]; return a ? toXZ(a.lat, a.lon) : null; }
function osmShapes(key) {
  const sel = typeof key === 'string' ? (DATA.osm || {})[key] : key; if (!sel) return [];
  return (GEO.shapes || []).filter(s => (!sel.osm || s.osm === sel.osm || (Array.isArray(sel.osm) && sel.osm.includes(s.osm))) && (!sel.name || new RegExp(sel.name, 'i').test(s.name + ' ' + s.he)) && (!sel.tag || sel.tag.split('&').every(kv => { const [k, v] = kv.split('='); return v == null ? s.tags[k] != null : new RegExp('^(' + v + ')$').test(String(s.tags[k])); })));
}
const xzPts = s => s.pts.map(p => toXZ(p[0], p[1]));
function area(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a / 2); }
function inside(P, x, z) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function centroid(P) { return [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length]; }
function biggest(key) { const S = osmShapes(key).map(xzPts); return S.sort((a, b) => (area(b) || b.length) - (area(a) || a.length))[0] || null; }
// ajustement d'une forme OSM : centre, axe principal (ACP), étendues le long de l'axe et en travers
function fit(P) {
  const Q = P.length > 2 && P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1] ? P.slice(0, -1) : P, [cx, cz] = centroid(Q);
  let sxx = 0, szz = 0, sxz = 0; Q.forEach(([x, z]) => { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); });
  const a = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(a), uz = Math.sin(a), px = -uz, pz = ux;
  const al = Q.map(([x, z]) => (x - cx) * ux + (z - cz) * uz), pe = Q.map(([x, z]) => (x - cx) * px + (z - cz) * pz);
  return { c: [cx, cz], u: [ux, uz], p: [px, pz], a: [Math.min(...al), Math.max(...al)], b: [Math.min(...pe), Math.max(...pe)], pts: Q };
}
function wpt(tok) {
  if (!tok) return null;
  if (typeof tok === 'object') {
    if (tok.ll) return toXZ(tok.ll[0], tok.ll[1]);
    if (tok.off) { const b = wpt(tok.off); return b ? [b[0] + (tok.dx || 0), b[1] + (tok.dz || 0)] : null; }
    return null;
  }
  if (tok.startsWith('a:')) return anchorXZ(tok.slice(2));
  if (tok.startsWith('o:')) { const key = tok.slice(2), sel = (DATA.osm || {})[key] || {}, P = biggest(key); if (!P) return null;
    if (sel.end) { const f = { west: p => p[0], east: p => -p[0], north: p => p[1], south: p => -p[1] }[sel.end]; return [P[0], P.at(-1)].sort((p, q) => f(p) - f(q))[0]; } // extrémité d'une ligne
    return centroid(P.length > 2 && P[0][0] === P.at(-1)[0] ? P.slice(0, -1) : P); }
  return null;
}
const bearingVec = deg => [Math.sin(deg * Math.PI / 180), -Math.cos(deg * Math.PI / 180)]; // cap (0 = nord) → vecteur xz
const yawFor = deg => -deg * Math.PI / 180; // modèle construit « regardant le nord » → tourné vers le cap

// ---------- interface ----------
function applyUI() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  for (const [b, k] of [['bHome', 'home'], ['bList', 'list'], ['bMenu', 'tools'], ['bColors', 'colors'], ['bQual', 'quality']]) { $(b).title = t(k); $(b).setAttribute('aria-label', t(k)); }
  for (const [b, k] of [['bColors', 'colors'], ['bQual', 'quality']]) { const el = $(b).querySelector('.tl'); if (el) el.textContent = t(k); }
  $('bQual').querySelector('.ti').textContent = quality === 'high' ? 'HD' : 'SD'; $('bColors').setAttribute('aria-pressed', String(!realistic));
  if (!DATA) return;
  document.title = tx(DATA.title) + ' — Moreh Derech NEXT'; $('title').textContent = tx(DATA.title);
  const C = DATA.certainty;
  $('legend').innerHTML = Object.keys(C).map(k => `<span><i style="background:${C[k].color}"></i><em>${esc(tx(C[k].name))}</em></span>`).join('') +
    `<span class="old"><i></i><em>${esc(t('old'))}</em></span><span class="more">${esc(t('exag'))}</span><span class="more attrl">${esc(t('attr') + ((GEO && GEO.dem && GEO.dem.source) || '—'))}</span>`;
  $('others').innerHTML = `<b>${esc(t('otherSites'))}</b>` + [['jerusalem3d.html?period=5', { he: 'ירושלים', fr: 'Jérusalem', en: 'Jerusalem', ru: 'Иерусалим' }], ...Object.entries(DATA.otherSites || {}).filter(([k]) => k !== SITE).map(([k, n]) => ['site3d.html?site=' + k, n])].map(([h, n]) => `<a href="${h}">🏛️ ${esc(tx(n))}</a>`).join('');
  renderStrip(); renderPeriod(); if (selected) openSheet(selected);
}
function renderStrip() {
  renderTimeline($('strip'), DATA.periods, period, tx, esc, ({ he: 'ציר הזמן', fr: 'le temps', en: 'time', ru: 'время' })[lang]);
  const cur = $('strip').querySelector('[aria-pressed=true]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}
const inPeriod = m => m.from <= period && period <= m.to;
const isNow = m => m.from === period;
function renderPeriod() {
  const p = DATA.periods.find(x => x.n === period);
  $('pName').textContent = tx(p.name); $('pDates').textContent = tx(p.dates);
  $('pCount').textContent = '📋 ' + DATA.monuments.filter(inPeriod).length + ' ' + t('sites');
  markTimeline($('strip'), $('pBig'), DATA.periods, period);
  const ns = DATA.periods.map(x => x.n), i = ns.indexOf(period), rtl = document.documentElement.dir === 'rtl';
  $('pPrev').textContent = rtl ? '›' : '‹'; $('pNext').textContent = rtl ? '‹' : '›'; $('pPrev').disabled = i <= 0; $('pNext').disabled = i >= ns.length - 1;
  $('pPrev').setAttribute('aria-label', t('prevP')); $('pNext').setAttribute('aria-label', t('nextP')); $('pBig').title = t('pickP');
  if (renderer) rebuildScene();
}
function srcIcon(k) { return k === 'drive' ? '📄' : k === 'primary' ? '📜' : '🌐'; }
function openSheet(id) {
  const m = DATA.monuments.find(x => x.id === id); if (!m) return;
  selected = id; const C = DATA.certainty[m.certainty], p = DATA.periods.find(x => x.n === m.from);
  const sec = (k, v, cls) => v ? (cls ? `<div class="box ${cls}"><b>${esc(t(k))}:</b> ${esc(tx(v))}</div>` : `<div class="k">${esc(t(k))}</div><p>${esc(tx(v))}</p>`) : '';
  const alt = lang === 'he' ? m.name.fr : m.name.he;
  $('sBody').innerHTML = `<h2 id="sTitle">${esc(tx(m.name))}</h2><div class="altname" lang="${lang === 'he' ? 'fr' : 'he'}" dir="${lang === 'he' ? 'ltr' : 'rtl'}">${esc(alt)}</div>
    <div class="badges"><span class="badge c" style="--c:${C.color}">${esc(tx(C.name))}</span><span class="badge">${esc(t('period'))}: ${esc(tx(p.name))} · ${esc(tx(p.dates))}</span></div>
    ${m.builder ? `<div class="box built">🏗️ <b>${esc(t('builtBy'))}:</b> ${esc(tx(m.builder))}</div>` : ''}<p>${esc(tx(m.text))}</p>${sec('function', m.function)}${sec('events', m.events)}${sec('dims', m.dims)}${sec('remains', m.remains)}${sec('debate', m.debate, 'debate')}${sec('other', m.otherView, 'other')}${sec('note', m.placementNote, 'note')}${m.schematic ? `<div class="box note">📐 ${esc(t('schem'))}</div>` : ''}
    <div class="k">${esc(t('sources'))}</div><ul>${m.sources.map(s => `<li>${srcIcon(s.kind)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a> <small style="color:var(--soft)">(${esc(t(s.kind))})</small></li>`).join('')}</ul>
    ${placed.has(id) ? `<div class="acts"><button type="button" id="sShow">${esc(t('show'))}</button></div>` : `<div class="box note">${esc(t('noPos'))}</div>`}`;
  $('sheet').classList.add('open');
  const b = $('sShow'); if (b) b.onclick = () => { $('sheet').classList.remove('open'); flyTo(id); };
  updateLabelSel();
}
function openList() {
  const items = DATA.monuments.filter(inPeriod), C = DATA.certainty; selected = null;
  const row = m => `<button type="button" data-id="${m.id}"><i style="background:${isNow(m) ? C[m.certainty].color : '#bdb5a6'}"></i><span>${esc(tx(m.name))}<small>${esc(tx(C[m.certainty].name))}${placed.has(m.id) ? '' : ' · ' + esc(t('noPos'))}</small></span></button>`;
  $('sBody').innerHTML = `<h2 id="sTitle">${esc(t('all'))}</h2><div class="list">${items.filter(isNow).map(row).join('')}${items.filter(m => !isNow(m)).length ? `<div class="k">${esc(t('old'))}</div>` + items.filter(m => !isNow(m)).map(row).join('') : ''}</div>`;
  $('sheet').classList.add('open');
  $('sBody').querySelectorAll('[data-id]').forEach(b => b.onclick = () => openSheet(b.dataset.id));
}
$('sClose').onclick = () => { $('sheet').classList.remove('open'); selected = null; updateLabelSel(); };
function goPeriod(n) { if (!DATA.periods.some(p => p.n === n)) return; period = n; store.set('mdl_s3d_period_' + SITE, String(period)); $('sheet').classList.remove('open'); selected = null; closePick(); renderPeriod(); const cur = $('strip').querySelector('[aria-pressed=true]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' }); }
$('strip').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) goPeriod(Number(b.dataset.p)); });
function closePick() { $('pPick').hidden = true; $('pBig').setAttribute('aria-expanded', 'false'); document.querySelector('.periods').classList.remove('picking'); }
$('pBig').onclick = () => { if (!$('pPick').hidden) return closePick();
  $('pPick').innerHTML = DATA.periods.map(p => `<button type="button" data-p="${p.n}" aria-pressed="${p.n === period}" style="${pickStyle(DATA.periods, p.n)}">${esc(tx(p.name))}<small>${esc(tx(p.dates))}</small></button>`).join('');
  $('pPick').hidden = false; $('pBig').setAttribute('aria-expanded', 'true'); document.querySelector('.periods').classList.add('picking'); };
$('pPick').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) goPeriod(Number(b.dataset.p)); });
const stepPeriod = d => { const ns = DATA.periods.map(p => p.n), i = ns.indexOf(period); if (ns[i + d] !== undefined) goPeriod(ns[i + d]); };
$('pPrev').onclick = () => stepPeriod(-1); $('pNext').onclick = () => stepPeriod(1);
$('pCount').onclick = openList; $('bList').onclick = openList;
$('legend').onclick = () => $('legend').classList.toggle('full');
$('bHome').onclick = () => homeView(true);
$('bMenu').onclick = () => { const o = $('toolsMenu').classList.toggle('open'); $('bMenu').setAttribute('aria-expanded', String(o)); };
$('bColors').onclick = () => { realistic = !realistic; store.set('mdl_j3d_real', realistic ? '1' : '0'); applyUI(); rebuildScene(); };
$('bQual').onclick = () => { quality = quality === 'high' ? 'low' : 'high'; store.set('mdl_j3d_q', quality); location.reload(); };
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { lang = b.dataset.lang; store.set('mdl_mode_lang', lang); applyUI(); });

// ---------- 3D ----------
let renderer, composer = null, scene, camera, controls, world, sun, terrainMesh, labels = [], placed = new Set(), paused = false;
const labelsEl = $('labels');
function webglOK() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const SUN = { elevation: 36, azimuth: 235 };
function init3d() {
  const hi = quality === 'high';
  renderer = new THREE.WebGLRenderer({ antialias: !hi, powerPreference: hi ? 'high-performance' : 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 2 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
  $('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.fog = new THREE.Fog('#dfe4e6', 3000, 12000);
  camera = new THREE.PerspectiveCamera(45, 1, 2, 40000);
  const sky = new Sky(); sky.scale.setScalar(30000); scene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  const sp = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN.elevation), THREE.MathUtils.degToRad(SUN.azimuth)); u.sunPosition.value.copy(sp);
  const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(), sky2 = new Sky(); sky2.scale.setScalar(1000); Object.keys(u).forEach(k => sky2.material.uniforms[k].value = u[k].value); env.add(sky2);
  scene.environment = pm.fromScene(env).texture; scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight('#eef4ff', '#8a7356', 0.35));
  sun = new THREE.DirectionalLight('#fff0d8', 3.2); sun.position.copy(sp).multiplyScalar(3000); sun.castShadow = true;
  const sm = hi ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm); Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 200, far: 8000 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8; scene.add(sun, sun.target);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 20; controls.maxDistance = 6000; controls.screenSpacePanning = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  if (hi) {
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight); ao.output = GTAOPass.OUTPUT.Default; ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.6, thickness: 3, scale: 1, samples: 16 }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    composer.addPass(ao); composer.addPass(new OutputPass()); composer.addPass(new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()));
  }
  buildTerrain();
  world = new THREE.Group(); scene.add(world);
  const ray = new THREE.Raycaster(), v = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const r = renderer.domElement.getBoundingClientRect(); v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, camera); const hit = ray.intersectObjects([world], true).find(h => idOf(h.object)); if (hit) openSheet(idOf(hit.object));
  });
  window.addEventListener('resize', resize); resize(); rebuildScene(); homeView(false); loop();
}
function idOf(o) { while (o) { if (o.userData && o.userData.id) return o.userData.id; o = o.parent; } return null; }
function resize() { if (!renderer) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h); if (composer) composer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1 ? 60 : 42; camera.updateProjectionMatrix(); }
function buildTerrain() {
  const d = GEO.dem, g = new THREE.BufferGeometry(), pos = [], col = [], idx = [];
  const hmax = Math.max(...demH.filter(v => v != null)) - demMin, lo = new THREE.Color(DATA.terrain?.lo || '#a39478'), mid = new THREE.Color(DATA.terrain?.mid || '#cdbf9f'), hiC = new THREE.Color(DATA.terrain?.hi || '#e8dfca'), c = new THREE.Color();
  const S = 3, E = d.west + (d.cols - 1) * d.stepLon, Sth = d.north - (d.rows - 1) * d.stepLat;
  const PAD = [150, 400, 900, 1800, 3500, 7000], dLat = m => m / KZ, dLon = m => m / KX;
  const LATS = [...PAD.slice().reverse().map(p => d.north + dLat(p)), ...Array.from({ length: (d.rows - 1) * S + 1 }, (_, r) => d.north - r * d.stepLat / S), ...PAD.map(p => Sth - dLat(p))];
  const LONS = [...PAD.slice().reverse().map(p => d.west - dLon(p)), ...Array.from({ length: (d.cols - 1) * S + 1 }, (_, k) => d.west + k * d.stepLon / S), ...PAD.map(p => E + dLon(p))];
  const rows = LATS.length, cols = LONS.length;
  // au-delà de la zone mesurée : relief prolongé (valeur du bord le plus proche) pour un horizon sans « table »
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const [x, z] = toXZ(LATS[r], LONS[k]), pad = Math.max(r < PAD.length ? PAD.length - r : r >= rows - PAD.length ? r - rows + PAD.length + 1 : 0, k < PAD.length ? PAD.length - k : k >= cols - PAD.length ? k - cols + PAD.length + 1 : 0);
    const y = ground(x, z), f = Math.max(0, Math.min(1, y / Math.max(1, hmax)));
    pos.push(x, y, z);
    if (f < 0.5) c.copy(lo).lerp(mid, f * 2); else c.copy(mid).lerp(hiC, (f - 0.5) * 2);
    const nz = Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.014 + 0.7) + 0.5 * Math.sin(x * 0.037 - z * 0.029 + 2.1); c.multiplyScalar((1 + 0.055 * nz) * (pad ? 0.97 : 1)); col.push(c.r, c.g, c.b);
  }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols - 1; k++) { const a = r * cols + k, b = a + 1, cc = a + cols, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { const slope = 1 - n.getY(i), k = 1 + slope * 0.5; col[i * 3] = Math.min(1, col[i * 3] * k); col[i * 3 + 1] = Math.min(1, col[i * 3 + 1] * k * 0.98); col[i * 3 + 2] = Math.min(1, col[i * 3 + 2] * k * 0.95); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  terrainMesh = new THREE.Mesh(g, groundMaterial()); terrainMesh.receiveShadow = true; scene.add(terrainMesh);
  if (seaY != null) { // la mer (Césarée) : plan d'eau au niveau 0
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2f7fb6', roughness: 0.18, metalness: 0.25, transparent: true, opacity: 0.93 }));
    sea.position.y = seaY; sea.receiveShadow = true; scene.add(sea);
  }
}
function homeView(anim) {
  const h = DATA.home || {}, c = wpt(h.at) || [0, 0], dist = h.dist || 900, el = (h.elev || 35) * Math.PI / 180, [bx, bz] = bearingVec(h.from ?? 200);
  const ty = ground(c[0], c[1]) + (h.lift || 0), eye = new THREE.Vector3(c[0] + bx * dist * Math.cos(el), ty + dist * Math.sin(el), c[1] + bz * dist * Math.cos(el));
  if (anim) tween(eye, new THREE.Vector3(c[0], ty, c[1])); else { camera.position.copy(eye); controls.target.set(c[0], ty, c[1]); controls.update(); }
}
let tw = null;
function tween(eye, target, dur = 1100) { tw = { t0: performance.now(), dur, e0: camera.position.clone(), t0v: controls.target.clone(), e1: eye, t1: target }; }
function objectsOf(id) { const out = []; world.traverse(o => { if (o.userData && o.userData.id === id && o.parent === world) out.push(o); }); return out; }
function boundsOf(id) { const b = new THREE.Box3(); objectsOf(id).forEach(o => b.expandByObject(o)); return b; }
function flyTo(id) {
  const b = boundsOf(id); if (b.isEmpty()) return; const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()), r = Math.max(40, Math.max(s.x, s.z) * 1.2, s.y * 1.6);
  const dir = camera.position.clone().sub(controls.target).setY(0).normalize(); tween(c.clone().add(dir.multiplyScalar(r)).setY(c.y + r * 0.7), c);
}
function disposeTree(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
function clearWorld() { while (world.children.length) { const o = world.children.pop(); disposeTree(o); } placed = new Set(); labels.forEach(l => l.el.remove()); labels = []; }
function add(obj, m, now) {
  obj.userData.id = m.id; obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  if (!realistic || !now) {
    const colr = now ? DATA.certainty[m.certainty].color : '#bdb5a6', fm = flat(colr, m.certainty === 'hypothesis' && now ? { transparent: true, opacity: 0.6 } : {});
    if (!realistic || DATA.greyOld) obj.traverse(c => { if (c.isMesh && !c.userData.keep) c.material = fm; });
  } else if (m.certainty === 'hypothesis') obj.traverse(c => { if (c.isMesh) { const mm = c.material.clone(); mm.transparent = true; mm.opacity = 0.72; c.material = mm; } });
  world.add(obj); placed.add(m.id); return obj;
}
function label(m, x, y, z, now) {
  const el = document.createElement('div'); el.className = 'lb' + (now ? '' : ' old'); el.textContent = tx(m.name);
  el.style.setProperty('--c', now ? DATA.certainty[m.certainty].color : '#bdb5a6'); el.onclick = () => openSheet(m.id); labelsEl.appendChild(el);
  labels.push({ id: m.id, el, p: new THREE.Vector3(x, y, z), pri: (now ? 2 : 1) + (m.pri || 0) });
}
function updateLabelSel() { labels.forEach(l => l.el.classList.toggle('sel', l.id === selected)); }
function place(o, x, y, z, yaw) { o.position.set(x, y, z); o.rotation.y = yaw || 0; return o; }
const lines = sh => (sh.lines ? sh.lines.map(L => L.map(wpt).filter(Boolean)) : osmShapes(sh.osm).map(xzPts)).filter(L => L.length > 1);

// Construit un monument selon son type ; renvoie [objet, point d'étiquette] ou null.
function buildModel(m, sh) {
  const at = wpt(sh.at || (m.anchor && 'a:' + m.anchor)), gyAt = at ? ground(at[0], at[1]) : 0, K = sh.kind || DATA.stone || 'ashlar';
  const F = sh.fit ? (() => { const P = biggest(sh.fit); return P ? fit(P) : null; })() : null;
  switch (sh.type) {
    case 'theater': { // orientation et rayon déduits du contour OSM (demi-cercle) si disponible
      let c = at, bearing = sh.bearing ?? 0, R = sh.R || 40;
      if (F) { const w = F.a[1] - F.a[0], s1 = -F.b[0], s2 = F.b[1]; R = sh.R || w / 2; const side = s1 < s2 ? -1 : 1; // côté plat = scène
        const dx = F.p[0] * side, dz = F.p[1] * side; c = [F.c[0] + dx * 0.4244 * R, F.c[1] + dz * 0.4244 * R]; bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; }
      if (!c) return null; const g = SM.theater({ R, orch: sh.orch || R * 0.27, H: sh.H || R * 0.36, rows: sh.rows || 26, scaenaH: sh.scaenaH || 18, seatKind: sh.seatKind || K, wallKind: K, tint: sh.tint });
      place(g, c[0], ground(c[0], c[1]) - 0.3, c[1], yawFor(bearing)); return [g, [c[0], ground(c[0], c[1]) + (sh.scaenaH || 18) + 6, c[1]]];
    }
    case 'circus': {
      let c = at, L = sh.L || 300, W = sh.W || 50, bearing = sh.bearing ?? 0;
      if (F) { c = F.c; L = sh.L || F.a[1] - F.a[0]; W = sh.W || F.b[1] - F.b[0]; bearing = (Math.atan2(F.u[0], -F.u[1]) * 180 / Math.PI + 360) % 360; if (sh.curved) { const cv = bearingVec(sh.curved); if (F.u[0] * cv[0] + F.u[1] * cv[1] < 0) bearing = (bearing + 180) % 360; } }
      if (!c) return null; const g = SM.circus({ L, W, rows: sh.rows || 12, kind: K, spina: !!sh.spina }); place(g, c[0], ground(c[0], c[1]) - 0.2, c[1], yawFor((bearing + 180) % 360));
      return [g, [c[0], ground(c[0], c[1]) + 12, c[1]]];
    }
    case 'amphi': {
      let c = at, A = sh.A || 100, B = sh.B || 60, bearing = sh.bearing ?? 0;
      if (F) { c = F.c; const da = F.a[1] - F.a[0], db = F.b[1] - F.b[0], rw = (sh.rows || 12) * 0.8 * 2; A = sh.A || Math.max(20, da - rw); B = sh.B || Math.max(15, db - rw); bearing = (Math.atan2(F.u[0], -F.u[1]) * 180 / Math.PI + 360) % 360; }
      if (!c) return null; const g = SM.amphitheater({ A, B, rows: sh.rows || 12, kind: K }); place(g, c[0], ground(c[0], c[1]) - 0.2, c[1], yawFor(bearing)); return [g, [c[0], ground(c[0], c[1]) + 12, c[1]]];
    }
    case 'casemate': { const L = lines(sh); if (!L.length) return null; const g = new THREE.Group();
      L.forEach(P => { const [x1, z1] = P[0], [x2, z2] = P[1], l = Math.hypot(x2 - x1, z2 - z1) || 1, mx = (x1 + x2) / 2 + (-(z2 - z1) / l) * 5, mz = (z1 + z2) / 2 + ((x2 - x1) / l) * 5; // côté intérieur ?
        g.add(SM.casemate([P], ground, { kind: K, tint: sh.tint || DATA.tint || '#ffffff', inward: inside(P, mx, mz) ? 1 : -1, h: sh.h || 5, towerEvery: sh.towerEvery || 60, towerH: sh.towerH || 7 })); }); const p = L[0][Math.floor(L[0].length * 0.3)]; return [g, [p[0], ground(...p) + 12, p[1]]]; }
    case 'wall': { const L = lines(sh); if (!L.length) return null; const g = SM.wallLines(L, ground, { h: sh.h || 3, thick: sh.thick || 1.5, kind: K, tint: sh.tint || DATA.tint || '#ffffff', towerEvery: sh.towerEvery || 0, towerH: sh.towerH || 0, towerW: sh.towerW || 6, glacis: sh.glacis || 0 }); const P = L.reduce((a, b) => (b.length > a.length ? b : a)); const p = P[Math.floor(P.length / 2)]; return [g, [p[0], ground(...p) + (sh.h || 3) + 6, p[1]]]; }
    case 'aqueduct': { const L = lines(sh); if (!L.length) return null; const g = SM.aqueduct(L, ground, { h: sh.h || 6, kind: K }); const P = L[0], p = P[Math.floor(P.length / 2)]; return [g, [p[0], ground(...p) + (sh.h || 6) + 5, p[1]]]; }
    case 'path': { const L = lines(sh); if (!L.length) return null; const g = new THREE.Group(), mt = new THREE.MeshStandardMaterial({ color: sh.color || '#f3e3b8', roughness: 1 });
      L.forEach(P => { for (let i = 1; i < P.length; i++) { const [x1, z1] = P[i - 1], [x2, z2] = P[i], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue; const y1 = ground(x1, z1), y2 = ground(x2, z2), b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, sh.w || 2), mt);
        b.position.set((x1 + x2) / 2, (y1 + y2) / 2 + 0.6, (z1 + z2) / 2); b.rotation.order = 'YZX'; b.rotation.y = -Math.atan2(z2 - z1, x2 - x1); b.rotation.z = Math.atan2(y2 - y1, len); g.add(b); } });
      const P = L[0], p = P[Math.floor(P.length / 2)]; return [g, [p[0], ground(...p) + 8, p[1]]]; }
    case 'street': { const L = lines(sh); if (!L.length) return null; const g = new THREE.Group(); L.forEach(P => g.add(JM.cardo(P, ground))); const P = L[0], p = P[Math.floor(P.length / 2)]; return [g, [p[0], ground(...p) + 12, p[1]]]; }
    case 'footprint': { // emprise réelle (OSM), murs extrudés
      const S = osmShapes(sh.osm).map(xzPts).filter(P => P.length > 2); if (!S.length) return null; const g = new THREE.Group();
      S.forEach(P => { const c = centroid(P), gy = Math.min(...P.map(p => ground(...p)));
        if (sh.solid) { const b = JM.footprintBuilding(P.map(([x, z]) => [x - c[0], z - c[1]]), (sh.h || 3) + (ground(...c) - gy), K, [], { tint: sh.tint || DATA.tint || '#ffffff' }); b.position.set(c[0], gy - 0.3, c[1]); g.add(b); return; }
        // ruine : murs d'enceinte du plan réel + sol dallé (pas de bloc plein)
        const Q = P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1] ? P : [...P, P[0]];
        g.add(SM.wallLines([Q], ground, { h: sh.h || 3, thick: sh.thick || 1.1, kind: K, tint: sh.tint || DATA.tint || '#ffffff' }));
        const fl = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(Q.map(([x, z]) => new THREE.Vector2(x - c[0], -(z - c[1]))))).rotateX(-Math.PI / 2), stone(sh.floor || 'paving', { tint: '#efe2c8' }));
        fl.position.set(c[0], ground(...c) + 0.08, c[1]); fl.receiveShadow = true; g.add(fl); });
      const c = centroid(S[0]); return [g, [c[0], ground(...c) + (sh.h || 3) + 7, c[1]]]; }
    case 'terraces': { // Palais du Nord (Massada) : trois terrasses ; dénivelés d'après WiBiLex (≈ 20 m puis 15 m)
      const up = wpt(sh.upper), mi = wpt(sh.middle), lo = wpt(sh.lower); if (!up) return null; const dv = mi ? [mi[0] - up[0], mi[1] - up[1]] : bearingVec(0), dl = Math.hypot(...dv) || 1;
      const top = sh.top != null ? sh.top - demMin : ground(up[0], up[1]), d2 = lo && mi ? Math.hypot(lo[0] - mi[0], lo[1] - mi[1]) : 18;
      const g = SM.northernPalace(ground, top, { origin: up, dir: [dv[0] / dl, dv[1] / dl], d1: mi ? dl : 22, d2, drop1: sh.drop1 || 20, drop2: sh.drop2 || 15 });
      return [g, [up[0], top + 14, up[1]]];
    }
    case 'ramp': { const a = wpt(sh.from), b = wpt(sh.to); if (!a || !b) return null; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const top = sh.topAbs != null ? sh.topAbs - demMin : ground(b[0] + (b[0] - a[0]) / l * (sh.topInward || 0), b[1] + (b[1] - a[1]) / l * (sh.topInward || 0)); const g = new THREE.Group(); g.add(SM.ramp(a, [b[0], b[1], top], ground, { w: sh.w || 12 }));
      return [g, [(a[0] + b[0]) / 2, (ground(a[0], a[1]) + top) / 2 + 12, (a[1] + b[1]) / 2]]; }
    case 'breakwater': { const L = lines(sh); if (!L.length) return null; const g = SM.breakwater(L, seaY ?? 0, { w: sh.w || 25, kind: K }); const p = L[0][L[0].length - 1]; return [g, [p[0], (seaY ?? 0) + 12, p[1]]]; }
    default: { // modèles posés en un point, orientés selon un cap
      let c = at, bearing = sh.bearing ?? 0; if (F) { c = c || F.c; if (sh.bearing == null) bearing = (Math.atan2(F.u[0], -F.u[1]) * 180 / Math.PI + 360) % 360; }
      if (!c) return null;
      const make = { pool: () => SM.pool({ W: sh.W || 35, D: sh.D || 18, peristyle: sh.peristyle ?? 6, kind: K, pavilion: sh.pavilion || 0 }), temple: () => SM.templeOnPodium({ podiumW: sh.podiumW || 100, podiumD: sh.podiumD || 90, podiumH: sh.podiumH || 4, L: sh.L || 46, W: sh.W || 28, H: sh.H || 16, kind: K }),
        storerooms: () => SM.storerooms({ n: sh.n || 11, L: sh.L || 27, w: sh.w || 4, kind: K }), hall: () => SM.hall({ W: sh.W || 15, D: sh.D || 12, h: sh.h || 6, kind: K, court: sh.court, domeR: sh.domeR || 0, cols: sh.cols || 0, tint: sh.tint }),
        basilica: () => JM.basilica(sh.L || 30, sh.W || 16, sh.H || 10, { apse: true, atrium: sh.atrium || 0 }), mosque: () => SM.mosque({}), facade: () => SM.facade({ W: sh.W || 22, h: sh.h || 12, apse: sh.apse !== false, kind: K }),
        marker: () => SM.marker({ h: sh.h || 8 }), fortress: () => SM.roundFortress({ R: sh.R || 31, gap: sh.gap || 2.5, h: sh.h || 30, eastD: sh.eastD || 18, towerD: sh.towerD || 16, kind: K, tint: sh.tint || DATA.tint }), gate: () => SM.chamberGate({ W: sh.W || 18, L: sh.L || 20, chambers: sh.chambers || 3, h: sh.h || 6, kind: K, tint: sh.tint || DATA.tint, towers: sh.towers !== false }),
        stables: () => SM.pillaredHall({ units: sh.units || 5, L: sh.L || 21, w: sh.w || 11, h: sh.h || 4, kind: K, tint: sh.tint || DATA.tint }), altar: () => SM.roundAltar({ D: sh.D || 8.5, h: sh.h || 1.5, kind: K }), silo: () => SM.silo({ D: sh.D || 11, kind: K }), roundtower: () => SM.roundTower({ D: sh.D || 10, h: sh.h || 12, kind: K, tint: sh.tint || DATA.tint }), tholos: () => SM.tholos({ R: sh.R || 6, h: sh.h || 9, kind: K }), tower: () => SM.tower({ W: sh.W || 8, h: sh.h || 14, kind: K }), box: () => JM.box(sh.W || 10, sh.h || 5, sh.D || 10, stone(K, { tint: sh.tint || '#ffffff' })) }[sh.type];
      if (!make) return null; const g = make();
      // bassins et plates-formes : posés au point le plus haut de leur emprise (sinon le relief les recouvre)
      const hw = (sh.W || 10) / 2 + 4, hd = (sh.D || sh.podiumD || 10) / 2 + 4, [bx, bz] = bearingVec(bearing), corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => ground(c[0] + (-bz) * hw * i + bx * hd * j, c[1] + bx * hw * i + bz * hd * j));
      const y = (sh.y != null ? sh.y - demMin : (sh.type === 'pool' || sh.type === 'temple' || sh.level === 'max') ? Math.max(...corners) : ground(c[0], c[1])) - (sh.sink ?? 0.2);
      place(g, c[0], y, c[1], yawFor(bearing)); if (sh.type === 'basilica') g.rotation.y += Math.PI / 2; // basilique construite selon x (abside à l'est)
      const bb = new THREE.Box3().setFromObject(g); return [g, [c[0], bb.max.y + 5, c[1]]];
    }
  }
}

function rebuildScene() {
  if (!world) return; clearWorld();
  for (const m of DATA.monuments) {
    if (!inPeriod(m) || !m.shape) continue; const now = isNow(m) || (m.keep && m.from <= period);
    let r = null; try { r = buildModel(m, m.shape); } catch (e) { console.warn('modèle', m.id, e); }
    if (!r) continue; const [obj, lp] = r; add(obj, m, now); label(m, lp[0], lp[1], lp[2], now);
  }
  updateLabelSel();
}
function frame() { if (composer) composer.render(); else renderer.render(scene, camera); }
function followSun() { const tg = controls.target; sun.target.position.copy(tg); sun.position.copy(tg).add(new THREE.Vector3().setFromSphericalCoords(3000, THREE.MathUtils.degToRad(90 - SUN.elevation), THREE.MathUtils.degToRad(SUN.azimuth))); sun.target.updateMatrixWorld(); }
const vtmp = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop); if (paused) return; now = now || performance.now();
  if (tw) { const k = Math.min(1, (now - tw.t0) / tw.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; camera.position.lerpVectors(tw.e0, tw.e1, e); controls.target.lerpVectors(tw.t0v, tw.t1, e); if (k >= 1) tw = null; }
  controls.update(); followSun(); frame();
  // étiquettes : projection, tri par priorité, élimination des chevauchements
  const W = innerWidth, H = innerHeight, boxes = [];
  labels.map(l => { vtmp.copy(l.p).project(camera); return { l, x: (vtmp.x + 1) / 2 * W, y: (1 - vtmp.y) / 2 * H, ok: vtmp.z < 1 && vtmp.z > -1, d: camera.position.distanceTo(l.p) }; })
    .sort((a, b) => (b.l.id === selected) - (a.l.id === selected) || b.l.pri - a.l.pri || a.d - b.d)
    .forEach(o => { const el = o.l.el; if (!o.ok || o.x < -50 || o.x > W + 50 || o.y < 40 || o.y > H - 120) { el.style.display = 'none'; return; }
      const w = el.offsetWidth || 90, h = el.offsetHeight || 24, bx = [o.x - w / 2, o.y - h, o.x + w / 2, o.y];
      if (boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]) && o.l.id !== selected) { el.style.display = 'none'; return; }
      boxes.push(bx); el.style.display = ''; el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; });
  if (!document.body.dataset.ready) { document.body.dataset.ready = '1'; $('msg').style.display = 'none'; }
}

window.MDSite3D = {
  site: SITE, quizEnabled: false,
  setPeriod(n) { goPeriod(n); }, openSheet, flyTo, homeView,
  pause(v) { paused = v !== false; },
  snapshot() { controls.update(); followSun(); frame(); return renderer.domElement.toDataURL('image/png'); },
  viewAt(id) { flyTo(id); if (tw) { camera.position.copy(tw.e1); controls.target.copy(tw.t1); tw = null; controls.update(); } },
  orbit(deg) { const o = camera.position.clone().sub(controls.target); o.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * Math.PI / 180); camera.position.copy(controls.target).add(o); controls.update(); },
  zoom(k) { const o = camera.position.clone().sub(controls.target).multiplyScalar(k); camera.position.copy(controls.target).add(o); controls.update(); },
  _bounds(id) { const b = boundsOf(id); return b.isEmpty() ? [[0, 0, 0], [0, 0, 0]] : [b.min.toArray(), b.max.toArray()]; },
  placed: () => [...placed]
};

(async function start() {
  applyUI(); $('msg').textContent = t('preparing');
  try {
    const [d, g] = await Promise.all([fetch(`sites3d/${SITE}/site.json`).then(r => { if (!r.ok) throw new Error('site'); return r.json(); }), fetch(`sites3d/${SITE}/geo.json`).then(r => r.ok ? r.json() : null).catch(() => null)]);
    DATA = d; GEO = g;
  } catch (e) { $('msg').textContent = t('loadErr'); return; }
  period = Number(QS.get('period') || store.get('mdl_s3d_period_' + SITE, DATA.defaultPeriod || DATA.periods[0].n)); if (!DATA.periods.some(p => p.n === period)) period = DATA.defaultPeriod || DATA.periods[0].n;
  if (!GEO || !GEO.dem) { applyUI(); $('msg').textContent = t('geoMissing'); return; }
  LAT0 = (GEO.box.s + GEO.box.n) / 2; LON0 = (GEO.box.w + GEO.box.e) / 2; KX = 111320 * Math.cos(LAT0 * Math.PI / 180);
  demH = GEO.dem.heights.slice(); const valid = demH.filter(v => v != null);
  if (DATA.sea) { // la mer = cellules basses reliées au bord du cadre (remplissage) ; les creux à l'intérieur des terres restent à sec
    const R = GEO.dem.rows, C = GEO.dem.cols, low = i => demH[i] == null || demH[i] <= 0.5, sea = new Uint8Array(R * C), st = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if ((r === 0 || c === 0 || r === R - 1 || c === C - 1) && low(r * C + c)) { sea[r * C + c] = 1; st.push(r * C + c); }
    while (st.length) { const i = st.pop(), r = Math.floor(i / C), c = i % C; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc, j = rr * C + cc; if (rr >= 0 && cc >= 0 && rr < R && cc < C && !sea[j] && low(j)) { sea[j] = 1; st.push(j); } } }
    demH = demH.map((v, i) => sea[i] ? -6 : Math.max(v ?? 1, 1)); seaY = 0; } // sous la mer : fond à −6 m, surface au niveau 0
  demMin = Math.min(...demH.filter(v => v != null)); if (seaY != null) seaY = 0 - demMin; void valid;
  applyUI();
  if (!webglOK()) { $('msg').textContent = t('noWebgl'); return; }
  init3d();
})();
