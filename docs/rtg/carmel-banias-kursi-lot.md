# Lot 5 — Hai-Bar Carmel, Banias et Kursi

Contrôle du 8 novembre 2026, reprise de #80 et de `main` au commit `5d2f9e992177960e87f1fb208a708fbd6d7003c2`. Lot borné : trois lieux et cinq brochures. Aucune écriture Supabase, migration, règle, question du jeu historique ou donnée personnelle modifiée. Les 25 fichiers de faits déjà présents sont conservés octet pour octet ; le catalogue reste à 727 documents.

## Sources et périmètre réellement relu

| Lieu | Document | Pages de la sélection | Statut du contenu |
| --- | --- | --- | --- |
| Hai-Bar Carmel | `9b6c301b71c8`, brochure hébraïque | 1–2 | 5 faits, 3 stations et 3 réponses contrôlés sur les pages rendues du PDF officiel |
| Hai-Bar Carmel | `ee084bcc4f9d` EN, `3fe1375b1177` AR | Titre p. 1 | Identité des éditions contrôlée ; aucune validation exhaustive des traductions |
| Banias | `159ca3f67084`, brochure hébraïque | 1–2 | 5 faits, 3 stations et 3 réponses contrôlés sur les pages rendues du PDF officiel |
| Kursi | `6ec9f0263969`, brochure anglaise | Titre p. 1 | Identité contrôlée ; extraction pédagogique antérieure conservée, à relire |

Liens officiels :

- Carmel HE : https://static.parks.org.il/wp-content/uploads/2024/02/chai-bar-carmel-heb-for-internet2017.pdf
- Carmel EN : https://static.parks.org.il/wp-content/uploads/2024/02/chai-bar-carmel-eng.pdf
- Carmel AR : https://static.parks.org.il/wp-content/uploads/2024/02/chai-bar-carmel-arab.pdf
- Banias : https://static.parks.org.il/wp-content/uploads/2025/03/banias.pdf
- Kursi : https://static.parks.org.il/wp-content/uploads/2026/01/kursi.pdf

L'identité des cinq téléchargements est conservée par SHA-256 dans `site-groups.json`. Les résumés sont de courtes reformulations originales en hébreu, avec pages et repères textuels. Les six exercices sont des questions ouvertes avec éléments de réponse reliés aux faits sélectionnés ; ils ne sont pas présentés comme de nouveaux QCM validés du jeu historique.

Carmel : fondation en 1973, objectif de reproduction/réintroduction, arrivée des daims persans en 1978, rythme annuel de reproduction des vautours et partenariat de protection contre l'électrocution. Banias : Pan et le nom du lieu, temple d'Auguste associé à Hérode, développement par Philippe, énergie hydraulique du moulin Matroof et rive basaltique du sentier suspendu. Aucun chiffre de longueur du sentier repris : la brochure et la page actuelle n'en donnent pas la même valeur (environ 80 / 100 m). Aucun arbitrage inventé.

## Contrôle du cours dans Google Drive

Le document `20260903 סיור 17 קמפוס גולן בניאס.docx` a été lu : il distingue le secteur des sources/antiquités et celui de la cascade, et fournit un recoupement ciblé sur Pan, Hérode et Philippe. Il ne constitue pas une validation de tout le cours. Une date de bataille présente dans ce cours n'est pas réutilisée dans les nouveaux exercices ; elle demanderait un contrôle distinct.

La copie Drive `דפדפת חי בר כרמל באנגלית Hai-Bar Carmel_ee084b.pdf` a été lue et rapprochée du PDF anglais officiel. Ce rapprochement contrôle l'identité de cette édition, pas toute sa traduction ni le cours sur la faune. Pas de contrôle de cours spécifique à Kursi dans ce lot. Les liens privés et les textes intégraux Drive ne sont pas publiés.

## Identité des lieux et géographie

Le lien automatique Banias → Nimrod est supprimé : il venait d'une mention de proximité. Aucun lieu Banias exact n'existe dans le jeu actuel ; aucun lien de remplacement inventé. Kursi conserve son lien existant au site d'examen correspondant. Les trois éditions du Carmel sont regroupées ensemble, distinctes de Hai-Bar Yotvata. Les régions sont corrigées explicitement et persistent après une nouvelle classification automatique.

