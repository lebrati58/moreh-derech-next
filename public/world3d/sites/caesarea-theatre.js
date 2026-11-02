// Césarée Maritime — le théâtre romain en deux époques, dans le MÊME repère (centre de l'orchestra = origine, x = est, −x = mer, 1 unité = 1 m).
// ANTIQUITÉ « vers 30 apr. J.-C. » (théâtre hérodien tardif) ; AUJOURD'HUI (vestiges + restauration des années 1960 + équipements de concert).
// Données et incertitudes : sites/caesarea.json (dimensions, sources). Les valeurs marquées HYPOTHÈSE ne sont pas publiées en accès libre.
import * as THREE from 'three';
import { merge, meterUV, ringBlock, seatRow, box, polar, archPanel, pointedPortal, corinthianColumn, entablature, dentils, atticBase, corinthianCapital, shaft } from '../geo.js';
import { pbr, paintedPlaster, opusSectile, fluteNormal } from '../materials.js';

// ---- dimensions (m) ----
const ORCH_R = 15;                 // orchestra Ø 30 m (theatrum.de)
const BALT = [15, 15.6];           // balteus (mur du podium de l'orchestra)
const ROW_D = 0.78, ROW_H = 0.42;  // profondeur / hauteur d'un rang (HYPOTHÈSE : valeurs romaines courantes)
const IMA_N = 14, SUMMA_N = 18;    // HYPOTHÈSE (non publié en accès libre)
const IMA_R0 = 15.6, IMA_Y0 = 1.2;
const IMA_TOP = IMA_Y0 + IMA_N * ROW_H, IMA_R1 = IMA_R0 + IMA_N * ROW_D;          // 7.08 m / 26.52 m
const PRAEC = [IMA_R1, IMA_R1 + 1.8];                                             // praecinctio
const SUM_R0 = PRAEC[1] + 0.58, SUM_Y0 = IMA_TOP + 1.2;                            // 28.9 m / 8.28 m
const SUM_TOP = SUM_Y0 + SUMMA_N * ROW_H, SUM_R1 = SUM_R0 + SUMMA_N * ROW_D;      // 15.84 m / 42.94 m
const OUT_R = 45;                  // cavea Ø 90 m (Frova, d'après Weiss 2014)
const END_X = 3;                   // les gradins s'arrêtent à x = 3–4 m : passage de l'aditus entre scène et cavea
const STAGE = { x0: -7.5, x1: 0, z: 31, h: 1.4 };  // HYPOTHÈSE (dimensions du pulpitum non publiées en accès libre)
const SF = { front: -7.5, back: -9.5, rear: -14, h: 16.7 };

