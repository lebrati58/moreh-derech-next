// Moreh Derech NEXT — Worker Cloudflare : sert le site statique (public/) et une seule API, /api/grade,
// qui fait corriger une unité d'הדרכה écrite (réponse ouverte) par Claude (API Anthropic).
//
// Sécurité :
//  - la clé ANTHROPIC_API_KEY est un Secret du Worker : elle n'apparaît jamais dans le navigateur ni dans le dépôt ;
//  - le MÉMOIRE DE CORRECTION (מחוון) est construit ICI, côté serveur, à partir des fichiers vérifiés du site
//    (exam/*.json : faits sourcés des documents du cours) — le navigateur n'envoie que des identifiants + le texte ;
//  - limites : 5 requêtes / minute par joueur et par IP (Rate Limiting de Cloudflare), 20 par jour par joueur
//    et 400 par jour au total (compteurs Supabase) ; texte ≤ 3 500 caractères ; réponse modèle ≤ 1 500 jetons ;
//  - résultats enregistrés dans Supabase (table privée mdl.ai_grades) par une fonction réservée au rôle
//    service_role (SUPABASE_SERVICE_ROLE_KEY, Secret du Worker).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const PER_PLAYER_DAY = 20, GLOBAL_DAY = 400, MAX_CHARS = 3500, MIN_WORDS = 25;
const ALLOWED_ORIGINS = [/^https:\/\/lebrati58\.github\.io$/, /^https:\/\/([a-z0-9-]+\.)*moreh-derech-next\.[a-z0-9-]+\.workers\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9_-]{1,40}$/i;

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, headers) });
function cors(req) {
  const o = req.headers.get('origin') || '';
  if (!o || !ALLOWED_ORIGINS.some(r => r.test(o))) return {};
  return { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' };
}

// ---------- Mémoire de correction (מחוון), à partir des fichiers vérifiés ----------
async function asset(env, req, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, req.url)));
  if (!r.ok) throw new Error('asset ' + path + ' ' + r.status);
  return r.json();
}
export async function buildRubric(load, b) {
  const regions = (await load('/exam/regions.json')).regions || [];
  const reg = regions.find(r => r.id === b.region && r.file);
  if (!reg) return { error: 'unknown_region' };
  const [data, models] = await Promise.all([load('/exam/' + reg.file), load('/exam/models.json')]);
  const mission = (data.missions || []).find(m => m.id === b.mission);
  if (!mission) return { error: 'unknown_mission' };
  const long = b.slot === 'long';
  const slot = long ? mission.long : (mission.slots || []).find(s => s.id === b.slot);
  if (!slot) return { error: 'unknown_slot' };
  const places = (data.sites || []).concat(data.roads || []);
  const site = places.find(p => p.id === b.site);
  if (!site) return { error: 'unknown_site' };
  const school = models.models[models.default] || {};
  const limit = long ? (school.limits || {}).longWords || 400 : (school.limits || {}).shortWords || 180;
  const ref = (data.models || {})[long ? 'long_' + site.id : site.id] || Object.values(data.models || {}).find(m => m.site === site.id && !long);
  return {
    region: data.he, missionTitle: mission.he, group: mission.group, brief: mission.brief,
    unit: slot.he, need: slot.need || [], kind: long ? 'long' : 'short', limit,
    expectedSite: slot.best ? ((places.find(p => p.id === slot.best) || {}).he || null) : null, why: slot.why || '',
    site: { id: site.id, he: site.he, periods: site.periods || [], facts: (site.facts || []).map((f, i) => ({ i, he: f.he })), conflicts: (site.conflicts || []).map(c => c.he) },
    rules: [].concat((models.longRules || {}).tips && long ? models.longRules.tips : [], (models.examRules || {}).tips || [], ['עד ' + limit + ' מילים; טקסט חורג נבדק בלי 2 השורות האחרונות']),
    reference: ref ? ref.text : null
  };
}

