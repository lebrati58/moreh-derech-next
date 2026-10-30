# Jerusalem 3D — Museum Edition : audit, inventaire des modèles, proposition de prototype (étape A)

Date : 25 octobre 2026. Rien n'a été modifié dans le site pour cette étape.

## 1. Accès réels utilisés

- ✅ Dépôt `lebrati58/moreh-derech-next` (lecture/écriture), déploiement GitHub Pages.
- ✅ Dépôt public `openbibleinfo/3D-Temple-Mount` : cloné et exécuté localement (générateur + `util/verify.js`).
- ✅ Drive du cours (lecture) ; recherche web.
- ❌ Sketchfab : pages non lisibles depuis l'environnement (liste d'accès) ; seule la recherche web a été possible.
- ❌ Blender : non installé ici. Pas d'appareil Android réel ni de vrai GPU (rendu logiciel seulement).

## 2. État du projet actuel (résumé — détail dans `AUDIT_jerusalem3d.md`)

- Page statique GitHub Pages, **three.js 0.169** (copié dans `vendor/`), modules ES sans bundler, pas de React.
- Données séparées du rendu : `monuments.json` (61 fiches, identifiants stables `jerusalem_*`, 4 langues, sources, certitude) ; `geo.json` (repères Wikidata, contours OpenStreetMap, relief SRTM 30 m).
- Modèles : **générés en code** (`models.js`) à partir des dimensions des sources — volumes simplifiés, pas de GLB.
- Réutilisable tel quel : relief réel, repères, frise des 12 périodes, fiches, plan 2D, mode cinéma/vidéo, comparaison avec aujourd'hui, tests (7 unitaires, 27 navigateur).
- Quiz 3D : architecture prévue (`pickOnce`, `quiz3dEnabled`) mais **éteinte** sur décision de Lionel.
- Limite principale pour un rendu « musée » : les bâtiments sont des volumes simplifiés.

## 3. Inventaire des modèles 3D candidats

| Modèle | Auteur | Licence | Format | Époque | Détail | Précision / sources | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Herod's Temple Mount** — github.com/openbibleinfo/3D-Temple-Mount | OpenBible.info (code généré par IA, sources documentées) | **MIT** (réutilisation, modification, redistribution libres avec mention) | Générateur JavaScript (sans bibliothèque) → tampon de sommets ; export Blender/GLB prévu (`util/export-sketchfab.py`, nécessite Blender) ; version Sketchfab annoncée | **vers 30 apr. J.-C.** | ≈ 302 000 triangles, 35 structures sélectionnables, textures procédurales, occlusion précalculée | Middot 1:1–5:4, Josèphe (Guerre 5.184–247, Ant. 15.380–425), fouilles Warren, B. Mazar, Ben-Dov, Reich & Billig, Ritmeyer ; ~30 contrôles géométriques **exécutés ici : tous passent** ; variantes signalées (autel, portes, largeur du sanctuaire) ; maisons volontairement absentes | **Retenu pour le prototype** |
| « Herod's Temple — new pristine version » (CGTrader) | chrisant (C. Antoniou) | Royalty Free, **payant (69 $)** | BLEND, FBX, OBJ… (≈ 1,5 M polygones) | Temple après achèvement | Très détaillé | **Aucune source citée** | Écarté (sources absentes, coût, poids) |
| Versions gratuites free3d.com du même auteur | idem | usage à vérifier (souvent personnel) | divers | — | — | aucune source | Écarté |
| Rocher sous le Saint-Sépulcre (Univ. Wuppertal, H. Siegel) | DEI Jérusalem | CC BY-NC-SA 4.0, **images tierces exclues** | C4D, GLB | souterrain, plans de Schick | — | sérieux mais autre sujet | Hors sujet pour l'an 66 |
| Maquette Holyland / Musée d'Israël (Avi-Yonah) | Musée d'Israël | **protégée** | objet physique | 66 apr. J.-C. | — | référence pédagogique du cours | Référence visuelle seulement, aucune copie |
| Antonia, palais d'Hérode, trois tours, ville haute/basse | — | — | — | — | — | **Aucun modèle libre et sourcé trouvé** | À construire nous-mêmes, d'après Josèphe et les fouilles, étiquetés « reconstitution / hypothèse » |