export function buildCaesarea(opt = {}) {
  const detail = opt.detail ?? 1, rnd = mulberry(7);
  const buckets = new Map();
  const put = (era, tag, mat, g, o = {}) => {
    if (!g) return;
    const key = [era, tag, mat, o.collide ? 1 : 0, o.hidden ? 1 : 0].join('|');
    let b = buckets.get(key); if (!b) { b = { era, tag, mat, collide: !!o.collide, hidden: !!o.hidden, cast: o.cast !== false, geoms: [] }; buckets.set(key, b); }
    b.geoms.push(o.uv === false ? (g.index ? g.toNonIndexed() : g) : meterUV(g));
  };
  const inst = [];
  const both = (tag, mat, g, o) => { put('ancient', tag, mat, g.clone(), o); put('present', tag, mat, g, o); };

  // ===================== CAVEA =====================
  const angStart = r => Math.asin(Math.min(0.99, (END_X + 1) / r)), angEnd = r => Math.PI - angStart(r);
  const imaStairs = [1, 2, 3, 4, 5].map(i => i * Math.PI / 6);                 // 6 cunei (HYPOTHÈSE)
  const sumStairs = [1, 2, 3, 4, 5, 6].map(j => j * Math.PI / 7);               // 7 cunei, 6 escaliers (vulgarisation, à vérifier)
  const vomit = [0, 1, 2, 4, 5, 6].map(j => (j + 0.5) * Math.PI / 7);           // 6 vomitoires (vulgarisation, à vérifier)
  const gaps = (r, stairs, extra) => { const out = []; stairs.forEach(a => out.push([a, 0.55 / r])); (extra || []).forEach(a => out.push([a, 1.5 / r])); return out.sort((x, y) => x[0] - y[0]); };
  const spans = (r, gs) => { let a = angStart(r); const out = []; gs.forEach(([c, h]) => { if (c - h > a) out.push([a, c - h]); a = Math.max(a, c + h); }); out.push([a, angEnd(r)]); return out.filter(s => s[1] - s[0] > 0.004); };

  function rows(era, which) {
    const isIma = which === 'ima', N = isIma ? IMA_N : SUMMA_N, r0 = isIma ? IMA_R0 : SUM_R0, y0 = isIma ? IMA_Y0 : SUM_Y0;
    const tag = era === 'ancient' ? (isIma ? 'imaCavea' : 'summaCavea') : (isIma ? 'imaPresent' : 'summaPresent');
    const mat = era === 'ancient' ? 'seat' : (isIma ? 'seatOld' : 'seatNew');
    for (let k = 0; k < N; k++) {
      const r = r0 + k * ROW_D, y = y0 + k * ROW_H, gs = gaps(r, isIma ? imaStairs : sumStairs, !isIma && k < 6 ? vomit : null);
      for (const [a0, a1] of spans(r, gs)) {
        if (era === 'present' && isIma) {
          // vestiges : blocs d'environ 1,4 m, usés, parfois manquants ou affaissés
          const n = Math.max(1, Math.round((a1 - a0) * r / 1.4)), da = (a1 - a0) / n;
          for (let i = 0; i < n; i++) {
            if (rnd() < 0.07 && k > 1) continue;
            const sink = rnd() < 0.18 ? -0.04 - rnd() * 0.1 : (rnd() - .5) * 0.03;
            const g = seatRow(r, y, ROW_D, ROW_H + sink, a0 + i * da + 0.004, a0 + (i + 1) * da - 0.004, 2);
            put(era, tag, mat, g, { collide: true });
          }
        } else put(era, tag, mat, seatRow(r, y, ROW_D, ROW_H, a0, a1), { collide: true });
      }
      // marches d'accès depuis l'orchestra (au pied de chaque escalier de l'ima cavea)
      if (isIma && k === 0) for (const a of imaStairs) for (let s = 0; s < 5; s++) { const [x, z] = polar(14.2 + s * 0.28 + 0.14, a); put(era, 'scalaria', era === 'ancient' ? 'seat' : 'seatOld', box(1.1, 0.28 * (s + 1), 0.28, x, 0, z, a), { collide: true }); }
      // escaliers : 2 marches par rang
      for (const a of isIma ? imaStairs : sumStairs) for (let s = 0; s < 2; s++) {
        const rr = r + 0.195 + s * 0.39, top = y + ROW_H * (s + 1) / 2, [x, z] = polar(rr, a);
        put(era, 'scalaria', era === 'ancient' ? 'seat' : 'seatOld', box(1.1, top, 0.39, x, 0, z, a), { collide: true });
      }
    }
  }
  for (const era of ['ancient', 'present']) {
    rows(era, 'ima'); rows(era, 'summa');
    // balteus de l'orchestra (enduit peint dans l'Antiquité ; restauré bas aujourd'hui)
    for (const [a0, a1] of spans(BALT[1], imaStairs.map(a => [a, 0.6 / BALT[1]]))) {
      put(era, era === 'ancient' ? 'orchestraAncient' : 'orchestraPresent', era === 'ancient' ? 'plasterRed' : 'ruin', ringBlock(BALT[0], BALT[1], 0, era === 'ancient' ? IMA_Y0 : 0.9, a0, a1), { collide: true });
      if (era === 'ancient') put(era, 'orchestraAncient', 'plaster', ringBlock(BALT[0] - 0.08, BALT[1] + 0.05, IMA_Y0, IMA_Y0 + 0.1, a0, a1), { collide: true });
    }
    // praecinctio : sol + mur arrière (coupé aux vomitoires)
    put(era, 'praecinctio', era === 'ancient' ? 'paving' : 'ruin', ringBlock(PRAEC[0], PRAEC[1], IMA_TOP - 0.3, IMA_TOP, angStart(PRAEC[1]), angEnd(PRAEC[1])), { collide: true });
    for (const [a0, a1] of spans(SUM_R0, vomit.map(a => [a, 1.5 / SUM_R0]))) put(era, 'praecinctio', era === 'ancient' ? 'plaster' : 'ruin', ringBlock(PRAEC[1], SUM_R0, IMA_TOP, SUM_Y0, a0, a1), { collide: true });
    // vomitoires : portail en plein cintre + couloir voûté sous les premiers rangs du haut
    for (const a of vomit) {
      const pan = archPanel(3.6, 3.6, 2.4, 2.1, 0.45); pan.rotateY(a); const [x, z] = polar(SUM_R0 - 0.2, a); pan.translate(x, IMA_TOP, z);
      put(era, 'vomitorium', era === 'ancient' ? 'plaster' : 'ruin', pan, { collide: true });
      const L = 4.6, rc = SUM_R0 + L / 2;
      for (const s of [-1, 1]) { const g = box(0.4, 3.5, L, s * 1.4, 0, 0); g.rotateY(a); const [cx, cz] = polar(rc, a); g.translate(cx, IMA_TOP, cz); put(era, 'vomitorium', 'stone', g, { collide: true }); }
      const roof = box(3.2, 0.35, L, 0, 0, 0); roof.rotateY(a); const [cx, cz] = polar(rc, a); roof.translate(cx, IMA_TOP + 3.5, cz); put(era, 'vomitorium', 'stone', roof, { collide: true });
      const back = box(3.2, 3.5, 0.3, 0, 0, 0); back.rotateY(a); const [bx, bz] = polar(SUM_R0 + L, a); back.translate(bx, IMA_TOP, bz); put(era, 'vomitorium', 'dark', back, { collide: true });
    }
    // couronnement + mur extérieur
    const presentTop = SUM_TOP; // le niveau haut a été reconstruit à sa hauteur
    put(era, era === 'ancient' ? 'summaCavea' : 'summaPresent', era === 'ancient' ? 'paving' : 'seatNew', ringBlock(SUM_R1, OUT_R - 0.8, presentTop - 0.3, presentTop, angStart(OUT_R), angEnd(OUT_R)), { collide: true });
    facade(era);
    endWalls(era);
    corridor(era);
  }

  // Façade extérieure : arcades sur deux niveaux (substructions voûtées, terrain plat). Rythme et hauteurs : HYPOTHÈSE.
  function facade(era) {
    const N = 25, a0 = angStart(OUT_R), a1 = angEnd(OUT_R), da = (a1 - a0) / N, rc = OUT_R - 0.4;
    for (let i = 0; i < N; i++) {
      const a = a0 + (i + .5) * da, w = 2 * rc * Math.sin(da / 2) + 0.06, [x, z] = polar(rc, a);
      const ruined = era === 'present';
      const low = archPanel(w, 7, w * .52, 4.2, 0.9); low.rotateY(a); low.translate(x, 0, z);
      put(era, 'substructure', ruined ? 'ruin' : 'stone', low, { collide: true });
      // niveau supérieur : arcades aveugles (absent / arasé aujourd'hui sur la façade)
      const upH = ruined ? 1 + rnd() * 2.2 : SUM_TOP + 1.4 - 7;
      const up = ruined ? box(w, upH, 0.9, 0, 0, 0) : archPanel(w, upH, w * .44, 4.1, 0.9);
      up.rotateY(a); up.translate(x, 7, z); put(era, 'substructure', ruined ? 'ruin' : 'stone', up, { collide: true });
      if (!ruined) {
        const pil = box(0.55, SUM_TOP + 1.4, 0.35, 0, 0, 0); pil.rotateY(a + da / 2); const [px, pz] = polar(OUT_R + 0.05, a + da / 2); pil.translate(px, 0, pz); put(era, 'substructure', 'stone', pil);
      }
    }
    if (era === 'ancient') {
      put(era, 'substructure', 'stone', ringBlock(OUT_R - 0.9, OUT_R + 0.25, 6.8, 7.25, a0, a1));
      put(era, 'substructure', 'stone', ringBlock(OUT_R - 0.9, OUT_R + 0.3, SUM_TOP + 1.4, SUM_TOP + 1.85, a0, a1));
    }
  }
  // Murs d'extrémité (analemmata) : profil de la cavea, extrudé sur 1 m.
  function endWalls(era) {
    const prof = [[IMA_R0 - 0.6, 0], [IMA_R0 - 0.6, IMA_Y0 + .4], [IMA_R1, IMA_TOP + .4], [SUM_R0, SUM_Y0 + .4], [SUM_R1, SUM_TOP + .4], [OUT_R, SUM_TOP + 1.4], [OUT_R, 0]];
    const s = new THREE.Shape(prof.map(([a, b]) => new THREE.Vector2(a, era === 'present' && a > SUM_R0 ? b - 0.3 : b)));
    for (const side of [1, -1]) {
      let g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); if (g.index) g = g.toNonIndexed(); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i), d = p.getZ(i); p.setXYZ(i, END_X + d, v, side * u); }
      if (side < 0) flip(g);
      g.computeVertexNormals(); put(era, 'substructure', era === 'ancient' ? 'stone' : 'ruin', g, { collide: true });
    }
  }
  // Couloir annulaire voûté sous la cavea, accessible par les arcades (praticable).
  function corridor(era) {
    const a0 = angStart(OUT_R), a1 = angEnd(OUT_R);
    put(era, 'substructure', 'stone', ringBlock(41.0, 41.6, 0, 7.2, a0, a1), { collide: true });
    put(era, 'substructure', 'dark', ringBlock(41.6, OUT_R - 0.85, 6.6, 7.2, a0, a1), { collide: true });
    put(era, 'substructure', era === 'ancient' ? 'paving' : 'rubble', ringBlock(41.6, OUT_R - 0.85, -0.05, 0.02, a0, a1), { collide: true });
    put(era, 'substructure', 'stone', ringBlock(43.3, 43.6, 7.2, SUM_TOP + 1.4, a0, a1));
  }

  // ===================== ORCHESTRA et ADITUS =====================
  const half = r => { const g = new THREE.CircleGeometry(r, 64, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); return g; };
  { const g = half(ORCH_R); g.translate(0, 0.02, 0); put('ancient', 'orchestraAncient', 'painted', g, { collide: true }); }
  { const g = half(ORCH_R); g.translate(0, 0.02, 0); put('present', 'orchestraPresent', 'paving', g, { collide: true }); }
  for (const s of [1, -1]) { const g = box(END_X, 0.03, OUT_R - BALT[0], END_X / 2, 0, s * (BALT[0] + (OUT_R - BALT[0]) / 2)); both('parodos', 'paving', g, { collide: true }); }

  // ===================== SCÈNE — ANTIQUITÉ (vers 30 apr. J.-C.) =====================
  {
    const E = 'ancient';
    put(E, 'pulpitum', 'plaster', box(STAGE.x1 - STAGE.x0, STAGE.h, 2 * STAGE.z, (STAGE.x0 + STAGE.x1) / 2, 0, 0), { collide: true });
    put(E, 'pulpitum', 'woodOld', box(STAGE.x1 - STAGE.x0 - 0.05, 0.04, 2 * STAGE.z - 0.1, (STAGE.x0 + STAGE.x1) / 2, STAGE.h, 0), { collide: true });
    // proscaenium : façade plane enduite et peinte (phase hérodienne tardive), pilastres et deux petits escaliers (HYPOTHÈSE)
    put(E, 'proscaenium', 'plasterRed', box(0.12, 0.5, 2 * STAGE.z, 0.06, 0, 0));
    for (let z = -29; z <= 29; z += 3.6) if (Math.abs(Math.abs(z) - 9) > 1.4) put(E, 'proscaenium', 'plaster', box(0.18, STAGE.h, 0.42, 0.09, 0, z));
    put(E, 'proscaenium', 'plaster', box(0.22, 0.12, 2 * STAGE.z, 0.11, STAGE.h - 0.12, 0));
    for (const s of [1, -1]) for (let k = 0; k < 4; k++) put(E, 'proscaenium', 'plaster', box(0.4, STAGE.h * (k + 1) / 4, 2.2, 0.2 + (3 - k) * 0.4, 0, s * 9), { collide: true });
    scaenaeFrons();
  }
  function scaenaeFrons() {
    const E = 'ancient', T = 'scaenaeFrons', H = SF.h, F = SF.front, B = SF.back;
    const wall = (z0, z1, x0 = B, x1 = F, h = H, y = 0, mat = 'plaster', tag = T) => put(E, tag, mat, box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2), { collide: true });
    // mur de façade, en plan d'après Weiss 2014 : renfoncement central rectangulaire (2 portes) ; portes latérales dans des niches courbes
    for (const s of [1, -1]) { wall(...ord(s * 31, s * 18)); wall(...ord(s * 12, s * 5)); }
    // renfoncement central (regia) : fond à x = −10.5 … −12.5, avec deux portes
    wall(-5, -3.3, -12.5, -10.5); wall(-1.1, 1.1, -12.5, -10.5); wall(3.3, 5, -12.5, -10.5);
    for (const z of [-2.2, 2.2]) { wall(z - 1.1, z + 1.1, -12.5, -10.5, H - 4.4, 4.4); put(E, T, 'door', box(0.12, 4.4, 2.2, -10.45, 0, z)); }
    for (const s of [1, -1]) wall(...ord(s * 5, s * 5.6), -10.5, B);
    // niches courbes des hospitalia (rayon 3 m) avec porte au fond
    for (const s of [1, -1]) {
      const zc = s * 15, shell = new THREE.CylinderGeometry(3.6, 3.6, H, 24, 1, true, -Math.PI, Math.PI).toNonIndexed();
      shell.translate(F, H / 2, zc); put(E, 'hospitalia', 'plaster', shell, { collide: true });
      const inner = flip(new THREE.CylinderGeometry(3, 3, H, 24, 1, true, -Math.PI, Math.PI).translate(F, H / 2, zc).toNonIndexed()); put(E, 'hospitalia', 'plaster', inner);
      const cap = new THREE.RingGeometry(3, 3.6, 24, 1, Math.PI / 2, Math.PI); cap.rotateX(-Math.PI / 2); cap.translate(F, H, zc); put(E, 'hospitalia', 'plaster', cap);
      put(E, 'hospitalia', 'door', box(0.12, 4.2, 2.0, F - 2.95, STAGE.h, zc));
      // conque de la niche (demi-coupole) au-dessus de la porte
      const dome = flip(new THREE.SphereGeometry(3, 18, 8, -Math.PI / 2, Math.PI, 0, Math.PI / 2).translate(F, 9.2, zc).toNonIndexed()); put(E, 'hospitalia', 'plaster', dome);
    }
    // corps arrière (postscaenium) fermé, toit, retours latéraux
    wall(-31, 31, SF.rear, -12.5, H, 0, 'stone');
    for (const s of [1, -1]) wall(...ord(s * 31, s * 30.2), SF.rear, B, H, 0, 'stone');
    put(E, T, 'stone', box(F - SF.rear + 0.3, 0.5, 62.6, (F + SF.rear) / 2, H, 0));
    // registre bas peint (HYPOTHÈSE)
    put(E, T, 'plasterRed', box(0.06, 1.2, 62, F + 0.03, STAGE.h, 0));
    // ordre inférieur : podium + colonnes corinthiennes en kurkar stuqué, entablement à ressauts
    const zs = [5.9, 8.4, 11.6, 18.4, 21.6, 26.4, 29.4]; const all = [...zs, ...zs.map(z => -z)];
    const lowD = 0.62, upD = 0.5, xCol = F + 1.35;
    const lowCol = corinthianColumn(lowD, detail), upCol = corinthianColumn(upD, detail);
    const lowY = STAGE.h + 1.2, lowTop = lowY + lowCol.height, ent1 = 1.25, upY = lowTop + ent1 + 0.55, upTop = upY + upCol.height, ent2 = 0.95;
    put(E, T, 'plaster', box(1.7, 1.2, 62, F + 0.85, STAGE.h, 0), { collide: true });
    columns(all.map(z => [xCol, lowY, z]), lowCol, lowD);
    put(E, T, 'plaster', box(1.0, 0.55, 62, F + 0.5, lowTop + ent1, 0));
    columns(all.map(z => [xCol - 0.1, upY, z]), upCol, upD);
    const e1 = entablature(62, ent1, 0.9); e1.translate(F, lowTop, 0); put(E, T, 'plaster', e1);
    const e2 = entablature(62, ent2, 0.75); e2.translate(F, upTop, 0); put(E, T, 'plaster', e2);
    for (const z of all) {
      const r1 = entablature(1.5, ent1, 1.95); r1.translate(F, lowTop, z); put(E, T, 'plaster', r1);
      const r2 = entablature(1.3, ent2, 1.7); r2.translate(F, upTop, z); put(E, T, 'plaster', r2);
      put(E, T, 'plaster', box(1.0, 0.55, 1.2, xCol - 0.1, upY - 0.55, z));
    }
    if (detail >= 1) { const d1 = dentils(62, lowTop + ent1 * .78, F + 0.62, 0.11); put(E, T, 'plaster', d1); }
    // fenêtres-niches rectangulaires de l'étage (aediculae plates, HYPOTHÈSE)
    for (const z of [-24, -14.5, 0, 14.5, 24]) { put(E, T, 'plasterShade', box(0.06, 3.2, 1.8, F + 0.03, upY + 0.6, z)); put(E, T, 'plaster', box(0.22, 0.25, 2.3, F + 0.11, upY + 3.8, z)); }
  }
  // colonnes instanciées : base, fût cannelé, chapiteau
  function columns(list, col, D) {
    for (const part of ['base', 'shaft', 'capital']) inst.push({ era: 'ancient', tag: 'scaenaeFrons', part, geo: col[part], list, D });
    list.forEach(([x, y, z]) => put('ancient', 'scaenaeFrons', 'collider', box(D * 1.2, col.height, D * 1.2, x, y, z), { collide: true, hidden: true }));
  }

  // ===================== SCÈNE — AUJOURD'HUI =====================
  {
    const E = 'present', T = 'scaenaRuins';
    // fondations arasées suivant le plan (hauteurs irrégulières)
    const course = (x0, x1, z0, z1, hMin, hMax) => { const L = Math.max(Math.abs(z1 - z0), Math.abs(x1 - x0)), n = Math.max(1, Math.round(L / 1.25));
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, h = hMin + rnd() * (hMax - hMin);
        if (rnd() < 0.08) continue;
        const xa = x0 + (x1 - x0) * t0, xb = x0 + (x1 - x0) * t1, za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
        const w = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? Math.abs(xb - xa) : Math.abs(x1 - x0) || 0.8, d = Math.abs(z1 - z0) >= Math.abs(x1 - x0) ? Math.abs(zb - za) : 0.8;
        put(E, T, 'ruin', box(Math.max(0.8, w) - 0.04, h, Math.max(0.8, d) - 0.04, (xa + xb) / 2, 0, (za + zb) / 2), { collide: true }); } };
    course(-0.8, -0.8, -31, 31, 0.3, 1.1);
    for (const s of [1, -1]) { course(F2(), F2(), s * 31, s * 18, 0.6, 1.6); course(F2(), F2(), s * 12, s * 5, 0.4, 1.4); course(-13.25, -13.25, s * 31, s * 0.5, 0.3, 1.0); }
    function F2() { return (SF.front + SF.back) / 2; }
    course(-11.5, -11.5, -5, 5, 0.3, 0.9);
    for (const s of [1, -1]) for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 8, x = SF.front - 3.3 * Math.cos(a), z = s * 15 + 3.3 * Math.sin(a); put(E, T, 'ruin', box(0.9, 0.4 + rnd() * 0.9, 0.9, x, 0, z, a), { collide: true }); }
    // fragments de la phase impériale : fûts de granite couchés, chapiteaux et bases en marbre
    const gr = shaft(0.62, 5.2, 18);
    [[-3, 0, 22, 1.2], [-4.5, 0, -24, -0.4], [-2.2, 0, -27.5, 0.9], [-5.5, 0, 26.8, -1.3], [2.5, 0, 33, 0.3], [-1.5, 0, 36, 1.5]].forEach(([x, y, z, rot]) => {
      const g = gr.clone(); g.rotateZ(Math.PI / 2); g.translate(2.6, 0.31, 0); g.rotateY(rot); g.translate(x, y - 0.05, z); put(E, T, 'granite', g, { collide: true, uv: false }); });
    const cap = corinthianCapital(0.58, detail);
    [[-6, 25, 0.6, 0.35], [-3.6, -29, -0.8, -0.3], [1.8, 37.5, 2.1, 0.5], [-7.2, -21, 1.2, 0]].forEach(([x, z, ry, tilt]) => {
      const g = cap.clone(); g.rotateZ(tilt); g.rotateY(ry); g.translate(x, -0.12, z); put(E, T, 'marble', g, { collide: true }); });
    const base = atticBase(0.62);
    [[-6.2, 29.4], [-6.2, -26.4], [-6.2, 5.9]].forEach(([x, z]) => put(E, T, 'marble', base.clone().translate(x, 0, z), { collide: true }));
    // scène de concert moderne
    const S = 'modernStage';
    put(E, S, 'woodDark', box(12, 1.3, 38, -7, 0, 0), { collide: true });
    put(E, S, 'black', box(0.05, 1.28, 38, -0.98, 0, 0));
    for (let k = 0; k < 4; k++) put(E, S, 'woodDark', box(0.35, 1.3 * (k + 1) / 4, 2.4, -0.8 + (3 - k) * 0.35, 0, 0), { collide: true });
    for (const s of [1, -1]) lightTower(E, 'lightTowers', -2.2, s * 22.5);
    // inscription de Pilate (moulage) près de l'entrée nord
    put(E, 'pilateStone', 'stoneLight', box(1.1, 0.5, 0.6, 7, 0, -48.5), { collide: true });
    put(E, 'pilateStone', 'pilate', box(0.82, 0.65, 0.2, 7, 0.5, -48.5), { uv: false, collide: true });
  }
  function lightTower(era, tag, x, z) {
    const h = 12, w = 0.9;
    for (const dx of [-w / 2, w / 2]) for (const dz of [-w / 2, w / 2]) put(era, tag, 'metal', box(0.09, h, 0.09, x + dx, 0, z + dz), { collide: true });
    for (let y = 0.6; y < h; y += 1.2) { put(era, tag, 'metal', box(w, 0.06, 0.06, x, y, z - w / 2)); put(era, tag, 'metal', box(w, 0.06, 0.06, x, y, z + w / 2)); put(era, tag, 'metal', box(0.06, 0.06, w, x - w / 2, y, z)); }
    put(era, tag, 'metal', box(1.6, 0.12, 1.6, x, h, z));
    for (const dz of [-0.45, 0, 0.45]) put(era, tag, 'lamp', box(0.32, 0.32, 0.32, x + 0.5, h - 0.4, z + dz));
  }

  // ===================== MURAILLE SUD (position approximative) =====================
  const WALL_Z = 62, TOWER_X = 18;
  { put('ancient', 'cityWall', 'stone', box(150, 7.5, 1.8, 15, 0, WALL_Z), { collide: true });
    put('ancient', 'cityWall', 'stone', box(150, 1.1, 0.5, 15, 7.5, WALL_Z + 0.65));
    const t = new THREE.CylinderGeometry(5.5, 5.8, 10, 28); t.translate(TOWER_X, 5, WALL_Z + 1); put('ancient', 'cityWall', 'stone', t, { collide: true });
    for (let x = -58; x < 88; x += 1.6) { if (rnd() < 0.18) continue; put('present', 'cityWall', 'ruin', box(1.55, 0.3 + rnd() * 1.4, 1.8, x, -0.15, WALL_Z + (rnd() - .5) * .1), { collide: true }); }
    const ts = new THREE.CylinderGeometry(5.5, 5.8, 1.3, 28); ts.translate(TOWER_X, 0.5, WALL_Z + 1); put('present', 'cityWall', 'ruin', ts, { collide: true }); }

  // ===================== VELARIUM et PROEDRIA (cours : סיור 15, guide de Jorge) =====================
  // Velarium : toiles tendues au-dessus du public pour l'ombre (spectacles à midi). Mâts au sommet de la cavea et bandes de toile :
  // disposition HYPOTHÉTIQUE (aucun trou de mât publié en accès libre pour Césarée).
  { const N = 14, a0 = angStart(OUT_R), a1 = angEnd(OUT_R);
    for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N, [x, z] = polar(OUT_R - 0.6, a);
      const m = new THREE.CylinderGeometry(0.16, 0.22, 10, 8); m.translate(x, SUM_TOP + 5, z); put('ancient', 'velarium', 'woodOld', m); }
    for (let i = 0; i < N; i += 2) { const s0 = a0 + (a1 - a0) * i / N, s1 = a0 + (a1 - a0) * (i + 1) / N;
      put('ancient', 'velarium', 'linen', ringBlock(30, OUT_R - 0.6, SUM_TOP + 7.2, SUM_TOP + 7.3, s0, s1, 8)); } }
  // Proedria : rangs d'honneur au bas de la cavea, face à la scène (sièges à dossier : HYPOTHÈSE de forme).
  { const r = IMA_R0 + ROW_D; put('ancient', 'proedria', 'marble', ringBlock(r - 0.14, r, IMA_Y0 + ROW_H, IMA_Y0 + ROW_H + 0.55, angStart(r), angEnd(r)), { collide: true }); }

  // ===================== ERREURS VOLONTAIRES (mission « trouve les erreurs », cachées sinon) =====================
  { const p = pointedPortal(7, 10.5, 4, 4.6, 1.5); p.rotateY(Math.PI / 2); p.translate(OUT_R + 0.9, 0, 0); put('ancient', 'errGothic', 'stoneWarm', p, { collide: true });
    const g = half(ORCH_R - 0.4); g.translate(0, 0.045, 0); put('ancient', 'errMarble', 'sectile', g);
    lightTower('ancient', 'errTower', 2.4, 28.5); }

  // ===================== CONSTRUCTION DES MAILLAGES =====================
  const mats = materials();
  const eras = { ancient: new THREE.Group(), present: new THREE.Group() }, errors = new THREE.Group();
  eras.ancient.name = 'ancient'; eras.present.name = 'present'; errors.name = 'errors'; errors.visible = false; eras.ancient.add(errors);
  const colliders = { ancient: [], present: [] }, tagMeshes = { ancient: {}, present: {} }, pickables = [];
  for (const b of buckets.values()) {
    const g = merge(b.geoms); g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, b.mat === 'collider' ? null : mats[b.mat].clone());
    mesh.userData = { era: b.era, tag: b.tag };
    if (b.hidden || b.mat === 'collider') { mesh.visible = false; mesh.material = new THREE.MeshBasicMaterial(); }
    else { mesh.castShadow = b.cast; mesh.receiveShadow = true; (tagMeshes[b.era][b.tag] ||= []).push(mesh); pickables.push(mesh); }
    (/^err/.test(b.tag) ? errors : eras[b.era]).add(mesh);
    if (b.collide) colliders[b.era].push(mesh);
  }
  for (const it of inst) {
    const isShaft = it.part === 'shaft';
    const m = isShaft ? mats.column.clone() : mats.capital.clone();
    const g = isShaft ? it.geo : meterUV(it.geo.clone());
    const im = new THREE.InstancedMesh(g, m, it.list.length); const o = new THREE.Object3D();
    it.list.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = im.receiveShadow = true; im.userData = { era: it.era, tag: it.tag };
    eras[it.era].add(im); (tagMeshes[it.era][it.tag] ||= []).push(im); pickables.push(im);
  }
  const plan = { orchestra: ORCH_R, ima: IMA_R1, outer: OUT_R, endX: END_X, stage: STAGE, sf: SF, wallZ: WALL_Z, towerX: TOWER_X, shoreX: -58 };
  return { eras, errors, colliders, tagMeshes, pickables, plan, stats: { buckets: buckets.size, instanced: inst.length } };
}

