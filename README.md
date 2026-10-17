# מורה דרך LIVE

Quiz en direct pour un guidage en bus (Zikhron Yaakov / Césarée → Haïfa, 21 octobre 2026).
Le guide publie chaque question **à la main**, au moment où le paysage s'y prête ; les élèves
répondent depuis leur téléphone. Interface entièrement en hébreu (RTL), pensée pour le mobile.

- **Lien élèves** : `https://<hébergement>/` — un seul lien à envoyer sur WhatsApp, seul le nom est demandé.
- **Lien guide** : `https://<hébergement>/admin.html` — protégé par mot de passe.

---

## Architecture

```
Téléphones (pages statiques, ~25 Ko)  ──HTTPS──►  Supabase (PostgreSQL)
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
- Élèves : un jeton aléatoire stocké sur le téléphone (reconnexion automatique) + un code
  personnel à 4 chiffres pour revenir depuis un autre navigateur (ex. WhatsApp → Chrome).
  8 codes faux bloquent ce nom. Noms nettoyés, 24 caractères max, 300 joueurs max par partie.
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

## Développement et tests

Prérequis : Node 18+, PostgreSQL local (port 5433, socket `/var/tmp` par défaut ; variables
`PGHOST` / `PGPORT` sinon), Chromium pour les tests navigateur (`CHROME=/chemin/chrome`).

```bash
npm install
npm test                    # 11 tests de la logique serveur sur un vrai PostgreSQL

# serveur local qui imite l'API Supabase (rôle "anon" compris)
createdb mdl_dev && psql -d mdl_dev -f supabase/schema.sql -f supabase/seed_demo.sql \
  -c "select mdl.set_admin_password('guide-test-2026')"
npm run dev                 # http://localhost:8787  et  /admin.html
npm run scenario            # scénario 35 élèves (32 clients HTTP + 3 vrais navigateurs)
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
tests/                 tests unitaires, serveur local, scénario 35 élèves, captures
```
