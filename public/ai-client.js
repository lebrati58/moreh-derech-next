// Client du correcteur IA : window.MDAI.grade({kind, task, answer, rubric}) → {ok, result} | {ok:false, error}
(function () {
  'use strict';
  function device() { try { var k = 'mdl_device_v1', d = localStorage.getItem(k); if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^0-9a-f-]/gi, '0').padEnd(16, '0'); localStorage.setItem(k, d); } return d; } catch (e) { return '00000000-0000-4000-8000-000000000000'; } }
  var MSG = { device_limit: 'הגעת למכסה היומית של הבדיקות החכמות — נסו שוב מחר.', global_limit: 'הבדיקה החכמה עמוסה היום — נסו שוב מחר.', not_configured: 'הבדיקה החכמה עדיין לא הופעלה.', answer_too_short: 'התשובה קצרה מדי לבדיקה.', answer_too_long: 'התשובה ארוכה מדי (עד 4000 תווים).' };
  async function grade(o) {
    var c = window.MDL_CONFIG; if (!c || !c.url) return { ok: false, error: 'not_configured', message: MSG.not_configured };
    try {
      var r = await fetch(c.url + '/functions/v1/grade-answer', { method: 'POST', headers: { 'content-type': 'application/json', apikey: c.anonKey, authorization: 'Bearer ' + c.anonKey }, body: JSON.stringify({ kind: o.kind, task: o.task, answer: o.answer, rubric: o.rubric, deviceId: device() }) });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.ok) return j;
      return { ok: false, error: j.error || 'http_' + r.status, message: MSG[j.error] || 'הבדיקה החכמה לא זמינה כרגע.' };
    } catch (e) { return { ok: false, error: 'network', message: 'אין חיבור — הבדיקה החכמה דורשת רשת.' }; }
  }
  window.MDAI = { grade: grade };
})();
