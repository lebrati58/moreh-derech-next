// « 🏆 אלוף הקורס » — transport temps réel.
// En ligne : Supabase Realtime « Broadcast » (canal éphémère par code de partie, aucune table, aucun SQL,
// la clé publique de config.js suffit). En local (serveur de test) ou avec ?net=local : BroadcastChannel
// du navigateur (onglets d'un même navigateur) — sert aux tests et aux essais à la maison.
// Aucun message n'est conservé : si un téléphone coupe, l'hôte renvoie l'état complet toutes les 2 s.
(function (global) {
  'use strict';

  function wantLocal() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('net') === 'local') return true;
      if (q.get('net') === 'online') return false;
    } catch (e) {}
    var c = global.MDL_CONFIG || {};
    return !c.url || c.anonKey === 'local' || !global.supabase || !global.supabase.createClient;
  }

  function localTransport(pin, h) {
    var bc = new BroadcastChannel('mdcampus-' + pin), open = true;
    bc.onmessage = function (e) { var m = e.data || {}; if (m && m.ev) h.onMessage(m.ev, m.p); };
    setTimeout(function () { h.onStatus('online'); }, 0);
    return {
      mode: 'local',
      send: function (ev, p) { if (!open) return Promise.resolve(false); bc.postMessage({ ev: ev, p: p }); return Promise.resolve(true); },
      close: function () { open = false; bc.close(); }
    };
  }

  var client = null;
  function supa() {
    if (!client) {
      var c = global.MDL_CONFIG;
      client = global.supabase.createClient(c.url, c.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 20 }, heartbeatIntervalMs: 15000 }
      });
    }
    return client;
  }

  function onlineTransport(pin, h) {
    var sb = supa(), ch = null, status = 'connecting', closed = false, retry = null;
    function set(s) { if (s !== status) { status = s; h.onStatus(s); } }
    function subscribe() {
      if (closed) return;
      ch = sb.channel('mdcampus-' + pin, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: '*' }, function (m) { if (m && m.event) h.onMessage(m.event, m.payload); });
      ch.subscribe(function (s) {
        if (s === 'SUBSCRIBED') { set('online'); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          set('offline');
          if (!closed && s !== 'CLOSED') {   // supabase-js réessaie seul ; filet de sécurité si le canal reste bloqué
            clearTimeout(retry);
            retry = setTimeout(function () { if (status !== 'online' && !closed) { try { sb.removeChannel(ch); } catch (e) {} subscribe(); } }, 8000);
          }
        }
      });
    }
    subscribe();
    h.onStatus('connecting');
    function wake() { if (status !== 'online' && !closed) { try { sb.removeChannel(ch); } catch (e) {} subscribe(); } }
    global.addEventListener('online', wake);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(wake, 600); });
    return {
      mode: 'online',
      send: function (ev, p) {
        if (closed || !ch || status !== 'online') return Promise.resolve(false);
        return ch.send({ type: 'broadcast', event: ev, payload: p }).then(function (r) { return r === 'ok'; }, function () { return false; });
      },
      close: function () { closed = true; clearTimeout(retry); try { sb.removeChannel(ch); } catch (e) {} }
    };
  }

  function connect(pin, handlers) {
    var h = { onMessage: handlers.onMessage || function () {}, onStatus: handlers.onStatus || function () {} };
    if (!/^\d{5}$/.test(String(pin))) throw new Error('bad pin');
    return wantLocal() ? localTransport(pin, h) : onlineTransport(pin, h);
  }

  global.MDCampusNet = { connect: connect, isLocal: wantLocal };
})(typeof window !== 'undefined' ? window : globalThis);
