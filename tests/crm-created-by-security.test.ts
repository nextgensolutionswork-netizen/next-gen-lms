import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserProfile, Lead } from '@/types';
import { store } from '@/lib/services/data-store';
import { createLead, getLeads, updateLeadDetails, updateLeadStage, bulkAssignLeads } from '@/lib/services/crm-service';
import { localTeamMembers } from '@/lib/services/lead-security';
import { GET, POST, PATCH, DELETE } from '@/app/api/crm/leads/route';
import { GET as history } from '@/app/api/crm/history/route';
import { GET as summary } from '@/app/api/crm/summary/route';
import { POST as admission } from '@/app/api/admissions/route';
import { cacheLeads, cachedLeads, leadCacheToken, resetLeadCache } from '@/lib/services/lead-cache';

const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: auth }));
const actor = (id: string, role: UserProfile['role'] = 'counsellor', tenant_id = 'default'): UserProfile =>
 ({ id, role, tenant_id, is_active: true, full_name: id, email: `${id}@example.com`, created_at: '', updated_at: '' });
const radhika = actor('radhika'), mohan = actor('mohan'), admin = actor('admin','admin'), superAdmin = actor('super','super_admin');
const leader = actor('leader','counsellor_lead'), unrelated = actor('unrelated','counsellor_lead');
const input = { full_name: 'Lead A', phone: '9876543210', email: 'a@example.com', stage: 'New' as const, counsellor_id: radhika.id };
const request = (method: string, body?: any, query = '') => new NextRequest(`http://localhost/api/crm/leads${query}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
let lead: Lead;
beforeEach(async () => {
 store.leads = []; store.auditLogs = []; store.users = [radhika,mohan,admin,superAdmin,leader,unrelated];
 localTeamMembers.splice(0,localTeamMembers.length,{tenant_id:'default',leader_id:leader.id,member_id:radhika.id});
 vi.spyOn(store,'persist').mockImplementation(()=>{});
 lead = await createLead(input, radhika); auth.mockResolvedValue(mohan);
});
afterEach(()=>{vi.restoreAllMocks(); localTeamMembers.length=0; vi.unstubAllGlobals(); resetLeadCache();});

describe('Created-by security through application and API',()=>{
 it('1 creates with authenticated creator, preserving independent assignment',()=>{expect(lead).toMatchObject({created_by:radhika.id,counsellor_id:radhika.id});});
 it('2 creator lists and edits own lead',async()=>{expect(await getLeads({},radhika)).toHaveLength(1); expect((await updateLeadDetails(lead.id,{notes:'Owned'},radhika.id,radhika)).notes).toBe('Owned');});
 it('3 Mohan cannot list Radhika lead despite assignment',async()=>{expect(await getLeads({},mohan)).toEqual([]);});
 it('4 Mohan cannot edit another creator',async()=>{await expect(updateLeadDetails(lead.id,{notes:'Forged'},mohan.id,mohan)).rejects.toThrow('Forbidden');});
 it('5 search and creator filters cannot broaden scope',async()=>{expect(await getLeads({search:'Lead A',created_by:radhika.id},mohan)).toEqual([]);});
 it('6 export source contains only authorized leads',async()=>{const json=await (await GET(request('GET'))).json(); expect(json.leads).toEqual([]);});
 it('7 creator update and spoofed creation rejected',async()=>{
  auth.mockResolvedValue(radhika);
  expect((await PATCH(request('PATCH',{leadId:lead.id,updates:{created_by:mohan.id}}))).status).toBe(403);
  expect((await POST(request('POST',{...input,created_by:mohan.id}))).status).toBe(403);
 });
 it('8 Admin sees organization leads',async()=>{expect(await getLeads({},admin)).toHaveLength(1);});
 it('9 Super Admin sees organization leads',async()=>{expect(await getLeads({},superAdmin)).toHaveLength(1);});
 it('10 authorized team leader sees and edits team lead',async()=>{expect(await getLeads({},leader)).toHaveLength(1); await updateLeadDetails(lead.id,{notes:'Team'},leader.id,leader);});
 it('11 unrelated team leader sees no lead',async()=>{expect(await getLeads({},unrelated)).toEqual([]);});
 it('12 unauthenticated requests denied',async()=>{auth.mockRejectedValue(new Error('Unauthorized: Session required.')); expect((await GET(request('GET'))).status).toBe(401);});
 it('13 direct API ID tampering denied',async()=>{
  expect((await GET(request('GET',undefined,`?leadId=${lead.id}`))).status).toBe(403);
  expect((await PATCH(request('PATCH',{leadId:lead.id,updates:{notes:'Tampered'}}))).status).toBe(403);
 });
 it('14 parent authorization protects history, followups and demo scheduling',async()=>{
  expect((await history(request('GET',undefined,`?leadId=${lead.id}`))).status).toBe(403);
  await expect(updateLeadStage(lead.id,'Demo Scheduled','Injected',mohan.id,'2026-12-01',mohan)).rejects.toThrow('Forbidden');
 });
 it('15 historical missing creators stay intact and management-only',async()=>{
  const historical = {...lead,id:'historical',created_by:null,counsellor_id:undefined}; store.leads.push(historical);
  expect(await getLeads({},radhika)).toHaveLength(1); expect(await getLeads({},admin)).toHaveLength(2); expect(historical.created_by).toBeNull();
 });
 it('summary totals and performance exclude other creators',async()=>{const result=await (await summary(request('GET'))).json(); expect(result.metrics.total).toBe(0); expect(result.performance.some((p:any)=>p.id===radhika.id)).toBe(false);});
 it('bulk authorization rejects the entire selection before mutating',async()=>{
  const own = await createLead({...input,phone:'9876543211',counsellor_id:mohan.id},mohan);
  await expect(bulkAssignLeads([own.id,lead.id],admin.id,mohan.id,mohan)).rejects.toThrow('Forbidden');
  expect(store.leads.find(l=>l.id===own.id)?.counsellor_id).toBe(mohan.id);
 });
 it('cross-tenant management and inactive users denied',async()=>{
  expect(await getLeads({},actor('other','admin','other'))).toEqual([]);
  await expect(getLeads({}, {...radhika,is_active:false})).rejects.toThrow('Forbidden');
 });
 it('other roles and salesperson deletion denied',async()=>{
  for(const role of ['trainer','student','accountant','placement_coordinator'] as const) await expect(getLeads({},actor(role,role))).rejects.toThrow('Forbidden');
  expect((await DELETE(request('DELETE',{leadId:lead.id}))).status).toBe(403);
 });
 it('admission API cannot convert another salesperson lead',async()=>{
  const response=await admission(request('POST',{lead_id:lead.id,student_name:'A',phone:'9876543210',email:'a@example.com',course_id:'course',course_fee:1000,discount:0}));
  expect(response.status).toBe(403); expect(lead.stage).toBe('New');
 });
 it('cross-user cache refuses stale in-flight responses',()=>{
  resetLeadCache(radhika.id); const token=leadCacheToken(); cacheLeads([lead],token);
  resetLeadCache(mohan.id); expect(cachedLeads(mohan.id)).toEqual([]);
  expect(()=>cacheLeads([lead],token)).toThrow('session changed');
 });
 it('browser failed API never falls back to shared leads',async()=>{
  resetLeadCache(mohan.id); vi.stubGlobal('window',{});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Forbidden'})}));
  await expect(getLeads()).rejects.toThrow('Forbidden'); expect(store.leads).toEqual([]);
 });
});
