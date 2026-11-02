/* Moreh Derech NEXT — « הדרכת דרך — מדריך באוטובוס » : déclenchement anticipé des commentaires.
   Logique pure (aucun DOM, aucun réseau, aucune clé) : utilisée par tools/build-hadracha.mjs, par les tests Node
   et, plus tard, par la page du mode. Le suivi de la position (GPS réel, simulation, map matching) reste confié à
   gps-engine.js — le même moteur que la route 67 ; ce module ne fait que décider QUAND parler.

   Vocabulaire (abscisses en mètres le long du trajet, dans le sens de marche) :
     sAbeam      le bus passe à la hauteur du lieu (projection du lieu sur le tracé)
     sObs        observation_point : premier point d'où les passagers doivent regarder (le lieu est visible)
     sVisEnd     fin de la fenêtre de visibilité
     sTrig       trigger_point : début du commentaire, calculé à partir de la vitesse
   Règle : l'introduction (contexte) doit être finie AVANT sObs ; la consigne « תסתכלו ימינה » tombe à sObs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MDHadracha = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Débit d'un guide dans un bus (hébreu parlé, posé) : ≈ 2,2 mots par seconde (≈ 130 mots/min).
  const WORDS_PER_SEC = 2.2;
  const REACT_SEC = 2;          // temps pour que les passagers tournent la tête après la consigne
  const GAP_SEC = 3;            // silence minimal entre deux commentaires
  // Avance minimale du trigger AVANT le passage à la hauteur du lieu, par catégorie (valeurs indicatives de Lionel :
  // elles ne sont qu'un plancher ; la vraie avance vient de la vitesse et de la durée du commentaire).
  const MIN_LEAD = { landscape: 500, site: 250, near: 100 };
  // Fenêtre de visibilité PAR DÉFAUT (non vérifiée) : un lieu situé à d mètres de la route est vu à ~45° vers l'avant
  // quand le bus en est à d mètres en amont ; on borne pour les très proches et les très lointains.
  const VIS_DEFAULT = { landscape: [500, 1500], site: [150, 900], near: [80, 300] };

  const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  const speakSec = t => Math.round(words(t) / WORDS_PER_SEC * 10) / 10;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Fenêtre de visibilité d'un lieu pour un sens donné. vis = { before, after, status } (status : 'verified' quand un
  // repérage l'a constatée, 'not_visible' quand la source dit qu'on ne voit rien, sinon estimation).
  function visWindow(poi, dir) {
    const cat = poi.category || 'site', [lo, hi] = VIS_DEFAULT[cat] || VIS_DEFAULT.site;
    const v = (poi.visibility && poi.visibility[dir]) || {};
    const d = Math.max(0, poi.offRoadM || 0);
    const before = v.before != null ? v.before : clamp(d, lo, hi);
    const after = v.after != null ? v.after : clamp(d, lo, hi);
    return { sObs: poi.sAbeam - before, sVisEnd: poi.sAbeam + after, status: v.status || 'estimated', verified: v.status === 'verified' };
  }

  // Durées d'un commentaire : intro (avant de regarder), cue (« תסתכלו… »), look (pendant qu'on regarde), short (version courte)
  function durations(c) {
    return { intro: speakSec(c.intro), cue: speakSec(c.cue), look: speakSec(c.look), short: speakSec(c.short) };
  }

  // Point de déclenchement pour une vitesse v (m/s) : l'intro + le temps de réaction doivent tenir avant sObs.
  function trigger(poi, dir, v) {
    const w = visWindow(poi, dir), d = durations(poi.commentary);
    v = Math.max(v || 0, 1);
    const cat = poi.category || 'site';
    const lead = v * (d.intro + REACT_SEC);
    // pas visible depuis la route (tunnel, masque) : on parle en passant, sans consigne de regard
    const noLook = w.status === 'not_visible';
    let sTrig = noLook ? poi.sAbeam - v * (d.intro + d.look) : w.sObs - lead;
    sTrig = Math.min(sTrig, poi.sAbeam - (MIN_LEAD[cat] || 250));
    const totalSec = d.intro + (noLook ? d.look : d.cue + REACT_SEC + d.look);
    return { sTrig, sObs: w.sObs, sVisEnd: w.sVisEnd, sAbeam: poi.sAbeam, visibility: w.status, noLook,
      leadM: Math.round(poi.sAbeam - sTrig), leadSec: Math.round((poi.sAbeam - sTrig) / v), totalSec, dur: d };
  }

  // Programme sans chevauchement pour une vitesse donnée (plan d'étude, simulation, préparation du guide).
  // Conflit = le commentaire suivant devrait commencer avant la fin du précédent (+ GAP).
  // Résolution, dans l'ordre : 1) décaler le suivant tant que sa consigne tombe encore dans sa fenêtre de visibilité ;
  // 2) passer le moins prioritaire en version courte ; 3) l'écarter (« skipped_conflict ») — jamais deux voix en même temps.
  function schedule(pois, dir, v) {
    const items = pois.map(p => ({ poi: p, t: trigger(p, dir, v), mode: 'full' })).sort((a, b) => a.t.sTrig - b.t.sTrig);
    const out = []; let busyUntil = -Infinity;            // abscisse où le guide aura fini de parler
    const endOf = (it, start) => start + v * (it.mode === 'short' ? it.t.dur.short + REACT_SEC : it.t.totalSec);
    for (const it of items) {
      let start = it.t.sTrig;
      if (start < busyUntil + v * GAP_SEC) {
        const shifted = busyUntil + v * GAP_SEC;
        // la consigne doit encore tomber avant la fin de la fenêtre de visibilité
        const cueAt = shifted + v * it.t.dur.intro;
        if (it.t.noLook ? shifted < it.t.sAbeam : cueAt + v * REACT_SEC < it.t.sVisEnd) { start = shifted; it.shifted = true; }
        else {
          const prev = out[out.length - 1];
          const shortCue = shifted + v * (it.t.dur.short + REACT_SEC);
          if (prev && (prev.poi.prio || 2) < (it.poi.prio || 2) && prev.mode === 'full') {
            // le précédent, moins important, passe en version courte pour laisser la place
            prev.mode = 'short'; prev.end = endOf(prev, prev.start); busyUntil = prev.end;
            start = Math.max(it.t.sTrig, busyUntil + v * GAP_SEC);
          } else if (it.poi.commentary.short && shortCue < it.t.sVisEnd) { it.mode = 'short'; start = shifted; }
          else { it.mode = 'skipped_conflict'; out.push(Object.assign(it, { start: null, end: null })); continue; }
        }
      }
      it.start = start; it.end = endOf(it, start); busyUntil = it.end;
      out.push(it);
    }
    return out;
  }

  // Décision en temps réel (appelée à chaque position acceptée par gps-engine.Tracker).
  // state : { spoken: Set(id), started: { id, at } | null } ; s = abscisse courante ; v = vitesse lissée (m/s)
  // Renvoie l'action à proposer au guide / à l'élève : 'wait' | 'start' | 'start_short' | 'cue' | 'missed'.
  function decide(pois, dir, s, v, state) {
    state = state || {}; const spoken = state.spoken || new Set();
    v = Math.max(v || 0, 1);
    if (state.started) {
      const it = pois.find(p => p.id === state.started.id), t = it && trigger(it, dir, v);
      if (t && !t.noLook && s >= t.sObs - v * REACT_SEC && s <= t.sVisEnd) return { action: 'cue', poi: it, t };
    }
    const next = pois.filter(p => !spoken.has(p.id)).map(p => ({ p, t: trigger(p, dir, v) }))
      .filter(x => x.t.sVisEnd > s).sort((a, b) => a.t.sTrig - b.t.sTrig);
    for (const { p, t } of next) {
      // lieu déjà dépassé : on ne lance jamais une explication en retard
      const lastUseful = t.noLook ? t.sAbeam : t.sVisEnd - v * (REACT_SEC + 2);
      if (s > lastUseful) { spoken.add(p.id); continue; }
      if (s < t.sTrig) return { action: 'wait', poi: p, t, inSec: Math.round((t.sTrig - s) / v), inM: Math.round(t.sTrig - s) };
      // dans la zone : reste-t-il le temps de l'intro avant la consigne ?
      const timeToObs = (t.sObs - s) / v;
      if (t.noLook || timeToObs >= t.dur.intro - 3) return { action: 'start', poi: p, t };
      if (p.commentary.short) return { action: 'start_short', poi: p, t };
      return { action: 'missed', poi: p, t };
    }
    return { action: 'done' };
  }

  // Le même lieu dans l'autre sens : abscisse miroir, côté inversé, fenêtre « after/before » échangée.
  function mirror(poi, length) {
    const vis = poi.visibility || {};
    const swap = v => v ? Object.assign({}, v, { before: v.after, after: v.before }) : undefined;
    return Object.assign({}, poi, { sAbeam: length - poi.sAbeam,
      side: poi.side === 'right' ? 'left' : poi.side === 'left' ? 'right' : poi.side,
      visibility: { fwd: vis.rev || swap(vis.fwd), rev: vis.fwd } });
  }

  // Texte final d'un commentaire pour un côté : jetons {LOOK} (ימינה/שמאלה/קדימה) et {SIDE} (מימין/משמאל/לפנינו).
  const LOOK = { right: 'ימינה', left: 'שמאלה', ahead: 'קדימה', along: 'לצד הכביש' };
  const SIDE_HE = { right: 'מימין', left: 'משמאל', ahead: 'לפנינו', along: 'לאורך הדרך' };
  function render(text, side) {
    return String(text || '').replace(/\{LOOK\}/g, LOOK[side] || 'החוצה').replace(/\{SIDE\}/g, SIDE_HE[side] || '');
  }

  return { WORDS_PER_SEC, REACT_SEC, GAP_SEC, MIN_LEAD, VIS_DEFAULT, speakSec, visWindow, durations, trigger, schedule, decide, mirror, render, SIDE_HE, LOOK };
});
