# Audit — Jérusalem 3D (25 octobre 2026)

## 1. Accès et outils effectivement disponibles

| Accès | Disponible | Remarque |
| --- | --- | --- |
| Dépôt GitHub `lebrati58/moreh-derech-next` (lecture + écriture, push sur `main`) | ✅ | copie locale complète |
| Déploiement GitHub Pages (workflow automatique au push) | ✅ | statut lisible via `gh run list` |
| Google Drive du cours (lecture) | ✅ | documents lus nommément cités ci-dessous |
| Recherche web / Wikipédia | ✅ partiel | certains sites refusés par la liste d'accès (lexundria direct, madain : partiel) |
| Navigateur de test | ✅ partiel | Chromium sans écran, rendu logiciel SwiftShader (très lent) — pas un vrai GPU |
| Page publiée lue depuis l'environnement | ❌ | domaine github.io hors liste d'accès ; seule la capture d'écran de Lionel prouve son chargement sur téléphone |
| Samsung Galaxy S24, autres navigateurs, mesure GPU/mémoire réelle | ❌ | aucun appareil physique ni service de test distant |
| Tuiles OSM de la carte de fond, `buildings.json` (bâtiments actuels) | ❌ dans l'environnement | bloqués ici ; générés seulement au déploiement |

Documents du Drive lus pour cet audit : דגם ירושלים בית שני ; מנהרת הכותל סופי ; דוידסון סופי ; סיור 18 — קארדו ; סיור 18 — שער שכם ; דרך עולי הרגל ; סיור 12 — הגבעה המזרחית.
Sources en ligne lues : Josèphe, Guerre 5.136–183 (Lexundria, via recherche) ; Wikipedia : Herod's Palace, Tower of David (northeast tower), Pool of Siloam ; Institut Weizmann (arc de Wilson) ; Madain Project (arc de Wilson).

## 2. Tableau des anomalies

Gravité : C = critique, I = importante, A = amélioration. Statut : V = vérifié, P = partiellement vérifié, N = impossible à vérifier ici.

