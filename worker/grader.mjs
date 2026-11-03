// מורה דרך EXAM — correction par Claude d'une intervention écrite (logique pure, testable sans réseau).
// Construit le prompt à partir des règles du cours et des faits sourcés du site, et valide la réponse.
// Le secret (ANTHROPIC_API_KEY) ne vit QUE sur le serveur (Cloudflare Worker) : jamais dans le dépôt ni dans l'app.

export const MODEL = 'claude-opus-5-5';

// Réponse attendue de Claude : une grille pédagogique, pas un verdict officiel.
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'max', 'summary', 'strengths', 'issues', 'facts_to_verify', 'corrected_text', 'corrected_words'],
  properties: {
    score: { type: 'number', description: 'ציון פדגוגי משוער' },
    max: { type: 'number' },
    summary: { type: 'string', description: 'משפט או שניים בעברית: הרושם הכללי' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'מה טוב, בעברית, קצר' },
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cat', 'he', 'fix'],
        properties: {
          cat: { type: 'string', enum: ['fit', 'structure', 'facts', 'words', 'fields', 'language', 'guiding'] },
          he: { type: 'string', description: 'הבעיה, בעברית' },
          fix: { type: 'string', description: 'איך לתקן, בעברית' }
        }
      }
    },
    facts_to_verify: { type: 'array', items: { type: 'string' }, description: 'טענות שאינן בחומר הקורס ולכן לא אומתו' },
    corrected_text: { type: 'string', description: 'גרסה מתוקנת של ההדרכה, בעברית, בתוך מגבלת המילים, שומרת על קול התלמיד' },
    corrected_words: { type: 'integer' }
  }
};

export const SYSTEM = `אתה בוחן ומאמן בקורס מורי דרך בישראל. אתה מתקן קטעי הדרכה כתובים לקראת הפרק השני של בחינת הרישוי של משרד התיירות.

כללים מחייבים:
1. בדוק רק לפי החומר שניתן לך (כללי הקורס, עובדות האתר עם מקורותיהן, וכלל המדריך). אל תמציא עובדות, תאריכים או מספרים. טענה של התלמיד שאינה בחומר — אל תפסול ואל תאשר: רשום אותה ב-facts_to_verify.
2. הבחן בין עובדה, מסורת והשערה. אם התלמיד מציג מסורת כעובדה — הערה.
3. יחידה קצרה: עד {shortWords} מילים (ירוק מ-{shortGreenFrom}); אמצעי הדרכה עד {methodWords} מילים. יחידה מורחבת: עד {longWords} מילים (ירוק מ-{longGreenFrom}), שלושה חלקים: פתיחה (מי, מה, למה), תיאור מה רואים תוך הולכת המודרכים בין 2–3 נקודות, סיכום. טקסט שחורג — "יבדק ללא 2 השורות האחרונות".
4. הדרכת דרך: מדברים רק על מה שרואים, רק כשרואים אותו; מצביעים ימינה/שמאלה בלבד; להציג את עצמך ואת המקטע.
5. הציון הוא הערכה פדגוגית משוערת (אין מחוון רשמי). יחידה קצרה: מתוך 8. יחידה מורחבת: מתוך 15. היה הוגן ומדויק, לא נדיב ולא קטנוני.
6. corrected_text: שכתב את הקטע של התלמיד — אותו קול, אותו מבנה כשהוא נכון — תקן עובדות לפי החומר בלבד, השלם מה שחסר (פתיחה/מה רואים/סיום), וקצר למגבלת המילים. אל תוסיף עובדות שאינן בחומר.
7. כתוב הכול בעברית פשוטה וברורה.`;

export function buildPrompt({ unit, site, model, mission, slot }) {
  const lim = model.limits;
  const sys = SYSTEM.replace(/\{(\w+)\}/g, (_, k) => lim[k]);
  const facts = (site && site.facts || []).map(f => `- ${f.he} [מקור: ${f.src}]`).join('\n');
  const conflicts = (site && site.conflicts || []).map(c => `- ⚠️ סתירה בין מקורות: ${c.he}`).join('\n');
  const long = unit.kind === 'long';
  const user = `## המשימה
${mission ? mission.brief : ''}
## היחידה הנדרשת
${slot ? slot.he : (long ? 'יחידת הדרכה מורחבת' : 'יחידת הדרכה קצרה')} — ${long ? 'מורחבת (עד ' + lim.longWords + ' מילים, מתוך 15)' : 'קצרה (עד ' + lim.shortWords + ' מילים, מתוך 8)'}
## האתר שנבחר
${site ? `${site.he} · תקופות: ${(site.periods || []).join(', ')} · סטטוס בקורס: ${(site.status || []).join(', ')}` : 'לא צוין'}
### עובדות מחומר הקורס (היחידות שמותר להסתמך עליהן)
${facts || '(אין)'}
${conflicts}
${site && site.note ? '### הערה: ' + site.note : ''}
## תשובת התלמיד
- הנקודה / מיקום: ${unit.place || '(ריק)'}
- משך: ${unit.minutes || '(ריק)'} דק׳
- אמצעי הדרכה: ${unit.method || '(ריק)'}
${long ? '- הנושא: ' + (unit.topic || '(ריק)') : ''}
- מספר מילים: ${wordCount(unit.text)}
### הטקסט
${unit.text || '(ריק)'}

תן את ההערכה לפי הסכימה. השדה max = ${long ? 15 : 8}.`;
  return { system: sys, user };
}

export function wordCount(t) { const s = String(t || '').trim(); return s ? s.split(/\s+/).length : 0; }

// Valide et nettoie ce que renvoie le modèle (jamais de confiance aveugle).
export function sanitize(out, long) {
  if (!out || typeof out !== 'object') throw new Error('bad_output');
  const max = long ? 15 : 8;
  const num = (x, lo, hi) => Math.min(hi, Math.max(lo, Number(x) || 0));
  const str = (x, n) => String(x == null ? '' : x).slice(0, n);
  const arr = (x, f, n) => (Array.isArray(x) ? x.slice(0, n).map(f) : []);
  const corrected = str(out.corrected_text, 6000);
  return {
    score: Math.round(num(out.score, 0, max) * 2) / 2, max,
    summary: str(out.summary, 600),
    strengths: arr(out.strengths, s => str(s, 300), 8),
    issues: arr(out.issues, i => ({ cat: SCHEMA.properties.issues.items.properties.cat.enum.includes(i && i.cat) ? i.cat : 'structure', he: str(i && i.he, 400), fix: str(i && i.fix, 400) }), 12),
    facts_to_verify: arr(out.facts_to_verify, s => str(s, 300), 10),
    corrected_text: corrected, corrected_words: wordCount(corrected),
    indicative: true, model: MODEL
  };
}

// Garde-fous côté serveur : on n'accepte que des interventions de taille raisonnable.
export function validateRequest(body) {
  if (!body || typeof body !== 'object') return 'bad_request';
  const u = body.unit; if (!u || typeof u !== 'object') return 'bad_request';
  if (!['short', 'long'].includes(u.kind)) return 'bad_kind';
  const n = wordCount(u.text); if (n < 20) return 'too_short'; if (n > 900) return 'too_long';
  if (String(u.text).length > 9000) return 'too_long';
  return null;
}
