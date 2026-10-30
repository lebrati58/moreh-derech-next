# מורה דרך EXAM : audit des documents et choix du prototype (28/10/2026)

## Sources lues (Drive du cours « יובל »)

| Document | Rôle |
|---|---|
| מחברת בחינה ליובל-פורמט.xlsx (`1LUD4_cEMjGCfH0UjcIHgNflJTGg_WDsj`) | Modèle de l'école. Le פרק שני vaut 70 pts et dure 3 h : programme 15 + 5 courtes × 8 + développée 15. Compteurs de mots : 180, vert à partir de 170 ; 400, vert à partir de 380. |
| טופס תיאור נקודת 180 מילים חדש | Texte de 180 mots au plus. Moyens pédagogiques (אמצעים מתודיים) : 20 mots au plus. Indiquer le lieu, la durée, la place du guide et celle du groupe. |
| שיעור 23 — כתיבת נקודה רחבה | Structure en 3 parties : ouverture, ce qu'on voit, conclusion. Passer par 2 ou 3 points sur le site. Guider le groupe d'un point à l'autre. |
| שיעור 26 — כתיבת לוח זמנים | Colonnes du programme, nom officiel, rendez-vous et dispersion, trajets de plus de 30 min, logistique. |
| טיפים להדרכת דרך | Parler de ce qu'on voit au moment où on le voit. Indiquer seulement à droite ou à gauche. « לא לחרטט ». |
| מבחנים משרד התיירות.docx | 13 vrais sujets (2021–2023). Depuis décembre 2021 : 6 interventions courtes. |
| סיור 17 : עין קשתות, מצפה אופיר, תל א-סאקי, קטע 2 (récit du trajet) | Contenu du sud du Golan. |

## Décisions

- **5 interventions courtes** par défaut, sur indication du guide. Le modèle du ministère à 6 interventions reste disponible. Son barème n'a pas été publié, donc le score y est donné en %.
- **Aucune grille officielle (מחוון)** n'a été trouvée, ni dans le Drive ni en ligne. Le score est donc une évaluation pédagogique indicative.
- **Jamais de durée de trajet inventée.** Seules les heures d'ouverture qui figurent dans les documents sont vérifiées.
- **Statut des sites** :
  - **ביקרנו** : עין קשתות, מצפה אופיר, תל סאקי.
  - **מופיע בחומר / טרם אומת** : סוסיתא et כורסי. Ils n'ont pas de document dédié ; la sortie est prévue le 14/12.
- **Contradictions entre documents**, signalées sans être tranchées :
  - lieu de résidence de la famille d'Ofir ;
  - nombre de soldats dans le bunker de תל סאקי (26 ou environ 30) ;
  - qui a décidé de sortir du bunker.
- **Carte** :
  - MapLibre GL JS (gratuit, sans clé), fond OpenFreeMap, relief AWS Terrarium.
  - Plan schématique si la carte ne peut pas se charger.
  - Mapbox écarté (payant) et CesiumJS écarté (trop lourd pour un téléphone).

## Manques

- Le barème de la version à 6 interventions courtes.
- Une confirmation officielle des limites de 400 et de 20 mots, qui ne viennent que du cahier de l'école.
- Les documents sur סוסיתא et כורסי.

## Étape suivante (phase E)

Pour chaque région, ajouter un fichier `public/exam/<région>.json` au même format : sites, routes, missions, réponses modèles, séries d'erreurs et pièges. Il faut aussi activer la carte de la région dans `exam-app.js`.
