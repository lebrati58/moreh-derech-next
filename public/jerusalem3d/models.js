// Moreh Derech NEXT — Jérusalem 3D : modèles paramétriques des monuments.
// Chaque modèle est construit à partir de dimensions SOURCÉES (voir la fiche du monument) ; les proportions non
// documentées sont signalées dans la fiche (« placementNote »). Repère local : +x = est, +z = sud, y = haut (mètres).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stone, gold, bronze, lead, wood, tiles } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
export function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); return m; }
function cyl(r, h, mat, x = 0, y = 0, z = 0, seg = 24, r2) { const m = mesh(new THREE.CylinderGeometry(r2 ?? r, r, h, seg), mat); m.position.set(x, y + h / 2, z); return m; }

// --- éléments répétés (InstancedMesh) ---
function columnGeometry(h, r) {
  const parts = [new THREE.CylinderGeometry(r * 0.92, r, h * 0.86, 16).translate(0, h * 0.07 + h * 0.43, 0), // fût
    new THREE.CylinderGeometry(r * 1.25, r * 1.3, h * 0.07, 16).translate(0, h * 0.035, 0), // base
    new THREE.BoxGeometry(r * 2.6, h * 0.07, r * 2.6).translate(0, h * 0.965, 0), // abaque
    new THREE.CylinderGeometry(r * 1.3, r * 0.95, h * 0.05, 16).translate(0, h * 0.905, 0)]; // chapiteau
  return mergeGeometries(parts.map(p => p.toNonIndexed()));
}
const colGeoCache = {};
// Colonnes posées aux points [x,z] (repère du groupe), base à y.
export function columns(points, h, r, mat, y = 0) {
  const key = h.toFixed(2) + '/' + r.toFixed(2), g = colGeoCache[key] || (colGeoCache[key] = columnGeometry(h, r));
  const im = new THREE.InstancedMesh(g, mat, points.length), M = new THREE.Matrix4();
  points.forEach(([x, z, yy], i) => { M.makeTranslation(x, yy ?? y, z); im.setMatrixAt(i, M); });
  im.castShadow = true; im.receiveShadow = true; return im;
}
// Créneaux le long d'un segment (x1,z1)→(x2,z2) au sommet y.
export function merlons(x1, z1, x2, z2, y, mat, { w = 1.1, gap = 0.9, h = 1.4, d = 1.2 } = {}) {
  const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.floor(L / (w + gap)));
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), mat, n), M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.atan2(z2 - z1, x2 - x1));
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; M.compose(V(x1 + (x2 - x1) * t, y + h / 2, z1 + (z2 - z1) * t), q, V(1, 1, 1)); im.setMatrixAt(i, M); }
  im.castShadow = true; return im;
}
// Arc plein cintre extrudé : largeur totale w, ouverture `span`, hauteur sous clé h, épaisseur d (le long de z).
export function archWall(w, h, span, d, mat, top = 0, { pointed = false, x0 = 0 } = {}) {
  const s = new THREE.Shape(); const H = h + span / 2 + top + (pointed ? span * 0.2 : 0);
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, H); s.lineTo(-w / 2, H); s.lineTo(-w / 2, 0);
  const hole = new THREE.Path(), a = x0 - span / 2, b = x0 + span / 2; hole.moveTo(a, 0); hole.lineTo(a, h);
  if (pointed) { hole.quadraticCurveTo(a, h + span * 0.5, x0, h + span * 0.7); hole.quadraticCurveTo(b, h + span * 0.5, b, h); } // arc brisé (portes ottomanes)
  else hole.absarc(x0, h, span / 2, Math.PI, 0, true);
  hole.lineTo(b, 0); hole.lineTo(a, 0);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 16 }); g.translate(0, 0, -d / 2);
  return mesh(g, mat);
}
function gable(w, d, h, mat) { // toit à deux pans (faîtage selon x)
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-w / 2, 0, 0);
  return mesh(g, mat);
}
function dome(r, mat, { squash = 1, pointed = 0, seg = 32 } = {}) {
  const pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI / 2; let x = Math.cos(a) * r, y = Math.sin(a) * r * squash; if (pointed) y += pointed * r * Math.pow(i / 24, 6); pts.push(new THREE.Vector2(Math.max(0.001, x), y)); }
  return mesh(new THREE.LatheGeometry(pts, seg), mat);
}
function ring(points, closed = true) { const P = points.slice(); if (closed) P.push(points[0]); return P; }

