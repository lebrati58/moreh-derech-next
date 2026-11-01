// Rapport en hébreu de chaque synchronisation (« דוח עדכון — יום שלישי / יום שישי »), affiché dans l'administration.
const KIND = { courses: 'דוח עדכון — יום שלישי (שיעורים)', tours: 'דוח עדכון — יום שישי (סיורים)', all: 'דוח עדכון — סנכרון מלא',
  publish: 'דוח פרסום — פריטים שאושרו', rollback: 'דוח ביטול עדכון' };
const SKIP = { audio_without_transcript: 'הקלטה ללא תמלול', image: 'תמונה', unsupported_format: 'פורמט לא נתמך', pdf_too_large: 'PDF גדול מדי', not_usable: 'אין תוכן לימודי' };

export function buildReport(r) {
  const L = [];
  L.push(`# ${KIND[r.kind] || 'דוח עדכון'}`);
  L.push(`${r.dateLocal}${r.dryRun ? ' · ⚠️ הרצת ניסיון — שום דבר לא פורסם' : ''}${r.preview ? ' · 👁️ תצוגה מקדימה (ממתין לאישור)' : ''}`);
  L.push('');
  L.push(`📄 מסמכים שנסרקו: ${r.docs_scanned} · חדשים: ${r.docs_new} · עודכנו: ${r.docs_changed} · נותחו: ${r.docs_analyzed}`);
  L.push(`❓ שאלות חדשות שפורסמו: ${r.questions_created} · ✍️ שאלות פתוחות: ${r.open_created} · 📍 אתרים חדשים: ${r.sites_added} · ⏳ אירועים בציר הזמן: ${r.events_added}`);
  L.push(`🛠️ תיקונים מוצעים לשאלות קיימות: ${r.questions_corrected} · ⚖️ סתירות: ${r.contradictions} · 🕓 ממתינים לאישור מנהל: ${r.pending_count}`);
  if (r.byLevel) L.push(`רמות: קל ${r.byLevel[1] || 0} · בינוני ${r.byLevel[2] || 0} · קשה ${r.byLevel[3] || 0}`);
  if (r.docs && r.docs.length) {
    L.push('', '## מסמכים');
    for (const d of r.docs) L.push(`- ${d.status === 'processed' ? '✅' : d.status === 'error' ? '❌' : '⏭️'} ${d.path}${d.questions ? ` — ${d.questions} שאלות` : ''}${d.pending ? `, ${d.pending} לאישור` : ''}${d.skip ? ` (${SKIP[d.skip] || d.skip})` : ''}${d.error ? ` — ${d.error}` : ''}`);
  }
  if (r.newTours && r.newTours.length) L.push('', '## תיקיות סיור חדשות', ...r.newTours.map(t => `- סיור ${t.id}: ${t.title} → נוסף לרישום (סטטוס: לייבוא)`));
  if (r.audioOnly) L.push('', `🎙️ ${r.audioOnly} הקלטות בלי תמלול: יש להעלות תמלול ivrit.ai ‏(.docx) ליד קובץ השמע כדי שינותחו.`);
  if (r.errors && r.errors.length) L.push('', '## שגיאות', ...r.errors.map(e => `- ${e}`));
  if (r.commit) L.push('', `גרסה: ${r.commit.slice(0, 7)}${r.branch ? ` · ענף ${r.branch}` : ''}`);
  return L.join('\n');
}
