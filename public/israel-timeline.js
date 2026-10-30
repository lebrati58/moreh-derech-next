// Moreh Derech NEXT — carte d'Israël : frise du temps horizontale des événements.
// Chaque événement est un bloc de la couleur de son époque (mêmes couleurs que Jérusalem 3D et les sites 3D),
// avec l'année et le titre écrits dedans. Le toucher fait voler la carte jusqu'au lieu exact et ouvre une bulle.
// Positions : israel-timeline.json, construit par tools/build-israel-timeline.mjs à partir des lieux déjà vérifiés.
import { eraColor } from './era-timeline.js';

const LANG = (document.documentElement.lang || 'he').slice(0, 2);
const L = {
  he: { battles: 'קרבות', more: 'לפרטים נוספים', src: 'מקור', title: 'ציר הזמן', hide: 'הסתרת ציר הזמן', show: 'ציר הזמן', prev: 'האירוע הקודם', next: 'האירוע הבא', tradition: 'מסורת', d3: '🏛️ בתלת-ממד', tour: '🧭 פתיחת סיור', where: 'מיקום', bce: 'לפנה״ס', ce: 'לסה״נ', c: 'כ-' },
  fr: { battles: 'Batailles', more: 'En savoir plus', src: 'Source', title: 'Frise du temps', hide: 'Masquer la frise', show: 'Frise du temps', prev: 'Événement précédent', next: 'Événement suivant', tradition: 'Tradition', d3: '🏛️ En 3D', tour: '🧭 Ouvrir la sortie', where: 'Position', bce: 'av. J.-C.', ce: 'apr. J.-C.', c: 'vers ' },
  en: { battles: 'Battles', more: 'More details', src: 'Source', title: 'Timeline', hide: 'Hide timeline', show: 'Timeline', prev: 'Previous event', next: 'Next event', tradition: 'Tradition', d3: '🏛️ In 3D', tour: '🧭 Open tour', where: 'Position', bce: 'BCE', ce: 'CE', c: 'c. ' },
  ru: { battles: 'Сражения', more: 'Подробнее', src: 'Источник', title: 'Лента времени', hide: 'Скрыть ленту', show: 'Лента времени', prev: 'Предыдущее событие', next: 'Следующее событие', tradition: 'Предание', d3: '🏛️ В 3D', tour: '🧭 Открыть маршрут', where: 'Место', bce: 'до н. э.', ce: 'н. э.', c: 'ок. ' },
}[LANG] || {};
const ERA = {
  he: { canaanite: 'כנען', iron: 'ימי המקרא', persian: 'פרס', herodian: 'הורדוס', roman: 'רומא', byzantine: 'ביזנטיון', early_islamic: 'האסלאם הקדום', crusader: 'הצלבנים', mamluk: 'האיובים והממלוכים', ottoman: 'העות׳מאנים', mandate: 'המנדט', israel: 'מדינת ישראל' },
  fr: { canaanite: 'Canaan', iron: 'Époque biblique', persian: 'Perses', herodian: 'Hérode', roman: 'Rome', byzantine: 'Byzance', early_islamic: 'Premiers temps de l’islam', crusader: 'Croisés', mamluk: 'Ayyoubides et Mamelouks', ottoman: 'Ottomans', mandate: 'Mandat', israel: 'État d’Israël' },
  en: { canaanite: 'Canaan', iron: 'Biblical period', persian: 'Persia', herodian: 'Herod', roman: 'Rome', byzantine: 'Byzantium', early_islamic: 'Early Islam', crusader: 'Crusaders', mamluk: 'Ayyubids and Mamluks', ottoman: 'Ottomans', mandate: 'Mandate', israel: 'State of Israel' },
  ru: { canaanite: 'Ханаан', iron: 'Библейская эпоха', persian: 'Персия', herodian: 'Ирод', roman: 'Рим', byzantine: 'Византия', early_islamic: 'Ранний ислам', crusader: 'Крестоносцы', mamluk: 'Айюбиды и мамлюки', ottoman: 'Османы', mandate: 'Мандат', israel: 'Государство Израиль' },
}[LANG] || {};
const tx = o => (o && (o[LANG] || o.he)) || '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// références « 4.1–83 », « 15.331–341 » : gardées de gauche à droite dans un texte hébreu
const num = h => h.replace(/\d+(?:[.:]\d+)*(?:[–-]\d+(?:[.:]\d+)*)?/g, m => /[.:–-]/.test(m) ? `<bdi dir="ltr">${m}</bdi>` : m);
export const yearLabel = e => e.label ? tx(e.label) : (e.circa ? L.c : '') + (e.year < 0 ? `${-e.year} ${L.bce}` : e.year < 1000 ? `${e.year} ${L.ce}` : String(e.year));