// =====================================================================================
// TEMPLE HÉRODIEN — plan de la Mishna, Middot (cours, autel, sanctuaire), façade et portes d'après Josèphe.
// Origine : centre du Saint des Saints. 1 coudée = C mètres.
export function temple(C, { facadeGold = true } = {}) {
  const g = new THREE.Group(), wallM = stone('limestone', { tint: '#e9dfca' }), paveM = stone('paving'), whiteM = stone('marble', { rough: 0.5, tint: '#efe8da' });
  const podH = 7 * C; // cours surélevées (Josèphe : 14 marches) — Middot : 12 marches de 1/2 coudée vers le Hel
  const courtW = 135 * C, tcW = 187 * C, cwW = 135 * C;
  const tx0 = -38 * C, tx1 = 149 * C, wx0 = tx1, wx1 = tx1 + cwW; // Azara (187) puis Parvis des femmes (135) à l'est
  const hel = 10 * C;
  // socle (Hel) et soreg
  g.add(box(wx1 - tx0 + 2 * hel, podH, courtW + 2 * hel, stone('ashlar'), (tx0 + wx1) / 2, 0, 0));
  const sx0 = tx0 - hel - 2, sx1 = wx1 + hel + 2, sz = courtW / 2 + hel + 2, sor = [];
  for (const [a, b] of [[[sx0, -sz], [sx1, -sz]], [[sx1, -sz], [sx1, sz]], [[sx1, sz], [sx0, sz]], [[sx0, sz], [sx0, -sz]]]) { const f = box(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.8, 0.25, wood()); f.position.set((a[0] + b[0]) / 2, 0.4, (a[1] + b[1]) / 2); f.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); g.add(f); } // soreg (10 palmes ≈ 0,8 m)
  // dallage des cours
  g.add(box(tcW, 0.3, courtW, paveM, (tx0 + tx1) / 2, podH, 0)); g.add(box(cwW, 0.3, courtW, paveM, (wx0 + wx1) / 2, podH - 3 * C, 0));
  // murs des cours (Josèphe : 25 coudées vus de l'intérieur) avec galeries intérieures
  const wh = 25 * C, wt = 3, y0 = podH;
  const wallSeg = (x, z, w, d) => g.add(box(w, wh, d, wallM, x, y0, z));
  wallSeg((tx0 + wx1) / 2, -courtW / 2, wx1 - tx0, wt); wallSeg((tx0 + wx1) / 2, courtW / 2, wx1 - tx0, wt);
  wallSeg(tx0, 0, wt, courtW); wallSeg(wx1, 0, wt, courtW);
  // portes : Middot 20 × 10 coudées ; tours de porte au nord, au sud et à l'est ; porte de Nicanor (Josèphe : 50 coudées, bronze)
  const gate = (x, z, rotY, hgt = 30 * C) => { const gg = new THREE.Group(); gg.add(box(12, hgt, 9, wallM, 0, 0, 0)); const door = box(10 * C, 20 * C, 9.2, bronze(), 0, 0, 0); gg.add(door); gg.position.set(x, y0, z); gg.rotation.y = rotY; g.add(gg); };
  [tx0 + 40 * C, tx0 + 90 * C, tx0 + 140 * C].forEach(x => { gate(x, -courtW / 2, 0); gate(x, courtW / 2, 0); });
  gate(wx0 + cwW / 2, -courtW / 2, 0); gate(wx0 + cwW / 2, courtW / 2, 0); gate(wx1, 0, Math.PI / 2);
  { const n = new THREE.Group(); n.add(box(16, 50 * C, 10, wallM)); n.add(box(20 * C, 40 * C, 10.4, bronze())); n.position.set(tx1, y0 - 3 * C, 0); n.rotation.y = Math.PI / 2; g.add(n); }
  // galeries (chambres) le long des murs intérieurs du parvis des femmes : toit plat
  g.add(box(cwW - 8, 6, 10, stone('plaster'), (wx0 + wx1) / 2, y0 - 3 * C, -courtW / 2 + 6)); g.add(box(cwW - 8, 6, 10, stone('plaster'), (wx0 + wx1) / 2, y0 - 3 * C, courtW / 2 - 6));
  // autel (Middot 3:1 : 32 × 32 coudées, en gradins) + rampe au sud (32 × 16)
  const ax = 73 * C + 22 * C + 16 * C;
  [[32, 1], [30, 5], [28, 3]].reduce((y, [s, h]) => { g.add(box(s * C, h * C, s * C, stone('ashlar', { tint: '#efe6d6' }), ax, y0 + y, 0)); return y + h * C; }, 0);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(box(1 * C, 1 * C, 1 * C, stone('ashlar'), ax + dx * 13.5 * C, y0 + 9 * C, dz * 13.5 * C));
  { const r = mesh(new THREE.BoxGeometry(16 * C, 1, 32 * C), stone('ashlar')); r.position.set(ax, y0 + 4.5 * C, 16 * C + 14 * C); r.rotation.x = Math.atan2(9 * C, 32 * C); g.add(r); }
  // SANCTUAIRE (Middot 4:6–7 : 100 × 100 × 100 ; porche de 100 de large, partie arrière 70 de large)
  const fx = 73 * C, porchD = 22 * C, H = 100 * C;
  g.add(box(porchD, H, 100 * C, whiteM, fx - porchD / 2, y0, 0));
  g.add(box(78 * C, H, 70 * C, whiteM, -27 * C + 39 * C, y0, 0));
  // façade : plaques d'or (Josèphe 5.222), ouverture de 70 × 25 coudées sans porte (5.208), vigne d'or au-dessus (5.210)
  if (facadeGold) g.add(box(0.4, H * 0.98, 100 * C * 0.98, gold(), fx + 0.25, y0, 0));
  g.add(box(0.8, 70 * C, 25 * C, new THREE.MeshStandardMaterial({ color: '#1a120a', roughness: 1 }), fx + 0.5, y0 + 2, 0));
  g.add(box(1, 3 * C, 30 * C, gold(), fx + 0.9, y0 + 2 + 70 * C, 0));
  // épis anti-oiseaux sur le toit (Josèphe 5.224)
  const spikes = []; for (let x = -27 * C + 2; x < fx - 1; x += 3) for (let z = -33 * C; z <= 33 * C; z += 6) spikes.push([x, z]);
  const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 1.2, 5), gold(), spikes.length), M = new THREE.Matrix4();
  spikes.forEach(([x, z], i) => { M.makeTranslation(x, y0 + H + 0.6, z); sp.setMatrixAt(i, M); }); g.add(sp);
  // marches devant le porche (12 marches)
  for (let i = 0; i < 12; i++) g.add(box(1.2 * C, (12 - i) * 0.5 * C, 60 * C, stone('paving'), fx + 6 * C - i * 0.4 * C + 6, y0, 0));
  return g;
}

