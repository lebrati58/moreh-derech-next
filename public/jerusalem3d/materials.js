// Moreh Derech NEXT — Jérusalem 3D : matériaux « pierre de Jérusalem » générés dans la page (aucune image externe).
// Les textures sont projetées selon la position réelle (mètres) : un bloc hérodien mesure ~1 m de haut sur 1,5–4 m,
// quelle que soit la taille de la surface. Relief des joints et des marges ciselées par bumpMap.
import * as THREE from 'three';

// Bruit déterministe (même rendu à chaque chargement).
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
function noiseLayer(g, w, h, r, alpha, scale) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * scale; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
  g.putImageData(img, 0, 0);
}

// Assise de blocs : `courses` = hauteurs d'assises (m), longueurs entre minL et maxL, marge ciselée (m).
function ashlarCanvas({ size = 1024, world = 8, courses = [1.1], minL = 1.4, maxL = 3.6, margin = 0.09, base = [222, 205, 172], vary = 18, boss = true, seed = 7, joint = 0.025 }) {
  const px = size / world, r = rng(seed);
  const col = document.createElement('canvas'), hgt = document.createElement('canvas'); col.width = col.height = hgt.width = hgt.height = size;
  const c = col.getContext('2d'), h = hgt.getContext('2d');
  c.fillStyle = '#8f7f62'; c.fillRect(0, 0, size, size); h.fillStyle = '#000'; h.fillRect(0, 0, size, size);
  let y = 0, k = 0;
  while (y < world - 1e-6) {
    const ch = Math.min(courses[k % courses.length], world - y); k++;
    let x = -r() * maxL; // décalage des joints d'une assise à l'autre
    while (x < world) {
      const L = minL + r() * (maxL - minL), t = (r() - 0.5) * vary;
      const x0 = Math.max(0, x) * px, x1 = Math.min(world, x + L) * px, y0 = y * px, y1 = (y + ch) * px, j = joint * px;
      if (x1 - x0 > 2) {
        const [R, G, B] = base;
        // bloc entier (marge ciselée, légèrement plus claire et lisse)
        c.fillStyle = `rgb(${R + t + 6},${G + t + 5},${B + t + 2})`; c.fillRect(x0 + j, y0 + j, x1 - x0 - 2 * j, y1 - y0 - 2 * j);
        h.fillStyle = '#9a9a9a'; h.fillRect(x0 + j, y0 + j, x1 - x0 - 2 * j, y1 - y0 - 2 * j);
        if (boss) { // bossage central en saillie, plus rugueux
          const m = margin * px;
          c.fillStyle = `rgb(${R + t - 6},${G + t - 7},${B + t - 9})`; c.fillRect(x0 + j + m, y0 + j + m, x1 - x0 - 2 * (j + m), y1 - y0 - 2 * (j + m));
          h.fillStyle = '#e6e6e6'; h.fillRect(x0 + j + m, y0 + j + m, x1 - x0 - 2 * (j + m), y1 - y0 - 2 * (j + m));
        }
      }
      x += L;
    }
    y += ch;
  }
  noiseLayer(c, size, size, r, 1, 16); noiseLayer(h, size, size, r, 1, 40);
  // patine : coulures et taches
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${90 + r() * 40},${80 + r() * 30},${60 + r() * 20},${0.03 + r() * 0.05})`; const x = r() * size, yy = r() * size; c.fillRect(x, yy, 2 + r() * 6, 20 + r() * 90); }
  return { col, hgt, world };
}
function smoothCanvas({ size = 512, world = 6, base = [226, 214, 190], vary = 22, seed = 3, spots = 400 }) {
  const r = rng(seed), col = document.createElement('canvas'), hgt = document.createElement('canvas'); col.width = col.height = hgt.width = hgt.height = size;
  const c = col.getContext('2d'), h = hgt.getContext('2d'); c.fillStyle = `rgb(${base})`; c.fillRect(0, 0, size, size); h.fillStyle = '#808080'; h.fillRect(0, 0, size, size);
  for (let i = 0; i < spots; i++) { const t = (r() - 0.5) * vary; c.fillStyle = `rgba(${base[0] + t},${base[1] + t},${base[2] + t},0.35)`; c.beginPath(); c.arc(r() * size, r() * size, 3 + r() * 22, 0, 7); c.fill(); }
  noiseLayer(c, size, size, r, 1, 14); noiseLayer(h, size, size, r, 1, 60);
  return { col, hgt, world };
}
function groundCanvas({ size = 1024, world = 40, seed = 11 }) {
  // terre calcaire (terra rossa claire), cailloux, affleurements et quelques buissons — contrastes doux, sans taches
  const r = rng(seed), col = document.createElement('canvas'), hgt = document.createElement('canvas'); col.width = col.height = hgt.width = hgt.height = size;
  const c = col.getContext('2d'), h = hgt.getContext('2d'), px = size / world;
  c.fillStyle = '#d6c8a8'; c.fillRect(0, 0, size, size); h.fillStyle = '#606060'; h.fillRect(0, 0, size, size);
  const blob = (g, x, y, s, fill) => { g.fillStyle = fill; for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { g.beginPath(); g.ellipse(x + dx, y + dy, s, s * (0.55 + r() * 0.45), r() * 3, 0, 7); g.fill(); } };
  for (let i = 0; i < 900; i++) blob(c, r() * size, r() * size, (1 + r() * 4) * px, `rgba(${r() < 0.5 ? '160,138,100' : '206,190,156'},0.07)`); // grandes variations très douces
  for (let i = 0; i < 9000; i++) { const s = (0.04 + r() * 0.18) * px, l = r() < 0.6; blob(c, r() * size, r() * size, s, l ? `rgba(232,224,204,${0.2 + r() * 0.25})` : `rgba(128,110,84,${0.1 + r() * 0.14})`); if (l) blob(h, r() * size, r() * size, s, 'rgba(255,255,255,0.5)'); }
  for (let i = 0; i < 60; i++) { const x = r() * size, y = r() * size, s = (0.6 + r() * 1.6) * px; blob(c, x, y, s, 'rgba(225,214,188,0.35)'); blob(h, x, y, s, 'rgba(255,255,255,0.35)'); } // dalles rocheuses
  for (let i = 0; i < 30; i++) { const x = r() * size, y = r() * size, s = (0.25 + r() * 0.45) * px; blob(c, x + s * 0.3, y + s * 0.3, s * 1.1, 'rgba(70,60,40,0.1)'); for (let k = 0; k < 5; k++) blob(c, x + (r() - 0.5) * s, y + (r() - 0.5) * s, s * (0.4 + r() * 0.4), `rgba(${110 + r() * 20},${112 + r() * 16},${72 + r() * 12},0.35)`); blob(h, x, y, s, 'rgba(255,255,255,0.6)'); } // buissons
  noiseLayer(c, size, size, r, 1, 14);
  return { col, hgt, world };
}

const cache = {};
function texPair(key, make) {
  if (cache[key]) return cache[key];
  const { col, hgt, world } = make();
  const map = new THREE.CanvasTexture(col), bump = new THREE.CanvasTexture(hgt);
  [map, bump].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; });
  map.colorSpace = THREE.SRGBColorSpace;
  return (cache[key] = { map, bump, world });
}

// Projection de texture en coordonnées monde (fonctionne aussi pour les InstancedMesh).
function worldProject(material, world) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uWorldScale = { value: 1 / world };
    sh.vertexShader = 'uniform float uWorldScale;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec4 wpos = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        wpos = instanceMatrix * wpos;
      #endif
      wpos = modelMatrix * wpos;
      vec3 wn = normal;
      #ifdef USE_INSTANCING
        wn = mat3(instanceMatrix) * wn;
      #endif
      wn = normalize(mat3(modelMatrix) * wn);
      vec2 wuv = abs(wn.y) > 0.6 ? wpos.xz : (abs(wn.x) > abs(wn.z) ? vec2(wpos.z, wpos.y) : vec2(wpos.x, wpos.y));
      wuv *= uWorldScale;
      #ifdef USE_MAP
        vMapUv = wuv;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv = wuv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = wuv;
      #endif`);
  };
  material.customProgramCacheKey = () => 'wp' + world;
  return material;
}

