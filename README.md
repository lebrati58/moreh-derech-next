## 🛣️ Création libre de קטע דרך — sans admin ni code (22 octobre 2026)

- Entrée publique : `public/community.html` ; liée depuis l'accueil `index.html`, `modes.html` et la carte `map.html`.
- Toute personne peut saisir départ et arrivée, générer des questions avec `auto-engine.js` (OSM/Wikipédia/Wikidata), joindre facultativement des notes PDF/Word/TXT, ou créer les questions manuellement. Relecture et édition des quatre choix, de la bonne réponse et des explications avant partage.
- Partage d'une **partie individuelle autonome** par un lien `community.html#route=...` contenant une version compressée du jeu. Aucun mot de passe Supabase, aucune écriture sur le dépôt, pas de compte ni de code manuel. Les parcours déjà créés sont retrouvables localement sur le même navigateur. Ce lien peut être long ; une URL complète n'est pas une simple référence stockée côté serveur.
- **Limite assumée :** cette fonction ne publie **pas** automatiquement le parcours dans le catalogue public officiel des 22 סיורים ni dans le LIVE Supabase, et ne fournit pas de classement collectif/GPS automatique. Une publication mondiale persistante nécessiterait une base publique sécurisée, un anti-spam et un système de contrôle éditorial — ne surtout pas exposer les RPC administrateur.
- La génération automatique dépend de services Internet tiers et des faits disponibles ; une alternative manuelle fonctionne sans authentification. Ne pas présenter un parcours auto-généré comme vérifié.
- Le fichier `public/create.html` reste la création V4 **administrateur** pour les jeux LIVE ; ne pas confondre avec `community.html`.

## 🗺️ Carte d'Israël (22 octobre 2026)

Parcours : **choisir le mode → carte → choisir un סיור → difficulté → jouer**.

- Page : `public/map.html` (Leaflet 1.9.4 + MarkerCluster 1.5.3 copiés dans `public/vendor/leaflet/`, tuiles OpenStreetMap standard (sans clé) assombries en CSS). Recherche, filtres région/thème, vue Carte / Liste, regroupement des pins, fiche coulissante, bouton retour du téléphone qui ferme la fiche.
- Données : `public/places.json`, **généré** par `tools/build-places.mjs` à partir de `tools/places-sources.json` (titre Wikipédia de chaque étape). Les coordonnées viennent de l'API Wikipédia (Wikidata P625), avec titre, lien et identifiant Wikidata pour vérification. **79 étapes sur 93** sont placées ; les 14 autres (noms génériques comme « כנסיות », lieux ambigus, articles sans coordonnées) ne sont **pas** placées et la fiche le dit. Chaque étape est un point distinct : aucun « centre de circuit » n'est présenté comme un site.
- Régénérer : Actions → « Coordonnées de la carte (Wikipédia) » → Run workflow, ou `npm run build:places` sur une machine avec Internet. Pour corriger un point : changer le titre Wikipédia dans `tools/places-sources.json`.
- Résumés d'étapes : 2 phrases de Wikipédia en hébreu, attribuées (CC BY-SA). Les faits de cours viennent des explications de `guided-quiz.json`, avec leur lien source.
- Ce que fait chaque mode depuis la carte :
  - 🧭 סיור מודרך / 🎮 תרגול / 📖 סיפורים : disponibles pour les 22 סיורים et le parcours 67.
  - 🎤 Guide LIVE, 🚗 Solo et 🧪 Simulation : **seul le parcours 67 (banque V3 Supabase, GPS)** les supporte aujourd'hui. Pour les 22 סיורים, la fiche l'explique et propose les fiches de préparation ou l'entraînement. Le lien direct « 🎤 ישר למסך המדריך » reste sur l'accueil.
- Tests : `npm run test:map` (données, sans base) et `npm run e2e:map` (parcours complet sur téléphone simulé 390×844, captures dans `screens-map/`).


## 🎓 Banque des 22 סיורים — Google Drive (22 octobre 2026)