// PORTIQUES DOUBLES (Josèphe 5.190–192 : 30 coudées de large, colonnes de 25 coudées) le long d'un bord intérieur.
// Segment (x1,z1)→(x2,z2) sur le mur ; inward = vecteur unitaire vers l'intérieur de l'esplanade.
export function portico(x1, z1, x2, z2, inward, y, C) {
  const g = new THREE.Group(), W = 30 * C, colH = 25 * C, L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, [ix, iz] = inward;
  const rows = [W / 2, W], pts = [];
  for (const off of rows) for (let s = 3; s < L - 3; s += 5) pts.push([x1 + ux * s + ix * off, z1 + uz * s + iz * off]);
  g.add(columns(pts, colH, 0.55, stone('marble', { rough: 0.45 }), y));
  // toit de cèdre (Josèphe 5.190) + mur du fond (parapet de l'enceinte)
  const pl = stone('plaster', { tint: '#c8b08c' }), roof = box(L, 1.2, W + 1, [wood(), wood(), pl, wood(), wood(), wood()]); roof.position.set(x1 + ux * L / 2 + ix * W / 2, y + colH + 0.6, z1 + uz * L / 2 + iz * W / 2); roof.rotation.y = -Math.atan2(uz, ux); g.add(roof); // dessus enduit, plafond de cèdre
  const back = box(L, colH + 3, 2.5, stone('herodian')); back.position.set(x1 + ux * L / 2 - ix * 1.2, y + (colH + 3) / 2, z1 + uz * L / 2 - iz * 1.2); back.rotation.y = -Math.atan2(uz, ux); g.add(back);
  return g;
}
// PORTIQUE ROYAL (Josèphe, Ant. 15.410–420 : 162 colonnes en 4 rangées, la 4e engagée dans le mur sud ; archéologie : 4 rangées de 40 colonnes, nefs de 9,9 / 14,8 / 9,9 m).
export function royalStoa(x1, z1, x2, z2, inward, y) {
  const g = new THREE.Group(), L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, [ix, iz] = inward, rot = -Math.atan2(uz, ux);
  const aisle = 9.9, nave = 14.8, D = aisle * 2 + nave, colH = 9.9, sideH = 15.2, naveH = 30.5;
  const at = (s, o, yy = y) => [x1 + ux * s + ix * o, yy, z1 + uz * s + iz * o];
  const rowOff = [aisle, aisle + nave, D, 0.8], pts = [];
  for (const o of rowOff) for (let i = 0; i < 40; i++) { const s = 4 + i * (L - 8) / 39; const [x, , z] = at(s, o); pts.push([x, z]); }
  g.add(columns(pts, colH, 0.75, stone('marble', { rough: 0.4 }), y));
  const put = (m, s, o, yy) => { const [x, , z] = at(s, o); m.position.set(x, yy, z); m.rotation.y = rot; g.add(m); return m; };
  put(box(L, sideH, 2.5, stone('herodian')), L / 2, -1.25, y);                          // mur sud
  put(box(L, 1.4, aisle + 1, wood()), L / 2, aisle / 2, y + sideH - 1.4);                 // toits des bas-côtés
  put(box(L, 1.4, aisle + 1, wood()), L / 2, aisle + nave + aisle / 2, y + sideH - 1.4);
  // nef centrale : murs hauts à claire-voie sur colonnes superposées, toit à deux pans
  const clere = naveH - sideH - 3;
  put(box(L, clere, 1.6, stone('limestone')), L / 2, aisle, y + sideH);
  put(box(L, clere, 1.6, stone('limestone')), L / 2, aisle + nave, y + sideH);
  const win = []; for (let s = 6; s < L - 6; s += 6) { win.push(at(s, aisle - 0.85, y + sideH + clere * 0.35)); win.push(at(s, aisle + nave + 0.85, y + sideH + clere * 0.35)); }
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, clere * 0.45, 0.3), new THREE.MeshStandardMaterial({ color: '#2a2016' }), win.length), M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot);
  win.forEach(([x, yy, z], i) => { M.compose(V(x, yy + clere * 0.22, z), q, V(1, 1, 1)); wm.setMatrixAt(i, M); }); g.add(wm);
  const gr = gable(L, nave + 2, 3.2, wood()); put(gr, L / 2, aisle + nave / 2, y + naveH - 3.2); gr.rotation.y = rot; const [gx, , gz] = at(0, aisle + nave / 2); gr.position.set(gx + ux * L / 2, y + naveH - 3.2, gz + uz * L / 2);
  return g;
}

