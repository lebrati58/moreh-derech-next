# Lot 2 — sources regroupées par lieu et carte de référence

Issue #80 — contrôle des sources du 8 novembre 2026.

## Livré

- Dix groupes correspondant aux dix guides RTG, chacun avec son guide principal.
- Six sources supplémentaires rattachées explicitement : brochures d'Apollonia, Migdal Tzedek et Beit Guvrin (hébreu/anglais), cartes de Palmachim et Lachish. Seize documents au total ; aucun rapport administratif ni document d'un autre site lié par une simple mention.
- Nouvelle page `rtg-sites.html` : liste, filtres, fiche par lieu, préparation à l'oral par stations et conseils paginés, liens vers les exercices existants, sources officielles et Google Maps.
- Trois coordonnées lues sur les pages publiées citées ci-dessous. Il s'agit de **points de référence du site**, jamais d'entrées certifiées ou de chemins praticables. Les sept autres lieux restent sans marqueur.
- Vue de couverture pour les régions du cours et des zones complémentaires ; les zones non traitées restent visibles à zéro. Les régions de sept groupes restent provisoires.
- Trois corrections régionales conservées dans `content/rtg/corrections.json`, résistantes au réimport : Apollonia → plaine côtière, Migdal Tzedek → centre, Lachish → Shfela.
- Aucune modification de Supabase, des questions, réponses ou scores. Le précédent calque de carte reste disponible ; la nouvelle vue distingue les sources principales contrôlées des associations automatiques.

## Ce qui a été vérifié et ce qui ne l'a pas été

Les seize PDF officiels ont été récupérés et leur identité contrôlée dans les premières pages ou visuellement sur la carte. Leur empreinte SHA-256, leur URL et la page de contrôle figurent dans `content/rtg/site-groups.json`. Les copies Drive des guides de Shaar HaGai, Lachish et Beit Guvrin ont été lues : les titres et textes d'introduction correspondent aux documents RTG. Aucun lien de Drive personnel n'est ajouté au site public.

Ce contrôle valide la **relation document–lieu**, pas l'exactitude intégrale du texte extrait. Tous les groupes conservent `contentStatus: extraction_to_review` et `fullyAudited: false`. Les points de carte ont le statut `published_source_checked`, pas `surveyed_entrance` ; les valeurs sont reproduites avec leur source, sans interpolation.

Sources de coordonnées lues le 8 novembre 2026 :

| Lieu | Latitude, longitude | Source publiée | Usage |
| --- | --- | --- | --- |
| Apollonia–Arsuf | 32.19528, 34.80667 | https://en.wikipedia.org/wiki/Apollonia%E2%80%93Arsuf | Repère du site |
| Migdal Afek / Migdal Tzedek | 32.08083, 34.95694 | https://en.wikipedia.org/wiki/Migdal_Afek | Repère de la forteresse |
| Tel Lachish | 31.56500, 34.84889 | https://en.wikipedia.org/wiki/Lachish | Repère du tell |

L'identité des sites a été recoupée avec les guides officiels RTG. Les coordonnées sont celles d'une source collaborative et ne sont pas présentées comme un relevé géomètre ou un emplacement officiel de parking.

Pages RTG consultées :

- https://www.parks.org.il/reserve-park/migdal-tzedek/
- https://www.parks.org.il/reserve-park/גן-לאומי-אפולוניה-תל-ארשף/
- https://www.parks.org.il/reserve-park/gay-2/
- https://www.parks.org.il/reserve-park/lachish/

Deux précautions utiles découlent de la lecture actuelle : le site RTG d'Apollonia recommande de chercher le parking plutôt que le nom du site seul (qui peut mener aux dunes) ; les consignes d'arrivée de Shaar HaGai diffèrent entre ancien guide et page actuelle. La fiche renvoie donc à la page officielle, sans figer une consigne de visite ancienne en fait d'examen.

## Mesure et reprise

- 10 groupes ; 16/100 documents prioritaires associés ; 3 points documentés ; 7 points manquants ; **0 groupe dont tout le contenu est audité**.
- 727 documents du catalogue conservés ; 21 extractions existantes et leurs 208 questions conservées.
- `node tools/rtg/build-sites.mjs` reconstruit `public/rtg/sites.json` depuis les associations explicites.
- `node tools/rtg/coverage.mjs` conserve les 46 entrées candidates antérieures et ajoute `reviewedCoverage` sans les qualifier de vérifiées.
- Toute nouvelle association doit être ajoutée avec une preuve d'identité du document ; aucune recherche par mot-clé ne suffit pour l'intégrer à cette vue.
- Priorité suivante : les sept positions manquantes puis les brochures/cartes encore hors des groupes. Ajouter des repères du nord et du sud avec preuves ; ne pas prétendre que les dix guides actuels couvrent toutes les régions.

Tests et déploiement : résultats finaux consignés dans #80 après vérification.
