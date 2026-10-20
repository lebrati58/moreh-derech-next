// Moteur de navigation du guide (V3, route 67) — utilisé À L'IDENTIQUE par le vrai GPS,
// le simulateur et les tests Node. Aucune dépendance, aucun appel réseau.
//
// Principes
//  * On ne compare jamais le téléphone à un village « à vol d'oiseau » : chaque position est
//    projetée sur le TRACÉ du trajet (map matching) et l'on raisonne en distance LE LONG du trajet.
//  * Une position imprécise, ancienne ou isolée ne fait jamais avancer ni reculer le bus :
//    il faut plusieurs positions cohérentes (hystérésis).
//  * Le moteur SUGGÈRE. Il n'a aucun moyen de publier une question : il ne connaît ni le serveur
//    ni le jeton admin. La publication reste un geste explicite du guide.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDL_GPS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const R = 6371008.8, D2R = Math.PI / 180;

  // ------------------------------------------------------------------ Géométrie
  function projector(lat0, lon0) {
    const kx = Math.cos(lat0 * D2R) * R * D2R, ky = R * D2R;
    return {
      fwd: (lat, lon) => ({ x: (lon - lon0) * kx, y: (lat - lat0) * ky }),
      inv: (x, y) => [lat0 + y / ky, lon0 + x / kx]
    };
  }
  const bearingOf = (a, b) => (Math.atan2(b.x - a.x, b.y - a.y) / D2R + 360) % 360;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // Projection d'un point sur la polyligne : toutes les candidates (une par segment)
  function candidates(P, p) {
    const out = [];
    for (let i = 0; i < P.pts.length - 1; i++) {
      const a = P.pts[i], b = P.pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + t * dx, qy = a.y + t * dy;
      const d = Math.hypot(p.x - qx, p.y - qy);
      // côté du point par rapport au sens de marche (+ = droite, − = gauche)
      const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
      out.push({ seg: i, s: a.s + t * Math.sqrt(L2), d, bearing: a.bearing, side: cross < 0 ? 1 : -1 });
    }
    return out;
  }
  function nearest(P, p) {
    let best = null;
    for (const c of candidates(P, p)) if (!best || c.d < best.d) best = c;
    return best;
  }
  function pointAt(P, s) {
    s = Math.max(0, Math.min(P.length, s));
    let i = 0;
    while (i < P.pts.length - 2 && P.pts[i + 1].s < s) i++;
    const a = P.pts[i], b = P.pts[i + 1];
    const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
    const [lat, lon] = P.proj.inv(x, y);
    return { lat, lon, x, y, bearing: a.bearing, seg: i };
  }

  // Simplification Douglas-Peucker (traces enregistrées)
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop(); let md = 0, mk = -1;
      const a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      for (let k = i + 1; k < j; k++) {
        const d = Math.abs(dy * pts[k].x - dx * pts[k].y + b.x * a.y - b.y * a.x) / L;
        if (d > md) { md = d; mk = k; }
      }
      if (md > tol) { keep[mk] = true; stack.push([i, mk], [mk, j]); }
    }
    return pts.filter((_, k) => keep[k]);
  }

  // ------------------------------------------------------------------ Préparation du trajet
  // route : contenu de road67-route.json ; override (facultatif) : trace enregistrée par le guide
  //   { geometry: [[lat, lon], …], anchors: { S2: [lat, lon] }, recordedAt }
  function prepare(route, override) {
    const geom = override && Array.isArray(override.geometry) && override.geometry.length >= 2 ? override.geometry : route.geometry;
    const proj = projector(geom[0][0], geom[0][1]);
    let pts = geom.map(([lat, lon]) => Object.assign({ lat, lon }, proj.fwd(lat, lon)));
    if (override) pts = simplify(pts, 6);
    let s = 0;
    pts.forEach((p, i) => {
      if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      p.s = s;
      if (i < pts.length - 1) p.bearing = bearingOf(p, pts[i + 1]);
    });
    pts[pts.length - 1].bearing = pts[pts.length - 2].bearing;
    const verified = !!(override && override.geometry) || route.status === 'verified';
    const P = { proj, pts, length: s, verified, status: verified ? 'verified' : (route.status || 'approximate'),
      corridor: (route.corridorM || {})[verified ? 'verified' : 'approximate'] || (verified ? 120 : 650) };
    const at = ll => nearest(P, proj.fwd(ll[0], ll[1]));
    // Routes : les limites sont des POINTS du tracé d'origine, reprojetés sur le tracé actif
    P.roads = (route.roads || []).map(r => ({
      label: { he: r.he, fr: r.fr, en: r.en, ru: r.ru }, speed: (r.speedKmh || 50) / 3.6,
      from: r.fromVertex === 0 ? 0 : at(route.geometry[r.fromVertex]).s,
      to: r.toVertex >= route.geometry.length - 1 ? s : at(route.geometry[r.toVertex]).s
    }));
    const dest = route.destination && route.destination.point ? at(route.destination.point) : { s, d: 0 };
    P.dest = Object.assign({}, route.destination, { s: dest.s });
    P.needSec = (route.finish && route.finish.needSec) || 170;
    // règle « finir avant Aroma » (désactivable : finish.enabled = false) et écart minimal entre deux questions
    P.endRule = !(route.finish && route.finish.enabled === false);
    P.minGap = route.minGapSec || 120;
    P.stops = (route.stops || []).map(st => {
      const anchor = (override && override.anchors && override.anchors[st.id]) || st.anchor;
      const c = at(anchor);
      const anchorVerified = !!(override && override.anchors && override.anchors[st.id]);
      return Object.assign({}, st, { anchor, anchorVerified, s: c.s, offRoadM: Math.round(c.d),
        zoneStart: Math.max(0, c.s - (st.beforeM || 400)), zoneEnd: Math.min(s, c.s + (st.afterM || 400)) });
    }).sort((a, b) => a.s - b.s);
    return P;
  }

  function roadAt(P, s) {
    return P.roads.find(r => s >= r.from - 1 && s <= r.to + 1) || P.roads[P.roads.length - 1] || null;
  }
  // Temps de parcours estimé entre deux abscisses, à la vitesse observée (si le bus roule)
  // ou au profil de vitesse de chaque route. On prend la valeur la PLUS COURTE (prudence pour la fin).
  function travelSec(P, s0, s1, speed, realistic) {
    if (s1 <= s0) return 0;
    let prof = 0;
    for (const r of P.roads) {
      const a = Math.max(s0, r.from), b = Math.min(s1, r.to);
      if (b > a) prof += (b - a) / r.speed;
    }
    if (!P.roads.length) prof = (s1 - s0) / 14;
    if (speed && speed > 2) {
      // le bus roule plus vite (ou moins vite) que prévu : on applique le même rapport à toute la suite
      // (sur la route 6 il ira plus vite que sur la 67). On garde l'estimation la plus courte (prudence).
      const cur = roadAt(P, s0), k = cur ? Math.max(0.4, Math.min(1.8, speed / cur.speed)) : 1;
      // « réaliste » : pour décider si deux questions tiennent encore ; sinon prudent (fin du quiz)
      return realistic ? prof / k : Math.min(prof, prof / k);
    }
    return prof;
  }

  // ------------------------------------------------------------------ Suivi (map matching)
  const DEFAULTS = { maxAccuracy: 100, staleMs: 20000, lostMs: 60000, backTol: 60, confirm: 3, jumpConfirm: 2 };

  function Tracker(P, opts) {
    this.P = P; this.o = Object.assign({}, DEFAULTS, opts);
    this.reset();
  }
  Tracker.prototype.reset = function () {
    Object.assign(this, { s: null, speed: null, lastFixAt: null, lastGoodAt: null, lastAcc: null, lastDist: null,
      mode: 'searching', off: 0, back: 0, jump: 0, dirBad: 0, wrongDir: false, fixes: 0, side: null, last: null });
  };
  // fix : { lat, lon, accuracy, timestamp, speed?, heading? }
  Tracker.prototype.update = function (fix) {
    const o = this.o, P = this.P;
    this.fixes++;
    this.lastFixAt = fix.timestamp; this.lastAcc = fix.accuracy;
    if (!(fix.accuracy <= o.maxAccuracy)) { this.mode = 'inaccurate'; return this; }
    const p = P.proj.fwd(fix.lat, fix.lon);
    const tol = P.corridor + Math.min(fix.accuracy, o.maxAccuracy);
    const cands = candidates(P, p).filter(c => c.d <= tol);
    if (!cands.length) {
      this.off++; this.lastDist = Math.round(nearest(P, p).d);
      if (this.off >= o.confirm) this.mode = 'off_route';
      return this;
    }
    this.off = 0;
    const dt = this.last ? Math.max(0, Math.min(120, (fix.timestamp - this.last.t) / 1000)) : 0;
    let c;
    if (this.s === null) c = cands.reduce((a, b) => (b.d < a.d ? b : a));
    else {
      const pred = this.s + (this.speed || 0) * dt;
      c = cands.reduce((a, b) => (b.d + 0.5 * Math.abs(b.s - pred) < a.d + 0.5 * Math.abs(a.s - pred) ? b : a));
    }
    this.lastDist = Math.round(c.d);
    // sens de marche : cap GPS (si le bus roule) comparé au sens du tracé
    if (fix.heading != null && !isNaN(fix.heading) && (fix.speed == null || fix.speed > 3)) {
      this.dirBad = angDiff(fix.heading, c.bearing) > 120 ? this.dirBad + 1 : 0;
    }
    if (this.s === null) { this.s = c.s; this.accept(fix, c, 0, dt); return this; }
    const delta = c.s - this.s;
    const maxAdv = Math.max(this.speed || 0, 25) * dt * 1.5 + 250 + fix.accuracy;
    if (delta < -(o.backTol + fix.accuracy)) {
      // recul : erreur de position probable — on ne recule que si cela se confirme
      this.back++; this.jump = 0;
      if (this.back >= o.confirm) { this.wrongDir = true; this.s = c.s; this.accept(fix, c, delta, dt); }
      else { this.mode = this.wrongDir ? 'wrong_dir' : 'ok'; this.lastGoodAt = fix.timestamp; this.last = { t: fix.timestamp, s: this.s }; }
      return this;
    }
    if (delta > maxAdv) {
      // saut en avant (position fausse, ou tunnel GPS) : confirmé par une 2e position
      this.jump++; this.back = 0;
      if (this.jump >= o.jumpConfirm) { this.s = c.s; this.speed = null; this.accept(fix, c, 0, 0); }
      return this;
    }
    this.back = 0; this.jump = 0;
    if (delta > 15) this.wrongDir = false;
    this.s = Math.max(this.s, c.s);          // petit recul (bruit) : on ne recule pas
    this.accept(fix, c, delta, dt);
    return this;
  };
  Tracker.prototype.accept = function (fix, c, delta, dt) {
    if (dt >= 1 && delta >= 0) {
      const v = delta / dt;
      this.speed = this.speed == null ? v : this.speed * 0.6 + v * 0.4;
    } else if (fix.speed != null && !isNaN(fix.speed) && this.speed == null) this.speed = fix.speed;
    this.lastGoodAt = fix.timestamp;
    this.last = { t: fix.timestamp, s: this.s };
    this.mode = this.wrongDir || this.dirBad >= this.o.confirm ? 'wrong_dir' : 'ok';
  };
  // État à l'instant « now » (une position trop vieille ne compte plus)
  Tracker.prototype.status = function (now) {
    if (!this.fixes) return 'searching';
    if (this.lastFixAt && now - this.lastFixAt > this.o.lostMs) return 'lost';
    if (this.lastFixAt && now - this.lastFixAt > this.o.staleMs) return 'stale';
    if (this.s === null && this.mode === 'ok') return 'searching';
    return this.mode;
  };

  // ------------------------------------------------------------------ Planification (suggestions)
  // ctx : { now, used: Set(questionKey), skipped: Set(stopId), phase, lastOpenAt, revealedAt, includeSpares }
  const MIN_GAP_SEC = 120, SPEAK_SEC = 40;
  function plan(P, trk, ctx) {
    const now = ctx.now, st = trk ? trk.status(now) : 'off';
    const gps = st === 'ok' && trk.s !== null;
    const s = trk && trk.s !== null ? trk.s : null;
    const speed = trk && trk.speed && trk.speed > 2 && gps ? trk.speed : null;
    const used = ctx.used || new Set(), skipped = ctx.skipped || new Set();
    const open = st => !used.has(st.question) && !skipped.has(st.id);
    const out = { status: st, gps, s, speed, verified: P.verified, km: s === null ? null : s / 1000,
      road: s === null ? null : roadAt(P, s), upcoming: [], passed: [], next: null, finish: false, hold: null };
    if (s !== null) {
      out.destRemainM = Math.max(0, P.dest.s - s);
      out.destEtaSec = Math.round(travelSec(P, s, P.dest.s, speed));
    }
    // plus aucune nouvelle question si l'arrivée est trop proche
    const fin0 = P.stops.find(x => x.final);
    if (P.endRule) {
      if (gps && out.destEtaSec < P.needSec) out.finish = true;
      // la question finale (NVIDIA) a été posée : c'est la fin du quiz, plus aucune suggestion
      if (fin0 && used.has(fin0.question)) { out.finish = true; out.done = true; }
    } else if (gps && out.destRemainM < 150) { out.finish = true; out.arrived = true; }
    for (const stp of P.stops) {
      if (!open(stp)) continue;
      if (!stp.main && !ctx.includeSpares && !(ctx.pinned && ctx.pinned === stp.id)) continue;
      const passed = s !== null && s > stp.zoneEnd + 150;
      const item = { stop: stp, passed };
      if (s !== null) {
        item.distM = Math.round(stp.zoneStart - s);
        item.inZone = s >= stp.zoneStart && s <= stp.zoneEnd;
        item.etaSec = item.distM > 0 ? Math.round(travelSec(P, s, stp.zoneStart, speed)) : 0;
        item.anchorDistM = Math.round(stp.s - s);
        // assez de temps pour poser la question avant Aroma ?
        item.fits = !P.endRule || out.destEtaSec == null ? true : out.destEtaSec - item.etaSec >= P.needSec;
      }
      (passed ? out.passed : out.upcoming).push(item);
    }
    // prochaine suggestion : choix du guide (pinned), sinon prochain lieu principal
    let nx = ctx.pinned ? out.upcoming.find(i => i.stop.id === ctx.pinned) : null;
    if (!nx) {
      nx = out.upcoming.find(i => i.stop.main) || null;
      // Lieux trop proches : si poser celui-ci fait manquer un lieu plus important (prio 3 > 2 > 1)
      // — sa zone se termine avant la fin de l'écart minimal — on propose directement le plus important.
      if (nx && s !== null) for (const o of out.upcoming) {
        if (o === nx || !o.stop.main || (o.stop.prio || 2) <= (nx.stop.prio || 2)) continue;
        const reachEnd = travelSec(P, s, o.stop.zoneEnd, speed, true);
        if (reachEnd - (nx.etaSec || 0) < P.minGap) { nx = o; break; }
      }
      // Deux lieux trop proches de la fin : si poser celui-ci empêche la question finale
      // (espacement de 2 min + temps nécessaire avant Aroma), on propose de le passer.
      const fin = out.upcoming.find(i => i.stop.final);
      const realEta = s === null ? null : Math.round(travelSec(P, s, P.dest.s, speed, true));
      if (P.endRule && gps && nx && fin && !nx.stop.final && realEta != null &&
          realEta - nx.etaSec - P.minGap < P.needSec) {
        out.squeezed = nx.stop; nx = fin;
      }
    }
    if (out.done) nx = null;
    if (nx) {
      nx = Object.assign({}, nx);
      if (!gps) nx.level = 0;
      else if (out.finish) nx.level = 0;
      else if (nx.inZone) nx.level = 3;
      else if (P.endRule && nx.stop.final && out.destEtaSec - P.needSec <= 60) nx.level = 3;     // dernière chance avant Aroma
      else if (nx.etaSec <= 55 || nx.distM <= 250) nx.level = 2;
      else if (nx.etaSec <= 95) nx.level = 1;
      else nx.level = 0;
      if (gps && nx.fits === false && !nx.stop.final) nx.tooLate = true;
      out.next = nx;
    }
    // le GPS ne bouscule jamais le guide : question en cours, micro, espacement de 2 minutes
    if (ctx.phase === 'open') out.hold = { reason: 'question_open' };
    else if (ctx.phase === 'revealed' && ctx.revealedAt && now - ctx.revealedAt < SPEAK_SEC * 1000) out.hold = { reason: 'speaking', waitSec: Math.ceil((SPEAK_SEC * 1000 - (now - ctx.revealedAt)) / 1000) };
    else if (ctx.lastOpenAt && now - ctx.lastOpenAt < P.minGap * 1000) out.hold = { reason: 'spacing', waitSec: Math.ceil((P.minGap * 1000 - (now - ctx.lastOpenAt)) / 1000) };
    return out;
  }

  // Côté du bus calculé (pour information) — uniquement significatif si le tracé est vérifié
  function sideOf(P, ll, s) {
    const p = P.proj.fwd(ll[0], ll[1]);
    const c = candidates(P, p).reduce((a, b) => (Math.abs(b.s - s) < 400 && b.d < a.d ? b : a), nearest(P, p));
    return { side: c.side > 0 ? 'right' : 'left', distM: Math.round(c.d) };
  }

  // ------------------------------------------------------------------ Simulateur
  // Un bus virtuel avance sur le tracé avec les vitesses du profil et produit de fausses positions
  // GPS (mêmes objets que navigator.geolocation). Pannes simulables : voir faults.
  function Simulator(P, opts) {
    this.P = P; this.o = Object.assign({ mul: 1, seed: 7 }, opts);
    this.reset();
  }
  Simulator.prototype.reset = function () {
    this.s = 0; this.t = 0; this.dir = 1; this.faults = {}; this.rnd = this.o.seed; this.done = false;
  };
  Simulator.prototype.random = function () { this.rnd = (this.rnd * 16807) % 2147483647; return (this.rnd - 1) / 2147483646; };
  // dt en secondes simulées ; renvoie une position (ou null si « GPS perdu »)
  Simulator.prototype.step = function (dt, nowMs) {
    const f = this.faults, P = this.P;
    const r = roadAt(P, this.s) || { speed: 14 };
    let v = r.speed * (f.rush && this.s > P.dest.s - 3000 ? 3 : 1);
    this.t += dt;
    this.s += (f.wrongWay ? -1 : 1) * v * dt;
    if (this.s >= P.dest.s) { this.s = P.dest.s; this.done = true; }
    if (this.s < 0) this.s = 0;
    if (f.lost) return null;
    const pt = pointAt(P, this.s);
    let { x, y } = pt, acc = 8;
    if (f.noisy) { acc = 160; x += (this.random() - 0.5) * 300; y += (this.random() - 0.5) * 300; }
    if (f.parallel) { const b = pt.bearing * D2R; x += Math.cos(b) * 900; y -= Math.sin(b) * 900; }
    const [lat, lon] = P.proj.inv(x, y);
    const heading = f.wrongWay ? (pt.bearing + 180) % 360 : pt.bearing;
    return { lat, lon, accuracy: acc, speed: v, heading, timestamp: f.stale ? nowMs - 45000 : nowMs, simulated: true };
  };
  Simulator.prototype.jump = function (m) { this.s = Math.max(0, Math.min(this.P.dest.s, this.s + m)); };

  // ------------------------------------------------------------------ Import de trace (GPX / GeoJSON)
  function parseTrack(text) {
    text = String(text || '').trim();
    if (text.startsWith('<')) {
      const pts = [], re = /<(?:trkpt|rtept)[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"|<(?:trkpt|rtept)[^>]*lon="([-\d.]+)"[^>]*lat="([-\d.]+)"/g;
      let m; while ((m = re.exec(text))) pts.push(m[1] ? [+m[1], +m[2]] : [+m[4], +m[3]]);
      return pts;
    }
    const j = JSON.parse(text);
    const lines = [];
    const walk = g => {
      if (!g) return;
      if (g.type === 'FeatureCollection') g.features.forEach(walk);
      else if (g.type === 'Feature') walk(g.geometry);
      else if (g.type === 'LineString') lines.push(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(c => lines.push(c));
    };
    if (Array.isArray(j.geometry) && Array.isArray(j.geometry[0])) return j.geometry;   // export de l'admin
    walk(j);
    return [].concat(...lines).map(([lon, lat]) => [lat, lon]);
  }

  return { prepare, Tracker, plan, Simulator, pointAt, roadAt, travelSec, sideOf, parseTrack, simplify, MIN_GAP_SEC, SPEAK_SEC };
});
