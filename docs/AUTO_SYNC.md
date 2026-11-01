# 🔄 עדכונים אוטומטיים — synchronisation automatique du Drive

Chaque **mardi à 08:00** (cours du lundi) et chaque **vendredi à 08:00** (סיור du jeudi), heure d'Israël, jusqu'au **31 juillet 2027 inclus**, le jeu lit le Drive de l'école, analyse les documents nouveaux ou modifiés et s'enrichit tout seul. Après le 31/07/2027, plus rien n'est lancé ; tout ce qui a été ajouté reste.

## Comment ça marche

```
Cloudflare Worker (cron 05:00 et 06:00 UTC, garde « 08:00 à Jérusalem »)      bouton « סנכרן עכשיו » (sync.html)
        │                                                                          │  (jeton admin vérifié par Supabase)
        └──────────────► GitHub Actions : .github/workflows/drive-sync.yml ◄──────┘
                              │  1. liste le Drive (API Google, lecture seule)
                              │  2. ne garde que les fichiers nouveaux / modifiés (mémoire : Supabase sync_files)
                              │  3. extrait le texte (Docs, Word, ivrit.ai, PowerPoint, PDF)
                              │  4. Claude (API) : questions 3 niveaux, sites, dates, itinéraire, corrections, contradictions
                              │  5. validation SANS confiance : citation retrouvée mot à mot, chaque nombre présent dans le document,
                              │     doublons écartés, sources faibles (réécriture IA, notes d'élèves) → validation admin
                              │  6. intégration + tests du dépôt → commit sur main → Cloudflare redéploie
                              └► rapport en hébreu (דוח עדכון) dans Supabase → page sync.html
```

- **Heure d'été / d'hiver** : Cloudflare ne connaît que l'UTC. Deux crons (05:00 et 06:00 UTC) ; le Worker ne garde que celui qui tombe à 08:00 à Jérusalem (fuseau `Asia/Jerusalem`, donc juste aussi les semaines de changement d'heure). Règles uniques dans `public/sync-schedule.js`, testées sur toute l'année (`tests/sync.test.mjs`).
- **Filet de sécurité** : si le Worker n'a pas pu lancer la synchronisation, GitHub la relance vers 09:30–10:30 ; elle ne fait rien si celle du jour a déjà réussi.
- **Reprise** : un document en erreur est retenté aux deux synchronisations suivantes (3 essais), puis signalé dans « מסמכים בשגיאה ». Au-delà de 30 documents, le reste passe à la synchronisation suivante. Les appels Google, Claude, Supabase et GitHub sont retentés automatiquement.
- **Pas de réimport** : un fichier déjà analysé n'est relu que si sa version change ; s'il est ré-enregistré sans changement de contenu (même empreinte), il n'est pas réanalysé.
- **Première synchronisation** : les documents antérieurs au 29/10/2026 (déjà couverts par la banque actuelle des 22 סיורים) sont enregistrés sans être analysés. Les premiers documents traités seront donc ceux de **סיור 23 (גשר, נהריים, כינרת)** et **סיור 24 (רמלה)**. Variable GitHub `SYNC_BASELINE_BEFORE` pour changer cette date.

## Où va le contenu

| Contenu | Destination | Modes concernés |
| --- | --- | --- |
| QCM, questions chronologiques et géographiques (3 niveaux) | `public/guided-quiz.json` (ids `A<סיור>-…`, ou `Alessons-…` pour les cours) | Solo, Entraînement, Examen (סיור מודרך), défi du jour, révision des erreurs, carte, « המסע שלי » |
| Questions ouvertes + réponse de référence + points clés | `public/auto/open-questions.json` → page `open.html` | Questions ouvertes avec auto-évaluation |
| Dates (année écrite dans le document) | `public/history-events.json` (ids `drive-…`) | Chronologie + quiz des dates |
| Nouveaux sites visités | `public/siyurim-catalog.json` + `tools/places-sources.json` (titres Wikipédia) → `tools/build-places.mjs` | Carte interactive — **coordonnées toujours lues sur Wikipédia/Wikidata, jamais inventées** |
| Itinéraire « סיפור דרך » | en attente dans sync.html (à construire selon `content/tours/README.md`) | Mode Guide / Bus |
| Corrections d'une question existante, contradictions | en attente dans sync.html — **jamais appliquées automatiquement** | — |

Source de vérité des ajouts : `content/drive-questions/auto/`. **Annuler** une synchronisation (bouton ↶ dans sync.html) retire exactement ses ajouts et régénère les fichiers ; le contenu fait à la main n'est jamais touché ni supprimé.

## Mise en route (une seule fois, ~20 minutes)

### 1. Valider et fusionner la PR
Cloudflare redéploie automatiquement le site avec le Worker.

### 2. Supabase
Supabase → SQL Editor → coller `supabase/auto_sync.sql` → **Run**.

