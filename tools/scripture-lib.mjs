// Fonctions pures des calques « קוראן » et « ברית חדשה » (partagées par tools/build-scripture.mjs et tests/scripture.test.mjs).
// L'hébreu réutilise la reconnaissance du calque תנ״ך.
import { hasName as hasNameHe, gem } from './tanakh-lib.mjs';
export { hasNameHe, gem };

// Arabe : sans voyelles ni signes coraniques, alifs ramenés à ا, ى → ي, ة → ه.
export const arNorm = s => String(s || '')
  .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Préfixes admis : و ف ب ك ل (jusqu'à deux), article ال (ou لل après ل) ; suffixe : alif de tanwin (مصرا).
export function hasNameAr(text, stems) {
  const t = ' ' + arNorm(text) + ' ';
  return stems.some(st => {
    const s = arNorm(st), art = s.startsWith('ال'), core = art ? s.slice(2) : s;
    const body = core.split(' ').join('\\s');
    return new RegExp('\\s(?:[وفبكل]{0,2}' + (art ? 'ال' : '(?:ال)?') + '|[وف]?لل)' + body + 'ا?(?=\\s)').test(t);
  });
}

// Anglais : mot entier, sans casse, possessif admis.
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function hasNameEn(text, names) {
  const t = String(text || '');
  return names.some(n => new RegExp('(?:^|[^A-Za-z])' + reEsc(n).split(' ').join('\\s+') + "(?:'s)?(?![A-Za-z])", 'i').test(t));
}

// Un verset publié contient-il le nom, dans sa langue ?
export function verseHasName(ref, place) {
  if (ref.lang === 'ar') return hasNameAr(ref.verse, place.match);
  if (ref.lang === 'en') return hasNameEn(ref.verse, place.match_en || []);
  return hasNameHe(ref.verse, place.match);
}

// Événement historique : l'année doit figurer (en chiffres, nombre entier) dans le texte.
export const hasYear = (text, year) => new RegExp('(^|\\D)' + year + '(\\D|$)').test(String(text || ''));
export function yearSentence(text, year) {
  const ss = String(text || '').split(/(?<=[.!?])\s+/);
  const s = ss.find(x => hasYear(x, year)) || '';
  return s.length > 320 ? s.slice(0, 317).trim() + '…' : s;
}
