// Moreh Derech NEXT — sites 3D (Massada, Césarée, Beit Shean) : modèles paramétriques.
// Repère local : +x = est, +z = sud, y = haut (mètres). Chaque modèle « regarde » vers −z (le nord) ; le moteur le tourne
// selon le cap voulu. Les dimensions viennent des fiches (sources citées) ; les détails non documentés sont des volumes simples.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, columns, merlons, archWall } from '../jerusalem3d/models.js';
import { stone } from '../jerusalem3d/materials.js';

function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
const V2 = (x, y) => new THREE.Vector2(x, y);

// profil en escalier (gradins) de r0 (bas) à r1 (haut), hauteur H, n marches ; fermé par le mur extérieur
function stepProfile(r0, r1, H, n) {
  const P = [V2(r0, 0)], dr = (r1 - r0) / n, dh = H / n;
  for (let i = 0; i < n; i++) { P.push(V2(r0 + i * dr, (i + 1) * dh)); P.push(V2(r0 + (i + 1) * dr, (i + 1) * dh)); }
  P.push(V2(r1, 0)); return P;
}
// demi-anneau de gradins tourné vers −z (audience regardant le nord)
function halfBowl(r0, r1, H, n, mat, span = Math.PI) {
  const prof = stepProfile(r0, r1, H, n), g = new THREE.Group();
  const lathe = new THREE.LatheGeometry([...prof, prof[0]], 48, Math.PI / 2 + (Math.PI - span) / 2, span); // côté +z
  g.add(mesh(lathe, mat));
  const sh = new THREE.Shape(prof), cap = new THREE.ShapeGeometry(sh);
  const a1 = Math.PI / 2 + (Math.PI - span) / 2, a2 = a1 + span;
  for (const a of [a1, a2]) { const c = mesh(cap.clone(), mat); c.rotation.y = a - Math.PI / 2; c.material.side = THREE.DoubleSide; g.add(c); }
  return g;
}

// THÉÂTRE ROMAIN : cavea (rayon R), orchestre (rayon orch), scène et mur de scène (scaenae frons) à deux ordres.
export function theater({ R = 45, orch = 12, H = 16, rows = 24, stageD = 7, scaenaH = 20, seatKind = 'limestone', wallKind = 'ashlar', colKind = 'marble', tint = '#ffffff', vomitoria = 8 } = {}) {
  const g = new THREE.Group(), seat = stone(seatKind, { tint }), wall = stone(wallKind, { tint });
  const cav = halfBowl(orch + 1.5, R, H, rows, seat); cav.rotation.y = Math.PI; g.add(cav); // gradins au sud (+z), scène au nord
  // couloir supérieur et mur extérieur avec arcades (vomitoires)
  const ring = new THREE.LatheGeometry([V2(R, 0), V2(R + 2.2, 0), V2(R + 2.2, H + 2.5), V2(R, H + 2.5), V2(R, 0)], 64, Math.PI / 2, Math.PI);
  const rm = mesh(ring, wall); rm.rotation.y = Math.PI; g.add(rm);
  for (let i = 0; i < vomitoria; i++) { const a = Math.PI * (i + 0.5) / vomitoria, x = Math.cos(a) * (R + 1.1), z = Math.sin(a) * (R + 1.1);
    const d = box(3.2, 4.2, 2.6, new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1 }), x, 0, z); d.rotation.y = -a + Math.PI / 2; g.add(d); }
  g.add(mesh(new THREE.CircleGeometry(orch + 1.5, 40, 0, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.08, 0), stone('paving')));
  const W = 2 * (orch + 1.5) + 8;
  g.add(box(W, 1.5, stageD, stone('paving', { tint: '#e8dcc6' }), 0, 0, -stageD / 2 - 0.4)); // pulpitum
  g.add(box(W + 6, scaenaH, 3, wall, 0, 0, -stageD - 2)); // scaenae frons
  for (const s of [-1, 1]) g.add(box(10, scaenaH * 0.8, 2 * (orch + 1.5) * 0.35, wall, s * (W / 2 + 4), 0, -stageD + 2)); // parascaenia
  const c1 = [], c2 = [], cm = stone(colKind, { rough: 0.5 }); for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 3.2) { c1.push([x, -stageD - 0.2]); c2.push([x, -stageD - 0.2]); }
  g.add(columns(c1, scaenaH * 0.45, 0.35, cm, 1.5)); g.add(box(W, 0.8, 1.4, cm, 0, scaenaH * 0.45 + 1.5, -stageD - 0.2));
  g.add(columns(c2, scaenaH * 0.38, 0.3, cm, scaenaH * 0.45 + 2.3)); g.add(box(W, 0.7, 1.3, cm, 0, scaenaH * 0.83 + 2.3, -stageD - 0.2));
  for (const s of [-1, 0, 1]) g.add(box(s ? 3 : 4.2, s ? 6 : 7.5, 3.2, new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1 }), s * W / 4, 1.5, -stageD - 2)); // portes de scène
  return g;
}

// CIRQUE / HIPPODROME (hippo-stade) : arène L × W, gradins sur les deux longs côtés, extrémité arrondie (sphendone) au sud (+z),
// stalles de départ (carceres) au nord. `spina` : terre-plein central (absent dans le stade hérodien de Césarée).
export function circus({ L = 300, W = 50, rows = 12, rowW = 0.8, rowH = 0.42, spina = false, kind = 'kurkar', tint = '#ffffff', gates = 11 } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint }), D = rows * rowW, H = rows * rowH, straight = L - W / 2;
  const prof = new THREE.Shape(stepProfile(0, D, H, rows).map(p => V2(p.x, p.y)));
  for (const s of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(prof, { depth: straight, bevelEnabled: false }); // profil (x=r, y=h) extrudé le long de z
    const b = mesh(geo, m); b.position.set(s * (W / 2), 0, -L / 2); if (s < 0) { b.scale.x = -1; } g.add(b);
  }
  const bowl = halfBowl(W / 2, W / 2 + D, H, rows, m); bowl.rotation.y = Math.PI; bowl.position.z = -L / 2 + straight; g.add(bowl); // demi-cercle au sud
  g.add(mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).translate(0, 0.06, 0), new THREE.MeshStandardMaterial({ color: '#d9c9a2', roughness: 1 })));
  const gw = W / gates; for (let i = 0; i < gates; i++) g.add(archWall(gw, 3.2, gw * 0.7, 4, m, 1, { x0: 0 }).translateX(-W / 2 + gw * (i + 0.5)).translateZ(-L / 2 - 2));
  if (spina) g.add(box(4, 1.4, L * 0.6, stone('marble'), 0, 0, 0));
  return g;
}

// AMPHITHÉÂTRE elliptique : arène A × B (grand axe le long de z), gradins de largeur D.
export function amphitheater({ A = 100, B = 60, rows = 12, rowW = 0.8, rowH = 0.45, kind = 'basalt', tint = '#ffffff' } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint }), D = rows * rowW, H = rows * rowH, r0 = B / 2;
  const prof = stepProfile(r0, r0 + D, H, rows), lathe = new THREE.LatheGeometry([...prof, prof[0]], 64);
  const b = mesh(lathe, m); b.scale.z = (A / 2 + D) / (B / 2 + D); g.add(b);
  g.add(mesh(new THREE.CircleGeometry(r0, 48).rotateX(-Math.PI / 2).scale(1, 1, A / B).translate(0, 0.06, 0), new THREE.MeshStandardMaterial({ color: '#d4c39c', roughness: 1 })));
  return g;
}

