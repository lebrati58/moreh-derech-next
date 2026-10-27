// Moreh Derech NEXT — Jérusalem, Vieille Ville en 3D.
// Données : jerusalem3d/monuments.json (fiches : Drive d'abord) + jerusalem3d/geo.json (géographie réelle,
// générée par tools/build-jerusalem3d.mjs). Aucune coordonnée saisie à la main : tout objet est posé sur un repère
// Wikidata ou sur un tracé OpenStreetMap ; un objet sans repère reste dans la liste, sans position dans la scène.
// Quiz 3D : préparés (API window.MDJerusalem3D) mais NON affichés tant que monuments.quiz3dEnabled === false.
import { renderTimeline, markTimeline, pickStyle } from '../era-timeline.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as MD from './models.js';
import { stone, lead, flat, groundMaterial } from './materials.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const EXAG = 1; // relief réel (SRTM), sans exagération

const UI = {
  he: { prevP: 'התקופה הקודמת', nextP: 'התקופה הבאה', pickP: 'בחירת תקופה', water: 'נחלים ומים', museumLoading: 'טוען את מודל הר הבית…', museumFailed: 'מודל הר הבית לא נטען — מוצגת גרסה פשוטה', modelParts: 'רכיבי המודל ומידת הוודאות', modelCredit: 'מודל תלת-ממד של הר הבית (כ-30 לסה״נ, לפי מידות, יוסף בן מתתיהו והחפירות):', function: 'תפקיד', events: 'אירועים', cmpToday: 'להשוות להיום', tools: 'כלים', preparing: 'מכין את התלת-ממד…', builtBy: 'נבנתה בידי', wallX2: 'חומות: גובה ×2 (להבלטה) — לחצו לגובה האמיתי', wallX1: 'חומות: גובה אמיתי — לחצו להגדלה ×2', cinema: 'סיור מצולם (מצב הצגה)', record: 'הקלטת וידאו של הסיור', quality: 'איכות תצוגה: גבוהה / חסכונית', colors: 'צבעים לפי ודאות / חומרים מציאותיים', noRec: 'הדפדפן הזה לא תומך בהקלטה. אפשר להקליט מסך.', stop: 'עצירה', schem: 'מידות לפי המקורות; פרטים משוחזרים',  compare: 'השוואת חומות', compareHint: 'כל החומות של כל התקופות. לחיצה על קו פותחת את הכרטיס; אפשר להסתיר חומות.', basemap: 'מפת רקע (OpenStreetMap)', city: 'העיר של היום בשקיפות, לצורך התמצאות (OpenStreetMap)', walls: 'חומות', showAll: 'הצג הכול', hideAll: 'הסתר הכול', map: 'מפה', title: 'ירושלים · העיר העתיקה', sub: 'שחזור לפי מקורות — לא עיר דמיונית', old: 'שרידים מתקופה קודמת', today: 'קו החומה של היום', exag: 'תבליט אמיתי (SRTM 30 מ׳)', sites: 'אתרים', all: 'כל האתרים בתקופה', noPos: 'ללא מיקום בסצנה', dims: 'ממדים מתועדים', remains: 'מה נשאר היום', debate: 'מחלוקת', other: 'מקורות אחרים', note: 'על הסימון בסצנה', sources: 'מקורות', show: '📍 הראו בסצנה', drive: 'מסמך קורס', primary: 'מקור קדום', online: 'מקור מקוון', period: 'תקופה', list2d: 'מפה דו-ממדית', loadErr: 'לא ניתן לטעון את הנתונים. נסו שוב עם חיבור.', geoMissing: 'נתוני המפה עוד לא נוצרו (geo.json).', noWebgl: 'הטלפון לא תומך בתלת-ממד — מוצגת מפה דו-ממדית.', toggleToday: 'קו החומה של היום', toggle2d: 'דו-ממד / תלת-ממד', home: 'חזרה למבט הכללי', list: 'רשימת האתרים', attr: 'מיקומים: ויקינתונים · תוואים: © תורמי OpenStreetMap · גבהים: ' },
  fr: { prevP: 'Époque précédente', nextP: 'Époque suivante', pickP: 'Choisir l’époque', water: 'Vallées et eau', museumLoading: 'Chargement du modèle du mont du Temple…', museumFailed: 'Modèle du mont du Temple indisponible — version simplifiée affichée', modelParts: 'Éléments du modèle et degré de certitude', modelCredit: 'Modèle 3D du mont du Temple (vers 30 apr. J.-C., d’après Middot, Josèphe et les fouilles) :', function: 'Fonction', events: 'Événements', cmpToday: 'Comparer avec aujourd’hui', tools: 'Outils', preparing: 'Préparation de la 3D…', builtBy: 'Bâtie par', wallX2: 'Murailles : hauteur ×2 (lisibilité) — toucher pour la hauteur réelle', wallX1: 'Murailles : hauteur réelle — toucher pour ×2', cinema: 'Survol filmé (mode présentation)', record: 'Enregistrer le survol en vidéo', quality: 'Qualité : haute / économe', colors: 'Couleurs de certitude / matériaux réalistes', noRec: 'Ce navigateur ne sait pas enregistrer. Utilisez la capture d’écran.', stop: 'Arrêter', schem: 'Dimensions d’après les sources ; détails reconstitués',  compare: 'Comparer les murailles', compareHint: 'Toutes les murailles de toutes les époques. Touchez une ligne pour sa fiche ; vous pouvez en masquer.', basemap: 'Carte de fond (OpenStreetMap)', city: 'La ville d’aujourd’hui en transparence, pour se repérer (OpenStreetMap)', walls: 'Murailles', showAll: 'Tout afficher', hideAll: 'Tout masquer', map: 'Carte', title: 'Jérusalem · Vieille Ville', sub: 'Reconstitution sourcée — pas une ville imaginaire', old: 'Vestiges d’une période antérieure', today: 'Tracé actuel des murailles', exag: 'Relief réel (SRTM 30 m)', sites: 'sites', all: 'Tous les sites de la période', noPos: 'Sans position dans la scène', dims: 'Dimensions documentées', remains: 'Ce qui reste aujourd’hui', debate: 'Débat', other: 'Autre avis', note: 'À propos du repère', sources: 'Sources', show: '📍 Montrer dans la scène', drive: 'Document du cours', primary: 'Source antique', online: 'Source en ligne', period: 'Période', list2d: 'Plan 2D', loadErr: 'Impossible de charger les données. Réessayez avec une connexion.', geoMissing: 'Les données géographiques (geo.json) ne sont pas encore générées.', noWebgl: 'Ce téléphone ne gère pas la 3D — plan 2D affiché.', toggleToday: 'Tracé actuel', toggle2d: '2D / 3D', home: 'Vue d’ensemble', list: 'Liste des sites', attr: 'Positions : Wikidata · Tracés : © contributeurs OpenStreetMap · Relief : ' },
  en: { prevP: 'Previous period', nextP: 'Next period', pickP: 'Choose the period', water: 'Valleys and water', museumLoading: 'Loading the Temple Mount model…', museumFailed: 'Temple Mount model unavailable — simplified version shown', modelParts: 'Model elements and certainty', modelCredit: '3D model of the Temple Mount (c. 30 CE, after Middot, Josephus and the excavations):', function: 'Function', events: 'Events', cmpToday: 'Compare with today', tools: 'Tools', preparing: 'Preparing the 3D view…', builtBy: 'Built by', wallX2: 'Walls: height ×2 (for legibility) — tap for true height', wallX1: 'Walls: true height — tap for ×2', cinema: 'Filmed fly-through (presentation mode)', record: 'Record the fly-through as video', quality: 'Quality: high / light', colors: 'Certainty colours / realistic materials', noRec: 'This browser cannot record. Use screen capture.', stop: 'Stop', schem: 'Dimensions from the sources; details reconstructed',  compare: 'Compare the walls', compareHint: 'All walls of all periods. Tap a line for its card; you can hide some.', basemap: 'Base map (OpenStreetMap)', city: 'Today’s city, see-through, for orientation (OpenStreetMap)', walls: 'Walls', showAll: 'Show all', hideAll: 'Hide all', map: 'Map', title: 'Jerusalem · Old City', sub: 'Source-based reconstruction — not an imaginary city', old: 'Remains from an earlier period', today: 'Today’s wall line', exag: 'True relief (SRTM 30 m)', sites: 'sites', all: 'All sites in this period', noPos: 'No position in the scene', dims: 'Documented dimensions', remains: 'What remains today', debate: 'Debate', other: 'Other view', note: 'About the marker', sources: 'Sources', show: '📍 Show in scene', drive: 'Course document', primary: 'Ancient source', online: 'Online source', period: 'Period', list2d: '2D plan', loadErr: 'Could not load the data. Try again online.', geoMissing: 'Geographic data (geo.json) not generated yet.', noWebgl: 'This phone does not support 3D — showing the 2D plan.', toggleToday: 'Today’s walls', toggle2d: '2D / 3D', home: 'Overview', list: 'Site list', attr: 'Positions: Wikidata · Lines: © OpenStreetMap contributors · Relief: ' },
  ru: { prevP: 'Предыдущая эпоха', nextP: 'Следующая эпоха', pickP: 'Выбрать эпоху', water: 'Долины и вода', museumLoading: 'Загрузка модели Храмовой горы…', museumFailed: 'Модель Храмовой горы недоступна — показана упрощённая версия', modelParts: 'Элементы модели и степень достоверности', modelCredit: '3D-модель Храмовой горы (ок. 30 г. н. э., по Мидот, Иосифу и раскопкам):', function: 'Назначение', events: 'События', cmpToday: 'Сравнить с сегодняшним днём', tools: 'Инструменты', preparing: 'Подготовка 3D…', builtBy: 'Построена', wallX2: 'Стены: высота ×2 (для наглядности) — нажмите для реальной', wallX1: 'Стены: реальная высота — нажмите для ×2', cinema: 'Облёт (режим показа)', record: 'Записать облёт на видео', quality: 'Качество: высокое / экономное', colors: 'Цвета достоверности / реальные материалы', noRec: 'Этот браузер не умеет записывать. Используйте запись экрана.', stop: 'Стоп', schem: 'Размеры по источникам; детали реконструированы',  compare: 'Сравнить стены', compareHint: 'Все стены всех эпох. Нажмите на линию, чтобы открыть карточку; можно скрыть.', basemap: 'Подложка (OpenStreetMap)', city: 'Современный город, полупрозрачно, для ориентации (OpenStreetMap)', walls: 'Стены', showAll: 'Показать все', hideAll: 'Скрыть все', map: 'Карта', title: 'Иерусалим · Старый город', sub: 'Реконструкция по источникам — не вымышленный город', old: 'Остатки более раннего периода', today: 'Нынешняя линия стен', exag: 'Реальный рельеф (SRTM 30 м)', sites: 'объектов', all: 'Все объекты периода', noPos: 'Без места в сцене', dims: 'Документированные размеры', remains: 'Что сохранилось', debate: 'Спор', other: 'Другое мнение', note: 'О метке', sources: 'Источники', show: '📍 Показать в сцене', drive: 'Документ курса', primary: 'Древний источник', online: 'Онлайн-источник', period: 'Период', list2d: 'План 2D', loadErr: 'Не удалось загрузить данные.', geoMissing: 'Географические данные (geo.json) ещё не созданы.', noWebgl: 'Телефон не поддерживает 3D — показан план 2D.', toggleToday: 'Нынешние стены', toggle2d: '2D / 3D', home: 'Общий вид', list: 'Список объектов', attr: 'Координаты: Wikidata · Линии: © участники OpenStreetMap · Рельеф: ' }
};
let lang = store.get('mdl_mode_lang', store.get('mdl_lang', 'he')); if (!UI[lang]) lang = 'he';
const t = k => UI[lang][k] || UI.he[k] || k;
const tx = o => (o && (o[lang] || o.he)) || '';

let DATA = null, GEO = null, period = Number(store.get('mdl_j3d_period', '5')) || 5, showToday = store.get('mdl_j3d_today', '1') === '1', selected = null;
let mode2d = false, pickMode = false, compare = false, basemap = store.get('mdl_j3d_base', '0') === '1', hiddenWalls = new Set();

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

