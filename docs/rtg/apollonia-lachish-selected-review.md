# Lot 8 — sélections des guides Apollonia et Lachish

Contrôle du **9 novembre 2026**, reprise de #80 et de `main` au commit `0d12c8b14a65a4a03aa18bd879d87897c7487b06`. Lot borné : deux guides prioritaires, chacun cinq repères, trois stations et trois questions existantes relus sur les pages rendues du PDF officiel.

## Sources réellement contrôlées

| Guide | Pages PDF de la sélection | Questions originales | Stations originales |
| --- | --- | --- | --- |
| Apollonia, `84ac7ba1e956` | 5, 12, 23, 34, 36 | 0, 1, 2 | 0, 4, 8 : four à verre, villa, vue du château depuis le pont |
| Lachish, `359f22ca4c1d` | 5, 6, 7, 18, 25, 26, 27, 30 | 2, 4, 5 | 8, 9, 11 : lettres, porte intérieure, sièges des rois |

Les références sont celles du **fichier PDF**, sans conversion à partir d'une pagination supposée. Les deux téléchargements correspondent aux empreintes déjà conservées :

- Apollonia : https://static.parks.org.il/wp-content/uploads/2023/08/מדריך-למדריך-גן-לאומי-אפולוניה-מונגש.pdf — SHA-256 `84ac7ba1e95613324f87ac3829c75a3db9c8ea484548e39f8db9fd91c068c3c9`.
- Lachish : https://static.parks.org.il/wp-content/uploads/2023/05/lachish-nagish.pdf — SHA-256 `359f22ca4c1d629388ee7b1797c6d8b4beaa64facbe34498f97ab56aba860d7e`.

Apollonia : sélection sur la géographie, le nom ancien, le château, le trésor et l'activité verrière. Les trois questions de niveau 1 sont conservées avec leurs éléments attendus et leurs identifiants d'origine.

Lachish : sélection sur le tell, la confrontation de sources, le dispositif moderne des sièges et le débat concernant la porte. Une question de niveau 1 et deux de niveau 2 sont relues. Le lien entre sources différentes est étayé par les pages 6, 7 et 18, pas par la seule présence du nom de la ville. La partie sur la porte cite les pages 26 et 27 afin de conserver **les deux interprétations exposées par le guide**, sans trancher le désaccord. Les sièges sont explicitement présentés comme un aménagement moderne.

Les descriptions de visite ne deviennent pas des preuves d'ouverture actuelle ou des itinéraires GPS. Aucun nouveau point numérique ajouté ; les 17 repères et leurs réserves antérieures sont conservés. La visite du lieu où sont présentées les copies avant le spectacle de Lachish n'est pas proposée comme station d'oral : le guide y indique qu'on ne peut pas guider. Les trois stations choisies sont celles du parcours extérieur déjà identifiées.

## Google Drive et cours

La copie Drive `מדריך למדריך תל לכיש_359f22.pdf` a été lue pour les passages sur les sources, les sièges et le désaccord archéologique, puis rapprochée du PDF officiel. La copie exacte du guide Apollonia n'a pas été retrouvée après recherches ciblées, y compris sur le nom de fichier ; aucun identifiant Drive n'est inventé.

Le cours `fulll transcript קורס מורה דרך 25/05` a été retrouvé et consulté dans Drive. Son passage sur Lachish traite des **temples cananéens du fossé**, distincts du dispositif de la porte de l'âge du Fer. Il n'est donc pas utilisé pour valider la lecture archéologique de cette porte. Les deux contextes ne sont pas fusionnés. La transcription, dont certaines formulations sont imprécises, n'est pas recopiée dans la fiche. Aucun cours indépendant consacré à Apollonia n'a été contrôlé dans ce lot.

Les banques de questions dérivées trouvées dans Drive ne sont pas utilisées comme preuve circulaire. Aucun texte privé intégral ou lien Drive personnel n'est publié. Le contrôle effectué n'est pas une validation générale du cours.

Pages RTG publiques également consultées le 9 novembre 2026 :