// MURAILLE À CASEMATES (Massada) le long de polylignes fermées : mur extérieur, mur intérieur, cloisons, toit, tours.
export function casemate(lines, groundAt, { outer = 1.4, inner = 1.0, gap = 3.6, h = 5, foot = 6, towerEvery = 70, towerW = 7, towerH = 7, kind = 'dolomite', inward = 1, tint = '#ffffff' } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint }), roof = stone('plaster', { tint: '#cdb894' });
  const seg = (x1, z1, x2, z2, off, thick, hh, mat, extra = 0) => {
    const L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz * inward, nz = ux * inward;
    const cx = (x1 + x2) / 2 + nx * off, cz = (z1 + z2) / 2 + nz * off, gy = Math.min(groundAt(x1 + nx * off, z1 + nz * off), groundAt(x2 + nx * off, z2 + nz * off), groundAt(cx, cz));
    // sommet au niveau du plateau (mesuré 15 m vers l'intérieur) : le relief SRTM « adoucit » le bord de la falaise
    const top = Math.max(groundAt(cx + nx * 15, cz + nz * 15), groundAt(cx, cz)) + hh;
    const b = box(L + extra, top - gy + foot, thick, mat); b.position.set(cx, gy - foot + (top - gy + foot) / 2, cz); b.rotation.y = -Math.atan2(uz, ux); g.add(b); return { cx, cz, top, ux, uz, nx, nz, L };
  };
  let acc = 0;
  lines.forEach(Lp => { for (let i = 1; i < Lp.length; i++) {
    const [x1, z1] = Lp[i - 1], [x2, z2] = Lp[i], L = Math.hypot(x2 - x1, z2 - z1); if (L < 0.5) continue;
    const o = seg(x1, z1, x2, z2, 0, outer, h, m, outer); seg(x1, z1, x2, z2, outer / 2 + gap + inner / 2, inner, h, m, inner);
    seg(x1, z1, x2, z2, outer / 2 + gap / 2, gap + 0.2, h + 0.35, roof); // toit des casemates
    for (let t = 6; t < L - 2; t += 7) { const x = x1 + o.ux * t + o.nx * (outer / 2 + gap / 2), z = z1 + o.uz * t + o.nz * (outer / 2 + gap / 2), gy = groundAt(x, z);
      const c = box(0.8, o.top - gy + foot - 0.2, gap, m, x, gy - foot, z); c.rotation.y = -Math.atan2(o.uz, o.ux); g.add(c); } // cloisons
    acc += L; while (acc > towerEvery) { acc -= towerEvery; const t = Math.max(0, L - acc), x = x1 + o.ux * t + o.nx * (outer / 2 + gap / 2), z = z1 + o.uz * t + o.nz * (outer / 2 + gap / 2), gy = groundAt(x, z);
      const tw = box(towerW, o.top - gy + foot + (towerH - h), towerW, m, x, gy - foot, z); tw.rotation.y = -Math.atan2(o.uz, o.ux); g.add(tw); }
  } });
  return g;
}

// PALAIS DU NORD (Massada) : trois terrasses en gradins sur l'éperon nord. Dénivelés sourcés (≈ 20 m puis 15 m) ; plans simplifiés.
export function northernPalace(groundAt, top, { origin = [0, 0], dir = [0, -1], d1 = 22, d2 = 18, drop1 = 20, drop2 = 15 } = {}) {
  const g = new THREE.Group(), w = stone('dolomite'), pl = stone('plaster', { tint: '#efe4cf' }), col = stone('plaster', { tint: '#f4ead6' });
  const [ux, uz] = dir, px = -uz, pz = ux, [ox, oz] = origin, P = (a, b) => [ox + ux * a + px * b, oz + uz * a + pz * b];
  const podium = (cx, cz, sx, sz, y) => { const gy = Math.min(groundAt(cx, cz), y) - 6; const b = box(sx, y - gy, sz, w, cx, gy, cz); b.rotation.y = -Math.atan2(uz, ux) + Math.PI / 2; g.add(b); return b; };
  // terrasse supérieure : appartements + exèdre semi-circulaire à colonnes tournée vers le nord
  { const [cx, cz] = P(-6, 0); const r = box(22, 6, 14, pl, cx, top, cz); r.rotation.y = -Math.atan2(uz, ux) + Math.PI / 2; g.add(r);
    const [ex, ez] = P(4, 0), pts = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + Math.PI * i / 8; pts.push(P(4 + Math.cos(a) * 7.5, Math.sin(a) * 7.5)); }
    podium(ex, ez, 16, 18, top); g.add(columns(pts, 5, 0.32, col, top)); }
  // terrasse médiane : bâtiment circulaire (deux murs concentriques, colonnade)
  { const y = top - drop1, [cx, cz] = P(d1, 0); podium(cx, cz, 22, 20, y);
    const ring = (r, t, h) => { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2); const ho = new THREE.Path(); ho.absarc(0, 0, r - t, 0, Math.PI * 2, true); s.holes.push(ho);
      const mm = mesh(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 40 }), pl); mm.rotation.x = -Math.PI / 2; mm.position.set(cx, y, cz); g.add(mm); };
    ring(7.5, 0.9, 1.2); ring(4.6, 0.8, 1.2);
    const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push([cx + Math.cos(a) * 7, cz + Math.sin(a) * 7], [cx + Math.cos(a) * 4.2, cz + Math.sin(a) * 4.2]); } g.add(columns(pts, 4.5, 0.3, col, y + 1.2)); }
  // terrasse inférieure : salle carrée à péristyle (portiques sur les 4 côtés), petit bain à l'ouest
  { const y = top - drop1 - drop2, [cx, cz] = P(d1 + d2, 0); podium(cx, cz, 20, 20, y);
    const pts = []; for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) pts.push(P(d1 + d2 + i * 3.2, s * 6.4), P(d1 + d2 + s * 6.4, i * 3.2));
    g.add(columns(pts, 5.5, 0.34, col, y)); const rf = box(16, 0.5, 16, pl, cx, y + 5.5, cz); rf.rotation.y = -Math.atan2(uz, ux); g.add(rf); }
  return g;
}

// RAMPE DE SIÈGE : prisme de terre du point bas (a) au point haut (b), largeur w en haut, talus latéraux.
export function ramp(a, b, groundAt, { w = 12, slope = 1.4 } = {}) {
  const [x1, z1] = a, [x2, z2] = b, y1 = groundAt(x1, z1), y2 = b[2] ?? groundAt(x2, z2), L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux;
  const N = 24, pos = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, top = y1 + (y2 - y1) * t, gy = groundAt(x, z), hh = Math.max(0, top - gy), half = w / 2 + hh * slope;
    pos.push(x - nx * half, gy - 1, z - nz * half, x - nx * w / 2, top, z - nz * w / 2, x + nx * w / 2, top, z + nz * w / 2, x + nx * half, gy - 1, z + nz * half); }
  for (let i = 0; i < N; i++) { const a0 = i * 4, b0 = (i + 1) * 4; for (let k = 0; k < 3; k++) idx.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return mesh(geo, new THREE.MeshStandardMaterial({ color: '#a98d62', roughness: 1, side: THREE.DoubleSide }));
}