// Points de passage d'une muraille : repère Wikidata (a:), angle de l'esplanade OSM (tm:SE…), milieu de deux repères (mid:),
// ou coordonnée publiée ({ll}, ex. ITM de Spiezer 2023 convertie). « osm:all » = tracé actuel OpenStreetMap.
function tmCorner(c) {
  const tm = shapeByName('Temple Mount'); if (!tm) return null;
  const sx = /E/.test(c) ? 1 : -1, sz = /S/.test(c) ? 1 : -1; let best = null, bv = -Infinity;
  tm.pts.forEach(p => { const [x, z] = toXZ(p[0], p[1]), v = sx * x + sz * z; if (v > bv) { bv = v; best = [x, z]; } });
  return best;
}
function wpt(tok) {
  if (tok && typeof tok === 'object' && tok.ll) return toXZ(tok.ll[0], tok.ll[1]);
  if (typeof tok !== 'string') return null;
  if (tok.startsWith('a:')) return anchorXZ(tok.slice(2));
  if (tok.startsWith('tm:')) return tmCorner(tok.slice(3));
  if (tok.startsWith('herod:')) return herodTowerPos(tok.slice(6)); // tour d'Hérode (Hippicus : début de la 1re muraille, Josèphe 5.144)
  if (tok.startsWith('off:')) { const [id, dx, dz] = tok.slice(4).split(','), a = anchorXZ(id); return a ? [a[0] + +dx, a[1] + +dz] : null; } // repère décalé de dx m vers l'est, dz m vers le sud
  if (tok.startsWith('mid:')) { const [a, b] = tok.slice(4).split(',').map(anchorXZ); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null; }
  return null;
}
function wallLines(m) {
  const out = [];
  for (const part of m.shape.parts || []) {
    if (part.osm) (GEO.shapes || []).filter(s => s.kind === 'wall').forEach(s => out.push(s.pts.map(p => toXZ(p[0], p[1]))));
    else if (part.via) { const pts = part.via.map(wpt).filter(Boolean); if (pts.length > 1) out.push(pts); }
  }
  return out;
}

// ---------- interface ----------
function applyUI() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('bCompare').title = t('compare'); $('bCompare').setAttribute('aria-label', t('compare')); $('bBase').title = t('basemap'); $('bBase').setAttribute('aria-label', t('basemap'));
  $('bToday').title = t('toggleToday'); $('b2d').title = t('toggle2d'); $('bHome').title = t('home'); $('bList').title = t('list');
  for (const [b, k] of [['bCine', 'cinema'], ['bRec', 'record'], ['bQual', 'quality'], ['bColors', 'colors'], ['bMenu', 'tools']]) { $(b).title = t(k); $(b).setAttribute('aria-label', t(k)); }
  // libellés visibles du menu Outils
  for (const [b, k] of [['bCompare', 'compare'], ['b2d', 'toggle2d'], ['bBase', 'basemap'], ['bToday', 'toggleToday'], ['bRec', 'record'], ['bColors', 'colors'], ['bQual', 'quality'], ['bWallX2', wallX > 1 ? 'wallX2' : 'wallX1'], ['bWater', 'water']]) { const el = $(b) && $(b).querySelector('.tl'); if (el) el.textContent = t(k); }
  $('bWater').onclick = () => { showWater = !showWater; store.set('mdl_j3d_water', showWater ? '1' : '0'); applyUI(); };
  $('bWater').setAttribute('aria-pressed', String(showWater));
  $('bWallX2').onclick = () => { wallX = wallX > 1 ? 1 : 2; store.set('mdl_j3d_wallx', String(wallX)); applyUI(); };
  $('bQual').querySelector('.ti').textContent = quality === 'high' ? 'HD' : 'SD'; $('bColors').setAttribute('aria-pressed', String(!realistic)); $('cineStop').textContent = '✕ ' + t('stop');
  $('bToday').setAttribute('aria-label', t('toggleToday')); $('b2d').setAttribute('aria-label', t('toggle2d')); $('bHome').setAttribute('aria-label', t('home')); $('bList').setAttribute('aria-label', t('list'));
  if (!DATA) return;
  const C = DATA.certainty;
  $('legend').innerHTML = Object.keys(C).map(k => `<span><i style="background:${C[k].color}"></i><em>${esc(tx(C[k].name))}</em></span>`).join('') +
    `<span class="old"><i></i><em>${esc(t('old'))}</em></span><span class="today"><i></i><em>${esc(t('today'))}</em></span><span class="more">${esc(t('exag'))}</span><button type="button" class="more wallx" id="bWallX">↕ ${esc(wallX > 1 ? t('wallX2') : t('wallX1'))}</button><span class="more attrl">${esc(t('attr') + ((GEO && GEO.dem && GEO.dem.source) || '—'))}${cityMesh ? ' · ' + esc(t('city')) : ''}${period === 5 && MUSEUM.group ? ' · 🏛️ OpenBible.info (MIT)' : ''}</span>`;
  const bw = $('bWallX'); if (bw) bw.onclick = e => { e.stopPropagation(); wallX = wallX > 1 ? 1 : 2; store.set('mdl_j3d_wallx', String(wallX)); applyUI(); };
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
  { const ns = DATA.periods.map(x => x.n), i = ns.indexOf(period); const rtl = document.documentElement.dir === 'rtl'; $('pPrev').textContent = rtl ? '›' : '‹'; $('pNext').textContent = rtl ? '‹' : '›'; $('pPrev').disabled = compare || i <= 0; $('pNext').disabled = compare || i >= ns.length - 1; $('pPrev').setAttribute('aria-label', t('prevP')); $('pNext').setAttribute('aria-label', t('nextP')); $('pBig').title = t('pickP'); }
  $('bToday').setAttribute('aria-pressed', String(showToday)); $('bBase').setAttribute('aria-pressed', String(basemap));
  $('pBig').classList.toggle('tl', !compare);
  $('pName').textContent = compare ? '🧱 ' + t('compare') : tx(p.name); if (compare) { $('pDates').textContent = DATA.monuments.filter(m => m.wall).length + ' ' + t('walls'); }
  if (mode2d) draw2d(); else rebuildScene();
}
function museumSheet(id) {
  if (period !== 5 || !MUSEUM.meta) return '';
  const P = MUSEUM.meta.parts.filter(p => p.monument === id && p.label); if (!P.length) return '';
  const C = MUSEUM.meta.classes;
  return `<div class="k">${esc(t('modelParts'))}</div><ul class="cls">${P.map(p => `<li><span class="cb c${p.cls}" title="${esc(tx(C[p.cls]))}">${p.cls}</span> ${esc(tx(p.label))}</li>`).join('')}</ul>
    <p class="clslegend">${['A', 'B', 'C', 'D'].map(k => `<span class="cb c${k}">${k}</span> ${esc(tx(C[k]))}`).join(' · ')}</p>
    <div class="box note">🏛️ ${esc(t('modelCredit'))} <a href="${esc(MUSEUM.meta.source)}" target="_blank" rel="noopener noreferrer">OpenBible.info — Herod's Temple Mount</a> (MIT)</div>`;
}
function srcIcon(k) { return k === 'drive' ? '📄' : k === 'primary' ? '📜' : '🌐'; }
function openSheet(id) {
  const m = DATA.monuments.find(x => x.id === id); if (!m) return;
  selected = id; const C = DATA.certainty[m.certainty], p = DATA.periods.find(x => x.n === m.from);
  const sec = (k, v, cls) => v ? (cls ? `<div class="box ${cls}"><b>${esc(t(k))}:</b> ${esc(tx(v))}</div>` : `<div class="k">${esc(t(k))}</div><p>${esc(tx(v))}</p>`) : '';
  const alt = lang === 'he' ? m.name.fr : m.name.he;
  $('sBody').innerHTML = `<h2 id="sTitle">${esc(tx(m.name))}</h2><div class="altname" lang="${lang === 'he' ? 'fr' : 'he'}" dir="${lang === 'he' ? 'ltr' : 'rtl'}">${esc(alt)}</div>
    <div class="badges"><span class="badge c" style="--c:${C.color}">${esc(tx(C.name))}</span><span class="badge">${esc(t('period'))}: ${esc(tx(p.name))} · ${esc(tx(p.dates))}</span></div>
    ${m.builder ? `<div class="box built">🏗️ <b>${esc(t('builtBy'))}:</b> ${esc(tx(m.builder))}</div>` : ''}<p>${esc(tx(m.text))}</p>${sec('function', m.function)}${sec('events', m.events)}${sec('dims', m.dims)}${sec('remains', m.remains)}${sec('debate', m.debate, 'debate')}${sec('other', m.otherView, 'other')}${sec('note', m.placementNote, 'note')}${SCHEMATIC.has((m.shape || {}).type) ? `<div class="box note">📐 ${esc(t('schem'))}</div>` : ''}
    ${museumSheet(id)}
    <div class="k">${esc(t('sources'))}</div><ul>${m.sources.map(s => `<li>${srcIcon(s.kind)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a> <small style="color:var(--soft)">(${esc(t(s.kind))})</small></li>`).join('')}</ul>
    ${placed.has(id) ? `<div class="acts"><button type="button" id="sShow">${esc(t('show'))}</button>${period !== 12 && !compare ? `<button type="button" id="sToday" class="ghostbtn">🔄 ${esc(t('cmpToday'))}</button>` : ''}</div>` : `<div class="box note">${esc(t('noPos'))}</div>`}`;
  $('sheet').classList.add('open');
  const b = $('sShow'); if (b) b.onclick = () => { $('sheet').classList.remove('open'); flyTo(id); };
  const bt = $('sToday'); if (bt) bt.onclick = () => compareToday(id);
  updateLabelSel();
}
// « Comparer avec aujourd'hui » : même cadrage, période actuelle ; une pastille ramène à la période d'origine.
let backTo = null;
function compareToday(id) {
  $('sheet').classList.remove('open'); if (mode2d) setMode2d(false);
  const keep = camera ? [camera.position.clone(), controls.target.clone()] : null; backTo = period;
  period = 12; store.set('mdl_j3d_period', '12'); renderPeriod();
  if (keep) { camera.position.copy(keep[0]); controls.target.copy(keep[1]); controls.update(); }
  if (placed.has(id)) highlight(id);
  const p = DATA.periods.find(x => x.n === backTo), c = $('backChip'); c.textContent = '↩ ' + tx(p.name); c.hidden = false;
  c.onclick = () => { const k = [camera.position.clone(), controls.target.clone()]; period = backTo; backTo = null; c.hidden = true; store.set('mdl_j3d_period', String(period)); renderPeriod(); camera.position.copy(k[0]); controls.target.copy(k[1]); controls.update(); if (placed.has(id)) highlight(id); };
}
function openList() {
  const items = DATA.monuments.filter(inPeriod), C = DATA.certainty;
  selected = null;
  const row = m => `<button type="button" data-id="${m.id}"><i style="background:${isNow(m) ? C[m.certainty].color : '#bdb5a6'}"></i><span>${esc(tx(m.name))}<small>${esc(tx(C[m.certainty].name))}${placed.has(m.id) ? '' : ' · ' + esc(t('noPos'))}</small></span></button>`;
  $('sBody').innerHTML = `<h2 id="sTitle">${esc(t('all'))}</h2><div class="list">${items.filter(isNow).map(row).join('')}${items.filter(m => !isNow(m)).length ? `<div class="k">${esc(t('old'))}</div>` + items.filter(m => !isNow(m)).map(row).join('') : ''}</div>`;
  $('sheet').classList.add('open');
  $('sBody').querySelectorAll('[data-id]').forEach(b => b.onclick = () => openSheet(b.dataset.id));
}
$('sClose').onclick = () => { $('sheet').classList.remove('open'); selected = null; updateLabelSel(); };
function goPeriod(n) { if (!DATA.periods.some(p => p.n === n)) return; if (compare) { compare = false; $('bCompare').setAttribute('aria-pressed', 'false'); document.body.classList.remove('compare'); } period = n; store.set('mdl_j3d_period', String(period)); backTo = null; $('backChip').hidden = true; $('sheet').classList.remove('open'); selected = null; closePick(); renderPeriod(); { const cur = $('strip').querySelector('[aria-pressed=true]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' }); } if (!mode2d && camera) homeView(true); }
$('strip').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) goPeriod(Number(b.dataset.p)); });
// grand sélecteur d'époque : bouton bien visible + flèches ‹ › + liste des 12 périodes en gros boutons
function closePick() { $('pPick').hidden = true; $('pBig').setAttribute('aria-expanded', 'false'); document.querySelector('.periods').classList.remove('picking'); }
$('pBig').onclick = () => { if (!$('pPick').hidden) return closePick();
  $('pPick').innerHTML = DATA.periods.map(p => `<button type="button" data-p="${p.n}" aria-pressed="${p.n === period}" style="${pickStyle(DATA.periods, p.n)}">${esc(tx(p.name))}<small>${esc(tx(p.dates))}</small></button>`).join('');
  $('pPick').hidden = false; $('pBig').setAttribute('aria-expanded', 'true'); document.querySelector('.periods').classList.add('picking');
  const cur = $('pPick').querySelector('[aria-pressed=true]'); if (cur) cur.scrollIntoView({ block: 'nearest' }); };
