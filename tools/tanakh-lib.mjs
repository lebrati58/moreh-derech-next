// Fonctions pures du calque « תנ״ך » (partagées par tools/build-tanakh.mjs et tests/tanakh.test.mjs).
export const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/־/g, ' ')
  .replace(/[֑-ׇ]/g, '').replace(/[^א-ת\s]/g, ' ').replace(/\s+/g, ' ').trim();
// lettres finales ramenées à leur forme normale (חברון → חברונה)
const fin = s => s.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ');
export function hasName(text, stems) {
  const t = ' ' + fin(strip(text)) + ' ';
  return stems.some(st => new RegExp('\\s[ובכלמהש]{0,3}' + fin(strip(st)).split(' ').join('\\s') + '(ה|תה|ו)?(?=\\s)').test(t));
}
const GEM = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
export function gem(n) { let s = ''; if (n % 100 === 15) { n -= 15; s = 'טו'; } else if (n % 100 === 16) { n -= 16; s = 'טז'; } let o = ''; for (const [v, l] of GEM) while (n >= v) { o += l; n -= v; } return o + s; }

