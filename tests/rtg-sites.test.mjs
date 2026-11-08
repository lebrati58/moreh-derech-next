import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const data=read('public/rtg/sites.json'),catalog=read('public/rtg/catalog.json'),docs=new Map(catalog.docs.map(d=>[d.id,d]));
test('ten primary guide groups, sixteen source identities, no reports or mere mentions',()=>{
 assert.equal(data.sites.length,10);assert.equal(new Set(data.sites.map(s=>s.id)).size,10);const included=[];
 for(const s of data.sites){assert.ok(s.sources.some(d=>d.id===s.guideId&&d.role==='primary_guide'&&d.type==='guide'));assert.equal(s.contentStatus,'extraction_to_review');assert.equal(s.fullyAudited,false);for(const d of s.sources){assert.ok(docs.has(d.id));assert.ok(['guide','brochure','map'].includes(d.type));assert.equal(d.associationStatus,'source_identity_checked');assert.match(d.evidence.pdfSha256,/^[a-f0-9]{64}$/);assert.ok(d.evidence.page>0);assert.equal(new URL(d.evidence.source).hostname.endsWith('parks.org.il'),true);included.push(d.id);}}
 assert.equal(new Set(included).size,16);assert.ok(!included.includes('efad1c0e33c3'),'Nahal Prat activity mentioning Apollonia is not a primary source');
});
test('map coordinates carry explicit evidence and are never represented as entrances',()=>{
 const checked=data.sites.filter(s=>s.coordinate);assert.equal(checked.length,3);for(const s of checked){let c=s.coordinate;assert.equal(c.status,'published_source_checked');assert.equal(c.purpose,'site_reference_not_entrance');assert.ok(c.lat>=29&&c.lat<=34&&c.lon>=34&&c.lon<=36.8);assert.ok(c.evidence&&c.checkedAt&&c.source);assert.match(c.source,/^https:\/\/en\.wikipedia\.org\//);}
 assert.equal(data.sites.filter(s=>!s.coordinate).length,7);assert.equal(data.sites.find(s=>s.id==='apollonia').navigation.query,'גן לאומי מבצר אפולוניה חניה');
});
test('regional coverage exposes zero coverage and separates geographic checks from content audit',()=>{
 const c=data.coverage;assert.equal(c.groups,10);assert.equal(c.associatedDocuments,16);assert.equal(c.priorityDocumentsTotal,100);assert.equal(c.sourceCheckedCoordinates,3);assert.equal(c.fullyAuditedContent,0);assert.equal(c.regions.reduce((n,r)=>n+r.groups,0),10);assert.ok(c.regions.find(r=>r.id==='arava_eilat').groups===0);assert.ok(c.regions.every(r=>r.fullyAuditedContent===0));
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