// ARC DE ROBINSON (Warren ; Mazar) : largeur 15,2 m, portée 15 m, pilier de 15,2 × 3,6 m à 13 m du mur,
// à 17 m au-dessus de la rue ; escalier vers le sud sur 35 m porté par 6 voûtes.
export function robinsonArch(streetY, deckY) {
  const g = new THREE.Group(), m = stone('herodian'), W = 15.2, rise = deckY - streetY;
  g.add(box(3.6, rise - 3, W, m, -13 - 1.8, streetY, 0));                                    // pilier
  // l'arc enjambe la rue (axe nord-sud) : profil dans le plan x-y, épaisseur = largeur de l'arc (15,2 m) selon z
  const arch = archWall(16.6, Math.max(1, rise - 8), 13, W, m, 1.5); arch.position.set(-7.5, streetY, 0); g.add(arch);
  for (let i = 0; i < 6; i++) { // escalier descendant vers le sud
    const z0 = W / 2 + i * 35 / 6, h = rise * (1 - (i + 1) / 7);
    g.add(box(3.6, Math.max(1, h), 35 / 6 - 0.4, m, -13 - 1.8, streetY, z0 + 35 / 12));
    g.add(box(6, 0.8, 35 / 6, stone('paving'), -13 - 1.8, streetY + h, z0 + 35 / 12));
  }
  return g;
}
// ARC DE WILSON (largeur 15 m après élargissement, portée 13 m — Institut Weizmann 2020 ; Madain Project) : pont sur arches vers la ville haute — longueur schématique.
export function wilsonBridge(deckY, groundY, len = 40) {
  const g = new THREE.Group(), m = stone('herodian'), W = 15, n = 3, span = len / n;
  for (let i = 0; i < n; i++) { const a = archWall(span, Math.max(2, deckY - groundY - (span - 3) / 2 - 1.5), span - 3, W, m, 1.5); a.position.set(-(i + 0.5) * span, groundY, 0); g.add(a); }
  g.add(box(len, 1, W, stone('paving'), -len / 2, deckY - 1, 0));
  return g;
}
// PORTES DE HOULDA : porte double (ouest) et triple (est), percées dans le mur sud (face extérieure en z = 0, vers +z).
export function huldaGates(baseY, spacing = 70) {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: '#16110b', roughness: 1 });
  const opening = (x, n) => { for (let i = 0; i < n; i++) { const xx = x + (i - (n - 1) / 2) * 7.5; g.add(box(5.5, 7.5, 1.2, dark, xx, baseY, 0.4)); const a = mesh(new THREE.CylinderGeometry(2.75, 2.75, 1.2, 16, 1, false, 0, Math.PI), dark); a.rotation.set(Math.PI / 2, 0, -Math.PI / 2); a.position.set(xx, baseY + 7.5, 0.4); g.add(a); g.add(box(6.6, 0.8, 1.4, stone('herodian', { tint: '#f4ead8' }), xx, baseY + 10.6, 0.6)); } };
  opening(-spacing / 2, 2); opening(spacing / 2, 3);
  return g;
}
// ESCALIERS DU SUD (≈ 64 m de large, document du cours), marches alternées larges / étroites.
export function southernSteps(width, depth, rise) {
  const g = new THREE.Group(), n = 30, m = stone('paving');
  let z = 0; for (let i = 0; i < n; i++) { const tread = i % 2 ? 0.6 : 1.4 * depth / 30; g.add(box(width, rise * (n - i) / n, tread, m, 0, 0, z + tread / 2)); z += tread; }
  return g;
}
// FORTERESSE ANTONIA (Josèphe 5.238–246) : corps de 40 coudées, 4 tours d'angle de 50 (70 au sud-est). Emprise : 112 × 40 m.
export function antonia(C, L = 112, W = 40) {
  const g = new THREE.Group(), m = stone('herodian', { tint: '#f1e8d6' }), H = 40 * C, tw = 11;
  g.add(box(L, H, W, m)); g.add(box(L - 10, 0.6, W - 10, stone('paving'), 0, H - 0.3, 0));
  for (const [sx, sz, h] of [[-1, -1, 50], [1, -1, 50], [-1, 1, 50], [1, 1, 70]]) { const x = sx * (L / 2 - tw / 2), z = sz * (W / 2 - tw / 2); g.add(box(tw, h * C, tw, m, x, 0, z)); g.add(merlons(x - tw / 2, z - tw / 2, x + tw / 2, z - tw / 2, h * C, m)); g.add(merlons(x - tw / 2, z + tw / 2, x + tw / 2, z + tw / 2, h * C, m)); }
  g.add(merlons(-L / 2, -W / 2, L / 2, -W / 2, H, m)); g.add(merlons(-L / 2, W / 2, L / 2, W / 2, H, m)); g.add(merlons(-L / 2, -W / 2, -L / 2, W / 2, H, m)); g.add(merlons(L / 2, -W / 2, L / 2, W / 2, H, m));
  return g;
}
// TOUR DE PHASAËL (Josèphe, Guerre 5.166–169) : base carrée et PLEINE de 40 × 40 coudées sur 40 de haut ; dessus, une galerie
// (portique) de 10 coudées entourée de parapets et de bastions ; au centre, une tour d'appartements et de bains, couronnée de
// créneaux et de tourelles ; 90 coudées environ en tout (« semblable au phare d'Alexandrie »). Détails architecturaux reconstitués.
export function phasael(C) {
  const g = new THREE.Group(), m = stone('herodian', { tint: '#f2e9d8' }), B = 40 * C, Hs = 40 * C;
  solidBase(g, B, B, Hs, m);
  const top = Hs + 0.5; g.add(box(B, 0.5, B, stone('paving'), 0, Hs, 0));
  parapet(g, B, B, top, m, 1.1);                                                    // parapets (« ἐπάλξεις »)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {                    // bastions d'angle (« προμαχῶνες »)
    const s = 3.6; g.add(box(s, 3.2, s, m, sx * (B / 2 - s / 2), top, sz * (B / 2 - s / 2))); g.add(crown(s, s, top + 3.2, m, sx * (B / 2 - s / 2), sz * (B / 2 - s / 2)));
  }
  const T = B * 0.56, cl = 10 * C, ring = (T / 2 + 2.6);                           // galerie de 10 coudées autour de la tour
  const cols = []; for (let i = -3; i <= 3; i++) { const t = i / 3 * (ring - 0.4); cols.push([t, -ring], [t, ring], [-ring, t], [ring, t]); }
  g.add(columns(cols, cl - 0.6, 0.32, stone('marble', { rough: 0.5 }), top));
  g.add(box(2 * ring + 1.2, 0.6, 2 * ring + 1.2, stone('ashlar', { tint: '#e9dfca' }), 0, top + cl - 0.6, 0));
  const Ht = 90 * C - Hs - 3;                                                       // tour centrale (appartements, bains)
  g.add(box(T, Ht, T, m, 0, top, 0));
  for (let f = 1; f <= 3; f++) g.add(box(T + 0.5, 0.35, T + 0.5, stone('ashlar', { tint: '#e9dfca' }), 0, top + f * Ht / 4, 0)); // bandeaux d'étage
  archWindows(g, T, T, top + cl + 1.2, 3, 3, Ht / 4 * 0.98);
  const ty = top + Ht; g.add(box(T + 0.8, 0.6, T + 0.8, stone('ashlar', { tint: '#e9dfca' }), 0, ty, 0));
  parapet(g, T + 0.8, T + 0.8, ty + 0.6, m, 1.2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const s = 2.6, x = sx * (T / 2 - s / 2 + 0.4), z = sz * (T / 2 - s / 2 + 0.4); g.add(box(s, 3 * C + 1.6, s, m, x, ty + 0.6, z)); g.add(crown(s, s, ty + 0.6 + 3 * C + 1.6, m, x, z)); } // tourelles
  return g;
}
// PALAIS D'HÉRODE : plateforme (≈ 300 × 55 m) et deux ailes (Caesareum, Agrippeum, Josèphe 1.402) — volumes schématiques.
export function herodPalace(L = 300, W = 55, h = 5) {
  const g = new THREE.Group(), m = stone('herodian', { tint: '#efe5d2' }), wing = (z) => {
    const w = new THREE.Group(), lw = 100, ww = W - 10, wh = 14;
    w.add(box(lw, wh, 8, stone('limestone'), 0, 0, -ww / 2 + 4)); w.add(box(lw, wh, 8, stone('limestone'), 0, 0, ww / 2 - 4));
    w.add(box(8, wh, ww, stone('limestone'), -lw / 2 + 4, 0, 0)); w.add(box(8, wh, ww, stone('limestone'), lw / 2 - 4, 0, 0));
    const pts = []; for (let x = -lw / 2 + 12; x <= lw / 2 - 12; x += 5) { pts.push([x, -ww / 2 + 10]); pts.push([x, ww / 2 - 10]); }
    w.add(columns(pts, 7, 0.4, stone('marble'), 0)); w.add(box(lw - 24, 0.2, ww - 24, new THREE.MeshStandardMaterial({ color: '#6f8a4a', roughness: 1 }), 0, 0.05, 0));
    w.position.set(0, h, z); w.rotation.y = Math.PI / 2; return w;
  };
  g.add(box(W, h, L, m, 0, 0, 0)); g.add(wing(-L / 2 + 60)); g.add(wing(L / 2 - 60));
  g.add(box(W - 14, 0.3, 70, new THREE.MeshStandardMaterial({ color: '#5f7d3e', roughness: 1 }), 0, h, 0));
  return g;
}
// ROTONDE DE L'ANASTASIS (diamètre extérieur 35 m, Jewish Virtual Library) — toit schématique.
export function rotunda(D = 35, wallH = 14, domeM) {
  const g = new THREE.Group(), m = stone('limestone');
  const shape = new THREE.Shape(); shape.absarc(0, 0, D / 2, 0, Math.PI * 2); const hole = new THREE.Path(); hole.absarc(0, 0, D / 2 - 2, 0, Math.PI * 2, true); shape.holes.push(hole);
  const w = mesh(new THREE.ExtrudeGeometry(shape, { depth: wallH, bevelEnabled: false, curveSegments: 48 }), m); w.rotation.x = -Math.PI / 2; g.add(w);
  const dm = dome(D / 2 - 1, domeM || lead(), { squash: 0.55 }); dm.position.y = wallH; g.add(dm);
  return g;
}
// BASILIQUE à trois nefs (Martyrium, Néa) : longueur L (axe x), largeur W, abside à l'est (+x).
export function basilica(L, W, H, { apse = true, atrium = 0 } = {}) {
  const g = new THREE.Group(), m = stone('limestone'), side = W * 0.27, nave = W - 2 * side;
  g.add(box(L, H * 0.62, W, m)); g.add(box(L, H * 0.38, nave, m, 0, H * 0.62, 0));
  const r1 = gable(L, nave + 1, H * 0.16, stone('ashlar', { tint: '#b7774e' })); r1.position.y = H; g.add(r1);
  if (apse) { const a = cyl(nave / 2, H * 0.8, m, L / 2, 0, 0, 24); g.add(a); const ad = dome(nave / 2, stone('ashlar', { tint: '#b7774e' }), { squash: 0.5 }); ad.position.set(L / 2, H * 0.8, 0); g.add(ad); }
  if (atrium) { const pts = []; for (let x = -L / 2 - atrium + 3; x < -L / 2 - 2; x += 4) { pts.push([x, -W / 2 + 3]); pts.push([x, W / 2 - 3]); } g.add(columns(pts, 6, 0.35, stone('marble'), 0)); g.add(box(atrium, 0.2, W, stone('paving'), -L / 2 - atrium / 2, 0, 0)); }
  return g;
}
// CARDO byzantin : rue de 20 m (document du cours) bordée de colonnades couvertes, le long d'une polyligne.
export function cardo(points, groundAt, { paveOnly = false } = {}) {
  // Drive (סיור 18 — קארדו) : « 20 m de large avec l'espace des boutiques, la colonnade, le trottoir des piétons et la rue des chariots ».
  // Coupe adoptée : chaussée 10 m, colonnades à ±5 m, trottoirs couverts jusqu'à ±8 m, boutiques jusqu'à ±10 m.
  const g = new THREE.Group(), cols = [], P = [points[0]];
  for (let i = 1; i < points.length; i++) { const [a, b] = [points[i - 1], points[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 15)); for (let k = 1; k <= n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const pave = stone('paving', { tint: '#e2d8c4' }), side = stone('paving', { tint: '#f0e8d8' }), shopM = stone('ashlar', { tint: '#e7dcc6' }), tile = stone('ashlar', { tint: '#b4704c' });
  const seg = (x1, z1, x2, z2, o, w, h, mat, y = 0, tiltZ = 0) => { const L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux, cx = (x1 + x2) / 2 + nx * o, cz = (z1 + z2) / 2 + nz * o;
    const b = box(L + 0.4, h, w, mat); b.position.set(cx, groundAt(cx, cz) + y + h / 2, cz); b.rotation.set(0, -Math.atan2(uz, ux), 0); if (tiltZ) b.rotateX(tiltZ); g.add(b); return b; };
  for (let i = 1; i < P.length; i++) {
    const [x1, z1] = P[i - 1], [x2, z2] = P[i], L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux;
    seg(x1, z1, x2, z2, 0, 10, 0.3, pave, -0.2);
    for (const s of [-1, 1]) {
      seg(x1, z1, x2, z2, s * 6.5, 3, 0.5, side, -0.2);                          // trottoir surélevé
      if (paveOnly) continue;
      for (let t = 2; t < L; t += 4.5) { const x = x1 + ux * t + nx * s * 5, z = z1 + uz * t + nz * s * 5; cols.push([x, z, groundAt(x, z) + 0.3]); }
      seg(x1, z1, x2, z2, s * 9, 2, 5.5, shopM);                                  // rangée de boutiques
      seg(x1, z1, x2, z2, s * 7.1, 5.2, 0.35, tile, 6.3, s * 0.18);               // toit en appentis tuilé au-dessus du trottoir
    }
  }
  if (paveOnly) return g; // époques suivantes : la rue reste, la colonnade a disparu (partie fouillée au sud, rue actuelle au nord)
  g.add(columns(cols, 6, 0.33, stone('marble', { rough: 0.45 })));
  return g;
}
// DÔME DU ROCHER : octogone (contour OpenStreetMap), tambour, coupole dorée jusqu'à la hauteur OSM (34 m).
export function domeOfRock(octPts, topH = 34, ottomanTiles = true) {
  const g = new THREE.Group(), wallH = 11.5;
  const cx = octPts.reduce((s, p) => s + p[0], 0) / octPts.length, cz = octPts.reduce((s, p) => s + p[1], 0) / octPts.length;
  const sh = new THREE.Shape(octPts.map(([x, z]) => new THREE.Vector2(x - cx, -(z - cz))));
  const lower = mesh(new THREE.ExtrudeGeometry(sh, { depth: wallH * 0.45, bevelEnabled: false }), stone('marble', { rough: 0.4 })); lower.rotation.x = -Math.PI / 2; g.add(lower);
  const upper = mesh(new THREE.ExtrudeGeometry(sh, { depth: wallH * 0.55, bevelEnabled: false }), ottomanTiles ? tiles() : stone('plaster', { tint: '#d9c79a' })); upper.rotation.x = -Math.PI / 2; upper.position.y = wallH * 0.45; g.add(upper);
  // fenêtres (5 par face, partie haute)
  const win = [], dark = new THREE.MeshStandardMaterial({ color: '#0d1a2a', roughness: 0.6 });
  for (let i = 0; i < octPts.length; i++) { const [x1, z1] = octPts[i], [x2, z2] = octPts[(i + 1) % octPts.length]; for (let k = 1; k <= 5; k++) { const t = k / 6; win.push([x1 + (x2 - x1) * t - cx, z1 + (z2 - z1) * t - cz, -Math.atan2(z2 - z1, x2 - x1)]); } }
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 2.6, 0.5), dark, win.length), M = new THREE.Matrix4();
  win.forEach(([x, z, r], i) => { M.compose(V(x * 1.003, wallH * 0.72, z * 1.003), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r), V(1, 1, 1)); wm.setMatrixAt(i, M); }); g.add(wm);
  const R = 10.2, drumH = 9; g.add(cyl(R + 0.6, 1.2, stone('marble'), 0, wallH, 0, 48));
  g.add(cyl(R, drumH, ottomanTiles ? tiles() : stone('plaster', { tint: '#d9c79a' }), 0, wallH + 1.2, 0, 48));
  const d = dome(R, gold(), { squash: 1.05, pointed: 0.25, seg: 48 }); d.position.y = wallH + 1.2 + drumH; d.scale.y = (topH - wallH - 1.2 - drumH - 2) / (R * 1.3); g.add(d);
  g.add(cyl(0.25, 3, gold(), 0, topH - 2.2, 0, 8));
  g.position.set(cx, 0, cz); return g;
}
// Bâtiment d'après une emprise OSM (al-Aqsa, Saint-Sépulcre) : murs + coupoles.
export function footprintBuilding(pts, h, wallKind, domes = [], { roof = null, tint = '#ffffff' } = {}) {
  const g = new THREE.Group(), sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const wm = stone(wallKind, { tint }), b = mesh(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }), roof ? [roof, wm] : wm); b.rotation.x = -Math.PI / 2; g.add(b); // groupe 0 = toit (et dessous), 1 = murs
  domes.forEach(({ x, z, r, mat, drum = 3, squash = 0.9 }) => { g.add(cyl(r, drum, stone(wallKind), x, h, z, 32)); const d = dome(r, mat, { squash }); d.position.set(x, h + drum, z); g.add(d); });
  return g;
}
// Muraille avec créneaux le long d'une polyligne : renvoie un groupe (corps instancié par l'appelant).
export function crenels(lines, segTop, mat, { w = 0.9, gap = 0.8, h = 1.3, d = 2.6, step = 8 } = {}) {
  // une seule InstancedMesh pour toute la muraille (des milliers de merlons, un seul appel de dessin)
  const P = [];
  lines.forEach(L => { for (let i = 1; i < L.length; i++) { const [x1, z1] = L[i - 1], [x2, z2] = L[i], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / step));
    for (let k = 0; k < n; k++) { const ax = x1 + (x2 - x1) * k / n, az = z1 + (z2 - z1) * k / n, bx = x1 + (x2 - x1) * (k + 1) / n, bz = z1 + (z2 - z1) * (k + 1) / n, top = segTop(ax, az, bx, bz), len = Math.hypot(bx - ax, bz - az), cnt = Math.max(1, Math.floor(len / (w + gap))), rot = -Math.atan2(bz - az, bx - ax);
      for (let c = 0; c < cnt; c++) { const t = (c + 0.5) / cnt; P.push([ax + (bx - ax) * t, top, az + (bz - az) * t, rot]); } } } });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), mat, P.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), one = V(1, 1, 1);
  P.forEach(([x, y, z, r], i) => { q.setFromAxisAngle(up, r); M.compose(V(x, y + h / 2, z), q, one); im.setMatrixAt(i, M); });
  im.castShadow = true; im.receiveShadow = true; return im;
}

