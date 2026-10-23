import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');

test('class contest SQL keeps scores private behind RPCs', async () => {
  const sql = await read('supabase/class_contest.sql');
  assert.match(sql, /revoke all on mdl\.class_scores from public, anon, authenticated;/);
  assert.equal((sql.match(/security definer/g) || []).length, 4);
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 4);
  assert.match(sql, /perform mdl\.check_admin\(p_token\)/);
  assert.match(sql, /class_leaderboard\(\)[\s\S]*'name', s\.name, 'points'/);
  assert.doesNotMatch(sql.match(/function public\.class_leaderboard[\s\S]*?\$\$;/)[0], /token_hash/);
});

test('scores are only published with a name and explicit consent', async () => {
  const js = await read('public/progress.js');
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /if \(p\.consent && p\.name\)/);
  assert.match(js, /class_score_delete/);
  assert.match(js, /אני מסכים\/ה לפרסם/);
  assert.doesNotMatch(js, /geolocation/);
  const game = await read('public/guided-tour.html');
  assert.match(game, /recordProgress\(q,ok\)/);
  assert.match(game, /<script src="progress\.js"><\/script>/);
  const map = await read('public/map.html');
  assert.match(map, /pin\.gold/);
  assert.match(map, /<script src="progress\.js"><\/script>/);
  assert.match(await read('public/class.html'), /esc\(x\.name\)/);
});