| Lieu | Repère publié lu dans la source | Source des valeurs |
| --- | --- | --- |
| Hai-Bar Carmel | 32.74994444, 34.99959167 | https://he.wikipedia.org/wiki/חי-בר_כרמל |
| Banias, sources/antiquités | 33.24861, 35.69444 | https://en.wikipedia.org/wiki/Banias |
| Kursi | 32.8260861, 35.6503778 | https://en.wikipedia.org/wiki/Kursi,_Sea_of_Galilee |

Identités recoupées avec les pages officielles RTG reliées aux brochures. Ces coordonnées sont des **repères de site publiés et contrôlés dans leur source**, pas des points d'entrée/parking certifiés terrain. Liens Google Maps produits à partir de ces valeurs sans interpolation.

Banias possède deux secteurs : le repère concerne les sources/antiquités, pas la cascade. La fiche avertit de vérifier les accès et modalités de réservation propres à chaque secteur sur la page officielle actuelle. Les trois stations du mode guide ne promettent pas un itinéraire continu ou actuellement ouvert. Aucune alerte datée transformée en question de connaissances.

## Couverture et manques

Après reconstruction : **17 lieux, 28/100 sources prioritaires associées** (10 guides, 15 brochures, 3 cartes), 13 repères documentés, quatre coordonnées manquantes. **6 lieux avec passages sélectionnés contrôlés ; 0 audit intégral**. Les dix guides initiaux restent à relire. Le nombre de fichiers structurés passe de 25 à 27 et les questions de 220 à 226. Les 194 liens document–jeu restants remplacent les 195 antérieurs après retrait du faux lien Banias–Nimrod.

Restent **62 brochures et 10 cartes** sans association dans cette couche ; cela ne correspond pas nécessairement à 72 lieux. Coordonnées encore absentes : Shaar Hagai, Beit Yanai, Palmachim, sources du Yarkon. L'ancien inventaire de 46 candidats n'est pas une couverture auditée.

| Région | Lieux | Repères sourcés | Passages sélectionnés contrôlés | Audits intégraux |
| --- | ---: | ---: | ---: | ---: |
| דרום רמת הגולן | 1 | 1 | 0 | 0 |
| מרכז וצפון הגולן והחרמון | 1 | 1 | 1 | 0 |
| השפלה | 2 | 2 | 0 | 0 |
| חיפה והכרמל | 1 | 1 | 1 | 0 |
| ירושלים | 0 | 0 | 0 | 0 |
| הרי ירושלים וסובב ירושלים | 2 | 1 | 0 | 0 |
| מדבר יהודה וים המלח | 0 | 0 | 0 | 0 |
| הנגב הצפוני | 0 | 0 | 0 | 0 |
| הר חברון והשומרון | 0 | 0 | 0 | 0 |
| מישור החוף | 4 | 2 | 0 | 0 |
| העמקים, הגלבוע ובית שאן | 0 | 0 | 0 | 0 |
| הגליל התחתון | 0 | 0 | 0 | 0 |
| הגליל העליון והחולה | 2 | 2 | 2 | 0 |
| מרכז הארץ | 2 | 1 | 0 | 0 |
| הנגב הדרומי | 1 | 1 | 1 | 0 |
| הערבה ואילת | 1 | 1 | 1 | 0 |

Les six régions à zéro restent visibles dans l’interface. La couverture nationale exploitable au 10 novembre demeure un objectif non acquis.

## Validation et reprise

Reconstruction : `node tools/rtg/build-catalog.mjs`, `node tools/rtg/build-sites.mjs`, `node tools/rtg/coverage.mjs`. Tests ciblés : 16/16. Les résultats complets, le commit publié et le déploiement sont consignés dans #80 après exécution.

Reprise conseillée : relire les dix guides, compléter les quatre coordonnées documentées manquantes et traiter les brochures des six régions à zéro. Ne pas requalifier Kursi ou les éditions EN/AR du Carmel sans contrôle de leur contenu.