const SYSTEM = `אתה בוחן מנוסה של מבחן הרישוי למורי דרך בישראל (פרק ב׳ — יחידות הדרכה בכתב).
תפקידך: לבדוק תשובה פתוחה של תלמיד לפי מחוון שמבוסס אך ורק על חומר הקורס המאומת שמצורף (״עובדות מאומתות״).
כללים מחייבים:
1. עובדה נחשבת נכונה רק אם היא תואמת את העובדות המאומתות. אל תשתמש בידע כללי משלך כדי לאשר או לפסול.
2. טענה של התלמיד שאינה מופיעה בעובדות — אל תסמן אותה כשגיאה אלא אם היא סותרת עובדה מאומתת; סמן אותה כ״לא ניתן לאמת מחומר הקורס״.
3. נושא שמופיע ברשימת ״מחלוקות״ — אסור לקבוע בו עמדה; אם התלמיד קבע בוודאות, העיר שעדיף ניסוח זהיר.
4. בדוק גם: התאמה לדרישת היחידה ולקבוצה, מבנה (פתיחה / מה רואים / סיכום), הובלת הקבוצה ומיקום, שפה מקצועית, ומגבלת המילים.
5. ״תשובה מלאה״: כתוב יחידת הדרכה לדוגמה בעברית, בקול המדריך, באורך שלא עולה על מגבלת המילים, ורק מתוך העובדות המאומתות.
6. ציון שלם מ-0 עד 10. 10 = תשובה מצוינת ומדויקת; 5 = חלקית; 0–2 = לא עונה על הדרישה או שגויה ברובה.
החזר את התשובה רק דרך הכלי report_grade.`;

const TOOL = {
  name: 'report_grade',
  description: 'החזרת תוצאת הבדיקה של יחידת ההדרכה.',
  input_schema: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 10, description: 'ציון מתוך 10' },
      correct_points: { type: 'array', items: { type: 'string' }, description: 'מה נכון וטוב בתשובה' },
      missing_points: { type: 'array', items: { type: 'string' }, description: 'מה חסר לפי המחוון' },
      errors: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, why: { type: 'string' }, fact: { type: ['integer', 'null'], description: 'מספר העובדה המאומתת שנסתרה, אם יש' } }, required: ['claim', 'why'] }, description: 'טעויות עובדתיות (סותרות עובדה מאומתת) או טעויות מבנה' },
      unverifiable: { type: 'array', items: { type: 'string' }, description: 'טענות שאינן בחומר הקורס (לא נחשבות טעות)' },
      full_answer: { type: 'string', description: 'יחידת הדרכה מלאה לדוגמה, מתוך העובדות בלבד' },
      summary: { type: 'string', description: 'משוב קצר ומעודד, 1–2 משפטים' }
    },
    required: ['score', 'correct_points', 'missing_points', 'errors', 'full_answer', 'summary']
  }
};

export function buildPrompt(r, b) {
  return [
    `אזור: ${r.region}\nמשימה: ${r.missionTitle}\nהקבוצה: ${r.group}\nתיאור הטיול: ${r.brief}`,
    `דרישת היחידה: ${r.unit} (${r.kind === 'long' ? 'יחידה מורחבת' : 'יחידה קצרה'}, עד ${r.limit} מילים)`,
    r.expectedSite ? `האתר המומלץ במחוון: ${r.expectedSite}. נימוק: ${r.why}` : `אין אתר מומלץ מוכח במחוון. ${r.why}`,
    `האתר שהתלמיד בחר: ${r.site.he}${r.site.periods.length ? ' · תקופות: ' + r.site.periods.join(', ') : ''}`,
    `עובדות מאומתות מחומר הקורס על האתר (המספר בסוגריים):\n${r.site.facts.map(f => `(${f.i}) ${f.he}`).join('\n') || '— אין —'}`,
    r.site.conflicts.length ? `מחלוקות בין המקורות (לא לקבוע עמדה):\n${r.site.conflicts.map(c => '• ' + c).join('\n')}` : '',
    `כללי כתיבה מהקורס:\n${r.rules.map(x => '• ' + x).join('\n')}`,
    r.reference ? `תשובה לדוגמה מהקורס (להשוואה בלבד, לא חובה להיצמד אליה):\n${r.reference}` : '',
    `--- תשובת התלמיד ---\nמיקום: ${b.place || '—'}\nמשך: ${b.minutes || '—'} דק׳\nאמצעי הדרכה: ${b.method || '—'}\nטקסט (${wordCount(b.text)} מילים):\n${b.text}`
  ].filter(Boolean).join('\n\n');
}
export const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// ---------- Supabase (rôle service, fonctions dédiées) ----------
async function sb(env, fn, args) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: 'no_db' };
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify(args)
  });
  const t = await r.text();
  if (!r.ok) return { error: 'db_' + r.status, detail: t.slice(0, 200) };
  try { return JSON.parse(t); } catch (e) { return { error: 'db_parse' }; }
}

