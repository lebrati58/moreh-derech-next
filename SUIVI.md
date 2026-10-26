# 📋 SUIVI DU PROJET — Moreh Derech NEXT

Journal de bord : où en est le jeu, ce qui a été fait à chaque session, ce qui reste à faire.
**À lire en premier au début de chaque session**, et à mettre à jour à la fin.
Légende : ✅ fait et testé · 🟡 fait, pas encore vérifié en conditions réelles · ⏳ à faire · ⛔ bloqué (action humaine requise)

---

## 1. État actuel du jeu (24 octobre 2026)

| Domaine | État | Détail |
| --- | --- | --- |
| Banque des 22 סיורים | ✅ | 1 343 questions (au moins 20 par niveau dans chacun des 22 סיורים, + 15 pour la route 67), sources Drive liées à chaque question |
| Jeu סיור מודרך / תרגול / סיפורים | ✅ | `guided-tour.html` |
| Carte d'Israël | ✅ | `map.html`, 79 étapes sur 93 placées (Wikipédia/Wikidata) |
| Progression ⭐ / 👑 (« Zelda ») | 🟡 | `progress.js`, sur le téléphone |
| Concours de la classe | ⛔ | `class.html` — exécuter `supabase/class_contest.sql` une fois |
| **Suivi personnel « המסע שלי »** | ✅ test navigateur mobile | `journey.html` (nouveau, voir §2) |
| **Défi du jour ☀️** | ✅ test navigateur mobile | `guided-tour.html?mode=daily` |
| **Révision des erreurs 🔁** | ✅ test navigateur mobile | `guided-tour.html?mode=review` |
| Guide LIVE (micro + bus) | 🟡 | `admin.html` ; seul le parcours 67 est branché sur Supabase |
| Idées / signalements élèves | ⛔ | exécuter `supabase/feedback.sql` une fois |
| Bibliothèque communautaire | ⛔ | exécuter `supabase/community_quizzes.sql` et `community_documents.sql` |
| **Jérusalem 3D (העיר העתיקה)** | ✅ test navigateur mobile | `jerusalem3d.html` — 11 périodes, 58 fiches, monuments modélisés en détail, mode cinéma + vidéo, plan 2D, quiz 3D éteints (phase 2) |
| Langues | 🟡 | accueil en 4 langues ; **les pages de jeu et de suivi sont en hébreu seulement** (questions en hébreu) |

## 2. Journal des sessions

### 24 octobre 2026 — Suivi du joueur + motivation quotidienne
Objectif : rendre le jeu plus motivant et donner un vrai suivi de progression.

- ✅ **`progress.js`** : enregistre l'activité de chaque jour (questions répondues / justes, 120 jours max), calcule la **série de jours joués 🔥**, le **% de réussite**, la liste des **erreurs jamais corrigées**, et le **défi du jour** (5 questions : 2 קל, 2 בינוני, 1 קשה — tirage selon la date, donc **identique pour toute la classe** ; seul le premier essai du jour compte). Tout reste sur le téléphone ; rien de nouveau n'est envoyé au serveur.
- ✅ **`journey.html` « 📈 המסע שלי »** : points, étoiles, série de jours, précision ; carte « אתגר היום » ; carte « N טעויות לתיקון » ; suggestion « הכוכב הבא » (reprendre le niveau commencé) ; graphique des 14 derniers jours ; grille des 22 סיורים × 3 niveaux (★ ou % avancé, un tap ouvre le niveau).
- ✅ **Jeu** : mode `daily` (fin de partie avec grille 🟩🟥, série, bouton 📤 partage WhatsApp) et mode `review` (rejoue uniquement les questions ratées ; corrigée = sort de la liste). En fin de partie normale : bouton « 🔁 לתקן N טעויות ». La pastille en haut affiche maintenant points · ⭐ · 🔥 et mène à « המסע שלי ».
- ✅ **Accueil** : deux nouvelles tuiles (☀️ défi du jour, 📈 mon parcours) avec l'état en direct (résultat du jour, série, erreurs), traduites en 4 langues.
- ✅ Tests : `tests/journey.test.mjs` (4 tests) ; `tests/journey-browser.mjs` (parcours complet sur téléphone 390×844 : accueil → défi → suivi → révision, 16 vérifications OK).
- ℹ️ 3 tests base de données échouaient **déjà avant** cette session (rôles publics, confidentialité LIVE, migration V2) — sur Postgres local ; à examiner séparément.

