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
 assert.equal(s.coverage.primaryGuidesSelectedPassagesChecked,4);assert.equal(s.coverage.primaryGuidesExtractionToReview,6);assert.equal(s.coverage.regions.find(r=>r.id==='jerusalem_hills').selectedPassagesChecked,1);
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
 assert.equal(files.length,27);assert.equal(files.reduce((n,f)=>n+read('content/rtg/facts/'+f).questions.length,0),226);
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
 assert.equal(data.coverage.groups,17);assert.equal(data.coverage.selectedPassagesChecked,10);assert.equal(data.coverage.fullyAuditedContent,0);assert.equal(data.coverage.primaryGuidesSelectedPassagesChecked,4);
});

test('Migdal Tzedek bounded review preserves twelve original questions and physical PDF page references',()=>{
 const id='7ceae8bd0b7f',r=read('content/rtg/reviews/'+id+'.json'),o=read('content/rtg/facts/'+id+'.json'),data=read('public/rtg/sites.json'),s=data.sites.find(s=>s.id==='migdal-tzedek');
 assert.equal(validateSelectedReview(r,o,33),true);assert.equal(o.items.length,60);assert.equal(o.questions.length,12);assert.ok(!o.review);
 assert.equal(r.items.length,5);assert.deepEqual(r.stations.map(x=>x.sourceStationIndex),[2,6,7]);assert.deepEqual(r.questions.map(x=>x.sourceQuestionIndex),[0,4,5]);assert.deepEqual(r.questions.map(x=>x.level),[1,2,2]);
 assert.deepEqual(r.review.pages,[4,8,9,10,11]);assert.deepEqual(r.questions.map(x=>x.refs),[[11],[9,10],[4,8]]);assert.deepEqual(read('public/rtg/reviews/'+id+'.json'),r);
 assert.equal(s.contentStatus,'selected_passages_checked');assert.equal(s.fullyAudited,false);assert.equal(s.coordinate.purpose,'site_reference_not_entrance');assert.equal(data.coverage.regions.find(r=>r.id==='central').selectedPassagesChecked,1);
});
