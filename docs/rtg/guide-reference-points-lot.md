# Lot 6 — quatre repères des guides prioritaires

Contrôle du **9 novembre 2026**, reprise de #80 et de `main` au commit `256f98fc0893fc2a46dfda11bfc738474d88aa9e`.

## Périmètre livré

Compléter les quatre positions manquantes des dix guides déjà regroupés : Shaar Hagai, Beit Yanai, Palmachim et le secteur des sources du Yarkon. Aucun nouveau lieu, document pédagogique ou exercice. Les mini-fiches, modes guide, liens aux exercices et sources existants sont conservés ; les quatre repères disposent maintenant de liens Google Maps numériques et d'une provenance explicite.

Les libellés géographiques apparaissent dans la fiche et la bulle de carte. Un repère de station n'est plus présenté seulement comme un point générique du parc. Les points restent `published_source_checked` / `site_reference_not_entrance` : **pas des entrées, parkings, relevés terrain ou itinéraires certifiés**. La précision décimale reproduit celle de la source sans garantir une précision terrain équivalente.

## Preuves des positions et limites

| Lieu | Latitude, longitude publiées | Source de la valeur | Identité et périmètre |
| --- | --- | --- | --- |
| Khan Shaar Hagai | 31.814626487108, 35.02362072263 | https://amudanan.co.il/w/P11242 | Fiche nommée du khan ; identité recoupée avec le guide et la page RTG, pas le col en général |
| Plage de Beit Yanai | 32.38730, 34.86428 | https://www.hefer.org.il/uploads/n/1689849107.9614.pdf#page=6 | Page PDF 6, ligne 8 « חוף בית ינאי » ; pas le centre du moshav |
| Plage de Palmachim | 31.930277777778, 34.700833333333 | https://he.wikipedia.org/wiki/חוף_פלמחים | Article nommé de la plage ; identité recoupée avec le guide RTG et sa carte déjà associée, pas le kibboutz |
| Moulin El-Mir, secteur des sources du Yarkon | 32.11325319, 34.91520802 | https://amudanan.co.il/w/P913410 | **Station interne**, identifiée à la page PDF 19 du guide officiel, pas Tel Afek ni une entrée |

Les sources de coordonnées ont été ouvertes et les valeurs lues. La page du rapport municipal de Beit Yanai a aussi été vérifiée visuellement : titre de ligne, colonnes et valeurs. Ce rapport administratif sert **uniquement de preuve géographique pour une fiche de plage déjà fondée sur un guide RTG**. Il ne devient ni nouvelle fiche de visite, ni source de questions, ni document prioritaire supplémentaire. Le nombre de sources pédagogiques associées ne change pas.

Rejets explicites : coordonnées du moshav Beit Yanai et de sa station météorologique, coordonnées de l'embouchure du Yarkon à Tel Aviv, points de Tel Afek, point situé hors du secteur des sources. Aucun calcul de position à partir du nom d'un lieu, aucun géocodage approximatif et aucune interpolation. Le repère du moulin est choisi comme station nommée dont l'appartenance au secteur est étayée, et son libellé est visible dans l'interface.

## Documents RTG officiels

Les quatre PDF ont été téléchargés depuis leurs URL officielles. Les empreintes correspondent exactement aux identités déjà conservées dans `site-groups.json` :

- Shaar Hagai, `7561e969b354`, SHA-256 `7561e969b3542e27a54dbbbc2b5dc13081d1d3478d323f27df1c224b4a4e55c2` : https://www.parks.org.il/wp-content/uploads/2025/10/מדריך-למדריך-חאן-שער-הגיא.pdf
- Beit Yanai, `694d7c79feee`, SHA-256 `694d7c79feee39467eac00965d821f9c1dac77b02a74d1620b4c83c3dcc7f116` : https://static.parks.org.il/wp-content/uploads/2023/06/bet-yanay.pdf
- Palmachim, `4e67c0fdb83d`, SHA-256 `4e67c0fdb83d28c769f06deab0172f5f3830e692be0f24bb5025c9e0ac20e1f9` : https://static.parks.org.il/wp-content/uploads/2023/02/palmachim.pdf
- Sources du Yarkon, `40132a61a194`, SHA-256 `40132a61a19470b321ef3632816ff2250a382830e52e8b965f636d42780f1edc` : https://static.parks.org.il/wp-content/uploads/2023/05/guide-yarkon.pdf

Titres de couverture lus sur les rendus, introductions repérées ; station 4 du moulin El-Mir lue visuellement p.19. Ce contrôle **ne valide pas les 54–60 éléments ni les 10–12 exercices de chaque extraction**. Les dix guides restent `extraction_to_review`, sans nouvel indicateur de contrôle intégral ou de passages pédagogiques validés.