const KINDS = {
  herodian: () => texPair('herodian', () => ashlarCanvas({ world: 8, courses: [1.05, 1.15, 0.95, 1.2], minL: 1.6, maxL: 4.2, margin: 0.1, base: [224, 207, 170], seed: 21 })),
  ashlar: () => texPair('ashlar', () => ashlarCanvas({ world: 6, courses: [0.55, 0.6, 0.5], minL: 0.6, maxL: 1.4, margin: 0.05, base: [214, 196, 160], vary: 24, seed: 5 })),
  ottoman: () => texPair('ottoman', () => ashlarCanvas({ world: 6, courses: [0.45, 0.5, 0.55, 0.4], minL: 0.5, maxL: 1.2, margin: 0.04, base: [205, 186, 150], vary: 30, seed: 9, boss: false })),
  limestone: () => texPair('limestone', () => smoothCanvas({ world: 5, base: [232, 222, 198], seed: 2 })),
  plaster: () => texPair('plaster', () => smoothCanvas({ world: 4, base: [236, 228, 210], vary: 12, seed: 4, spots: 160 })),
  marble: () => texPair('marble', () => smoothCanvas({ world: 3, base: [242, 238, 230], vary: 10, seed: 8, spots: 120 })),
  ground: () => texPair('ground', () => groundCanvas({})),
  basalt: () => texPair('basalt', () => ashlarCanvas({ world: 6, courses: [0.5, 0.6, 0.55], minL: 0.6, maxL: 1.3, margin: 0.03, base: [78, 76, 74], vary: 14, seed: 17, boss: false })), // pierre noire de Beit Shean
  kurkar: () => texPair('kurkar', () => ashlarCanvas({ world: 6, courses: [0.5, 0.55, 0.45], minL: 0.7, maxL: 1.5, margin: 0.04, base: [205, 176, 132], vary: 22, seed: 19, boss: false })), // grès côtier de Césarée
  dolomite: () => texPair('dolomite', () => ashlarCanvas({ world: 6, courses: [0.35, 0.45, 0.4, 0.3], minL: 0.4, maxL: 1.0, margin: 0.02, base: [196, 178, 150], vary: 26, seed: 23, boss: false })), // moellons de Massada
  fieldstone: () => texPair('fieldstone', () => ashlarCanvas({ world: 5, courses: [0.3, 0.42, 0.26, 0.36], minL: 0.25, maxL: 0.6, margin: 0.06, base: [176, 160, 134], vary: 30, seed: 23, boss: false })), // moellons (Arad, Megiddo…)
  paving: () => texPair('paving', () => ashlarCanvas({ world: 6, courses: [0.9, 1.0, 0.8], minL: 0.8, maxL: 1.6, margin: 0.0, base: [216, 204, 178], vary: 14, seed: 13, boss: false, joint: 0.02 }))
};
const matCache = {};
// Matériau pierre : type ∈ herodian | ashlar | ottoman | limestone | plaster | marble | paving ; tint = couleur multiplicatrice.
export function stone(kind = 'ashlar', { tint = '#ffffff', rough = 0.92, bump = 0.06, transparent = false, opacity = 1 } = {}) {
  const key = [kind, tint, rough, bump, transparent, opacity].join('|');
  if (matCache[key]) return matCache[key];
  const t = (KINDS[kind] || KINDS.ashlar)();
  const m = new THREE.MeshStandardMaterial({ color: tint, map: t.map, bumpMap: t.bump, bumpScale: bump, roughness: rough, metalness: 0, transparent, opacity, depthWrite: !transparent || opacity > 0.7 });
  return (matCache[key] = worldProject(m, t.world));
}
export function gold() { return matCache.gold || (matCache.gold = new THREE.MeshStandardMaterial({ color: '#e6b84d', metalness: 1, roughness: 0.28 })); }
export function bronze() { return matCache.bronze || (matCache.bronze = new THREE.MeshStandardMaterial({ color: '#b07a3f', metalness: 0.9, roughness: 0.35 })); }
export function lead() { return matCache.lead || (matCache.lead = new THREE.MeshStandardMaterial({ color: '#8f959a', metalness: 0.35, roughness: 0.55 })); }
export function wood() { return matCache.wood || (matCache.wood = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.8 })); }
export function tiles() { // faïence bleue (Dôme du Rocher, époque ottomane)
  if (matCache.tiles) return matCache.tiles;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#1f5f9e'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) { g.fillStyle = r() < 0.5 ? '#2a78b8' : '#17487a'; g.fillRect(x + 2, y + 2, 28, 28); g.fillStyle = '#e9f1f7'; g.beginPath(); g.arc(x + 16, y + 16, 6, 0, 7); g.fill(); g.fillStyle = '#3aa0a0'; g.fillRect(x + 14, y + 4, 4, 24); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (matCache.tiles = worldProject(new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.05 }), 2.5));
}
export function groundMaterial() {
  if (matCache.ground) return matCache.ground;
  const t = KINDS.ground();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map, bumpMap: t.bump, bumpScale: 0.25, roughness: 1, metalness: 0 });
  return (matCache.ground = worldProject(m, t.world));
}
// Couleur unie de certitude (mode « couleurs de certitude »).
export function flat(color, opts = {}) {
  const key = 'f' + color + JSON.stringify(opts);
  return matCache[key] || (matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, opts)));
}
