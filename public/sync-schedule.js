// Moreh Derech NEXT — calendrier des synchronisations automatiques du Drive.
// Module partagé : le Worker Cloudflare (déclencheur), le workflow GitHub (garde) et la page d'administration
// (prochaine synchronisation) utilisent EXACTEMENT les mêmes règles.
//
// Règles :
//  - mardi 08:00 heure d'Israël  → synchronisation des cours (« courses ») ;
//  - vendredi 08:00 heure d'Israël → synchronisation des סיורים (« tours ») ;
//  - jusqu'au 31 juillet 2027 inclus, puis plus rien (les contenus déjà intégrés restent).
// Cloudflare exprime les crons en UTC. Israël est à UTC+2 l'hiver et UTC+3 l'été : on déclare DEUX crons
// (05:00 et 06:00 UTC) et on ne garde que celui qui tombe à 08:00 à Jérusalem. Le changement d'heure
// est donc géré par le fuseau « Asia/Jerusalem » lui-même, sans table de dates codée en dur.

export const TZ = 'Asia/Jerusalem';
export const LOCAL_HOUR = 8;
export const END_DATE = '2027-07-31';
export const CRONS = ['0 5 * * 2,5', '0 6 * * 2,5'];
export const MODE_BY_WEEKDAY = { 2: 'courses', 5: 'tours' }; // 0 = dimanche … 6 = samedi
export const MODE_LABEL = { courses: 'עדכון שיעורים — יום שלישי', tours: 'עדכון סיורים — יום שישי', all: 'סנכרון מלא' };

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Date/heure locales à Jérusalem d'un instant donné.
export function jerusalemParts(date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WD[p.weekday], hour: Number(p.hour), minute: Number(p.minute) };
}

// Décision prise à chaque déclenchement du cron (ou par la garde du workflow).
export function decideScheduled(date, endDate = END_DATE) {
  const l = jerusalemParts(date);
  const mode = MODE_BY_WEEKDAY[l.weekday];
  if (!mode) return { run: false, reason: 'not_sync_day', local: l };
  if (l.date > endDate) return { run: false, reason: 'after_end_date', local: l };
  if (l.hour !== LOCAL_HOUR) return { run: false, reason: 'other_dst_slot', local: l };
  return { run: true, mode, local: l };
}

// Prochaines synchronisations (instants UTC), pour le tableau de bord.
export function nextRuns(from, count = 2, endDate = END_DATE) {
  const out = [];
  const t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours() + 1, 0, 0));
  for (let i = 0; i < 24 * 400 && out.length < count; i++) {
    const d = new Date(t.getTime() + i * 3600e3);
    const r = decideScheduled(d, endDate);
    if (r.run && d > from) out.push({ at: d.toISOString(), mode: r.mode, localDate: r.local.date });
    if (r.reason === 'after_end_date') break;
  }
  return out;
}
