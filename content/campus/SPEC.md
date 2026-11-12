# Banque « אלוף הקורס » — questions tirées du Drive du cours

But : des questions à choix multiple (4 réponses) pour un jeu chronométré en classe (façon Kahoot),
écrites **uniquement à partir des documents du Drive du cours de guides (קורס טיירות)**.

## Règles de contenu (obligatoires)
- Chaque question repose sur un fait **écrit dans un document du Drive** que tu as lu. Rien d'inventé, rien tiré de ta mémoire.
  Si un fait n'est pas dans le document, pas de question.
- En hébreu, clair et court : question ≤ 160 caractères, chaque réponse ≤ 70 caractères (idéalement ≤ 40).
- 4 réponses distinctes, plausibles, du même type (4 dates, 4 lieux, 4 roches…). Une seule juste, sans ambiguïté.
  Pas de « כל התשובות נכונות » / « אף תשובה » / « א׳ וב׳ » (les réponses sont remélangées).
- La réponse ne doit pas se lire dans la question.
- `explanation` : 1–2 phrases en hébreu qui expliquent la bonne réponse, d'après le document.
- `level` : 1 = notion de base que tout élève doit savoir, 2 = détail du cours, 3 = détail pointu.
  Viser environ 35 % / 40 % / 25 %.
- Varier les questions sur tout le document (pas 10 questions sur le même paragraphe). Pas de doublons.
- Si deux documents se contredisent, ne pas faire de question sur ce point.
- Ignorer les documents purement administratifs (horaires, listes d'élèves, tours de rôle, paiements).

## Format de sortie
Un fichier JSON UTF-8 (écrit avec l'outil Write), exactement :

```json
{
  "topic": "geology",
  "he": "גאולוגיה",
  "emoji": "🌋",
  "sources": [
    { "id": "s1", "title": "20260622 שיעור 11 גאולוגיה סלעים משקע.docx", "url": "https://drive.google.com/file/d/…/view" }
  ],
  "questions": [
    {
      "id": "geology-001",
      "level": 1,
      "q": "…?",
      "options": ["…", "…", "…", "…"],
      "correct": 0,
      "explanation": "…",
      "src": "s1"
    }
  ]
}
```
- `correct` = index (0–3) de la bonne réponse dans `options` ; répartir la bonne réponse sur les 4 positions.
- `src` = l'`id` d'une entrée de `sources` (le document où se trouve le fait). `url` = le `viewUrl` donné par Drive.
- Plusieurs thèmes demandés → un fichier par thème.

## Outils Drive
- Lister un dossier : `mcp__Google_Drive__search_files` avec `parentId = '<id>'` (et `excludeContentSnippets: true`), sous-dossiers compris.
- Lire : `mcp__Google_Drive__read_file_content` avec le `fileId`. Les doublons (même titre dans deux dossiers) : n'en lire qu'un.
- Ne rien modifier dans le Drive.

## Vérification avant de finir
Relire chaque question contre le texte du document. Puis lancer :
`node -e "const d=require(process.argv[1]);let e=0;const ids=new Set(d.sources.map(s=>s.id));for(const q of d.questions){if(q.options.length!==4||new Set(q.options).size!==4||!(q.correct>=0&&q.correct<4)||![1,2,3].includes(q.level)||!ids.has(q.src)||q.q.length>160){e++;console.log('BAD',q.id)}}console.log(d.questions.length,'questions',e,'erreurs')" <fichier>`
et corriger jusqu'à 0 erreur.

## Transcripts de סיור (questions du bus retour)
- Source sans lien Drive : `{ "id": "t1", "kind": "transcript", "title": "תמליל סיור – <lieu> (<date>)", "url": "" }`. Une source = un lieu.
- **10 questions maximum par lieu** (le build écarte les suivantes). Choisir les faits essentiels pour l'examen.
- Mêmes règles de contenu : uniquement ce que le guide a dit dans le transcript.
