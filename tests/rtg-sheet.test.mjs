import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
const sandbox={URL};vm.runInNewContext(readFileSync(new URL('../public/rtg-sheet.js',import.meta.url),'utf8'),sandbox);const build=sandbox.MDRtgSheet.build;
const doc={t:'Test site',u:'https://static.parks.org.il/guide.pdf'};
test('mini sheet excludes tips and missing evidence; never claims verification',()=>{
 const f={items:[{kind:'tip',he:'tip',page:1,quote:'tip'},{kind:'fact',he:'no source',page:1},{kind:'fact',he:'documented',page:2,quote:'source',topic:'history'}]};const m=build(doc,f);assert.equal(m.facts.length,1);assert.equal(m.reviewStatus,'extraction_to_review');assert.equal(m.facts[0].source,doc.u+'#page=2');assert.ok(m.mapSearch.includes('query=Test%20site'));
});
test('untrusted URLs never become source links',()=>{for(const u of ['javascript:alert(1)','https://parks.org.il.attacker.test/a','https://user:pass@parks.org.il/a'])assert.equal(build({...doc,u},{items:[{kind:'fact',he:'a',page:1,quote:'a'}]}).facts[0].source,null);});
test('all structured documents provide bounded sheets with traceable excerpts',()=>{
 const c=JSON.parse(readFileSync(new URL('../public/rtg/catalog.json',import.meta.url),'utf8'));
 for(const d of c.docs.filter(d=>d.fx)){const f=JSON.parse(readFileSync(new URL('../public/rtg/facts/'+d.id+'.json',import.meta.url),'utf8'));const m=build(d,f);assert.ok(m.facts.length<=5);for(const x of m.facts){assert.ok(x.page>0&&x.quote);assert.ok(f.items.some(y=>y.he===x.text&&y.page===x.page&&y.quote===x.quote));}assert.equal(m.questions,(f.questions||[]).length);}
});
