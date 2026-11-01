// Validation technique de ce que Claude a produit, SANS faire confiance au modèle :
//  - chaque citation doit se retrouver dans le texte du document (après normalisation : nikkud, ponctuation, espaces) ;
//  - chaque nombre (année, mesure…) de la question, de la bonne réponse ou de l'explication doit figurer dans le document ;
//  - une question déjà présente (même texte ou très proche) est écartée ;
//  - une source non probante (réécriture IA, notes d'élève), une contradiction ou une correction → validation admin.
// Résultat : « published » (publiable automatiquement), « pending » (attente admin, avec la raison) ou « drop ».
import { createHash } from 'node:crypto';

const NIKKUD = /[֑-ׇ]/g;
export function norm(s) {
  return String(s || '').normalize('NFC').replace(NIKKUD, '')
    .replace(/[׳'`´]/g, '').replace(/[״"“”„]/g, '')
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
}
export const tokens = s => norm(s).split(' ').filter(Boolean);
export const fingerprint = s => createHash('sha256').update(norm(s)).digest('hex').slice(0, 24);

// Citation présente dans le texte : sous-chaîne exacte après normalisation, sinon fenêtre glissante
// couvrant au moins 85 % des mots de la citation, dans l'ordre approximatif (tolère un retour à la ligne ou une coquille).
export function quoteFound(quote, text, prepared) {
  const q = tokens(quote);
  if (q.length < 3) return false;
  const T = prepared || prepareText(text);
  if (T.joined.includes(' ' + q.join(' ') + ' ')) return true;
  const need = Math.ceil(q.length * 0.85), win = q.length + 4;
  const first = new Set(q.slice(0, 3));
  for (let i = 0; i < T.toks.length; i++) {
    if (!first.has(T.toks[i])) continue;
    const bag = new Map();
    for (let j = i; j < Math.min(T.toks.length, i + win); j++) bag.set(T.toks[j], (bag.get(T.toks[j]) || 0) + 1);
    let hit = 0;
    for (const w of q) { const n = bag.get(w); if (n) { hit++; bag.set(w, n - 1); } }
    if (hit >= need) return true;
  }
  return false;
}
export function prepareText(text) { const toks = tokens(text); return { toks, joined: ' ' + toks.join(' ') + ' ', nums: new Set(numbers(text)) }; }

export function numbers(s) { return (String(s || '').normalize('NFC').match(/\d[\d,.]*/g) || []).map(n => n.replace(/[,.]$/, '').replace(/,/g, '')).filter(n => n.length >= 2); }

export function similar(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}

const WEAK_EVIDENCE = { 'ai-edited': 'מקור: שכתוב AI של תמלול — לא מוכיח מה אמר המרצה', 'student-notes': 'מקור: סיכום של תלמיד — דורש אימות' };

export function validateQuestion(x, ctx) {
  const reasons = [];
  if (![1, 2, 3].includes(x.level)) return { status: 'drop', reasons: ['רמה לא תקינה'] };
  if (!x.q || !x.e || !x.quote) return { status: 'drop', reasons: ['שאלה, הסבר או ציטוט חסרים'] };
  const open = x.type === 'open';
  if (open) {
    if (!x.answer || !Array.isArray(x.points) || x.points.length < 2) return { status: 'drop', reasons: ['שאלה פתוחה בלי תשובת ייחוס ונקודות מפתח'] };
  } else {
    const a = (x.a || []).map(s => String(s).trim());
    if (a.length !== 4 || a.some(s => !s) || new Set(a.map(norm)).size !== 4) return { status: 'drop', reasons: ['נדרשות 4 תשובות שונות'] };
  }
  // Doublons : avec la banque existante et avec les questions déjà produites lors de cette synchronisation.
  const fp = fingerprint(x.q);
  if (ctx.fingerprints && ctx.fingerprints.has(fp)) return { status: 'drop', reasons: ['כפילות'], fingerprint: fp };
  for (const e of ctx.existing || []) if (similar(x.q, e.question) >= 0.8 && similar((x.a || [x.answer])[0], e.options ? e.options[e.correct || 0] : e.answer || '') >= 0.5) return { status: 'drop', reasons: ['שאלה דומה כבר קיימת: ' + e.id], fingerprint: fp };
  if (!quoteFound(x.quote, ctx.text, ctx.prepared)) reasons.push('הציטוט לא נמצא במסמך');
  const nums = numbers([x.q, open ? x.answer : (x.a || [])[0], x.e].join(' '));
  const missing = nums.filter(n => !ctx.prepared.nums.has(n));
  if (missing.length) reasons.push('מספרים שלא מופיעים במסמך: ' + missing.join(', '));
  if (WEAK_EVIDENCE[ctx.evidence]) reasons.push(WEAK_EVIDENCE[ctx.evidence]);
  if ((ctx.contradictedStops || []).some(s => s && x.stop && norm(x.stop).includes(norm(s)))) reasons.push('נושא שיש לגביו סתירה');
  return { status: reasons.length ? 'pending' : 'published', reasons, fingerprint: fp };
}

export function validateEvent(ev, ctx) {
  const reasons = [];
  if (!Number.isInteger(ev.year) || ev.year === 0 || Math.abs(ev.year) > 12000) return { status: 'drop', reasons: ['שנה לא תקינה'] };
  if (!ctx.periodIds.includes(ev.period)) reasons.push('תקופה לא מוכרת: ' + ev.period);
  if (!quoteFound(ev.quote, ctx.text, ctx.prepared)) reasons.push('הציטוט לא נמצא במסמך');
  if (!ctx.prepared.nums.has(String(Math.abs(ev.year)))) reasons.push('השנה לא מופיעה במסמך');
  for (const e of ctx.existingEvents || []) {
    const s = similar(ev.title, e.title);
    if (s >= 0.7 && (e.year === ev.year || (e.alts || []).includes(ev.year))) return { status: 'drop', reasons: ['אירוע קיים: ' + e.id] };
    if (s >= 0.7) reasons.push(`סתירה עם ציר הזמן: ${e.title} = ${e.yearText || e.year}, במסמך ${ev.yearText}`);
  }
  if (WEAK_EVIDENCE[ctx.evidence]) reasons.push(WEAK_EVIDENCE[ctx.evidence]);
  return { status: reasons.length ? 'pending' : 'published', reasons, fingerprint: fingerprint(ev.title + '|' + ev.year) };
}

export function validateSite(site, ctx) {
  const reasons = [];
  if (!site.name_he) return { status: 'drop', reasons: ['שם חסר'] };
  if ((ctx.knownSites || []).some(n => norm(n) === norm(site.name_he))) return { status: 'drop', reasons: ['כבר במפה'] };
  if (!site.visited) return { status: 'drop', reasons: ['לא בוקר'] };
  if (!quoteFound(site.quote, ctx.text, ctx.prepared)) reasons.push('הציטוט לא נמצא במסמך');
  if (!site.wiki_he && !site.wiki_en) reasons.push('אין ערך ויקיפדיה — המיקום לא ניתן לאימות');
  if (!ctx.tourId) reasons.push('לא ידוע לאיזה סיור שייך האתר');
  return { status: reasons.length ? 'pending' : 'published', reasons, fingerprint: fingerprint((ctx.tourId || '') + '|' + site.name_he) };
}