### 25 octobre 2026 — Jérusalem 3D, phase 1
- ✅ Audit historique et technique (document Claude « Audit — Jérusalem 3D ») ; décision de Lionel : **11 périodes**, **le Drive d'abord**, recherches en ligne en complément (« autre avis » affiché, jamais en remplacement).
- ✅ `jerusalem3d.html` + `jerusalem3d/app.js` (three.js 0.169 copié dans `vendor/three/`) : relief réel, murailles et esplanade réelles, curseur de 11 périodes, couleur selon la certitude (attesté / reconstitution / hypothèse), vestiges des périodes antérieures en gris, tracé actuel en pointillé, fiches en 4 langues avec sources (📄 Drive, 📜 source antique, 🌐 en ligne), liste des sites, plan 2D (sans WebGL ou au choix).
- ✅ `jerusalem3d/monuments.json` : 49 fiches, identifiants stables `jerusalem_*`, `quiz3dEnabled: false`. Les éléments sans position fiable (Hippicus, Mariamne, 1re/2e/3e murailles, camp de la Xe légion…) restent dans la liste, **sans position inventée**.
- ✅ `jerusalem3d/geo.json` généré par `tools/build-jerusalem3d.mjs` (workflow « Jérusalem 3D — géographie ») : 35 repères Wikidata, murailles et contours OpenStreetMap, relief SRTM 30 m. Aucune coordonnée saisie à la main.
- ✅ Entrée : bouton « 🏛️ העיר העתיקה בתלת-ממד » dans les fiches des סיורים 11, 12, 13 et 18 de la carte. Hors ligne : ajouté à `sw.js`.
- ✅ Tests : `tests/jerusalem3d.test.mjs` (4) ; `tests/jerusalem3d-browser.mjs` (14 vérifications sur téléphone 390×844, WebGL).
- ⚠️ Contradictions Drive ↔ en ligne affichées dans les fiches : Gihon (datation), porte de Damas (1561 / 1537), carte de Madaba (croisée / VIe s.). Omar « 3e calife » : non repris dans les fiches.
- ⏳ Reste : tracés des murailles antiques (plans géoréférencés à obtenir), repère du Cardo (aucune coordonnée Wikidata), éviter le chevauchement d'étiquettes dans la Cité de David, administration des fiches (table Supabase), phase 2 (quiz 3D) **interdite sans accord**.

