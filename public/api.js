// Client minimal pour les fonctions RPC Supabase (PostgREST). Aucune dépendance.
(function () {
  const CFG = window.MDL_CONFIG;

  async function rpc(fn, args = {}, { timeout = 8000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(`${CFG.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json', apikey: CFG.anonKey },
          // anciennes clés "anon" (JWT) : aussi en Authorization ; nouvelles clés "sb_publishable_" : apikey seul
          /^eyJ/.test(CFG.anonKey) ? { Authorization: 'Bearer ' + CFG.anonKey } : {}
        ),
        body: JSON.stringify(args),
        signal: ctrl.signal,
        cache: 'no-store'
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const e = new Error((j && j.message) || 'HTTP ' + r.status);
        e.status = r.status;
        e.auth = /not_authorized/.test(e.message);
        throw e;
      }
      return j;
    } finally {
      clearTimeout(t);
    }
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privé */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* */ } }
  };

  const SHAPES = ['▲', '◆', '●', '■'];

  window.MDL = { rpc, esc, store, SHAPES };
})();
