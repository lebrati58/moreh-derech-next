// Temps de trajet en voiture entre tous les lieux d'un module « אתגר המבחן » (sites + points de départ).
// Source : OSRM (router.project-osrm.org, réseau routier OpenStreetMap, sans trafic) — même notion que
// « sans circulation » dans Google Maps. Google Maps n'a pas d'API gratuite : l'appli garde le lien Google
// pour vérifier, et l'élève peut remplacer la valeur par celle de Google.
// Usage : node tools/exam-drive-times.mjs public/exam/golan-south.json   (réseau requis → GitHub Actions)
import { readFile, writeFile } from 'node:fs/promises';
const file = process.argv[2] || 'public/exam/golan-south.json';
const data = JSON.parse(await readFile(file, 'utf8'));
const pts = (data.anchors || []).concat(data.sites || []).filter(p => p.lat && p.lon);
const coords = pts.map(p => `${p.lon},${p.lat}`).join(';');
const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`, { headers: { 'User-Agent': 'MorehDerechNext/1.0 (github.com/lebrati58/moreh-derech-next)' } });
const j = await r.json();
if (j.code !== 'Ok') { console.error('OSRM', j.code, j.message); process.exit(1); }
const legs = {};
pts.forEach((a, i) => pts.forEach((b, k) => { if (i !== k) legs[`${a.id}>${b.id}`] = { min: Math.round(j.durations[i][k] / 60), km: Math.round(j.distances[i][k] / 100) / 10 }; }));
const out = { source: 'OSRM (router.project-osrm.org), © OpenStreetMap — voiture, sans trafic', fetchedAt: new Date().toISOString().slice(0, 10), legs };
const dest = file.replace(/\.json$/, '.drive.json');
await writeFile(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`🚗 ${dest} : ${Object.keys(legs).length} trajets`);
for (const [k, v] of Object.entries(legs)) console.log(`${k} ${v.min} min ${v.km} km`);