function materials() {
  const fl = fluteNormal();
  const col = pbr('plaster', { tile: 0.7, tint: '#f5efe3', roughness: 0.75, gain: 1.45 }); col.normalMap = fl.clone(); col.normalMap.repeat.set(1, 1); col.normalScale.set(0.9, 0.9);
  [col.map, col.aoMap, col.roughnessMap].forEach(t => t && t.repeat.set(2, 3));
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffe9b0', emissiveIntensity: 1.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#211b16', roughness: 1 });
  const black = new THREE.MeshStandardMaterial({ color: '#121212', roughness: .9 });
  return {
    seat: pbr('kurkar', { tile: 3, tint: '#f1e6cf' }), seatOld: pbr('kurkar', { tile: 3, tint: '#cbb89a', normal: 1.4 }), seatNew: pbr('kurkar', { tile: 3, tint: '#f4ead8', normal: 0.8 }),
    stone: pbr('kurkar', { tile: 4, tint: '#e6d7bb' }), stoneWarm: pbr('kurkar', { tile: 3, tint: '#d8b98f' }), ruin: pbr('kurkar', { tile: 3, tint: '#c3ad8c', normal: 1.5 }),
    stoneLight: pbr('marble', { tile: 1.5, tint: '#e8e2d6' }),
    plaster: pbr('plaster', { tile: 3, tint: '#fff8ec', gain: 1.45 }), plasterShade: pbr('plaster', { tile: 3, tint: '#d8cdb8', gain: 1.3 }), plasterRed: pbr('plaster', { tile: 3, tint: '#b0563f', gain: 1.4 }), painted: paintedPlaster({ tile: 9 }),
    paving: pbr('paving', { tile: 3, tint: '#efe4d0' }), rubble: pbr('rubble', { tile: 3 }), woodOld: pbr('wood', { tile: 2.5, tint: '#c79d6c' }), woodDark: pbr('wood', { tile: 2.5, tint: '#6b6157' }),
    door: pbr('wood', { tile: 1.5, tint: '#8a5a2e' }), granite: pbr('marble', { tile: 1.2, tint: '#8f8b93', roughness: .55 }), marble: pbr('marble', { tile: 0.8, tint: '#f1ede5', roughness: .6 }),
    metal: pbr('metal', { tile: 1, tint: '#41454b', metalness: 0.7, metalMap: true }), lamp, dark, black, sectile: opusSectile(), column: col, capital: pbr('plaster', { tile: 0.8, tint: '#f6f1e7', gain: 1.45 }),
    pilate: pilateMat(), linen: new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.93 })
  };
}
function pilateMat() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 400; const g = c.getContext('2d');
  g.fillStyle = '#d9d2c3'; g.fillRect(0, 0, 512, 400);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(80,70,60,${Math.random() * .08})`; g.fillRect(Math.random() * 512, Math.random() * 400, 3, 3); }
  g.fillStyle = '#5c544a'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center';
  ['…S TIBERIÉVM', '…PONTIVS PILATVS', '…PRAEFECTVS IVDAE…', '…É…'].forEach((t, i) => g.fillText(t, 256 + (i % 2 ? -20 : 10), 95 + i * 80));
  g.fillStyle = '#c9c1b0'; g.beginPath(); g.moveTo(0, 0); g.lineTo(150, 0); g.lineTo(60, 120); g.lineTo(0, 200); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: .9 });
}
function ord(a, b) { return a < b ? [a, b] : [b, a]; }
function flip(g) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); } if (g.attributes.normal) g.deleteAttribute('normal'); return g; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
