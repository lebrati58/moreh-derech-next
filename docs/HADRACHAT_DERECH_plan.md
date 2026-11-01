# הדרכת דרך — מדריך באוטובוס : audit, API, coûts, plan, prototype

*2 novembre 2026 — branche `feat/hadrachat-derech`. Rien n'est publié aux élèves : le parcours est `a_verifier`, `published: false`.*

Ce document répond aux six livrables demandés avant toute modification importante. Le prototype (moteur + données Savidor → Jérusalem) est déjà dans la branche, **sans aucune page ni mode visible ajouté** : les autres modes ne sont pas touchés.

---

## 1. Audit de l'application existante

### Architecture réelle (vérifiée dans le dépôt)

| Brique | Ce qu'elle fait aujourd'hui | Conséquence pour la הדרכת דרך |
| --- | --- | --- |
| **Cloudflare Workers** (`wrangler.jsonc`) | Publie seulement le dossier `public/` (assets statiques). **Aucun script Worker**. | Pour appeler une API à clé secrète, il faudra *ajouter* un petit Worker. Tant qu'on n'en a pas besoin, on reste statique. |
| **Supabase** (`public/config.js`, `supabase/*.sql`) | Jeu LIVE multi-joueurs (questions, parties, réponses), concours, bibliothèque. Schéma `mdl`, RPC sécurisées. | Utile pour l'état partagé (repérages, progression). Le contenu pédagogique, lui, vit dans le dépôt (voir §4). |
| **GitHub Actions** | Construit les données hors ligne : `tours.yml` (Wikipédia + OSRM), `site3d.yml`, `rtg-import.yml`… | C'est le bon endroit pour les appels API de construction : aucune clé dans le navigateur, résultat versionné. |
| `public/gps-engine.js` | Moteur de la route 67 : *map matching* sur le tracé, distance **le long** du trajet, vitesse lissée, hystérésis, détection de contresens, simulateur avec pannes, import GPX. Aucun réseau. | **Réutilisé tel quel.** C'est déjà le cœur d'un guide qui suit un bus. |
| `public/tour-engine.js` + `parcours.html` | Généralisation de la route 67 aux 22 סיורים (étude, examen, simulation, GPS), sources typées (`transcript` / `course-doc` / `external`), statuts `a_importer → pret`. | Même philosophie de sources et de statuts reprise ici. |
| `content/tours/registry.json` | Classement des transcriptions du Drive (`verbatim`, `ivrit-docx`, `ai-edited`, `student-notes`…). | Repris : une réécriture IA n'est **jamais** présentée comme la parole du prof. |

