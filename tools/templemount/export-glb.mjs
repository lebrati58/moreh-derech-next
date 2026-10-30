// Convertit le modèle « Herod's Temple Mount » d'OpenBible.info (licence MIT,
// https://github.com/openbibleinfo/3D-Temple-Mount) en GLB pour three.js.
// Le générateur d'origine est exécuté tel quel dans Chromium (textures sur canvas),
// puis exporté par GLTFExporter. Relief analytique, personnages, mobilier intérieur,
// feux et calques de mesure sont retirés : nous gardons uniquement l'architecture.
// Usage : node tools/templemount/export-glb.mjs <dossier-source-openbible> <dossier node_modules three> <sortie.glb>
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const [SRC, NM, OUT] = process.argv.slice(2);
const files = ['10-math.js', '20-textures.js', '30-geom.js', '40-data.js', '50-build-mount.js', '55-build-temple.js'];
let code = (await Promise.all(files.map(f => readFile(join(SRC, 'src', f), 'utf8')))).join('\n');
const gl = await readFile(join(SRC, 'src', '60-gl.js'), 'utf8');
const a = gl.indexOf('const MATERIALS'), b = gl.indexOf('\n}', gl.indexOf('function solid(')) + 2;
code += '\n' + gl.slice(a, b) + '\nwindow.__OB = { buildScene, MATERIALS, TexLib, PLAT, Builder };';
const page = `<!doctype html><meta charset=utf-8><script>${code}</script>
<script type="importmap">{"imports":{"three":"/nm/three/build/three.module.js","three/addons/":"/nm/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const { buildScene, MATERIALS, TexLib, PLAT, Builder } = window.__OB;
// Hypothèses illustratives (classe D/C) exportées à part pour être rendues translucides : chaussée vers le mont des Oliviers
// (Mishna Para 3:6 seulement) et piscine d'Israël (datation contestée).
const HYP = new Set(['causeway', 'poolIsrael']);
const g0 = Builder.prototype.g; Builder.prototype.g = function (mat, layer) { const hyp = this.openPart && HYP.has(this.openPart.id); return g0.call(this, mat, (layer || 'base') + (hyp ? '~hyp' : '')); };
const sc = buildScene(null), V = sc.vertices, I = sc.indices;
const SKIP_LAYER = new Set(['people', 'interior', 'overlay', 'grid', 'nodraw']);
const SKIP_MAT = new Set(['terrain', 'fire', 'marker', 'ground']);
const byMat = new Map();
for (const d of sc.draws) { const [layer, hyp] = d.layer.split('~'); if (SKIP_LAYER.has(layer) || SKIP_MAT.has(d.mat)) continue; const k = d.mat + (hyp ? '~hyp' : ''); (byMat.get(k) || byMat.set(k, []).get(k)).push(d); }
const root = new THREE.Group(); root.name = 'HerodsTempleMount_OpenBible_MIT';
const texCache = {};
for (const [key, draws] of byMat) { const mat = key.split('~')[0];
  const pos = [], nrm = [], uv = [], col = [], idx = []; let nv = 0;
  for (const d of draws) {
    const map = new Map();
    for (let k = d.start; k < d.start + d.count; k++) { const vi = I[k]; let n = map.get(vi);
      if (n === undefined) { n = nv++; map.set(vi, n); const o = vi * 9; pos.push(V[o], V[o + 1], V[o + 2]); nrm.push(V[o + 3], V[o + 4], V[o + 5]); uv.push(V[o + 6], V[o + 7]); const ao = V[o + 8]; col.push(ao, ao, ao); }
      idx.push(n); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const M = MATERIALS[mat] || {}, cvs = M.tex ? M.tex() : null;
  const m = new THREE.MeshStandardMaterial({ name: mat, vertexColors: true, color: new THREE.Color(...(M.tint || [1, 1, 1])) });
  if (cvs) { const t = new THREE.CanvasTexture(cvs); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.name = mat; m.map = t;
    if (M.bump) { const nt = new THREE.CanvasTexture(TexLib.normalMap(cvs, 1.5)); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.name = mat + '_normal'; m.normalMap = nt; m.normalScale.set(M.bump, M.bump); } }
  const metal = M.metal || 0; m.metalness = metal > 0.5 ? 1 : 0; m.roughness = metal > 0.5 ? 0.3 : Math.max(0.35, 1 - (M.spec || 0.05) * 2.5);
  if (mat === 'water') { m.metalness = 0; m.roughness = 0.08; }
  if (M.alpha) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
  m.name = key; const mesh = new THREE.Mesh(g, m); mesh.name = key; root.add(mesh);
}
const scene = new THREE.Scene(); scene.add(root);
const parts = sc.parts.map(p => ({ id: p.id, key: p.key, name: p.name, center: p.center, size: p.size }));
const glb = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 1024 });
const bytes = new Uint8Array(glb); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
window.__RESULT = { glb: btoa(s), parts, plat: PLAT, stats: sc.stats, mats: [...byMat.keys()] };
</script>`;
const T = { '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page); }
  if (u.startsWith('/nm/')) { try { const body = await readFile(join(NM, u.slice(4))); res.writeHead(200, { 'content-type': T[extname(u)] || 'application/octet-stream' }); return res.end(body); } catch { } }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/tmp/chromium', args: ['--no-sandbox', '--no-zygote', '--single-process'] });
const p = await browser.newPage(); p.on('pageerror', e => console.error('PAGEERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
await p.goto(`http://127.0.0.1:${server.address().port}/`);
await p.waitForFunction(() => window.__RESULT, null, { timeout: 600000 });
const r = await p.evaluate(() => window.__RESULT);
await writeFile(OUT, Buffer.from(r.glb, 'base64'));
await writeFile(OUT.replace(/\.glb$/, '.parts.json'), JSON.stringify({ source: 'https://github.com/openbibleinfo/3D-Temple-Mount', license: 'MIT, © 2026 OpenBible.info', plat: r.plat, stats: r.stats, materials: r.mats, parts: r.parts }, null, 1));
console.log('GLB', (Buffer.from(r.glb, 'base64').length / 1048576).toFixed(1), 'Mo ·', r.mats.length, 'matériaux ·', r.parts.length, 'structures');
await browser.close(); server.close();
