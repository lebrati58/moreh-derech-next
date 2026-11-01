// Analyse d'un document du cours par l'API Claude (Anthropic). Sortie STRUCTURÉE (outil imposé) :
// questions à 3 niveaux, sites, itinéraire, événements datés, concepts, corrections, contradictions.
// Règle d'or : rien qui ne soit dans le document. Chaque élément porte une citation EXACTE du document,
// que validate.mjs revérifie mot à mot : une citation introuvable envoie l'élément en validation administrateur.

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const API = 'https://api.anthropic.com/v1/messages';
export const MAX_TEXT_CHARS = 120000;

const quote = { type: 'string', description: 'ציטוט מדויק, מילה במילה, מתוך המסמך (5–40 מילים) שמוכיח את הטענה. בלי שינוי, בלי תרגום.' };
const i18n = {
  type: 'object', description: 'Traductions (fr, en, ru) de la question, des réponses et de l’explication.',
  properties: Object.fromEntries(['fr', 'en', 'ru'].map(l => [l, { type: 'object', properties: { q: { type: 'string' }, a: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, e: { type: 'string' } }, required: ['q'] }]))
};

export const TOOL = {
  name: 'record_analysis',
  description: 'Enregistre l’analyse complète du document du cours de guides touristiques.',
  input_schema: {
    type: 'object',
    properties: {
      summary_he: { type: 'string', description: 'סיכום קצר (3–6 משפטים) של תוכן המסמך.' },
      doc_type: { type: 'string', enum: ['lesson', 'tour_material', 'transcript', 'exam_sample', 'student_notes', 'admin', 'other'] },
      usable: { type: 'boolean', description: 'false אם המסמך לא מכיל ידע לימודי (מנהלה, רשימת נוכחות, קובץ ריק…).' },
      periods: { type: 'array', items: { type: 'string' } },
      people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, quote }, required: ['name', 'quote'] } },
      events: {
        type: 'array', description: 'אירועים מתוארכים בלבד, כשהשנה כתובה במסמך.',
        items: { type: 'object', properties: {
          title: { type: 'string' }, year: { type: 'integer', description: 'שנה; לפני הספירה = מספר שלילי (586 לפנה״ס → -586). לעולם לא 0.' },
          yearText: { type: 'string', description: 'השנה כפי שהיא כתובה במסמך' }, period: { type: 'string', description: 'אחד ממזהי התקופות שנמסרו' },
          desc: { type: 'string' }, quote }, required: ['title', 'year', 'yearText', 'period', 'quote'] }
      },
      concepts: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' }, quote }, required: ['term', 'definition', 'quote'] } },
      sites: {
        type: 'array', description: 'אתרים/מקומות שבוקרו או נלמדו. אין להמציא קואורדינטות: רק שם הערך בוויקיפדיה.',
        items: { type: 'object', properties: {
          name_he: { type: 'string' }, wiki_he: { type: 'string', description: 'כותרת הערך בוויקיפדיה העברית, אם ידועה בוודאות; אחרת מחרוזת ריקה' },
          wiki_en: { type: 'string' }, kind: { type: 'string', enum: ['archaeological', 'historical', 'religious', 'nature', 'viewpoint', 'settlement', 'museum', 'other'] },
          visited: { type: 'boolean', description: 'true רק אם המסמך מראה שהקבוצה ביקרה במקום' }, quote }, required: ['name_he', 'kind', 'visited', 'quote'] }
      },
      route: {
        type: 'object', description: 'מסלול הנסיעה (סיפור דרך) אם המסמך מתאר אותו.',
        properties: { from: { type: 'string' }, to: { type: 'string' }, roads: { type: 'array', items: { type: 'string' } },
          stops: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, wiki_he: { type: 'string' }, side: { type: 'string', enum: ['right', 'left', 'ahead', 'unknown'] }, story: { type: 'string' }, quote }, required: ['name', 'side', 'quote'] } } }
      },
      questions: {
        type: 'array',
        items: { type: 'object', properties: {
          level: { type: 'integer', enum: [1, 2, 3], description: '1 = קל, 2 = בינוני, 3 = קשה' },
          type: { type: 'string', enum: ['mcq', 'chronology', 'geography', 'open'] },
          stop: { type: 'string', description: 'האתר / הנושא שהשאלה עוסקת בו' },
          q: { type: 'string' },
          a: { type: 'array', items: { type: 'string' }, description: 'בשאלות סגורות: בדיוק 4 תשובות, הנכונה ראשונה; מסיחים סבירים ושונים זה מזה.' },
          answer: { type: 'string', description: 'בשאלה פתוחה: תשובת ייחוס מלאה לבדיקת תשובות התלמידים.' },
          points: { type: 'array', items: { type: 'string' }, description: 'בשאלה פתוחה: 2–5 נקודות מפתח שתשובה טובה חייבת לכלול.' },
          e: { type: 'string', description: 'הסבר קצר לתשובה הנכונה' }, quote, i18n
        }, required: ['level', 'type', 'stop', 'q', 'e', 'quote'] }
      },
      corrections: {
        type: 'array', description: 'שאלות קיימות (מהרשימה שנמסרה) שהמסמך מתקן או מעדכן.',
        items: { type: 'object', properties: { existing_id: { type: 'string' }, issue: { type: 'string' }, corrected_answer: { type: 'string' }, quote }, required: ['existing_id', 'issue', 'quote'] }
      },
      contradictions: {
        type: 'array', description: 'סתירות: בתוך המסמך, או בינו לבין השאלות/האירועים הקיימים.',
        items: { type: 'object', properties: { topic: { type: 'string' }, claim_doc: { type: 'string' }, claim_existing: { type: 'string' }, existing_id: { type: 'string' }, quote }, required: ['topic', 'claim_doc', 'quote'] }
      }
    },
    required: ['summary_he', 'doc_type', 'usable', 'sites', 'events', 'questions', 'corrections', 'contradictions']
  }
};

