# Monde 3D jouable — Césarée Maritime, théâtre romain (premier niveau)

Page : `public/world3d.html?site=caesarea` · moteur : `public/world3d/` · données du site : `public/world3d/sites/caesarea.json`.
Branche `feature/caesarea-3d-world` — **pas déployé en production** (GitHub Pages ne publie que `main`).

## Ce qui fonctionne (testé)
- **Marche à la 1re personne** : joystick virtuel (pouce gauche) + glisser pour regarder sur téléphone ; WASD/flèches + souris (verrouillage du pointeur), Maj pour courir, sur ordinateur.
- **Collisions** (three-mesh-bvh, MIT) : murs avec glissement, marches ≤ 0,6 m (on monte les gradins par les escaliers), gravité, limites du terrain. Le couloir annulaire voûté sous la cavea et les vomitoires sont praticables.
- **Vol libre** (bouton 🦅) : orbite, zoom, observation sous tous les angles.
- **Deux époques dans le même repère** (centre de l'orchestra = origine, 1 unité = 1 m) : « aujourd'hui » et « vers 30 apr. J.-C. (temps de Ponce Pilate) ».
- **Comparaison** : curseur ruine ↔ reconstruction (caméra inchangée) et option « bâtiments antiques en transparence sur les ruines ».
- **Sélection** d'un élément (tap / clic / touche E) : surlignage, nom hébreu, terme latin, certitude (attesté / probable / hypothèse / moderne), explication, sources, question liée.
- **5 missions** : identification (3 parties du théâtre), chronologie (5 éléments), comparaison archéologique (3 disparus + 3 modernes), observation (3 erreurs volontaires : arc brisé, orchestra en marbre anachronique, tour d'éclairage), examen מורה דרך (5 questions ouvertes, auto-évaluation par points clés, **pas de note automatique**).
- **Progression** : `MDProgress.saveArch` (même système que « אדריכלות קלאסית »), points comptés dans « המסע שלי » ; indicateur x/5 dans le HUD.
- HUD discret : mini-carte orientée, nom du monument, époque, boutons époque / comparaison / mission / info / vol / retour, progression.
- Hébreu (RTL), français, anglais. Qualité auto / faible / moyenne / élevée (auto-baisse si < 28 i/s mesurées). Chargement avec étapes réelles. Pause automatique en arrière-plan et reprise ; position mémorisée.
- Ambiance : mer animée (shader), mouettes, son de vagues synthétisé (WebAudio, spatialisé vers la mer).

## Assets et licences
| Élément | Source | Licence |
|---|---|---|
| Textures PBR (grès/kurkar, roche, enduit, marbre, sable, pavés, gravier, bois, métal) | Poly Haven — liste exacte, auteurs et liens dans `public/world3d/textures/manifest.json` | CC0 |
| Ciel HDR d'éclairage | Poly Haven « Kloofendal 48d Partly Cloudy (Pure Sky) » (G. Zaal, J. Guest) | CC0 |
| Moteur 3D | three.js r169 (déjà dans le dépôt) + RGBELoader | MIT |
| Collisions | three-mesh-bvh 0.9.1 (`public/vendor/three-mesh-bvh/`) | MIT |
| Géométrie du théâtre | modélisée dans le code (`sites/caesarea-theatre.js`, `geo.js`) à partir des données publiées | — |

Les textures sont téléchargées par le workflow « Monde 3D — textures CC0 » (`tools/fetch-world3d-textures.mjs`) : le bac à sable de développement ne peut pas joindre polyhaven.com. Motifs peints de l'orchestra, cannelures (carte normale), inscription de Pilate : dessinés par le programme, signalés comme tels.

**Aucun modèle 3D existant du théâtre de Césarée n'est réutilisable** : le seul scan téléchargeable de Césarée (hippodrome, Sketchfab) est CC BY-NC-SA ; le relevé drone d'Arqueomodel3D et les scans de l'aqueduc, du port et des murailles n'ont pas de licence ouverte.

## Données et incertitudes (voir `caesarea.json`)
- Cavea Ø 90 m (Frova 1965, cité par Weiss 2014) — 100 m selon theatrum.de ; orchestra Ø 30 m ; ~4 000 places (6 000 selon d'autres).
- Époque reconstruite : **vers 30 apr. J.-C.** (théâtre hérodien tardif : orchestra en enduit peint, proscaenium à façade plane). Le marbre et l'opus sectile (IIe–IIIe s.) n'y figurent pas, sauf comme erreur volontaire.
- **Hypothèses** (non publiées en accès libre) : nombre de rangs (14 + 18), cunei et escaliers, vomitoires, dimensions du pulpitum, élévation et ordre du mur de scène (2 étages corinthiens), rythme des arcades extérieures, couleurs, position exacte de la muraille sud.
- « Aujourd'hui » : **modèle construit à partir de descriptions, pas un scan.**

## Ce qui manque encore
1. Plans chiffrés : Frova 1965 (*Scavi di Caesarea Maritima*, plan du théâtre), Segal 1995 p. 64–69, Sear 2006 p. 302–303 → dimensions du pulpitum, hauteur du mur de scène, nombre de rangs.
2. Photogrammétrie du théâtre actuel (scan au téléphone : usage privé autorisé ; permis רשות הטבע והגנים pour un usage commercial ; drone interdit sans autorisation) — ou licence du relevé d'Arqueomodel3D.
3. Modèles GLB détaillés produits dans Blender (chapiteaux sculptés, mur de scène) avec compression Meshopt et textures KTX2 : la chaîne de compression n'est pas encore en place (textures JPEG 1K actuellement).
4. Validation par l'enseignant des textes et des réponses de chronologie.
5. Mesures réelles sur Galaxy S24 / iPhone : **non effectuées** (voir ci-dessous).

## Résultats des tests
- `npm run test:world3d` : 7 tests (registre, données, sélection, 5 missions, progression, qualité, licences des textures).
- `CHROME=… npm run e2e:world3d` : parcours complet S24 (360×780, tactile) et ordinateur — chargement, joystick, regard, collision avec le front de scène, montée des gradins, sélection, question, époques, comparaison (caméra fixe), transparence, 5 missions, points, pause/reprise, 3 langues.
- **Images/s** : le navigateur de test n'a pas de GPU (rendu logiciel SwiftShader) : ~0,5 à 3 i/s, **sans rapport avec un téléphone réel**. Aucun chiffre de performance mobile n'est annoncé tant qu'il n'a pas été mesuré sur l'appareil (réglages → « קצב מדוד » affiche la mesure en direct).

## Ajouter un site
1. `public/world3d/sites/index.json` : passer le site en `playable`.
2. `public/world3d/sites/<id>.json` : périodes (`present`, `ancient`), éléments interactifs (étiquettes de maillage, sources, certitude), missions, questions — validés par `MDWorld.validate`.
3. Un constructeur `sites/<builder>.js` qui renvoie `{ eras, errors, colliders, tagMeshes, pickables, plan }` — ou, quand des GLB licenciés existent, un constructeur qui charge deux modèles alignés (voir le prototype de la PR #48, `public/archaeology/dual-era.js`).
