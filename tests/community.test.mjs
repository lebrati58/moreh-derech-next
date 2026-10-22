import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(script => script.trim());
}

test('community creator supports public publishing and previous personal share link', async () => {
  const html = await read('public/community.html');
  assert.match(html, /id="publish"/);
  assert.match(html, /id="share"/);
  assert.match(html, /community_publish_quiz/);
  assert.match(html, /community_get_quiz/);
  assert.match(html, /community_report_quiz/);
  assert.match(html, /community_delete_quiz/);
  assert.match(html, /#route=/);
  assert.match(html, /community-library\.html/);
  for (const script of inlineScripts(html)) assert.doesNotThrow(() => new Function(script));
});

test('shared library links to canonical id route, not a user-provided URL', async () => {
  const html = await read('public/community-library.html');
  assert.match(html, /community_list_quizzes/);
  assert.match(html, /community\.html\?id=/);
  assert.match(html, /textContent/);
  assert.match(html, /href="contribute\.html"/);
  for (const script of inlineScripts(html)) assert.doesNotThrow(() => new Function(script));
});

test('public RPC migration keeps tables private and validates questions server-side', async () => {
  const sql = await read('supabase/community_quizzes.sql');
  assert.match(sql, /create table if not exists mdl\.community_quizzes/i);
  assert.match(sql, /create table if not exists mdl\.community_quiz_reports/i);
  assert.match(sql, /revoke all on mdl\.community_quizzes, mdl\.community_quiz_reports from public,anon,authenticated;/i);
  assert.equal((sql.match(/security definer/g) || []).length, 5);
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 5);
  assert.match(sql, /jsonb_array_length\(v_q->'o'\)<>4/);
  assert.match(sql, /community_publish_quiz/);
  assert.match(sql, /community_get_quiz/);
  assert.match(sql, /community_list_quizzes/);
  assert.match(sql, /community_report_quiz/);
  assert.match(sql, /community_delete_quiz/);
});

test('navigation provides both creation and public community library', async () => {
  for (const path of ['public/index.html', 'public/modes.html', 'public/map.html']) {
    const html = await read(path);
    assert.match(html, /community\.html/);
    assert.match(html, /community-library\.html/);
    for (const script of inlineScripts(html)) assert.doesNotThrow(() => new Function(script));
  }
});