// =====================================================================================
// TOURS D'HÉRODE (Josèphe, Guerre 5.161–175). Hippicus : 25 × 25 coudées, PLEINE sur 30 ; au-dessus un réservoir de 20 coudées,
// puis une maison à deux étages de 25 coudées ; tourelles de 2 coudées et créneaux de 3 : 80 coudées en tout.
// Mariamne : 20 × 20, pleine sur 20 ; au-dessus des appartements plus richement ornés ; 50 coudées en tout.
// Mesures d'après Josèphe ; formes des fenêtres, corniches et pilastres reconstituées (aucun relevé des parties hautes).
export function hippicus(C) {
  const g = new THREE.Group(), m = stone('herodian', { tint: '#f2e9d8' }), trim = stone('ashlar', { tint: '#e9dfca' }), B = 25 * C;
  solidBase(g, B, B, 30 * C, m);
  const r0 = 30 * C, r1 = r0 + 20 * C, h1 = r1 + 25 * C;
  g.add(box(B - 0.6, 20 * C, B - 0.6, m, 0, r0, 0)); g.add(box(B + 0.4, 0.45, B + 0.4, trim, 0, r0, 0)); // réservoir : mur plein
  g.add(box(B, 25 * C, B, m, 0, r1, 0)); g.add(box(B + 0.5, 0.45, B + 0.5, trim, 0, r1, 0)); g.add(box(B + 0.5, 0.45, B + 0.5, trim, 0, r1 + 12.5 * C, 0));
  archWindows(g, B, B, r1 + 1.6, 3, 2, 12.5 * C);                                  // maison à deux étages
  g.add(box(B + 0.8, 0.6, B + 0.8, trim, 0, h1, 0)); parapet(g, B + 0.8, B + 0.8, h1 + 0.6, m, 3 * C * 0.55);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const s = 2.4, x = sx * (B / 2 - s / 2 + 0.4), z = sz * (B / 2 - s / 2 + 0.4); g.add(box(s, 2 * C + 1.6, s, m, x, h1 + 0.6, z)); g.add(crown(s, s, h1 + 2.2 + 2 * C, m, x, z)); }
  return g;
}
export function mariamne(C) {
  const g = new THREE.Group(), m = stone('herodian', { tint: '#f4ecde' }), marble = stone('marble', { rough: 0.4 }), B = 20 * C, r0 = 20 * C, H = 50 * C - 2;
  solidBase(g, B, B, r0, m);
  g.add(box(B, H - r0, B, m, 0, r0, 0)); g.add(box(B + 0.6, 0.5, B + 0.6, marble, 0, r0, 0));
  const pil = []; for (const t of [-0.5, -1 / 6, 1 / 6, 0.5]) { const u = t * (B - 0.8); pil.push([u, B / 2 + 0.15, 0], [u, -B / 2 - 0.15, 0], [B / 2 + 0.15, u, 1], [-B / 2 - 0.15, u, 1]); } // pilastres (« plus ornée »)
  pil.forEach(([x, z, r]) => { const p = box(0.7, H - r0 - 1, 0.3, marble, x, r0 + 0.5, z); if (r) p.rotation.y = Math.PI / 2; g.add(p); });
  archWindows(g, B, B, r0 + 1.4, 3, 2, (H - r0) / 2.2);
  g.add(box(B + 1, 0.8, B + 1, marble, 0, H, 0)); parapet(g, B + 1, B + 1, H + 0.8, m, 1.1);
  return g;
}
// --- éléments des tours ---
// base pleine : léger fruit (empattement), soubassement et bossages hérodiens (texture « herodian »)
function solidBase(g, W, D, H, m) { g.add(box(W + 0.8, 1.2, D + 0.8, m, 0, 0, 0)); g.add(box(W, H, D, m, 0, 0, 0)); }
function parapet(g, W, D, y, m, h = 1.2) { for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) { g.add(merlons(a * W / 2, b * D / 2, c * W / 2, d * D / 2, y + 0.6, m, { h, w: 0.9, gap: 0.8, d: 0.7 })); }
  g.add(box(W, 0.6, 0.7, m, 0, y, -D / 2 + 0.35)); g.add(box(W, 0.6, 0.7, m, 0, y, D / 2 - 0.35)); g.add(box(0.7, 0.6, D, m, -W / 2 + 0.35, y, 0)); g.add(box(0.7, 0.6, D, m, W / 2 - 0.35, y, 0)); }