$('pPick').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) goPeriod(Number(b.dataset.p)); });
const stepPeriod = d => { const ns = DATA.periods.map(p => p.n), i = ns.indexOf(period); if (ns[i + d] !== undefined) goPeriod(ns[i + d]); };
$('pPrev').onclick = () => stepPeriod(-1); $('pNext').onclick = () => stepPeriod(1);
$('pCount').onclick = openList; $('bList').onclick = openList;
$('bToday').onclick = () => { showToday = !showToday; store.set('mdl_j3d_today', showToday ? '1' : '0'); renderPeriod(); };
$('legend').onclick = () => $('legend').classList.toggle('full');
$('bHome').onclick = () => { if (!mode2d) homeView(true); };
$('b2d').onclick = () => setMode2d(!mode2d);
$('bCompare').onclick = () => { compare = !compare; $('bCompare').setAttribute('aria-pressed', String(compare)); document.body.classList.toggle('compare', compare); if (compare) openCompare(); else $('sheet').classList.remove('open'); renderPeriod(); if (!mode2d && camera) homeView(true); };
$('bBase').onclick = () => { basemap = !basemap; store.set('mdl_j3d_base', basemap ? '1' : '0'); $('bBase').setAttribute('aria-pressed', String(basemap)); applyBasemap(); };
$('bMenu').onclick = e => { e.stopPropagation(); const o = !$('toolsMenu').classList.contains('open'); $('toolsMenu').classList.toggle('open', o); $('bMenu').setAttribute('aria-expanded', String(o)); };
$('toolsMenu').addEventListener('click', e => { if (e.target.closest('button')) setTimeout(() => { $('toolsMenu').classList.remove('open'); $('bMenu').setAttribute('aria-expanded', 'false'); }, 150); });
document.addEventListener('click', e => { if (!e.target.closest('#toolsMenu,#bMenu')) $('toolsMenu').classList.remove('open'); });
$('bCine').onclick = () => { if (cine) stopCinema(); else startCinema(false); };
$('bRec').onclick = () => { if (cine) stopCinema(); else startCinema(true); };
$('cineStop').onclick = () => stopCinema();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && cine) stopCinema(); });
$('bQual').onclick = () => { store.set('mdl_j3d_q', quality === 'high' ? 'low' : 'high'); location.reload(); };
$('bColors').onclick = () => { realistic = !realistic; store.set('mdl_j3d_real', realistic ? '1' : '0'); $('bColors').setAttribute('aria-pressed', String(!realistic)); renderPeriod(); };
function openCompare() {
  const W = DATA.monuments.filter(m => m.wall), C = DATA.certainty;
  $('sBody').innerHTML = `<h2 id="sTitle">🧱 ${esc(t('compare'))}</h2><p style="color:var(--soft);font-size:14px">${esc(t('compareHint'))}</p>
    <div class="list">${W.map(m => { const p = DATA.periods.find(x => x.n === m.from); return `<label class="wrow"><input type="checkbox" data-w="${m.id}" ${hiddenWalls.has(m.id) ? '' : 'checked'}><i style="background:${m.shape.color}"></i><span>${esc(tx(m.name))}<small>🏗️ ${esc(tx(m.builder || p.name))} · ${esc(tx(C[m.certainty].name))}</small></span><button type="button" data-id="${m.id}" aria-label="ℹ️">ℹ️</button></label>`; }).join('')}</div>
    <div class="acts"><button type="button" id="wAll">${esc(t('showAll'))}</button><button type="button" id="wNone" style="background:#26355f;color:#fff">${esc(t('hideAll'))}</button></div>`;
  $('sheet').classList.add('open');
  $('sBody').querySelectorAll('[data-w]').forEach(c => c.onchange = () => { if (c.checked) hiddenWalls.delete(c.dataset.w); else hiddenWalls.add(c.dataset.w); renderPeriod(); });
  $('sBody').querySelectorAll('[data-id]').forEach(b => b.onclick = e => { e.preventDefault(); openSheet(b.dataset.id); });
  $('wAll').onclick = () => { hiddenWalls.clear(); renderPeriod(); openCompare(); };
  $('wNone').onclick = () => { W.forEach(m => hiddenWalls.add(m.id)); renderPeriod(); openCompare(); };
}
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { lang = b.dataset.lang; store.set('mdl_mode_lang', lang); applyUI(); });

