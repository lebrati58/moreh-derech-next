import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshDb,rpc} from './helpers.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('moderation lifecycle, invalid input, private tables and admin authorization',async()=>{
 const c=await freshDb('mdl_security');
 try {
  await c.query(read('supabase/access_control.sql'));
  await c.query(`insert into mdl.access_sessions(token_hash,tz_hash,expires_at) values('legacy-test','legacy-person',now()+interval '180 days')`);
  await c.query(read('supabase/security_auth_76.sql'));
  assert.ok((await c.query(`select expires_at>now()+interval '179 days' kept from mdl.access_sessions where token_hash='legacy-test'`)).rows[0].kept);
  await c.query(`insert into mdl.access_people(tz_hash) values(mdl.tz_hash('123456789')) on conflict do nothing`);
  assert.ok((await rpc(c,'access_login',{p_tz:'123456789'})).token);
  assert.ok((await c.query(`select expires_at between now()+interval '29 days' and now()+interval '31 days' bounded from mdl.access_sessions where token_hash<>'legacy-test' order by expires_at desc limit 1`)).rows[0].bounded);
  assert.equal((await rpc(c,'admin_login',{p_password:'wrong'})).error,'bad_password');
  await c.query(read('supabase/community_documents.sql'));
  await c.query(read('supabase/community_documents.sql')); // repeat installation preserves state
  await c.query('begin');
  await c.query(read('tests/security-community.sql'));
  await c.query('rollback');
  const admin=(await rpc(c,'admin_login',{p_password:'test-password-123'})).token;
  assert.equal((await rpc(c,'admin_community_documents',{p_token:admin})).pending_count,0);
  await c.query('begin');
  await c.query(`insert into mdl.tour_documents(tour_id,title,body,content_hash,moderation_status) select '01','quota '||g,repeat('x',40),'quota-'||g,'pending' from generate_series(1,120) g`);
  assert.equal((await rpc(c,'community_submit_document',{p_tour_id:'01',p_title:'Quota blocked',p_author:'test',p_body:'x'.repeat(40)})).error,'busy_retry_later');
  await c.query('rollback');
 }finally{await c.end();}
});