const CSS = `
.itl{position:fixed;z-index:950;inset-inline:0;bottom:0;padding:6px 0 calc(8px + env(safe-area-inset-bottom,0px));background:linear-gradient(#0b123000,#0b1230f2 30%);display:flex;align-items:flex-end;gap:6px}
.itl[hidden]{display:none}
body.list-view .itl,body.itl-sheet .itl{display:none}
.itl .nav{flex:none;width:40px;height:52px;margin-bottom:16px;border-radius:13px;border:1px solid #ffffff40;background:#1d2a56;color:#fff;font-size:26px;font-weight:900;line-height:1}
.itl .nav:first-child{margin-inline-start:8px}
.itl .strip{flex:1;min-width:0;display:flex;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;padding:16px 4px 2px}
.itl .strip::-webkit-scrollbar{display:none}
.itl .ev{all:unset;box-sizing:border-box;flex:none;width:118px;display:flex;flex-direction:column;cursor:pointer;scroll-snap-align:center;position:relative;-webkit-tap-highlight-color:transparent}
.itl .era{height:14px;font-size:10.5px;font-weight:900;color:var(--c);white-space:nowrap;overflow:visible;padding-inline-start:4px;margin-bottom:2px}
.itl .bar{height:52px;padding:5px 8px;background:var(--c);color:var(--ink);border-inline-end:2px solid #0b1230;display:flex;flex-direction:column;justify-content:center;overflow:hidden;transition:transform .15s,box-shadow .15s}
.itl .bar b{font-size:12.5px;font-weight:900;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.itl .bar span{font-size:11px;font-weight:800;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.itl .ev:first-child .bar{border-start-start-radius:12px;border-end-start-radius:12px}
.itl .ev:last-child .bar{border-start-end-radius:12px;border-end-end-radius:12px;border-inline-end:0}
.itl .ev.trad .bar{background-image:repeating-linear-gradient(135deg,#ffffff33 0 6px,transparent 6px 12px)}
.itl .ev[aria-pressed=true] .bar{transform:translateY(-6px);box-shadow:0 0 0 3px #fff,0 8px 18px #000a;border-radius:10px;z-index:1;position:relative}
.itl .ev[aria-pressed=true]::before{content:"";position:absolute;top:-6px;left:50%;transform:translateX(-50%);border:7px solid transparent;border-top-color:#fff;z-index:2}
.itl .ev:focus-visible .bar{outline:3px solid #fff;outline-offset:2px}
.itl .ev.off{display:none}
.itl .nav.bt{width:auto;padding:0 9px;font-size:13px;font-weight:900}.itl .nav.bt[aria-pressed=true]{background:#c8333a;border-color:#fff}
.itl-pop details{margin:4px 0 6px}.itl-pop summary{cursor:pointer;font-weight:900;font-size:13px;color:#2a4fa8}.itl-pop details p{margin:6px 0 0}
.itl-pop .src{display:block;font-size:12px;margin:2px 0 6px;opacity:.85}
.itl .nav.hide{width:30px;font-size:15px;background:#0b1230;margin-inline-end:8px}
.itl-open{position:fixed;z-index:950;inset-inline-start:72px;bottom:calc(20px + env(safe-area-inset-bottom,0px));border:1px solid #ffffff40;background:#0b1230e6;color:#fff;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:900}
body.list-view .itl-open,body.itl-sheet .itl-open{display:none}
body.itl-on .map-fab{bottom:calc(var(--itl-h,0px) + 12px + var(--safe-b,0px))}
body.itl-on .count-pill{bottom:calc(var(--itl-h,0px) + 16px + var(--safe-b,0px))}
body.itl-on .leaflet-bottom{bottom:var(--itl-h,0px)}
.itl-pulse{width:22px;height:22px;border-radius:50%;background:var(--c);border:3px solid #fff;box-shadow:0 0 0 0 var(--c);animation:itlp 1.6s infinite}
@keyframes itlp{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 70%,transparent)}100%{box-shadow:0 0 0 22px transparent}}
.itl-pop .leaflet-popup-content{margin:12px 14px;min-width:200px;max-width:260px;direction:${LANG === 'he' ? 'rtl' : 'ltr'};text-align:start}
.itl-pop h3{margin:2px 0 4px;font-size:16px;line-height:1.25}.itl-pop .y{display:inline-block;font-size:12px;font-weight:900;padding:3px 9px;border-radius:999px;background:var(--c);color:var(--ink)}
.itl-pop .tr{display:inline-block;margin-inline-start:6px;font-size:11.5px;font-weight:900;padding:3px 8px;border-radius:999px;background:#5a3b00;color:#ffd98a}
.itl-pop p{margin:6px 0;font-size:13.5px;line-height:1.5}.itl-pop .acts{display:flex;gap:6px;flex-wrap:wrap}
.itl-pop .acts a,.itl-pop .acts button{font:inherit;font-size:13px;font-weight:900;border-radius:10px;padding:6px 10px;border:0;background:#1d2a56;color:#fff;text-decoration:none;cursor:pointer}
.itl-pop small{display:block;margin-top:6px;font-size:11px;opacity:.7}
`;