// ---------- scène 3D ----------
// Qualité : « high » (ordinateur, télévision : occlusion ambiante GTAO + anticrénelage SMAA + ombres 4096) ou « low » (téléphone).
let quality = new URLSearchParams(location.search).get('q') || store.get('mdl_j3d_q', (window.matchMedia && matchMedia('(pointer:coarse)').matches) ? 'low' : 'high');
let realistic = store.get('mdl_j3d_real', '1') === '1';
let showWater = store.get('mdl_j3d_water', '1') === '1'; // vallées et eau
let wallX = Number(store.get('mdl_j3d_wallx', '2')) === 1 ? 1 : 2; // murailles : hauteur ×2 pour la lisibilité (indiqué dans la légende), ou hauteur réelle // matériaux réalistes ; sinon couleurs de certitude
let sun, sky, terrainMesh, terrainMatPlain, terrainMatMap, cityMesh = null, renderer, composer = null, scene, camera, controls, world, labelsEl = $('labels'), labels = [], pickables = [], placed = new Set(), raf = 0, hlBox = null;
const MAT = {};
function mat(color, opts) { const k = color + JSON.stringify(opts || {}); return MAT[k] || (MAT[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, opts || {}))); }
function webglOK() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const SUN = { elevation: 34, azimuth: 235 }; // soleil d'après-midi au sud-ouest : ombres longues sur les murailles
function init3d() {
  const hi = quality === 'high';
  renderer = new THREE.WebGLRenderer({ antialias: !hi, powerPreference: hi ? 'high-performance' : 'low-power', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 2 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
  $('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.fog = new THREE.Fog('#d9dfe2', 2200, 9000);
  camera = new THREE.PerspectiveCamera(45, 1, 2, 30000);
  // ciel physique (diffusion de Rayleigh/Mie) et éclairage d'environnement tiré du même ciel
  sky = new Sky(); sky.scale.setScalar(25000); scene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  const sp = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN.elevation), THREE.MathUtils.degToRad(SUN.azimuth)); u.sunPosition.value.copy(sp);
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), sky2 = new Sky(); sky2.scale.setScalar(1000); Object.keys(u).forEach(k => sky2.material.uniforms[k].value = u[k].value); envScene.add(sky2);
  scene.environment = pm.fromScene(envScene).texture; scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight('#eef4ff', '#8a7356', 0.35));
  sun = new THREE.DirectionalLight('#fff0d8', 3.2); sun.position.copy(sp).multiplyScalar(2500); sun.castShadow = true;
  const sm = hi ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm); Object.assign(sun.shadow.camera, { left: -1300, right: 1300, top: 1300, bottom: -1300, near: 200, far: 6000 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8; scene.add(sun, sun.target);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 25; controls.maxDistance = 4000; controls.screenSpacePanning = false;
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
    if (cine || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const r = renderer.domElement.getBoundingClientRect(); v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, camera);
    const targets = museumActive() ? [world, MUSEUM.group] : [world];
    const hit = ray.intersectObjects(targets, true).find(h => idOf(h.object) || (MUSEUM.group && h.object.parent && isMuseum(h.object)));
    if (hit) { const id = idOf(hit.object) || museumPick(hit.point); document.dispatchEvent(new CustomEvent('mdj3d-pick', { detail: id })); if (!pickMode) openSheet(id); }
  });
  window.addEventListener('resize', resize); resize(); homeView(false); loop(); loadCity();
}
function isMuseum(o) { while (o) { if (o === MUSEUM.group) return true; o = o.parent; } return false; }
function idOf(o) { while (o) { if (o.userData && o.userData.id) return o.userData.id; o = o.parent; } return null; }
function resize() { if (!renderer) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h); if (composer) composer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1 ? 60 : 42; camera.updateProjectionMatrix(); }
function buildTerrain() {
  // Relief SRTM sur-échantillonné ×3 (interpolation bilinéaire : aucune information ajoutée), ombré, texturé.
  const d = GEO.dem, g = new THREE.BufferGeometry(), pos = [], col = [], idx = [], uv = [];
  const hmax = Math.max(...demH.filter(v => v != null)), lo = new THREE.Color('#a39478'), mid = new THREE.Color('#cdbf9f'), hi = new THREE.Color('#e8dfca'), c = new THREE.Color();
  const S = 3, E = d.west + (d.cols - 1) * d.stepLon, Sth = d.north - (d.rows - 1) * d.stepLat;
  const my = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)), myN = my(d.north), myS = my(Sth);
  // bordure : au-delà de la zone mesurée, le relief est prolongé à plat (hauteur du bord) jusqu'à l'horizon — pas de « table »
  const PAD = [150, 400, 900, 1800, 3500, 7000], dLat = m => m / KZ, dLon = m => m / KX;
  const LATS = [...PAD.slice().reverse().map(p => d.north + dLat(p)), ...Array.from({ length: (d.rows - 1) * S + 1 }, (_, r) => d.north - r * d.stepLat / S), ...PAD.map(p => Sth - dLat(p))];
  const LONS = [...PAD.slice().reverse().map(p => d.west - dLon(p)), ...Array.from({ length: (d.cols - 1) * S + 1 }, (_, k) => d.west + k * d.stepLon / S), ...PAD.map(p => E + dLon(p))];
  const rows = LATS.length, cols = LONS.length;
  let edgeMean = 0, en = 0; for (let k = 0; k < d.cols; k++) for (const rr of [0, d.rows - 1]) { const v = demH[rr * d.cols + k]; if (v != null) { edgeMean += (v - demMin) * EXAG; en++; } } edgeMean /= Math.max(1, en);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const lat = LATS[r], lon = LONS[k], [x, z] = toXZ(lat, lon), pad = Math.max(r < PAD.length ? PAD.length - r : r >= rows - PAD.length ? r - rows + PAD.length + 1 : 0, k < PAD.length ? PAD.length - k : k >= cols - PAD.length ? k - cols + PAD.length + 1 : 0);
    const fade = Math.min(1, pad / 3), y = ground(x, z) * (1 - fade) + edgeMean * fade, f = (pad ? 0.5 : y / EXAG / Math.max(1, hmax - demMin));
    pos.push(x, y, z); uv.push(Math.min(1, Math.max(0, (lon - d.west) / (E - d.west))), Math.min(1, Math.max(0, (my(lat) - myS) / (myN - myS))));
    if (f < 0.5) c.copy(lo).lerp(mid, f * 2); else c.copy(mid).lerp(hi, (f - 0.5) * 2);
    // variation lente de teinte (casse la répétition de la texture vue de loin) — purement visuelle
    const nz = Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.014 + 0.7) + 0.5 * Math.sin(x * 0.037 - z * 0.029 + 2.1); c.multiplyScalar(1 + 0.055 * nz); col.push(c.r, c.g, c.b);
  }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols - 1; k++) { const a = r * cols + k, b = a + 1, cc = a + cols, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // pentes raides = roche plus claire, fonds de vallée = terre plus sombre
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { const slope = 1 - n.getY(i), k = 1 + slope * 0.6; col[i * 3] = Math.min(1, col[i * 3] * k); col[i * 3 + 1] = Math.min(1, col[i * 3 + 1] * k); col[i * 3 + 2] = Math.min(1, col[i * 3 + 2] * (k + 0.05)); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  terrainMatPlain = groundMaterial();
  terrainMesh = new THREE.Mesh(g, terrainMatPlain); terrainMesh.receiveShadow = true; scene.add(terrainMesh);
  // grand sol au-delà de la zone, pour un horizon propre
  if (basemap) applyBasemap();
}
// Carte de fond OpenStreetMap drapée sur le relief (tuiles z16 ; attribution dans la légende).
let baseTex = null, baseLoading = false;
function applyBasemap() {
  if (!terrainMesh) return;
  if (!basemap) { terrainMesh.material = terrainMatPlain; return; }
  if (terrainMatMap) { terrainMesh.material = terrainMatMap; return; }
  if (baseLoading) return; baseLoading = true;
  const d = GEO.dem, z = 16, E = d.west + (d.cols - 1) * d.stepLon, Sth = d.north - (d.rows - 1) * d.stepLat;
  const tX = lon => (lon + 180) / 360 * 2 ** z, tY = lat => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
  const x0 = Math.floor(tX(d.west)), x1 = Math.floor(tX(E)), y0 = Math.floor(tY(d.north)), y1 = Math.floor(tY(Sth));
  const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256; const g = cv.getContext('2d'), jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { g.drawImage(im, (x - x0) * 256, (y - y0) * 256); res(true); }; im.onerror = () => res(false); im.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`; }));
  Promise.all(jobs).then(ok => {
    baseLoading = false; if (!ok.some(Boolean)) { basemap = false; $('bBase').setAttribute('aria-pressed', 'false'); return; }
    const px = lon => (tX(lon) - x0) * 256, py = lat => (tY(lat) - y0) * 256, out = document.createElement('canvas');
    out.width = Math.round(px(E) - px(d.west)); out.height = Math.round(py(Sth) - py(d.north));
    out.getContext('2d').drawImage(cv, px(d.west), py(d.north), out.width, out.height, 0, 0, out.width, out.height);
    baseTex = new THREE.CanvasTexture(out); baseTex.colorSpace = THREE.SRGBColorSpace; baseTex.anisotropy = 8;
    terrainMatMap = new THREE.MeshStandardMaterial({ map: baseTex, roughness: 1 }); if (basemap) terrainMesh.material = terrainMatMap;
  });
}
// Bâtiments ACTUELS (OpenStreetMap, récupérés au déploiement) : contexte « ville d'aujourd'hui », jamais présentés comme anciens.
function loadCity() {
  fetch('jerusalem3d/buildings.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(B => {
    if (!B || !B.b || !scene) return;
    // les bâtiments posés sur l'esplanade (dôme du Rocher, al-Aqsa…) sont modélisés à part : retirés de la « ville fantôme »
    const tm = shapeByName('Temple Mount'), TP = tm ? tm.pts.map(p => toXZ(p[0], p[1])) : null;
    const inTM = (x, z) => { if (!TP) return false; let c = false; for (let i = 0, j = TP.length - 1; i < TP.length; j = i++) { const [xi, zi] = TP[i], [xj, zj] = TP[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const geos = [], out = [];
    for (const b of B.b) {
      const h = b[0], P = []; for (let i = 1; i < b.length; i += 2) P.push(toXZ(B.lat0 + b[i] / 1e6, B.lon0 + b[i + 1] / 1e6));
      if (P.length < 3) continue;
      const gy = Math.min(...P.map(([x, z]) => ground(x, z)));
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: h + 1.5, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, gy - 1.5, 0); const ng = g.toNonIndexed(); geos.push(ng);
      const c = centroid(P); if (!inTM(c[0], c[1])) out.push(ng);
    }
    if (!geos.length) return;
    citySolid = stone('plaster', { tint: '#f3ece0' });
    cityGhost = new THREE.MeshStandardMaterial({ color: '#fbf3e4', roughness: 1, transparent: true, opacity: 0.36, depthWrite: false });
    cityMesh = new THREE.Mesh(mergeGeometries(geos, false), citySolid); cityMesh.castShadow = true; cityMesh.receiveShadow = true; scene.add(cityMesh);
    cityGhostMesh = new THREE.Mesh(mergeGeometries(out.length ? out : geos, false), cityGhost); cityGhostMesh.renderOrder = 2; scene.add(cityGhostMesh);
    styleCity(); $('legend').dataset.city = '1'; applyUI();
  }).catch(() => {});
}
let cityGhost = null, citySolid = null, cityGhostMesh = null;
// La ville d'aujourd'hui (OpenStreetMap) : pleine à l'époque ottomane et aujourd'hui ; ailleurs en transparence, comme repère
// (anachronique, assumé et signalé dans la légende). Le bouton 〰️ la masque.
function styleCity() {
  if (!cityMesh) return;
  const on = showToday && !compare, solid = period >= 11;
  cityMesh.visible = on && solid; cityGhostMesh.visible = on && !solid;
}
// Muraille en volume qui suit le relief (segments de ~8 m, une seule InstancedMesh).
function wallMesh(lines, h, thick, material, lift = 0) {
  const segs = [];
  lines.forEach(L => { for (let i = 1; i < L.length; i++) { const [x1, z1] = L[i - 1], [x2, z2] = L[i], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 8));
    for (let k = 0; k < n; k++) segs.push([x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, x1 + (x2 - x1) * (k + 1) / n, z1 + (z2 - z1) * (k + 1) / n]); } });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, segs.length), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  segs.forEach(([x1, z1, x2, z2], i) => { const len = Math.hypot(x2 - x1, z2 - z1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, gy = Math.min(ground(x1, z1), ground(x2, z2), ground(mx, mz)) - 2;
    q.setFromAxisAngle(up, -Math.atan2(z2 - z1, x2 - x1)); M4.compose(lift ? new THREE.Vector3(mx, gy + 2 + lift + 0.3, mz) : new THREE.Vector3(mx, gy + (h + 2) / 2, mz), q, new THREE.Vector3(len + 0.6, lift ? 0.6 : h + 2, thick)); im.setMatrixAt(i, M4); });
  im.castShadow = true; im.receiveShadow = true; return im;
}
function wallTop(x, z) { return ground(x, z); }
function lineMid(lines) { let best = null, bl = -1; lines.forEach(L => { let l = 0; for (let i = 1; i < L.length; i++) l += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); if (l > bl) { bl = l; best = L; } }); return best ? best[Math.floor(best.length / 2)] : null; }
function homeView(anim) {
  const pts = compare ? DATA.monuments.filter(m => m.wall).flatMap(m => wallLines(m).flat()) : DATA.monuments.filter(m => isNow(m) && m.anchor && anchorXZ(m.anchor)).map(m => anchorXZ(m.anchor));
  if (!compare) DATA.monuments.filter(m => isNow(m) && m.wall).forEach(m => { const c = lineMid(wallLines(m)); if (c) pts.push(c); });
  const a = anchorXZ('jaffa_gate'), b = anchorXZ('lions_gate');
  if (pts.length < 2 && a && b) pts.push(a, b);
  const c = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [0, 0];
  const spread = Math.max(150, ...pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])));
  const dist = Math.max(600, Math.min(2000, spread * 2.9)), gy = ground(c[0], c[1]);
  const target = new THREE.Vector3(c[0], gy, c[1] + 30), eye = new THREE.Vector3(c[0] - dist * 0.32, gy + dist * 0.55, c[1] + dist * 0.78);
  if (anim) tween(eye, target); else { camera.position.copy(eye); controls.target.copy(target); controls.update(); }
}
let tw = null;
function tween(eye, target, dur = 1100) { tw = { t0: performance.now(), dur, e0: camera.position.clone(), t0v: controls.target.clone(), e1: eye, t1: target }; }
function objectsOf(id) { const out = []; world.traverse(o => { if (o.userData && o.userData.id === id && o.parent === world) out.push(o); }); return out; }
function boundsOf(id) { if (museumActive() && MUSEUM.bounds[id]) return MUSEUM.bounds[id].clone(); const b = new THREE.Box3(); objectsOf(id).forEach(o => b.expandByObject(o)); return b; }
function flyTo(id) {
  if (mode2d) return; const b = boundsOf(id); if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), s = Math.max(70, b.getSize(new THREE.Vector3()).length());
  tween(new THREE.Vector3(c.x - s * 0.9, c.y + s * 0.75, c.z + s * 1.15), c); highlight(id);
}
function highlight(id) {
  if (hlBox) { scene.remove(hlBox); hlBox = null; }
  if (!id) return; const b = boundsOf(id); if (b.isEmpty()) return;
  hlBox = new THREE.Box3Helper(b, new THREE.Color('#ffd24a')); scene.add(hlBox); selected = id; updateLabelSel();
}
function disposeTree(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.isInstancedMesh) c.dispose(); }); }
function clearWorld() { while (world.children.length) { const o = world.children.pop(); disposeTree(o); } pickables = []; placed = new Set(); labels.forEach(l => l.el.remove()); labels = []; if (hlBox) { scene.remove(hlBox); hlBox = null; } }
// Ajoute un objet (maillage ou groupe) lié à une fiche. En mode « couleurs de certitude », remplace les matériaux.
function add(obj, m, now, certColor) {
  obj.userData.id = m.id; obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  // Mode réaliste : un édifice encore debout garde ses vrais matériaux (le Dôme du Rocher reste doré à l'époque ottomane) ;
  // l'étiquette grise et la fiche indiquent la période d'origine. Seuls les repères simples passent en pierre grise.
  if (realistic && !now && certColor === 'plain') { const gm = stone('ashlar', { tint: '#bdb5a6' }); obj.traverse(c => { if (c.isMesh) c.material = gm; }); }
  else if (realistic && !now) { /* matériaux réels */ }
  else if (!realistic || !now && certColor !== false) {
    const col = now ? DATA.certainty[m.certainty].color : '#bdb5a6', fm = flat(col, m.certainty === 'hypothesis' && now ? { transparent: true, opacity: 0.6 } : {});
    obj.traverse(c => { if (c.isMesh) c.material = fm; });
  } else if (m.certainty === 'hypothesis') {
    // hypothèse : rendu réaliste mais translucide, pour ne jamais la confondre avec un vestige attesté
    obj.traverse(c => { if (c.isMesh) { const mm = c.material.clone(); mm.transparent = true; mm.opacity = 0.72; mm.depthWrite = true; c.material = mm; } });
  }
  world.add(obj); placed.add(m.id); return obj;
}
function label(m, x, y, z, now, stack, color) {
  const el = document.createElement('div'); el.className = 'lb' + (now ? '' : ' old') + (m.wall ? ' wl' : ''); el.textContent = (m.wall ? '▬ ' : '') + tx(m.name);
  if (m.builder) { const s = document.createElement('small'); s.textContent = tx(m.builder); el.appendChild(s); }
  el.style.setProperty('--c', color || (now ? DATA.certainty[m.certainty].color : '#bdb5a6')); el.onclick = () => openSheet(m.id); labelsEl.appendChild(el);
  labels.push({ el, p: new THREE.Vector3(x, y, z), id: m.id, dy: stack * 24, pr: (now ? 0 : 2) + (m.wall ? 1 : 0) });
}
function updateLabelSel() { labels.forEach(l => l.el.classList.toggle('sel', l.id === selected)); }
// Repère de l'esplanade : centre, axes est et sud, niveau du dallage.
let TM = null;
function tmFrame() {
  const tm = shapeByName('Temple Mount'); if (!tm) return null;
  const f = frameOf(tm), east = [f.uz, -f.ux], south = [f.ux, f.uz];
  return Object.assign(f, { east, south, yaw: -Math.atan2(east[1], east[0]), top: ground(f.cx, f.cz) + 4.8, pts: tm.pts.map(p => toXZ(p[0], p[1])) });
}
const tmTop = f => (TM ? TM.top : ground(f.cx, f.cz) + 4.8);
function cub(v, unit) { return unit === 'cubit' ? v * DATA.cubitMeters : v; }
function box(w, h, d, color, x, y, z, rotY, opts) { const g = new THREE.BoxGeometry(w, h, d); const o = new THREE.Mesh(g, mat(color, opts)); o.position.set(x, y + h / 2, z); if (rotY) o.rotation.y = rotY; return o; }
function place(g, x, y, z, yaw) { g.position.set(x, y, z); g.rotation.y = yaw || 0; return g; }
function outlinePts(name) { // le plus grand contour de ce nom (ex. Dôme du Rocher : l'octogone de 52 m, pas le tambour de 24 m)
  const area = s => { const P = s.pts.map(p => toXZ(p[0], p[1])), xs = P.map(p => p[0]), zs = P.map(p => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)); };
  const s = (GEO.shapes || []).filter(x => x.kind === 'outline' && x.name === name).sort((a, b) => area(b) - area(a))[0]; if (!s) return null; const P = s.pts.map(p => toXZ(p[0], p[1])); if (P.length > 2 && Math.hypot(P[0][0] - P.at(-1)[0], P[0][1] - P.at(-1)[1]) < 0.5) P.pop(); return P; }
// Hippicus et Mariamne : Josèphe dit seulement qu'elles se dressaient « tout près » de Phasaël, sur la première muraille, au nord du palais,
// et que la muraille commençait à Hippicus (5.144). Placement schématique le long de la muraille : Hippicus à l'ouest, Mariamne à l'est.
function herodTowerPos(type) { const t = anchorXZ('herodian_tower') || anchorXZ('tower_of_david'), e = anchorXZ('israelite_tower'); if (!t || !e) return null; const L = Math.hypot(e[0] - t[0], e[1] - t[1]), u = [(e[0] - t[0]) / L, (e[1] - t[1]) / L], d = type === 'hippicus' ? -36 : 32; return [t[0] + u[0] * d, t[1] + u[1] * d]; }
function nearestOnTM(p) { let best = p, bd = Infinity; const P = TM.pts; for (let i = 1; i < P.length; i++) { const [x1, z1] = P[i - 1], [x2, z2] = P[i], L2 = (x2 - x1) ** 2 + (z2 - z1) ** 2 || 1, t = Math.max(0, Math.min(1, ((p[0] - x1) * (x2 - x1) + (p[1] - z1) * (z2 - z1)) / L2)), q = [x1 + t * (x2 - x1), z1 + t * (z2 - z1)], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } } return best; }
function centroid(P) { return [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length]; }
// bords de l'esplanade, avec normale intérieure et orientation (sud = Portique royal)
function tmEdges() {
  const P = TM.pts, out = [];
  for (let i = 1; i < P.length; i++) { const [x1, z1] = P[i - 1], [x2, z2] = P[i], L = Math.hypot(x2 - x1, z2 - z1); if (L < 25) continue;
    let nx = -(z2 - z1) / L, nz = (x2 - x1) / L; const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; if (nx * (TM.cx - mx) + nz * (TM.cz - mz) < 0) { nx = -nx; nz = -nz; }
    out.push({ x1, z1, x2, z2, L, inward: [nx, nz], south: -(nx * TM.south[0] + nz * TM.south[1]) > 0.7, north: (nx * TM.south[0] + nz * TM.south[1]) > 0.7 }); }
  return out;
}
const SCHEMATIC = new Set(['eccehomo', 'pilgrimroad', 'siloam', 'hippicus', 'mariamne', 'gate', 'hadrian', 'cardo', 'temple', 'porticoes', 'royalstoa', 'antonia', 'palace', 'sepulchre_byz', 'nea', 'phasael', 'wilson']);
const PERIOD_STONE = { 12: ['ottoman', '#ffffff'], 1: ['ashlar', '#cfbb93'], 2: ['ashlar', '#d6c39b'], 3: ['ashlar', '#d6c39b'], 4: ['herodian', '#efe3cb'], 5: ['herodian', '#f2e8d5'], 6: ['ashlar', '#e3d6bb'], 7: ['ashlar', '#e8dcc2'], 8: ['ashlar', '#e2d3b4'], 9: ['ashlar', '#e2d3b4'], 11: ['ottoman', '#ffffff'] };
// Construit un monument « réaliste » selon son type ; renvoie [objet, point d'étiquette] ou null.
function buildModel(m, sh, now) {
  const C = DATA.cubitMeters, at = m.anchor ? anchorXZ(m.anchor) : null;
  switch (sh.type) {
    case 'osm': { if (!TM) return null;
      const sp = new THREE.Shape(TM.pts.map(([x, z]) => new THREE.Vector2(x, -z))), base = Math.min(...TM.pts.map(([x, z]) => ground(x, z))) - 2;
      const g = new THREE.ExtrudeGeometry(sp, { depth: TM.top - base, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
      const o = new THREE.Mesh(g, [stone('paving', { tint: '#efe6d4' }), stone(period >= 11 ? 'ashlar' : 'herodian', { tint: '#f1e7d3' })]);
      return [o, [TM.cx, TM.top + 10, TM.cz]]; }
    case 'temple': { if (!TM) return null; const P = outlinePts('Dome of the Rock'), c = P ? centroid(P) : at; if (!c) return null;
      const g = MD.temple(C); place(g, c[0], TM.top, c[1], TM.yaw); return [g, [c[0], TM.top + 58, c[1]]]; }
    case 'porticoes': { if (!TM) return null; const g = new THREE.Group();
      tmEdges().filter(e => !e.south).forEach(e => g.add(MD.portico(e.x1, e.z1, e.x2, e.z2, e.inward, TM.top, C)));
      const e = tmEdges().find(e => e.north) || tmEdges()[0]; return [g, [(e.x1 + e.x2) / 2, TM.top + 20, (e.z1 + e.z2) / 2]]; }
    case 'royalstoa': { if (!TM) return null; const e = tmEdges().filter(e => e.south).sort((a, b) => b.L - a.L)[0]; if (!e) return null;
      const g = MD.royalStoa(e.x1, e.z1, e.x2, e.z2, e.inward, TM.top); return [g, [(e.x1 + e.x2) / 2 + e.inward[0] * 18, TM.top + 38, (e.z1 + e.z2) / 2 + e.inward[1] * 18]]; }
    case 'robinson': { if (!TM) return null; const sw = tmCorner('SW'); if (!sw) return null; const n = [-TM.south[0], -TM.south[1]];
      const x = sw[0] + n[0] * 19.6, z = sw[1] + n[1] * 19.6, street = ground(x - TM.east[0] * 12, z - TM.east[1] * 12);
      // après 70 : seul le départ de l'arc subsiste (vestige visible aujourd'hui)
      const g = now ? MD.robinsonArch(0, Math.max(10, TM.top - street)) : MD.box(3, 2.5, 15.2, stone('herodian'), -1.5, Math.max(10, TM.top - street) - 6, 0); place(g, x, street, z, TM.yaw); return [g, [x - TM.east[0] * 10, TM.top + 8, z]]; }
    case 'wilson': { if (!TM || !at) return null; const w0 = nearestOnTM(at), street = ground(w0[0] - TM.east[0] * 25, w0[1] - TM.east[1] * 25);
      const g = MD.wilsonBridge(TM.top - street, 0, 40); place(g, w0[0], street, w0[1], TM.yaw); return [g, [at[0] - TM.east[0] * 20, TM.top + 8, at[1] - TM.east[1] * 20]]; }
    case 'hulda': case 'steps': { if (!TM || !at) return null; const e = tmEdges().filter(e => e.south).sort((a, b) => b.L - a.L)[0]; if (!e) return null;
      const ux = (e.x2 - e.x1) / e.L, uz = (e.z2 - e.z1) / e.L, sgn = ux * TM.east[0] + uz * TM.east[1] > 0 ? 1 : -1, ex = ux * sgn, ez = uz * sgn;
      const s = (at[0] - e.x1) * ux + (at[1] - e.z1) * uz, px = e.x1 + ux * s - e.inward[0] * 0.6, pz = e.z1 + uz * s - e.inward[1] * 0.6, yaw = -Math.atan2(ez, ex);
      if (sh.type === 'hulda') { const g = MD.huldaGates(ground(px, pz), 70); place(g, px, 0, pz, yaw); return [g, [px, ground(px, pz) + 18, pz]]; }
      const dx = px - ex * 35, dz = pz - ez * 35, g = MD.southernSteps(64, 20, 6); place(g, dx, ground(dx, dz) - 1, dz, yaw); return [g, [dx, ground(dx, dz) + 10, dz - e.inward[1] * 10]]; }
    case 'antonia': { if (!at || !TM) return null;
      // repère Wikidata, puis recul vers le nord jusqu'au bord nord de l'esplanade (la forteresse la jouxtait sans la recouvrir)
      const e = tmEdges().filter(e => e.north).sort((a, b) => b.L - a.L)[0]; let c = at;
      if (e) { const d = (at[0] - e.x1) * e.inward[0] + (at[1] - e.z1) * e.inward[1]; if (d > -21) c = [at[0] - e.inward[0] * (d + 21), at[1] - e.inward[1] * (d + 21)]; }
      const g = MD.antonia(C, 112, 40); place(g, c[0], ground(c[0], c[1]), c[1], TM.yaw); return [g, [c[0], ground(...c) + 42, c[1]]]; }
    case 'hippicus': case 'mariamne': { const p = herodTowerPos(sh.type); if (!p) return null; const gy = ground(p[0], p[1]) - 1;
      const g = sh.type === 'hippicus' ? MD.hippicus(C) : MD.mariamne(C); place(g, p[0], gy, p[1], TM ? TM.yaw : 0); return [g, [p[0], gy + (sh.type === 'hippicus' ? 44 : 29), p[1]]]; }
    case 'hadrian': { if (!at || period > 8) return null; const g = MD.hadrianArch(); place(g, at[0], ground(at[0], at[1]) - 0.5, at[1], nearestWallYaw(at[0], at[1])); return [g, [at[0], ground(...at) + 22, at[1]]]; }
    case 'eccehomo': { if (!at) return null; // arc à trois baies d'Hadrien en travers de la rue ; après l'Antiquité : arche centrale et arche nord seulement
      const g = MD.hadrianArch({ towers: false, sides: now ? [-1, 1] : [-1], attic: now }); place(g, at[0], ground(at[0], at[1]) - 0.5, at[1], (TM ? TM.yaw : 0) + Math.PI / 2); return [g, [at[0], ground(...at) + 18, at[1]]]; }
    case 'gate': { if (!at) return null; const kind = /damascus/.test(m.id) ? 'damascus' : /golden/.test(m.id) ? 'golden' : 'plain';
      const g = MD.ottomanGate(kind === 'damascus' ? { w: 15, h: 14, span: 5, openH: 7, kind } : kind === 'golden' ? { w: 22, h: 12, span: 5, openH: 6, d: 16, kind } : /jaffa/.test(m.id) ? { w: 17, h: 15 } : {});
      if (wallX > 1) g.scale.setScalar(1.8); // suit l'agrandissement d'affichage des murailles
      place(g, at[0], ground(at[0], at[1]) - 0.8, at[1], nearestWallYaw(at[0], at[1])); return [g, [at[0], ground(...at) + 22 * (wallX > 1 ? 1.8 : 1), at[1]]]; }
    case 'pilgrimroad': { const pts = (sh.via || []).map(wpt).filter(Boolean); if (pts.length < 2) return null; const g = MD.pilgrimRoad(pts, ground); const c = pts[1]; return [g, [c[0], ground(...c) + 14, c[1]]]; }
    case 'siloam': { if (!at) return null; const g = MD.siloamPool(), gy = ground(at[0], at[1]); g.position.set(at[0], gy - 0.3 + g.position.y, at[1]); return [g, [at[0], ground(...at) + 12, at[1]]]; }
    case 'phasael': { if (!at) return null; const g = now ? MD.phasael(C) : MD.box(40 * C, 20, 40 * C, stone('herodian')); place(g, at[0], ground(at[0], at[1]) - 1, at[1], TM ? TM.yaw : 0); return [g, [at[0], ground(...at) + 48, at[1]]]; }
    case 'palace': { const t0 = anchorXZ('herodian_tower') || anchorXZ('tower_of_david'); if (!t0) return null; const s = TM ? TM.south : [0, 1], cx = t0[0] + s[0] * 165, cz = t0[1] + s[1] * 165;
      const g = MD.herodPalace(300, 55, 5); place(g, cx, ground(cx, cz) - 1, cz, TM ? TM.yaw : 0); return [g, [cx, ground(cx, cz) + 26, cz]]; }
    case 'sepulchre_byz': { const P = outlinePts('Church of the Holy Sepulchre'); const c = P ? centroid(P) : at; if (!c) return null; const e = TM ? TM.east : [1, 0], yaw = TM ? TM.yaw : 0, g = new THREE.Group();
      const rot = MD.rotunda(35, 14); rot.position.set(-30, 0, 0); g.add(rot);
      const bas = MD.basilica(58, 40, 20, { apse: false }); bas.position.set(35, 0, 0); g.add(bas);
      g.add(MD.box(22, 0.3, 40, stone('paving'), 4, 0, 0)); g.add(MD.box(26, 0.3, 40, stone('paving'), 77, 0, 0)); // cour à portiques et atrium (schématiques)
      place(g, c[0], ground(c[0], c[1]) - 0.5, c[1], yaw); return [g, [c[0], ground(...c) + 30, c[1]]]; }
    case 'sepulchre': { const P = outlinePts('Church of the Holy Sepulchre'); if (!P) return null; const c = centroid(P), e = TM ? TM.east : [1, 0];
      const rel = P.map(([x, z]) => [x - c[0], z - c[1]]);
      const g = MD.footprintBuilding(rel, 17, 'ashlar', [{ x: -e[0] * 24, z: -e[1] * 24, r: 10.5, mat: lead(), drum: 6, squash: 0.95 }, { x: e[0] * 6, z: e[1] * 6, r: 5.5, mat: lead(), drum: 6 }]);
      place(g, c[0], Math.min(...P.map(p => ground(...p))) - 0.5, c[1], 0); return [g, [c[0], ground(...c) + 40, c[1]]]; }
    case 'nea': { if (!at) return null; const g = MD.basilica(100, 52, 24, { apse: true, atrium: 30 }); place(g, at[0], ground(at[0], at[1]) - 0.5, at[1], TM ? TM.yaw : 0); return [g, [at[0], ground(...at) + 34, at[1]]]; }
    case 'cardo': { const pts = (sh.via || []).map(wpt).filter(Boolean); if (pts.length < 2) return null; const g = now ? MD.cardo(pts, ground) : MD.cardo(pts, ground, { paveOnly: true });
      if (!now && period === 12 && sh.restored) { const rp = sh.restored.map(wpt).filter(Boolean); if (rp.length > 1) g.add(MD.cardo(rp, ground)); } // tronçon fouillé et restauré, colonnes relevées
      const c = pts[Math.floor(pts.length / 2)]; return [g, [c[0], ground(...c) + 16, c[1]]]; }
    case 'domerock': { const P = outlinePts('Dome of the Rock'); if (!P || !TM) return null; const g = MD.domeOfRock(P, sh.h || 34, period >= 11); g.position.y = TM.top; const c = centroid(P); return [g, [c[0], TM.top + 44, c[1]]]; }
    case 'aqsa': { const P = outlinePts('Al-Aqsa Mosque'); if (!P || !TM) return null; const c = centroid(P), rel = P.map(([x, z]) => [x - c[0], z - c[1]]), s = TM.south;
      const ext = Math.max(...rel.map(([x, z]) => x * s[0] + z * s[1])), dd = ext - 14; // coupole près de l'extrémité sud (côté qibla)
      const g = MD.footprintBuilding(rel, 12, 'ashlar', [{ x: s[0] * dd, z: s[1] * dd, r: 7.5, mat: lead(), drum: 5 }], { roof: lead(), tint: '#efe4cc' }); place(g, c[0], TM.top, c[1], 0); return [g, [c[0], TM.top + 32, c[1]]]; }
  }
  return null;
}
function rebuildScene() {
  if (!world) return; clearWorld(); TM = tmFrame(); styleCity();
  if (period === 5 && realistic && MUSEUM.state === 'idle') loadMuseum();
  if (MUSEUM.group) { if (TM) placeMuseum(); MUSEUM.group.visible = museumActive(); }
  const C = DATA.certainty, stackAt = {};
  const lab = (m, top, now, color) => { const k = top.map(v => Math.round(v / 25)).join(','); stackAt[k] = (stackAt[k] || 0) + 1; label(m, top[0], top[1], top[2], now, stackAt[k] - 1, color); };
  if (showWater && !compare) { // petits ravins du réseau calculé (sans nom)
    const D = drainage(), seenC = new Set(), lines = [];
    const hasUp = new Uint8Array(D.R * D.C); for (let j = 0; j < D.R * D.C; j++) if (D.to[j] >= 0 && D.km2(j) >= D.T) hasUp[D.to[j]] = 1;
    for (let h = 0; h < D.R * D.C; h++) { if (D.km2(h) < D.T || hasUp[h]) continue; const L = []; let i = h; while (i >= 0 && D.km2(i) >= D.T) { L.push(D.xz(i)); if (seenC.has(i)) break; seenC.add(i); i = D.to[i]; } if (L.length > 1) lines.push(L); }
    world.add(waterRibbon(lines, 6, '#cfe8ff', 0.6));
  }
  if (compare) {
    if (TM) { const sp = new THREE.Shape(TM.pts.map(([x, z]) => new THREE.Vector2(x, -z))), g = new THREE.ExtrudeGeometry(sp, { depth: 3, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, TM.top - 3, 0); const o = new THREE.Mesh(g, stone('paving')); o.receiveShadow = true; world.add(o); }
    DATA.monuments.filter(m => m.wall && !hiddenWalls.has(m.id)).forEach(m => {
      const lines = wallLines(m); if (!lines.length) return;
      add(wallMesh(lines, (4 + m.from * 0.9) * wallX, 5, flat(m.shape.color, m.certainty === 'hypothesis' ? { transparent: true, opacity: 0.8 } : {})), m, true, false);
      const c = lineMid(lines); if (c) lab(m, [c[0], ground(c[0], c[1]) + (14 + m.from) * wallX, c[1]], true, m.shape.color);
    });
    updateLabelSel(); return;
  }
  if (showToday && !DATA.monuments.some(m => inPeriod(m) && m.wall && (m.shape.parts || []).some(p => p.osm))) {
    const pts = []; (GEO.shapes || []).filter(s => s.kind === 'wall').forEach(s => { for (let i = 1; i < s.pts.length; i++) { const [x1, z1] = toXZ(...s.pts[i - 1]), [x2, z2] = toXZ(...s.pts[i]); pts.push(x1, ground(x1, z1) + 1.5, z1, x2, ground(x2, z2) + 1.5, z2); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 8, gapSize: 6, transparent: true, opacity: 0.85 })); l.computeLineDistances(); world.add(l);
  }
  for (const m of DATA.monuments.filter(inPeriod)) {
    const now = isNow(m), color = now ? C[m.certainty].color : '#bdb5a6';
    let sh = m.shape || {}, at = m.anchor ? anchorXZ(m.anchor) : null, top = null;
    if (sh.type === 'none') continue;
    if (museumActive() && MUSEUM.ids.has(m.id)) { // dessiné par le modèle du mont du Temple
      const b = MUSEUM.bounds[m.id], c = b.getCenter(new THREE.Vector3()); placed.add(m.id);
      lab(m, [c.x, b.max.y + 6, c.z], now); continue;
    }
    if (sh.type === 'valley') {
      if (!showWater) continue;
      const lines = valleyLines(sh); if (!lines.length || !lines[0].length) continue;
      const g = new THREE.Group(); g.add(waterRibbon([lines[0]], (sh.w || 9) * 1.4, '#ffffff', 0.95)); if (lines[1]) g.add(waterRibbon([lines[1]], (sh.w || 9) * 1.2, '#ffffff', 0.5));
      g.userData.id = m.id; world.add(g); placed.add(m.id); const c = lines[0][Math.floor(lines[0].length * (sh.labelAt || 0.5))]; lab(m, [c[0], ground(c[0], c[1]) + 14, c[1]], true, '#4fb4ff'); // l'eau reste bleue dans tous les modes
      continue;
    }
    if (sh.type === 'wallline') {
      const lines = wallLines(m); if (!lines.length) continue;
      const [kind, tint] = PERIOD_STONE[m.from] || ['ashlar', '#e5d8bd'], ott = m.from >= 11, thick = (ott ? 2.6 : m.from === 2 ? 7 : 4.2) * (wallX > 1 ? 1.4 : 1), h = (sh.h || 10) * wallX;
      const g = new THREE.Group(); g.add(wallMesh(lines, h, thick, stone(kind, { tint })));
      if (now) g.add(wallMesh(lines.map(L => L), 0.01, thick + 0.3, flat(sh.color, { emissive: sh.color, emissiveIntensity: 0.35 }), h - 0.6)); // bandeau de couleur de l'époque au sommet
      if (ott || m.from >= 4) g.add(MD.crenels(lines, (x1, z1, x2, z2) => Math.min(ground(x1, z1), ground(x2, z2), ground((x1 + x2) / 2, (z1 + z2) / 2)) + h, stone(kind, { tint }), { d: Math.min(thick, 2.6) }));
      add(g, m, now);
      const c = lineMid(lines); if (c) lab(m, [c[0], ground(c[0], c[1]) + h + 10, c[1]], now, now ? sh.color : null);
      continue;
    }
    const built = buildModel(m, sh, now);
    if (built) { add(built[0], m, now); top = built[1]; }
    else if (at) {
      const [x, z] = at, gy = ground(x, z);
      if (sh.type === 'tower' || sh.type === 'block' || sh.type === 'fortress') {
        const w = cub(sh.w, sh.unit), d = cub(sh.d, sh.unit), h = sh.unit === 'm_cubit' ? sh.h * C : cub(sh.h, sh.unit);
        add(MD.box(w, h, d, stone('limestone'), x, gy, z), m, now, 'plain'); top = [x, gy + h + 6, z];
      } else if (sh.type === 'wall') { const o = MD.box(sh.len, sh.h, sh.w, stone('ashlar', { tint: '#d6c39b' }), x, gy - 1, z); add(o, m, now, 'plain'); top = [x, gy + sh.h + 8, z]; }
      else { // repère : borne fine de la couleur de certitude
        const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 16, 10), flat(color))); g.children[0].position.y = 8;
        const s = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), flat(color, { emissive: color, emissiveIntensity: 0.25 })); s.position.y = 18; g.add(s);
        add(place(g, x, gy, z), m, now, false); top = [x, gy + 24, z];
      }
    }
    if (top) lab(m, top, now);
  }
  updateLabelSel();
}
function nearestWallYaw(x, z) { let best = 0, bd = Infinity; (GEO.shapes || []).filter(s => s.kind === 'wall').forEach(s => { for (let i = 1; i < s.pts.length; i++) { const [x1, z1] = toXZ(...s.pts[i - 1]), [x2, z2] = toXZ(...s.pts[i]), d = Math.hypot((x1 + x2) / 2 - x, (z1 + z2) / 2 - z); if (d < bd) { bd = d; best = -Math.atan2(z2 - z1, x2 - x1); } } }); return best; }

// ---------- mont du Temple « musée » : modèle OpenBible.info (MIT), recalé sur le contour OSM réel ----------
// Période hérodienne seulement, matériaux réalistes. Le modèle est remplaçable : les fiches restent dans monuments.json,
// la correspondance structure → fiche et la classe A/B/C/D de chaque élément sont dans models/temple-mount-30ce.json.
const MUSEUM = { meta: null, group: null, state: 'idle', bounds: {}, ids: new Set(), fit: null };
function museumActive() { return period === 5 && realistic && !compare && !!MUSEUM.group; }
function museumFit() {
  // rotation + translation (sans mise à l'échelle) qui superpose les 4 angles du plan OpenBible aux angles OSM
  const P = MUSEUM.meta.plat, A = [P.NW, P.NE, P.SE, P.SW], B = ['NW', 'NE', 'SE', 'SW'].map(tmCorner);
  if (B.some(p => !p)) return null;
  const ca = [0, 1].map(k => A.reduce((s, p) => s + p[k], 0) / 4), cb = [0, 1].map(k => B.reduce((s, p) => s + p[k], 0) / 4);
  let sxx = 0, sxy = 0; A.forEach((p, i) => { const u = [p[0] - ca[0], p[1] - ca[1]], v = [B[i][0] - cb[0], B[i][1] - cb[1]]; sxx += u[0] * v[0] + u[1] * v[1]; sxy += u[0] * v[1] - u[1] * v[0]; });
  const th = Math.atan2(sxy, sxx), c = Math.cos(th), s = Math.sin(th), R = p => [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  const rc = R(ca), err = A.map((p, i) => { const q = R(p); return Math.hypot(q[0] - rc[0] + cb[0] - B[i][0], q[1] - rc[1] + cb[1] - B[i][1]); });
  return { th, pos: [cb[0] - rc[0], cb[1] - rc[1]], err };
}
function loadMuseum() {
  if (MUSEUM.state !== 'idle') return; MUSEUM.state = 'loading'; museumChip(t('museumLoading'));
  fetch('jerusalem3d/models/temple-mount-30ce.json').then(r => r.json()).then(meta => {
    MUSEUM.meta = meta;
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    return new Promise((res, rej) => loader.load(meta.glb, res, ev => { if (ev.total) museumChip(t('museumLoading') + ' ' + Math.round(ev.loaded / ev.total * 100) + '%'); }, rej));
  }).then(gltf => {
    const g = gltf.scene, done = new Set();
    g.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      if (/~hyp/.test(o.name)) { // hypothèse illustrative : translucide, comme partout ailleurs dans la scène
        const m = o.material.clone(); m.transparent = true; m.opacity = 0.45; m.depthWrite = false; o.material = m; o.castShadow = false; o.userData.hyp = true;
      }
      const m = o.material; if (done.has(m)) return; done.add(m);
      if (m.map) m.map.anisotropy = 8;
      if (/water/.test(m.name)) { m.color.set('#3c9be6'); m.emissive = new THREE.Color('#0e4f8f'); m.emissiveIntensity = 0.3; m.roughness = 0.1; return; } // eau bien bleue
      if (m.metalness > 0.5) { m.roughness = 0.28; m.envMapIntensity = 1.4; } // or, bronze : conducteurs
      else { m.color.multiplyScalar(0.8); m.envMapIntensity = 0.7; } // pierre calcaire : ton réel sous notre soleil
    });
    MUSEUM.group = g; MUSEUM.state = 'ready'; scene.add(g); placeMuseum(); museumChip(null); rebuildScene();
  }).catch(e => { console.warn('modèle du mont du Temple indisponible', e); MUSEUM.state = 'failed'; museumChip(t('museumFailed')); setTimeout(() => museumChip(null), 4000); });
}
function placeMuseum() {
  const f = museumFit(); if (!f || !TM) { MUSEUM.group.visible = false; return; }
  MUSEUM.fit = f; const g = MUSEUM.group; g.rotation.set(0, -f.th, 0); g.position.set(f.pos[0], TM.top, f.pos[1]); g.updateMatrixWorld(true);
  MUSEUM.bounds = {}; MUSEUM.ids = new Set(); const v = new THREE.Vector3();
  for (const p of MUSEUM.meta.parts) {
    const b = MUSEUM.bounds[p.monument] || (MUSEUM.bounds[p.monument] = new THREE.Box3());
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) b.expandByPoint(v.set(p.center[0] + sx * p.size[0] / 2, p.center[1] + sy * p.size[1] / 2, p.center[2] + sz * p.size[2] / 2).applyMatrix4(g.matrixWorld));
    MUSEUM.ids.add(p.monument);
  }
}
// structure touchée → fiche : la plus petite boîte de structure qui contient le point
function museumPick(point) {
  const l = MUSEUM.group.worldToLocal(point.clone()); let best = null, bv = Infinity;
  for (const p of MUSEUM.meta.parts) { const inside = [0, 1, 2].every(k => Math.abs(l.getComponent(k) - p.center[k]) <= p.size[k] / 2 + 1.5); const vol = p.size[0] * Math.max(1, p.size[1]) * p.size[2]; if (inside && vol < bv) { bv = vol; best = p; } }
  return best ? best.monument : 'jerusalem_temple_mount';
}
function museumChip(text) { const c = $('museumChip'); if (!c) return; c.hidden = !text; if (text) c.textContent = text; }

// ---------- vallées (נחלים) : lit d'écoulement calculé sur le relief SRTM ----------
// Comblement des cuvettes (priority-flood) puis direction D8 et surface drainée. Validé contre le Kidron d'OpenStreetMap
// (écart médian 14–18 m pour une grille de 40 m). L'eau n'y coule qu'après les pluies ; la seule source pérenne est le Gihon.
let DRAIN = null;
function drainage() {
  if (DRAIN) return DRAIN;
  const d = GEO.dem, R = d.rows, C = d.cols, F = d.heights.map(v => v == null ? demMin : v), seen = new Uint8Array(R * C), pq = [];
  const push = (i, h) => { pq.push([h, i]); let k = pq.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (pq[p][0] <= pq[k][0]) break; [pq[p], pq[k]] = [pq[k], pq[p]]; k = p; } };
  const pop = () => { const top = pq[0], l = pq.pop(); if (pq.length) { pq[0] = l; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < pq.length && pq[a][0] < pq[m][0]) m = a; if (b < pq.length && pq[b][0] < pq[m][0]) m = b; if (m === k) break; [pq[m], pq[k]] = [pq[k], pq[m]]; k = m; } } return top; };
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!r || !c || r === R - 1 || c === C - 1) { seen[r * C + c] = 1; push(r * C + c, F[r * C + c]); }
  const N = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  while (pq.length) { const [h, i] = pop(), r = (i / C) | 0, c = i % C; for (const [dr, dc] of N) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue; const j = rr * C + cc; if (seen[j]) continue; seen[j] = 1; F[j] = Math.max(F[j], h + 1e-3); push(j, F[j]); } }
  const dx = d.stepLon * KX, dz = d.stepLat * KZ, to = new Int32Array(R * C).fill(-1);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const i = r * C + c; let best = 0; for (const [dr, dc] of N) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue; const j = rr * C + cc, s = (F[i] - F[j]) / Math.hypot(dr * dz, dc * dx); if (s > best) { best = s; to[i] = j; } } }
  const ord = [...Array(R * C).keys()].sort((p, q) => F[q] - F[p]), acc = new Float32Array(R * C).fill(1); for (const i of ord) if (to[i] >= 0) acc[to[i]] += acc[i];
  const xz = i => toXZ(d.north - ((i / C) | 0) * d.stepLat, d.west + (i % C) * d.stepLon), km2 = i => acc[i] * dx * dz / 1e6;
  return (DRAIN = { R, C, to, acc, xz, km2, T: 0.12 });
}
// cellule de canal la plus proche d'un point
function drainNear(p) { const D = drainage(); let best = -1, bd = Infinity; for (let i = 0; i < D.R * D.C; i++) { if (D.km2(i) < D.T) continue; const q = D.xz(i), dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd < bd) { bd = dd; best = i; } } return best; }
// tracé d'une vallée : 'osm' (ways nommés) ou 'dem' (de la tête du canal passant près de `from`, vers l'aval jusqu'à `until`), puis `then` (schématique)
function valleyLines(sh) {
  if (sh.osm) return (GEO.shapes || []).filter(s => s.kind === 'waterway' && s.name === sh.osm).map(s => s.pts.map(p => toXZ(p[0], p[1])));
  const D = drainage(), a = wpt(sh.from), u = sh.until ? wpt(sh.until) : null; if (!a) return [];
  let i = drainNear(a);
  if (sh.head) for (;;) { let up = -1, ua = 0; for (let j = 0; j < D.R * D.C; j++) if (D.to[j] === i && D.km2(j) >= D.T && D.acc[j] > ua) { ua = D.acc[j]; up = j; } if (up < 0) break; i = up; } // remonter jusqu'à la tête
  const L = []; let guard = 0;
  while (i >= 0 && guard++ < 400) { if (sh.maxKm2 && D.km2(i) > sh.maxKm2) break; const p = D.xz(i); L.push(p); if (u && Math.hypot(p[0] - u[0], p[1] - u[1]) < 70) break; i = D.to[i]; }
  const out = [L]; if (sh.then) { const S = [L.at(-1), ...sh.then.map(wpt).filter(Boolean)]; if (S.length > 1) out.push(S); }
  return out;
}
// ruban d'eau posé sur le relief (largeur en m) : bleu vif, reflets, courant animé dans le sens de l'écoulement
let flowTex = null;
function flowTexture() {
  if (flowTex) return flowTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#1f6fb8'); gr.addColorStop(0.5, '#4fb4ff'); gr.addColorStop(1, '#1f6fb8'); g.fillStyle = gr; g.fillRect(0, 0, 256, 32);
  for (let k = 0; k < 9; k++) { const x = (k * 29 + 7) % 256, y = 6 + (k * 11) % 20; g.fillStyle = 'rgba(220,245,255,0.55)'; g.beginPath(); g.ellipse(x, y, 16, 1.6, 0, 0, 7); g.fill(); }
  flowTex = new THREE.CanvasTexture(c); flowTex.wrapS = THREE.RepeatWrapping; flowTex.wrapT = THREE.ClampToEdgeWrapping; flowTex.colorSpace = THREE.SRGBColorSpace; return flowTex;
}
function waterRibbon(lines, width, color, opacity) {
  const pos = [], uv = [], idx = []; let n = 0;
  for (const L0 of lines) { const L = []; for (let i = 1; i < L0.length; i++) { const [x1, z1] = L0[i - 1], [x2, z2] = L0[i], k = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 8)); for (let s = 0; s < k; s++) L.push([x1 + (x2 - x1) * s / k, z1 + (z2 - z1) * s / k]); } if (L0.length) L.push(L0.at(-1));
    let along = 0;
    for (let i = 0; i < L.length; i++) { if (i) along += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]);
      const p = L[Math.max(0, i - 1)], q = L[Math.min(L.length - 1, i + 1)], dl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / dl * width / 2, nz = (q[0] - p[0]) / dl * width / 2, [x, z] = L[i];
      pos.push(x + nx, ground(x + nx, z + nz) + 1.6, z + nz, x - nx, ground(x - nx, z - nz) + 1.6, z - nz); uv.push(along / 40, 0, along / 40, 1);
      if (i) idx.push(n - 2, n, n - 1, n - 1, n, n + 1); n += 2; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color, map: flowTexture(), emissive: '#1a6fd0', emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.15, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; mesh.receiveShadow = false; return mesh;
}

// ---------- mode cinéma : survol guidé + enregistrement vidéo ----------
// Plans : vue d'ensemble, puis orbite lente autour de chaque monument modélisé de la période, avec sous-titre.
const CINE_ORDER = ['jerusalem_second_temple', 'jerusalem_temple_mount', 'jerusalem_royal_stoa', 'jerusalem_porticoes', 'jerusalem_robinsons_arch', 'jerusalem_wilsons_arch', 'jerusalem_antonia', 'jerusalem_phasael', 'jerusalem_hippicus', 'jerusalem_mariamne', 'jerusalem_herod_palace', 'jerusalem_pilgrim_road', 'jerusalem_siloam_pool', 'jerusalem_dome_of_the_rock', 'jerusalem_al_aqsa', 'jerusalem_holy_sepulchre_byz', 'jerusalem_holy_sepulchre_crusader', 'jerusalem_nea', 'jerusalem_cardo', 'jerusalem_hadrian_arch', 'jerusalem_damascus_gate', 'jerusalem_golden_gate', 'jerusalem_jaffa_gate', 'jerusalem_broad_wall', 'jerusalem_gihon_fortress', 'jerusalem_siloam_pool'];
let cine = null, rec = null;
function startCinema(record) {
  if (mode2d) setMode2d(false); $('sheet').classList.remove('open');
  // monuments modélisés visibles à cette période (y compris ceux bâtis plus tôt et encore debout), puis portes et murailles de l'époque
  const ids = CINE_ORDER.filter(id => { const m = DATA.monuments.find(x => x.id === id); return m && inPeriod(m) && !boundsOf(id).isEmpty(); });
  DATA.monuments.filter(m => isNow(m) && (m.shape || {}).type === 'gate').slice(0, 2).forEach(m => ids.push(m.id));
  DATA.monuments.filter(m => isNow(m) && m.wall).slice(0, 1).forEach(m => ids.push(m.id));
  const shots = [{ type: 'wide', dur: 7000 }, ...ids.slice(0, 9).map(id => ({ type: 'orbit', id, dur: 7500 }))];
  cine = { shots, i: -1, t0: 0 }; document.body.classList.add('cinema'); styleCity(); nextShot();
  if (record) startRecording();
}
function stopCinema() { if (!cine) return; cine = null; document.body.classList.remove('cinema'); $('caption').classList.remove('on'); styleCity(); if (rec) stopRecording(); homeView(true); }
function nextShot() {
  if (!cine) return; cine.i++; if (cine.i >= cine.shots.length) { stopCinema(); return; }
  const s = cine.shots[cine.i], p = DATA.periods.find(x => x.n === period); cine.t0 = performance.now(); tw = null;
  if (s.type === 'wide') { s.c = controls.target.clone(); homeView(false); s.c = controls.target.clone(); s.r = camera.position.distanceTo(s.c); s.a0 = Math.atan2(camera.position.z - s.c.z, camera.position.x - s.c.x); s.h = camera.position.y - s.c.y; setCaption(t('title'), tx(p.name) + ' · ' + tx(p.dates)); }
  else { const m = DATA.monuments.find(x => x.id === s.id), b = boundsOf(s.id), size = b.getSize(new THREE.Vector3()); s.c = b.getCenter(new THREE.Vector3()); s.c.y = b.min.y + size.y * 0.35;
    s.r = Math.max(70, Math.max(size.x, size.z) * 1.25 + size.y); s.h = Math.max(30, s.r * 0.42); s.a0 = Math.PI * 0.55 + cine.i * 0.9;
    setCaption(tx(m.name), (m.builder ? tx(m.builder) : tx(DATA.periods.find(x => x.n === m.from).dates)) + ' · ' + tx(DATA.certainty[m.certainty].name)); }
}
function setCaption(a, b) { const c = $('caption'); c.innerHTML = `<b>${esc(a)}</b><small>${esc(b)}</small>`; c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); cine && (cine.capA = a, cine.capB = b); }
function cineFrame(now) {
  const s = cine.shots[cine.i], k = Math.min(1, (now - cine.t0) / s.dur), ease = k * k * (3 - 2 * k);
  const a = s.a0 + (s.type === 'wide' ? 0.35 : 0.75) * ease, r = s.r * (s.type === 'wide' ? 1 - 0.12 * ease : 1 - 0.18 * ease);
  camera.position.set(s.c.x + Math.cos(a) * r * (s.type === 'wide' ? 1 : 1), s.c.y + s.h * (1 - 0.15 * ease), s.c.z + Math.sin(a) * r); controls.target.copy(s.c); camera.lookAt(s.c);
  $('fade').style.opacity = k < 0.08 ? String(1 - k / 0.08) : k > 0.93 ? String((k - 0.93) / 0.07) : '0';
  if (k >= 1) nextShot();
}
// Enregistrement : composition (image 3D + sous-titres) dans un canvas 2D, capturé en WebM.
let recCanvas = null, recCtx = null;
function startRecording() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { alert(t('noRec')); return; }
  const src = renderer.domElement; recCanvas = document.createElement('canvas'); recCanvas.width = src.width; recCanvas.height = src.height; recCtx = recCanvas.getContext('2d');
  const stream = recCanvas.captureStream(30), types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'], type = types.find(x => MediaRecorder.isTypeSupported(x)) || '';
  const chunks = []; rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => { const blob = new Blob(chunks, { type: 'video/webm' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jerusalem-' + (DATA.periods.find(x => x.n === period).id) + '.webm'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
  rec.start(500); $('bRec').setAttribute('aria-pressed', 'true');
}
function stopRecording() { if (rec && rec.state !== 'inactive') rec.stop(); rec = null; $('bRec').setAttribute('aria-pressed', 'false'); }
function drawRecFrame() {
  if (!recCtx) return; const W = recCanvas.width, H = recCanvas.height; recCtx.drawImage(renderer.domElement, 0, 0, W, H);
  const f = Number($('fade').style.opacity || 0); if (f > 0) { recCtx.fillStyle = `rgba(0,0,0,${f})`; recCtx.fillRect(0, 0, W, H); }
  if (cine && cine.capA) { const s = H / 1080; recCtx.save(); recCtx.direction = lang === 'he' ? 'rtl' : 'ltr'; recCtx.textAlign = 'center';
    const g = recCtx.createLinearGradient(0, H * 0.72, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)'); recCtx.fillStyle = g; recCtx.fillRect(0, H * 0.72, W, H * 0.28);
    recCtx.fillStyle = '#fff'; recCtx.font = `800 ${Math.round(64 * s)}px system-ui, 'Arial Hebrew', Arial`; recCtx.fillText(cine.capA, W / 2, H * 0.88);
    recCtx.fillStyle = '#ffd878'; recCtx.font = `600 ${Math.round(34 * s)}px system-ui, 'Arial Hebrew', Arial`; recCtx.fillText(cine.capB, W / 2, H * 0.94); recCtx.restore(); }
}

const vtmp = new THREE.Vector3();
let paused = false;
function frame() { if (composer) composer.render(); else renderer.render(scene, camera); }
// Image fixe (pour une capture d'écran HD ou une diapositive) : rendu immédiat puis lecture du canevas.
function snapshot() { if (!renderer || mode2d) return null; controls.update(); followSun(); frame(); return renderer.domElement.toDataURL('image/png'); }
function followSun() {
  const tg = controls.target; sun.target.position.copy(tg); sun.position.copy(tg).add(sky.material.uniforms.sunPosition.value.clone().multiplyScalar(2500)); sun.target.updateMatrixWorld();
  const span = THREE.MathUtils.clamp(camera.position.distanceTo(tg) * 0.9, 250, 1400), sc = sun.shadow.camera; if (Math.abs(sc.right - span) > 20) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
}
function loop() {
  raf = requestAnimationFrame(loop);
  if (paused) return;
  const now = performance.now();
  if (cine) cineFrame(now);
  else if (tw) { const k = Math.min(1, (now - tw.t0) / tw.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; camera.position.lerpVectors(tw.e0, tw.e1, e); controls.target.lerpVectors(tw.t0v, tw.t1, e); if (k >= 1) tw = null; }
  if (mode2d) return;
  if (!cine) controls.update();
  if (flowTex) flowTex.offset.x = -(now / 1000) * 0.25; // le courant descend la vallée
  followSun(); // l'ombre suit la zone regardée (cadrage serré = ombres nettes)
  frame();
  if (!document.body.dataset.ready) { document.body.dataset.ready = '1'; $('msg').style.display = 'none'; } // première image affichée (shaders compilés)
  if (rec) drawRecFrame();
  // brume proportionnée au cadrage : nette de près, profondeur de champ atmosphérique de loin
  const cd = camera.position.distanceTo(controls.target); scene.fog.near = Math.max(900, cd * 1.3); scene.fog.far = Math.max(5000, cd * 5);
  const w = innerWidth, h = innerHeight, taken = [];
  // étiquettes sans chevauchement : priorité à la sélection, puis aux sites de la période, puis aux murailles, puis aux vestiges
  const order = labels.slice().sort((a, b) => (b.id === selected) - (a.id === selected) || a.pr - b.pr);
  for (const l of order) {
    if (cine) { l.el.style.display = 'none'; continue; }
    vtmp.copy(l.p).project(camera);
    let vis = vtmp.z < 1 && vtmp.x > -1.1 && vtmp.x < 1.1 && vtmp.y > -1.1 && vtmp.y < 1.1;
    const sx = (vtmp.x + 1) / 2 * w, sy = (1 - vtmp.y) / 2 * h - l.dy;
    if (vis) { if (!l.w) { l.w = l.el.offsetWidth || 120; l.h = l.el.offsetHeight || 26; }
      const r = [sx - l.w / 2 - 3, sy - l.h - 2, sx + l.w / 2 + 3, sy + 2];
      if (l.id !== selected && taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) vis = false; else taken.push(r); }
    l.el.style.display = vis ? '' : 'none';
    if (vis) l.el.style.transform = `translate(-50%,-100%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`, l.el.style.left = '0', l.el.style.top = '0';
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
  const all = []; (GEO.shapes || []).filter(s => s.kind === 'wall' || s.kind === 'outline').forEach(s => s.pts.forEach(p => all.push(toXZ(...p)))); // l'eau (Kidron sur 5 km) n'agrandit pas le cadrage
  Object.values(GEO.anchors || {}).forEach(a => all.push(toXZ(a.lat, a.lon)));
  if (!vb) { const xs = all.map(p => p[0]), zs = all.map(p => p[1]); const x0 = Math.min(...xs) - 120, z0 = Math.min(...zs) - 160, x1 = Math.max(...xs) + 120, z1 = Math.max(...zs) + 320; vb = [x0, z0, x1 - x0, z1 - z0]; }
  svg.setAttribute('viewBox', vb.join(' '));
  const poly = (s, st) => `<polyline points="${s.pts.map(p => toXZ(...p).map(v => v.toFixed(1)).join(',')).join(' ')}" ${st}/>`;
  (GEO.shapes || []).filter(s => s.kind === 'wall').forEach(s => P.push(poly(s, `fill="none" stroke="${period >= 11 ? C.attested.color : '#ffffff'}" stroke-width="${period >= 11 ? 6 : 2}" ${period >= 11 || !showToday ? '' : 'stroke-dasharray="8 6"'} opacity="${period >= 11 || showToday ? 1 : 0}"`)));
  const tm = shapeByName('Temple Mount');
  const fs = Math.max(22, Math.min(60, vb[2] / 34)), sw = fs / 3.2; // tailles lisibles quel que soit le zoom
  const pl = (L, st) => `<polyline points="${L.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" ${st}/>`;
  if (compare) {
    if (tm) P.push(poly(tm, 'fill="#8f8a7c" fill-opacity=".5" stroke="none"'));
    DATA.monuments.filter(m => m.wall && !hiddenWalls.has(m.id)).forEach(m => { const lines = wallLines(m); if (!lines.length) return; placed.add(m.id);
      P.push(`<g data-id="${m.id}">${lines.map(L => pl(L, `stroke="${m.shape.color}" stroke-width="${m.certainty === 'attested' ? sw * 1.3 : sw}" stroke-linejoin="round" ${m.certainty === 'hypothesis' ? 'stroke-dasharray="18 10"' : ''} opacity=".92"`)).join('')}</g>`);
      const c = lineMid(lines); if (c) P.push(`<text data-id="${m.id}" x="${c[0].toFixed(1)}" y="${(c[1] - 14).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="${m.shape.color}" stroke="#0b1230" stroke-width="${fs / 4.5}" paint-order="stroke">${esc(tx(m.name))}</text>`); });
    svg.innerHTML = P.join(''); return;
  }
  for (const m of DATA.monuments.filter(inPeriod)) {
    const now = isNow(m), col = now ? C[m.certainty].color : '#bdb5a6', sh = m.shape || {};
    if (sh.type === 'valley') { if (!showWater) continue; const lines = valleyLines(sh); if (!lines.length || !lines[0].length) continue; placed.add(m.id);
      P.push(`<g data-id="${m.id}">${lines.map((L, k) => pl(L, `stroke="#4a9be0" stroke-width="${sw * 1.6}" stroke-linecap="round" stroke-linejoin="round" opacity="${k ? 0.45 : 0.85}"`)).join('')}</g>`);
      const c = lines[0][Math.floor(lines[0].length * (sh.labelAt || 0.5))]; if (c) P.push(`<text data-id="${m.id}" x="${c[0].toFixed(1)}" y="${(c[1] - 12).toFixed(1)}" text-anchor="middle" font-size="${fs * 0.9}" font-weight="800" fill="#8cc8ff" stroke="#0b1230" stroke-width="${fs / 4.5}" paint-order="stroke">💧 ${esc(tx(m.name))}</text>`);
      continue; }
    if (sh.type === 'wallline') { const lines = wallLines(m); if (!lines.length) continue; placed.add(m.id);
      P.push(`<g data-id="${m.id}">${lines.map(L => pl(L, `stroke="${now ? sh.color : '#bdb5a6'}" stroke-width="${sw * 1.2}" stroke-linejoin="round" ${m.certainty === 'hypothesis' ? 'stroke-dasharray="18 10"' : ''}`)).join('')}</g>`);
      const c = lineMid(lines); if (c && now) P.push(`<text data-id="${m.id}" x="${c[0].toFixed(1)}" y="${(c[1] - 14).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="${sh.color}" stroke="#0b1230" stroke-width="${fs / 4.5}" paint-order="stroke">▬ ${esc(tx(m.name))}</text>`);
      continue; }
    const FOOT = { domerock: 'Dome of the Rock', aqsa: 'Al-Aqsa Mosque', sepulchre: 'Church of the Holy Sepulchre', sepulchre_byz: 'Church of the Holy Sepulchre' };
    const foot = ((sh.type === 'osmfoot' || sh.type === 'dome') && sh.match && shapeByName(sh.match)) || (FOOT[sh.type] && shapeByName(FOOT[sh.type]));
    if (foot) P.push(`<g data-id="${m.id}">${poly(foot, `fill="${col}" fill-opacity=".8" stroke="#0b1230" stroke-width="2"`)}</g>`);
    if (sh.type === 'osm' && tm) { P.push(`<g data-id="${m.id}">${poly(tm, `fill="${now ? '#d9c9a3' : '#8f8a7c'}" stroke="${col}" stroke-width="3"`)}</g>`); continue; }
    const at = (sh.type === 'hippicus' || sh.type === 'mariamne') ? herodTowerPos(sh.type) : sh.type === 'platform' ? (() => { const f = anchorXZ(sh.fromAnchor); return f ? [f[0], f[1] + sh.d / 2 + 15] : null; })() : (m.anchor ? anchorXZ(m.anchor) : ((sh.type === 'edge' || sh.type === 'royalstoa') && tm ? (() => { const f = frameOf(tm); return [f.cx + f.ux * f.umax, f.cz + f.uz * f.umax]; })() : null));
    if (!at || sh.type === 'none' || sh.type === 'osmwalls' || sh.type === 'porticoes') continue;
    placed.add(m.id);
    P.push(sh.type === 'platform' ? `<rect data-id="${m.id}" x="${at[0] - sh.w / 2}" y="${at[1] - sh.d / 2}" width="${sh.w}" height="${sh.d}" fill="${col}" fill-opacity=".45" stroke="${col}" stroke-width="2"/>`
      : `<circle data-id="${m.id}" cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="${fs * 0.45}" fill="${col}" stroke="#0b1230" stroke-width="${fs / 7}"/>`);
    P.push(`<text data-id="${m.id}" x="${at[0].toFixed(1)}" y="${(at[1] - 20).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fff" stroke="#0b1230" stroke-width="${fs / 5}" paint-order="stroke">${esc(tx(m.name))}</text>`);
  }
  svg.innerHTML = P.join('');
}
$('plan2d').addEventListener('click', e => { const g = e.target.closest('[data-id]'); if (g) openSheet(g.dataset.id); });
// zoom / déplacement du plan 2D (molette, pincement, glisser)
(function () {
  const svg = $('plan2d'), pts = new Map(); let last = null;
  const toUser = (cx, cy) => { const r = svg.getBoundingClientRect(), s = Math.max(vb[2] / r.width, vb[3] / r.height); return [vb[0] + (cx - r.left) * s, vb[1] + (cy - r.top) * s, s]; };
  let redraw = 0; const later = () => { clearTimeout(redraw); redraw = setTimeout(draw2d, 120); };
  svg.addEventListener('wheel', e => { e.preventDefault(); const [ux, uy] = toUser(e.clientX, e.clientY), k = e.deltaY > 0 ? 1.15 : 1 / 1.15; vb = [ux - (ux - vb[0]) * k, uy - (uy - vb[1]) * k, vb[2] * k, vb[3] * k]; svg.setAttribute('viewBox', vb.join(' ')); later(); }, { passive: false });
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    const s = toUser(0, 0)[2];
    if (pts.size === 1) { vb[0] -= (e.clientX - prev[0]) * s; vb[1] -= (e.clientY - prev[1]) * s; }
    else if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (last) { const k = last / d, [ux, uy] = toUser((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); vb = [ux - (ux - vb[0]) * k, uy - (uy - vb[1]) * k, vb[2] * k, vb[3] * k]; } last = d; }
    svg.setAttribute('viewBox', vb.join(' '));
  });
  const up = e => { pts.delete(e.pointerId); if (last) later(); last = null; }; svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
})();

