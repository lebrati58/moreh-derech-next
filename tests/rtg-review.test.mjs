import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSelectedReview} from '../tools/rtg/review.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const id='d5b4cc4e18d3',review=read('content/rtg/reviews/'+id+'.json'),original=read('content/rtg/facts/'+id+'.json');
test('Ein Hanya keeps the full extraction and publishes a separately bounded, manually read selection',()=>{
 assert.equal(validateSelectedReview(review,original,18),true);assert.equal(original.items.length,60);assert.equal(original.questions.length,10);assert.ok(!original.review);
 assert.equal(review.items.length,5);assert.equal(review.questions.length,3);assert.equal(review.stations.length,3);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),review);
 const s=read('public/rtg/sites.json'),g=s.sites.find(g=>g.id==='ein-hanya');assert.equal(g.reviewedExtract,true);assert.equal(g.fullyAudited,false);assert.equal(g.contentStatus,'selected_passages_checked');
 assert.equal(g.contentReview.pageNumbering,'pdf_file_pages');assert.deepEqual(g.contentReview.pages,review.review.pages);
 assert.equal(s.coverage.primaryGuidesSelectedPassagesChecked,10);assert.equal(s.coverage.primaryGuidesExtractionToReview,0);assert.equal(s.coverage.regions.find(r=>r.id==='jerusalem_hills').selectedPassagesChecked,2);
});
test('review validation rejects invented or duplicate original question identities and altered expected answers',()=>{
 for(const mutate of [r=>r.questions[0].sourceQuestionIndex=90,r=>r.questions[1].sourceQuestionIndex=0,r=>r.questions[0].expected=['invented answer'],r=>r.questions[0].q='invented question',r=>r.questions[0].level=3]){const r=structuredClone(review);mutate(r);assert.throws(()=>validateSelectedReview(r,original,18),/question identity/);}
});
test('review validation rejects missing page evidence, unsupported stations and automatic verification labels',()=>{
 for(const mutate of [r=>r.questions[0].evidenceItems=[],r=>r.questions[0].refs=[18],r=>r.items[0].page=19,r=>r.stations[0].he='unread station',r=>r.review.method='automatic_extraction',r=>r.review.pageNumbering='printed_page_numbers']){const r=structuredClone(review);mutate(r);assert.throws(()=>validateSelectedReview(r,original,18));}
});
test('reviewed questions preserve original bank identity and level, without adding a duplicate bank',()=>{
 for(const q of review.questions){const old=original.questions[q.sourceQuestionIndex];assert.equal(q.q,old.q);assert.deepEqual(q.expected,old.expected);assert.equal(q.level,old.level);assert.ok(q.refs.every(p=>review.items.some(x=>x.page===p)));}
 const files=fs.readdirSync(new URL('../content/rtg/facts/',import.meta.url)).filter(x=>x.endsWith('.json'));
 assert.equal(files.length,30);assert.equal(files.reduce((n,f)=>n+read('content/rtg/facts/'+f).questions.length,0),235);
});

