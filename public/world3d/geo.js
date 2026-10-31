// Mondes 3D — géométries architecturales réutilisables (unités : mètres).
// Colonnes à entasis, base attique, chapiteau corinthien (feuilles d'acanthe, volutes, abaque concave), entablement mouluré, arcs.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const merge = gs => { const g = mergeGeometries(gs.map(x => x.index ? x.toNonIndexed() : x), false); return g; };

// UV en mètres par projection sur l'axe dominant de la normale (la taille des pierres reste constante partout).
export function meterUV(g, scale = 1) {
  g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// Bloc courbe (portion d'anneau) : rayon r0→r1, hauteur y0→y1, angles a0→a1 (même convention que LatheGeometry : x = r sin a, z = r cos a).
export function ringBlock(r0, r1, y0, y1, a0, a1, seg) {
  seg = seg || Math.max(2, Math.ceil((a1 - a0) * r1 / 1.2));
  const pts = [new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y0), new THREE.Vector2(r1, y1), new THREE.Vector2(r0, y1), new THREE.Vector2(r0, y0)];
  const g = new THREE.LatheGeometry(pts, seg, a0, a1 - a0);
  // bouchons latéraux
  const cap = a => { const s = new THREE.Shape([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y0), new THREE.Vector2(r1, y1), new THREE.Vector2(r0, y1)]);
    const c = new THREE.ShapeGeometry(s); // plan (r,y) projeté à l'angle a
    const pos = c.attributes.position; for (let i = 0; i < pos.count; i++) { const r = pos.getX(i) , y = pos.getY(i); pos.setXYZ(i, r * Math.sin(a), y, r * Math.cos(a)); } c.deleteAttribute('normal'); c.computeVertexNormals(); return c; };
  return merge([g, cap(a0), cap(a1)]);
}
// Profil de gradin romain : siège avec léger nez arrondi (assise 0,42 m, profondeur 0,78 m).
export function seatRow(r, y, depth, rise, a0, a1, seg) {
  const p = [[r, y], [r, y + rise - 0.05], [r + 0.03, y + rise - 0.02], [r + 0.08, y + rise], [r + depth, y + rise], [r + depth, y]].map(v => new THREE.Vector2(v[0], v[1]));
  seg = seg || Math.max(3, Math.ceil((a1 - a0) * r / 1.0));
  return new THREE.LatheGeometry(p, seg, a0, a1 - a0);
}
// Boîte orientée posée au sol : centre (x,z), base y, angle autour de Y.
export function box(w, h, d, x, y, z, rot = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); if (rot) g.rotateY(rot); g.translate(x, y, z); return g; }
export function polar(r, a) { return [r * Math.sin(a), r * Math.cos(a)]; }

// Arc en plein cintre (ou brisé pour l'erreur volontaire) : panneau percé, extrudé en profondeur.
export function archPanel(w, h, openW, springH, depth) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-openW / 2, 0); s.lineTo(-openW / 2, springH);
  s.absarc(0, springH, openW / 2, Math.PI, 0, true);
  s.lineTo(openW / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -depth / 2); return g;
}
export function pointedPortal(w, h, openW, springH, depth) {
  const s = new THREE.Shape(); const r = openW * 0.85, cx = openW / 2 - r, top = springH + Math.sqrt(r * r - cx * cx);
  s.moveTo(-w / 2, 0); s.lineTo(-openW / 2, 0); s.lineTo(-openW / 2, springH); s.quadraticCurveTo(-openW / 2, top * 0.95, 0, top); s.quadraticCurveTo(openW / 2, top * 0.95, openW / 2, springH);
  s.lineTo(openW / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -depth / 2); return g;
}

