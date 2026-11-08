// Inventory only: a document mention is not a verified site association.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const catalog=await read('public/rtg/catalog.json');
const registry=await read('public/rtg/places.json');
const docs=new Map(catalog.docs.map(d=>[d.id,d]));
const sites=[];
for(const p of registry.places){
 const linked=(p.docs||[]).map(ref=>({ref,doc:docs.get(ref.id)})).filter(x=>x.doc);
 const processed=linked.filter(x=>x.doc.fx);
 let questions=0,items=0;
 for(const {doc} of processed){
  const f=await read('public/rtg/facts/'+doc.id+'.json');
  questions+=(f.questions||[]).length;items+=(f.items||[]).length;
 }
 sites.push({key:p.key,name:p.he,region:p.region||null,regionLabel:p.regionHe||null,
  sourceDocumentIds:linked.map(x=>x.doc.id),processedDocumentIds:processed.map(x=>x.doc.id),
  extractedItemsInLinkedDocuments:items,questionsInLinkedDocuments:questions,
  coordinates:p.lat!=null&&p.lon!=null?{lat:p.lat,lon:p.lon,status:'existing_unverified'}:null,
  reviewStatus:'not_audited',
  note:'Document associations include mentions. Counts refer to full linked documents, not necessarily this site. No factual validation is inferred.'});
}
const regions={};for(const s of sites){const k=s.region||'unassigned';const r=regions[k]||={entries:0,entriesWithProcessedDocuments:0};r.entries++;if(s.processedDocumentIds.length)r.entriesWithProcessedDocuments++;}
let reviewedCoverage=null;
try { reviewedCoverage=(await read('public/rtg/sites.json')).coverage; } catch(e) { if(e.code!=='ENOENT')throw e; }
const report={version:2,reviewedCoverage,catalogBuilt:catalog.built,scope:'Existing RTG catalog only; not an exhaustive inventory of Israel',
 totals:{documents:catalog.docs.length,documentsWithStructuredContent:catalog.docs.filter(d=>d.fx).length,
 documentsLinkedToGame:catalog.docs.filter(d=>d.ln?.length).length,registryEntries:sites.length,
 auditedSiteEntries:0,documentsByType:catalog.docs.reduce((a,d)=>(a[d.ty]=(a[d.ty]||0)+1,a),{})},
 regions,sites,priorityDocuments:catalog.docs.filter(d=>['guide','brochure','map'].includes(d.ty)).map(d=>({id:d.id,title:d.t,type:d.ty,structured:!!d.fx,source:d.u||null,reviewStatus:'not_audited'}))};
await mkdir(new URL('content/rtg/',root),{recursive:true});
await writeFile(new URL('content/rtg/national-coverage.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.totals));
