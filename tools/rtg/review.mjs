// Structural evidence checks never substitute for the recorded manual source reading.
export function validateSelectedReview(review, original, pageCount) {
 const fail=message=>{throw Error('Invalid selected review: '+message);};
 if(review.id!==original.id||review.review?.status!=='selected_passages_checked'||review.review?.method!=='manual_read_of_rendered_pdf_pages'||review.review?.pageNumbering!=='pdf_file_pages')fail('identity or manual scope');
 const pages=review.review.pages;
 const page=p=>Number.isInteger(p)&&p>0&&p<=pageCount&&pages.includes(p);
 if(!Array.isArray(pages)||!pages.length||pages.some(p=>!Number.isInteger(p)||p<1||p>pageCount))fail('reviewed pages');
 const used=new Set();
 for(const item of review.items||[]){if(item.reviewStatus!=='source_passage_checked'||!item.quote||!page(item.page)||!Number.isInteger(item.sourceItemIndex)||item.sourceItemIndex<0||!original.items[item.sourceItemIndex]||original.items[item.sourceItemIndex].page!==item.page)fail('item evidence');}
 for(const station of review.stations||[]){const old=original.stations[station.sourceStationIndex];if(!Number.isInteger(station.sourceStationIndex)||station.sourceStationIndex<0||station.reviewStatus!=='source_passage_checked'||!page(station.page)||!old||old.he!==station.he||old.page!==station.page)fail('station identity');}
 for(const q of review.questions||[]){const i=q.sourceQuestionIndex,old=original.questions[i];if(!Number.isInteger(i)||i<0||used.has(i)||!old||old.q!==q.q||old.level!==q.level||JSON.stringify(old.expected)!==JSON.stringify(q.expected))fail('question identity');used.add(i);
  if(q.reviewStatus!=='answer_source_checked'||!q.expected?.length||!q.refs?.length||q.refs.some(p=>!page(p))||!q.evidenceItems?.length||q.evidenceItems.some(i=>!review.items[i]||!q.refs.includes(review.items[i].page)))fail('answer page evidence');
 }
 if(!review.items?.length||!review.stations?.length||!review.questions?.length)fail('empty selection');
 return true;
}
