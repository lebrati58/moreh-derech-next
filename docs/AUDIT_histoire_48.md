# Audit — « ציר הזמן והחידון » (48 événements)

Date : 27 octobre 2026. Données : `public/history-events.json` (source unique pour la frise **et** le quiz).

## Sources consultées (Drive du cours)

| Document | Utilisation |
| --- | --- |
| `1. שיעורים / טבלת אתרים תאריכון מונחים אישים-1.xlsx` (feuille « תאריכון », Itaï Horowitz, 6.2026, « à vérifier ») | Source principale des dates |
| `5. מאורגן לפי תקופות / 03…09 - תקציר מאורגן` (un document par période) | Bornes des périodes, lien « 📚 לחומרי הקורס » de chaque fiche |
| Sommaires de leçons (Persan, Hasmonéens) et « ציר_זמן ישראל ורומא.png » (frise d'une élève, générée par IA) | Recoupement uniquement |

Les liens de chaque fiche pointent vers le **document précis de la période** (vérifié dans le Drive), plus le dossier des leçons et le תאריכון. Il n'existe pas de document « une leçon = un événement » : aucun lien ne prétend pointer vers une leçon exacte.

## Colonnes du fichier de données

- `source` : `course` = même année dans les documents du cours ; `course-diff` = les documents du cours ne sont pas d'accord entre eux ; `external` = absent des documents consultés, date de référence générale.
- `certainty` : `firm` / `approx` / `disputed`.
- `examReady: false` → l'événement apparaît en **entraînement seulement**, jamais dans l'examen noté (44 événements sur 48 sont dans l'examen).

## Corrections apportées au prototype

| Événement | Prototype | Maintenant | Raison |
| --- | --- | --- | --- |
| Début des travaux d'Hérode au Temple | 20 av. | **19 av.** (≈, 20/19) | תאריכון : « 19 לפנה״ס — בשנת שמונה עשרה למלכותו » |
| Événement n° 48 | 612 « האימפריה הביזנטית » (pas un événement) | **614 — conquête perse de Jérusalem** | Remplacé : une question « quand a eu lieu l'Empire byzantin ? » n'a pas de sens. **À valider par Lionel.** |
| Massada | rattachée à « Rome » | période **romaine tardive** (70–324) | Découpage du cours (dossier 08) |
| Bar Kokhba | « mérد יהודי … ברומא » | « נגד רומא » | Erreur de formulation |
| Antiochus IV (175) | « accession » seule | accession + Jérusalem devient polis | Formulation du תאריכון |
| Toutes les questions | « באיזו שנה התרחש האירוע: X? » | question rédigée pour chaque événement | Ex. « אלכסנדר ינאי » n'était pas une question |

## Formulations prudentes (demandées)

- **Temple, 516** : « 516 (selon d'autres 515) » ; תאריכון : 516, note « selon Eyal Miron : 515 ». Reste dans l'examen, libellé « selon la datation retenue dans le cours ».
- **Esdras, 458** : date du cours (7e année d'Artaxerxès Ier), mais présentée comme **datation traditionnelle**, avec la thèse 398 (Artaxerxès II). **Entraînement seulement.**

## Points restant à vérifier (examReady = false ou divergence)

1. **Bar Kokhba : 131 ou 132 ?** Le תאריכון dit 131 ; le תקציר 08 et la frise de la classe disent 132–135. Hors examen jusqu'à décision.
2. **Aelia Capitolina** : le cours dit « avant/après la révolte », visite d'Hadrien 129–131. L'événement porte sur 135 (fin de la répression). Hors examen.
3. **Crucifixion** : 30 environ (cours : « période de Jésus jusqu'à 30 environ ») ; 33 aussi proposé. Hors examen.
4. **Esdras 458** : voir ci-dessus. Hors examen.
5. **Grande Révolte, 66** : le תאריכון appelle 66 « l'année de préparation » et date la guerre 67–70. La date de 66 (déclenchement) est conservée, avec cette note.
6. **Déclaration de Cyrus** : 538 partout, sauf un résumé de leçon (539).
7. **Début de la période hellénistique** : 333 dans les leçons, 332 ailleurs. **Fin byzantine** : 636 dans les leçons, 638 dans les dossiers.
8. **Dates absentes des documents du cours consultés** (`external`) : Pilate 26, Caracalla 212, dédicace du Saint-Sépulcre 335 (le cours a la visite d'Hélène vers 326), peste de Justinien 542 (541–542), guerre byzantino-perse 602, Héraclius 610 (attention : dans le תאריכון, 610 = première révélation de Mahomet), conquête perse 614.
9. La frise de la classe (`ציר_זמן ישראל ורומא.png`) indique « Gemini Notebook » : elle n'est pas une source d'autorité.

## Illustrations

Les 34 images intégrées au prototype ont été **retirées** : ce sont des vignettes de 188 × 59 px découpées dans la planche de référence, et plusieurs portent des **dates fausses incrustées** (104 au lieu de 103, 135 au lieu de 142, 208 au lieu de 200, 336 au lieu de 335, 389 au lieu de 380, 529 au lieu de 527, 579 au lieu de 565…). La planche `historical_illustrations_reference.png` contient en plus un autre jeu de 48 événements, avec des anachronismes (étoile de David sur une monnaie de Bar Kokhba, « 412 fin de la période byzantine »). Les fiches utilisent l'icône de leur période ; aucun badge « image IA ».
