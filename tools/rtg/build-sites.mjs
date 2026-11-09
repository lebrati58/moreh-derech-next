// Explicit source identities; never infer a visit from a mere mention.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {validateSelectedReview} from './review.mjs';
const root=new URL('../../',import.meta.url);const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const seed=await read('content/rtg/site-groups.json'),catalog=await read('public/rtg/catalog.json');const docs=new Map(catalog.docs.map(d=>[d.id,d]));
const seen=new Set();
const sites=await Promise.all(seed.sites.map(async s=>{
 if(seen.has(s.id))throw Error('Duplicate site '+s.id);seen.add(s.id);
 const sources=s.sources.map(r=>{const d=docs.get(r.id);if(!d||!['guide','brochure','map'].includes(d.ty)||r.associationStatus!=='source_identity_checked'||!r.evidence?.source||!r.evidence?.pdfSha256)throw Error('Unchecked or unsupported source '+r.id);return {...r,title:d.t,type:d.ty,language:d.lg,pages:d.pg,url:d.u,structured:!!d.fx};});
 const primaryId=s.primaryDocumentId||s.guideId;
 if(!sources.some(r=>r.id===primaryId&&(s.guideId?r.type==='guide':['brochure','map'].includes(r.type))))throw Error('Missing primary source '+s.id);
 if(s.contentStatus==='selected_passages_checked'){
  const f=JSON.parse(await readFile(new URL('content/rtg/'+(s.reviewedExtract?'reviews/':'facts/')+primaryId+'.json',root),'utf8'));
  const primary=sources.find(r=>r.id===primaryId);
  if(s.reviewedExtract){const original=await read('content/rtg/facts/'+primaryId+'.json');validateSelectedReview(f,original,sources.find(r=>r.id===primaryId).pages);await mkdir(new URL('public/rtg/reviews/',root),{recursive:true});await writeFile(new URL('public/rtg/reviews/'+primaryId+'.json',root),JSON.stringify(f)+'\n');}
  if(f.review?.status!=='selected_passages_checked'||f.review?.method?.indexOf('manual_read')!==0||s.fullyAudited!==false)throw Error('Invalid selected review '+s.id);
  for(const x of f.items||[])if(x.reviewStatus!=='source_passage_checked'||!x.quote||!Number.isInteger(x.page)||x.page<1||x.page>primary.pages)throw Error('Invalid reviewed item '+s.id);
  for(const q of f.questions||[])if(!q.expected?.length||!q.evidenceItems?.length||q.evidenceItems.some(i=>!f.items[i]||!q.refs.includes(f.items[i].page)))throw Error('Unsourced answer '+s.id);
 }
 const c=s.coordinate;if(c&&(!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||c.lat<29||c.lat>34||c.lon<34||c.lon>36.8||!c.source||c.status!=='published_source_checked'||c.purpose!=='site_reference_not_entrance'))throw Error('Invalid coordinate '+s.id);
 return {...s,primaryDocumentId:primaryId,sources};
}));
const course=(await read('public/exam/regions.json')).regions;
const zones=new Map(course.map(r=>[r.id,{id:r.id,label:r.he,groups:0,sourceCheckedCoordinates:0,fullyAuditedContent:0,selectedPassagesChecked:0}]));
for(const [id,label]of [['central','מרכז הארץ'],['negev_south','הנגב הדרומי'],['arava_eilat','הערבה ואילת']])if(!zones.has(id))zones.set(id,{id,label,groups:0,sourceCheckedCoordinates:0,fullyAuditedContent:0,selectedPassagesChecked:0});
for(const s of sites){const r=zones.get(s.region);if(!r)throw Error('Unknown region '+s.region);r.groups++;if(s.contentStatus==='selected_passages_checked')r.selectedPassagesChecked++;if(s.coordinate)r.sourceCheckedCoordinates++;}
const coverage={groups:sites.length,primaryGuides:sites.filter(s=>s.guideId).length,primaryGuidesSelectedPassagesChecked:sites.filter(s=>s.guideId&&s.contentStatus==='selected_passages_checked').length,primaryGuidesExtractionToReview:sites.filter(s=>s.guideId&&s.contentStatus==='extraction_to_review').length,associatedDocuments:new Set(sites.flatMap(s=>s.sources.map(d=>d.id))).size,sourceCheckedCoordinates:sites.filter(s=>s.coordinate).length,missingCoordinates:sites.filter(s=>!s.coordinate).length,fullyAuditedContent:0,selectedPassagesChecked:sites.filter(s=>s.contentStatus==='selected_passages_checked').length,associatedDocumentsByType:Object.fromEntries(['guide','brochure','map'].map(t=>[t,new Set(sites.flatMap(s=>s.sources.filter(d=>d.type===t).map(d=>d.id))).size])),priorityDocumentsTotal:catalog.docs.filter(d=>['guide','brochure','map'].includes(d.ty)).length,regions:[...zones.values()]};
await writeFile(new URL('public/rtg/sites.json',root),JSON.stringify({version:1,checkedAt:seed.checkedAt,scope:seed.scope,coordinatePolicy:seed.coordinatePolicy,coverage,sites},null,2)+'\n');
console.log(JSON.stringify(coverage));
