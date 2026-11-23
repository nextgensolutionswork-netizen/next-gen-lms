import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getLeads, updateLeadDetails } from '@/lib/services/crm-service';
import { store } from '@/lib/services/data-store';
import type { UserProfile } from '@/types';

const state = vi.hoisted(() => ({ calls: [] as any[], tables: {} as Record<string, any[]>, fail: false }));
vi.mock('@/lib/supabase/db',()=>({isLiveSupabaseEnabled:()=>true,createClient:vi.fn()}));
vi.mock('@/lib/services/audit-service',()=>({recordAuditLog:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const call:any={table,filters:[],offset:0,end:999}; state.calls.push(call);
 const q:any={
  select:()=>q,eq:(k:string,v:any)=>{call.filters.push([k,v]);return q;},in:(k:string,v:any[])=>{call.filters.push([k,v]);return q;},
  order:()=>q,range:(a:number,b:number)=>{call.offset=a;call.end=b;return q;},
  update:(data:any)=>{call.update=data;return q;},single:()=>{call.single=true;return q;},maybeSingle:()=>{call.single=true;return q;},
  then:(resolve:any)=>{
   if(state.fail&&table==='leads') return Promise.resolve({data:null,error:{message:'database unavailable'}}).then(resolve);
   const rows=(state.tables[table]||[]).filter(r=>call.filters.every(([k,v]:any)=>Array.isArray(v)?v.includes(r[k]):r[k]===v));
   if(call.update) rows.forEach(r=>Object.assign(r,call.update));
   return Promise.resolve({data:call.single?rows[0]||null:rows.slice(call.offset,call.end+1),error:null}).then(resolve);
  }
 };return q;
}})}));
const actor:UserProfile={id:'owner',role:'counsellor',tenant_id:'default',is_active:true,email:'owner@example.com',full_name:'Owner',created_at:'',updated_at:''};
beforeEach(()=>{
 state.calls=[];state.fail=false;store.admissions=[];
 state.tables={profiles:[actor],leads:[{id:'own',created_by:'owner',tenant_id:'default',full_name:'Own',phone:'9876543210',email:'o@example.com',stage:'New',created_at:'2026-01-01',updated_at:''},
 {id:'other',created_by:'another',tenant_id:'default',full_name:'Private',stage:'New',created_at:'2026-01-01'},
 {id:'cross-tenant',created_by:'owner',tenant_id:'elsewhere',full_name:'Private',stage:'New',created_at:'2026-01-01'}]};
 vi.spyOn(store,'persist').mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());
it('privileged reads have creator AND tenant predicates',async()=>{
 expect((await getLeads({},actor)).map(l=>l.id)).toEqual(['own']);
 expect(state.calls.find(c=>c.table==='leads').filters).toEqual(expect.arrayContaining([['tenant_id','default'],['created_by',['owner']]]));
});
it('privileged updates repeat the scope on the write, not only the preflight',async()=>{
 await updateLeadDetails('own',{notes:'Safe'},actor.id,actor);
 expect(state.calls.find(c=>c.update).filters).toEqual(expect.arrayContaining([['id','own'],['tenant_id','default'],['created_by',['owner']]]));
 await expect(updateLeadDetails('other',{notes:'Unsafe'},actor.id,actor)).rejects.toThrow('Forbidden');
});
it('refreshes role from protected profiles instead of stale or supplied role',async()=>{
 expect((await getLeads({}, {...actor,role:'admin'})).map(l=>l.id)).toEqual(['own']);
});
it('database failure never reveals the shared memory snapshot',async()=>{
 store.leads=state.tables.leads;state.fail=true;
 await expect(getLeads({},actor)).rejects.toThrow('unavailable');
});
it('every database page uses the same authorization predicates',async()=>{
 state.tables.leads=Array.from({length:1001},(_,i)=>({...state.tables.leads[0],id:`own-${i}`}));
 expect(await getLeads({},actor)).toHaveLength(1001);
 const calls=state.calls.filter(c=>c.table==='leads');expect(calls).toHaveLength(2);
 for(const c of calls) expect(c.filters).toEqual(expect.arrayContaining([['tenant_id','default'],['created_by',['owner']]]));
});