// MUR SIMPLE le long de polylignes (camps romains, circonvallation, murailles byzantines/croisées) ; tours optionnelles.
export function wallLines(lines, groundAt, { h = 3, thick = 1.5, kind = 'ashlar', tint = '#ffffff', towerEvery = 0, towerW = 6, towerH = 0, glacis = 0, moat = 0 } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint });
  lines.forEach(L => { let acc = 0; for (let i = 1; i < L.length; i++) {
    const [x1, z1] = L[i - 1], [x2, z2] = L[i], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
    const ux = (x2 - x1) / len, uz = (z2 - z1) / len, n = Math.max(1, Math.ceil(len / 12));
    for (let k = 0; k < n; k++) { const a = k / n, b = (k + 1) / n, ax = x1 + (x2 - x1) * a, az = z1 + (z2 - z1) * a, bx = x1 + (x2 - x1) * b, bz = z1 + (z2 - z1) * b, cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const gy = Math.min(groundAt(ax, az), groundAt(bx, bz)), top = Math.max(groundAt(ax, az), groundAt(bx, bz)) + h, l = len / n;
      const w = box(l + thick * 0.6, top - gy + 2, thick, m, cx, gy - 2, cz); w.rotation.y = -Math.atan2(uz, ux); g.add(w);
      if (glacis) { const gl = box(l + 0.5, glacis, thick + glacis * 0.9, m, cx, gy - 2, cz); gl.rotation.y = -Math.atan2(uz, ux); g.add(gl); } }
    if (towerEvery) { acc += len; while (acc >= towerEvery) { acc -= towerEvery; const t = Math.max(0, len - acc), x = x1 + ux * t, z = z1 + uz * t, gy = groundAt(x, z);
      const tw = box(towerW, (towerH || h + 3) + 2, towerW, m, x, gy - 2, z); tw.rotation.y = -Math.atan2(uz, ux); g.add(tw); } }
  } });
  return g;
}

// AQUEDUC à arcades le long d'une polyligne (canal au sommet).
export function aqueduct(lines, groundAt, { h = 7, w = 3.2, span = 4.2, pier = 1.6, kind = 'kurkar', topY = null } = {}) {
  const g = new THREE.Group(), m = stone(kind);
  lines.forEach(L => { for (let i = 1; i < L.length; i++) {
    const [x1, z1] = L[i - 1], [x2, z2] = L[i], len = Math.hypot(x2 - x1, z2 - z1); if (len < 1) continue;
    const ux = (x2 - x1) / len, uz = (z2 - z1) / len, step = span + pier, n = Math.max(1, Math.floor(len / step));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) * len / n, x = x1 + ux * t, z = z1 + uz * t, gy = groundAt(x, z), top = topY != null ? topY : gy + h;
      const a = archWall(len / n + 0.02, Math.max(1, top - gy - span / 2 - 1.2), span, w, m, 1.2); a.position.set(x, gy - 0.5, z); a.rotation.y = -Math.atan2(uz, ux); g.add(a); }
  } });
  return g;
}

// BRISE-LAMES (nouveaux môles du port) : jetée large le long d'une polyligne, à fleur d'eau, tours d'entrée optionnelles.
export function breakwater(lines, seaY, { w = 30, h = 3, kind = 'kurkar', towers = [] } = {}) {
  const g = new THREE.Group(), m = stone(kind), pv = stone('paving');
  lines.forEach(L => { for (let i = 1; i < L.length; i++) { const [x1, z1] = L[i - 1], [x2, z2] = L[i], len = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / len, uz = (z2 - z1) / len;
    const b = box(len + w * 0.3, h + 6, w, m, (x1 + x2) / 2, seaY - 6, (z1 + z2) / 2); b.rotation.y = -Math.atan2(uz, ux); g.add(b);
    const wl = box(len, 4, 2, m, (x1 + x2) / 2 - uz * (w / 2 - 1), seaY + h, (z1 + z2) / 2 + ux * (w / 2 - 1)); wl.rotation.y = -Math.atan2(uz, ux); g.add(wl); } });
  towers.forEach(([x, z]) => g.add(box(8, 14, 8, m, x, seaY, z)));
  return g;
}

// TEMPLE sur podium (prostyle hexastyle) avec plate-forme.
export function templeOnPodium({ podiumW = 100, podiumD = 90, podiumH = 4, L = 46, W = 28, H = 16, kind = 'kurkar', cols = 6, rows = 2 } = {}) {
  const g = new THREE.Group(), m = stone(kind), pl = stone('plaster', { tint: '#f1e8d6' }), cm = stone('marble', { rough: 0.5 });
  g.add(box(podiumW, podiumH, podiumD, m));
  const y = podiumH; g.add(box(W, 3, L, pl, 0, y, 0)); g.add(box(W - 6, H - 3, L - 10, pl, 0, y + 3, 4));
  const pts = []; for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) pts.push([-W / 2 + 2 + i * (W - 4) / (cols - 1), -L / 2 + 2 + r * 4]);
  g.add(columns(pts, H - 5, 0.75, cm, y + 3)); g.add(box(W, 1.6, L, pl, 0, y + H - 2, 0));
  const s = new THREE.Shape([V2(-W / 2, 0), V2(W / 2, 0), V2(0, 4.5)]); const gb = mesh(new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }), stone('ashlar', { tint: '#b4704c' })); gb.position.set(0, y + H - 0.4, -L / 2); g.add(gb);
  for (let i = 0; i < 9; i++) g.add(box(W * 0.8, 0.35, 0.8, m, 0, i * 0.35, -podiumD / 2 - 1 - i * 0.8 + 6)); // escalier de façade
  return g;
}

// BASSIN rectangulaire (W × D) avec margelle et péristyle optionnel.
export function pool({ W = 35, D = 18, depth = 2, peristyle = 6, kind = 'kurkar', pavilion = 0 } = {}) {
  const g = new THREE.Group(), m = stone(kind), water = new THREE.MeshStandardMaterial({ color: '#3c9be6', emissive: '#0e4f8f', emissiveIntensity: 0.25, roughness: 0.1, metalness: 0.1 });
  g.add(box(W + 4, 0.6, D + 4, stone('paving'), 0, -0.6, 0)); g.add(box(W, 0.1, D, water, 0, -0.35, 0));
  for (const [w, d, x, z] of [[W + 4, 2, 0, -D / 2 - 1], [W + 4, 2, 0, D / 2 + 1], [2, D, -W / 2 - 1, 0], [2, D, W / 2 + 1, 0]]) g.add(box(w, 0.7, d, m, x, -0.6, z));
  if (pavilion) { const t = tholos({ R: pavilion, h: 6, kind }); t.position.y = -0.4; g.add(t); }
  if (peristyle) { const pts = [], o = peristyle; for (let x = -W / 2 - o; x <= W / 2 + o + 0.1; x += 3.5) pts.push([x, -D / 2 - o], [x, D / 2 + o]); for (let z = -D / 2 - o + 3.5; z < D / 2 + o; z += 3.5) pts.push([-W / 2 - o, z], [W / 2 + o, z]);
    g.add(columns(pts, 5, 0.3, stone('marble', { rough: 0.5 }), 0)); const rf = new THREE.Group(); for (const [w, d, x, z] of [[W + 2 * o + 6, 4, 0, -D / 2 - o - 1], [W + 2 * o + 6, 4, 0, D / 2 + o + 1], [4, D + 2 * o, -W / 2 - o - 1, 0], [4, D + 2 * o, W / 2 + o + 1, 0]]) rf.add(box(w, 0.4, d, stone('ashlar', { tint: '#c79a72' }), x, 5.2, z)); g.add(rf); }
  return g;
}

