// Classe un fichier du Drive d'après son chemin et son type.
//  - « 2. סיורים / סיור NN … »  → catégorie « tours », tourId « NN » (synchronisation du vendredi) ;
//  - « 1. שיעורים », « 5. מאורגן לפי תקופות », « 6. מבחנים לדוגמא », « קטעי כתיבה … » → « courses » (mardi) ;
//  - le reste → « other » (analysé seulement lors d'une synchronisation complète).
// Nature du contenu : texte lisible, PDF (lu par Claude), audio/vidéo (pas analysable sans transcription), autre.

const TOURS_ROOT = /^\s*2\.\s*סיורים/;
const COURSE_ROOTS = [/^\s*1\.\s*שיעורים/, /^\s*5\.\s*מאורגן לפי תקופות/, /^\s*6\.\s*מבחנים/, /קטעי כתיבה/];

export function tourIdFromPath(path) {
  const segs = path.slice(1, -1), last = path[path.length - 1] || '';
  for (const [i, seg] of segs.concat([last]).entries()) {
    const isFolder = i < segs.length;
    const m = /סיור\s*(?:מס[׳'״"]?\s*|מספר\s*)?(\d{1,2})(?!\d)/.exec(seg) || (isFolder && /^\s*(\d{1,2})\s*[-–—.]\s*\S/.exec(seg));
    if (m && +m[1] >= 1 && +m[1] <= 60) return String(+m[1]).padStart(2, '0');
  }
  return null;
}

export function contentKind(file) {
  const m = file.mimeType || '', n = (file.name || '').toLowerCase();
  if (m === 'application/vnd.google-apps.document') return 'gdoc';
  if (m === 'application/vnd.google-apps.presentation') return 'gslides';
  if (m === 'application/vnd.google-apps.spreadsheet') return 'gsheet';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || n.endsWith('.docx')) return 'docx';
  if (m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || n.endsWith('.pptx')) return 'pptx';
  if (/^text\//.test(m) || /\.(txt|md|srt|vtt)$/.test(n)) return 'text';
  if (/^(audio|video)\//.test(m) || /\.(mp3|m4a|wav|ogg|aac|mp4|mov|webm|opus)$/.test(n)) return 'media';
  if (/^image\//.test(m)) return 'image';
  return 'other';
}

export function classify(file) {
  const path = file.path || [file.name];
  const top = path[0] || '';
  const kind = contentKind(file);
  let category = 'other', tourId = null;
  if (TOURS_ROOT.test(top)) { category = 'tours'; tourId = tourIdFromPath(path); }
  else if (COURSE_ROOTS.some(r => r.test(top))) category = 'courses';
  const name = (file.name || '').toLowerCase();
  const recording = kind === 'media' || /הקלטה|הקלטות|recording/.test(path.join('/'));
  // Les « réécritures IA » et notes d'élèves ne prouvent pas ce qu'a dit le prof : on le note (voir content/tours/README.md).
  const evidence = /הורחב|ועובד|copy of/i.test(file.name || '') ? 'ai-edited'
    : /סיכום של|הסיכום שלי|סטודנט|תלמיד/.test(file.name || '') ? 'student-notes'
    : kind === 'docx' && recording ? 'transcript' : 'course-doc';
  return { category, tourId, kind, recording, evidence, period: category === 'courses' ? (path[1] || null) : null, ext: name.split('.').pop() };
}

export function inMode(c, mode) {
  if (mode === 'all') return true;
  if (mode === 'tours') return c.category === 'tours';
  if (mode === 'courses') return c.category === 'courses';
  return false;
}
