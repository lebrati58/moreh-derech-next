// Explicit source identities; never infer a visit from a mere mention.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const seed=await read('content/rtg/site-groups.json'),catalog=await read('public/rtg/catalog.json');const docs=new Map(catalog.docs.map(d=>[d.id,d]));
const seen=new Set();
const sites=seed.sites.map(s=>{
 if(seen.has(s.id))throw Error('Duplicate site '+s.id);seen.add(s.id);
 const sources=s.sources.map(r=>{const d=docs.get(r.id);if(!d||!['guide','brochure','map'].includes(d.ty)||r.associationStatus!=='source_identity_checked'||!r.evidence?.source||!r.evidence?.pdfSha256)throw Error('Unchecked or unsupported source '+r.id);return {...r,title:d.t,type:d.ty,language:d.lg,pages:d.pg,url:d.u,structured:!!d.fx};});
 if(!sources.some(r=>r.id===s.guideId&&r.type==='guide'))throw Error('Missing primary guide '+s.id);
 const c=s.coordinate;if(c&&(!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||c.lat<29||c.lat>34||c.lon<34||c.lon>36.8||!c.source||c.status!=='published_source_checked'||c.purpose!=='site_reference_not_entrance'))throw Error('Invalid coordinate '+s.id);
 return {...s,sources};
});
const course=(await read('public/exam/regions.json')).regions;
const zones=new Map(course.map(r=>[r.id,{id:r.id,label:r.he,groups:0,sourceCheckedCoordinates:0,fullyAuditedContent:0}]));
for(const [id,label]of [['central','מרכז הארץ'],['negev_south','הנגב הדרומי'],['arava_eilat','הערבה ואילת']])if(!zones.has(id))zones.set(id,{id,label,groups:0,sourceCheckedCoordinates:0,fullyAuditedContent:0});
for(const s of sites){const r=zones.get(s.region);if(!r)throw Error('Unknown region '+s.region);r.groups++;if(s.coordinate)r.sourceCheckedCoordinates++;}
const coverage={groups:sites.length,primaryGuides:sites.length,associatedDocuments:new Set(sites.flatMap(s=>s.sources.map(d=>d.id))).size,sourceCheckedCoordinates:sites.filter(s=>s.coordinate).length,missingCoordinates:sites.filter(s=>!s.coordinate).length,fullyAuditedContent:0,priorityDocumentsTotal:catalog.docs.filter(d=>['guide','brochure','map'].includes(d.ty)).length,regions:[...zones.values()]};
await writeFile(new URL('public/rtg/sites.json',root),JSON.stringify({version:1,checkedAt:seed.checkedAt,scope:seed.scope,coordinatePolicy:seed.coordinatePolicy,coverage,sites},null,2)+'\n');
console.log(JSON.stringify(coverage));
