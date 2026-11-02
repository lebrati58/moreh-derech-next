// Moreh Derech NEXT — « צבעים מקוריים » : couleurs d'origine attestées pour toutes les maquettes 3D.
// Les couleurs, matériaux, degrés de certitude et sources sont dans polychromy.json (jamais inventés dans le code).
// Principe : chaque module dit, pour un maillage, quelles clés chercher (ex. « orders:acan », « acan ») ;
// la première clé trouvée dans la table du module donne une entrée de la palette ; le matériau d'origine est gardé
// dans userData pour revenir au rendu « pierre » sans reconstruire la scène.
import * as THREE from 'three';

let PAL = null, PROMISE = null;
export function loadPalette(url = 'polychromy.json') {
  if (PAL) return Promise.resolve(PAL);
  return PROMISE || (PROMISE = fetch(url).then(r => r.json()).then(d => (PAL = d)).catch(() => (PAL = { entries: {}, maps: {} })));
}
export function palette() { return PAL; }

// --- motifs peints (canvas), uniquement ceux que les sources décrivent ---
function canvasTex(draw, size = 256, rep = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(rep, rep); return t;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
const PATTERNS = {
  // marbre veiné (vrai marbre ou enduit imitant le marbre) : fond = colors[0], veines = colors[1]
  veined: (cols, seed) => canvasTex((g, s) => {
    const r = rng(seed); g.fillStyle = cols[0]; g.fillRect(0, 0, s, s); g.strokeStyle = cols[1] || '#8a8a8a'; g.globalAlpha = .55;
    for (let i = 0; i < 9; i++) { g.lineWidth = .6 + r() * 2.2; g.beginPath(); let x = r() * s, y = 0; g.moveTo(x, y);
      while (y < s) { x += (r() - .5) * 34; y += 10 + r() * 18; g.lineTo(x, y); } g.stroke(); }
  }, 256, 1),
  // cipollino / marbre rubané : bandes ondulées
  banded: (cols, seed) => canvasTex((g, s) => {
    const r = rng(seed); g.fillStyle = cols[0]; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 6 + r() * 10) { g.strokeStyle = cols[1 + (Math.floor(r() * 2) % Math.max(1, cols.length - 1))] || cols[0]; g.globalAlpha = .45; g.lineWidth = 2 + r() * 4;
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x / 30 + y) * 4); g.stroke(); }
  }, 256, 1),
  // granit moucheté
  speckled: (cols, seed) => canvasTex((g, s) => {
    const r = rng(seed); g.fillStyle = cols[0]; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { g.fillStyle = cols[1 + (i % Math.max(1, cols.length - 1))] || '#222'; g.globalAlpha = .7; const d = .8 + r() * 2.4; g.fillRect(r() * s, r() * s, d, d); }
  }, 256, 1),
  // panneaux peints (enduit des styles pompéiens / hérodiens) : grands panneaux colors[0] cernés de colors[1]
  panels: (cols) => canvasTex((g, s) => {
    g.fillStyle = cols[1] || '#7a2d22'; g.fillRect(0, 0, s, s); g.fillStyle = cols[0]; g.fillRect(14, 14, s - 28, s - 28);
    if (cols[2]) { g.strokeStyle = cols[2]; g.lineWidth = 3; g.strokeRect(26, 26, s - 52, s - 52); }
  }, 256, 1),
  // tesselles (mosaïque) : colors[0] fond, autres couleurs en motifs
  mosaic: (cols, seed) => canvasTex((g, s) => {
    const r = rng(seed), u = s / 32; g.fillStyle = cols[0]; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) {
      const inBand = i % 16 < 2 || j % 16 < 2, inMotif = Math.abs((i % 16) - 8) + Math.abs((j % 16) - 8) < 4;
      g.fillStyle = inBand ? (cols[1] || cols[0]) : inMotif ? (cols[2] || cols[1] || cols[0]) : cols[0];
      g.globalAlpha = .85 + r() * .15; g.fillRect(i * u + .6, j * u + .6, u - 1.2, u - 1.2);
    }
  }, 256, 1),
  // opus sectile : plaques géométriques de pierres de couleur
  sectile: (cols) => canvasTex((g, s) => {
    const u = s / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = cols[(i + j) % cols.length]; g.fillRect(i * u, j * u, u, u);
      g.fillStyle = cols[(i + j + 1) % cols.length]; g.beginPath(); g.moveTo(i * u + u / 2, j * u + 4); g.lineTo(i * u + u - 4, j * u + u / 2); g.lineTo(i * u + u / 2, j * u + u - 4); g.lineTo(i * u + 4, j * u + u / 2); g.fill();
    }
  }, 256, 1)
};