async function callClaude(env, rubric, body) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.GRADER_MODEL || DEFAULT_MODEL, max_tokens: 1500, temperature: 0,
      system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: 'report_grade' },
      messages: [{ role: 'user', content: buildPrompt(rubric, body) }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: 'anthropic_' + r.status, detail: (j.error && j.error.message || '').slice(0, 200) };
  const use = (j.content || []).find(c => c.type === 'tool_use' && c.name === 'report_grade');
  if (!use) return { error: 'anthropic_no_result' };
  const g = use.input || {};
  g.score = Math.max(0, Math.min(10, Math.round(Number(g.score) || 0)));
  for (const k of ['correct_points', 'missing_points', 'errors', 'unverifiable']) if (!Array.isArray(g[k])) g[k] = [];
  return { grade: g, model: j.model, usage: j.usage };
}

export async function handleGrade(req, env, ctx) {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method === 'GET') return json({ ok: true, service: 'grade', ai: !!env.ANTHROPIC_API_KEY, db: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), model: env.GRADER_MODEL || DEFAULT_MODEL }, 200, h);
  if (req.method !== 'POST') return json({ error: 'method' }, 405, h);
  const origin = req.headers.get('origin');
  if (origin && !Object.keys(h).length) return json({ error: 'origin' }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured', he: 'הבדיקה האוטומטית עוד לא הופעלה (חסר מפתח).' }, 503, h);
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400, h); }
  b = b || {};
  if (!UUID.test(b.player || '')) return json({ error: 'player' }, 400, h);
  for (const k of ['region', 'mission', 'site']) if (!ID.test(b[k] || '')) return json({ error: k }, 400, h);
  if (!(b.slot === 'long' || ID.test(b.slot || ''))) return json({ error: 'slot' }, 400, h);
  b.text = String(b.text || '').slice(0, MAX_CHARS + 1);
  if (b.text.length > MAX_CHARS) return json({ error: 'too_long', he: 'הטקסט ארוך מדי.' }, 413, h);
  if (wordCount(b.text) < MIN_WORDS) return json({ error: 'too_short', he: `כתבו לפחות ${MIN_WORDS} מילים לפני הבדיקה.` }, 400, h);
  for (const k of ['place', 'method']) b[k] = String(b[k] || '').slice(0, 300);
  b.minutes = Math.max(0, Math.min(240, parseInt(b.minutes, 10) || 0));

  // limites : par minute (Cloudflare) puis par jour (Supabase)
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  for (const key of ['p:' + b.player, 'ip:' + ip]) {
    if (env.GRADE_LIMITER) { const { success } = await env.GRADE_LIMITER.limit({ key }); if (!success) return json({ error: 'rate', he: 'יותר מדי בדיקות בדקה האחרונה. נסו שוב בעוד דקה.' }, 429, h); }
  }
  const q = await sb(env, 'ai_grade_quota', { p_sender: b.player });
  if (q && !q.skipped && !q.error) {
    if (q.player_today >= PER_PLAYER_DAY) return json({ error: 'quota', he: `הגעתם למכסה היומית (${PER_PLAYER_DAY} בדיקות). נסו מחר.` }, 429, h);
    if (q.all_today >= GLOBAL_DAY) return json({ error: 'quota_all', he: 'המכסה היומית של האפליקציה הסתיימה. נסו מחר.' }, 429, h);
  }

  const rubric = await buildRubric(p => asset(env, req, p), b).catch(e => ({ error: 'rubric', detail: String(e.message || e) }));
  if (rubric.error) return json({ error: rubric.error }, 400, h);
  const out = await callClaude(env, rubric, b);
  if (out.error) return json({ error: out.error, he: 'הבדיקה נכשלה. נסו שוב מאוחר יותר.', detail: out.detail }, 502, h);

  const save = await sb(env, 'ai_grade_save', {
    p_sender: b.player, p_region: b.region, p_mission: b.mission, p_slot: b.slot, p_site: b.site, p_kind: rubric.kind,
    p_answer: b.text, p_score: out.grade.score, p_result: out.grade, p_model: out.model || ''
  });
  return json({ ok: true, grade: out.grade, model: out.model, words: wordCount(b.text), limit: rubric.limit,
    saved: !!(save && save.ok), savedNote: save && (save.skipped || save.error) || null }, 200, h);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api/grade') return handleGrade(req, env, ctx);
    return env.ASSETS.fetch(req);
  }
};