## Drive et cours

La copie Drive `מדריך למדריך חאן שער הגיא_7561e9.pdf` a été retrouvée et lue pour l'identité du document et sa présentation géographique : khan au sud de la route 1, centre consacré aux convois vers Jérusalem. Elle correspond au document officiel ; son texte n'est pas publié intégralement. Les recherches ciblées n'ont pas retrouvé de cours de visite spécifique exploitable pour les quatre lieux, ni la copie exacte du guide des sources du Yarkon. Les résultats non pertinents et banques de questions dérivées ne sont pas utilisés comme preuve circulaire. **Aucun nouveau fait de cours ou exercice n'est ajouté dans ce lot.**

## Pages actuelles et accès

Consultées le 9 novembre 2026 :

- Shaar Hagai : https://www.parks.org.il/reserve-park/gay-2/ — accès par la route de service débutant à la station Paz Mesilat Zion ; la fiche renvoie à l'instruction actuelle. Le point du khan n'est pas une destination de parking garantie.
- Beit Yanai : https://www.parks.org.il/reserve-park/גן-לאומי-נחל-אלכסנדר-חוף-בית-ינאי/ — plage et ensemble du parc à distinguer. Le marqueur ne prouve ni surveillance de baignade ni autorisation de se baigner.
- Palmachim : https://www.parks.org.il/reserve-park/גן-לאומי-חוף-פלמחים/ — plage et kibboutz à distinguer, aucune déduction de poste de secours actif depuis la carte. L'indication numérique de grille publiée sur cette page n'est pas convertie : sa présentation n'explicite pas suffisamment le système et l'une des valeurs semble tronquée.
- Sources du Yarkon : https://www.parks.org.il/reserve-park/yarkon-2/ — secteur explicitement distinct de Tel Afek, avec modalités d'arrivée et réservation propres. Le moulin figure dans les centres d'intérêt de ce secteur ; cela recoupe son identité dans le guide p.19.

Ces informations restent des notices pratiques datées, liées aux pages actuelles, hors des réponses d'examen. Pas de prix, horaires, ouverture actuelle ou traversée continue déduits du seul point géographique.

Régions : Beit Yanai et Palmachim → littoral, sources du Yarkon → centre, corrections persistées avec preuves. **Shaar Hagai conserve son classement régional provisoire** : le contrôle de la position ne suffit pas à lever cette qualification de frontière géographique.

## Couverture réellement mesurée

**17 groupes / 17 repères sourcés / 0 position manquante parmi ces groupes**, contre 13 repères et 4 manques avant ce lot. Cela ne signifie pas zéro manque sur l'ensemble d'Israël. **28/100 documents prioritaires associés : 10 guides, 15 brochures, 3 cartes.** 62 brochures et 10 cartes restent sans association dans cette couche. Aucun rapport ajouté au corpus des visites.

**6 groupes avec passages sélectionnés contrôlés ; 0 groupe intégralement audité**. Dix régions représentées, six toujours à zéro. Les 27 fichiers pédagogiques sources et leurs 27 copies publiques sont inchangés octet pour octet. Catalogue conservé : 727 documents, 226 questions, 194 documents liés au jeu. Registre historique : 46 candidats non audités.

| Région | Groupes | Repères sourcés | Passages sélectionnés contrôlés | Audits intégraux |
| --- | ---: | ---: | ---: | ---: |
| דרום רמת הגולן | 1 | 1 | 0 | 0 |
| מרכז וצפון הגולן והחרמון | 1 | 1 | 1 | 0 |
| השפלה | 2 | 2 | 0 | 0 |
| חיפה והכרמל | 1 | 1 | 1 | 0 |
| ירושלים | 0 | 0 | 0 | 0 |
| הרי ירושלים וסובב ירושלים | 2 | 2 | 0 | 0 |
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

## Validation et reprise

Reconstruction catalogue/sites/couverture effectuée ; 18/18 tests RTG ciblés, syntaxe JS et diff contrôlés. La suite complète, la CI PostgreSQL native et les vérifications de déploiement sont consignées dans #80 après publication. Aucun fichier Supabase modifié ; aucune migration ni écriture dans `evvutvnfmbhdxeyzmknv`. Les règles et données de partie sont préservées.

Suite prioritaire : relecture pédagogique des dix guides et traitement des brochures/cartes des six régions encore à zéro — Jérusalem, désert de Judée/mer Morte, Néguev nord, Hébron/Samarie, vallées/Gilboa/Beit Shean, Basse Galilée. La couverture nationale exploitable au 10 novembre n’est pas acquise ; les points de carte ne doivent jamais être comptés comme des visites intégralement vérifiées.
