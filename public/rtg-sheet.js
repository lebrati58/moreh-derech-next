// Compact view of existing extractions. Never turns extraction into verification.
(function(root){
 'use strict';
 function build(document,extraction){
  const valid=x=>x&&typeof x.he==='string'&&x.he.trim()&&Number.isInteger(x.page)&&x.page>0&&typeof x.quote==='string'&&x.quote.trim();
  const candidates=(extraction.items||[]).filter(x=>x.kind==='fact'&&valid(x));
  const facts=[],seen=new Set();
  // First cover different topics, then fill the remaining slots.
  for(const x of candidates)if(!seen.has(x.topic)&&facts.length<5){facts.push(x);seen.add(x.topic);}
  for(const x of candidates)if(facts.length<5&&!facts.includes(x)&&!facts.some(f=>f.he===x.he))facts.push(x);
  let source=null;try{const u=new URL(document.u);if(u.protocol==='https:'&&(u.hostname==='parks.org.il'||u.hostname.endsWith('.parks.org.il'))&&!u.username&&!u.password){u.hash='';source=u.href;}}catch{}
  const place=extraction.site||document.site||document.t;
  return {title:place,reviewStatus:'extraction_to_review',facts:facts.map(x=>({text:x.he,page:x.page,quote:x.quote,topic:x.topic,source:source?source+'#page='+x.page:null})),
   stations:(extraction.stations||[]).filter(x=>x&&typeof x.he==='string'&&Number.isInteger(x.page)&&x.page>0).map(x=>({text:x.he,page:x.page})),
   questions:Array.isArray(extraction.questions)?extraction.questions.length:0,
   mapSearch:place?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place):null};
 }
 root.MDRtgSheet={build};
})(typeof window==='undefined'?globalThis:window);
