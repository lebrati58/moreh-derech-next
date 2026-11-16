# CLAUDE.md — Moreh Derech NEXT (מורה דרך NEXT)

Jeu d'étude pour les élèves du cours de guide touristique israélien (קורס טיירות) de Lionel : 22 סיורים, frise historique, architecture 3D, examens, jeu de campus façon Kahoot, mode « guide dans le bus ». Les camarades de classe sont les premiers utilisateurs. Les questions et l'interface des jeux sont **en hébreu (RTL)**. L'accueil est en 4 langues. Le projet est documenté en français.

**À lire en premier, à chaque session : [`SUIVI.md`](SUIVI.md)** (état, journal des sessions, prochaines étapes). Mets-le à jour en fin de session. Le détail de chaque module est dans `README.md` et `docs/`.

## Stack
- Site **100 % statique** dans `public/` : HTML + JS natif en modules, sans build ni framework. three.js et supabase-js sont copiés localement (`public/vendor/`), pas de CDN.
- **Supabase NEXT** : projet `evvutvnfmbhdxeyzmknv` (« Moreh dereh game »), schéma `mdl` + RPC. Clé publique dans `public/config.js`. Les scripts SQL sont dans `supabase/*.sql`.
  - ⚠️ Ce projet Supabase héberge aussi **ATOUT CLUB** (tables `public.atout_*` et fonction Edge `atout`). N'y touche jamais depuis ici.
- Les outils de construction de contenu sont dans `tools/*.mjs` (`npm run build:*`). Le contenu source est dans `content/`. Les fichiers JSON générés vont dans `public/`.

## Commandes
```bash
npm ci
npm test                       # toute la suite node:test (≈ 25 fichiers)
npm run test:<module>          # ex. test:campus, test:history, test:hadracha, test:parta
npm run dev                    # serveur local : http://localhost:8787
CHROME=/opt/pw-browsers/chromium npm run e2e:<module>   # tests navigateur (S24 + ordinateur)
```
Pour vérifier une interface visuellement, utilise le skill **playwright** du dépôt : `.claude/skills/playwright`, avec le serveur MCP déclaré dans `.mcp.json`.

## Déploiement
- **GitHub Pages** : `.github/workflows/pages.yml` à chaque push sur `main`. Le job `verify` lance tous les tests sur Postgres 17. Si les tests échouent, rien n'est publié. URL : https://lebrati58.github.io/moreh-derech-next/
- **Cloudflare Workers Builds** (`wrangler.jsonc`, publie `public/`) : les builds sont en échec sur toutes les branches, voir `SUIVI.md`. `vercel.json` et `netlify.toml` existent mais ne sont pas la cible principale.
- D'autres workflows tournent sur GitHub (`tours`, `places`, `hadracha`, `campus-realtime`, `world3d-textures`…), parce que l'environnement de travail n'a pas accès à certains sites.

## Règles de travail
- **Aucune question inventée.** Chaque fait doit avoir sa source (document du Drive du cours, page, lien). Si deux documents se contredisent, on écarte le fait. Un contenu généré automatiquement ou par la communauté n'est jamais présenté comme vérifié.
- Les סיורים sont désignés par leur **nom de thème**, jamais par leur numéro.
- **Ne supprime aucune fonctionnalité existante sans la validation de Lionel.** Avant un gros changement, propose d'abord un audit, un plan et les coûts.
- Chaque grosse fonctionnalité va sur **sa propre branche avec une PR**. « **yallah** » veut dire : fusionne la PR dans `main`, puis vérifie le déploiement.
- **Le SQL n'est jamais exécuté en douce.** Si un script `supabase/*.sql` doit être lancé, dis-le clairement et note-le en ⛔ dans `SUIVI.md`.
- Cache mobile : quand un JS ou un CSS change, mets à jour le paramètre de version dans son lien.
- Lionel travaille aussi avec ChatGPT sur ce dépôt. Lis `SUIVI.md` et les PR ouvertes avant de commencer, et ne réécris pas le travail d'un autre agent sans le signaler.
- Ne dis jamais qu'une chose est testée si elle ne l'a pas été. Distingue « testé en navigateur » de « vérifié sur un vrai téléphone ».
- Tout nouveau texte d'interface en hébreu doit être correct et compréhensible par un élève. Les pages de jeu restent en hébreu.
