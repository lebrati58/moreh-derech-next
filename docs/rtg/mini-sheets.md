# Lot 1 — mini-fiches de révision RTG

Issue #80. Ce lot ajoute un affichage utile aux 21 documents déjà structurés, sans prétendre avoir traité de nouveaux documents ni vérifié l'ensemble des extractions.

- 21 mini-fiches : au plus cinq repères existants, chacun avec citation et page ; diversité de sujets avant remplissage.
- Conseils pédagogiques et éléments sans citation/page exclus du résumé de faits.
- Bouton vers la page du PDF officiel lorsque son URL HTTPS appartient à parks.org.il ; autres URL non utilisées comme preuve.
- Accès direct aux 208 questions **déjà présentes** dans ces documents ; aucune nouvelle question créée ou réponse modifiée.
- Lien Google Maps de recherche par nom explicitement distinct d'une position ou d'un parcours vérifié.
- Avertissement visible : extraction à relire, non vérifiée ; les informations pratiques doivent être contrôlées auprès de la source officielle actuelle.
- Affichage hébreu et libellés français selon la langue existante. Le texte pédagogique reste dans la langue de sa source.
- Ajout au cache hors ligne, sans toucher Supabase, scores ou progression. Une réponse de chargement obsolète n'est pas injectée dans une autre fiche.

Contrôles : tests du modèle pour citations/pages, URL de source non fiable et application aux 21 fichiers ; analyse syntaxique et vérification du diff. La suite native et le déploiement sont suivis dans #80.

Exemple : `rtg.html#/d/84ac7ba1e956` (Apollonia).

Ce lot ne crée pas la carte nationale, ne corrige pas les classements géographiques, et ne fusionne pas encore les documents par site. Prochain lot : rapprochement des guides et brochures par lieu avec contrôle du document principal, puis position et région prouvées.
