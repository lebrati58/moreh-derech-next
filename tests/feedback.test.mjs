import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('feedback SQL keeps the table private and never stores coordinates', async () => {
  const sql = await read('supabase/feedback.sql');
  assert.match(sql, /revoke all on mdl\.feedback from public, anon, authenticated;/);
  assert.equal((sql.match(/security definer/g) || []).length, 5);
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 5);
  assert.match(sql, /key in \('tour','level','mode','question','stop','lang'\)/);
  assert.doesNotMatch(sql, /\b(lat|lon|latitude|longitude)\b/);
  assert.match(sql, /perform mdl\.check_admin\(p_token\)/);
});

test('feedback widget is wired on student pages and sends no location', async () => {
  const js = await read('public/feedback.js');
  assert.doesNotThrow(() => new Function(js));
  assert.doesNotMatch(js, /geolocation|coords|latitude/);
  for (const page of ['index', 'modes', 'map', 'guided-tour', 'tour-catalog', 'anecdotes', 'community-library']) {
    const html = await read(`public/${page}.html`);
    assert.match(html, /<script src="feedback\.js"/, page);
    assert.match(html, /<script src="config\.js"><\/script>/, page);
  }
  assert.match(await read('public/guided-tour.html'), /data-feedback="question"/);
  assert.match(await read('public/inbox.html'), /admin_feedback_list/);
});
