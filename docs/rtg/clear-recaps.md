# Fiches récapitulatives plus lisibles — 10 novembre 2026

Demande : rendre les récapitulatifs des lieux plus clairs sur téléphone. Modification de présentation appliquée aux 21 groupes du module RTG, à partir du commit `266b2f8`.

- Le titre du lieu et son statut de vérification remplacent le grand bandeau national dans la vue détaillée.
- Les cinq repères arrivent avant les notices longues : numéros, catégorie existante, texte aéré sur fond clair et lien à la page PDF. La citation reste dépliable sous chaque point.
- Dates explicites des cinq repères mises en évidence dans le texte et dans un encadré avec pages : années, siècles, décennies, intervalles et ères. Aucun calcul ou enrichissement de dates ; les approximations et les ères présentes sont conservées. Les dimensions, nombres de pièces ou de sièges ne sont pas pris pour des dates. Une fiche sans date explicite reste sans encadré.
- Trois onglets persistants : résumé, préparation guide, entraînement. Le mode guide numérote les stations, conserve leurs pages et sépare les conseils.
- Les conditions pratiques restent accessibles après le contenu. Le détail de la vérification et toutes les sources sont regroupés dans une rubrique dépliable. Le statut partiel, le classement régional provisoire éventuel et la limite « pas une entrée » des coordonnées restent visibles.
- Accès direct à la fiche regroupée depuis la mini-fiche de la bibliothèque ; impression / PDF par le dialogue du navigateur, sans fichier envoyé à un service tiers.

Les liens des scripts et styles de ces deux pages portent une version afin de ne pas réutiliser les anciens fichiers du navigateur ; le repli hors ligne existant ignore les paramètres.

Aucun fait, exercice, réponse, coordonnée, statut de couverture, contenu de cours, score ou fichier Supabase modifié. Les 41 tests RTG ciblés passent. Les résultats CI, le commit, le déploiement et les contrôles de l'interface publique sont consignés dans [#80](https://github.com/lebrati58/moreh-derech-next/issues/80).