- 22 dossiers numérotés dans `2. סיורים` du dossier de cours : [ouvrir dans Drive](https://drive.google.com/drive/folders/1Oy9J-sALWmaILT-amR1wvrs9RdhykB_f).
- Catalogue complet : `public/siyurim-catalog.json`. Les arrêts listés viennent des dossiers/fichiers ; ils ne garantissent pas la visite de tous les arrêts.
- Jeu `public/guided-tour.html` : banque QCM sourcée `public/guided-quiz.json`, 3 difficultés. **Les pages calculent les totaux depuis ce fichier** (`public/tour-data.js`) : aucun nombre n'est codé en dur.
- Pour chaque circuit, le jeu montre **uniquement les questions vérifiées dont il dispose** : parfois 3, parfois 6, et davantage pour les tours 02/03/22. **20 questions au moins par niveau sont garanties seulement pour « Tous les circuits »**, pas pour chaque dossier individuel.
- `22 – קמפוס גליל עליון` contient à cette date une **חוברת הכנה**, ce qui ne confirme pas à lui seul une visite terminée.
- Source : notes de cours et fiches d'étudiants, non expertisées indépendamment ; corriger les faits controversés avant usage professionnel.
- Les modes Tour guidé/Quiz sont locaux et ne publient rien au serveur LIVE. L'ancien projet n'est pas modifié.

# 🚌 Moreh Derech NEXT — Game Edition

**Une nouvelle interface mobile, indépendante au niveau du code**, pour le quiz de guidage sur les routes d'Israël.

## 🎮 Les 4 modes

| Mode | URL | Fonction |
| --- | --- | --- |
| Accueil Arcade | `index.html` | Choisir son mode en hébreu, français, anglais ou russe — chaque mode ouvre la carte |
| 🗺️ Carte d'Israël | `map.html?mode=…` | Choisir un סיור sur la carte, sa difficulté, puis jouer dans le mode choisi |
| 🎤 Guide | `admin.html?mode=guide` | Lire les fiches au micro du bus, GPS assisté, publier manuellement les questions |
| 🚗 Solo | `solo.html` | Questions déclenchées sur le téléphone du passager selon le GPS |
| 📖 Anecdotes | `anecdotes.html` | Lire 14 fiches de la route 67, sans score ni chrono, en 4 langues |
| 🧪 Simulation | `admin.html?mode=simulation` | Simuler les trajets et les pannes GPS sans publier aux élèves |
| 👥 Élèves | `play.html` | Page dédiée aux participants du jeu LIVE |
| 🧭 סיור מודרך | `guided-tour.html?tour=04&level=1&mode=tour` | Étapes du circuit, quiz (`mode=quiz`) ou lecture sans questions (`mode=stories`) ; entraînement local |
| ✨ Création | `create.html` | Nouveau parcours et relecture des questions |

L'écran principal (`index.html`) est le menu de jeu. **Le lien élèves à partager en bus est maintenant `play.html`**, pas l'accueil.

### 🛡️ Isolation et précautions

- Ce dépôt est une copie **du code** de `moreh-dereh-live`, destinée à être modifiée indépendamment.
- **Base séparée :** `public/config.js` pointe désormais vers le projet Supabase indépendant de NEXT (`evvutvnfmbhdxeyzmknv`). L'ancien jeu utilise un autre projet (`xonvxicfamjzezsmboan`). Les banques V1, V2 et V3 ont été installées dans NEXT. Définir un mot de passe administrateur NEXT distinct et tester les RPC avant une partie réelle.
- Le GPS du mode Guide ne publie aucune question automatiquement. La Simulation n'envoie aucune question.
- Pas d'API payante requise pour les parcours basés sur les services cartographiques publics.
- Anecdotes : `public/anecdotes.json` est un fichier **public** construit à partir des fiches V3. Ne jamais y ajouter de notes privées.
- Le mode « avec micro » signifie que le guide lit un texte dans le microphone **du bus** ; l'application n'a pas besoin d'accéder au micro du téléphone.


### 🧭 Banque de révision des סיורים

- Banque publique : `public/guided-quiz.json`. Chaque question porte un `tourId` (`01`–`22` ou `road67`). Le premier lot était de 60 questions ; le total actuel est celui du fichier.
- Interface : `public/guided-tour.html`, sélecteur de difficulté en haut, filtre par circuit, modes סיור מודרך (par étapes) / entraînement / lecture, sources consultables.
- Document lisible du premier lot de 60 questions : `docs/guided-tour-60-questions.md` et [Google Doc](https://docs.google.com/document/d/1wftSSyA-eiLSadoxXMsJmsnqWjlUQrHsqtGSrpwK614/edit).
- Sources : comptes rendus תל ערד/תל באר שבע, הכרמל וחוף, route 67 זכרון–יקנעם, et **חוברת הכנה** גליל עליון (support de préparation, pas une preuve de sortie effectuée).
- Ce module est un entraînement individuel statique, **pas encore la publication multi-joueurs via Supabase**. Les erreurs possibles des notes de cours doivent être vérifiées par le guide avant présentation publique.

### 🚀 Déploiement

GitHub Pages : **Settings → Pages → Source = GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie `public/` lors des pushs sur `main`. L'existence du workflow ne prouve pas que GitHub Pages soit déjà activé.

Site attendu une fois Pages activé : `https://lebrati58.github.io/moreh-derech-next/`.

### 🧪 Vérifications

Les liens de navigation ont été inspectés ; les quatre modes partagent les fichiers JS originaux. Aucun essai réel sur bus/téléphone ni validation du déploiement Pages n'a encore été effectué. Vérifier le guide en simulation et tester le lien `play.html` avant une utilisation avec les élèves.

---

## Documentation historique du projet d'origine

# מורה דרך LIVE

Quiz en direct pour un guidage en bus. Trois parcours indépendants : **V1** (cours, 34 questions),
**V2** (parcours photographié, 6+2), **V3** (Zikhron Yaakov → Yokneam par la route 67, 14 questions, GPS assisté, sans photo).
Le guide publie chaque question **à la main**, au moment où le paysage s'y prête ; les élèves
répondent depuis leur téléphone. Interface entièrement en hébreu (RTL), pensée pour le mobile.

- **Lien élèves** : `https://<hébergement>/` — un seul lien à envoyer sur WhatsApp. Écran en hébreu par défaut :
  langue (🇮🇱 🇫🇷 🇬🇧 🇷🇺) + prénom → « מתחילים לשחק 🚀 ». Rien d'autre (ni compte, ni code, ni téléphone).
- **Lien guide** : `https://<hébergement>/admin.html` — protégé par mot de passe.

---

## Architecture

```
Téléphones (page élève ~11 Ko compressée)  ──HTTPS──►  Supabase (PostgreSQL)
  index.html  (élèves)                              schéma privé "mdl" : tables
  admin.html  (guide)                               fonctions public.* : seule API autorisée
```

- **Front-end** : HTML/CSS/JS sans framework ni étape de build. Chargement très léger en 4G,
  hébergeable n'importe où (GitHub Pages, Netlify, Vercel).
- **Back-end** : uniquement des fonctions PostgreSQL (`supabase/schema.sql`) appelées en RPC.
  Toutes les règles du jeu (états, heure de réception, points, classement) s'exécutent dans la base.
- **Temps réel** : chaque téléphone interroge l'état toutes les 1,5 s. Le serveur renvoie une
  réponse minuscule (~60 octets) tant que rien ne change (numéro de version). Ce choix, plutôt
  que des WebSockets, est volontaire : dans un bus le réseau coupe sans cesse, et une requête
  simple se rétablit toute seule, sans gestion de reconnexion fragile. Délai d'apparition
  mesuré : 1 à 2 s. Charge : 60 téléphones ≈ 40 petites requêtes/s, très en dessous des limites
  du plan gratuit Supabase. Volume : ≈ 3 Mo par heure et par téléphone au maximum.

## Règles de score

| | |
|---|---|
| Bonne réponse | `base` (100 par défaut) + bonus de rapidité |
| Bonus | `max_bonus` (100) si la réponse arrive dans le **temps de grâce** (1,5 s), puis décroît **linéairement** jusqu'à 0 à la fin de la fenêtre (durée de la question si elle en a une, sinon 20 s) |
| Mauvaise réponse / pas de réponse | 0 |

Formule (fonction `mdl.calc_points`, déterministe) :
`bonus = round(max_bonus × max(0, 1 − (t − grâce) / (fenêtre − grâce)))`, avec `t` = temps
écoulé mesuré **par le serveur** entre la publication et la réception. Le téléphone n'envoie
que le numéro de la réponse choisie : aucune durée ni aucun score venant du client n'est utilisé.
Tous les paramètres sont réglables dans l'onglet « הגדרות ».

**Les points ne sont visibles qu'après la révélation** (sinon un élève verrait son score monter
et devinerait la bonne réponse).

**Départage (stable)** : score ↓, puis nombre de bonnes réponses ↓, puis temps cumulé des bonnes
réponses ↑, puis ordre d'arrivée dans le jeu ↑.

### Limites d'équité liées au réseau
L'heure retenue est celle où la réponse **arrive au serveur**. Deux effets jouent :
1. un élève reçoit la question jusqu'à ~1,5 s après un autre (intervalle de lecture) ;
2. sa réponse met 0,1 à 1 s (parfois plus en 4G faible) à arriver.

Le **temps de grâce** de 1,5 s neutralise l'essentiel de ces écarts : tous ceux qui répondent
très vite obtiennent le bonus maximal. Au-delà, un élève avec un mauvais réseau peut perdre
quelques points (≈ 5 points par seconde de retard avec les réglages par défaut) — jamais la
base de 100. Les questions avec durée maximale acceptent encore 1,5 s après l'échéance (marge réseau).

## Sécurité
- Tables dans un schéma privé : la clé publique ne peut ni les lire ni les modifier.
- Bonne réponse et explication jamais envoyées aux élèves avant la révélation.
- Mot de passe admin haché (sha256 + sel) dans la base ; jamais dans le code ni le dépôt.
  10 échecs en 15 min bloquent la connexion. Session admin valable 14 h.
- Une seule réponse par élève et par question (clé primaire en base, résiste aux envois simultanés).
- Élèves : un jeton aléatoire (UUID, jamais affiché) stocké sur le téléphone = reconnexion automatique
  (rechargement, changement de langue, coupure réseau) ; impossible de reprendre la session d'un autre
  en tapant son prénom. **Prénoms identiques acceptés** (identifiants internes distincts ; le classement
  affiche « David », « David (2) »…). L'ancien code à 4 chiffres n'est plus affiché (accepté côté serveur
  pour compatibilité, 8 essais max). Noms nettoyés, 24 caractères max, 300 joueurs max par partie.
- La « clé anon/publishable » de Supabase dans `config.js` est **publique par conception**.

---

## Installation (une seule fois, ~10 min)

### 1. Supabase
1. Créer un projet gratuit sur https://supabase.com (région conseillée : Frankfurt).
2. *SQL Editor* → coller et exécuter `supabase/schema.sql`.
3. (Optionnel) exécuter `supabase/seed_demo.sql` : 4 questions **de démonstration non validées**.
4. Définir le mot de passe du guide (dans le SQL Editor, jamais dans le code) :
   ```sql
   select mdl.set_admin_password('votre-mot-de-passe-solide');
   ```
5. *Project Settings → API* : copier la **Project URL** et la clé **anon / publishable**.

### 2. Configuration
Remplir `public/config.js` avec l'URL et la clé publique.

### 3. Hébergement (au choix)
- **GitHub Pages** (dépôt public, ou compte GitHub Pro) : *Settings → Pages → Source : GitHub Actions*.
  Le workflow `.github/workflows/pages.yml` publie le dossier `public/` à chaque push.
- **Netlify / Vercel** (dépôt privé possible, gratuit) : importer le dépôt, rien à configurer
  (`netlify.toml` / `vercel.json` indiquent le dossier `public/`).

⚠️ Le plan gratuit Supabase **met en pause un projet inactif 7 jours**. Ouvrir la page admin
la veille et le matin du voyage suffit à le garder actif.

## Le jour J
1. La veille : préparer les ~30 questions (onglet « שאלות »), vérifier les réponses, ordonner selon l'itinéraire.
2. Faire une partie test avec 2-3 téléphones.
3. Avant le départ : « הגדרות » → **משחק חדש** (remet les joueurs et scores à zéro, garde les questions).
4. Envoyer le lien élèves sur WhatsApp (bouton dans « הגדרות »).
5. En route : **פרסם שאלה** → **סגור שאלה** → **חשוף תשובה** → question suivante. On peut
   choisir n'importe quelle question restante, ou en modifier une juste avant (« שמירה ופרסום מיד »).
6. À la fin : **סיום המשחק** → podium « הזוכים הגדולים! » chez tout le monde, puis **ייצוא** (CSV pour Excel).

---

## Banque de questions du trajet et fiches micro

`content/` contient les **34 questions du trajet Zikhron Ya'akov → Haïfa** (route côtière, sans
tunnels), dans l'ordre géographique, avec pour chacune une **fiche de guidage privée** :