// ---- ordre corinthien ----
// D = diamètre inférieur du fût. Proportions vitruviennes approchées (fût ≈ 8,5 D, chapiteau ≈ 1,1 D).
export function atticBase(D, seg = 24) {
  const R = D / 2, p = [[0, 0], [R * 1.45, 0], [R * 1.45, D * .12], [R * 1.38, D * .13], [R * 1.4, D * .2], [R * 1.3, D * .24], [R * 1.1, D * .26], [R * 1.05, D * .3], [R * 1.18, D * .34], [R * 1.12, D * .4], [R * 1.02, D * .42], [0, D * .42]];
  const lathe = new THREE.LatheGeometry(p.map(v => new THREE.Vector2(v[0], v[1])), seg);
  const plinth = new THREE.BoxGeometry(D * 1.5, D * .12, D * 1.5); plinth.translate(0, D * .06, 0);
  return merge([lathe, plinth]);
}
export function shaft(D, H, seg = 24) {
  const R = D / 2, n = 10, p = [];
  for (let i = 0; i <= n; i++) { const t = i / n, ent = 1 - 0.13 * Math.pow(t, 1.6) + 0.02 * Math.sin(t * Math.PI); p.push(new THREE.Vector2(R * ent, t * H)); }
  p.unshift(new THREE.Vector2(R * 1.06, 0)); p.push(new THREE.Vector2(R * 0.92, H));
  return new THREE.LatheGeometry(p, seg);
}
function leaf(w, h, curl, detail) {
  const sx = detail >= 2 ? 6 : 3, sy = detail >= 2 ? 8 : 4;
  const g = new THREE.PlaneGeometry(w, h, sx, sy); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const t = y / h, e = Math.abs(x) / (w / 2);
    // silhouette lancéolée + dentelure + nervure centrale + enroulement de la pointe
    const width = Math.sin(Math.min(1, t * 1.15) * Math.PI) * (0.55 + 0.45 * (1 - t));
    x *= width * (1 + (detail >= 2 ? 0.12 * Math.sin(t * 38 + e * 6) : 0));
    const zc = -0.18 * w * (1 - e * e) + curl * Math.pow(Math.max(0, t - 0.55), 2) * h * 2.6;
    const yc = y - curl * Math.pow(Math.max(0, t - 0.7), 2) * h * 1.2;
    p.setXYZ(i, x, yc, zc + 0.05 * w * Math.abs(Math.sin(e * 9)));
  }
  g.computeVertexNormals(); return g;
}
export function corinthianCapital(D, detail = 1) {
  const R = D / 2, H = D * 1.1, parts = [];
  const bell = new THREE.LatheGeometry([[R * .92, 0], [R * .95, H * .1], [R * 1.0, H * .5], [R * 1.12, H * .82], [R * 1.2, H * .86], [0, H * .86]].map(v => new THREE.Vector2(v[0], v[1])), 20);
  parts.push(bell);
  const ring = new THREE.TorusGeometry(R * .95, D * .035, 6, 20); ring.rotateX(Math.PI / 2); ring.translate(0, D * .02, 0); parts.push(ring);
  const rows = detail >= 1 ? [[H * .38, 0, R * .98], [H * .62, Math.PI / 8, R * .9]] : [[H * .55, 0, R * .95]];
  for (const [lh, off, rr] of rows) for (let i = 0; i < 8; i++) {
    const a = off + i * Math.PI / 4, l = leaf(D * .42, lh, 0.55, detail);
    l.rotateX(-0.12); l.translate(0, 0, rr); l.rotateY(a); l.translate(0, H * .02, 0); parts.push(l);
  }
  if (detail >= 1) for (let i = 0; i < 4; i++) {
    // volutes d'angle et hélices centrales (spirales en tube)
    for (const [ang, size, y0] of [[Math.PI / 4 + i * Math.PI / 2, D * .16, H * .66], [i * Math.PI / 2, D * .09, H * .7]]) {
      const pts = []; for (let k = 0; k <= 18; k++) { const t = k / 18, rr = size * (1 - t * .75), th = t * Math.PI * 2.2; pts.push(new THREE.Vector3(Math.cos(th) * rr * .6, y0 + Math.sin(th) * rr, 0)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, D * .025, 5); tube.translate(0, 0, R * 1.18); tube.rotateY(ang); parts.push(tube);
    }
  }
  // abaque à côtés concaves
  const A = R * 1.45;
  const ab = new THREE.Shape(); const c = A * .86, k = A * .22;
  ab.moveTo(-c, -A); ab.quadraticCurveTo(0, -A + k, c, -A); ab.lineTo(A, -c); ab.quadraticCurveTo(A - k, 0, A, c); ab.lineTo(c, A); ab.quadraticCurveTo(0, A - k, -c, A); ab.lineTo(-A, c); ab.quadraticCurveTo(-A + k, 0, -A, -c); ab.closePath();
  const abg = new THREE.ExtrudeGeometry(ab, { depth: H * .14, bevelEnabled: true, bevelSize: D * .015, bevelThickness: D * .015, bevelSegments: 1, curveSegments: 6 });
  abg.rotateX(-Math.PI / 2); abg.translate(0, H * .86, 0); parts.push(abg);
  const fl = new THREE.SphereGeometry(D * .06, 8, 6); fl.translate(0, H * .93, R * 1.32); for (let i = 0; i < 4; i++) { const f = fl.clone(); f.rotateY(i * Math.PI / 2); parts.push(f); }
  return merge(parts);
}
// Entablement : architrave à 2 fasces, frise, corniche à denticules — section extrudée sur une longueur L (axe z).
export function entablature(L, h, proj) {
  const s = new THREE.Shape(), a = h * .38, f = h * .28;
  s.moveTo(0, 0); s.lineTo(proj * .2, 0); s.lineTo(proj * .2, a * .5); s.lineTo(proj * .26, a * .5); s.lineTo(proj * .26, a); s.lineTo(proj * .3, a);
  s.lineTo(proj * .3, a + f); s.lineTo(proj * .45, a + f + h * .05); s.lineTo(proj * .5, a + f + h * .12); s.lineTo(proj * .95, a + f + h * .2); s.lineTo(proj, h * .92); s.lineTo(proj * .9, h); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }); g.translate(0, 0, -L / 2); return g;
}
export function dentils(L, y, x, size) { const n = Math.floor(L / (size * 1.8)), gs = []; for (let i = 0; i < n; i++) { const b = new THREE.BoxGeometry(size, size * 1.2, size); b.translate(x, y, -L / 2 + (i + .5) * size * 1.8); gs.push(b); } return gs.length ? merge(gs) : null; }

// Colonne corinthienne complète (base + fût + chapiteau), posée à y=0, hauteur totale ≈ 10,2 D.
export function corinthianColumn(D, detail) {
  const base = atticBase(D), sh = shaft(D, D * 8.5), cap = corinthianCapital(D * .92, detail);
  sh.translate(0, D * .42, 0); cap.translate(0, D * .42 + D * 8.5, 0);
  return { base, shaft: sh, capital: cap, height: D * .42 + D * 8.5 + D * 1.01 };
}
export { mergeVertices };
