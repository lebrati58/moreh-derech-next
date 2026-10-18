# V3 — Route 67 Zikhron Yaakov → Yokneam, sans photo (état de la branche)

## Fichiers ajoutés
- `content/v3/road67_questions.json` : 8 questions principales et 2 facultatives, traduction des questions/options dans 4 langues ; anecdote hébraïque préliminaire.
- `content/v3/road67_unverified.geojson` : points envisagés SANS coordonnées, car la trajectoire du bus n'est pas encore validée.
- `supabase/migration_v3.sql` : ajoute la banque V3 et 10 questions sans modifier V1/V2.

## Interface
- `⚙️ → משחק חדש` propose les banques présentes en base et permet de choisir V1/V2/V3.
- En V3, `שידור חי` propose un GPS sur autorisation explicite. Il n'affiche QUE le statut de votre position et de sa précision, aucune alerte géographique non vérifiée.
- Aucun affichage de photos pour la V3 ; la galerie V2 reste réservée à V2.
- Les questions V3 restent publiées **manuellement**.
- Dernière question : NVIDIA / Mellanox, à poser seulement si le délai avant Aroma le permet.

## Mise en service
1. Ne fusionnez pas avant un test en préproduction.
2. Vérifiez que V2 est installée dans Supabase. Exécutez ensuite `supabase/migration_v3.sql` dans SQL Editor.
3. Créez une partie V3 et vérifiez les traductions, le fonctionnement du GPS et la révélation. Le script SQL est rejouable, mais la fusion du code ne l'exécute pas à distance.
4. Validez le trajet **précis** de l'autocar après l'échangeur Ein Tut vers Aroma G Center HaTamar 2. L'arrivée précise du bus/point de dépose n'est pas confirmée.
5. Avec un tracé officiel ou OSM vérifié, établissez les repères `on-road` (sur la chaussée), leur visibilité droite/gauche, leur précision. Pas seulement le centre géographique d'un village. Puis implémentez les alertes de progression et le mode simulation.
6. Jusqu'à cette validation, **aucune alerte GPS 'maintenant' n'est activée**. Cette limitation est voulue.

## Ce qui reste à développer (et non à prétendre terminé)
- Polyligne routière vérifiée avec coordonnées de déclenchement fiables.
- Matching routier, distance le long de l'itinéraire, ETA, alertes en trois niveaux.
- Simulation GPS et tests de déplacement.
- Scripts oraux complets de 20–40 secondes traduits dans chaque langue ; le script hébraïque initial est provisoire.
- Tests PostgreSQL réels et tests navigateur ; aucun test automatisé n'a été exécuté dans cette branche.

## Sources d'origine
- `הדרכת דרך זיכרון יקענם.docx` (Yaïr) transmis par l'utilisateur.
- `20260827 הדרכת דרך.docx` (Yossi Kahana), transmis par l'utilisateur.
- Actualités NVIDIA (rachat Mellanox 2020, bureaux à Yokneam) ; ne pas annoncer une visibilité des bâtiments sans preuve.

**Règle de sécurité :** le GPS et le fait d'être proche d'un point ne doivent jamais publier une question. Toutes les publications restent des actions explicites du guide.