function waitMap() { return new Promise(r => { const t = setInterval(() => { if (window.MDMap && window.L) { clearInterval(t); r(window.MDMap); } }, 100); }); }

async function start() {
  const [data, map] = await Promise.all([fetch('israel-timeline.json', { cache: 'no-cache' }).then(r => r.json()), waitMap()]);
  const E = data.events, Lf = window.L;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const bar = document.createElement('section'); bar.className = 'itl'; bar.id = 'itl'; bar.setAttribute('aria-label', L.title);
  let prevEra = null;
  bar.innerHTML = `<button type="button" class="nav" id="itlPrev" aria-label="${esc(L.prev)}">‹</button><div class="strip" id="itlStrip" role="group">` +
    E.map((e, i) => { const p = eraColor(e.era), first = e.era !== prevEra; prevEra = e.era;
      return `<button type="button" class="ev${e.kind === 'tradition' ? ' trad' : ''}" data-i="${i}" data-id="${esc(e.id)}" aria-pressed="false" style="--c:${p.c};--ink:${p.ink}"><span class="era">${first ? esc(ERA[e.era] || '') : ''}</span><span class="bar"><b>${e.battle ? '⚔️ ' : ''}${esc(yearLabel(e))}</b><span>${esc(tx(e.title))}</span></span></button>`; }).join('') +
    `</div><button type="button" class="nav" id="itlNext" aria-label="${esc(L.next)}">›</button><button type="button" class="nav bt" id="itlBattles" aria-pressed="false" title="${esc(L.battles)}">⚔️</button><button type="button" class="nav hide" id="itlHide" aria-label="${esc(L.hide)}" title="${esc(L.hide)}">✕</button>`;
  document.body.appendChild(bar);
  const openBtn = document.createElement('button'); openBtn.type = 'button'; openBtn.className = 'itl-open'; openBtn.textContent = '⏳ ' + L.show; openBtn.hidden = true; document.body.appendChild(openBtn);
  const $ = id => document.getElementById(id), strip = $('itlStrip');
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  // place libre : boutons de la carte remontés au-dessus de la frise ; frise masquée quand la fiche d'un סיור est ouverte
  const sync = () => {
    const sheet = $('sheet'), sheetOpen = !!(sheet && (sheet.classList.contains('peek') || sheet.classList.contains('full')));
    document.body.classList.toggle('itl-sheet', sheetOpen);
    const on = !bar.hidden && !sheetOpen && !document.body.classList.contains('list-view');
    document.body.classList.toggle('itl-on', on);
    document.documentElement.style.setProperty('--itl-h', on ? bar.offsetHeight + 'px' : '0px');
  };
  const show = v => { bar.hidden = !v; openBtn.hidden = v; store.set('mdl_itl', v ? '1' : '0'); sync(); };
  if ($('sheet')) new MutationObserver(sync).observe($('sheet'), { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', sync);
  $('itlHide').onclick = () => show(false); openBtn.onclick = () => show(true);
  show(store.get('mdl_itl') !== '0');

  const layer = Lf.layerGroup().addTo(map);
  let cur = -1;
  function select(i, fly = true) {
    if (i < 0 || i >= E.length) return; cur = i; const e = E[i], p = eraColor(e.era);
    strip.querySelectorAll('.ev').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const btn = strip.querySelector(`[data-i="${i}"]`); if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    layer.clearLayers();
    const ll = [e.lat, e.lon], zoom = e.at.startsWith('j3d:') ? 16 : 13;
    Lf.marker(ll, { icon: Lf.divIcon({ className: '', html: `<div class="itl-pulse" style="--c:${p.c}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), keyboard: false }).addTo(layer);
    const tour = e.at.startsWith('stop:') ? e.at.split(':')[1] : null;
    const html = `<div style="--c:${p.c};--ink:${p.ink}"><span class="y">${esc(yearLabel(e))}</span>${e.kind === 'tradition' ? `<span class="tr">${esc(L.tradition)}</span>` : ''}<h3>${e.battle ? '⚔️ ' : ''}${esc(tx(e.title))}</h3><p>${esc(tx(e.text))}</p>${e.more ? `<details><summary>${esc(L.more)}</summary><p>${num(esc(tx(e.more)))}</p></details>` : ''}${e.src ? `<span class="src">📜 ${esc(L.src)}: ${num(esc(tx(e.src)))}</span>` : ''}
      <div class="acts">${e.link ? `<a href="${esc(e.link)}">${esc(L.d3)}</a>` : ''}${tour && window.MDOpenTour ? `<button type="button" data-tour="${esc(tour)}">${esc(L.tour)} ${esc(tour)}</button>` : ''}</div>
      <small>${esc(L.where)} : ${e.qid ? `<a href="https://www.wikidata.org/wiki/${esc(e.qid)}" target="_blank" rel="noopener">Wikidata ${esc(e.qid)}</a>` : esc(e.from)}</small></div>`;
    const pop = Lf.popup({ className: 'itl-pop', maxHeight: Math.round(innerHeight * 0.45), autoPanPaddingTopLeft: [12, (document.getElementById('top')?.offsetHeight || 120) + 10], autoPanPaddingBottomRight: [12, (bar.hidden ? 0 : bar.offsetHeight) + 10], offset: [0, -8] }).setLatLng(ll).setContent(html);
    const openPop = () => { pop.openOn(map); const b = pop.getElement()?.querySelector('[data-tour]'); if (b) b.onclick = () => { map.closePopup(); window.MDOpenTour(b.dataset.tour); }; };
    if (fly) { map.once('moveend', openPop); map.flyTo(ll, zoom, { duration: 1.1 }); } else openPop();
    const u = new URL(location.href); u.searchParams.set('event', e.id); history.replaceState(history.state, '', u);
  }
  strip.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) select(Number(b.dataset.i)); });
  let battleOnly = false;
  const vis = i => !battleOnly || E[i].battle;
  const step = d => { let i = cur < 0 ? (d > 0 ? -1 : E.length) : cur; do { i += d; } while (i >= 0 && i < E.length && !vis(i)); if (i >= 0 && i < E.length) select(i); };
  $('itlPrev').onclick = () => step(-1); $('itlNext').onclick = () => step(1);
  $('itlBattles').onclick = () => {
    battleOnly = !battleOnly; $('itlBattles').setAttribute('aria-pressed', String(battleOnly));
    strip.querySelectorAll('.ev').forEach((b, k) => b.classList.toggle('off', !vis(k)));
    if (cur >= 0 && !vis(cur)) step(1); else if (cur >= 0) strip.querySelector(`[data-i="${cur}"]`).scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  const want = new URLSearchParams(location.search).get('event'), wi = E.findIndex(e => e.id === want);
  if (wi >= 0) { show(true); setTimeout(() => select(wi), 600); }
  window.MDTimeline = { events: E, select, get current() { return cur; }, get battleOnly() { return battleOnly; } };
}
start().catch(e => console.error('frise', e));