// RANGÉE DE MAGASINS (Massada) : n salles longues parallèles L × w, murs de séparation, toit plat.
export function storerooms({ n = 11, L = 27, w = 4, h = 4, wall = 1, kind = 'dolomite' } = {}) {
  const g = new THREE.Group(), m = stone(kind), W = n * (w + wall) + wall;
  for (let i = 0; i <= n; i++) g.add(box(wall, h, L + 2 * wall, m, -W / 2 + wall / 2 + i * (w + wall), 0, 0));
  g.add(box(W, h, wall, m, 0, 0, -L / 2 - wall / 2)); g.add(box(W, h, wall, m, 0, 0, L / 2 + wall / 2));
  return g;
}

// ÉDIFICE générique : volume simple (bâtiment à cour, bain, synagogue…), optionnellement couvert d'une coupole.
export function hall({ W = 15, D = 12, h = 6, kind = 'dolomite', court = 0, domeR = 0, cols = 0, tint = '#ffffff' } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint });
  if (court) { const t = Math.min(W, D) * 0.22; for (const [w, d, x, z] of [[W, t, 0, -D / 2 + t / 2], [W, t, 0, D / 2 - t / 2], [t, D, -W / 2 + t / 2, 0], [t, D, W / 2 - t / 2, 0]]) g.add(box(w, h, d, m, x, 0, z)); }
  else g.add(box(W, h, D, m));
  if (cols) { const pts = []; for (let x = -W / 2 + 3; x <= W / 2 - 3; x += cols) pts.push([x, -D / 2 + 2.5], [x, D / 2 - 2.5]); g.add(columns(pts, h * 0.8, 0.3, stone('marble', { rough: 0.5 }), 0)); }
  if (domeR) { const pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI / 2; pts.push(V2(Math.max(0.01, Math.cos(a) * domeR), Math.sin(a) * domeR * 0.8)); } const d = mesh(new THREE.LatheGeometry(pts, 32), stone('plaster', { tint: '#e9dfc9' })); d.position.y = h; g.add(d); }
  return g;
}

// TOUR-MINARET cylindrique (mosquée bosniaque de Césarée) + salle de prière.
export function mosque({ W = 12, D = 10, h = 6, minH = 16 } = {}) {
  const g = new THREE.Group(), m = stone('kurkar', { tint: '#f3eadb' });
  g.add(box(W, h, D, m)); const c = mesh(new THREE.CylinderGeometry(1.5, 1.7, minH, 20), m); c.position.set(W / 2 - 1.5, minH / 2, -D / 2 + 1.5); g.add(c);
  const cone = mesh(new THREE.ConeGeometry(1.8, 3.2, 20), stone('plaster', { tint: '#a9b2b8' })); cone.position.set(W / 2 - 1.5, minH + 1.6, -D / 2 + 1.5); g.add(cone);
  return g;
}

// PORTE / FAÇADE à colonnes (nymphée, monument central) : mur courbe (abside) ou droit avec deux ordres de colonnes.
export function facade({ W = 22, h = 12, apse = true, kind = 'basalt', colKind = 'marble' } = {}) {
  const g = new THREE.Group(), m = stone(kind), cm = stone(colKind, { rough: 0.5 });
  if (apse) { const s = new THREE.Shape(); s.absarc(0, 0, W / 2, Math.PI, 0, true); s.absarc(0, 0, W / 2 - 1.6, 0, Math.PI, false); const a = mesh(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 24 }), m); a.rotation.x = -Math.PI / 2; a.rotation.z = Math.PI; g.add(a); }
  else g.add(box(W, h, 2, m, 0, 0, 1));
  const pts = []; for (let i = 0; i < 6; i++) pts.push([-W / 2 + 1.5 + i * (W - 3) / 5, -1.5]);
  g.add(columns(pts, h * 0.45, 0.4, cm, 0.6)); g.add(columns(pts, h * 0.38, 0.33, cm, h * 0.45 + 1.4)); g.add(box(W, 0.8, 2, cm, 0, h * 0.45 + 0.6, -1.5)); g.add(box(W, 0.6, 2, cm, 0, h * 0.83 + 1.4, -1.5));
  g.add(box(W + 1, 0.6, 4, stone('paving'), 0, 0, -1));
  return g;
}

// TEMPLE circulaire (tholos) sur podium.
export function tholos({ R = 6, h = 9, kind = 'limestone' } = {}) {
  const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(R + 2, R + 2.4, 2, 32).translate(0, 1, 0), stone(kind)));
  const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); } g.add(columns(pts, h, 0.45, stone('marble', { rough: 0.5 }), 2));
  g.add(mesh(new THREE.CylinderGeometry(R - 1.8, R - 1.8, h, 24).translate(0, 2 + h / 2, 0), stone(kind)));
  const d = mesh(new THREE.SphereGeometry(R + 0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), stone('ashlar', { tint: '#b4704c' })); d.scale.y = 0.45; d.position.y = 2 + h + 0.6; g.add(d);
  return g;
}

// TOUR carrée (tours croisées, tours de garde)
export function tower({ W = 8, h = 14, kind = 'kurkar' } = {}) { const g = new THREE.Group(), m = stone(kind); g.add(box(W, h, W, m)); for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) g.add(merlons(a * W / 2, b * W / 2, c * W / 2, d * W / 2, h, m, { h: 1.2 })); return g; }

// REPÈRE simple (lieu sans plan connu) : stèle et petit fanion.
export function marker({ h = 8 } = {}) { const g = new THREE.Group(); g.add(box(1.2, 1.2, 1.2, stone('ashlar'))); const p = mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 8), new THREE.MeshStandardMaterial({ color: '#5b4a35' })); p.position.y = h / 2 + 1.2; g.add(p);
  const f = mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ color: '#ffd878', side: THREE.DoubleSide, emissive: '#6b5200', emissiveIntensity: 0.3 })); f.position.set(1.3, h + 0.4, 0); g.add(f); return g; }

