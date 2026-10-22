// Serveur de développement : sert public/ et imite l'endpoint RPC de Supabase
// (POST /rest/v1/rpc/<fonction>) sur un Postgres local. Sert aux tests de bout en bout.
// Usage : node tests/dev-server.mjs [port] [database]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import pg from 'pg';

const PORT = +(process.argv[2] || 8787);
const DB = process.argv[3] || 'mdl_dev';
const ROOT = new URL('../public/', import.meta.url).pathname;
const pool = new pg.Pool({ host: process.env.PGHOST || '/var/tmp', port: process.env.PGPORT || 5433, user: 'postgres', database: DB, max: 20 });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg' };
const ALLOWED = /^(join_game|get_state|submit_answer|set_language|mdl_bootstrap|solo_route|feedback_submit|admin_[a-z_]+)$/;

export const stats = { rpc: 0 };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
  if (m && req.method === 'POST') {
    if (!ALLOWED.test(m[1])) { res.writeHead(404); return res.end(); }
    let body = '';
    for await (const chunk of req) body += chunk;
    const args = body ? JSON.parse(body) : {};
    const keys = Object.keys(args).filter(k => /^p_[a-z_]+$/.test(k));
    const sql = `select public.${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    // comme PostgREST : objets et tableaux d'objets → jsonb ; tableaux de nombres → tableau SQL (bigint[])
    const vals = keys.map(k => { const v = args[k];
      return v !== null && typeof v === 'object' && (!Array.isArray(v) || v.some(x => x !== null && typeof x === 'object')) ? JSON.stringify(v) : v; });
    const c = await pool.connect();
    try {
      await c.query('set role anon');     // mêmes droits que la clé publique Supabase
      const { rows } = await c.query(sql, vals);
      stats.rpc++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows[0].r));
    } catch (e) {
      res.writeHead(e.code === '42501' ? 403 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: e.message, code: e.code }));
    } finally { await c.query('reset role').catch(() => {}); c.release(); }
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  try {
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});

server.listen(PORT, () => console.log(`dev server http://localhost:${PORT} (db ${DB})`));
export { server, pool };
