# Lot 4 — Hula, Yotvata et cinq repères cartographiques

Contrôle du 8 novembre 2026 ; reprise de main `c277071` et de #80. Aucun AGENTS.md trouvé dans le dépôt ou ses répertoires parents ; instructions utilisateur et documentation RTG existante suivies.

## Contenu livré

Deux sources primaires de visite, aucune simple mention transformée en lieu :

| Fiche | Document RTG | Pages lues visuellement | Portée du contrôle |
| --- | --- | --- | --- |
| Réserve de la Hula | `04fbdfd52b59`, https://static.parks.org.il/wp-content/uploads/2025/03/hachula.pdf | 1–3 | Identité ; cinq repères, trois stations et trois réponses |
| Hai-Bar Yotvata | `11e950d9cf0b`, https://static.parks.org.il/wp-content/uploads/2025/03/yotveta.pdf | 1–2 | Identité ; cinq repères, trois stations et trois réponses |

Les PDF ont été récupérés sur le domaine officiel, rendus et lus. Les SHA-256 et les pages de contrôle sont conservés dans `site-groups.json`. Dix reformulations courtes, six exercices ouverts avec réponses et renvois aux faits lus. Une question de niveau 2 par fiche invite à expliquer le processus de restauration ou de réintroduction ; aucune fausse alternative ajoutée. Les 23 fichiers pédagogiques précédents restent inchangés.

Statut `selected_passages_checked` : contrôle limité aux repères, stations et réponses listés. Aucune fiche intégralement auditée, aucun ancien document automatiquement promu à « vérifié ». Les parcours dessinés par les brochures sont des supports de préparation, pas une validation d'accès actuel.

## Drive et distinctions indispensables

Le document de cours `20261008 סיור 20 אגמון החולה.docx` a été lu sur Drive. Il concerne **l'Agamon**, pas la réserve RTG. La réserve possède sa propre brochure et ses propres stations. La relation est signalée sans fusion des lieux, des coordonnées ou des exercices. La page officielle de l'Agamon (https://agamon-hula.co.il/) a aussi été consultée. Les assertions naturalistes du cours ne sont pas reprises automatiquement dans la fiche.

Les recherches ciblées n'ont pas retrouvé les copies Drive des deux brochures ni un cours précis sur Yotvata. Les résultats sur Hai-Bar Carmel ne sont pas utilisés comme preuve pour Yotvata. Ce manque reste explicite ; les contenus nouveaux reposent sur les PDF RTG officiels lus, pas sur une validation générale du cours. Aucun lien Drive personnel ni texte intégral de cours publié.

Le faux lien automatique Hula → Rosh Pina, issu d'une indication de route, est retiré. Le lien vers la réserve de la Hula dans le jeu est conservé et rendu explicite. Les régions Hula → Galilée supérieure/Hula et Yotvata → Arava/Eilat sont conservées dans les corrections manuelles ; le classement automatique de Yotvata au nord est remplacé.

## Conditions pratiques séparées des faits d'étude

La page officielle RTG des alertes, https://www.parks.org.il/category/newsflash, consultée le 8 novembre 2026, annonce la fermeture **du circuit safari de Yotvata du 8 au 12 novembre 2026** pour restauration. La fiche affiche la date de contrôle, le périmètre, l'échéance et le lien officiel ; elle ne prétend pas vérifier l'ouverture en temps réel ni fermer tout le site. Cette information ne devient pas une question de connaissances.

Le site RTG de Beit Guvrin indique également que la grotte de la cloche sud est fermée les jours de pluie et pendant les 48 heures suivantes. La fiche conserve une mention datée et renvoie au site actuel, sans conclure à un état d'ouverture particulier aujourd'hui.

## Géographie : repères publiés, pas entrées certifiées

| Lieu | Latitude, longitude | Source de la valeur |
| --- | --- | --- |
| Réserve de la Hula | 33.078055555556, 35.598333333333 | https://he.wikipedia.org/wiki/שמורת_החולה |
| Hai-Bar Yotvata | 29.871406, 35.050292 | https://en.wikipedia.org/wiki/Yotvata_Hai-Bar_Nature_Reserve |
| Ashkelon | 31.66389, 34.54583 | https://en.wikipedia.org/wiki/Ashkelon_National_Park |
| Beit Guvrin–Maresha | 31.5969611, 34.9006472 | https://en.wikipedia.org/wiki/Beit_Guvrin-Maresha_National_Park |
| Ein Hanya | 31.7435417, 35.1566845 | https://he.wikipedia.org/wiki/עין_חניה |

Valeurs lues dans les sources citées et identités recoupées avec les pages RTG officielles. La précision décimale publiée n'est pas une garantie de précision terrain. Chaque point et lien Google Maps reste nommé `site_reference_not_entrance`, avec statut `published_source_checked`. Aucune interpolation, aucun point de parking inventé. Restent sans coordonnées : Shaar Hagai, Beit Yanai, Palmachim, sources du Yarkon.

## Déclenchement du réimport

Une modification du seul générateur de catalogue déclenchait un import complet du corpus Drive. Ce chemin a été retiré du déclencheur ; les modifications des collecteurs et les lancements manuels restent possibles. Le marqueur `[skip rtg-import]` permet une correction de maintenance sans relancer la collecte, et une exécution annulée ne doit plus pousser un inventaire partiel. Le réimport involontaire de ce lot est suivi dans #80 ; il ne fait pas partie des sources validées.

## Intégration et mesure

Le générateur de catalogue transporte désormais la relation explicite document–fiche (`gs`) vers la bibliothèque et les références cartographiques. Les boutons utilisent cette relation, sans liste de documents codée en dur ; les simples mentions restent exclues. La carte du jeu peut ainsi ouvrir la fiche Hula depuis sa brochure, comme elle le faisait pour les guides. Aucun changement des règles, scores ou données de jeu ; aucun fichier/migration Supabase modifié.

- **14 lieux, 23/100 sources prioritaires** : 10 guides, 10 brochures et 3 cartes.
- **10 repères numériques documentés**, 4 positions manquantes.
- **4 fiches aux passages sélectionnés contrôlés**, 0 fiche intégralement auditée.
- 7 régions représentées dans cette couche ; 9 régions à zéro. Arava/Eilat est nouvellement représentée.
- Catalogue conservé : 727 documents ; 25 contenus structurés ; 220 questions (214 antérieures + 6).
- 67 brochures et 10 cartes restent sans association dans cette couche ; ce ne sont pas forcément 77 lieux différents.

Reconstruction : `node tools/rtg/build-catalog.mjs`, `node tools/rtg/build-sites.mjs`, `node tools/rtg/coverage.mjs`. Résultats de tests, commit et publication consignés dans #80 après vérification du déploiement.

Prochain lot : documenter les quatre positions manquantes ; poursuivre brochures/cartes des régions à zéro ; relire les dix guides avant de changer leur statut. La couverture nationale complète au 10 novembre reste un objectif non acquis.