// FORTERESSE-PALAIS CIRCULAIRE (Hérodion) : double mur concentrique (écart g), grande tour est (D 18 m), trois tours semi-circulaires
// (D 16 m) au nord, à l'ouest et au sud ; jardin à colonnes (moitié est) et bâtiments (moitié ouest). Mesures : JVL / Netzer.
export function roundFortress({ R = 31, gap = 2.5, h = 30, eastD = 18, towerD = 16, kind = 'herodian', tint = '#ffffff' } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint }), pl = stone('plaster', { tint: '#efe4cf' });
  const ring = (r, t, hh, y = 0) => { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2); const ho = new THREE.Path(); ho.absarc(0, 0, r - t, 0, Math.PI * 2, true); s.holes.push(ho);
    const mm = mesh(new THREE.ExtrudeGeometry(s, { depth: hh, bevelEnabled: false, curveSegments: 64 }), m); mm.rotation.x = -Math.PI / 2; mm.position.y = y; g.add(mm); };
  ring(R, 1.6, h * 0.62); ring(R - 1.6 - gap, 1.3, h * 0.62);
  const tw = (x, z, D, hh, half) => { const c = mesh(new THREE.CylinderGeometry(D / 2, D / 2, hh, 40, 1, false, half ? -Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2), m); c.position.set(x, hh / 2, z); if (half) c.rotation.y = Math.atan2(x, z); g.add(c);
    const r = mesh(new THREE.CylinderGeometry(D / 2 + 0.3, D / 2 + 0.3, 0.6, 40, 1, false, half ? -Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2), pl); r.position.set(x, hh + 0.3, z); if (half) r.rotation.y = Math.atan2(x, z); g.add(r); };
  tw(R - 2, 0, eastD, h, false);                                   // tour orientale, pleine à la base
  for (const [x, z] of [[0, -R], [-R, 0], [0, R]]) tw(x, z, towerD, h * 0.78, true);
  const ri = R - 1.6 - gap - 1.3, pts = []; for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + Math.PI * i / 13; pts.push([Math.cos(a) * ri * 0.55 + 3, Math.sin(a) * ri * 0.8]); }
  g.add(columns(pts, 6, 0.35, stone('marble', { rough: 0.5 }), 0)); g.add(mesh(new THREE.CircleGeometry(ri * 0.55, 32, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(3, 0.1, 0), new THREE.MeshStandardMaterial({ color: '#6f8a4a', roughness: 1 })));
  g.add(box(ri * 0.9, h * 0.35, ri * 1.5, pl, -ri * 0.45, 0, 0));   // palais (moitié ouest)
  return g;
}
// PORTE À CHAMBRES (âge du fer) : deux massifs à n piliers de chaque côté du passage, tours en façade (Megiddo, Beer-Sheva…).
export function chamberGate({ W = 18, L = 20, chambers = 3, h = 6, pass = 4.2, kind = 'ashlar', tint = '#ffffff', towers = true } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint }), side = (W - pass) / 2, n = chambers + 1;
  for (const s of [-1, 1]) { const x = s * (pass / 2 + side / 2);
    g.add(box(1.6, h, L, m, s * (W / 2 - 0.8), 0, 0));                                    // mur extérieur
    for (let i = 0; i < n; i++) g.add(box(side, h, 1.8, m, x, 0, -L / 2 + 0.9 + i * (L - 1.8) / (n - 1))); // piliers
    if (towers) g.add(box(side + 2, h + 2, 6, m, x, 0, -L / 2 - 2)); }
  return g;
}
// SALLE À PILIERS (écuries / entrepôts) : n unités parallèles, chacune à deux rangées de piliers.
export function pillaredHall({ units = 5, L = 21, w = 11, h = 4, kind = 'ashlar', tint = '#ffffff' } = {}) {
  const g = new THREE.Group(), m = stone(kind, { tint }), W = units * w;
  for (let u = 0; u < units; u++) { const x = -W / 2 + w / 2 + u * w; g.add(box(0.8, h, L, m, x - w / 2 + 0.4, 0, 0));
    for (const s of [-1, 1]) { const pts = []; for (let k = 0; k < 12; k++) pts.push([x + s * w / 6, -L / 2 + 1 + k * (L - 2) / 11]); pts.forEach(([px, pz]) => g.add(box(0.6, h * 0.8, 0.6, m, px, 0, pz))); } }
  g.add(box(0.8, h, L, m, W / 2 - 0.4, 0, 0)); g.add(box(W, h, 0.8, m, 0, 0, -L / 2)); g.add(box(W, h, 0.8, m, 0, 0, L / 2));
  return g;
}
// AUTEL ROND (bamah) : plate-forme circulaire à gradins (Megiddo : 8,5 m de diamètre, 1,5 m de haut, 7 marches).
export function roundAltar({ D = 8.5, h = 1.5, kind = 'ashlar' } = {}) { const g = new THREE.Group(), m = stone(kind, { tint: '#d8c8a6' }); g.add(mesh(new THREE.CylinderGeometry(D / 2, D / 2 + 0.3, h, 40).translate(0, h / 2, 0), m));
  for (let i = 0; i < 7; i++) g.add(box(1.8, (i + 1) * h / 7, 0.4, m, 0, 0, D / 2 + 2.8 - i * 0.4)); return g; }
// FOSSE-SILO ronde : margelle et cuve (rendue en creux sombre), deux escaliers.
export function silo({ D = 11, depth = 7, kind = 'ashlar' } = {}) { const g = new THREE.Group(), m = stone(kind);
  const s = new THREE.Shape(); s.absarc(0, 0, D / 2 + 0.8, 0, Math.PI * 2); const ho = new THREE.Path(); ho.absarc(0, 0, D / 2, 0, Math.PI * 2, true); s.holes.push(ho);
  const r = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false, curveSegments: 40 }), m); r.rotation.x = -Math.PI / 2; g.add(r);
  g.add(mesh(new THREE.CircleGeometry(D / 2, 40).rotateX(-Math.PI / 2).translate(0, 0.05, 0), new THREE.MeshStandardMaterial({ color: '#3a2e22', roughness: 1 }))); void depth; return g; }
// TOUR RONDE pleine.
export function roundTower({ D = 10, h = 12, kind = 'ashlar', tint = '#ffffff' } = {}) { const g = new THREE.Group(), m = stone(kind, { tint }); g.add(mesh(new THREE.CylinderGeometry(D / 2, D / 2 + 0.3, h, 32).translate(0, h / 2, 0), m)); return g; }

export { mergeGeometries };

