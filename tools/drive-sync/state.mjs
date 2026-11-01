// Mémoire de la synchronisation (Supabase, fonctions sync_bot_* protégées par SYNC_SECRET).
// Mode hors-ligne (tests, ou tant que Supabase n'est pas installé) : fichier JSON local, jamais commité.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export function supabaseState({ url, key, secret, fetchImpl = fetch }) {
  async function rpc(fn, args) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', apikey: key }, /^eyJ/.test(key) ? { Authorization: 'Bearer ' + key } : {}),
        body: JSON.stringify({ p_secret: secret, ...args })
      });
      const j = await r.json().catch(() => null);
      if (r.ok) return j;
      if (r.status >= 500) { await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue; }
      throw new Error(`Supabase ${fn} ${r.status} : ${(j && j.message) || ''}`);
    }
    throw new Error(`Supabase ${fn} indisponible`);
  }
  return {
    config: () => rpc('sync_bot_config', {}),
    begin: (kind, trigger, dry, request, url_) => rpc('sync_bot_begin', { p_kind: kind, p_trigger: trigger, p_dry: dry, p_request: request || null, p_url: url_ || null }).then(r => r.id),
    files: () => rpc('sync_bot_files', {}),
    saveFiles: (run, files) => rpc('sync_bot_save_files', { p_run: run, p_files: files }),
    fingerprints: () => rpc('sync_bot_fingerprints', {}),
    items: (run, items) => rpc('sync_bot_items', { p_run: run, p_items: items }),
    approved: () => rpc('sync_bot_approved', {}),
    mark: (ids, status, run) => rpc('sync_bot_mark', { p_ids: ids, p_status: status, p_run: run }),
    rollback: (target, run) => rpc('sync_bot_rollback', { p_target: target, p_run: run }),
    finish: (run, r) => rpc('sync_bot_finish', { p_run: run, p_r: r })
  };
}

export function fileState(path) {
  let S = null;
  const load = async () => S || (S = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : { runs: [], files: {}, items: [] });
  const save = () => writeFile(path, JSON.stringify(S, null, 1));
  const uuid = () => crypto.randomUUID();
  return {
    config: async () => ({ paused: false, publish_mode: 'auto', end_date: '2027-07-31', last_success: {} }),
    begin: async (kind, trigger, dry) => { await load(); const id = uuid(); S.runs.push({ id, kind, trigger, dry, started_at: new Date().toISOString() }); await save(); return id; },
    files: async () => (await load()).files,
    saveFiles: async (run, files) => { await load(); for (const f of files) S.files[f.file_id] = f; await save(); },
    fingerprints: async () => (await load()).items.filter(i => i.fingerprint).map(i => i.kind + ':' + i.fingerprint),
    items: async (run, items) => { await load(); for (const i of items) S.items.push({ id: uuid(), run_id: run, published_run: i.status === 'published' ? run : null, ...i }); await save(); },
    approved: async () => (await load()).items.filter(i => i.status === 'approved'),
    mark: async (ids, status, run) => { await load(); for (const i of S.items) if (ids.includes(i.id)) { i.status = status; if (status === 'published') i.published_run = run; } await save(); },
    rollback: async (target) => { await load(); for (const i of S.items) if (i.published_run === target) i.status = 'rolled_back'; await save(); return {}; },
    finish: async (run, r) => { await load(); Object.assign(S.runs.find(x => x.id === run) || {}, r, { finished_at: new Date().toISOString() }); await save(); }
  };
}