### 3. Clé de synchronisation
Ouvrir `https://moreh-derech-next.lebrati.workers.dev/sync.html` (ou 🔄 dans l'écran admin) → mot de passe admin → **« צור מפתח סנכרון »** → copier la clé (affichée une seule fois).

### 4. Secrets GitHub
GitHub → dépôt `moreh-derech-next` → **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
| --- | --- |
| `SYNC_SECRET` | la clé de l'étape 3 |
| `ANTHROPIC_API_KEY` | console.anthropic.com → **API Keys** → Create Key (prévoir une limite de dépense dans **Billing → Limits**) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | voir 5A — ou les trois secrets de 5B |

Facultatif (onglet **Variables**) : `CLAUDE_MODEL` (par défaut `claude-sonnet-5-5`).

### 5. Accès Google Drive (lecture seule) — une des deux méthodes

**A) Compte de service (recommandé, n'expire pas)**
1. console.cloud.google.com → créer un projet « moreh-derech-sync ».
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **IAM & Admin → Service Accounts → Create** (aucun rôle) → onglet **Keys → Add key → JSON** → le fichier téléchargé = valeur du secret `GOOGLE_SERVICE_ACCOUNT_JSON` (coller tout le contenu).
4. Dans Drive, dossier **« 🏛️ קורס יובל - דרייב חדש 🏛️ »** → Partager → coller l'adresse `…@….iam.gserviceaccount.com` → **Lecteur**, sans notification. Vous êtes éditeur de ce dossier, vous pouvez donc le faire ; le dossier appartient à reemlevy@gmail.com, qui verra ce partage — mieux vaut la prévenir.

**B) Votre propre compte (si vous ne voulez rien partager)**
1. Même projet Google Cloud, Drive API activée. **OAuth consent screen** → External → ajoutez-vous comme utilisateur → **Publish app** (« In production » : sinon l'accès expire après 7 jours).
2. **Credentials → Create OAuth client ID → Desktop app** → secrets `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET`.
3. developers.google.com/oauthplayground → ⚙️ « Use your own OAuth credentials » (mêmes identifiants) → scope `https://www.googleapis.com/auth/drive.readonly` → Authorize (compte lebrati@gmail.com) → **Exchange authorization code for tokens** → le *Refresh token* = secret `GOOGLE_OAUTH_REFRESH_TOKEN`.

### 6. Cloudflare : jeton GitHub (cron + bouton « סנכרן עכשיו »)
1. GitHub → photo de profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** : dépôt `lebrati58/moreh-derech-next` seulement, permission **Actions : Read and write**, expiration **après le 31/07/2027**.
2. Cloudflare → **Workers & Pages → moreh-derech-next → Settings → Variables and Secrets → Add** → type **Secret**, nom `GITHUB_TOKEN`, valeur = le jeton → Deploy.

Vérification : `https://moreh-derech-next.lebrati.workers.dev/api/sync/health` doit afficher `"github":true`.

### 7. Premier essai sans risque
GitHub → **Actions → « עדכונים אוטומטיים » → Run workflow** → mode `tours`, **dry_run coché**. Le rapport (résumé du job + sync.html) montre ce qui serait publié, sans rien modifier. Ensuite : **סנכרן עכשיו** dans sync.html, ou attendre mardi 08:00.

## Réglages dans sync.html
- **השהיית העדכונים המתוזמנים** : met en pause le calendrier (le bouton manuel fonctionne toujours).
- **תצוגה מקדימה** : rien n'est publié sans votre accord ; tout passe par « ממתינים לאישור ».
- Approuver / refuser par lot. Les éléments approuvés sont publiés tout de suite avec **📣 פרסם**, sinon automatiquement à la synchronisation suivante.

## Limites connues (honnêtes)
- **Audio sans transcription** : non analysable. Déposer la transcription ivrit.ai (`.docx`) à côté du MP3 ; elle sera lue à la synchronisation suivante.
- **PDF scannés** : Claude les lit, mais les citations ne peuvent pas être vérifiées mot à mot (pas de texte) → tout part en validation admin.
- **Itinéraires סיפור דרך** : proposés en attente ; la construction du parcours (tracé OSRM, côté gauche/droite) reste l'étape de `content/tours/README.md`, et seul vous passez un parcours à `pret`.
- **Langues** : chaque question porte ses traductions fr/en/ru (`i18n`), mais les pages de jeu restent en hébreu, comme aujourd'hui.
- **אתגר המבחן** (planification d'itinéraire par région) n'est pas alimenté automatiquement : ses régions demandent une modélisation à part.
- Le dépôt est **public** : les questions publiées et leurs courtes citations le sont aussi (comme la banque actuelle). Les éléments en attente, les fichiers suivis et les rapports restent privés dans Supabase.
