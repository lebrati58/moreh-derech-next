// Moreh Derech NEXT — Worker Cloudflare.
// 1) Sert le site statique (dossier public/, inchangé) : les fichiers existants sont servis AVANT ce code.
// 2) Déclencheur planifié (Cron Triggers) : mardi et vendredi 08:00 heure d'Israël, jusqu'au 31/07/2027,
//    lance le workflow GitHub « drive-sync.yml » qui lit le Drive de l'école et enrichit le jeu.
// 3) POST /api/sync/request : bouton « סנכרן עכשיו » de l'administration. L'identité de l'admin est vérifiée
//    par Supabase (jeton de session admin) ; le jeton GitHub ne quitte jamais le serveur.
//
// Secrets (wrangler secret put …) : GITHUB_TOKEN — jeton GitHub « fine-grained », dépôt moreh-derech-next,
// permission « Actions : Read and write ». Variables (wrangler.jsonc) : GITHUB_REPO, SUPABASE_URL,
// SUPABASE_ANON_KEY, SYNC_END_DATE.
import { decideScheduled, END_DATE } from '../public/sync-schedule.js';

const WORKFLOW = 'drive-sync.yml';
const ACTIONS = ['sync', 'publish', 'rollback'];
const MODES = ['courses', 'tours', 'all'];

export async function dispatchWorkflow(env, inputs, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN) throw new Error('missing_github_token');
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'moreh-derech-next-sync', 'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: env.GITHUB_REF || 'main', inputs })
    });
    if (r.status === 204) return true;
    last = `github_${r.status}`;
    if (r.status < 500 && r.status !== 429) break;        // erreur de configuration : inutile d'insister
    await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error(last);
}

async function supabaseRpc(env, fn, args, fetchImpl = fetch) {
  const key = env.SUPABASE_ANON_KEY;
  const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', apikey: key }, /^eyJ/.test(key) ? { Authorization: 'Bearer ' + key } : {}),
    body: JSON.stringify(args)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((j && j.message) || 'supabase_' + r.status); e.auth = /not_authorized/.test(e.message); throw e; }
  return j;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export async function handleSyncRequest(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'forbidden_origin' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const action = ACTIONS.includes(body.action) ? body.action : 'sync';
  const mode = MODES.includes(body.mode) ? body.mode : 'all';
  const runId = typeof body.runId === 'string' && /^[0-9a-f-]{36}$/i.test(body.runId) ? body.runId : '';
  if (action === 'rollback' && !runId) return json({ error: 'missing_run' }, 400);
  if (typeof body.token !== 'string' || body.token.length < 10) return json({ error: 'not_authorized' }, 401);
  let req;
  try {
    // Vérifie le jeton admin ET enregistre la demande (traçabilité) en une seule étape.
    req = await supabaseRpc(env, 'admin_sync_request', { p_token: body.token, p_action: action, p_mode: mode, p_run: runId || null }, fetchImpl);
  } catch (e) {
    return json({ error: e.auth ? 'not_authorized' : 'database_unavailable' }, e.auth ? 401 : 502);
  }
  if (req && req.error) return json(req, 409);
  try {
    await dispatchWorkflow(env, { action, mode, trigger: 'manual', run_id: runId, request_id: req.id }, fetchImpl);
  } catch (e) {
    return json({ error: 'dispatch_failed', detail: String(e.message || e) }, 502);
  }
  return json({ ok: true, requestId: req.id });
}

export async function handleScheduled(scheduledTime, env, fetchImpl = fetch) {
  const d = decideScheduled(new Date(scheduledTime), env.SYNC_END_DATE || END_DATE);
  if (!d.run) return d;
  await dispatchWorkflow(env, { action: 'sync', mode: d.mode, trigger: 'cron', run_id: '', request_id: '' }, fetchImpl);
  return d;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sync/request') return handleSyncRequest(request, env);
    if (url.pathname === '/api/sync/health') {
      return json({ ok: true, github: !!env.GITHUB_TOKEN, repo: env.GITHUB_REPO, end: env.SYNC_END_DATE || END_DATE });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event.scheduledTime, env).then(
      r => console.log('drive-sync cron', JSON.stringify(r)),
      e => console.error('drive-sync cron failed', String(e && e.message || e))
    ));
  }
};
