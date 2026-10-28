# Parcours « סיפור דרך » pour tous les סיורים

La route 67 (`content/v3`, `public/v3/road67-route.json`) est le **modèle de référence**. Le même moteur sert à tous les parcours :
`public/gps-engine.js` (map matching, simulation, GPS réel) + `public/tour-engine.js` (validation, examen, score, correction) + `public/parcours.html` (lecteur).

## Statuts (registre : `content/tours/registry.json`)

| Statut | Sens | Qui le change |
| --- | --- | --- |
| `a_importer` 📥 | dossier détecté dans le Drive, rien d'analysé | `tools/tours-registry.mjs` (automatique) |
| `en_analyse` 🔎 | enregistrements et transcriptions inventoriés et classés | Claude / l'équipe |
| `a_verifier` 🧪 | parcours construit (`NN.src.json`), visible seulement en aperçu (`parcours.html?preview=1`) | Claude / l'équipe |
| `pret` ✅ | vérifié par un humain | **Lionel uniquement**, en mettant `"status": "pret"` et `"published": true` dans le fichier source |

Un parcours n'est montré aux élèves que si **les trois** conditions sont réunies : `status: "pret"`, `published: true` et **aucune erreur bloquante**. Erreurs bloquantes : lieu sans coordonnées sourcées, question sans source, citation de l'enregistrement manquante, bonne réponse invalide, tracé absent. Un brouillon ne compte jamais dans les points.

## Sources d'un parcours : ce qui prouve « ce qu'a dit le prof »

Classement dans `registry.json → transcriptKinds` :
- `verbatim` : transcription brute de l'enregistrement du prof. **Preuve.** (סיור 01, 03)
- `ivrit-docx` : transcription automatique ivrit.ai, en `.docx` à côté du MP3. **Preuve**, après lecture par `node tools/parse-ivrit-docx.mjs fichier.docx` (le Drive les affiche vides : le texte est dans `word/afchunk.mht`). Le locuteur qui parle le plus est en général le guide.
- `edited-transcript` : transcription éditée par un élève (סיור 16). À recouper.
- `ai-edited` : réécriture IA « enrichie » d'une transcription (« הורחב ועובד »). **Ne prouve pas** ce qu'a dit le prof ; utile seulement comme piste.
- `student-notes`, `student-guiding` : notes ou exercice de guidage d'un élève — pas le prof.

Dans les questions, chaque source a une nature : `transcript` (🎙️ citation exacte de l'enregistrement), `course-doc` (📚 document du cours), `external` (🌐 complément extérieur). L'interface les distingue.

## Ajouter un parcours (ex. סיור 03)

1. Lire la transcription `verbatim` ou `ivrit-docx` du trajet en bus.
2. Créer `content/tours/03.src.json` sur le modèle de `01.src.json` :
   - `stops` dans l'ordre du trajet, avec `wiki` (titres Wikipédia, **jamais de coordonnées tapées à la main**), `sideTeacher` + `sideQuote` (la phrase exacte « תסתכלו ימינה… »), `story` (citations exactes) ;
   - `routing.via` : quelques lieux qui forcent le bon itinéraire (OSRM) ;
   - `questions` : `type` `mcq` / `recognize` (reconnaître un paysage depuis le bus) / `error` (trouver l'erreur), `certainty` `firm` / `approx` / `anecdote` / `check` (les deux dernières restent en mode étude), au moins une source `transcript` avec `quote`.
3. Pousser la branche : le workflow **« Parcours סיפור דרך — coordonnées et tracés »** résout les coordonnées (Wikipédia/Wikidata) et le tracé (OSRM), recalcule de quel côté de la route se trouve chaque lieu et signale tout désaccord avec ce que dit le prof, puis commite `public/tours/03.json`.
4. Relire en aperçu : `parcours.html?preview=1#/t/03`. Corriger les avertissements (côté, ordre, lieux à plus de 4 km de la route).
5. Lionel passe `status: "pret"` + `published: true`.

## Nouveaux dossiers dans le Drive

`node tools/tours-registry.mjs liste-dossiers.json` ajoute chaque nouveau dossier « סיור NN … » au statut `a_importer` (jamais plus loin). La liste vient de la recherche Drive (`parentId = '1Oy9J-sALWmaILT-amR1wvrs9RdhykB_f'`). Le registre ne lit pas le Drive lui-même : GitHub Actions n'a pas accès au Drive de l'école.

## Audio sans transcription

Un MP3 ne peut pas être analysé tel quel. Il faut d'abord le transcrire avec le même service que pour les autres סיורים (ivrit.ai), en déposant le `.docx` à côté du MP3 sous le même nom. Le parcours se construit ensuite à partir de cette transcription.