// Matériau « couleur d'origine » à partir d'une entrée de la palette ; garde le relief (bump/normal) du matériau de départ.
const MCACHE = new Map(), TCACHE = new Map();
export function originalMaterial(entry, base) {
  const key = entry.id + '|' + (base && base.uuid) + '|' + !!(base && base.transparent);
  if (MCACHE.has(key)) return MCACHE.get(key);
  const cols = entry.colors || ['#cccccc'], fin = entry.finish || 'matte';
  const m = new THREE.MeshStandardMaterial({
    color: entry.pattern ? '#ffffff' : cols[0],
    roughness: fin === 'gilded' ? .3 : fin === 'polished' ? .35 : fin === 'glazed' ? .3 : .82,
    metalness: fin === 'gilded' ? .95 : fin === 'metal' ? .7 : 0
  });
  if (entry.pattern && PATTERNS[entry.pattern]) m.map = TCACHE.get(entry.id) || TCACHE.set(entry.id, PATTERNS[entry.pattern](cols, entry.id.length * 131 + 7)).get(entry.id);
  if (base) {
    m.side = base.side; m.transparent = base.transparent; m.opacity = base.opacity; m.depthWrite = base.depthWrite;
    if (base.bumpMap) { m.bumpMap = base.bumpMap; m.bumpScale = base.bumpScale; }
    if (base.normalMap) { m.normalMap = base.normalMap; m.normalScale = base.normalScale; }
    if (base.aoMap) { m.aoMap = base.aoMap; m.aoMapIntensity = base.aoMapIntensity; }
    if (base.onBeforeCompile && base.userData && base.userData.worldProjected) { m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; m.userData.worldProjected = true; }
    if (base.emissive) { m.emissive.copy(base.emissive); m.emissiveIntensity = base.emissiveIntensity; }
  }
  m.userData.poly = entry.id;
  MCACHE.set(key, m); return m;
}

// Résout une entrée pour une liste de clés dans la table `mapName` (première clé trouvée).
export function resolve(mapName, keys) {
  if (!PAL) return null; const map = (PAL.maps || {})[mapName] || {};
  for (const k of keys) { if (k == null) continue; const id = map[k]; if (id && PAL.entries[id]) return Object.assign({ id }, PAL.entries[id]); }
  return null;
}

// Active / désactive les couleurs d'origine sous `root`. keysOf(mesh) → liste de clés. Renvoie les entrées utilisées.
export function applyOriginal(root, mapName, keysOf, on, { clone = false } = {}) {
  const used = new Map();
  root.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const ud = o.userData;
    if (!on) { if (ud._stoneMat) { o.material = ud._stoneMat; delete ud._stoneMat; } return; }
    if (ud._stoneMat) { if (ud._polyId) used.set(ud._polyId, PAL.entries[ud._polyId]); return; }
    const e = resolve(mapName, keysOf(o) || []); if (!e) return;
    const base = Array.isArray(o.material) ? o.material[0] : o.material;
    ud._stoneMat = o.material; ud._polyId = e.id;
    o.material = clone ? originalMaterial(e, base).clone() : originalMaterial(e, base);
    used.set(e.id, PAL.entries[e.id]);
  });
  return [...used].map(([id, e]) => Object.assign({ id }, e));
}

// Mémorisation du choix (commune aux 4 modules).
export function wanted() { try { return localStorage.getItem('mdl_poly') === '1'; } catch (e) { return false; } }
export function remember(on) { try { localStorage.setItem('mdl_poly', on ? '1' : '0'); } catch (e) { /* stockage indisponible */ } }

