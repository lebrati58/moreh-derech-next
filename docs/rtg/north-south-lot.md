# Lot 3 — Tel Dan et Avdat (8 novembre 2026)

## Livraison et preuves

Deux lieux supplémentaires et cinq brochures officielles : Tel Dan hébreu/anglais (`08d4706c710e`, `26a06883880b`) ; Avdat hébreu et deux éditions anglaises (`989314676c9f`, `a243ff4c35eb`, `30c4d3c4a317`). Les éditions restent distinctes, avec leur URL et SHA-256. La brochure d'Ein Avdat n'est pas rattachée à la ville d'Avdat. La brochure Hula, téléchargée au stade de sélection, n'a pas été traitée ni intégrée dans ce lot.

Les deux PDF hébreux ont été rendus et lus visuellement : Tel Dan page 2 ; Avdat pages 1 et 2. Les textes anglais ont servi de recoupement, pas de substitution de pagination. Les mini-fiches comprennent chacune cinq reformulations originales, trois stations présentes dans le document et trois exercices de rappel avec réponses paginées. Chaque réponse référence les items qui l'étayent ; pas de distracteurs inventés. Ces six exercices s'ajoutent aux 208 existants. Les exercices nouveaux utilisent le moteur actuel et sa correction assistée, sans changement du calcul de score.

Le contrôle est explicitement limité : `selected_passages_checked`, dix faits et six réponses, pas `fullyAudited`. Le contrôle ne certifie ni les informations pratiques anciennes, ni l'exhaustivité historique de la brochure, ni les itinéraires actuels. Les stations sont des points de préparation pédagogique, pas un parcours GPS.

## Drive

La copie Drive de la brochure hébraïque d'Avdat a été lue et son introduction recoupée avec le document RTG. Les résumés de cours « 02 - תקציר מאורגן - תקופת הברונזה (הכנענית) » et « 03 - תקציר מאורגן - תקופת הברזל / בית ראשון » ont été consultés pour Tel Dan. Le premier confirme le repère du portail de la période du Bronze ; le second contient des formulations sur les inscriptions qui nécessitent une vérification propre : elles ne sont pas reprises dans ce lot. Les tableaux d'itinéraires du cours signalent eux-mêmes des informations de Tel Dan à compléter. Aucun audit global du cours n'est annoncé ; aucun texte privé ou lien Drive personnel n'est publié dans l'application. La recherche ciblée n'a pas retrouvé la copie Drive de la brochure Tel Dan.

## Géographie et corrections

Deux coordonnées supplémentaires sont lues dans des sources publiées : Tel Dan `33.249, 35.652` (https://en.wikipedia.org/wiki/Tel_Dan) ; Avdat `30.794, 34.773` (https://en.wikipedia.org/wiki/Avdat). Identités recoupées sur les pages RTG officielles du catalogue. Il s'agit de repères génériques de sites, pas d'entrées vérifiées ou de parkings. Le classement Tel Dan dans le module reste régionalement provisoire. Avdat est classée dans le Néguev méridional d'après sa localisation officielle dans le Har HaNegev ; les trois éditions ont une correction persistante. La fausse association automatique Tel Dan → Nimrod est retirée, et aucun lieu voisin n'est utilisé comme substitut. Les lieux et questions du jeu existant restent intacts.

## Mesure et correction du bilan précédent

12 lieux regroupés ; 21/100 documents prioritaires associés ; **10 guides, 8 brochures, 3 cartes** ; 5 points documentés, 7 positions manquantes ; 2 fiches aux passages sélectionnés contrôlés ; **0 fiche intégralement auditée**. Les régions nouvellement représentées sont Galilée supérieure/Hula et Néguev méridional (un lieu chacune). Dix régions restent à zéro dans cette couche.

Le lot 2 comptait en réalité 3 brochures et 3 cartes : le document mixte de Migdal Tzedek est classé `map` dans le catalogue. La précédente description « 4 brochures et 2 cartes » était erronée. Le total de 16 sources du lot 2 était exact. Il reste maintenant **69 brochures et 10 cartes non associées**, pas une promesse de 79 lieux supplémentaires.

Catalogue conservé : 727 documents ; 23 documents structurés ; 214 questions. Les 46 candidats du registre historique ne deviennent pas 46 lieux vérifiés. Aucun accès en écriture à Supabase ; aucune migration.

## Reproduction et reprise

`node tools/rtg/build-catalog.mjs`, puis `node tools/rtg/build-sites.mjs`, puis `node tools/rtg/coverage.mjs`. Les corrections manuelles survivent au réimport. Les tests vérifient les sources primaires sans guide, la provenance des réponses, la distinction Avdat/Ein Avdat, les compteurs par type/région et la conservation des dix guides initiaux.

Résultats des tests, commit, déploiement et contrôle public : consignés dans #80 après publication. Prochaine priorité : positions des sept guides sans point, autres brochures nord/sud (Hula et Arava/Eilat notamment), puis revue des extractions initiales ; conserver les statuts de manque tant qu'aucune preuve n'est lue.
