# Correcteur IA (Claude) — mise en route (≈ 10 min, une seule fois)

La clé API reste un **secret Supabase** : jamais dans GitHub, jamais dans le navigateur.

1. Crée une clé sur https://console.anthropic.com → API keys (mets une **limite de dépense mensuelle**, ex. 10 $).
2. Supabase > SQL Editor : colle et exécute `supabase/ai_usage.sql` (quotas : 15 corrections/appareil/jour, 600/jour au total).
3. Terminal (Supabase CLI) :
   ```
   supabase login
   supabase link --project-ref evvutvnfmbhdxeyzmknv
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy grade-answer
   ```
   (ou Dashboard > Edge Functions > grade-answer > coller `index.ts` + `core.mjs`, et Secrets > ANTHROPIC_API_KEY.)
4. Test : `window.MDAI.grade({kind:'tripB', task:'…', answer:'…'})` dans la console d'une page qui charge `ai-client.js`.

Modèle : `claude-haiku-5-5` (rapide et bon marché), modifiable dans `core.mjs`. Les quotas aussi (`LIMITS`).
Sécurité : origine vérifiée, taille limitée, réponse de l'élève traitée comme donnée (anti-injection), sortie JSON bornée.
