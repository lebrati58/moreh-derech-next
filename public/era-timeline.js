// Moreh Derech NEXT — frise du temps des époques (Jérusalem 3D et sites 3D).
// Chaque époque a sa couleur (champ "era" des données) ; le nom est écrit dans la frise, les dates en dessous.
// Deux époques voisines de la même ère (ex. deux phases romaines) reçoivent deux teintes différentes.
export const ERA_COLORS = {
  chalco: '#7d5a46', ebronze: '#a0663a', canaanite: '#d08a3a', iron: '#e3c341', persian: '#9a7fe0',
  hellenistic: '#9bcf4a', hasmonean: '#2f9e5b', herodian: '#ef7d3c', roman: '#b0479a', byzantine: '#3d8be0',
  early_islamic: '#20b3a6', crusader: '#c8333a', mamluk: '#8a8f2e', ottoman: '#f08fb0', mandate: '#d9a5f0', israel: '#4fc3f7', today: '#a9b4cf',
};
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (c, w, k) => '#' + hex(c).map((v, i) => Math.round(v + (hex(w)[i] - v) * k).toString(16).padStart(2, '0')).join('');
const ink = c => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#151a33' : '#fff'; };

// Couleur d'une ère et couleur de texte lisible dessus (frise de la carte d'Israël).
export const eraColor = era => { const c = ERA_COLORS[era] || '#8090b0'; return { c, ink: ink(c) }; };

// Couleur et couleur du texte de chaque époque, dans l'ordre des données.
export function eraPaint(periods) {
  let prev = null, k = 0;
  return periods.map(p => {
    const base = ERA_COLORS[p.era] || '#8090b0';
    k = p.era && p.era === prev ? k + 1 : 0; prev = p.era;
    const c = k ? mix(base, k % 2 ? '#ffffff' : '#000000', 0.3) : base;
    return { c, ink: ink(c) };
  });
}

const CSS = `
.strip.tl{gap:0;padding:12px 14px 4px;align-items:flex-start;scroll-snap-type:x proximity}
.strip.tl button{all:unset;box-sizing:border-box;flex:none;display:flex;flex-direction:column;align-items:stretch;cursor:pointer;scroll-snap-align:center;position:relative;min-width:88px;max-width:150px;-webkit-tap-highlight-color:transparent}
.strip.tl .bar{display:flex;align-items:center;justify-content:center;height:38px;margin-top:5px;padding:0 10px;background:var(--c);color:var(--ink);font-size:12.5px;font-weight:900;line-height:1.1;text-align:center;border-inline-end:2px solid #0b1230;overflow:hidden;transition:height .15s,margin .15s,filter .15s}
.strip.tl button:first-child .bar{border-start-start-radius:12px;border-end-start-radius:12px}
.strip.tl button:last-of-type .bar{border-start-end-radius:12px;border-end-end-radius:12px;border-inline-end:0}
.strip.tl .bar span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.strip.tl small{display:block;margin-top:5px;padding:0 4px;font-size:10.5px;font-weight:700;color:var(--soft,#b9c2e0);text-align:center;line-height:1.2;white-space:normal}
.strip.tl button.after .bar{filter:saturate(.45) brightness(.72)}
.strip.tl button[aria-pressed=true] .bar{height:48px;margin-top:0;box-shadow:0 0 0 3px #fff,0 6px 18px #000a;border-radius:10px;z-index:1;position:relative;filter:none}
.strip.tl button[aria-pressed=true]::before{content:"";position:absolute;top:-10px;left:50%;transform:translateX(-50%);border:7px solid transparent;border-top-color:#fff}
.strip.tl button[aria-pressed=true] small{color:#fff;font-weight:900}
.strip.tl button:focus-visible .bar{outline:3px solid #fff;outline-offset:2px}
.strip.tl .arrow{flex:none;align-self:flex-start;margin-top:14px;padding-inline-start:8px;font-size:12px;font-weight:900;color:var(--soft,#b9c2e0);white-space:nowrap}
.pbig.tl{background:var(--c)!important;color:var(--ink)!important;border-color:#fff!important}
.pbig.tl small{color:var(--ink)!important;opacity:.85}
.ppick button{border-inline-start:7px solid var(--c,transparent)!important}
.ppick button[aria-pressed=true]{background:var(--c)!important;color:var(--ink)!important;border-color:#fff!important}.ppick button[aria-pressed=true] small{color:var(--ink)!important;opacity:.85}
`;
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };

// Dessine la frise dans `strip` (boutons [data-p], comme avant) ; `label` traduit un texte {he,fr,en,ru}.
export function renderTimeline(strip, periods, current, label, esc, timeWord) {
  style();
  const paint = eraPaint(periods), i = periods.findIndex(p => p.n === current);
  strip.classList.add('tl');
  strip.innerHTML = periods.map((p, k) => `<button type="button" data-p="${p.n}" data-era="${esc(p.era || '')}" class="${k > i ? 'after' : ''}" aria-pressed="${p.n === current}" style="--c:${paint[k].c};--ink:${paint[k].ink}"><span class="bar"><span>${esc(label(p.name))}</span></span><small>${esc(label(p.dates))}</small></button>`).join('') +
    `<span class="arrow" aria-hidden="true">${document.documentElement.dir === 'rtl' ? '←' : '→'} ${esc(timeWord)}</span>`;
}

// Met à jour la frise et le grand bouton de l'époque courante sans tout redessiner.
export function markTimeline(strip, big, periods, current) {
  const paint = eraPaint(periods), i = periods.findIndex(p => p.n === current);
  strip.querySelectorAll('[data-p]').forEach((b, k) => { b.setAttribute('aria-pressed', String(k === i)); b.classList.toggle('after', k > i); });
  if (big && i >= 0) { style(); big.classList.add('tl'); big.style.setProperty('--c', paint[i].c); big.style.setProperty('--ink', paint[i].ink); }
}

// Pastille de couleur pour la liste de choix des époques.
export const pickStyle = (periods, n) => { const k = periods.findIndex(p => p.n === n); if (k < 0) return ''; const x = eraPaint(periods)[k]; return `--c:${x.c};--ink:${x.ink}`; };