| Id | Domaine | Gr. | Constat | Source de vérification | Cause | Correction prévue | Test de validation | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | historique | C | Le repère « tower_of_david » est l'article Wikipédia « מגדל דוד » (Q1177765) = **la Citadelle entière**, pas la tour hérodienne. Phasaël est donc placée au centre de la Citadelle, à quelques dizaines de mètres de la tour nord-est (base hérodienne). | `geo.json` (qid Q1177765), `tools/jerusalem3d-anchors.json` | candidat de repère trop général | nouveau repère « Tower of David (northeast tower) » (Wikidata), régénérer `geo.json` par le workflow ; Hippicus, Mariamne, palais et 1re muraille recalés sur ce repère | test unitaire : Phasaël utilise le repère de la tour nord-est | V |
| H2 | historique | I | Fiche Phasaël : « Tour de David » entre guillemets sans préciser qu'il s'agit du nom moderne de la Citadelle / du minaret, distinct de la tradition biblique. | `monuments.json` | formulation | ajouter la distinction (nom médiéval/moderne ≠ tour hérodienne ≠ tradition davidique) en 4 langues | lecture de la fiche | V |
| H3 | historique | I | La 1re muraille commence au repère de la Citadelle alors que Josèphe (5.144) la fait **commencer à Hippicus** — incohérent avec la position schématique d'Hippicus. | Josèphe 5.144 ; `monuments.json` | ordre des points | faire partir la 1re muraille d'Hippicus | test des points de passage | V |
| H4 | historique | I | Le Cardo n'apparaît qu'à l'époque byzantine ; le cours (סיור 18 — שער שכם) dit que les deux cardos partent de la porte de Damas **dès Aelia Capitolina** (le prolongement sud est byzantin). Cardo oriental (rue HaGai) absent. | Drive סיור 18 | période d'origine | Cardo nord dès la période romaine, prolongement sud à la byzantine, cardo oriental en tracé schématique | contrôle par période | V |
| H5 | historique | I | Portique royal : Josèphe (Ant. 15.413) parle de 162 colonnes en 4 rangées, la 4e engagée dans le mur ; le modèle a 3 rangées de 40 et un mur sans demi-colonnes. | code `royalStoa` | simplification | ajouter la rangée engagée (demi-colonnes) et le nombre total dans la fiche | comptage dans le code | V |
| H6 | historique | I | Période 11 « ottomane (1517–1917) » affiche en même temps la ville **actuelle** (bâtiments OSM, tracé actuel) : confusion Ottoman / aujourd'hui. | `app.js` (`styleCity`) | pas de période « aujourd'hui » | période « Jérusalem aujourd'hui » distincte, ou bouton « Comparer avec aujourd'hui » | changement de période | V |
| H7 | historique | A | Pas de période hellénistique (Akra, Ptolémées/Séleucides) ; les périodes demandées dans le nouveau cahier des charges (12) diffèrent des 11 périodes décidées le 25/10. | `monuments.json` | décision antérieure | **décision de Lionel requise** | — | V |
| H8 | historique | A | Ville haute / ville basse non représentées comme zones (le cours les définit : colline ouest / Cité de David). Maisons non dessinées (volontaire : pas de plan). | Drive דגם ירושלים | — | zones légendées au sol (sans maisons inventées) | contrôle visuel | V |
| H9 | historique | A | Hippicus, Mariamne, palais, portes, Wilson : positions/proportions schématiques — déjà signalées dans les fiches, translucides pour les hypothèses. | `monuments.json` | sources lacunaires | conserver ; vérifier le libellé après H1 | — | V |
| C1 | contenu | I | Aucune question de révision liée aux fiches (0/59) ; champs « ce qu'il en reste » (5/59) et « constructeur » (11/59, murailles seulement) très incomplets ; « fonction » et « événements » non structurés. | `monuments.json` | phase 1 | compléter depuis le Drive, champ par champ, sans inventer (« inconnu » si inconnu) | test : champs présents ou marqués inconnus | V |
| C2 | contenu | A | Nom affiché dans une seule langue ; le cahier des charges demande hébreu **et** français dans la fiche. | `app.js` `openSheet` | — | sous-titre avec le nom hébreu (ou français) | lecture de la fiche | V |
| U1 | UX/UI | I | 10 boutons-icônes empilés sans libellé visible (seulement des info-bulles) ; sur téléphone la colonne recouvre la scène. | capture de Lionel (Galaxy) + captures 390×844 | ajouts successifs | 4 boutons principaux + un menu « ☰ Outils » avec icônes **et** libellés | test navigateur mobile | P |
| U2 | UX/UI | I | Pas de bouton « Comparer avec aujourd'hui ». | code | — | bascule avant/aujourd'hui sur la fiche et la scène (avec H6) | test navigateur | V |
| U3 | UX/UI | A | Qualité HD/SD choisie seulement d'après l'écran tactile : un Galaxy S24 (puissant) passe en SD. | code | règle simpliste | choix d'après le GPU déclaré + mesure de la fluidité des premières secondes | non vérifiable sans l'appareil | N |
| T1 | technique | I | Pas d'erreur JavaScript, 23 vérifications OK sur téléphone simulé ; mais la 1re image prend ~60 s en rendu logiciel (compilation des shaders). Sur un vrai GPU : inconnu. | `tests/jerusalem3d-browser.mjs` | SwiftShader | écran de chargement avec progression ; préchauffage des matériaux | mesure sur l'appareil réel | P |
| T2 | technique | A | Tout le modèle d'une période est construit d'un coup (pas de chargement progressif). | code | — | construire d'abord relief + murailles, puis monuments | test navigateur | V |
| I1 | intégration | I | Accès seulement depuis les fiches des סיורים 11, 12, 13, 18 de la carte ; rien quand on choisit « Jérusalem » en tant que lieu. | `map.html` | — | bouton dans toute fiche de lieu situé dans la Vieille Ville + lien depuis la recherche « ירושלים » | test navigateur de la carte | V |
| I2 | intégration | I | Modes exploration / révision / examen / סיור מודרך absents ; quiz 3D verrouillés (`quiz3dEnabled:false`) **sur instruction de Lionel** (phase 2 interdite sans accord). | `monuments.json`, consigne du projet | décision | **autorisation de Lionel requise** pour le mode examen | — | V |
| D1 | déploiement | A | Page publiée non lisible depuis l'environnement ; vérification réelle seulement par Lionel. | liste d'accès | — | procédure de vérification fournie | — | N |