// BAIN BYZANTIN DÉTAILLÉ (Césarée, sur les gradins de l'hippodrome d'Hérode, Ve s.) — repère : +x = est, −z = nord.
// Ce qui est documenté (dépliant RTG, cours סיור 15, guide de Jorge) : chaud à l'ouest et froid à l'est ; four (praefurnium) ;
// hypocauste (sol suspendu sur des piles de briques) ; tubuli dans les murs ; frigidarium avec deux réseaux d'eau (terre cuite et plomb) ;
// sol de marbre restauré (centaines de plaques) ; au nord, cour à colonnes (palestre) à sol de mosaïque.
// HYPOTHÈSES de restitution : partition exacte des salles, hauteurs, nombre de bassins, place de l'apodyterium. Toits retirés (vue en coupe).
// ruin = true : état actuel (murs arasés, piles de l'hypocauste à nu, sol de marbre restauré, bases de colonnes).
function canvasMat(draw, { rep = 1, rough = 0.8 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d'), 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(rep, rep);
  return new THREE.MeshStandardMaterial({ map: t, roughness: rough });
}
const BATH_MAT = {};
function bathMats() {
  if (BATH_MAT.ok) return BATH_MAT;
  Object.assign(BATH_MAT, {
    ok: true,
    brick: new THREE.MeshStandardMaterial({ color: '#b5653f', roughness: 0.95 }),
    water: new THREE.MeshStandardMaterial({ color: '#3f9fd8', emissive: '#0d4c80', emissiveIntensity: 0.2, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }),
    fire: new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff5a10', emissiveIntensity: 1.4 }),
    lead: new THREE.MeshStandardMaterial({ color: '#8f959a', metalness: 0.4, roughness: 0.5 }),
    clay: new THREE.MeshStandardMaterial({ color: '#c0703f', roughness: 0.9 }),
    soot: new THREE.MeshStandardMaterial({ color: '#3a2e27', roughness: 1 }),
    // sol de marbre de couleurs (le dépliant RTG : marbre, granite, porphyre, plaques restaurées)
    marbleFloor: canvasMat((g, s) => { const C = ['#ece7dc', '#c9c3b6', '#7d2f3a', '#3b5d4a', '#9b5e55', '#e4dccb', '#5c5f73'], u = s / 8; let k = 7;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { k = (k * 31 + 17) % 97; g.fillStyle = C[(i + j) % 2 ? 0 : 1 + k % 6]; g.fillRect(i * u, j * u, u, u);
        g.fillStyle = C[(k >> 2) % 7]; g.beginPath(); g.moveTo(i * u + u / 2, j * u + 3); g.lineTo(i * u + u - 3, j * u + u / 2); g.lineTo(i * u + u / 2, j * u + u - 3); g.lineTo(i * u + 3, j * u + u / 2); g.fill();
        g.strokeStyle = '#00000022'; g.strokeRect(i * u, j * u, u, u); } }, { rep: 3, rough: 0.35 }),
    // mosaïque de la cour : fond blanc, bordure et motifs géométriques en pierre locale (rouge, noir, ocre)
    mosaic: canvasMat((g, s) => { g.fillStyle = '#ede4d0'; g.fillRect(0, 0, s, s); const u = s / 32;
      for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) { const b = i < 2 || j < 2 || i > 29 || j > 29, m = (Math.abs(i % 8 - 4) + Math.abs(j % 8 - 4)) === 3;
        if (b || m) { g.fillStyle = b ? '#7a2d22' : ((i + j) % 16 < 8 ? '#2b2622' : '#b07a3a'); g.fillRect(i * u + .5, j * u + .5, u - 1, u - 1); } } }, { rep: 2, rough: 0.7 })
  });
  return BATH_MAT;
}
export function bathhouse({ W = 30, D = 25, h = 7, kind = 'kurkar', ruin = false, palaestra = true } = {}) {
  const g = new THREE.Group(), M = bathMats(), wallM = stone(kind), plaster = stone('plaster', { tint: '#f1e8d6' }), marble = stone('marble', { rough: 0.45 });
  const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, T = 1.1;                 // murs de 1,1 m
  const H = ruin ? null : h, rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const wallH = () => H ?? (0.5 + rnd() * 1.2);
  // segment de mur, découpé en tronçons de hauteur variable si ruine
  const wall = (ax, az, bx, bz, t = T, mat = wallM) => {
    const len = Math.hypot(bx - ax, bz - az), n = ruin ? Math.max(1, Math.round(len / 2.2)) : 1;
    for (let i = 0; i < n; i++) { const f0 = i / n, f1 = (i + 1) / n, hh = wallH(); if (ruin && rnd() < 0.08) continue;
      const cx = ax + (bx - ax) * (f0 + f1) / 2, cz = az + (bz - az) * (f0 + f1) / 2, b = box(len / n + (ruin ? 0 : t), hh, t, mat, 0, 0, 0);
      b.position.set(cx, hh / 2, cz); b.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(b); } };
  // ---- plan (HYPOTHÈSE) : rangée sud = caldarium (O) | tepidarium | frigidarium (E) ; rangée nord = apodyterium ; cour au nord
  const zMid = z0 + D * 0.42, xC = x0 + W * 0.36, xT = x0 + W * 0.6;
  // socle et sols
  g.add(box(W + 2, 0.4, D + 2, stone('paving', { tint: '#e2d4b8' }), 0, -0.4, 0));
  // ---- hypocauste (caldarium + tepidarium) : piles de briques sous le sol suspendu
  const pilae = []; for (let x = x0 + 1.6; x < xT - 0.8; x += 1.1) for (let z = zMid + 1.2; z < z1 - 0.8; z += 1.1) pilae.push([x, z]);
  const pg = new THREE.BoxGeometry(0.42, 0.75, 0.42).translate(0, 0.375, 0), im = new THREE.InstancedMesh(pg, M.brick, pilae.length), m4 = new THREE.Matrix4();
  pilae.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); im.setMatrixAt(i, m4); }); im.castShadow = im.receiveShadow = true; g.add(im);
  g.add(box(xT - x0 - 1, 0.05, z1 - zMid - 1, M.soot, (x0 + xT) / 2, 0.01, (zMid + z1) / 2));          // fond noirci par la fumée
  // sol suspendu (suspensura) : entier dans le bain en usage, en partie effondré dans la ruine
  if (!ruin) g.add(box(xT - x0 - 1.2, 0.3, z1 - zMid - 1.2, M.marbleFloor, (x0 + xT) / 2, 0.75, (zMid + z1) / 2));
  else g.add(box((xT - x0) * 0.32, 0.3, (z1 - zMid) * 0.45, M.marbleFloor, xT - (xT - x0) * 0.2, 0.75, z1 - (z1 - zMid) * 0.27));
  // frigidarium : sol de marbre restauré + bassin froid ; deux réseaux d'eau (terre cuite et plomb)
  g.add(box(x1 - xT - 1.2, 0.12, z1 - zMid - 1.2, M.marbleFloor, (xT + x1) / 2, 0, (zMid + z1) / 2));
  const pw = 5.5, pd = 4; g.add(box(pw + 1, 0.9, pd + 1, marble, x1 - 4.6, 0, z1 - 4)); g.add(box(pw, 0.2, pd, M.water, x1 - 4.6, ruin ? 0.15 : 0.55, z1 - 4));
  if (ruin) g.children.at(-1).visible = false;                                       // bassin vide aujourd'hui
  const pipe = (mat, r, dz) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - xT - 2, 10), mat); p.rotation.z = Math.PI / 2; p.position.set((xT + x1) / 2, 0.25, z1 - 0.9 - dz); p.castShadow = true; g.add(p); };
  pipe(M.clay, 0.12, 0); pipe(M.lead, 0.07, 0.35);
  // caldarium : deux bassins chauds (alvei) et abside à l'ouest ; tepidarium : banquettes
  if (!ruin) { g.add(box(4, 0.8, 3, marble, x0 + 3.5, 1.05, z1 - 2.6)); g.add(box(3.4, 0.2, 2.4, M.water, x0 + 3.5, 1.6, z1 - 2.6));
    g.add(box(4, 0.8, 3, marble, x0 + 3.5, 1.05, zMid + 2.6)); g.add(box(3.4, 0.2, 2.4, M.water, x0 + 3.5, 1.6, zMid + 2.6)); }
  else { g.add(box(4, 0.35, 3, marble, x0 + 3.5, 0, z1 - 2.6)); }
  g.add(box(0.6, ruin ? 0.4 : 0.5, z1 - zMid - 2.4, marble, xT - 1, ruin ? 0 : 1.05, (zMid + z1) / 2));
  const s = new THREE.Shape(); s.absarc(0, 0, 3.4, Math.PI / 2, -Math.PI / 2, false); s.absarc(0, 0, 2.3, -Math.PI / 2, Math.PI / 2, true);
  const ap = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: ruin ? 1.4 : h, bevelEnabled: false, curveSegments: 18 }), wallM); ap.rotation.x = -Math.PI / 2; ap.rotation.z = Math.PI;
  ap.position.set(x0, 0, (zMid + z1) / 2); ap.castShadow = ap.receiveShadow = true; g.add(ap);
  // praefurnium (four) contre le mur ouest, avec le feu dans le bain en usage
  g.add(box(3.4, ruin ? 1 : 3.2, 3, wallM, x0 - 2.4, 0, zMid + 1.6)); g.add(box(1.2, 0.9, 1.6, ruin ? M.soot : M.fire, x0 - 1.1, 0.1, zMid + 1.6));
  // tubuli (conduits de chaleur dans les murs) : visibles sur la face intérieure du mur sud, côté chaud
  if (!ruin) for (let x = x0 + 1.5; x < xT - 1; x += 0.9) g.add(box(0.28, h - 1.2, 0.18, M.clay, x, 1.05, z1 - T / 2 - 0.12));
  // murs extérieurs et cloisons ; enduit clair à l'intérieur du bain en usage
  wall(x0, z0, x1, z0); wall(x1, z0, x1, z1); wall(x1, z1, x0, z1); wall(x0, z1, x0, z0);
  wall(x0, zMid, x1, zMid, 0.8); wall(xC, zMid, xC, z1, 0.8); wall(xT, zMid, xT, z1, 0.8);
  if (!ruin) g.add(box(x1 - x0 - 2.4, 0.08, 0.05, plaster, 0, h - 0.6, zMid + 0.45));
  // apodyterium (vestiaire) au nord : banquettes le long des murs
  g.add(box(W - 3, ruin ? 0.35 : 0.5, 0.6, marble, 0, 0, z0 + 1.0)); g.add(box(W - 3, ruin ? 0.35 : 0.5, 0.6, marble, 0, 0, zMid - 0.9));
  g.add(box(W - 2.4, 0.08, zMid - z0 - 2, M.mosaic, 0, 0, (z0 + zMid) / 2));
  // ---- palestre au nord : cour à colonnes, sol de mosaïque
  const cw = W - 2, cd = 18, cz = z0 - cd / 2 - 0.6;
  if (!palaestra) { g.userData.parts = bathParts(x0, xC, xT, x1, z0, zMid, z1, null); return g; }
  g.add(box(cw, 0.12, cd, M.mosaic, 0, 0, cz));
  const pts = []; for (let x = -cw / 2 + 1.5; x <= cw / 2 - 1.4; x += 3) pts.push([x, cz - cd / 2 + 1.5], [x, cz + cd / 2 - 1.5]);
  for (let z = cz - cd / 2 + 4.5; z < cz + cd / 2 - 2; z += 3) pts.push([-cw / 2 + 1.5, z], [cw / 2 - 1.5, z]);
  if (!ruin) { g.add(columns(pts, 5, 0.3, marble, 0.12)); for (const [w, d, x, z] of [[cw, 3.2, 0, cz - cd / 2 + 1.5], [cw, 3.2, 0, cz + cd / 2 - 1.5], [3.2, cd, -cw / 2 + 1.5, cz], [3.2, cd, cw / 2 - 1.5, cz]]) g.add(box(w, 0.35, d, stone('ashlar', { tint: '#c98f68' }), x, 5.3, z)); }
  else { const stumps = pts.filter(() => rnd() > 0.25).map(([x, z]) => [x, z, 0.12]); g.add(columns(stumps, 1.1, 0.32, marble, 0.12)); g.add(columns(pts.filter((_, i) => i % 7 === 3), 4.2, 0.3, marble, 0.12)); }
  wall(-cw / 2, cz - cd / 2, cw / 2, cz - cd / 2, 0.8); wall(-cw / 2, cz - cd / 2, -cw / 2, z0, 0.8); wall(cw / 2, cz - cd / 2, cw / 2, z0, 0.8);
  g.userData.parts = bathParts(x0, xC, xT, x1, z0, zMid, z1, cz);
  return g;
}
// repères des parties (repère local), affichés de près
function bathParts(x0, xC, xT, x1, z0, zMid, z1, cz) {
  return [
    { he: 'קלדריום (חם)', fr: 'Caldarium (chaud)', en: 'Caldarium (hot)', p: [(x0 + xC) / 2, 3, (zMid + z1) / 2] },
    { he: 'טפידריום', fr: 'Tepidarium', en: 'Tepidarium', p: [(xC + xT) / 2, 3, (zMid + z1) / 2] },
    { he: 'פריג׳ידריום (קר)', fr: 'Frigidarium (froid)', en: 'Frigidarium (cold)', p: [(xT + x1) / 2, 3, (zMid + z1) / 2] },
    { he: 'היפוקאוסט', fr: 'Hypocauste', en: 'Hypocaust', p: [xC - 2, 1.6, z1 - 2] },
    { he: 'תנור (פרפורניום)', fr: 'Four (praefurnium)', en: 'Furnace (praefurnium)', p: [x0 - 2.4, 3.6, zMid + 1.6] },
    { he: 'חדר הלבשה', fr: 'Vestiaire (apodyterium)', en: 'Changing room (apodyterium)', p: [0, 2.4, (z0 + zMid) / 2] },
    ...(cz == null ? [] : [{ he: 'חצר עמודים (פלסטרה) ופסיפס', fr: 'Palestre à colonnes et mosaïque', en: 'Colonnaded palaestra and mosaic', p: [0, 3, cz] }])];
}