function crown(w, d, y, m, x, z) { const c = new THREE.Group(); c.add(box(w + 0.3, 0.3, d + 0.3, m, 0, 0, 0)); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.add(box(0.6, 0.9, 0.6, m, sx * (w / 2 - 0.15), 0.3, sz * (d / 2 - 0.15))); c.position.set(x, y, z); return c; }
// fenêtres étroites en plein cintre sur les 4 faces : n par face et par étage, `rows` étages espacés de `dy`
let archWinGeo = null;
function archWindows(g, W, D, y0, n, rows, dy) {
  if (!archWinGeo) archWinGeo = mergeGeometries([new THREE.BoxGeometry(0.9, 1.7, 0.25).translate(0, 0, 0), new THREE.CylinderGeometry(0.45, 0.45, 0.25, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.85, 0)].map(x => x.toNonIndexed()));
  const P = [], dark = new THREE.MeshStandardMaterial({ color: '#2a2017', roughness: 1 });
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5, y = y0 + r * dy;
    P.push([t * W * 0.8, y, D / 2 + 0.06, 0], [t * W * 0.8, y, -D / 2 - 0.06, 0], [W / 2 + 0.06, y, t * D * 0.8, 1], [-W / 2 - 0.06, y, t * D * 0.8, 1]); }
  const im = new THREE.InstancedMesh(archWinGeo, dark, P.length), M = new THREE.Matrix4(), q = new THREE.Quaternion();
  P.forEach(([x, y, z, r], i) => { q.setFromAxisAngle(V(0, 1, 0), r ? Math.PI / 2 : 0); M.compose(V(x, y + 0.85, z), q, V(1, 1, 1)); im.setMatrixAt(i, M); }); g.add(im);
}

