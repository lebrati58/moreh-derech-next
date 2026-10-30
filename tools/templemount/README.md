# Mont du Temple — modèle OpenBible.info (MIT)

Source : https://github.com/openbibleinfo/3D-Temple-Mount (commit f5f35410), licence MIT, © 2026 OpenBible.info
(copie de la licence : `public/jerusalem3d/models/LICENSE-openbible-temple-mount.md`).
Reconstitution vers 30 apr. J.-C. d'après Middot, Josèphe et les fouilles (Warren, B. Mazar, Ben-Dov, Reich & Billig, Ritmeyer).

## Régénérer le GLB

```bash
git clone --depth 1 https://github.com/openbibleinfo/3D-Temple-Mount /tmp/ob
mkdir -p /tmp/conv && cd /tmp/conv && npm i three@0.169.0 @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer@0.21 sharp@0.33
CHROME=/chemin/chromium node tools/templemount/export-glb.mjs /tmp/ob /tmp/conv/node_modules /tmp/temple-mount-raw.glb
node tools/templemount/compress.mjs /tmp/temple-mount-raw.glb public/jerusalem3d/models/temple-mount-30ce.glb   # depuis /tmp/conv (modules)
```

- `export-glb.mjs` exécute le générateur d'origine dans Chromium et garde l'architecture seulement (relief analytique, personnages, mobilier intérieur, feux et calques de mesure retirés). La chaussée vers le mont des Oliviers et la piscine d'Israël sont exportées à part (`~hyp`) pour être rendues translucides.
- `compress.mjs` : textures WebP 1024 px, quantification, compression meshopt (≈ 6,6 Mo au lieu de 42 Mo).
- La correspondance structure → fiche et la classe A/B/C/D de chaque élément sont dans `public/jerusalem3d/models/temple-mount-30ce.json` (modifiable sans toucher au modèle).
- Recalage : dans `app.js` (`museumFit`), rotation + translation sans mise à l'échelle sur les 4 angles du contour OpenStreetMap ; écart mesuré ≤ 1,9 m.