export function buildPrompt(ctx) {
  const target = ctx.category === 'tours'
    ? `זהו חומר של סיור שטח${ctx.tourId ? ` (סיור ${ctx.tourId})` : ''}. התמקדו באתרים, במסלול הנסיעה ובסיפור הדרך, בהסברי המדריך ובשאלות הדרכה ומבחן.`
    : 'זהו חומר משיעור עיוני בכיתה. התמקדו בתקופות, דמויות, אירועים, תאריכים, מושגים והגדרות, ושאלות מבחן אפשריות.';
  return [
    'אתם עוזרים לבנות משחק לימוד לקורס מורי דרך בישראל. קראו את המסמך המצורף ומלאו את הכלי record_analysis.',
    target,
    'כללים מחייבים:',
    '1. אסור להמציא: כל תאריך, אתר, מסלול, שם או עובדה חייבים להופיע במסמך עצמו. אם משהו לא כתוב — אל תכתבו אותו.',
    '2. לכל פריט צרפו "quote" — ציטוט מדויק מילה במילה מהמסמך (לא פרפרזה). הציטוטים נבדקים אוטומטית מול הטקסט.',
    `3. כתבו לפחות 20 שאלות אם התוכן מאפשר (בערך שליש בכל רמה: קל / בינוני / קשה), מגוונות: רב-ברירה, כרונולוגיה, גאוגרפיה ושאלות פתוחות (כ-15% פתוחות). אם המסמך קצר — פחות שאלות, אבל רק טובות.`,
    '4. בשאלות סגורות: בדיוק 4 תשובות שונות, הנכונה ראשונה, מסיחים אמינים מאותו תחום. בשאלה פתוחה: "answer" ו-"points".',
    '5. עברית תקנית. הוסיפו i18n (fr, en, ru) לכל שאלה.',
    '6. אל תחזרו על שאלות שכבר קיימות ברשימה למטה. אם המסמך סותר שאלה או אירוע קיימים — רשמו ב-contradictions (או ב-corrections אם המסמך מתקן במפורש).',
    '7. אתרים: אל תמציאו קואורדינטות. wiki_he רק אם אתם בטוחים בכותרת הערך.',
    '8. events: רק כשהשנה כתובה במסמך. period חייב להיות אחד מהמזהים: ' + (ctx.periods || []).join(', ') + '.',
    `מסמך: ${ctx.title}\nמיקום בתיקייה: ${ctx.path}\nסוג ראיה: ${ctx.evidence}`,
    ctx.existingQuestions && ctx.existingQuestions.length ? 'שאלות קיימות (מזהה | שאלה | תשובה נכונה):\n' + ctx.existingQuestions.join('\n') : 'אין שאלות קיימות לנושא הזה.',
    ctx.existingEvents && ctx.existingEvents.length ? 'אירועים קיימים בציר הזמן (מזהה | כותרת | שנה):\n' + ctx.existingEvents.join('\n') : '',
    ctx.existingSites && ctx.existingSites.length ? 'אתרים שכבר במפה: ' + ctx.existingSites.join(', ') : ''
  ].filter(Boolean).join('\n\n');
}

export async function analyze(ctx, content, { apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.CLAUDE_MODEL || DEFAULT_MODEL, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante');
  const docBlock = content.pdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: content.pdf.toString('base64') }, title: ctx.title }
    : { type: 'document', source: { type: 'text', media_type: 'text/plain', data: content.text.slice(0, MAX_TEXT_CHARS) }, title: ctx.title };
  const body = {
    model, max_tokens: 16000, temperature: 0.2,
    tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: [docBlock, { type: 'text', text: buildPrompt(ctx) }] }]
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchImpl(API, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      const j = await r.json();
      const use = (j.content || []).find(b => b.type === 'tool_use' && b.name === TOOL.name);
      if (!use) throw new Error('Réponse Claude sans analyse structurée');
      return { analysis: use.input, usage: j.usage, model: j.model, truncated: !content.pdf && content.text.length > MAX_TEXT_CHARS };
    }
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 5000 * 2 ** attempt)); continue; }
    const t = await r.text().catch(() => '');
    throw new Error(`Claude ${r.status} : ${t.slice(0, 300)}`);
  }
  throw new Error('Claude indisponible (trop de tentatives)');
}
