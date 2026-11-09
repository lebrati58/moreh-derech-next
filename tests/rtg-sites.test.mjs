import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const data=read('public/rtg/sites.json'),catalog=read('public/rtg/catalog.json'),docs=new Map(catalog.docs.map(d=>[d.id,d]));
test('primary guides and brochure groups exclude reports and mere mentions',()=>{
 assert.equal(data.sites.length,19);assert.equal(new Set(data.sites.map(s=>s.id)).size,19);const included=[];
 for(const s of data.sites){assert.ok(s.sources.some(d=>d.id===s.primaryDocumentId&&(s.guideId?d.type==='guide':d.type==='brochure')));assert.ok(['extraction_to_review','selected_passages_checked'].includes(s.contentStatus));assert.equal(s.fullyAudited,false);for(const d of s.sources){assert.ok(docs.has(d.id));assert.equal(docs.get(d.id).gs,s.id);assert.ok(['guide','brochure','map'].includes(d.type));assert.equal(d.associationStatus,'source_identity_checked');assert.match(d.evidence.pdfSha256,/^[a-f0-9]{64}$/);assert.ok(d.evidence.page>0);assert.equal(new URL(d.evidence.source).hostname.endsWith('parks.org.il'),true);included.push(d.id);}}
 assert.equal(new Set(included).size,32);assert.ok(!included.includes('efad1c0e33c3'),'Nahal Prat activity mentioning Apollonia is not a primary source');
});
test('map coordinates carry explicit evidence and are never represented as entrances',()=>{
 const checked=data.sites.filter(s=>s.coordinate);assert.equal(checked.length,19);for(const s of checked){let c=s.coordinate;assert.equal(c.status,'published_source_checked');assert.equal(c.purpose,'site_reference_not_entrance');assert.ok(c.lat>=29&&c.lat<=34&&c.lon>=34&&c.lon<=36.8);assert.ok(c.evidence&&c.checkedAt&&c.source);assert.ok(['en.wikipedia.org','he.wikipedia.org','amudanan.co.il','www.hefer.org.il'].includes(new URL(c.source).hostname));}
 assert.equal(data.sites.filter(s=>!s.coordinate).length,0);assert.equal(data.sites.find(s=>s.id==='apollonia').navigation.query,'גן לאומי מבצר אפולוניה חניה');
});
test('regional coverage exposes zero coverage and separates geographic checks from content audit',()=>{
 const c=data.coverage;assert.equal(c.groups,19);assert.equal(c.associatedDocuments,32);assert.equal(c.priorityDocumentsTotal,100);assert.equal(c.sourceCheckedCoordinates,19);assert.equal(c.fullyAuditedContent,0);assert.equal(c.regions.reduce((n,r)=>n+r.groups,0),19);assert.ok(c.regions.find(r=>r.id==='jerusalem').groups===0);assert.ok(c.regions.every(r=>r.fullyAuditedContent===0));
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
 assert.deepEqual(data.coverage.associatedDocumentsByType,{guide:10,brochure:19,map:3});
 assert.equal(data.coverage.selectedPassagesChecked,18);
});
test('new summaries and answers carry bounded page evidence, without a whole-document verification claim',()=>{
 for(const id of ['08d4706c710e','989314676c9f','04fbdfd52b59','11e950d9cf0b','9b6c301b71c8','159ca3f67084']){
  const f=read('public/rtg/facts/'+id+'.json'),d=docs.get(id);
  assert.equal(f.items.length,5);assert.equal(f.questions.length,3);assert.equal(f.stations.length,3);
  assert.equal(f.review.status,'selected_passages_checked');
  for(const x of [...f.items,...f.stations]){assert.ok(x.page>0&&x.page<=d.pg);assert.ok(f.review.pages.includes(x.page));}
  for(const x of f.items){assert.equal(x.reviewStatus,'source_passage_checked');assert.ok(x.quote);}
  for(const q of f.questions){assert.equal(q.reviewStatus,'answer_source_checked');assert.ok(q.expected.length);assert.ok(q.evidenceItems.length);for(const i of q.evidenceItems){assert.ok(f.items[i]);assert.ok(q.refs.includes(f.items[i].page));}}
  assert.deepEqual(f,read('content/rtg/facts/'+id+'.json'));
 }
});

