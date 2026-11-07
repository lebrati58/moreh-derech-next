import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url).pathname;
export const PGHOST='pglite';export const PGPORT='0';
export async function freshDb(name,{seed=true}={}){
 const db=new PGlite(); await db.waitReady;
 const c={query:async(sql,vals)=>vals ? db.query(sql,vals) : (await db.exec(sql)).at(-1),end:()=>db.close()};
 await c.query('create role anon; create role authenticated;');
 await c.query(readFileSync(root+'supabase/schema.sql','utf8'));
 if(seed)await c.query(readFileSync(root+'supabase/seed_demo.sql','utf8'));
 await c.query("select mdl.set_admin_password('test-password-123')");
 return c;
}
export async function rpc(c,fn,args={}){
 const keys=Object.keys(args);
 const r=await c.query(`select public.${fn}(${keys.map((k,i)=>`${k} => $${i+1}`).join(', ')}) as r`,keys.map(k=>{const v=args[k];return v!==null&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v;}));return r.rows[0].r;
}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