// PORTES OTTOMANES (1537–1541) : tour-porte à passage en arc brisé, mâchicoulis au-dessus du passage, créneaux.
// Local : x le long de la muraille, z à travers. Proportions schématiques (pas de relevé dans les sources du cours).
export function ottomanGate({ w = 16, d = 12, h = 13, span = 4.6, openH = 6.5, kind = 'plain' } = {}) {
  const g = new THREE.Group(), m = stone('ottoman'), trim = stone('ashlar', { tint: '#e9dcc0' });
  if (kind === 'golden') { // porte Dorée : double passage muré, deux coupoles
    g.add(archWall(w, openH, span, d, m, h - openH - span / 2, { x0: -w / 4 })); g.add(box(w / 2, h, d, m, w / 4, 0, 0));
    for (const x of [-w / 4, w / 4]) { g.add(box(span, openH + span * 0.45, 0.6, trim, x, 0, d / 2 - 0.3)); g.add(box(span, openH + span * 0.45, 0.6, trim, x, 0, -d / 2 + 0.3)); // passages murés
      const c = cyl(3.2, 1.2, m, x, h, 0, 24); g.add(c); const dm = dome(3.4, stone('plaster', { tint: '#d8ccb4' }), { squash: 0.8 }); dm.position.set(x, h + 1.2, 0); g.add(dm); }
    return g;
  }
  g.add(archWall(w, openH, span, d, m, h - openH - span / 2 - span * 0.2, { pointed: true }));
  for (const s of [-1, 1]) g.add(box(span + 1.6, 0.8, 0.5, trim, 0, openH + span * 0.75, s * (d / 2 + 0.2))); // linteau décoré
  const mach = new THREE.Group(); mach.add(box(span + 1.2, 2.2, 1.4, m, 0, 0, 0)); for (const x of [-span / 2, 0, span / 2]) mach.add(box(0.5, 1, 1.2, m, x, -1, 0));
  mach.position.set(0, h - 3.4, d / 2 + 0.7); g.add(mach); // mâchicoulis (Drive : « מרפסת אבן » au-dessus du passage)
  for (const [a, b, c, e] of [[-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2]]) g.add(merlons(a, b, c, e, h, m, { w: 0.9, gap: 0.8, h: 1.3, d: 0.9 }));
  if (kind === 'damascus') { // la plus ornée : deux tours latérales (anciennes tours romaines enveloppées), créneaux en pointe, mâchicoulis sur les tours
    for (const s of [-1, 1]) { const t = new THREE.Group(); t.add(box(9, h + 3, d + 4, m)); t.add(merlons(-4.5, (d + 4) / 2, 4.5, (d + 4) / 2, h + 3, m, { w: 0.8, gap: 0.7, h: 1.8, d: 0.9 })); t.add(merlons(-4.5, -(d + 4) / 2, 4.5, -(d + 4) / 2, h + 3, m, { w: 0.8, gap: 0.7, h: 1.8, d: 0.9 }));
      const mc = box(3, 2.2, 1.2, m, 0, h - 1.5, (d + 4) / 2 + 0.6); t.add(mc); t.position.x = s * (w / 2 + 4.5); g.add(t); }
  }
  return g;
}
// ARC D'HADRIEN (porte nord d'Aelia Capitolina, 130 apr. J.-C.) : arc de triomphe à trois baies entre deux tours (Drive, סיור 18).
// Seule la baie est subsiste avec son inscription ; hauteurs et largeurs schématiques.
export function hadrianArch({ towers = true, sides = [-1, 1], attic = true } = {}) {
  const g = new THREE.Group(), m = stone('ashlar', { tint: '#eadfc8' }), W = 24, D = 6;
  g.add(archWall(towers || sides.length > 1 ? W - 12 : 12, 7.5, 6, D, m, 3.5));                         // baie centrale
  for (const s of sides) { const side = archWall(6, 4, 3, D + 0.01, m, 1.5); side.position.x = s * 9; g.add(side); }
  if (attic) g.add(box(towers ? W + 1 : 13, 1, D + 0.8, stone('marble', { tint: '#e8decb' }), 0, 7.5 + 3 + 3.5, 0)); // corniche / attique de l'inscription (sur la baie centrale)
  if (towers) for (const s of [-1, 1]) { const t = box(9, 16, 9, stone('herodian', { tint: '#e6dac2' }), s * (W / 2 + 4.5), 0, 0); g.add(t); g.add(merlons(s * (W / 2) , 4.5, s * (W / 2 + 9), 4.5, 16, m)); g.add(merlons(s * (W / 2), -4.5, s * (W / 2 + 9), -4.5, 16, m)); }
  return g;
}