## 4. Mesure clé : le modèle OpenBible tombe juste sur la carte réelle

Leur plateforme (murs O 485 m, N 315 m, E 460 m, S 280 m — les mêmes chiffres que le document du cours « מנהרת הכותל ») a été superposée au contour OpenStreetMap réel de l'esplanade par une simple rotation (−10,3°) et une translation, **sans mise à l'échelle** :

| Angle | NO | NE | SE | SO |
| --- | --- | --- | --- | --- |
| Écart avec OSM | 1,4 m | 1,7 m | 1,9 m | 1,6 m |

Côtés OSM mesurés : 482 / 313 / 463 / 281 m.

## 5. Limites connues du modèle OpenBible pour notre usage

- Il représente **l'an 30**, pas l'an 66 : différences mineures sur le mont du Temple (fin des travaux vers 63 selon Josèphe, Ant. 20.219) ; la 3e muraille (41–44) est hors de l'esplanade. À signaler dans la fiche.
- Son relief est **analytique** (calculé), pas notre relief SRTM : au pied des murs, rues et vallées peuvent flotter ou s'enfoncer de quelques mètres. Solution prévue : garder leur relief local autour de l'esplanade avec raccord progressif vers le SRTM, ou recaler la rue sur notre sol.
- Textes des panneaux en **anglais** et orientés Nouveau Testament : nous ne reprenons que la géométrie ; les fiches restent les nôtres (hébreu d'abord, 4 langues, Drive).
- Poids : ~14,7 Mo de sommets bruts → à compresser (meshopt/Draco) et alléger pour Android (LOD : colonnes simplifiées au loin, comme le prévoit déjà leur code).
- Certaines formes sont des choix de reconstitution (Antonia, accès au toit, Shushan, piscine d'Israël « contestée ») : chaque élément doit garder sa classification A/B/C/D.

## 6. Proposition — étape B : prototype du Temple avec un vrai modèle

Sur une **branche dédiée `museum-edition`**, page d'essai séparée ; **la page publiée actuelle reste intacte** (retour arrière immédiat).

1. **Conversion** : script qui exécute leur générateur dans Chromium (textures sur canvas), exporte un **GLB** (`public/jerusalem3d/models/temple-mount-30ce.glb`) sans relief ni personnages, avec l'identifiant de chacune des 35 structures, puis le compresse (gltf-transform, meshopt). Mention MIT et lien source dans le fichier et dans la page.
2. **Placement** : transformation mesurée ci-dessus (rotation −10,3°, erreur < 2 m), esplanade au niveau réel.
3. **Liaison données** : table de correspondance `structure OpenBible → id jerusalem_*` (Temple, cours, Portique royal, portiques, arcs de Robinson et Wilson, portes de Houlda, escaliers du sud, Antonia, piscines). Les fiches restent dans `monuments.json` ; le modèle est remplaçable sans toucher aux fiches.
4. **Classification A/B/C/D par élément** (ex. murs de soutènement A, Portique royal B, plan des cours d'après Middot B/C, emplacement du sanctuaire C, accès Antonia D).
5. **Vues prédéfinies** : vue générale, Temple depuis l'est, mont du Temple depuis le sud, Antonia.
6. **Qualité adaptative** : SD sur téléphone, HD sur ordinateur, colonnes simplifiées au loin.
7. **Tests** exécutés et rapportés : alignement (angles < 2 m), absence d'erreurs, captures 1920×1080 et téléphone 390×844 ; mesure de fluidité **à faire par Lionel** sur ordinateur et sur Android.

Étapes suivantes (après validation de B) : C fiches A/B/C/D détaillées en hébreu ; D trois tours, palais, ville haute/basse, murailles de l'an 66 (modèles à créer nous-mêmes, sourcés) ; E quiz (**seulement si Lionel l'autorise**) ; F optimisation.

## 7. Décisions demandées à Lionel

1. Valider l'utilisation du modèle OpenBible (MIT, mention obligatoire) comme base du mont du Temple.
2. Valider l'étape B sur branche séparée avec page d'essai (non publiée en production).
