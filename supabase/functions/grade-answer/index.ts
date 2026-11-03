// Edge Function Supabase « grade-answer » : corrige une réponse d'élève avec Claude.
// La clé ANTHROPIC_API_KEY est un SECRET Supabase (jamais dans le dépôt ni dans le navigateur).
// Déploiement : voir docs/AI_GRADER_setup.md
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { MODEL, LIMITS, validate, buildPrompt, parseResult } from './core.mjs';

const cors = (origin: string) => ({
  'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS', 'vary': 'origin', 'content-type': 'application/json'
});
const reply = (o: unknown, status: number, origin: string) => new Response(JSON.stringify(o), { status, headers: cors(origin) });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405, origin);
  let body; try { body = await req.json(); } catch { return reply({ error: 'bad_json' }, 400, origin); }
  const bad = validate(body, origin);
  if (bad) return reply({ error: bad }, 400, origin);
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return reply({ error: 'not_configured' }, 503, origin);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: allowed, error: e1 } = await sb.rpc('ai_take_quota', { p_device: body.deviceId, p_per_device: LIMITS.perDevicePerDay, p_global: LIMITS.globalPerDay });
  if (e1) return reply({ error: 'quota_unavailable' }, 503, origin);
  if (allowed !== 'ok') return reply({ error: allowed }, 429, origin); // device_limit | global_limit

  const { system, user } = buildPrompt(body);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: LIMITS.maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  if (!r.ok) return reply({ error: 'upstream_' + r.status }, 502, origin);
  const j = await r.json();
  const res = parseResult(j?.content?.[0]?.text);
  if (!res) return reply({ error: 'bad_model_output' }, 502, origin);
  return reply({ ok: true, result: res }, 200, origin);
});