- 🎤 **הסבר קצר** (~20–30 s) et **סיפור מורחב** (~1–2 min), prêts à lire au micro ;
- 💡 **הידעת?** ; 📍 **מתי להציג** (moment du trajet, côté du bus) ;
- un indicateur de **visibilité** : 👁️ vu depuis le bus (d'après le « סיפור דרך » du cours) ·
  ❓ à confirmer lors d'un repérage · 📍 site proche non visible · 💡 sujet général ;
- 🧭 informations pratiques des sites de visite (uniquement ce qui a été vérifié, sinon « à vérifier ») ;
- 📚 sources consultables (cours Drive + sources publiques).

Les fiches ne sont **jamais** copiées dans les données envoyées aux élèves (test automatique).
Dans l'admin, le panneau « ההדרכה שלי למיקרופון » s'ouvre automatiquement à la révélation :
court/long, A+/A−, plein écran, défilement, « המשך לשאלה הבאה ». Il reste consultable hors ligne
(copie locale + service worker).

Modifier le contenu : éditer `content/*.mjs`, puis `npm run build:sql` (régénère
`supabase/questions_route.sql` et `supabase/install.sql`), puis réexécuter `install.sql`.
⚠️ Réexécuter le fichier écrase les modifications faites dans l'admin sur ces 34 questions.
Les fiches se modifient aussi directement dans l'admin (✏️ → section 🎤).

Corrections apportées aux questions d'origine : Q20 (Garrod a commencé en **1929**, pas 1927) ;
Q32 reformulée (« que trouve-t-on dans la grotte du Tabun ? ») pour ne pas répéter la réponse de Q19 ;
Q5 option « מערב » remplacée par « משני הצדדים » (« ouest » était ambigu).

## V2 — « מסלול התמונות — הלוך » (parcours photographié, 4 langues)

Deux **banques de questions indépendantes**, jamais mélangées :

| Banque | Contenu |
|---|---|
| **V1 — קורס** | les 34 questions du trajet (inchangées) |
| **V2 — מסלול התמונות — הלוך** | **6 questions principales** dans l'ordre du trajet + **2 questions de remplacement** (désactivées par défaut), en hébreu / français / anglais / russe, et **32 fiches photo** |

- **Choix de la version** : uniquement en créant une partie (⚙️ הגדרות → « משחק חדש » → V1 ou V2).
  Impossible de changer de banque en cours de partie ; le serveur refuse de publier une question
  d'une autre banque (`wrong_bank`). Les parties, joueurs et réponses précédents sont conservés.
- **Questions de remplacement** : tiroir « 🔁 שאלות חלופיות » sous la question suivante ; il faut
  les activer pour la partie en cours avant de pouvoir les publier (`spare_disabled` sinon).
- **Aucune publication automatique** : les heures des photos (11:04 → 11:19, le 18/10/2026) sont
  des repères de lieu **indicatifs** (captures d'écran, pas de GPS EXIF), jamais des horaires.
  Une question n'apparaît que si le guide appuie sur « 📣 פרסם שאלה ».

### Temps de réponse
- **Minimum 30 s réelles**, comptées par le serveur depuis la publication : `admin_close_question`,
  `admin_reveal` et `admin_finish` renvoient `too_early` avant ce délai. Dans l'admin, le bouton
  « סגור שאלה » est verrouillé avec un compte à rebours. Seule une **« סגירת חירום »** (confirmation,
  `p_force`) permet de fermer avant ; elle est tracée (`forced_close`, visible dans l'export).
- **45 s par défaut** en V2 (réglable, jamais sous le minimum ; le minimum lui-même est réglable ≥ 30 s).
- Après la révélation, le panneau micro s'ouvre ; un chronomètre « מאז החשיפה » aide à tenir
  **20–40 s** de mini-guidage, et « מאז פרסום השאלה הקודמת » rappelle l'objectif de **≥ 2 min**
  entre deux questions. Ce sont des repères : le passage à la suivante reste entièrement manuel.

### Élèves : 4 langues
- Au premier passage, l'élève **choisit sa langue** (עברית / Français / English / Русский), puis
  tape son nom. Bouton 🌐 en haut pour changer à tout moment — **même joueur, mêmes points**.
- Hébreu en RTL, français/anglais/russe en LTR. Les noms restent tels que tapés.
- **Une seule partie** pour toutes les langues : même identifiant de question, même ordre des
  réponses (donc même bonne réponse), même chrono, même calcul des points, même classement.
  Le serveur envoie à chaque élève le texte dans sa langue (traductions déjà dans les données,
  aucune traduction automatique). Les questions V1, non traduites, s'affichent en hébreu avec une
  mention « disponible en hébreu seulement ».

### Admin
- Sélecteur **עב / FR / EN / RU** pour lire les questions, les scripts micro et les anecdotes
  (hébreu par défaut).
- Pour chaque question V2 : photo de repérage, heure indicative, secteur, côté du bus (avec degré
  de certitude), avertissement de prudence, bonne réponse, explication, **🎤 מה להגיד באוטובוס**
  (20–40 s) et anecdotes des photos liées derrière « ℹ️ מידע נוסף ».
- Onglet **📷 מסלול** : galerie / timeline des 32 photos dans l'ordre. On avance de photo en
  photo **sans rien envoyer aux élèves** ; chaque fiche a son numéro, sa miniature, son heure
  indicative, son côté, sa fiabilité et son anecdote (bouton « מידע נוסף »). 23 photos sur 32 ne
  sont liées à aucune question (fiches d'information seulement). Les repères facultatifs de la note
  WhatsApp du guide y sont listés comme **non vérifiés** (`content/v2/reperes_whatsapp_et_securite.md`).
- **Retour** : la base prévoit des collections séparées (`mdl.route_collections`) ; un futur
  `RETOUR_V2` s'ajoutera sans toucher à l'aller. Aucune photo du retour n'a été inventée.

### Confidentialité
- Scripts micro, anecdotes, métadonnées de trajet et photos liées ne sont lus **que** par des RPC
  admin protégées par jeton (`admin_state`, `admin_photos`). Les tables restent dans le schéma privé.
- Les traductions copiées dans la question publiée passent par une **liste blanche** (`mdl.pub_i18n` :
  texte, réponses, explication, catégorie) ; `get_state` ne renvoie ni bonne réponse ni explication
  avant la révélation, dans aucune langue (tests automatiques).
- Photos : seules des **versions recadrées** (photo seule, sans la barre d'infos du téléphone, le
  modèle, le chemin de fichier ni la mini-carte) sont publiées dans `public/photos/aller-v2/`
  (+ miniatures `thumbs/`, ~ 2,7 Mo au total, chargement différé). Les captures d'origine ne sont
  **pas** dans le dépôt. Ces images restent des fichiers statiques publics (URL devinable) : elles ne
  contiennent que du paysage, aucune réponse écrite — à l'exception du panneau d'Atlit (photo 25).

### Mettre à jour une installation existante (Supabase)
1. *SQL Editor* → coller et exécuter **`supabase/migration_v2.sql`** (schéma + banque V2).
   Ré-exécutable ; ne supprime rien ; **ne réimporte pas la V1** (vos modifications des 34 questions
   faites dans l'admin sont conservées) ; parties, joueurs et réponses existants deviennent « V1 ».
2. Déployer le dossier `public/` (push sur `main` si GitHub Pages ; photos incluses).
3. Dans l'admin : ⚙️ → « משחק חדש » → **V2** → partie test avec 2–3 téléphones en langues différentes.
4. Vérifier **sur place** les réponses, les côtés du bus et la visibilité avant la vraie partie.

Nouvelle installation : `supabase/install.sql` contient tout (schéma + V1 + V2).
Modifier le contenu V2 : éditer `content/v2/*.json`, puis `npm run build:sql` (le générateur
refuse des données incohérentes : 6 MAIN + 2 SPARE, 4 langues complètes, 4 réponses, 32 photos…).

## V3 — זכרון יעקב → יקנעם, כביש 67 (GPS assisté, sans photo)

Détails, sources, limites et corrections : **`content/v3/README.md`**.

- **Choix du parcours** : ⚙️ הגדרות → 🔄 משחק חדש → V1 / V2 / V3 (chaque nouvelle partie a son score et son
  classement ; l'historique est conservé ; une V4 s'ajoute par une ligne dans `mdl.question_banks` + sa banque).
- **🧭 ניווט חכם — כביש 67** (onglet שידור חי) : « 📍 הפעל GPS » → le téléphone du guide suit le trajet et annonce le
  prochain lieu : 🟡 בקרוב (~90 s avant), 🟠 מתקרבים (~45–55 s, question + réponse + texte micro), 🟢 עכשיו.
  Distance et temps calculés **le long du trajet**, avec la vitesse réelle. Le GPS **ne publie jamais** : seul
  « 📣 פרסם שאלה » envoie la question. ⏭️ דלג, ⏮️ חזרה, 📌 choix manuel dans la liste ; si le GPS est refusé,
  imprécis, ancien, perdu, hors trajet ou à contresens → « ⚠️ … עבור למצב ידני », le jeu continue.
- **Fin avant Aroma** : plus aucune question si l'arrivée est à moins de ~2 min 50 ; NVIDIA / Mellanox toujours en
  dernier ; ensuite « 🏁 סיום ההדרכה — מתקרבים לארומה יקנעם » avec le texte de conclusion.
- **Ne bouscule pas le guide** : aucune alerte pressante pendant une question ouverte, pendant les 40 s de micro
  après la révélation, ni moins de 2 min après la question précédente.
- **Confidentialité** : la position reste sur le téléphone du guide (aucun envoi au serveur, aucun historique).
- **🧪 סימולציית נסיעה** (onglet 🗺️ מסלול, ou ⚙️ הגדרות) : bus virtuel sur le même moteur, ▶️ ⏸️ ⏩ ⏮️, pannes
  (GPS imprécis/perdu/ancien, contresens, route parallèle, lieu manqué, arrivée trop rapide). **N'envoie rien
  aux élèves**, ne touche pas à la partie en cours.
- **🛰️ הקלטת המסלול** : enregistre le vrai tracé lors d'un trajet de repérage et le point exact de chaque lieu ;
  « 💾 שמירה כמסלול מאומת » remplace le tracé estimé sur ce téléphone ; export / import GPX ou GeoJSON.
- ⚠️ Le tracé fourni est **estimé** à partir des coordonnées publiées des échangeurs et **aucun côté du bus n'est
  vérifié** : l'écran le dit (« ⚠️ צד האוטובוס לא אומת — לא להצביע »). Faire le trajet de repérage avant le jour J.
- ⚠️ Un navigateur peut suspendre le GPS si l'écran est verrouillé ou l'onglet en arrière-plan : garder l'écran
  allumé (l'admin le demande au navigateur quand c'est possible).

### Mettre à jour la base de production (Supabase) — à faire une fois, avec votre accord
1. *SQL Editor* → coller et exécuter **`supabase/migration_v3.sql`**. Ré-exécutable ; ne supprime rien ; ne touche ni
   à V1 ni à V2 (questions et photos) ni aux parties, joueurs et réponses ; ne réécrit pas une question V3 modifiée
   dans l'admin ; autorise les prénoms identiques (sessions existantes conservées).
   *(Base neuve : `supabase/install.sql` contient tout.)*
2. Publier le dossier `public/` (fusion sur `main` → GitHub Pages).
3. Admin → ⚙️ → 🧪 סימולציה, puis 🔄 משחק חדש → V3 et partie test avec 2–3 téléphones en langues différentes.

## V4 — parcours automatique (départ + arrivée seulement)

Page **`create.html`** (lien « ✨ מסלול חדש אוטומטי » dans ⚙️) : on tape un départ et une arrivée,
la page construit tout, **gratuitement et sans clé** :

1. adresses → coordonnées : **Nominatim** (OpenStreetMap) — on peut aussi taper « lat, lon » ;
2. trajet routier : **OSRM** (serveur public d'OpenStreetMap) ;
3. lieux à moins de 1,5 km de la route : **Wikipédia** (recherche géographique, hébreu puis anglais) ;
4. faits : **Wikidata** (date de fondation, « nommé d'après », type de lieu, population) et noms en 4 langues ;
5. phrase micro et « עוד לספר » : début de l'article Wikipédia de chaque langue ;
6. questions à 4 réponses fabriquées à partir de ces faits (aucune IA, rien d'inventé ; une question
   dont la réponse est dans le nom du lieu est écartée), rangées dans l'ordre du trajet ;
7. **relecture** : le guide décoche ce qui ne convient pas ;
8. enregistrement : `admin_import_route` crée une **nouvelle banque** (code `A` + date, tracé dans
   `question_banks.route`) puis une nouvelle partie. Rien n'est écrasé ; V1/V2/V3 ne bougent pas.

Le jeu est le même que la V3 (mode bus, 🟡🟠🟢, publication manuelle), sur le tracé généré.
Mise à jour de la base : exécuter `supabase/schema.sql` (rejouable).
Limites : services publics gratuits (usage léger) ; qualité = celle de Wikipédia/Wikidata ;
questions plus « factuelles » que celles écrites à la main. Moteur : `public/auto-engine.js`,
tests : `tests/v4.test.mjs` et `tests/v4-browser.mjs` (services simulés avec des données d'exemple).

## Mode solo — chacun avec son GPS, sans admin (`solo.html`)

Lien « 🚗 משחק עצמאי » sur l'accueil élève. Deux façons d'avoir un parcours :
- **le générer sur le téléphone** : départ = ma position (ou un lieu tapé), arrivée tapée → même moteur que la V4 ;
- **un lien partagé** `solo.html?r=CODE` : le créateur coche « 🚗 גם משחק עצמאי » dans `create.html`
  (ou ⚙️ → « קישור למשחק עצמאי »). `admin_set_solo` l'autorise, `solo_route` le lit. Jamais par défaut :
  le lien révèle les questions ET les réponses.

Pendant le trajet, le GPS du téléphone fait avancer le jeu : la question s'ouvre seule (vibration) en
arrivant dans la zone du lieu, 45 s, score = mêmes règles (100 + bonus de vitesse jusqu'à 100). Liste des
questions pour répondre à la main si le GPS est imprécis. Écran de fin + partage WhatsApp.
**La position, les réponses et le score restent dans le téléphone** (localStorage) : rien n'est envoyé.
« 🧪 ניסיון בבית » : simulation du trajet pour essayer chez soi. Avertissement : passagers seulement.
Pas de classement commun (pas d'arbitre) : pour un groupe, garder le jeu avec guide.

### Document facultatif (solo et création)
On peut ajouter un Word (.docx), un PDF ou un texte. Il est lu **dans le téléphone** (`public/doc-reader.js` :
.docx ouvert avec le décompresseur natif, PDF avec pdf.js embarqué dans `public/vendor/pdfjs`, Apache-2.0).
`MDL_AUTO.applyDoc` cherche le nom de chaque lieu du parcours dans le document : ses phrases deviennent le
texte « 🎤 », et une phrase qui contient une année devient une question « השלימו את השנה » (aucune IA,
phrases recopiées telles quelles). Sans document, rien ne change.

## Développement et tests

Prérequis : Node 18+, PostgreSQL local (port 5433, socket `/var/tmp` par défaut ; variables
`PGHOST` / `PGPORT` sinon), Chromium pour les tests navigateur (`CHROME=/chemin/chrome`).

```bash
npm install
npm test                    # 43 tests : logique serveur, fiches, V1, V2, V3 (banques, 45/30 s, 4 langues, homonymes,
                            #   confidentialité, migrations rejouables) + moteur GPS (map matching, alertes, pannes,
                            #   simulation complète à 3 vitesses, fin avant Aroma)

# serveur local qui imite l'API Supabase (rôle "anon" compris)
createdb mdl_dev && psql -d mdl_dev -f supabase/schema.sql -f supabase/seed_demo.sql \
  -c "select mdl.set_admin_password('guide-test-2026')"
npm run dev                 # http://localhost:8787  et  /admin.html
npm run scenario            # scénario 35 élèves (32 clients HTTP + 3 vrais navigateurs)
npm run screens:v2 -- <dossier>   # parcours V2 complet dans 4 navigateurs + captures
npm run e2e:v3 -- <dossier>       # parcours V3 complet (élèves 4 langues, homonymes, GPS réel/refusé, simulation)
```

Le scénario vérifie : arrivée de 35 élèves, publication d'une question de géologie, apparition
sans rafraîchir, réponses à vitesses variées, calcul serveur, compteur admin, doubles soumissions
simultanées, réponse après fermeture, révélation + explication, classement, perte de réseau et
reconnexion avec score conservé, retour depuis un autre navigateur (nom + code), rechargement de
page, fin de partie et podium.

## Fichiers
```
public/index.html      interface élève (משתתף)
public/admin.html      interface guide (מנהל המשחק)
public/style.css       thème visuel
public/api.js          client RPC minimal
public/config.js       URL + clé publique Supabase
supabase/schema.sql    tables, règles du jeu, API sécurisée
supabase/seed_demo.sql questions de démonstration (non validées)
supabase/migration_v2.sql  mise à jour V2 d'une base existante (généré)
supabase/questions_v2.sql  import V2 seul (généré)
content/v2/            données V2 faisant foi (questions 4 langues, 32 anecdotes, repères du guide)
content/v3/            données V3 faisant foi (questions 4 langues, textes micro, sources) + README V3
public/v3/road67-route.json  tracé, lieux, routes, destination (V3)
public/gps-engine.js   moteur GPS (réel + simulation + tests)
public/admin-nav.js    navigation du guide V3 (GPS, simulation, enregistrement, carte)
supabase/migration_v3.sql  mise à jour V3 d'une base existante (généré)
public/photos/aller-v2/  32 photos recadrées + miniatures
tools/build-v2-sql.mjs   générateur + validation de l'import V2
tests/                 tests unitaires, serveur local, scénario 35 élèves, captures
```


## 📄 Contributions de documents et parcours (22 octobre 2026)

Nouvelle page publique : `public/contribute.html` (aucun mot de passe admin).
Les contributeurs peuvent choisir l'un des 22 סיורים, la route 67 ou un parcours proposé par la communauté,
ou créer un nouveau parcours en lui associant une position sur la carte. Formats lus : DOCX, PDF non scanné, TXT, MD.
Le navigateur extrait le **texte** du document ; le binaire original n'est **pas** enregistré.
Pour permettre de télécharger l'original, le contributeur ajoute un lien HTTPS public (Drive ou autre).
Le texte stocké est limité à 120 000 caractères ; jusqu'à 15 Mo sont lus localement. Aucun texte
n'est annoncé comme « validé », ni automatiquement converti en questions.

Un document peut aussi être ajouté dans le créateur libre `community.html` : lors du partage d'un
tronçon avec un document joint, le texte est enregistré automatiquement comme nouveau parcours,
avec un point d'ancrage géocodé. **Le jeu de questions reste indépendant dans son lien personnel.**

**Activation obligatoire :** dans le projet Supabase indiqué par `public/config.js`, exécuter
`supabase/community_documents.sql` via SQL Editor. Le site GitHub Pages ne peut pas appliquer
cette migration seul. Les pages refusent la soumission si le RPC n'est pas installé,
et le jeu personnel reste partageable même si la sauvegarde communautaire échoue.
Le catalogue et la carte interrogent `public.community_catalog` ; la carte rafraîchit la liste
sans rechargement (60 s). Les documents sont lus via `public.community_document`.
Le responsable peut retirer une contribution à l'aide de la fonction
`public.admin_remove_community_document(p_token,p_id)` ; elle exige une session admin valide.
Ce dépôt ne contient ni clé administrateur Supabase ni mot de passe.

⚠️ Les contributions anonymes sont publiques, non vérifiées et peuvent contenir du contenu abusif.
Le SQL limite la taille, le nombre d'ajouts par heure et refuse les liens non HTTPS, mais ne constitue
pas une modération parfaite. Pour un usage grand public, ajouter CAPTCHA, signalement et modération.