test('Hula reserve is the primary visit, not Agamon or a nearby Rosh Pina mention',()=>{
 const s=data.sites.find(s=>s.id==='hula-reserve');assert.equal(s.primaryDocumentId,'04fbdfd52b59');assert.equal(s.region,'upper_galilee');
 assert.deepEqual(docs.get(s.primaryDocumentId).ln.map(l=>l.site),['hula_reserve']);assert.equal(s.relatedSiteDistinction.relation,'different_visit_site_not_a_primary_source');
 assert.equal(new URL(s.relatedSiteDistinction.source).hostname,'agamon-hula.co.il');assert.equal(s.sources.length,1);
});
test('Yotvata safari closure stays dated practical information, separate from learning answers',()=>{
 const s=data.sites.find(s=>s.id==='hai-bar-yotvata'),n=s.practicalNotice;
 assert.equal(s.region,'arava_eilat');assert.equal(docs.get(s.primaryDocumentId).rg,'הערבה ואילת');assert.equal(n.scope,'safari_route_only');
 assert.equal(n.validFrom,'2026-11-08');assert.equal(n.validThrough,'2026-11-12');assert.equal(n.checkedAt,'2026-11-08');
 assert.equal(n.source,'https://www.parks.org.il/category/newsflash');
 const f=read('public/rtg/facts/'+s.primaryDocumentId+'.json');assert.ok(!JSON.stringify(f.questions).includes('2026'));
 assert.equal(data.coverage.missingCoordinates,0);assert.equal(data.coverage.regions.find(r=>r.id==='arava_eilat').groups,1);
});

test('catalog and game map expose grouped brochure links without hard-coded document allowlists',()=>{
 const places=read('public/rtg/places.json').places;
 const hula=places.find(p=>p.key==='exam:upper_galilee:hula_reserve');
 assert.equal(hula.docs.find(d=>d.id==='04fbdfd52b59').gs,'hula-reserve');
 const unrelated=places.find(p=>p.key==='exam:upper_galilee:rosh_pina');
 assert.ok(!unrelated.docs.some(d=>d.id==='04fbdfd52b59'));
 for(const d of catalog.docs.filter(d=>d.gs))assert.ok(data.sites.some(s=>s.id===d.gs&&s.sources.some(x=>x.id===d.id)));
});

test('Carmel editions form one place distinct from Yotvata and Kursi retains its unreviewed content status',()=>{
 const s=data.sites.find(s=>s.id==='hai-bar-carmel');assert.equal(s.region,'haifa_carmel');assert.deepEqual(s.sources.map(d=>d.language).sort(),['ar','en','he']);
 assert.ok(!s.sources.some(d=>d.id==='11e950d9cf0b'));assert.equal(s.sources.find(d=>d.language==='en').driveCopyIdentityChecked,true);
 const k=data.sites.find(s=>s.id==='kursi');assert.equal(k.region,'golan_south');assert.equal(k.contentStatus,'extraction_to_review');assert.ok(!k.contentReview);assert.ok(!read('content/rtg/facts/6ec9f0263969.json').review);
});
test('Banias removes the nearby Nimrod association and distinguishes the springs marker from the waterfall sector',()=>{
 const s=data.sites.find(s=>s.id==='banias');assert.ok(!docs.get(s.primaryDocumentId).ln);assert.match(s.practicalNotice.text,/לא במפל/);
 assert.equal(s.coordinate.source,'https://en.wikipedia.org/wiki/Banias');assert.equal(s.region,'golan_north');assert.ok(s.practicalNotice.source.includes('parks.org.il'));
 assert.equal(data.coverage.regions.filter(r=>r.groups>0).length,12);assert.equal(data.coverage.regions.filter(r=>r.groups===0).length,4);
});