// Minimal DOM adapter exercises the actual reader/quiz code without a browser or production writes.
import vm from 'node:vm';
async function reader(hash,selected=review){
 const nodes=new Map(),saved=[];
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',hidden:false,handlers:{},addEventListener(e,fn){this.handlers[e]=fn;},focus(){}});return nodes.get(s);};
 const window={scrollTo(){},addEventListener(){},MDProgress:{tourStats(){return null;},saveTourRun(run){saved.push(run);return {saved:true,gained:0};}}};
 const context={window,document:{querySelector:node,querySelectorAll(){return [];}},location:{hash,search:''},localStorage:{getItem(){return null;}},URL,URLSearchParams,crypto:{randomUUID(){return 'test-run';}},setInterval(){return 1;},clearInterval(){},fetch:async url=>({json:async()=>url==='rtg/catalog.json'?read('public/rtg/catalog.json'):url.includes('/reviews/')?selected:original})};
 vm.runInNewContext(fs.readFileSync(new URL('../public/rtg-sheet.js',import.meta.url),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(new URL('../public/rtg-app.js',import.meta.url),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));return {node,saved};
}
test('complete legacy document still renders all existing questions with no partial-review scope leak',async()=>{
 const app=await reader('#/d/'+id),html=app.node('#facts').innerHTML;
 assert.ok(html.includes(original.questions[9].q));assert.ok(html.includes('10 שאלות'));assert.ok(html.includes('תמצית שחולצה — טרם אומתה'));
});
test('review quiz retains original question IDs, shared progress scope and selection on replay',async()=>{
 const shuffled=structuredClone(review);shuffled.questions=[review.questions[2],review.questions[0],review.questions[1]];
 const app=await reader('#/q/'+id+'/reviewed',shuffled);
 assert.ok(app.node('#view').innerHTML.includes('3 שאלות'));assert.ok(app.node('#view').innerHTML.includes('קטעים נבחרים שנבדקו בלבד'));
 app.node('#go').handlers.click();
 for(let i=0;i<3;i++){app.node('#chk').handlers.click();assert.ok(app.node('#res').innerHTML.includes('עמודי PDF:'));app.node('#nxt').handlers.click();}
 assert.equal(app.saved.length,1);assert.equal(app.saved[0].tourId,'rtg:'+id);assert.equal(app.saved[0].total,3);
 assert.deepEqual(Array.from(app.saved[0].answerDetails,x=>x.questionId),['q2','q0','q1']);
 app.node('#again').handlers.click();await new Promise(resolve=>setImmediate(resolve));assert.ok(app.node('#view').innerHTML.includes('קטעים נבחרים שנבדקו בלבד'));
 const legacy=await reader('#/q/'+id);assert.ok(legacy.node('#view').innerHTML.includes('10 שאלות'));assert.ok(!legacy.node('#view').innerHTML.includes('קטעים נבחרים שנבדקו בלבד'));
});

for(const [id,group,indices] of [['84ac7ba1e956','apollonia',[0,1,2]],['359f22ca4c1d','lachish',[2,4,5]]])test(group+' selected review retains original questions, stations, levels and page evidence',()=>{
 const r=read('content/rtg/reviews/'+id+'.json'),o=read('content/rtg/facts/'+id+'.json'),data=read('public/rtg/sites.json'),s=data.sites.find(s=>s.id===group),source=s.sources.find(x=>x.id===id);
 assert.equal(validateSelectedReview(r,o,source.pages),true);assert.equal(o.items.length,60);assert.equal(o.questions.length,10);assert.ok(!o.review);assert.equal(r.items.length,5);assert.equal(r.stations.length,3);assert.equal(r.questions.length,3);
 assert.deepEqual(r.questions.map(q=>q.sourceQuestionIndex),indices);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);assert.equal(s.reviewedExtract,true);assert.equal(s.fullyAudited,false);assert.deepEqual(s.contentReview.pages,r.review.pages);
 assert.equal(data.coverage.groups,21);assert.equal(data.coverage.selectedPassagesChecked,20);assert.equal(data.coverage.fullyAuditedContent,0);assert.equal(data.coverage.primaryGuidesSelectedPassagesChecked,10);
});

test('Migdal Tzedek bounded review preserves twelve original questions and physical PDF page references',()=>{
 const id='7ceae8bd0b7f',r=read('content/rtg/reviews/'+id+'.json'),o=read('content/rtg/facts/'+id+'.json'),data=read('public/rtg/sites.json'),s=data.sites.find(s=>s.id==='migdal-tzedek');
 assert.equal(validateSelectedReview(r,o,33),true);assert.equal(o.items.length,60);assert.equal(o.questions.length,12);assert.ok(!o.review);
 assert.equal(r.items.length,5);assert.deepEqual(r.stations.map(x=>x.sourceStationIndex),[2,6,7]);assert.deepEqual(r.questions.map(x=>x.sourceQuestionIndex),[0,4,5]);assert.deepEqual(r.questions.map(x=>x.level),[1,2,2]);
 assert.deepEqual(r.review.pages,[4,8,9,10,11]);assert.deepEqual(r.questions.map(x=>x.refs),[[11],[9,10],[4,8]]);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);
 assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.fullyAudited,false);assert.equal(s.coordinate.purpose,'site_reference_not_entrance');assert.equal(data.coverage.regions.find(r=>r.id==='central').selectedPassagesChecked,2);
});

