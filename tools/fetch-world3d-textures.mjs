// Monde 3D — télécharge des textures PBR et un ciel HDR **CC0** depuis Poly Haven (https://polyhaven.com, licence CC0 1.0).
// Exécuté par le workflow « Monde 3D — textures CC0 » (le bac à sable de développement ne peut pas joindre polyhaven.com).
// Résultat : public/world3d/textures/<emplacement>/{diff,nor,arm}.jpg + public/world3d/textures/manifest.json (provenance, auteurs, licence).
// Le moteur utilise une texture procédurale de secours (signalée « procédurale » dans les crédits) si un emplacement manque.
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/world3d/textures/', import.meta.url).pathname;
const API = 'https://api.polyhaven.com';
const RES = process.env.RES || '1k';
// Emplacements → mots-clés par ordre de préférence (recherche dans id, nom, étiquettes, catégories).
const SLOTS = {
  kurkar: ['sandstone_blocks', 'sandstone', 'limestone', 'rock_wall', 'stone_wall'],
  plaster: ['plaster', 'stucco', 'white_plaster'],
  marble: ['marble'],
  sand: ['coast_sand', 'sand'],
  paving: ['paving', 'flagstone', 'stone_tiles', 'cobblestone'],
  rubble: ['rocky', 'rock_ground', 'gravel', 'dry_ground'],
  wood: ['wood_planks', 'wood_floor', 'planks'],
  metal: ['metal_plate', 'painted_metal', 'metal'],
  rooftile: ['roof_tiles', 'roof']
};
const j = async u => { const r = await fetch(u, { headers: { 'user-agent': 'moreh-derech-next world3d (CC0 fetch)' } }); if (!r.ok) throw new Error(u + ' → ' + r.status); return r.json(); };
const bin = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' → ' + r.status); return Buffer.from(await r.arrayBuffer()); };
const hay = (id, a) => [id, a.name, ...(a.tags || []), ...(a.categories || [])].join(' ').toLowerCase();

const manifest = { generatedAt: new Date().toISOString(), source: 'Poly Haven — https://polyhaven.com', license: 'CC0 1.0 (domaine public) — https://polyhaven.com/license', resolution: RES, slots: {}, hdri: null };
const textures = await j(API + '/assets?t=textures');
const used = new Set();
for (const [slot, keys] of Object.entries(SLOTS)) {
  let pick = null;
  for (const k of keys) {
    const cands = Object.entries(textures).filter(([id, a]) => !used.has(id) && (id.includes(k) || hay(id, a).includes(k.replace(/_/g, ' '))));
    cands.sort((x, y) => (y[1].download_count || 0) - (x[1].download_count || 0));
    if (cands.length) { pick = cands[0]; break; }
  }
  if (!pick) { console.log('MANQUE', slot); continue; }
  const [id, a] = pick; used.add(id);
  const f = await j(API + '/files/' + id);
  const get = (...names) => { for (const n of names) { const e = f[n] && f[n][RES] && f[n][RES].jpg; if (e) return e.url; } return null; };
  const urls = { diff: get('Diffuse', 'diff'), nor: get('nor_gl', 'Normal'), arm: get('arm', 'ARM') };
  await mkdir(OUT + slot, { recursive: true });
  const files = {};
  for (const [k, u] of Object.entries(urls)) { if (!u) continue; await writeFile(`${OUT}${slot}/${k}.jpg`, await bin(u)); files[k] = `${k}.jpg`; }
  manifest.slots[slot] = { id, name: a.name, page: 'https://polyhaven.com/a/' + id, authors: Object.keys(a.authors || {}), files };
  console.log('OK', slot, id, Object.keys(files).join(','));
}
// Ciel HDR (éclairage d'ambiance) : un ciel dégagé, en extérieur.
const hdris = await j(API + '/assets?t=hdris');
const sky = Object.entries(hdris).filter(([id, a]) => /puresky|clear|sunny/.test(hay(id, a)) && (a.categories || []).includes('skies'))
  .sort((x, y) => (y[1].download_count || 0) - (x[1].download_count || 0))[0];
if (sky) {
  const f = await j(API + '/files/' + sky[0]); const e = f.hdri && f.hdri['1k'] && f.hdri['1k'].hdr;
  if (e) { await writeFile(OUT + 'sky.hdr', await bin(e.url)); manifest.hdri = { id: sky[0], name: sky[1].name, page: 'https://polyhaven.com/a/' + sky[0], authors: Object.keys(sky[1].authors || {}), file: 'sky.hdr' }; console.log('OK hdri', sky[0]); }
}
await writeFile(OUT + 'manifest.json', JSON.stringify(manifest, null, 1));
console.log('manifest écrit :', Object.keys(manifest.slots).length, 'textures');
