import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const data=read('public/rtg/sites.json'),catalog=read('public/rtg/catalog.json'),docs=new Map(catalog.docs.map(d=>[d.id,d]));
test('primary guides and brochure groups exclude reports and mere mentions',()=>{
 assert.equal(data.sites.length,12);assert.equal(new Set(data.sites.map(s=>s.id)).size,12);const included=[];
 for(const s of data.sites){assert.ok(s.sources.some(d=>d.id===s.primaryDocumentId&&(s.guideId?d.type==='guide':d.type==='brochure')));assert.ok(['extraction_to_review','selected_passages_checked'].includes(s.contentStatus));assert.equal(s.fullyAudited,false);for(const d of s.sources){assert.ok(docs.has(d.id));assert.ok(['guide','brochure','map'].includes(d.type));assert.equal(d.associationStatus,'source_identity_checked');assert.match(d.evidence.pdfSha256,/^[a-f0-9]{64}$/);assert.ok(d.evidence.page>0);assert.equal(new URL(d.evidence.source).hostname.endsWith('parks.org.il'),true);included.push(d.id);}}
 assert.equal(new Set(included).size,21);assert.ok(!included.includes('efad1c0e33c3'),'Nahal Prat activity mentioning Apollonia is not a primary source');
});
test('map coordinates carry explicit evidence and are never represented as entrances',()=>{
 const checked=data.sites.filter(s=>s.coordinate);assert.equal(checked.length,5);for(const s of checked){let c=s.coordinate;assert.equal(c.status,'published_source_checked');assert.equal(c.purpose,'site_reference_not_entrance');assert.ok(c.lat>=29&&c.lat<=34&&c.lon>=34&&c.lon<=36.8);assert.ok(c.evidence&&c.checkedAt&&c.source);assert.match(c.source,/^https:\/\/en\.wikipedia\.org\//);}
 assert.equal(data.sites.filter(s=>!s.coordinate).length,7);assert.equal(data.sites.find(s=>s.id==='apollonia').navigation.query,'גן לאומי מבצר אפולוניה חניה');
});
test('regional coverage exposes zero coverage and separates geographic checks from content audit',()=>{
 const c=data.coverage;assert.equal(c.groups,12);assert.equal(c.associatedDocuments,21);assert.equal(c.priorityDocumentsTotal,100);assert.equal(c.sourceCheckedCoordinates,5);assert.equal(c.fullyAuditedContent,0);assert.equal(c.regions.reduce((n,r)=>n+r.groups,0),12);assert.ok(c.regions.find(r=>r.id==='arava_eilat').groups===0);assert.ok(c.regions.every(r=>r.fullyAuditedContent===0));
 assert.deepEqual(read('content/rtg/national-coverage.json').reviewedCoverage,c);
});
test('verified regional corrections persist independently of automatic reclassification',()=>{
 const corr=read('content/rtg/corrections.json').documents;
 for(const id of ['84ac7ba1e956','7ceae8bd0b7f','359f22ca4c1d']){assert.equal(docs.get(id).rg,corr[id].regionVerified);assert.equal(docs.get(id).rga,null);assert.equal(corr[id].regionEvidence.scope,'region_only');assert.ok(corr[id].regionEvidence.source);}
 assert.equal(docs.get('84ac7ba1e956').rg,'מישור החוף');
});
test('site builder reproduces published data without inferred coordinates',()=>{
 const before=fs.readFileSync(new URL('public/rtg/sites.json',root),'utf8');execFileSync(process.execPath,['tools/rtg/build-sites.mjs'],{cwd:root,stdio:'pipe'});assert.equal(fs.readFileSync(new URL('public/rtg/sites.json',root),'utf8'),before);
});
test('new pages load their own assets, link to existing exercises and remain in the offline cache',()=>{
 const read=p=>fs.readFileSync(new URL(p,root),'utf8'),html=read('public/rtg-sites.html'),sw=read('public/sw.js');for(const asset of ['rtg-sites.js','rtg-sites.css','rtg/sites.json'])assert.ok(sw.includes('./'+asset));assert.match(html,/rtg-sheet\.js/);assert.match(read('public/rtg-sites.js'),/rtg\.html#\/q\//);assert.match(read('public/map.html'),/rtg-sites\.html/);assert.match(read('public/rtg.html'),/rtg-sites\.html/);for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())assert.doesNotThrow(()=>new Function(m[1]));
});

test('north and south expansions distinguish Avdat from Ein Avdat and remove the Nimrod association',()=>{
 assert.equal(data.sites.filter(s=>s.guideId).length,10);
 const avdat=data.sites.find(s=>s.id==='avdat'),dan=data.sites.find(s=>s.id==='tel-dan');
 assert.equal(avdat.region,'negev_south');assert.equal(dan.region,'upper_galilee');
 assert.ok(!avdat.sources.some(s=>s.id==='393d6fabdc5e'));
 assert.ok(!docs.get('08d4706c710e').ln);assert.equal(docs.get('989314676c9f').rg,'הנגב הדרומי');
 assert.deepEqual(data.coverage.associatedDocumentsByType,{guide:10,brochure:8,map:3});
 assert.equal(data.coverage.selectedPassagesChecked,2);
});
test('new summaries and answers carry bounded page evidence, without a whole-document verification claim',()=>{
 for(const id of ['08d4706c710e','989314676c9f']){
  const f=read('public/rtg/facts/'+id+'.json'),d=docs.get(id);
  assert.equal(f.items.length,5);assert.equal(f.questions.length,3);assert.equal(f.stations.length,3);
  assert.equal(f.review.status,'selected_passages_checked');
  for(const x of [...f.items,...f.stations]){assert.ok(x.page>0&&x.page<=d.pg);assert.ok(f.review.pages.includes(x.page));}
  for(const x of f.items){assert.equal(x.reviewStatus,'source_passage_checked');assert.ok(x.quote);}
  for(const q of f.questions){assert.equal(q.reviewStatus,'answer_source_checked');assert.ok(q.expected.length);assert.ok(q.evidenceItems.length);for(const i of q.evidenceItems){assert.ok(f.items[i]);assert.ok(q.refs.includes(f.items[i].page));}}
  assert.deepEqual(f,read('content/rtg/facts/'+id+'.json'));
 }
});