for(const [id,group,count,indices,pages,stations] of [
 ['a755bcb21bd4','ashkelon',12,[0,2,9],[5,6,7,8,16],[0,2,3]],
 ['02311ff968b7','beit-guvrin',10,[0,1,2],[3,10,14,15],[0,1,2]]
])test(group+' selection keeps original question identities and bounded physical PDF references',()=>{
 const r=read('content/rtg/reviews/'+id+'.json'),o=read('content/rtg/facts/'+id+'.json'),data=read('public/rtg/sites.json'),s=data.sites.find(s=>s.id===group),source=s.sources.find(d=>d.id===id);
 assert.equal(validateSelectedReview(r,o,source.pages),true);assert.equal(o.items.length,60);assert.equal(o.questions.length,count);assert.ok(!o.review);
 assert.equal(r.items.length,5);assert.equal(r.questions.length,3);assert.deepEqual(r.questions.map(q=>q.sourceQuestionIndex),indices);assert.deepEqual(r.stations.map(s=>s.sourceStationIndex),stations);assert.deepEqual(r.review.pages,pages);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);
 assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.fullyAudited,false);assert.equal(s.regionStatus,'provisional');
 if(group==='ashkelon'){assert.match(s.practicalNotice.text,/30.6.2026/);assert.equal(s.practicalNotice.checkedAt,'2026-11-09');assert.equal(s.practicalNotice.source,'https://www.parks.org.il/category/newsflash/');assert.ok(!r.stations.some(x=>x.sourceStationIndex===1));assert.match(r.items.find(x=>x.sourceItemIndex===48).he,/2014–2015/);assert.match(r.items.find(x=>x.sourceItemIndex===18).he,/ייתכן/);}
});

for(const [id,group,itemCount,questionCount,indices,pages,stations] of [
 ['694d7c79feee','beit-yanai',59,11,[0,1,2],[3,6,10,11,14,16],[0,1,2]],
 ['4e67c0fdb83d','palmachim',60,10,[1,2,9],[6,11,12,13,14,18],[0,3,5]]
])test(group+' bounded coastal selection keeps original bank and physical page evidence',()=>{
 const r=read('content/rtg/reviews/'+id+'.json'),o=read('content/rtg/facts/'+id+'.json'),data=read('public/rtg/sites.json'),s=data.sites.find(s=>s.id===group);
 assert.equal(validateSelectedReview(r,o,s.sources.find(d=>d.id===id).pages),true);assert.equal(o.items.length,itemCount);assert.equal(o.questions.length,questionCount);assert.ok(!o.review);
 assert.equal(r.items.length,5);assert.deepEqual(r.questions.map(q=>q.sourceQuestionIndex),indices);assert.deepEqual(r.stations.map(s=>s.sourceStationIndex),stations);assert.deepEqual(r.review.pages,pages);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);
 assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.fullyAudited,false);assert.equal(s.coordinate.purpose,'site_reference_not_entrance');assert.equal(s.regionStatus,'source_checked');
 if(group==='palmachim'){assert.deepEqual(r.questions.map(q=>q.level),[1,1,3]);assert.match(r.items.find(x=>x.sourceItemIndex===47).he,/האסלאמית/);assert.match(r.items.find(x=>x.sourceItemIndex===47).he,/מטיפוס רומי/);}
 else {assert.match(r.items.find(x=>x.sourceItemIndex===30).he,/1991/);assert.match(r.items.find(x=>x.sourceItemIndex===30).he,/פעילות אדם/);}
});

for(const [id,group,indices,pages,stations] of [
 ['7561e969b354','shaar-hagai',[1,4,3],[2,4,5,6,17],[1,8]],
 ['40132a61a194','yarkon-sources',[2,4,7],[21,24,26,27,38],[4,6,10]]
])test(group+' bounded selection preserves bank and constrains guiding to sourced stations',()=>{
 const r=read('content/rtg/reviews/'+id+'.json'),o=read('content/rtg/facts/'+id+'.json'),data=read('public/rtg/sites.json'),s=data.sites.find(s=>s.id===group);
 assert.equal(validateSelectedReview(r,o,s.sources.find(d=>d.id===id).pages),true);assert.equal(o.questions.length,10);assert.ok(!o.review);
 assert.equal(r.items.length,group==='yarkon-sources'?6:5);assert.equal(r.items.filter(x=>x.kind==='fact').length,5);assert.deepEqual(r.questions.map(q=>q.sourceQuestionIndex),indices);assert.deepEqual(r.review.pages,pages);assert.deepEqual(r.stations.map(s=>s.sourceStationIndex),stations);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);
 assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.fullyAudited,false);assert.equal(s.coordinate.checkedAt,'2026-11-09');
 if(group==='shaar-hagai'){assert.equal(r.stations.length,2);assert.ok(r.stations.every(x=>[1,8].includes(x.sourceStationIndex)));assert.match(s.practicalNotice.text,/מחוץ למבנה בלבד/);assert.match(r.items[0].he,/מחוץ למבנה/);}
 else {assert.deepEqual(r.questions.map(q=>q.level),[1,2,3]);assert.ok(!r.questions.some(q=>[0,5,9].includes(q.sourceQuestionIndex)));assert.ok(r.questions.every(q=>q.accept.length===0));assert.match(r.items[2].he,/2006/);assert.match(r.items[3].he,/מחלות/);}
});

