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

  // Compte à rebours circulaire : vert → orange (≤ 50 %) → rouge clignotant (≤ 5 s).
  const C = 2 * Math.PI * 44;
  function ringHtml(label) {
    return `<div class="ring" id="ring" aria-live="off">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r="44"/>
        <circle class="prog" id="ring-prog" cx="50" cy="50" r="44" stroke-dasharray="${C}" stroke-dashoffset="0"/>
      </svg>
      <div class="ring-num"><b id="ring-num"></b><small>${label || 'שניות'}</small></div>
    </div>`;
  }
  // q = { opened_at, closes_at } ; offset = horloge serveur - horloge locale (ms)
  function updateRing(q, offset) {
    const el = document.getElementById('ring');
    if (!el || !q || !q.closes_at) return;
    const end = Date.parse(q.closes_at), start = Date.parse(q.opened_at);
    const left = Math.max(0, end - (Date.now() + offset));
    const frac = Math.max(0, Math.min(1, left / (end - start)));
    const secs = Math.ceil(left / 1000);
    document.getElementById('ring-prog').setAttribute('stroke-dashoffset', String(C * (1 - frac)));
    document.getElementById('ring-num').textContent = secs;
    el.classList.toggle('warn', frac <= 0.5 && secs > 5);
    el.classList.toggle('danger', secs <= 5 && secs > 0);
    el.classList.toggle('over', secs === 0);
    if (secs !== updateRing._last && secs <= 3 && secs > 0 && navigator.vibrate && el.dataset.vibrate) navigator.vibrate(30);
    updateRing._last = secs;
  }

  window.MDL = { rpc, esc, store, SHAPES, ringHtml, updateRing };
})();
