# Lot 7 — sélection pédagogique du guide Ein Hanya

Contrôle du **9 novembre 2026**, reprise de #80 et de `main` au commit `e15e348b90dfd7bbb6eee7aa3ec6d11ddf1d19ea`.

## Ce qui est effectivement livré

Première sélection relue parmi les dix guides prioritaires : **Ein Hanya**, document `d5b4cc4e18d3`. Cinq repères, trois stations et trois questions existantes ont été contrôlés sur les pages rendues du PDF officiel. L'extraction complète reste conservée et accessible comme contenu à relire. Aucun nouveau lieu, aucune nouvelle coordonnée et aucune nouvelle question ajoutée à la banque.

Source officielle : https://static.parks.org.il/wp-content/uploads/2022/03/מדריך-למדריך-עין-חניה.pdf

SHA-256 du téléchargement : `d5b4cc4e18d30f4d31b0fde73b987cec42e8d70d24f001e873bfdd211a4c2315`, identique à l'empreinte déjà enregistrée. Pages rendues et lues : **2, 5, 6, 8, 10, 11 du fichier PDF**. Le document présente des doubles pages ; les numéros imprimés diffèrent. Les liens `#page=` visent les pages du fichier, et cette convention est expliquée dans l'interface.

| Sélection | Page PDF | Périmètre |
| --- | ---: | --- |
| Situation et surface du site | 2 | Présentation générale |
| Fonctionnement d'un aquifère perché / source de couche | 5 | Géologie du lieu |
| Nom du site et forme du nymphée | 10 | Étymologie, sans datation du monument |
| Fouille de la basilique par Baramki | 10 | Identification et date données par le guide |
| Tradition chrétienne de Philippe | 6 | Présentée explicitement comme tradition |
| Stations : maison ottomane, nymphée, source | 8, 10, 11 | Stations du guide, pas itinéraire GPS vérifié |
| Questions originales 0, 1, 2 | 10, 10, 6 | Étymologie, fouille, tradition ; éléments de réponse relus |

Les réponses attendues de ces trois questions sont conservées. La sélection retire seulement les réponses alternatives non nécessaires à ce périmètre et resserre les références sur les pages qui étayent les réponses. Les dix questions et les 60 éléments de l'extraction originale ne sont pas modifiés. Aucun QCM ou distracteur inventé.

## Drive et confrontation des sources

La copie Drive `מדריך למדריך עין חניה_d5b4cc.pdf` a été retrouvée et lue pour la présentation, le passage sur la fouille et l'étymologie ; elle correspond au guide officiel. La recherche ciblée d'un cours de visite indépendant n'a pas fourni de résultat exploitable. Ce contrôle de copie **n'est pas une validation générale du cours**. Aucun lien privé ni texte intégral de Drive publié.

Pages RTG également consultées :

- https://www.parks.org.il/reserve-park/enchinya-2/
- https://www.parks.org.il/article/enhaniya-audio-3/

Le guide et les présentations officielles ne proposent pas tous la même datation du nymphée : certaines parlent d'une attribution romaine, le guide audio évoque une phase probablement byzantine. **Cette datation est exclue de la sélection contrôlée**, signalée comme limite dans la fiche et absente des trois exercices. Aucune nouvelle question ne tranche cette divergence. La tradition chrétienne reste distinguée d'une preuve archéologique.

Ni conditions de baignade, ni horaires, ni accès actuel ne sont validés par cette relecture. Le point cartographique antérieur reste un repère générique publié, sans requalification d'entrée ou de parking. La région d'Ein Hanya conserve son statut provisoire.

## Conservation et fonctionnement

- Sélection séparée dans `content/rtg/reviews/d5b4cc4e18d3.json`, copie publique produite par `build-sites.mjs`.
- La fiche par lieu et le mode guide lisent cette sélection lorsqu'elle est présente. La bibliothèque complète conserve sa mini-fiche marquée « extraction à relire » et ses dix questions.
- Quiz de sélection : `rtg.html#/q/d5b4cc4e18d3/reviewed`. Lien vers les dix questions originales conservé ; le bouton rejouer garde le mode sélection.
- Les identifiants des questions d'origine et le même périmètre de progression sont réutilisés : **aucune seconde banque de points**. Les règles de score, plafonds et données enregistrées ne changent pas.
- Validation structurelle : indices d'origine uniques et existants, questions/réponses attendues identiques, stations identiques, pages et éléments de preuve présents. Cette validation automatique ne remplace jamais la lecture visuelle des pages sources.
- Les 27 fichiers pédagogiques originaux et leurs 27 copies publiques restent identiques octet pour octet ; les 20 fichiers Supabase sont inchangés. Aucune migration ni écriture sur `evvutvnfmbhdxeyzmknv`.

## Couverture réelle

**17 groupes, 28/100 sources prioritaires associées, 17 repères sourcés.** Aucun nouveau groupe ou document associé dans ce lot. **7 groupes avec passages sélectionnés contrôlés, 0 audit intégral.** Parmi les dix guides : **1 guide possède une sélection contrôlée, 9 n'en ont pas encore** ; le reste du guide Ein Hanya reste également à auditer.

Catalogue : 727 documents, 27 extractions originales, 226 questions uniques de banque conservées. Le fichier de sélection contient trois références à des questions existantes, pas trois nouvelles questions. Restent 62 brochures et 10 cartes à associer. Six régions sans groupe dans cette couche : Jérusalem, désert de Judée/mer Morte, Néguev nord, Hébron/Samarie, vallées/Gilboa/Beit Shean, Basse Galilée.

| Région | Groupes | Repères sourcés | Sélections contrôlées | Audits intégraux |
| --- | ---: | ---: | ---: | ---: |
| דרום רמת הגולן | 1 | 1 | 0 | 0 |
| מרכז וצפון הגולן והחרמון | 1 | 1 | 1 | 0 |
| השפלה | 2 | 2 | 0 | 0 |
| חיפה והכרמל | 1 | 1 | 1 | 0 |
| ירושלים | 0 | 0 | 0 | 0 |
| הרי ירושלים וסובב ירושלים | 2 | 2 | 1 | 0 |
| מדבר יהודה וים המלח | 0 | 0 | 0 | 0 |
| הנגב הצפוני | 0 | 0 | 0 | 0 |
| הר חברון והשומרון | 0 | 0 | 0 | 0 |
| מישור החוף | 4 | 4 | 0 | 0 |
| העמקים, הגלבוע ובית שאן | 0 | 0 | 0 | 0 |
| הגליל התחתון | 0 | 0 | 0 | 0 |
| הגליל העליון והחולה | 2 | 2 | 2 | 0 |
| מרכז הארץ | 2 | 2 | 0 | 0 |
| הנגב הדרומי | 1 | 1 | 1 | 0 |
| הערבה ואילת | 1 | 1 | 1 | 0 |

## Tests et reprise

Tests ciblés : validation de la sélection et rejets de preuves manquantes/indices inventés, rendu de la bibliothèque complète, questions et réponses existantes, identifiants de progression inchangés et rejouer en mode sélection. Reconstruction déterministe, syntaxe et diff contrôlés. Résultats complets, commit et vérifications du site publié consignés dans #80 après déploiement.

Prochain lot : poursuivre la relecture des neuf guides sans sélection contrôlée, puis les brochures/cartes des régions à zéro. Ne pas promouvoir toute l’extraction Ein Hanya ni dater le nymphée à partir de cette sélection. La couverture nationale exploitable au 10 novembre reste incomplète.
