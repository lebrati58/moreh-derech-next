# Banque de questions — revue du 6 novembre 2026

La banque active passe de 217 à 445 questions en hébreu, sur 22 thèmes. Elle comprend 358 nouvelles questions et 87 anciennes questions relues et rattachées à un passage du cours. Les 130 autres anciennes questions sont conservées dans `content/parta/review/held-questions-20261106.json`, hors de la sélection du jeu. Leur mise en attente ne signifie pas nécessairement que leur réponse était fausse : les cours consultés ne suffisaient pas à vérifier intégralement la formulation et l'explication.

Chaque question active possède un lien vers le document Drive, son identifiant, un extrait textuel exact, un repère de recherche, la date de revue et l'empreinte du texte consulté. Les documents complets restent privés et ne sont pas copiés dans le dépôt. Le jeu affiche l'extrait après la réponse. Le fichier `coverage-20261106.json` donne les comptes par thème ; `previous-bank-20261106.json` conserve la banque antérieure.

Les formulations ont été relues pour distinguer tradition religieuse, constat archéologique et hypothèse de recherche. Les détails non corroborés dans les sources retenues ont été retirés des anciens énoncés. Les questions sur le qiyās portent sur l'analogie et ne reprennent pas le classement ordinal discuté des sources du droit. Les coquilles de dates et étymologies explicitement incertaines dans certains résumés ne servent pas de réponses.

Les choix ont des formes parallèles et des longueurs proches. Le contrôle de construction bloque une série de choix dont le rapport des longueurs dépasse 2 avec un écart supérieur à 12 caractères. La bonne réponse n'est la plus longue que dans environ 26 % des questions, et ses positions sont équilibrées par thème ; le jeu mélange également les choix à l'affichage. Une relecture humaine de la plausibilité reste nécessaire : ces mesures ne prouvent pas à elles seules la qualité pédagogique.

## Limites de couverture

Le thème Shoah ne compte que trois questions vérifiées sur les commémorations, faute de cours historiques suffisamment documentés retrouvés dans le Drive. Cette limite apparaît dans le jeu. La préhistoire est surtout couverte par les cours sur le Chalcolithique. La banque est plus large, sans prétendre couvrir intégralement le programme officiel. Les autres modes du jeu, notamment les questions de visites guidées, ne sont pas certifiés par cette revue de la banque « חלק א׳ ».

## Vérification

`node tools/build-parta.mjs` valide et reconstruit la banque. La politique `drive-only` refuse les nouvelles questions sans extrait, identifiant Drive cohérent et revue validée. `node tools/audit-parta-drive.mjs /path/to/fetched-texts` vérifie les extraits et les empreintes contre les textes du Drive effectivement récupérés. Ce contrôle de provenance ne remplace pas l'évaluation historique et pédagogique.