- https://www.parks.org.il/reserve-park/גן-לאומי-אפולוניה-תל-ארשף/
- https://www.parks.org.il/trip/apolonya/
- https://www.parks.org.il/reserve-park/lachish/
- https://www.parks.org.il/article/lachish-audio-3/

## Intégration et conservation

Les deux fichiers de sélection sont ajoutés à `content/rtg/reviews/` et publiés par le générateur existant. Aucun changement du lecteur, des règles ou des plafonds de points. Les fiches par lieu, le mode guide et les quiz utilisent les sélections ; la bibliothèque complète et ses dix questions par guide restent accessibles comme extraction à relire. Réponses attendues et niveaux d'origine conservés, alternatives non nécessaires écartées dans les seules sélections.

**Aucune nouvelle question ajoutée à la banque de 226 questions** : six questions existantes relues. Les mêmes identifiants servent à la progression ; les sélections ne créent pas de seconde banque de points. La sélection d'Ein Hanya du lot 7 est inchangée.

Les 27 fichiers pédagogiques sources, leurs 27 copies publiques et les 20 fichiers Supabase sont identiques octet pour octet à la base. Aucune migration ni écriture dans `evvutvnfmbhdxeyzmknv`, aucune donnée de partie modifiée.

## Couverture et manques

**17 groupes, 28/100 sources prioritaires associées (10 guides, 15 brochures, 3 cartes), 17 repères sourcés.** Aucun nouveau groupe ou document associé dans ce lot. **9 groupes avec passages sélectionnés contrôlés ; 0 audit intégral.**

Parmi les dix guides prioritaires, **3 possèdent une sélection contrôlée, 7 n'en possèdent pas encore**. Les parties non sélectionnées des trois premiers restent aussi à auditer. Les fiches du littoral et de la Shfela gagnent chacune une sélection contrôlée. Dix régions sont représentées et six restent à zéro dans cette couche.

Catalogue inchangé : 727 documents, 27 extractions originales, 226 questions uniques, 194 documents liés au jeu. Trois fichiers de sélection séparés, sans multiplication du nombre de documents. Restent 62 brochures et 10 cartes à associer ; l'inventaire historique de 46 candidats reste non audité.

| Région | Groupes | Repères sourcés | Sélections contrôlées | Audits intégraux |
| --- | ---: | ---: | ---: | ---: |
| דרום רמת הגולן | 1 | 1 | 0 | 0 |
| מרכז וצפון הגולן והחרמון | 1 | 1 | 1 | 0 |
| השפלה | 2 | 2 | 1 | 0 |
| חיפה והכרמל | 1 | 1 | 1 | 0 |
| ירושלים | 0 | 0 | 0 | 0 |
| הרי ירושלים וסובב ירושלים | 2 | 2 | 1 | 0 |
| מדבר יהודה וים המלח | 0 | 0 | 0 | 0 |
| הנגב הצפוני | 0 | 0 | 0 | 0 |
| הר חברון והשומרון | 0 | 0 | 0 | 0 |
| מישור החוף | 4 | 4 | 1 | 0 |
| העמקים, הגלבוע ובית שאן | 0 | 0 | 0 | 0 |
| הגליל התחתון | 0 | 0 | 0 | 0 |
| הגליל העליון והחולה | 2 | 2 | 2 | 0 |
| מרכז הארץ | 2 | 2 | 0 | 0 |
| הנגב הדרומי | 1 | 1 | 1 | 0 |
| הערבה ואילת | 1 | 1 | 1 | 0 |

## Validation et reprise

26/26 tests RTG ciblés. Reconstruction déterministe, identités de questions/stations et références contrôlées. Les résultats complets, le commit et le déploiement sont consignés dans #80 après vérification.

Reprise : poursuivre les sept guides sans sélection contrôlée, puis les brochures et cartes des six régions à zéro : Jérusalem, désert de Judée/mer Morte, Néguev nord, Hébron/Samarie, vallées/Gilboa/Beit Shean, Basse Galilée. Ne pas promouvoir les extractions entières ni transformer le désaccord sur la porte de Lachish en certitude. La couverture nationale exploitable au 10 novembre reste un objectif non acquis.