// GRANDS THERMES (bain occidental de Beit Shéan, fin du IVe s.) — dépliant RTG : env. 9 dounams ; bâtiment central de huit salles
// (coupoles et voûtes ; hypocauste sous les salles chaudes ; murs à enduit coloré ; sols de marbre et de mosaïque), entouré sur trois côtés
// de portiques ouvrant sur des salles et des exèdres ; aux extrémités des portiques, bassins et fontaines décoratives.
// Partition, dimensions et nombre de salles : HYPOTHÈSE de restitution. Toits retirés (vue en coupe).
export function grandBath({ W = 48, D = 38, h = 8, kind = 'basalt', ruin = false, stoa = 7, rooms = 7 } = {}) {
  const g = bathhouse({ W, D, h, kind: 'plaster', ruin, palaestra: false }), M = bathMats(), marble = stone('marble', { rough: 0.45 }), wallM = stone(kind);
  const x0 = -W / 2 - stoa, x1 = W / 2 + stoa, z0 = -D / 2 - stoa, z1 = D / 2;           // portiques : ouest, est, nord (le sud = façade du bâtiment)
  const rnd = (() => { let s = 23; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  // sols des portiques (mosaïque) et colonnades
  for (const [w, d, x, z] of [[W + 2 * stoa, stoa, 0, -D / 2 - stoa / 2], [stoa, D, -W / 2 - stoa / 2, 0], [stoa, D, W / 2 + stoa / 2, 0]]) g.add(box(w, 0.12, d, M.mosaic, x, 0, z));
  const pts = []; for (let x = x0 + 1.5; x <= x1 - 1.4; x += 3.2) pts.push([x, z0 + 1.2]); for (let z = z0 + 4.4; z <= z1 - 1; z += 3.2) pts.push([x0 + 1.2, z], [x1 - 1.2, z]);
  if (!ruin) g.add(columns(pts, 6, 0.33, marble, 0.12));
  else { g.add(columns(pts.filter(() => rnd() > 0.3), 1 + rnd() * 0.4, 0.34, marble, 0.12)); g.add(columns(pts.filter((_, i) => i % 6 === 2), 5.2, 0.33, marble, 0.12)); }
  // salles et exèdres derrière les portiques (rangée extérieure), murs bas si ruine
  const rH = ruin ? 1.2 : h - 2, rw = rooms;
  for (const [w, d, x, z] of [[x1 - x0 + 2 * rw, rw, 0, z0 - rw / 2], [rw, z1 - z0, x0 - rw / 2, (z0 + z1) / 2], [rw, z1 - z0, x1 + rw / 2, (z0 + z1) / 2]]) {
    for (const [ww, dd, xx, zz] of [[w, 0.9, x, z - d / 2], [0.9, d, x - w / 2, z], [0.9, d, x + w / 2, z]]) g.add(box(ww, rH * (ruin ? 0.6 + rnd() * 0.6 : 1), dd, wallM, xx, 0, zz)); }
  // cloisons des salles et exèdres semi-circulaires au milieu de chaque aile
  for (let x = x0 - rw + 6; x < x1 + rw - 2; x += 8) g.add(box(0.7, rH, rw, wallM, x, 0, z0 - rw / 2));
  for (let z = z0 + 6; z < z1 - 2; z += 8) { g.add(box(rw, rH, 0.7, wallM, x0 - rw / 2, 0, z)); g.add(box(rw, rH, 0.7, wallM, x1 + rw / 2, 0, z)); }
  const ex = new THREE.Shape(); ex.absarc(0, 0, 4, 0, Math.PI, false); ex.absarc(0, 0, 3.2, Math.PI, 0, true);
  const exG = new THREE.ExtrudeGeometry(ex, { depth: rH, bevelEnabled: false, curveSegments: 16 });
  for (const [x, z, ry] of [[0, z0 - rw, 0], [x0 - rw, (z0 + z1) / 2, Math.PI / 2], [x1 + rw, (z0 + z1) / 2, -Math.PI / 2]]) { const e = mesh(exG, wallM); e.rotation.x = -Math.PI / 2; e.rotation.z = ry; e.position.set(x, 0, z); g.add(e); }
  // bassins et fontaines aux extrémités des portiques (côté sud)
  for (const x of [x0 + stoa / 2, x1 - stoa / 2]) { g.add(box(stoa - 1, 0.8, 6, marble, x, 0, z1 + 3.4)); const w = box(stoa - 2, 0.2, 5, M.water, x, ruin ? 0.1 : 0.5, z1 + 3.4); w.visible = !ruin; g.add(w);
    if (!ruin) g.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 12).translate(x, 1.4, z1 + 3.4), marble)); }
  g.add(box(x1 - x0 + 2 * rw, 0.3, z1 - z0 + rw + 8, stone('paving', { tint: '#c9c2b3' }), 0, -0.35, (z0 - rw + z1 + 7) / 2 ));
  g.userData.parts = (g.userData.parts || []).concat([
    { he: 'סטווים (אכסדרות עמודים)', fr: 'Portiques', en: 'Porticoes', p: [x0 + stoa / 2, 3.5, 0] },
    { he: 'חדרים ואקסדרות', fr: 'Salles et exèdres', en: 'Rooms and exedrae', p: [0, 3.5, z0 - rw / 2] },
    { he: 'בריכות ומזרקות', fr: 'Bassins et fontaines', en: 'Pools and fountains', p: [x1 - stoa / 2, 2.5, z1 + 3.4] }]);
  return g;
}