### La route 67 (référence)
- `public/v3/road67-route.json` : 14 lieux, ancre sur la chaussée, zone `beforeM/afterM`, côté marqué `verified: false` sauf accord des deux documents, tracé **interpolé** (statut `approximate`, couloir 650 m), outil de repérage 🛰️ pour le remplacer par une trace réelle.
- Le GPS **suggère** (🟡 ~90 s, 🟠 ~45–55 s, 🟢 dans la zone) mais ne publie jamais ; écart minimal entre deux questions ; fin avant Aroma.
- **Ce qui manque pour une vraie הדרכת דרך** : (1) la notion de *point d'observation* distinct du passage ; (2) un déclenchement calculé à partir de la **durée du texte** et de la vitesse (aujourd'hui : seuils fixes en secondes) ; (3) le sens retour ; (4) un découpage du trajet en intervalles avec ce qui est à droite / gauche / devant ; (5) des commentaires parlés (aujourd'hui : des questions).

### Données déjà présentes et utiles
- Transcription **verbatim** du סיור 01 (Ayalon, Hiriya, aéroport, Lod-Ramla, Ben Shemen) — preuve de ce que dit le prof.
- Feuilles « סיפור דרך » du cours (סיור 5 et סיור ירושלים, guide Benny Frankel) : liste de côtés, tronçon par tronçon, **depuis Savidor** — exactement notre corridor.
- Notes d'élève (Itaï Horowitz) et transcriptions « עובד » par IA (Latrun → Jérusalem) : pistes, à recouper.

---

## 2. API nécessaires et limites

| Service | Usage proposé | Limites qui changent la conception |
| --- | --- | --- |
| **OSRM / OpenStreetMap** (déjà utilisé) | Tracé de référence, numéros de route (champ `ref` des étapes), distances | ODbL : stockage et affichage sur Leaflet **autorisés** avec attribution. Le serveur public est une démo : seulement au build, quelques requêtes. |
| **Google Routes API** | Contrôle croisé de l'itinéraire réellement emprunté (optionnel) | Interdit d'utiliser son contenu **avec une carte non-Google** (notre carte est Leaflet/OSM) ; lat/lng en cache **30 jours maximum** ([Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20240522)). → Ne peut pas être la géométrie stockée. |
| **Street View Metadata** | Y a-t-il une photo à l'observation_point ? date, `pano_id` | **Gratuit, sans quota** ([doc](https://developers.google.com/maps/documentation/streetview/metadata)) ; `pano_id` peut être gardé. Ne renvoie pas le cap. |
| **Street View Static API** | Vignette dirigée (heading) pour la relecture par Lionel | 10 000 images/mois gratuites ([tarifs](https://developers.google.com/maps/billing-and-pricing/pricing)). Seul le `pano_id` peut être mis en cache. |
| **Maps Embed API (Street View)** | Montrer la vue aux élèves dans la page | Gratuit et illimité ([doc](https://developers.google.com/maps/documentation/embed/quickstart?authuser=8)) ; la clé est faite pour le navigateur (restreinte au domaine et à cette seule API). |
| **Google Places** | Proposer des lieux candidats autour du tracé | Nearby/Text Search Pro : 5 000 gratuits puis 32 $/1000 ; on ne garde que le `place_id`, pas les noms/coordonnées au-delà de 30 jours. → Pour la base durable : Wikipédia/Wikidata (déjà en place). |
| **Google Elevation** | Profils | 5 000 gratuits/mois, mais contenu Google. → Préférer un **MNT ouvert** (Copernicus GLO-30) calculé dans GitHub Actions : stockable, et permet le calcul de **ligne de vue**. |
| **Overpass API** | Villages, monuments, tunnels, ponts le long du tracé | Instance publique : < 10 000 requêtes et < 1 Go/jour, et elle est souvent saturée ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)). → Une requête par corridor, au build. |
| **Mapillary** | Photos routières complémentaires | Images en **CC BY-SA** avec attribution ([licence](https://help.mapillary.com/hc/en-us/articles/115001770409-Licenses)) — utilisables pour l'analyse visuelle. |
| **IA multimodale (Claude)** | Vérifier qu'un monument est visible sur une image | **Jamais sur Street View** : les conditions de Google interdisent de créer du contenu à partir de Google Maps Content et de l'utiliser pour des modèles d'IA ([clause](https://conductatlas.com/platform/google-maps/google-maps-platform-terms-of-service/provision/CA-P-041130/prohibition-on-using-maps-content-for-ai-model-training/)). Seulement sur Mapillary ou sur les photos de repérage. |

**Aucune API n'identifie à coup sûr ce qui est visible.** Le système croise : géométrie (distance, côté, cap), terrain (ligne de vue sur le MNT), photos (Street View pour l'œil humain, Mapillary/photos de repérage pour l'IA), documents du cours — puis **un repérage réel** tranche.

---

## 3. Estimation des coûts

Hypothèse : 8 corridors ≈ 1 100 km aller (retour = même tracé), ≈ 150 lieux.

| Poste | Volume | Coût mensuel |
| --- | --- | --- |
| OSRM, Wikipédia/Wikidata, Overpass, MNT Copernicus | build seulement | 0 $ |
| Street View Metadata (tous les 250 m, 2 sens) | ≈ 9 000 requêtes, une fois | 0 $ (gratuit) |
| Street View Static (relecture : 150 lieux × 2 sens × 3 caps) | ≈ 900 images | 0 $ (sous 10 000) |
| Maps Embed pour les élèves | illimité | 0 $ |
| Places (candidats, un point tous les 2 km) | ≈ 550 requêtes, une fois | 0 $ (sous 5 000) |
| Cloudflare Worker (si ajouté) | quelques milliers d'appels/jour | 0 $ (offre gratuite) |
| Claude API pour rédiger/relire les commentaires à partir du Drive | ≈ 150 lieux × (8 k jetons lus + 1,5 k écrits) par passage | quelques dollars par passage complet ([tarifs](https://docs.claude.com/en/docs/about-claude/pricing)) |

**Total réaliste : 0 $ de Google**, si l'on respecte les plafonds et que l'on n'active pas de SKU « Pro » en masse. Seul risque : un compte de facturation Google ouvert sans **quotas plafonnés** — à configurer (quota journalier par API) avant toute clé.

---

## 4. Plan technique

### Principe
Le contenu vit dans le dépôt (JSON relu, versionné, construit par GitHub Actions), comme les סיורים. Supabase sert à ce qui est partagé et vivant : relevés de repérage, progression. Aucune clé sensible dans le navigateur.

### Chaîne de construction (`tools/build-hadracha.mjs` + `.github/workflows/hadracha.yml`) — **fait**
1. Coordonnées des lieux : Wikipédia/Wikidata uniquement (jamais tapées). Lieux étendus le long de la route (un nahal, des blindés dispersés) : ancrés **sur le tracé** (`anchorAlong`), confiance de position basse.
2. Tracé OSRM avec numéros de route. Les points de passage portent un **cap** : sans lui, OSRM accrochait la chaussée opposée aux échangeurs et faisait demi-tour (premier essai : 99,6 km au lieu de 62).
3. Pour chaque lieu **et chaque sens** : abscisse, écart à la route, côté calculé comparé au côté du prof (désaccord = avertissement, jamais corrigé en silence), fenêtre de visibilité, trigger/observation à 50, 80 et 100 km/h, programme sans chevauchement.
4. Le retour est le **miroir exact** de l'aller (s' = L − s, côté inversé, cap + 180°), pas un second tracé reprojeté.
5. Découpage : intervalles de 1 km, 250 m de 1,5 km avant à 1 km après chaque lieu ; pour chacun : route, cap, lieux à droite / à gauche / devant (axe ±25°).

### Moteur de déclenchement (`public/hadracha-engine.js`) — **fait, testé**
- Débit de parole : 2,2 mots/s ; durée de chaque partie (intro, consigne, regard, version courte) calculée sur le texte.
- `observation_point` = premier point de visibilité. Par défaut (non vérifié) : un lieu à *d* m de la route se regarde à ~45° vers l'avant, donc *d* m avant le passage (bornes par catégorie).
- `trigger_point` = observation − vitesse × (intro + 2 s de réaction), et jamais moins que le plancher de Lionel (500 / 250 / 100 m).
- Exemple de Lionel vérifié par test : 45 s à 90 km/h → plus de 1 km d'avance.
- Temps réel (`decide`) : attendre → commencer → « תסתכלו ימינה » → si en retard, **version courte** → si dépassé, **rien** (pas d'explication tardive). La vitesse vient du `Tracker` de `gps-engine.js` ; bus plus lent = déclenchement recalculé plus tard.
- Conflits (`schedule`) : décaler, sinon version courte du moins prioritaire, sinon écarter — jamais deux voix.
- Lieu non visible (tunnel du Castel) : on en parle en passant, sans consigne de regard.

### Vérification de la visibilité (phase 3)
1. **Ligne de vue** sur MNT Copernicus 30 m dans GitHub Actions (hauteur des yeux dans un car ≈ 2,5 m) → visibilité *terrain* (ni arbres ni bâtiments).
2. **Street View Metadata** au point d'observation → s'il existe une photo, Lionel la voit dans l'écran de relecture (Embed, cap calculé) et coche « visible / masqué ».
3. **Repérage réel** avec l'outil 🛰️ existant : trace GPS + bouton « je le vois maintenant » → `visibility.fwd = { status: 'verified', before, after }`. Seul ce statut rend un lieu « vérifié ».
4. Mapillary + Claude multimodal en complément, sur images CC BY-SA uniquement.

### Ordre de travail proposé
- **Phase 2 (fait)** : moteur + Savidor → Jérusalem (15 lieux) + build + tests.
- **Phase 2 bis (à valider)** : page du mode, sur la branche, aperçu seulement.
- **Phase 3** : repérage du corridor dans les deux sens ; correction des ancres (Lod-Ramla, יער המגינים, blindés) ; ligne de vue MNT.
- **Phase 4** : corridors suivants dans l'ordre des tronçons partagés : Côte nord (20/2), puis Galilée (réutilise 2 et 6), Golan (réutilise 6/77), Est (5), Côte sud (20/4), Néguev (20/1/6/40), Mer Morte–Eilat (1/90). Les segments communs (Ayalon, route 6) sont analysés une seule fois.
- **Phase 5** : audio (voix hébraïque pré-générée), optimisation, export Supabase.

---

## 5. Prototype — Savidor Merkaz → Latrun → Jérusalem

Tracé OSRM : **62,2 km**, route 20 puis route 1 (vérifié sur les numéros OSM). 140 intervalles dans chaque sens, dont 103 à 250 m. Fichiers : `content/hadracha/savidor-jerusalem.src.json` (source, textes, sources), `public/hadracha/savidor-jerusalem.json` (construit).

| Lieu | Route | Position | Côté (aller) | Contrôle du côté | Écart | Avance du trigger à 50 / 80 / 100 km/h | Visibilité |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nahal Ayalon | 20 | km 1,5 | le long | ✅ prof = calcul | 0 m | 379 / 558 / 677 m | estimée |
| Hiriya — parc Ariel Sharon | 1 | km 8,7 | gauche | ✅ prof = calcul | 933 m | 1226 / 1402 / 1519 m | estimée |
| Aéroport Ben-Gourion | 1 | km 15,7 | gauche | ✅ prof = calcul | 1535 m | 1161 / 1318 / 1422 m | estimée |
| Lod et Ramla | 1 | km 26,5 | droite | prof seul (ancre au centre-ville, 5,6 km) | 5620 m | 1749 / 1898 / 1997 m | estimée |
| Tel Gezer | 1 | km 32,3 | droite | ✅ prof = calcul | 3742 m | 1813 / 2000 / 2125 m | estimée |
| יער המגינים / no man's land | 1 | km 32,7 | droite | ✅ prof = calcul | 1039 m | 1136 / 1278 / 1372 m | estimée |
| Vallée d'Ayalon | 1 | km 33,8 | droite | ✅ prof = calcul | 535 m | 771 / 913 / 1007 m | estimée |
| Police de Latrun — Yad LaShiryon | 1 | km 38,3 | droite | ✅ prof = calcul | 607 m | 932 / 1127 / 1257 m | estimée |
| Emmaüs — parc Canada | 1 | km 38,3 | gauche | ✅ prof = calcul | 253 m | 711 / 838 / 922 m | estimée |
| Abbaye de Latrun | 1 | km 39,0 | droite | calcul seul | 537 m | 716 / 824 / 895 m | estimée |
| Sha'ar HaGaï (khan) | 1 | km 43,3 | droite | prof seul (lieu sur la route) | 5 m | 361 / 488 / 572 m | estimée |
| Blindés de Sha'ar HaGaï | 1 | km 44,8 | gauche | prof seul | sur le tracé | 297 / 427 / 513 m | estimée |
| Abou Gosh — Kiryat Yearim | 1 | km 51,9 | gauche | ✅ prof = calcul | 537 m | 748 / 875 / 959 m | estimée |
| Le Castel | 1 | km 55,4 | droite | ✅ prof = calcul | 120 m | 310 / 496 / 619 m | **non visible (tunnel)** |
| Motza | 1 | km 57,6 | droite | calcul seul | 135 m | 699 / 818 / 897 m | estimée |

- Les **9 lieux où le prof et le calcul peuvent être comparés sont tous d'accord** (Nahal Ayalon, qui longe la route, n'est pas compté). Les désaccords apparus au premier essai venaient d'un tracé faux (demi-tours aux échangeurs) : c'est exactement ce que le contrôle devait attraper.
- Chaque texte existe en version complète (intro → consigne → regard) et courte ; le côté n'est jamais écrit en dur (`{LOOK}`, `{SIDE}`), et les textes qui dépendent du sens (« on entre dans la Shéfélah », « on monte à Jérusalem ») ont une version retour.
- À 100 km/h, au retour, Emmaüs passe en version courte (Latrun et Emmaüs se suivent à ≈ 70 m).
- **Contre-vérification indépendante des faits** (Wikipédia, Britannica, OCSO, Bibliothèque nationale, textes bibliques) : 8 corrections intégrées, chacune notée `correction` dans la source quand elle corrige un document du cours :
  - l'Ayalon *traverse* la vallée d'Ayalon sans y prendre sa source (erreur de l'enregistrement du סיור 01) ;
  - Ramla est « la seule ville fondée par les Arabes », plutôt que « la première » ;
  - la route de Jaffa a été ouverte aux voitures en 1867, et François-Joseph l'a empruntée en 1869 ;
  - Abou Gosh a coopéré avec le Yichouv en 1948, ce qui va au-delà d'une simple neutralité ;
  - Kfar Bin Nun tient son nom de l'opération Bin Nun ;
  - les tunnels de Har'el passent sous la crête du Castel ;
  - Motza est *l'un des* premiers achats de terres ;
  - Nicopolis est un nom grec de l'époque romaine.
- **Statut de toutes les observations : estimées.** Aucune visibilité n'est déclarée vérifiée ; le corridor est « partiellement analysé ».

---

## 6. Modifications prévues — base de données et interface

### Base (brouillon `supabase/hadracha_draft.sql`, **non exécuté**)
Tables `mdl.hd_routes`, `hd_route_segments` (tronçons partagés entre parcours, géométrie sans sens), `hd_points_of_interest`, `hd_route_observations` (par tronçon × sens × lieu : côté, visibilité, confiance, source), `hd_guide_commentaries` (par lieu × sens, version complète/courte, durées), `hd_trigger_points`, `hd_educational_sources`, plus la vue `hd_route_coverage` (analysé / partiel / non traité). Lecture publique seulement des parcours publiés ; écriture par RPC admin, comme le reste du schéma `mdl`. Le JSON du dépôt reste la source ; un export alimentera ces tables quand le mode multi-élèves en aura besoin.

### Interface (à construire après validation)
Nouvelle page `hadracha.html` — « הדרכת דרך — מדריך באוטובוס », tuile sur l'accueil, rien de modifié dans les autres modes.
- Choix : destination depuis Savidor, sens (הלוך / חזור).
- Carte Leaflet : tracé, bus, flèche du sens, lieux à venir, points de déclenchement (●) et d'observation (👁).
- Bandeau : « בעוד 40 שנ׳ — אמאוס, משמאל », texte hébreu, consigne מצד ימין / מצד שמאל en grand.
- **מצב לימוד** : le parcours avance (GPS, simulation à vitesse réglable, ou bouton « הבא » sans GPS) ; texte et audio.
- **מצב סימולציית הדרכה** : textes masqués, l'élève parle, puis « 👁️ הצג » pour comparer.
- Audio : synthèse hébraïque du navigateur quand elle existe, voix pré-générée plus tard.
- Hors ligne : ajout au service worker.

### Points qui demandent ta décision
1. Valider la logique (avances, versions courtes, retour) sur le tableau ci-dessus.
2. Créer ou non un projet Google Cloud avec **quotas plafonnés** (Street View Metadata/Static, Embed) — rien n'en dépend dans le prototype.
3. Planifier un **repérage** Savidor ↔ Jérusalem dans les deux sens.
4. Lancer la page du mode (phase 2 bis) sur la branche.

*Sources des tarifs et conditions : [tarifs Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing), [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20240522), [Street View metadata](https://developers.google.com/maps/documentation/streetview/metadata), [Maps Embed](https://developers.google.com/maps/documentation/embed/quickstart?authuser=8), [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API), [Mapillary](https://help.mapillary.com/hc/en-us/articles/115001770409-Licenses).*
