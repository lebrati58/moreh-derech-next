/* Admin only. Never interpolate contributor content as HTML. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const token = () => MDL.store.get('mdl_admin');
 const node = (tag,text) => {const e=document.createElement(tag);e.textContent=text;return e;};
 async function refresh(){
  $('refresh').disabled=true;
  try{
   if(!token()) throw Error('יש להתחבר כמנהל תחילה.');
   const r=await MDL.rpc('admin_community_documents',{p_token:token()});
   if(!r||r.error||!Array.isArray(r.items)) throw Error('אין הרשאת מנהל או שהשירות אינו זמין.');
   $('items').replaceChildren();$('status').textContent='ממתינים לבדיקה: '+r.pending_count;
   for(const d of r.items){
    const card=node('article','');card.append(node('h2',d.title),node('p',d.author+' · '+d.tour_id),node('pre',d.body));
    card.style.whiteSpace='pre-wrap';card.style.overflowWrap='anywhere';
    if(d.source_url){try{const u=new URL(d.source_url);if(u.protocol==='https:'&&!u.username&&!u.password){const a=node('a','פתיחת מקור (קישור חיצוני)');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}}catch{}}
    for(const [state,label] of [['approved','אישור לאחר בדיקת מקור'],['rejected','דחייה']]){
     const b=node('button',label);b.onclick=async()=>{b.disabled=true;try{const r=await MDL.rpc('admin_review_community_document',{p_token:token(),p_id:d.id,p_status:state});if(!r?.ok)throw Error('הפעולה נכשלה או שהמסמך כבר נבדק.');await refresh();}catch(e){$('status').textContent=e.message;b.disabled=false;}};card.append(b);
    }
    $('items').append(card);
   }
  }catch(e){$('items').replaceChildren();$('status').textContent=e.auth?'יש להתחבר כמנהל מחדש.':e.message;}
  finally{$('refresh').disabled=false;}
 }
 $('refresh').onclick=refresh;refresh();
})();