test('Beit Shean keeps the original extraction and only checks three traceable existing answers',()=>{
 const id='05b66ff5f227',o=read('content/rtg/facts/'+id+'.json'),r=read('content/rtg/reviews/'+id+'.json'),s=read('public/rtg/sites.json').sites.find(x=>x.id==='beit-shean');
 assert.equal(o.items.length,34);assert.equal(o.questions.length,10);assert.ok(!o.review);assert.equal(validateSelectedReview(r,o,2),true);
 assert.deepEqual(r.questions.map(q=>q.sourceQuestionIndex),[0,1,2]);assert.deepEqual(r.stations.map(x=>x.sourceStationIndex),[0,2,10]);assert.equal(r.items.filter(x=>x.kind==='fact').length,5);assert.deepEqual(r.review.pages,[1,2]);assert.equal(s.fullyAudited,false);assert.equal(s.reviewedExtract,true);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);
});

test('Tzippori new recall exercises have answer evidence and keep five facts separate from a guiding tip',()=>{
 const id='30acb401a568',f=read('content/rtg/facts/'+id+'.json'),s=read('public/rtg/sites.json').sites.find(x=>x.id==='tzippori');
 assert.deepEqual(f,read('public/rtg/facts/'+id+'.json'));assert.equal(f.review.method,'manual_read_of_rendered_pdf_pages');assert.equal(f.items.filter(x=>x.kind==='fact').length,5);assert.equal(f.items.filter(x=>x.kind==='tip').length,1);assert.deepEqual(f.questions.map(q=>q.level),[1,2,3]);assert.equal(f.questions.length,3);
 for(const q of f.questions){assert.equal(q.reviewStatus,'answer_source_checked');assert.ok(q.expected.length>0);for(const i of q.evidenceItems){assert.equal(f.items[i].reviewStatus,'source_passage_checked');assert.ok(q.refs.includes(f.items[i].page));assert.ok(f.items[i].quote);}}
 assert.ok(f.stations.every(x=>f.review.pages.includes(x.page)));assert.ok(!f.stations.some(x=>/אורפיאוס|מאגר/.test(x.he)));assert.match(s.practicalNotice.text,/אורפיאוס סגורה/);assert.match(s.practicalNotice.text,/פתוח חלקית/);assert.equal(s.practicalNotice.checkedAt,'2026-11-10');assert.equal(s.fullyAudited,false);
});

for(const [id,group] of [['5e6a5842db94','mamshit'],['6c9188fcb4cc','herodium']])test(group+' manual brochure has five facts, one tip and three bounded answer references',()=>{
 const f=read('content/rtg/facts/'+id+'.json'),s=read('public/rtg/sites.json').sites.find(s=>s.id===group);
 assert.deepEqual(f,read('public/rtg/facts/'+id+'.json'));assert.equal(f.review.method,'manual_read_of_rendered_pdf_pages');assert.equal(f.review.pageNumbering,'pdf_file_pages');assert.deepEqual(f.review.pages,[1,2]);assert.equal(f.items.filter(x=>x.kind==='fact').length,5);assert.equal(f.items.filter(x=>x.kind==='tip').length,1);assert.equal(f.stations.length,3);assert.deepEqual(f.questions.map(q=>q.level),[1,2,3]);
 for(const x of f.items){assert.equal(x.reviewStatus,'source_passage_checked');assert.ok(x.quote&&f.review.pages.includes(x.page));}
 for(const q of f.questions){assert.equal(q.reviewStatus,'answer_source_checked');assert.ok(q.expected.length>0);assert.deepEqual(q.refs,[2]);assert.ok(q.evidenceItems.length>0);for(const i of q.evidenceItems)assert.ok(q.refs.includes(f.items[i].page));}
 assert.equal(s.fullyAudited,false);assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.sources[0].driveComparison.status,'selected_text_concordance_only');assert.ok(!s.sources[0].driveCopyIdentityChecked);
 if(group==='mamshit'){assert.match(f.items[0].he,/10,800/);assert.match(f.items[1].he,/מי גשמים/);assert.match(s.practicalNotice.text,/אינו פעיל/);}
 else {assert.match(f.items[3].he,/המרד הגדול/);assert.match(f.items[4].he,/חדלו לאגור/);assert.match(s.practicalNotice.text,/1.1.26/);assert.match(s.contentReview.note,/מסמך הקורס/);}
});
