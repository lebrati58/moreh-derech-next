# Jérusalem 3D — Museum Edition : audit, sources, incertitudes, architecture et plan (28 octobre 2026)

Suite de `PROPOSITION_musee_jerusalem3d.md` (étapes A et B déjà faites : maquette OpenBible du mont du Temple, MIT, recalée à < 2 m sur OpenStreetMap) et de `AUDIT_jerusalem3d.md`.
Règle suivie : **fidélité scientifique d'abord**, puis qualité artistique, puis interactivité. Aucune forme n'est ajoutée sans source ; une hypothèse reste marquée comme telle (translucide, couleur « hypothèse », encadré « débat » dans la fiche).

## 1. Audit technique

| Élément | État | Remarque |
| --- | --- | --- |
| Moteur | three.js 0.169 (copié dans `vendor/`), modules ES, sans bundler | Ombres PCF, ciel physique, GTAO + SMAA en qualité HD, éclairage d'environnement tiré du ciel |
| Relief | SRTM 30 m réel (`geo.json`) | Relief **moderne** : vallée du Tyropéon comblée — signalé dans la fiche (débat), pas encore « dé-comblé » (voir §6) |
| Positions | Repères Wikidata + tracés OpenStreetMap ; aucune coordonnée saisie à la main | `tools/build-jerusalem3d.mjs` |
| Données | `monuments.json` : 66 fiches, 12 époques, 4 langues (hébreu d'abord), sources, certitude, dimensions, débats | 28 fiches pour l'an 30 |
| Mont du Temple 30 apr. J.-C. | GLB OpenBible (6,6 Mo, meshopt/WebP), 35 structures classées A/B/C/D | Recalage mesuré : 1,4–1,9 m aux angles |
| Autres bâtiments | Volumes générés en code d'après les dimensions des sources (`models.js`) | Lisibles et justes en plan, **pas photoréalistes** — limite principale |
| Matériaux | Pierre générée dans la page (assises, marges ciselées, relief des joints) — aucune image externe | Échelle réelle des blocs |
| Fonctions déjà présentes | Frise des époques colorée, fiches cliquables avec sources, couleurs de certitude, comparaison « avec aujourd'hui », ville actuelle en transparence, plan 2D, survol filmé et export vidéo | |
| **Ajouté le 28/10** | 🚶 visite au niveau des rues ; ⇄ comparaison de deux époques (caméra fixe) ; 🎓 mode apprentissage « איפה זה? » ; mesure de performance | `jerusalem3d/museum-tools.js` |

### Mesures (rendu **logiciel** SwiftShader, téléphone simulé 390×844, qualité SD)
Mesurées par `tests/jerusalem3d-museum-browser.mjs`. Elles ne remplacent **pas** une mesure sur un vrai téléphone ou un vrai GPU.

| Mesure | Valeur |
| --- | --- |
| Première image (chargement complet, rendu logiciel) | ≈ 9,5–10,8 s |
| Appels de dessin par image | 685 |
| Triangles par image | ≈ 346 000 |
| Programmes de shaders | 23 |
| Monuments posés (an 30) | 28 |

Lecture : le nombre d'**appels de dessin (685)** est le premier point à réduire avant d'ajouter des bâtiments détaillés (fusion des géométries par matériau, instanciation). Les triangles (≈ 346 000, dont la maquette du Temple) sont à la limite du budget visé pour un téléphone.

## 1 bis. Prototype ajouté (scène pilote vers 30 apr. J.-C.)

- 🚶 **Visite au niveau des rues** (menu ☰) : départ à la piscine de Siloé, regard vers le mont du Temple ; hauteur des yeux 1,65 m ; on suit le sol réel (dallages, marches ≤ 0,9 m) ; on ne traverse pas les murs ; boutons ▲ ▼ ⟲ ⟳ et ×4, glisser pour regarder, flèches/WASD au clavier, Échap pour sortir.
- ⇄ **Comparer deux époques** : on choisit l'époque B, puis on bascule A ⇄ B **sans que la caméra bouge** (ex. l'an 30 et aujourd'hui depuis le même point).
- 🎓 **Mode apprentissage « איפה זה? »** : 5 monuments de l'époque à retrouver dans la scène, étiquettes masquées ; réponse juste ou « voici le bon endroit » ; score. Le quiz 3D par questions (`quiz3dEnabled`) reste **éteint**, comme décidé auparavant.
- Fiches complétées (4 langues) : datation débattue de la rue à degrés (Pilate vers 31 / Agrippa II / Hérode), hypothèse de Benoit pour l'Antonia (une seule tour), restes épars du palais d'Hérode et identification du prétoire.
- Tests : `tests/jerusalem3d-museum-browser.mjs` (marche, comparaison, apprentissage, aucune erreur JS).

## 2. Inventaire scientifique et bibliographie

Sources primaires : Flavius Josèphe, *Guerre des Juifs* 5.136–247 (murailles, tours, Antonia, Temple) et *Antiquités* 15.380–425 ; Mishna, traité *Middot* ; documents du cours (Drive, סיורים 12 et suivants) — référence pédagogique prioritaire.

| Ressource | Ce qu'elle apporte | Accès / licence | Utilisée |
| --- | --- | --- | --- |
| [Jerusalem 4D — Univ. de Bonn (BCDH)](https://www.bcdh.uni-bonn.de/en/research/jerusalem4d) | Numérisation des plans de fouilles historiques, développement urbain par époque (plan de K. Bieberstein 1994) | **Aucune licence de réutilisation trouvée** ; plans sous droits (© Bieberstein) ; dépôt 3D BCDH sur bonndata/Sketchfab avec licences au cas par cas | Non — à demander au BCDH |
| [IAA — publications (ʿAtiqot, HA-ESI)](https://publications.iaa.org.il/) | Rapports de fouilles (rue à degrés, Kishlé, monnaies) | Lecture libre ; plans protégés | Comme référence de texte |
| [Jerusalem Journal of Archaeology (JJAR)](https://jjar.huji.ac.il/) | Articles récents (cultes, urbanisme) | Accès libre en ligne | Comme référence |
| [NLI — Jerusalem History Project](https://www.nli.org.il/en/at-your-service/who-we-are/projects/jerusalem-history-project) | Cartes et documents historiques | Licences par document | À explorer |
| [OpenBible.info — 3D Temple Mount](https://github.com/openbibleinfo/3D-Temple-Mount) | Maquette du mont du Temple vers 30 apr. J.-C. (Middot, Josèphe, Warren, B. Mazar, Ben-Dov, Reich & Billig, Ritmeyer) | **MIT** | Oui (GLB) |
| Szanton, Hagbi, Uziel, Ariel 2019, [*Tel Aviv* 46/2](https://www.tandfonline.com/doi/full/10.1080/03344355.2019.1650491) | Rue à degrés de Siloé au mont du Temple, datée par les monnaies vers 31 apr. J.-C. | Article | Oui (fiche + débat) |
| Re'em, fouilles de la Kishlé ([résumé](https://www.biblicalarchaeology.org/daily/news/herods-jerusalem-palace-trial-of-jesus/)) | Palais d'Hérode : restes épars du podium | Article / ouvrage *Ancient Jerusalem Revealed* | Oui (débat) |
| Netzer, Murphy-O'Connor, Ritmeyer, Benoit ([BAR](https://library.biblicalarchaeology.org/sidebar/the-antonias-better-halved/)) | Antonia : taille, nombre de tours | Articles | Oui (débat) |
| Débat de la 2e muraille ([BAS](https://library.biblicalarchaeology.org/?p=105282), [projet géophysique DAI](https://doi.org/10.34780/d18w-w8ym)) | Tracé non prouvé ; Golgotha probablement hors les murs | Articles | Oui (hypothèse) |
| Reich, Gadot, Uziel, Shukron — fouilles de la Cité de David | Topographie de la ville basse, piscine de Siloé, canal de drainage | Rapports IAA | Partiellement (via les fiches) |
| Maquette Holyland (Musée d'Israël, Avi-Yonah) | Référence visuelle du cours | **Protégée** | Jamais copiée |

## 3. Licences des données et modèles utilisés

| Élément | Licence | Obligation |
| --- | --- | --- |
| three.js | MIT | mention dans `vendor/` |
| Maquette OpenBible | MIT | mention dans la page et `models/LICENSE-openbible-temple-mount.md` ✔ |
| OpenStreetMap (contours, ville actuelle) | ODbL | « © contributeurs OpenStreetMap » dans la légende ✔ |
| Wikidata (repères) | CC0 | — |
| SRTM (relief) | domaine public | — |
| Textures de pierre | générées dans la page | — |
| Google Photorealistic 3D Tiles | conditions Google : **pas de mise en cache hors ligne** | **non utilisé** (incompatible avec le mode hors ligne de l'app) |

## 4. Tableau des incertitudes — scène pilote vers 30 apr. J.-C.
Généré à partir de `monuments.json` (la page et ce tableau disent la même chose). ✅ attesté par des vestiges · 🟧 reconstitution d'après les sources · 🟥 hypothèse (rendue translucide).

| Élément | Certitude | Débat documenté dans la fiche | Sources |
| --- | --- | --- | --- |
| La source du Gihon | ✅ attesté | — | 2 |
| La vallée du Tyropéon (« des fromagers ») | ✅ attesté | La vallée est aujourd’hui comblée de décombres sur une grande profondeur : au sud du Mur occidental, le relief actuel ne la montre presque plus. | 2 |
| La vallée de Ben Hinnom (Géhenne) | ✅ attesté | — | 3 |
| La vallée du Cédron (Kidron) | ✅ attesté | — | 3 |
| Passage souterrain et puits de Warren | ✅ attesté | — | 1 |
| La « muraille large » | ✅ attesté | — | 1 |
| Tunnel de Siloé (d'Ézéchias) | ✅ attesté | — | 2 |
| Le mont du Temple hérodien | ✅ attesté | — | 3 |
| Le Second Temple | 🟧 reconstitution | Son emplacement exact sur l'esplanade est débattu. Le volume est simplifié : un cube de 100 coudées, sans détails. | 4 |
| Le Portique royal | 🟧 reconstitution | — | 4 |
| Les portes de Houlda | ✅ attesté | — | 3 |
| Les escaliers du sud | ✅ attesté | — | 2 |
| L'arche de Robinson | ✅ attesté | — | 4 |
| Arc de Wilson | ✅ attesté | Datation : les analyses au carbone de l’Institut Weizmann (2020) montrent deux phases du Second Temple ; d’autres chercheurs l’avaient datée de l’époque omeyyade. | 3 |
| Portiques doubles de l’esplanade | 🟧 reconstitution | — | 2 |
| La forteresse Antonia | 🟧 reconstitution | Forme et taille débattues (Netzer contre Murphy-O'Connor). Le dallage des Sœurs de Sion date d'Hadrien et n'appartient pas à l'Antonia. Pierre Benoit a proposé une forteresse réduite à une seule tour, à l’angle sud-est, faute de toute preuve archéologique de quatre tours ; les quatre tours de la reconstitution viennent de la description de Josèphe. | 3 |
| Tour de Phasaël (ou Hippicus) | ✅ attesté | Identification débattue : Phasaël (Warren, Conder, Schick) ou Hippicus (Robinson, Geva 1981). La hauteur affichée est celle de Phasaël. | 3 |
| Tour d'Hippicus | 🟧 reconstitution | — | 2 |
| Tour de Mariamne | 🟧 reconstitution | — | 2 |
| Le palais d'Hérode | 🟧 reconstitution | Du podium ne subsistent que des restes épars (fouilles de la Kishlé, Amit Re’em). L’extension du palais, jusqu’au quartier arménien, est une reconstitution. Son identification avec le prétoire du procès de Jésus est admise par beaucoup (p. ex. Jodi Magness), sans être certaine. | 3 |
| La Maison brûlée | ✅ attesté | — | 1 |
| Le quartier hérodien | ✅ attesté | — | 1 |
| Le bassin de Siloé | ✅ attesté | — | 4 |
| La rue des pèlerins (rue à degrés) | ✅ attesté | La « rue des pèlerins » est un réseau de rues, pas une rue unique. Les fouilles de 2023–2024 ont montré que la rue quitte le canal de drainage et monte en diagonale vers les portes sud du mont du Temple. La datation est aussi discutée : la rue a été attribuée à Hérode, à l’époque hérodienne ou à Agrippa II (Eilat Mazar) ; l’étude des monnaies de 2019 (Szanton, Hagbi, Uziel, Ariel) propose vers 31 apr. J.-C., sous Ponce Pilate. | 4 |
| La première muraille (hasmonéenne) | 🟧 reconstitution | — | 9 |
| La deuxième muraille | 🟥 hypothèse | L'emplacement de la porte Gennath et tout le tracé sont débattus. La ligne passe à l'est du Saint-Sépulcre, par le Muristan et le complexe Alexandre (où certains voient des vestiges), vers la porte de Damas et l'Antonia. Selon les minimalistes, elle n'entourait pas l'Antonia. | 2 |
| Troisième muraille — ligne nord (maximaliste) | 🟥 hypothèse | Maximalistes (comme la maquette) : cette ligne nord. Minimalistes : la troisième muraille suivait à peu près la muraille ottomane (ligne suivante). Les vestiges du nord ont aussi été attribués à la révolte de Bar Kokhba, à Aelia Capitolina ou à un mur de siège romain. | 4 |
| Troisième muraille — selon les minimalistes | 🟥 hypothèse | — | 2 |

## 5. Architecture logicielle — décision

- **On garde three.js, un seul moteur.** CesiumJS apporterait le globe et les 3D Tiles, mais : (1) l'app n'a besoin que de 3 km² ; (2) Cesium ajoute ~3 Mo de JS et un second moteur à maintenir ; (3) les tuiles photoréalistes Google sont interdites de cache hors ligne et montrent la ville **moderne** ; (4) le terrain Cesium World Terrain demande un jeton ion. Rien ne justifie un deuxième moteur aujourd'hui. Si un jour il faut des 3D Tiles, `3d-tiles-renderer` (NASA-AMMOS, Apache-2.0) se branche sur three.js.
- **Chaîne de production des bâtiments** : Blender (modélisation d'après plans et dimensions publiés) → export glTF → `gltf-transform` (meshopt, textures KTX2/WebP, `simplify` pour les niveaux de détail) → un GLB **par monument** dans `public/jerusalem3d/models/`, avec un fichier JSON compagnon (source, licence, classe A/B/C/D par partie) comme pour le mont du Temple.
- **Chargement progressif** : volumes actuels (légers, immédiats) puis remplacement par le GLB détaillé quand il est prêt ou quand la caméra s'approche (même mécanisme que la maquette du Temple aujourd'hui). Niveaux de détail : `THREE.LOD` par monument ; colonnes et décors instanciés (`InstancedMesh`).
- **Téléphone** : qualité SD par défaut (pas de GTAO, ombres 2048, ratio de pixels ≤ 1,5) ; GLB ≤ 2 Mo par monument visé ; budget ≈ 300 000 triangles visibles.
- **Données** : la fiche (`monuments.json`) reste la source de vérité ; un modèle 3D est remplaçable sans toucher aux textes.

## 6. Ce qui reste à faire, par ordre (plan d'intégration)

1. **Mesurer sur de vrais appareils** (Lionel : un Android moyen, un ordinateur) : première image, fluidité en visite des rues. *Non fait ici : pas d'appareil réel.*
2. **Relief antique** : ajouter une correction du relief pour le Tyropéon comblé (profondeurs publiées des fouilles du Mur occidental et de la rue à degrés), marquée « reconstitution ».
3. **Palais d'Hérode et trois tours** (Phasaël, Hippicus, Mariamne) en GLB détaillé — dimensions de Josèphe, vestiges de la Citadelle et de la Kishlé ; classe B/C.
4. **Rue à degrés et piscine de Siloé** en GLB — vestiges fouillés (classe A), pour la visite des rues.
5. **Ville haute / ville basse** : quartiers d'habitation **uniquement là où des fouilles existent** (Quartier hérodien, Maison brûlée, Givati) ; ailleurs, laisser le terrain nu plutôt qu'inventer des maisons répétées.
6. Antonia, Portique royal détaillé, 2e et 3e murailles (hypothèses translucides).
7. Étendre la méthode aux autres époques (Aelia Capitolina ensuite : cardos attestés).
8. Contact BCDH Bonn (Jerusalem 4D) pour un éventuel accès aux plans numérisés.

**Limite honnête** : le photoréalisme de qualité musée demande un vrai travail de modélisation dans Blender, bâtiment par bâtiment, d'après les plans publiés. Blender n'est pas disponible dans cet environnement et ce travail n'a pas été fait ici ; les bâtiments autres que le mont du Temple restent des volumes justes en dimensions mais simplifiés.