// ---------- API préparée pour les futurs quiz 3D (phase 2 — non affichée) ----------
window.MDJerusalem3D = {
  get quizEnabled() { return !!(DATA && DATA.quiz3dEnabled === true); },
  setPeriod(n) { period = n; renderPeriod(); },
  flyTo, highlight, openSheet, snapshot,
  _bounds: id => { const b = boundsOf(id); return [b.min.toArray().map(Math.round), b.max.toArray().map(Math.round)]; }, _tm: () => TM && { top: TM.top, cx: TM.cx, cz: TM.cz, east: TM.east, south: TM.south },
  // pause du rendu continu (captures sur machines lentes) ; viewAt place la caméra sans animation
  pause(v) { paused = v !== false; },
  // rotation de la caméra autour de la cible (degrés) — pour composer une vue (ex. façade est du Temple)
  orbit(deg) { const t = controls.target, v = camera.position.clone().sub(t); v.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * Math.PI / 180); camera.position.copy(t).add(v); controls.update(); },
  zoom(k) { const t = controls.target, v = camera.position.clone().sub(t).multiplyScalar(k); camera.position.copy(t).add(v); controls.update(); },
  viewAt(id) { flyTo(id); if (tw) { camera.position.copy(tw.e1); controls.target.copy(tw.t1); tw = null; controls.update(); } highlight(null); },
  monument: id => DATA && DATA.monuments.find(m => m.id === id),
  // Pour une question « localisation » : appelle cb(id) au prochain toucher d'un monument.
  pickOnce(cb) { pickMode = true; const h = e => { pickMode = false; document.removeEventListener('mdj3d-pick', h); cb(e.detail); }; document.addEventListener('mdj3d-pick', h); }
};

