// Cloudflare Worker : sert le site statique (public/) ET l'API /api/grade (correction par Claude).
// La clé ANTHROPIC_API_KEY est un secret Cloudflare (dashboard › Workers › Settings › Variables and Secrets, ou `wrangler secret put`).
// Elle n'apparaît ni dans ce dépôt ni dans le navigateur.
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, SCHEMA, buildPrompt, sanitize, validateRequest } from './grader.mjs';

const ALLOW = ['https://lebrati58.github.io', 'http://localhost', 'http://127.0.0.1'];
function cors(req) {
  const o = req.headers.get('Origin') || '';
  const ok = ALLOW.some(a => o.startsWith(a)) || /\.workers\.dev$/.test(new URL(o || 'http://x').hostname);
  return { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Vary': 'Origin' };
}
const json = (data, status, extra) => new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {}) });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api/grade') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
      if (req.method !== 'POST') return json({ error: 'method' }, 405, cors(req));
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured', he: 'הבדיקה עם קלוד עוד לא הופעלה: חסר המפתח בשרת (ראו README).' }, 503, cors(req));
      // Limite par adresse (binding « ratelimits », facultatif) : 20 corrections / minute / IP.
      if (env.GRADE_LIMIT) {
        try { const { success } = await env.GRADE_LIMIT.limit({ key: req.headers.get('CF-Connecting-IP') || 'x' }); if (!success) return json({ error: 'rate_limited', he: 'יותר מדי בקשות — נסו שוב בעוד דקה.' }, 429, cors(req)); } catch (e) {}
      }
      let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400, cors(req)); }
      const bad = validateRequest(body); if (bad) return json({ error: bad }, 400, cors(req));
      const { system, user } = buildPrompt(body);
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 });
      try {
        const res = await client.beta.messages.parse({
          model: MODEL, max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: user }]
        });
        if (res.stop_reason === 'refusal') return json({ error: 'refused', he: 'קלוד לא יכול לבדוק את הטקסט הזה.' }, 200, cors(req));
        const out = res.parsed_output || JSON.parse((res.content.find(b => b.type === 'text') || {}).text || '{}');
        return json({ ok: true, result: sanitize(out, body.unit.kind === 'long'), usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } }, 200, cors(req));
      } catch (e) {
        const status = e && e.status;
        return json({ error: status === 429 ? 'upstream_busy' : status === 401 ? 'bad_key' : 'upstream', he: status === 401 ? 'המפתח בשרת לא תקין.' : 'הבדיקה עם קלוד לא הצליחה כרגע. נסו שוב מאוחר יותר.' }, 502, cors(req));
      }
    }
    return env.ASSETS.fetch(req);
  }
};