### 25 octobre 2026 (après-midi) — Murailles par époque + rendu 3D
- ✅ **11 tracés de murailles** (`wallline` dans `monuments.json`), chacun avec sa couleur, son niveau de certitude et ses sources : cananéenne, Premier Temple (Ézéchias), Néhémie, première muraille hasmonéenne, deuxième muraille, troisième muraille (ligne nord maximaliste **et** variante minimaliste), Aelia, Eudocie, fatimide, Soliman. Période ayyoubide : aucune muraille (rasée en 1219).
- Méthode : texte du Drive d'abord ; points de passage = repères Wikidata (tour de David, Kishle, tour israélite, muraille large, cimetière protestant/porte des Esséniens, Siloé, Gihon, structure à degrés, Ophel, Muristan, Alexander Nevsky…), angles réels de l'esplanade (OSM), et **coordonnées ITM publiées par Spiezer 2023** pour la troisième muraille (converties avec pyproj ; contrôle : l'Institut Albright tombe à ~100 m du coude). Chaque fiche dit que le tracé entre deux points est schématique.
- ✅ **Mode « 🧱 השוואת חומות »** : toutes les murailles de toutes les époques ensemble, en 3D et en 2D, avec cases pour en masquer.
- ✅ Rendu 3D : murailles en volume qui suivent le relief, ombres portées, relief ombré et lissé, ciel en dégradé, bouton 🗺️ carte de fond OpenStreetMap drapée (non vérifiable dans l'environnement de test : tuiles bloquées), bâtiments actuels OSM récupérés au déploiement (`tools/build-jerusalem3d-buildings.mjs`), en fantôme pour les périodes anciennes.
- ⏳ Reste : porte des Esséniens sans coordonnée propre ; tracé exact entre les points (plans publiés à géoréférencer) ; vérifier sur un vrai téléphone la carte de fond et les bâtiments.

### 25 octobre 2026 (soir) — Jérusalem 3D « qualité télévision »
Demande de Lionel : modèle 3D le plus précis possible, bâtiments importants en 3D, rendu présentable à la télévision.
- ✅ **Bibliothèque de modèles** `jerusalem3d/models.js` (dimensions tirées des sources, notées dans le code) : Second Temple d'après le traité Middot et Josèphe (cours, portes, porte de Nicanor, autel 32 coudées, sanctuaire 100 × 100 × 100, façade dorée, épis du toit) ; portiques doubles (Josèphe 5.190) ; Portique royal (Ant. 15.410–420) ; arc de Robinson ; arc de Wilson (15 m de large, Weizmann 2020) ; portes de Houlda et escaliers du sud (64 m, document « דוידסון ») ; Antonia ; Phasaël ; palais d'Hérode (schématique) ; rotonde + basilique byzantines du Saint-Sépulcre ; Néa ; Cardo ; Dôme du Rocher (octogone OSM réel, coupole dorée, faïence ottomane) ; al-Aqsa et Saint-Sépulcre actuel (emprises OSM réelles).
- ✅ **Matériaux** `jerusalem3d/materials.js` : pierre hérodienne à marges ciselées, appareil ottoman, marbre, dallage, sol calcaire — textures générées dans la page, à l'échelle réelle (m).
- ✅ **Rendu** : ciel physique + éclairage d'environnement, ombres 4096, occlusion ambiante (GTAO), anticrénelage (SMAA), relief réel (×1, plus d'exagération), horizon prolongé, brume selon le cadrage, étiquettes sans chevauchement. Bouton **HD/SD** (HD par défaut sur ordinateur, SD sur téléphone).
- ✅ **🎬 Mode cinéma** : survol automatique de la période (vue d'ensemble puis orbite autour de chaque monument), sous-titres nom + dates + certitude, interface masquée. **⏺️ Enregistrement** : le même survol téléchargé en vidéo WebM (sous-titres incrustés).
- ✅ **🎨** bascule matériaux réalistes / couleurs de certitude. Les hypothèses restent translucides. Fiches des modèles reconstitués : mention « 📐 dimensions d'après les sources ; détails reconstitués ».
- ✅ Fiches nouvelles : portiques doubles, arc de Wilson (avec débat de datation). Antonia décalée pour jouxter l'esplanade sans la recouvrir (noté dans la fiche).
- ✅ Tests : `tests/jerusalem3d.test.mjs` (7, dont résolution de tous les modules + cache hors ligne) ; `tests/jerusalem3d-browser.mjs` (22 vérifications sur téléphone, dont cinéma et vidéo). Captures HD 1920×1080 faites en rendu logiciel.
- ⚠️ Non vérifiable ici : fluidité sur une vraie carte graphique / un vrai téléphone (l'environnement de test est un rendu logiciel lent), carte de fond et bâtiments OSM. **À tester sur l'ordinateur qui servira à l'émission** (HD) et sur un téléphone (SD).
- ⏳ Reste : maisons de la ville ancienne non représentées (aucune donnée fiable — volontaire) ; Hippicus et Mariamne sans position ; phase 2 (quiz 3D) toujours interdite sans accord.

### 25 octobre 2026 (fin d'après-midi) — Tours d'Hérode, portes, Cardo, murailles plus lisibles
- ✅ **Hippicus et Mariamne** dessinées d'après Josèphe (Guerre 5.161–175) : Hippicus 25 × 25 coudées, 80 de haut (plein, réservoir, maison à deux étages, tourelles) ; Mariamne 20 × 20, 50 de haut, étages plus ornés. Josèphe dit seulement qu'elles étaient « tout près » de Phasaël sur la première muraille et que celle-ci « commençait à Hippicus » : **placement schématique** (Hippicus ~36 m à l'ouest, Mariamne ~32 m à l'est), restent en **hypothèse** (translucides), noté dans les fiches.
- ✅ **Portes ottomanes** : tour-porte à arc brisé, mâchicoulis, créneaux (d'après le document du cours sur la porte de Damas) ; porte de Damas avec deux tours ; porte Dorée à double passage muré et deux coupoles. Proportions schématiques, notées.
- ✅ **Arc d'Hadrien** (période romaine–byzantine) : arc à trois baies entre deux tours, d'après le cours (סיור 18).
- ✅ **Cardo** refait selon le cours : 20 m — boutiques, colonnade, trottoir couvert, chaussée. Le cardo oriental (rue HaGai) n'est pas encore représenté.
- ✅ **Murailles** : hauteur ×2 par défaut pour la lisibilité (bouton « ↕ » dans la légende pour revenir à la hauteur réelle), bandeau de la couleur de l'époque au sommet, et **constructeur + date** sur chaque étiquette, dans la fiche (« 🏗️ Bâtie par »), dans la comparaison et dans le mode cinéma.
- ✅ **Cité de David (ville basse), période hérodienne** : rue à degrés des pèlerins (8–10 m, paliers, bordures, « bema » de 4 marches ; vers 20/30 apr. J.-C., d'après le document « דרך עולי הרגל ») de Siloé jusqu'au secteur de l'arc de Robinson (tracé schématique par Givati) ; bassin de Siloé (69 m de large, trois volées de 5 marches, côtés nord et est). Les maisons de la ville basse ne sont pas dessinées (pas de plan fiable).

### 25 octobre 2026 (soir) — Audit Jérusalem 3D et corrections prioritaires
- ✅ Audit complet (accès réels, 19 anomalies) : `docs/AUDIT_jerusalem3d.md` (copie dans le projet Claude).
- ✅ Décision de Lionel : **11 périodes + « Jérusalem aujourd'hui »**. Quiz 3D / mode examen : **toujours éteints** (pas d'autorisation explicite).
- ✅ Corrections : repère hérodien (tour nord-est, pas la Citadelle entière), mention « tour de David » ≠ tours d'Hérode, 1re muraille depuis Hippicus, cardos d'Aelia, 4e rangée du Portique royal, période « aujourd'hui » et bouton « Comparer avec aujourd'hui », fiches enrichies (fonction, événements, constructeur, vestiges) depuis le Drive, nom en 2 langues, menu ☰ Outils avec libellés, message de préparation, accès depuis tout parcours de la Vieille Ville.
- ✅ Tests : 7 tests unitaires ; 27 vérifications navigateur sur téléphone simulé.
- ✅ **Carte d'Israël** : panneau doré « 🏛️ ירושלים 3D » posé sur le mont du Temple (coordonnée Wikidata lue dans `geo.json`), hors des grappes, toujours visible ; un toucher ouvre la 3D (testé : navigation vers `jerusalem3d.html?period=5`, aucune erreur). « 3D » isolé en sens gauche-droite pour ne pas être coupé par l'hébreu.

### 25 octobre 2026 (nuit) — « Museum Edition », étape B : vrai modèle du mont du Temple
- ✅ Audit + inventaire des modèles 3D : `docs/PROPOSITION_musee_jerusalem3d.md` (copie dans le projet). Retenu : **OpenBible.info « Herod's Temple Mount », licence MIT**, sources Middot / Josèphe / fouilles, ~30 contrôles géométriques exécutés (tous OK). Écartés : modèle CGTrader (payant, aucune source), maquette du Musée d'Israël (protégée).
- ✅ Lionel valide l'intégration directe. Conversion en GLB (`tools/templemount/`), 6,6 Mo, recalé sur le contour OSM réel (écart des angles ≤ 1,9 m), affiché à la période hérodienne en mode réaliste ; nos volumes simplifiés restent en secours (échec de chargement, mode couleurs de certitude, autres périodes).
- ✅ Chaque élément du modèle est classé **A/B/C/D** et relié à une fiche (`models/temple-mount-30ce.json`) ; la fiche affiche la liste et le crédit OpenBible (MIT). Hypothèses illustratives (chaussée vers le mont des Oliviers, piscine d'Israël) translucides.
- ⚠️ Le modèle représente **vers 30 apr. J.-C.** (pas 66) ; différences mineures sur l'esplanade. Leur relief n'est pas repris : petites différences possibles au pied des murs.
- ⏳ Étapes suivantes proposées : C (fiches A/B/C/D détaillées en hébreu), D (trois tours, palais, villes haute et basse, à modéliser nous-mêmes), E (quiz — sur autorisation), F (optimisation, mesure sur Android réel).
- ✅ **Accès plus facile à la 3D** : grande bannière dorée « 🏛️ ירושלים בתלת‑ממד » en haut de l'accueil (4 langues, avant les modes de jeu), bouton « 🏛️ תלת‑ממד » dans l'en-tête des parcours de Jérusalem (סיורים 11, 12, 13, 14, 18) ; en plus du panneau sur la carte. Testé sur téléphone simulé (accueil → 3D, parcours 12 → 3D, pas de bouton sur le parcours 04) ; test du suivi joueur toujours OK.
- ✅ **Ville d'aujourd'hui en transparence** (demande de Lionel, anachronisme assumé et signalé dans la légende) : bâtiments OpenStreetMap à 36 % d'opacité dans toutes les périodes anciennes, pleins aux périodes ottomane et « aujourd'hui » ; les bâtiments de l'esplanade sont retirés de la ville fantôme. Corrigé au passage : un commentaire mal placé (audit du 25/10) avait désactivé la transparence. Vérifié avec des bâtiments d'essai (le vrai fichier n'est créé qu'au déploiement).
- ✅ **Vallées et eau (💧, menu ☰)** : Nahal Kidron (tracé OpenStreetMap), גיא בן הינום et גיא הטירופיאון calculés sur le relief SRTM (comblement des cuvettes + écoulement D8 ; écart médian avec le Kidron d'OSM 14–18 m pour une grille de 40 m) ; partie sud du Tyropéon (comblée) d'après le cours, plus transparente ; petits ravins du réseau en trait léger ; source du Gihon. Fiches en 4 langues (texte du cours « דגם ירושלים בית שני »), aussi sur le plan 2D. `geo.json` régénéré avec vallées et cours d'eau OSM.
- ✅ **Arches et vieille ville** : arc de l'Ecce Homo (Hadrien, 135 ; cours סיור 18 — מנזר האחיות מציון) ; cardo occidental et cardo oriental d'Aelia ; à la période « aujourd'hui », tronçon restauré du Cardo avec colonnade (quartier juif), et vestiges visibles aujourd'hui (Maison brûlée, quartier hérodien, muraille large, puits de Warren, piscine de Siloé).
- ✅ Tests : 7 unitaires, 30 vérifications navigateur (34 depuis le 26/10).
- ✅ **L'eau en bleu** : Cédron, Hinnom et Tyropéon dessinés en ruban bleu vif, plus large, avec un courant animé ; ravins secondaires en bleu clair ; l'eau reste bleue même en mode « couleurs de certitude » ; bassins (Siloé, piscines du modèle du mont du Temple) en bleu. Précision : ce sont des **vallées** (oueds), à sec la plupart de l'année, pas des rivières permanentes ; seule la source du Gihon coule toute l'année.
- ✅ **Muraille à Siloé** : la 1re muraille (et celle d'Eudocie) passait au milieu du bassin de Siloé ; elle passe maintenant au sud du bassin, qui est à l'intérieur de la ville, comme le dit le document du cours « השילוח » (« חומת העיר מבית שני עברה מדרום למאגר »). La rue à degrés part du bord nord du bassin. Les autres tracés n'ont pas changé depuis le début (vérifié : mêmes repères, mêmes points), sauf le départ à Hippicus.

### 26 octobre 2026 — Sélecteur d'époque bien visible, tours d'Hérode refaites
- ✅ **Époque** (choix de Lionel : « barre plus visible ») : grand bouton doré « 🕰️ nom de l'époque · dates ▾ » en bas, avec flèches ‹ › pour passer à l'époque précédente / suivante ; un toucher ouvre la liste des 12 époques en gros boutons. La bande défilante reste dessous. Testé sur téléphone simulé (412 × 860) : ouverture, choix, flèche suivante, liste refermée.
- ✅ **Tours d'Hérode** refaites d'après Josèphe (Guerre 5.161–175) : Phasaël = base pleine 20 × 20 × 20 m, parapets et bastions d'angle, galerie à colonnes de 10 coudées, tour centrale à étages et tourelles (≈ 45 m) ; Hippicus = base pleine 30 coudées, réservoir 20, maison à deux étages 25, tourelles et créneaux (40 m) ; Mariamne = base pleine 20 coudées, étages ornés de pilastres (25 m). Fenêtres étroites en plein cintre au lieu des grands carrés noirs. Mesures de Josèphe ; formes des détails reconstituées.
- ✅ Hippicus et Mariamne passent de « hypothèse » à « reconstruction argumentée » : leur existence et leurs mesures sont dans Josèphe, seule la position exacte est schématique (note conservée dans la fiche). Elles ne sont donc plus translucides. Les vraies hypothèses restent translucides, mais moins (72 % au lieu de 55 %) et sans effet « fil de fer ».
- ✅ 3e muraille (tracé Sukenik–Mayer) : part maintenant de la tour Hippicus (Josèphe 5.147), comme la 1re.

## 3. À faire / idées (par priorité)

0. ⏳ **Jérusalem 3D** — phase 1 en ligne (voir journal du 25/10). Prochaines étapes : plans géoréférencés des murailles antiques, onglet admin des fiches, phase 2 (quiz 3D) seulement avec accord explicite.

1. ⛔ **Supabase NEXT** : exécuter une fois `class_contest.sql`, `feedback.sql`, `community_quizzes.sql`, `community_documents.sql` (SQL Editor). Sans cela, le classement de la classe et les signalements ne fonctionnent pas.
2. ⏳ Essai réel avec 2–3 élèves sur téléphone (défi du jour + partage WhatsApp) et retour d'expérience.
3. ⏳ Examiner les 3 tests base de données en échec.
4. ⏳ Traduire l'interface des pages de jeu / suivi en FR/EN/RU (les questions elles-mêmes restent en hébreu tant qu'elles ne sont pas traduites et vérifiées).
5. ⏳ Badges thématiques (ex. « 🏛️ maître du Second Temple ») à partir des thèmes des questions — nécessite d'ajouter un champ `topic` vérifié aux questions.
6. ⏳ Étendre LIVE / Solo / Simulation aux 22 סיורים (aujourd'hui : route 67 seulement).
7. ⏳ Placer les 14 étapes manquantes sur la carte (titres Wikipédia à corriger dans `tools/places-sources.json`).

## 4. Comment vérifier rapidement

- Site : https://lebrati58.github.io/moreh-derech-next/ (déployé automatiquement à chaque push sur `main`).
- Sur le téléphone : Accueil → « ☀️ אתגר היום » → répondre aux 5 questions → « 📈 המסע שלי » → « 🔁 טעויות לתיקון ».
- Tests : `npm test` (Postgres local requis pour les tests SQL) ; `CHROME=/chemin/chrome node tests/journey-browser.mjs`.