// ---------- démarrage ----------
Promise.all([fetch('jerusalem3d/monuments.json', { cache: 'no-cache' }).then(r => r.json()), fetch('jerusalem3d/geo.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)])
  .then(([d, g]) => {
    DATA = d; GEO = g;
    const q = new URLSearchParams(location.search), qp = Number(q.get('period')); if (qp >= 1 && qp <= 12) period = qp;
    if (!DATA.periods.some(p => p.n === period)) period = 5;
    if (!GEO || !GEO.dem) { $('msg').textContent = t('geoMissing'); applyUI(); return; }
    LAT0 = (GEO.box.n + GEO.box.s) / 2; LON0 = (GEO.box.e + GEO.box.w) / 2; KX = 111320 * Math.cos(LAT0 * Math.PI / 180);
    demH = GEO.dem.heights; demMin = Math.min(...demH.filter(v => v != null));
    $('msg').textContent = t('preparing');
    const want2d = q.get('view') === '2d' || !webglOK();
    if (!want2d) init3d();
    applyUI();
    if (want2d) { $('msg').style.display = 'none'; setMode2d(true); if (!webglOK()) { $('msg').style.display = ''; $('msg').textContent = t('noWebgl'); setTimeout(() => $('msg').style.display = 'none', 2500); } }
    const id = q.get('site'); if (id) setTimeout(() => { openSheet(id); flyTo(id); }, 400);
  })
  .catch(e => { console.error(e); $('msg').textContent = t('loadErr'); });