test('four guide reference points distinguish beach, khan and internal station identities',()=>{
 const byId=id=>data.sites.find(s=>s.id===id);
 for(const id of ['shaar-hagai','beit-yanai','palmachim','yarkon-sources']){const s=byId(id),c=s.coordinate;assert.ok(c.label&&c.identityEvidence);assert.equal(c.identitySource,s.officialSite);assert.equal(c.checkedAt,'2026-11-09');assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.fullyAudited,false);}
 const beach=byId('beit-yanai').coordinate;assert.deepEqual([beach.lat,beach.lon],[32.3873,34.86428]);assert.equal(beach.sourceLocator.scope,'coordinate_only_not_pedagogical_source');assert.equal(beach.sourceLocator.page,6);assert.equal(beach.sourceLocator.row,8);
 const mill=byId('yarkon-sources').coordinate;assert.equal(mill.referenceKind,'station');assert.equal(mill.source,'https://amudanan.co.il/w/P913410');assert.deepEqual(mill.identityDocument,{id:'40132a61a194',page:19,section:'תחנה 4 — טחנת הקמח אל־מיר'});
 assert.match(byId('yarkon-sources').practicalNotice.text,/לא את תל אפק/);assert.equal(byId('shaar-hagai').regionStatus,'provisional');
 assert.equal(data.sites.filter(s=>s.guideId&&s.contentStatus==='extraction_to_review').length,0);
});
test('regional map totals do not turn geographic completion into national content coverage',()=>{
 assert.equal(data.coverage.sourceCheckedCoordinates,19);assert.equal(data.coverage.missingCoordinates,0);assert.equal(data.coverage.regions.find(r=>r.id==='coast').sourceCheckedCoordinates,4);
 assert.equal(data.coverage.regions.find(r=>r.id==='central').sourceCheckedCoordinates,2);assert.equal(data.coverage.regions.find(r=>r.id==='jerusalem_hills').sourceCheckedCoordinates,2);
 assert.equal(data.coverage.selectedPassagesChecked,18);assert.equal(data.coverage.fullyAuditedContent,0);assert.equal(data.coverage.regions.filter(r=>r.groups===0).length,4);
 const corr=read('content/rtg/corrections.json').documents;for(const id of ['694d7c79feee','4e67c0fdb83d','40132a61a194']){assert.equal(docs.get(id).rg,corr[id].regionVerified);assert.equal(corr[id].regionEvidence.scope,'region_only');}
});

test('new valley and Lower Galilee groups distinguish station markers, editions and limited content checks',()=>{
 for(const [slug,ids,region,lat,lon] of [['beit-shean',['05b66ff5f227','99df2734a062'],'valleys',32.501509302816,35.501524046134],['tzippori',['30acb401a568','8aea669f3849'],'lower_galilee',32.752222,35.281111]]){
  const s=data.sites.find(s=>s.id===slug);assert.deepEqual(s.sources.map(x=>x.id),ids);assert.equal(s.region,region);assert.equal(s.regionStatus,'source_checked');assert.equal(s.coordinate.referenceKind,'station');assert.equal(s.coordinate.purpose,'site_reference_not_entrance');assert.deepEqual([s.coordinate.lat,s.coordinate.lon],[lat,lon]);assert.ok(s.coordinate.identityDocument.page>0);
  for(const id of ids){assert.equal(docs.get(id).gs,slug);assert.equal(docs.get(id).rga,null);assert.ok(!docs.get(id).sitea);assert.equal(docs.get(id).ty,'brochure');assert.ok(docs.get(id).ln.every(l=>l.region===region));}
  const r=data.coverage.regions.find(x=>x.id===region);assert.deepEqual([r.groups,r.sourceCheckedCoordinates,r.selectedPassagesChecked,r.fullyAuditedContent],[1,1,1,0]);
 }
 assert.equal(data.coverage.associatedDocumentsByType.brochure,19);assert.equal(data.coverage.regions.filter(r=>r.groups===0).length,4);assert.equal(data.coverage.fullyAuditedContent,0);
});

test('place reader shows course-review limits for new manual brochures and retains legacy links only for separate selections',async()=>{
 const {default:vm}=await import('node:vm');
 for(const slug of ['tzippori','beit-shean']){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',hidden:false,value:'',append(){}});return nodes.get(id);};
  const context={document:{getElementById:node,createElement(){return {}; }},window:{scrollTo(){},addEventListener(){}},location:{hash:'#/s/'+slug,search:''},URL,URLSearchParams,fetch:async url=>({ok:true,json:async()=>read('public/'+url)})};
  vm.runInNewContext(fs.readFileSync(new URL('public/rtg-sheet.js',root),'utf8'),context);context.MDRtgSheet=context.window.MDRtgSheet;vm.runInNewContext(fs.readFileSync(new URL('public/rtg-sites.js',root),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));const s=data.sites.find(s=>s.id===slug),html=node('detail').innerHTML;
  assert.ok(html.includes(s.contentReview.note));assert.equal(html.includes('לכל החילוץ הקיים'),slug==='beit-shean');assert.ok(node('site-content').innerHTML.includes('3 שאלות'));
 }
});