// RUE À DEGRÉS DES PÈLERINS (Drive « דרך עולי הרגל ») : rue principale de 8–10 m, dallée, en paliers, canal de drainage dessous,
// une « bema » de 4 marches au milieu. Paliers de 6 m qui suivent le relief : chaque palier = une volée de marches.
export function pilgrimRoad(points, groundAt) {
  const g = new THREE.Group(), P = [points[0]], W = 9, pave = stone('paving', { tint: '#e8dcc6' }), kerb = stone('ashlar', { tint: '#e2d4b8' });
  for (let i = 1; i < points.length; i++) { const [a, b] = [points[i - 1], points[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6)); for (let k = 1; k <= n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const at = (x, z, L, w, h, y, r, mat) => { const s = box(L, h, w, mat); s.position.set(x, y + h / 2, z); s.rotation.y = r; g.add(s); };
  for (let i = 1; i < P.length; i++) {
    const [x1, z1] = P[i - 1], [x2, z2] = P[i], L = Math.hypot(x2 - x1, z2 - z1), r = -Math.atan2(z2 - z1, x2 - x1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, nx = -(z2 - z1) / L, nz = (x2 - x1) / L, y = groundAt(mx, mz);
    at(mx, mz, L + 0.05, W, 1.2, y - 0.9, r, pave);                                   // palier dallé (son bord forme la marche)
    for (const s of [-1, 1]) at(mx + nx * s * (W / 2 + 0.4), mz + nz * s * (W / 2 + 0.4), L + 0.05, 0.8, 1.6, y - 0.9, r, kerb); // bordures
    if (i === Math.floor(P.length / 2)) for (let k = 0; k < 4; k++) at(mx + nx * 2.5, mz + nz * 2.5, 4 - k * 0.8, 4 - k * 0.8, 0.3, y + 0.3 + k * 0.3, r, kerb); // « bema »
  }
  return g;
}
// BASSIN DE SILOÉ (Second Temple) : 69 m de large (Wikipedia, fouilles Reich–Shukron), trois volées de cinq marches séparées
// par deux paliers (Drive, סיור 12 « הגבעה המזרחית »). Côtés nord et est seulement (fouillés) ; longueur et profondeur schématiques.
export function siloamPool(W = 69, D = 45) {
  const g = new THREE.Group(), st = stone('paving', { tint: '#eadfca' }), water = new THREE.MeshStandardMaterial({ color: '#3c9be6', emissive: '#0e4f8f', emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.92 });
  // bassin construit au-dessus du sol du modèle (le relief SRTM masquerait un creux) : marches pleines jusqu'au fond
  const step = 0.3, tread = 0.5, land = 1.6, F = -(15 + 2) * step - 0.4; let off = 0, y = 0;
  const put = (w, d, x, z, top) => g.add(box(w, top - F, d, st, x, F, z));
  for (let f = 0; f < 3; f++) { for (let s = 0; s < 5; s++) { put(W - 2 * off, tread + 0.01, 0, -D / 2 + off + tread / 2, y); put(tread + 0.01, D - 2 * off, W / 2 - off - tread / 2, 0, y); off += tread; y -= step; }
    if (f < 2) { put(W - 2 * off, land, 0, -D / 2 + off + land / 2, y); put(land, D - 2 * off, W / 2 - off - land / 2, 0, y); off += land; y -= step; } }
  g.add(box(W, 0.1, D, water, 0, F + 0.6, 0)); g.add(box(W, 0.2, D, stone('paving'), 0, F, 0));
  g.add(box(W, -F + 0.6, 1.2, stone('ashlar'), 0, F, D / 2 + 0.6)); g.add(box(1.2, -F + 0.6, D, stone('ashlar'), -W / 2 - 0.6, F, 0)); // côtés non fouillés : simple mur
  g.position.y = -F; // le fond repose au niveau du sol
  return g;
}
