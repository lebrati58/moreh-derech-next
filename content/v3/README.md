# V3 — Zikhron Yaakov → Yokneam (route 67), sans photo, GPS assisté

## Fichiers
| Fichier | Rôle |
|---|---|
| `content/v3/road67_questions.json` | **Données faisant foi** : 14 questions le long du trajet, 4 langues complètes (question, 4 réponses, explication élève, texte micro 20–40 s, anecdote, repère « quand parler », mise en garde), sources, et ce que disent les deux documents de guidage (`docs`). |
| `public/v3/road67-route.json` | Tracé du trajet, routes, vitesses, lieux (point d'ancrage sur la chaussée + zone avant/après), côtés du bus **non vérifiés**, destination Aroma. Public : ne contient ni question ni réponse. |
| `public/gps-engine.js` | Moteur partagé GPS réel / simulateur / tests : map matching, distance le long du trajet, vitesse, ETA, 3 niveaux, pannes, fin avant Aroma. **Aucun accès réseau, aucune publication.** |
| `public/admin-nav.js` | Interface du guide : 🧭 ניווט חכם, 🧪 simulation, 🛰️ enregistrement de trace, carte. |
| `tools/build-v3-sql.mjs` | Validation + génération de `supabase/questions_v3.sql` (refuse un texte hébreu dans FR/EN/RU, une photo, un ordre incohérent…). |

## Itinéraire (vérifié par sources publiques, sans accès OSM direct)
1. **Route 67** vers l'est : échangeur de Zikhron Yaakov (route 2) → carrefour de Fureidis (route 4) → carrefour de Shfeya (route 652) → échangeur de Bat Shlomo → **échangeur d'Ein Tut** (13 km). La route 67 est l'ancien tronçon de la route 70, renumérotée en 2018.
2. **Route 6 vers le nord**, tronçon **gratuit** Ein Tut → Yokneam (ancienne route 70, élargi en 2022) → échangeur d'Elyakim → **échangeur de Yokneam** (route 722). Ne pas continuer sur la route 6 après Yokneam : section payante.
3. Sortie vers Yokneam Illit → **Aroma, G Center, HaTamar 2** (fin du guidage, pas une question).

Coordonnées publiées (Wikipédia hébreu) : Zikhron 32.58861, 34.92694 · Bat Shlomo 32.59828, 35.00458 · Ein Tut 32.61012, 35.04836 · Elyakim 32.63639, 35.06500 · Yokneam 32.65576, 35.09844. Centrale Hagit 32.6172, 35.0431 (GEM/Wikidata).

**Limites honnêtes**
- Les points entre ces échangeurs sont **interpolés** : erreur possible de plusieurs centaines de mètres dans les virages du wadi. Le tracé est donc marqué « משוער » et le couloir de tolérance est large (650 m).
- La position exacte de G Center / du point de dépose de l'autocar est **estimée (±500 m)** : à confirmer.
- **Côté du bus** : quand les deux documents (Yaïr et Yossi) sont d'accord, le côté est affiché tel quel (consigne du guide) ; avec un seul document, le côté est affiché avec sa source.
- ➜ **Faire un trajet de repérage** avec « 🛰️ הקלטת המסלול » (enregistre le vrai tracé et le point exact de chaque lieu), puis « 💾 שמירה כמסלול מאומת » : le GPS passe alors sur la route réelle (couloir 120 m). Pour rendre la trace permanente pour tous les téléphones : « ⬇️ ייצוא GeoJSON » puis l'envoyer pour intégration dans `road67-route.json`, en ajoutant `"side": { "verified": true, "value": "left" | "right" }` pour chaque côté constaté.

## Rythme (mesuré en simulation, mêmes règles que le vrai GPS)
Trajet ≈ 19–21 km. **14 questions** placées le long de la route, toutes principales. À la demande du guide,
la règle « finir avant Aroma » est **désactivée** (`finish.enabled: false` dans `road67-route.json`, réactivable)
et l'écart minimal entre deux questions est de **1 min 30** (`minGapSec: 90`). Le GPS propose toujours la
prochaine question non posée ; une question dont on a dépassé le lieu reste publiable à la main (📌 בחר).
En simulation : ≈ 8 questions à vitesse normale, 10+ si le bus est lent, 6+ s'il est rapide.

## Corrections apportées aux documents de guidage
- « Wadi Milh faisait partie de la Via Maris » → l'un des passages du Carmel ; le grand passage était le Wadi Ara (Nahal Iron).
- « Les Britanniques ont déformé le nom » / « route du sel » : présentés comme traditions, pas comme faits.
- Bat Shlomo : question réécrite sur l'origine du nom (Betty, mère du Baron, fille de Salomon Rothschild) — plus marquante que la date seule.
- Hagit : nouveau nom « David Lévy » et vente de « Hagit Est » non vérifiés → seulement en mise en garde.
- NVIDIA : rachat finalisé le 27/04/2020 (~6,9 Md$) ; bail d'environ 29 000 m² à Yokneam rapporté en 2026 ; campus de Kiryat Tivon = autre lieu ; ne jamais dire qu'on voit les bureaux depuis le car.
- Non repris (non vérifiés) : citation de Bialik sur Shfeya, « moshav d'immigrants européens » à Bat Shlomo, liens de Shfeya avec HaShomer.
