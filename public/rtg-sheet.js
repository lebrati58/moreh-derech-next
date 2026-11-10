// Compact view of existing extractions. Never turns extraction into verification.
(function(root){
 'use strict';
 // Only explicit temporal expressions in the displayed source text. No inferred dates.
 function dateSpans(text){
  const year=String.raw`\d{1,4}(?:[–—-]\d{1,4})?`;
  const era=String.raw`(?:לפנה[״"׳']ס|לפני הספירה|לספירה|לסה[״"]נ)`;
  const ordinal=String.raw`(?:\d{1,2}|הראשונה|השנייה|השלישית|הרביעית|החמישית|השישית|השביעית|השמינית|התשיעית|העשירית)`;
  const expressions=[
   String.raw`(?:בערך\s+|סביב\s+)?(?:(?:מ|ב|ל)?שנת\s+)?${year}\s+${era}`,
   String.raw`(?:כנראה\s+)?(?:(?:ב?ראשית|מ?סוף|בתחילת|באמצע)\s+)?(?:ב|מ|ל)?ה?מאה\s+(?:ה[־-]?)?${ordinal}(?:\s+${era})?`,
   String.raw`(?:ב?ראשית\s+)?ב?שנות\s+ה[־-]?\d{2}`,
   String.raw`(?:כנראה\s+)?(?:(?:ב|מ|ל)?שנת|לשנים|בשנים|בקיץ|בספטמבר|במרץ|מרץ|בחפירות|ברעש|עד|ב[־-])\s*${year}(?:\s+${era})?`,
   String.raw`(?:1\d{3}|20\d{2})[–—-](?:1\d{3}|20\d{2})`
  ];
  const matches=[];
  for(const pattern of expressions)for(const m of String(text).matchAll(new RegExp(pattern,'gu'))){
   const end=m.index+m[0].length;
   if(/\d/.test(text[m.index-1]||'')||/\d/.test(text[end]||'')||(text[end]===','&&/\d/.test(text[end+1]||'')))continue;
   if(/^\s*(?:מטר|מטבעות|מושבים|נדבכים|גומחות|פרטים|מינים|דונם|דק[׳']|ק[״"]מ)/u.test(text.slice(end)))continue;
   matches.push({index:m.index,end,text:m[0]});
  }
  matches.sort((a,b)=>a.index-b.index||b.end-a.end);
  const result=[];for(const m of matches)if(!result.length||m.index>=result[result.length-1].end)result.push(m);
  return result;
 }
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
 root.MDRtgSheet={build,dateSpans};
})(typeof window==='undefined'?globalThis:window);
