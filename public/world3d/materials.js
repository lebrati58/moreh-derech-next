// Mondes 3D — matériaux PBR.
// Textures : Poly Haven CC0 (textures/manifest.json, téléchargées par le workflow « Monde 3D — textures CC0 »).
// Si une texture manque, un motif procédural de secours est utilisé et signalé dans les crédits (jamais présenté comme une photo).
// Les UV des géométries sont en mètres : « tile » = taille réelle d'une répétition de texture, en mètres.
import * as THREE from 'three';

const BASE = 'world3d/textures/';
let MAN = null, LOADER = null, ANISO = 4;
const cache = {}, procedural = new Set();

export async function initMaterials(manager, renderer) {
  LOADER = new THREE.TextureLoader(manager);
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  try { MAN = await (await fetch(BASE + 'manifest.json', { cache: 'no-cache' })).json(); } catch (e) { MAN = { slots: {} }; }
  return MAN;
}
export function credits() { return { manifest: MAN, procedural: [...procedural] }; }

function tex(slot, kind) {
  const k = slot + ':' + kind;
  if (cache[k] !== undefined) return cache[k];
  const s = MAN && MAN.slots[slot];
  if (!s || !s.files || !s.files[kind]) { cache[k] = null; return null; }
  const t = LOADER.load(BASE + slot + '/' + s.files[kind]);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  cache[k] = t; return t;
}
// Bruit procédural de secours (pierre/sable), signalé dans les crédits.
function noiseTex(color, amp, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const col = new THREE.Color(color); let s = seed || 1; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const n = 1 + (r() - .5) * amp; img.data[i * 4] = col.r * 255 * n; img.data[i * 4 + 1] = col.g * 255 * n; img.data[i * 4 + 2] = col.b * 255 * n; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function withRepeat(t, tile) { if (!t) return null; const c = t.clone(); c.repeat.set(1 / tile, 1 / tile); c.needsUpdate = true; return c; }

// Matériau PBR : slot = kurkar | stone | plaster | marble | sand | paving | rubble | wood | metal
export function pbr(slot, o = {}) {
  const tile = o.tile || 2;
  const diff = tex(slot, 'diff'), nor = tex(slot, 'nor'), arm = tex(slot, 'arm');
  const m = new THREE.MeshStandardMaterial({ color: o.tint || '#ffffff', roughness: o.roughness ?? 1, metalness: o.metalness ?? 0, side: o.side || THREE.FrontSide });
  if (diff) {
    m.map = withRepeat(diff, tile);
    if (nor) { m.normalMap = withRepeat(nor, tile); m.normalScale.set(o.normal ?? 1, o.normal ?? 1); }
    if (arm) { const a = withRepeat(arm, tile); m.aoMap = a; m.roughnessMap = a; if (o.metalMap) m.metalnessMap = a; m.aoMapIntensity = o.ao ?? 0.8; }
  } else { procedural.add(slot); m.map = noiseTex(o.fallback || '#c9b58f', 0.25, slot.length * 97); m.map.repeat.set(1 / tile, 1 / tile); }
  if (o.gain) m.color.multiplyScalar(o.gain);
  if (o.vertexColors) m.vertexColors = true;
  m.userData.slot = slot;
  return m;
}

// Enduit peint hérodien de l'orchestra (Weiss 2014 : 14 couches de décors géométriques et floraux).
// Le motif exact n'est pas publié en libre accès : composition HYPOTHÉTIQUE (couleurs rouge/bleu d'après les restitutions de vulgarisation).
export function paintedPlaster(o = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#ece3cf'; g.fillRect(0, 0, 1024, 1024); g.globalAlpha = 0.38;
  const u = 128;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const x = i * u, y = j * u;
    g.strokeStyle = '#8f2f25'; g.lineWidth = 10; g.strokeRect(x + 8, y + 8, u - 16, u - 16);
    g.strokeStyle = '#2d4f73'; g.lineWidth = 4; g.strokeRect(x + 22, y + 22, u - 44, u - 44);
    g.save(); g.translate(x + u / 2, y + u / 2);
    for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = (k % 2) ? '#a8443a' : '#3e6a5a'; g.beginPath(); g.ellipse(0, -22, 7, 20, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#d9a441'; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // usure : taches et micro-fissures
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(90,70,50,${Math.random() * .09})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 10, 2 + Math.random() * 10); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; t.repeat.set(1 / (o.tile || 4), 1 / (o.tile || 4));
  g.globalAlpha = 1;
  const base = pbr('plaster', { tile: o.tile || 4, tint: '#ffffff' });
  base.map = t; base.userData.slot = 'painted';
  return base;
}
// Opus sectile (marbre polychrome) — utilisé seulement pour l'ERREUR volontaire de la mission « trouve les erreurs ».
export function opusSectile() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const cols = ['#e8e2d6', '#7d2f3a', '#3b5d4a', '#c9a24a', '#5c5f73'];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = cols[(i + j) % 2 ? 0 : 1 + ((i * 3 + j) % 4)]; g.fillRect(i * 64, j * 64, 64, 64);
    g.fillStyle = cols[(i * 7 + j) % 5]; g.beginPath(); g.moveTo(i * 64 + 32, j * 64 + 6); g.lineTo(i * 64 + 58, j * 64 + 32); g.lineTo(i * 64 + 32, j * 64 + 58); g.lineTo(i * 64 + 6, j * 64 + 32); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1 / 3, 1 / 3);
  const m = pbr('marble', { tile: 3, roughness: .35 }); m.map = t; return m;
}
// Cannelures : carte normale procédurale (24 cannelures) pour les fûts.
let FLUTE = null;
export function fluteNormal() {
  if (FLUTE) return FLUTE;
  const c = document.createElement('canvas'); c.width = 512; c.height = 8; const g = c.getContext('2d'); const img = g.createImageData(512, 8);
  for (let x = 0; x < 512; x++) { const ph = (x / 512 * 24) % 1, nx = Math.cos(ph * Math.PI * 2) * 0.9; for (let y = 0; y < 8; y++) { const i = (y * 512 + x) * 4; img.data[i] = (nx * .5 + .5) * 255; img.data[i + 1] = 128; img.data[i + 2] = 230; img.data[i + 3] = 255; } }
  g.putImageData(img, 0, 0); FLUTE = new THREE.CanvasTexture(c); FLUTE.wrapS = FLUTE.wrapT = THREE.RepeatWrapping; return FLUTE;
}
export function hasTexture(slot) { return !!(MAN && MAN.slots[slot]); }
export function hdriUrl() { return MAN && MAN.hdri ? BASE + MAN.hdri.file : null; }