## 3. Plan par priorité

- **Critique** (faisable maintenant) : H1.
- **Importante** (faisable maintenant) : H2, H3, H4, H5, H6 + U2, U1, C2, I1, T1.
- **Importante** (faisable maintenant mais long, par lots) : C1 (compléter les fiches depuis le Drive).
- **Décision requise** : H7 (périodes), I2 (mode examen / quiz 3D).
- **Amélioration future** : H8, T2, U3.

## 4. Procédure de vérification pour Lionel (non exécutable ici)

1. Ordinateur de l'émission : ouvrir la page, bouton qualité sur **HD**, tourner/zoomer 30 s, lancer 🎬 puis ⏺️ ; noter toute saccade.
2. Galaxy S24 : même chose en **SD** puis en **HD** ; noter le temps avant la première image.
3. Signaler toute erreur affichée (ou capture d'écran).

## 5. Corrections réalisées (25 octobre 2026, soir)

| Id | Fait | Vérification exécutée |
| --- | --- | --- |
| H1 | Nouveau repère « Tower of David (northeast tower) » (Q2213411), régénéré par le workflow : ~24 m à l'est du centre de la Citadelle. Phasaël, Hippicus, Mariamne et le palais s'y rattachent. | `geo.json` reconstruit depuis les annotations du workflow ; les 48 autres repères et le relief sont identiques ; test unitaire |
| H2 | Fiche Phasaël : distinction « tour de David » (nom tardif de la Citadelle et du minaret) ≠ tours d'Hérode ≠ tradition davidique, en 4 langues. | lecture de la fiche (capture téléphone) |
| H3 | La 1re muraille part d'Hippicus (jeton `herod:hippicus`). | test unitaire des points de passage |
| H4 | Cardo occidental d'Aelia (période romaine) + cardo oriental (rue HaGai, tracé schématique, « reconstitution ») ; le Cardo byzantin reste à partir de la période byzantine. | test unitaire ; contrôle par période |
| H5 | Portique royal : 4e rangée de colonnes engagée dans le mur sud (≈ 160 colonnes, Josèphe : 162). | code |
| H6/U2 | 12e période « Jérusalem aujourd'hui » : bâtiments actuels pleins seulement là ; bouton « 🔄 Comparer avec aujourd'hui » dans les fiches, avec pastille de retour. | test navigateur (aller-retour) |
| C1 | Champs « fonction », « événements », « constructeur », « ce qu'il en reste » ajoutés pour les monuments prioritaires, uniquement d'après le Drive. Questions de révision : **non faites** (mode examen non autorisé). | test unitaire (4 langues) |
| C2 | Nom dans une seconde langue sous le titre de la fiche. | test navigateur |
| U1 | Colonne réduite à 4 boutons (🎯 📋 🎬 ☰) ; menu « ☰ Outils » avec icônes **et** libellés. | test navigateur |
| T1 | Message « Préparation de la 3D… » jusqu'à la première image. | test navigateur |
| I1 | Bouton 🏛️ sur tout parcours de la carte dont une étape est dans la zone du modèle (ajoute le סיור 14). | code (non testé dans le navigateur) |

Toujours en attente : H7 (fait : 11 périodes + « aujourd'hui », décision de Lionel), I2 (mode examen : pas d'autorisation), H8, T2, U3, vérifications sur appareil réel.