// LATRINES PUBLIQUES (Beit Shéan) — RTG + cours : bâtiment près des thermes, cour centrale à colonnes ; bancs de pierre percés
// au-dessus d'une rigole d'eau courante, rigole de rinçage devant (éponge sur un bâton). Dimensions : HYPOTHÈSE.
export function latrine({ W = 14, D = 12, h = 5, kind = 'basalt', ruin = false } = {}) {
  const g = new THREE.Group(), m = stone(kind), marble = stone('marble', { rough: 0.5 }), M = bathMats(), H = ruin ? 1.3 : h;
  for (const [w, d, x, z] of [[W, 0.8, 0, -D / 2], [W, 0.8, 0, D / 2], [0.8, D, -W / 2, 0], [0.8, D, W / 2, 0]]) g.add(box(w, H, d, m, x, 0, z));
  g.add(box(W - 1, 0.1, D - 1, stone('paving', { tint: '#d9d2c4' }), 0, 0, 0));
  const ins = 1.6;   // bancs sur trois côtés, rigole devant
  for (const [w, d, x, z] of [[W - 2, 0.6, 0, -D / 2 + ins - 0.2], [0.6, D - 2 * ins, -W / 2 + ins - 0.2, 0], [0.6, D - 2 * ins, W / 2 - ins + 0.2, 0]]) g.add(box(w, 0.5, d, marble, x, 0, z));
  for (const [w, d, x, z] of [[W - 4, 0.3, 0, -D / 2 + ins + 0.4], [0.3, D - 2 * ins - 1, -W / 2 + ins + 0.4, 0], [0.3, D - 2 * ins - 1, W / 2 - ins - 0.4, 0]]) g.add(box(w, 0.06, d, M.water, x, 0.05, z));
  const c = []; for (const x of [-2.4, 0, 2.4]) c.push([x, -1.6], [x, 1.6]); g.add(columns(c, ruin ? 2.2 : 3.8, 0.22, marble, 0.1));
  g.userData.parts = [{ he: 'מושבי אבן מעל תעלת מים', fr: 'Bancs au-dessus de l’eau courante', en: 'Seats over running water', p: [0, 2, -D / 2 + 1.4] }];
  return g;
}

// SIGMA (Beit Shéan, époque byzantine) — RTG : place semi-circulaire, salles ouvrant sur la place, sols de mosaïque (Tyché) ;
// sous la sigma, restes d'un odéon romain. Rayon et nombre de salles : HYPOTHÈSE.
export function sigma({ R = 22, depth = 6, h = 5, kind = 'basalt', ruin = false, rooms = 12 } = {}) {
  const g = new THREE.Group(), m = stone(kind), M = bathMats(), H = ruin ? 1.1 : h;
  const ring = (r0, r1, hh, mat) => { const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, Math.PI, false); s.absarc(0, 0, r0, Math.PI, 0, true);
    const e = mesh(new THREE.ExtrudeGeometry(s, { depth: hh, bevelEnabled: false, curveSegments: 40 }), mat); e.rotation.x = -Math.PI / 2; return e; };
  g.add(ring(R + depth, R + depth + 0.9, H, m)); g.add(ring(R, R + 0.7, H, m));               // mur extérieur et façade des salles
  const fl = ring(R + 0.7, R + depth, 0.12, M.mosaic); fl.position.y = 0.2; g.add(fl);                               // sols de mosaïque des salles
  for (let i = 0; i <= rooms; i++) { const a = Math.PI * i / rooms, r = R + depth / 2; const b = box(0.6, H, depth, m, Math.cos(a) * r, 0, -Math.sin(a) * r); b.rotation.y = Math.PI / 2 - a; g.add(b); }
  const pl = new THREE.Mesh(new THREE.CircleGeometry(R, 40, 0, Math.PI).rotateX(-Math.PI / 2), stone('paving', { tint: '#bfb8aa' })); pl.position.y = 0.25; g.add(pl);
  g.userData.parts = [{ he: 'פסיפס טיכה', fr: 'Mosaïque de Tyché', en: 'Tyche mosaic', p: [0, 2, -(R + depth / 2)] }];
  return g;
}