// Légende : pastilles + matériau + certitude + source, en hébreu (ou fr/en si fournis).
const CERT = { attested: { he: 'מתועד באתר', fr: 'attesté sur le site', en: 'attested on site', c: '#3F6B3A' },
  typical: { he: 'מקובל בתקופה', fr: 'usage courant de l’époque', en: 'typical of the period', c: '#A97A1F' },
  hypothesis: { he: 'השערה', fr: 'hypothèse', en: 'hypothesis', c: '#A0362F' } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function legendHTML(entries, lang = 'he') {
  if (!entries.length) return `<p>${lang === 'he' ? 'אין בדגם הזה צבעים מתועדים — נשאר בצבע האבן.' : 'Pas de couleur documentée pour cette maquette.'}</p>`;
  const L = (o, k) => (o && (o[k + '_' + lang] || o[k + '_he'] || o[k + '_fr'])) || '';
  return '<ul class="poly-legend">' + entries.map(e => {
    const ct = CERT[e.certainty] || CERT.hypothesis;
    const sw = (e.colors || []).map(c => `<i style="background:${esc(c)}"></i>`).join('');
    const src = (e.sources || []).slice(0, 2).map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.ref)}</a>` : esc(s.ref)).join(' · ');
    return `<li><span class="sw">${sw}</span><span class="tx"><b>${esc(L(e, 'name'))}</b> — ${esc(L(e, 'material'))}`
      + ` <em style="color:${ct.c}">(${esc(ct[lang] || ct.he)})</em>${L(e, 'note') ? '<br><small>' + esc(L(e, 'note')) + '</small>' : ''}`
      + (src ? `<br><small class="src">${src}</small>` : '') + '</span></li>';
  }).join('') + '</ul>';
}
export const LEGEND_CSS = `.poly-legend{list-style:none;margin:0;padding:0;display:grid;gap:10px}.poly-legend li{display:flex;gap:10px;align-items:flex-start;line-height:1.35}
.poly-legend .sw{display:flex;flex:none;gap:2px;padding-top:2px}.poly-legend .sw i{width:16px;height:22px;border-radius:4px;border:1px solid rgba(0,0,0,.25);display:block}
.poly-legend small{opacity:.85}.poly-legend .src a{color:inherit}`;

// Bouton « 🎨 צבעים מקוריים » + fenêtre de légende, communs aux 4 modules.
// mountToggle(parent, { onChange(on), used() → entrées, lang, className, label }) → { set(on), refresh() }
export function mountToggle(parent, { onChange, used, lang = 'he', className = '', label } = {}) {
  if (!document.getElementById('poly-css')) {
    const st = document.createElement('style'); st.id = 'poly-css';
    st.textContent = LEGEND_CSS + `.poly-pop{position:fixed;inset-inline:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-height:62vh;overflow:auto;z-index:60;background:#14182bf2;color:#f3eee4;border:1px solid #ffffff33;border-radius:16px;padding:14px 14px 12px;box-shadow:0 12px 40px #0008;font:14px/1.4 system-ui,'Assistant',sans-serif;direction:${lang === 'he' ? 'rtl' : 'ltr'}}
.poly-pop h4{margin:0 0 4px;font-size:16px}.poly-pop p.lead{margin:0 0 10px;font-size:12.5px;opacity:.85}.poly-pop .x{position:absolute;inset-inline-end:8px;top:6px;min-width:40px;min-height:40px;background:none;border:0;color:inherit;font-size:20px}
.poly-info{min-width:40px}`;
    document.head.appendChild(st);
  }
  const T = { he: { on: '🎨 צבעים מקוריים', title: 'הצבעים המקוריים', lead: 'כך נראו החומרים והצבעים בעת העתיקה, לפי הממצאים. הצבע של כל פריט מסומן לפי רמת הוודאות.', info: 'מקור הצבעים' },
    fr: { on: '🎨 Couleurs d’origine', title: 'Les couleurs d’origine', lead: 'Matériaux et couleurs antiques d’après les découvertes, avec leur degré de certitude.', info: 'Source des couleurs' },
    en: { on: '🎨 Original colours', title: 'Original colours', lead: 'Ancient materials and colours from the evidence, with their certainty.', info: 'Colour sources' } }[lang] || {};
  const b = document.createElement('button'); b.type = 'button'; b.className = className; b.setAttribute('aria-pressed', 'false'); b.innerHTML = label || T.on;
  const i = document.createElement('button'); i.type = 'button'; i.className = className + ' poly-info'; i.textContent = 'ℹ️'; i.title = T.info; i.setAttribute('aria-label', T.info); i.hidden = true;
  parent.append(b, i);
  let on = false, pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  const open = () => {
    close(); pop = document.createElement('div'); pop.className = 'poly-pop'; pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<button type="button" class="x" aria-label="✕">✕</button><h4>${T.title}</h4><p class="lead">${T.lead}</p>` + legendHTML(used ? used() : [], lang);
    pop.querySelector('.x').onclick = close; document.body.appendChild(pop);
  };
  const set = (v, fire = true) => { on = !!v; b.setAttribute('aria-pressed', String(on)); i.hidden = !on; remember(on); if (!on) close(); if (fire && onChange) onChange(on); };
  b.onclick = () => set(!on); i.onclick = () => (pop ? close() : open());
  return { set, get on() { return on; }, refresh() { if (pop) open(); }, button: b, info: i };
}
