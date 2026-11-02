# Césarée — double époque 3D (prototype technique)

Ce module est une **brique logicielle**, pas une reconstitution archéologique livrée.

## État
- Contrôleur `public/archaeology/dual-era.js` pour deux GLB alignés, modes présent / antique / superposition.
- Aucun modèle GLB inclus : les sources, les licences et l'alignement géographique doivent être vérifiés avant publication.
- Aucun changement à `public/architecture.html` : les 14 maquettes et les quiz restent intacts.

## Étapes suivantes
1. Identifier un relevé 3D des vestiges du théâtre de Césarée, autorisé à la réutilisation.
2. Constituer un dossier de sources pour la restitution historique, avec éléments attestés / probables / hypothétiques.
3. Produire ou acquérir deux GLB à la même échelle et au même repère.
4. Ajouter une page pilote dédiée, ses contrôles tactiles et les points pédagogiques.
5. Vérifier l'accessibilité, les licences, les performances sur mobile et la fidélité historique.

## API
```js
import { DualEraSite, ERA_MODES } from './archaeology/dual-era.js';
const site = new DualEraSite({scene});
await site.load({
  present: {url: 'models/caesarea-present.glb', sources: ['SOURCE À VÉRIFIER']},
  ancient: {url: 'models/caesarea-ancient.glb', sources: ['SOURCE À VÉRIFIER']}
});
site.setMode(ERA_MODES.COMPARE, 0.5);
```
Les chemins ci-dessus sont des exemples, pas des fichiers existants.
