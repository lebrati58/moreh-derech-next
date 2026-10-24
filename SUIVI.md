# 📋 SUIVI DU PROJET — Moreh Derech NEXT

Journal de bord : où en est le jeu, ce qui a été fait à chaque session, ce qui reste à faire.
**À lire en premier au début de chaque session**, et à mettre à jour à la fin.
Légende : ✅ fait et testé · 🟡 fait, pas encore vérifié en conditions réelles · ⏳ à faire · ⛔ bloqué (action humaine requise)

---

## 1. État actuel du jeu (24 octobre 2026)

| Domaine | État | Détail |
| --- | --- | --- |
| Banque des 22 סיורים | ✅ | 1 343 questions (au moins 20 par niveau dans chacun des 22 סיורים, + 15 pour la route 67), sources Drive liées à chaque question |
| Jeu סיור מודרך / תרגול / סיפורים | ✅ | `guided-tour.html` |
| Carte d'Israël | ✅ | `map.html`, 79 étapes sur 93 placées (Wikipédia/Wikidata) |
| Progression ⭐ / 👑 (« Zelda ») | 🟡 | `progress.js`, sur le téléphone |
| Concours de la classe | ⛔ | `class.html` — exécuter `supabase/class_contest.sql` une fois |
| **Suivi personnel « המסע שלי »** | ✅ test navigateur mobile | `journey.html` (nouveau, voir §2) |
| **Défi du jour ☀️** | ✅ test navigateur mobile | `guided-tour.html?mode=daily` |
| **Révision des erreurs 🔁** | ✅ test navigateur mobile | `guided-tour.html?mode=review` |
| Guide LIVE (micro + bus) | 🟡 | `admin.html` ; seul le parcours 67 est branché sur Supabase |
| Idées / signalements élèves | ⛔ | exécuter `supabase/feedback.sql` une fois |
| Bibliothèque communautaire | ⛔ | exécuter `supabase/community_quizzes.sql` et `community_documents.sql` |
| Langues | 🟡 | accueil en 4 langues ; **les pages de jeu et de suivi sont en hébreu seulement** (questions en hébreu) |

## 2. Journal des sessions

### 24 octobre 2026 — Suivi du joueur + motivation quotidienne
Objectif : rendre le jeu plus motivant et donner un vrai suivi de progression.

- ✅ **`progress.js`** : enregistre l'activité de chaque jour (questions répondues / justes, 120 jours max), calcule la **série de jours joués 🔥**, le **% de réussite**, la liste des **erreurs jamais corrigées**, et le **défi du jour** (5 questions : 2 קל, 2 בינוני, 1 קשה — tirage selon la date, donc **identique pour toute la classe** ; seul le premier essai du jour compte). Tout reste sur le téléphone ; rien de nouveau n'est envoyé au serveur.
- ✅ **`journey.html` « 📈 המסע שלי »** : points, étoiles, série de jours, précision ; carte « אתגר היום » ; carte « N טעויות לתיקון » ; suggestion « הכוכב הבא » (reprendre le niveau commencé) ; graphique des 14 derniers jours ; grille des 22 סיורים × 3 niveaux (★ ou % avancé, un tap ouvre le niveau).
- ✅ **Jeu** : mode `daily` (fin de partie avec grille 🟩🟥, série, bouton 📤 partage WhatsApp) et mode `review` (rejoue uniquement les questions ratées ; corrigée = sort de la liste). En fin de partie normale : bouton « 🔁 לתקן N טעויות ». La pastille en haut affiche maintenant points · ⭐ · 🔥 et mène à « המסע שלי ».
- ✅ **Accueil** : deux nouvelles tuiles (☀️ défi du jour, 📈 mon parcours) avec l'état en direct (résultat du jour, série, erreurs), traduites en 4 langues.
- ✅ Tests : `tests/journey.test.mjs` (4 tests) ; `tests/journey-browser.mjs` (parcours complet sur téléphone 390×844 : accueil → défi → suivi → révision, 16 vérifications OK).
- ℹ️ 3 tests base de données échouaient **déjà avant** cette session (rôles publics, confidentialité LIVE, migration V2) — sur Postgres local ; à examiner séparément.

## 3. À faire / idées (par priorité)

1. ⛔ **Supabase NEXT** : exécuter une fois `class_contest.sql`, `feedback.sql`, `community_quizzes.sql`, `community_documents.sql` (SQL Editor). Sans cela, le classement de la classe et les signalements ne fonctionnent pas.
2. ⏳ Essai réel avec 2–3 élèves sur téléphone (défi du jour + partage WhatsApp) et retour d'expérience.
3. ⏳ Examiner les 3 tests base de données en échec.
4. ⏳ Traduire l'interface des pages de jeu / suivi en FR/EN/RU (les questions elles-mêmes restent en hébreu tant qu'elles ne sont pas traduites et vérifiées).
5. ⏳ Badges thématiques (ex. « 🏛️ maître du Second Temple ») à partir des thèmes des questions — nécessite d'ajouter un champ `topic` vérifié aux questions.
6. ⏳ Étendre LIVE / Solo / Simulation aux 22 סיורים (aujourd'hui : route 67 seulement).
7. ⏳ Placer les 14 étapes manquantes sur la carte (titres Wikipédia à corriger dans `tools/places-sources.json`).

## 4. Comment vérifier rapidement

- Site : https://lebrati58.github.io/moreh-derech-next/ (déployé automatiquement à chaque push sur `main`).
- Sur le téléphone : Accueil → « ☀️ אתגר היום » → répondre aux 5 questions → « 📈 המסע שלי » → « 🔁 טעויות לתיקון ».
- Tests : `npm test` (Postgres local requis pour les tests SQL) ; `CHROME=/chemin/chrome node tests/journey-browser.mjs`.
