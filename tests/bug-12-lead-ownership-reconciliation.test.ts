import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserProfile, Lead } from '@/types';
import { store } from '@/lib/services/data-store';
import { getLeads } from '@/lib/services/crm-service';
import { GET as getLeadsRoute } from '@/app/api/crm/leads/route';
import { GET as getSummaryRoute } from '@/app/api/crm/summary/route';
import { resetLeadCache } from '@/lib/services/lead-cache';

const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: auth }));

const VINEETHAA_ID = '8fac380f-cc47-4209-9a13-e85153529dd1';
const MOHAN_ID = 'fc148d96-cf7c-4189-a0ba-b99eb5826d15';
const RADHIKA_ID = '2983a160-0764-40c5-ab50-a41cff9f0c68';

const vineethaa: UserProfile = {
  id: VINEETHAA_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Vineethaa',
  email: 'vineethaa.myerp@gmail.com',
  created_at: '2026-11-23T12:01:15.000Z',
  updated_at: '2026-11-23T12:01:15.000Z',
};

const superAdmin: UserProfile = {
  id: '00000000-0000-4000-8000-000000000004',
  role: 'super_admin',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Super Admin',
  email: 'superadmin@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mohan: UserProfile = {
  id: MOHAN_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Mohan Reddy',
  email: 'mohan@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// The 9 reconciled leads belonging to Vineethaa (all converted)
const mockVineethaaLeads: Lead[] = [
  { id: '5c44d3a4-dea8-4859-a3d7-1e78bb251e93', lead_code: 'LD-2026-01', full_name: 'Mohammed abdul moin siddiqui', email: 'moin@example.com', phone: '+919398002893', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:11:01.000Z', updated_at: '2026-11-23T12:11:01.000Z', notes: 'Converted to Admission: ADM-2026-0012' },
  { id: '74f35094-4df9-498b-b92c-42e482a0aa96', lead_code: 'LD-2026-02', full_name: 'Ekkurthi pavan kumar', email: 'pavan@example.com', phone: '+919493125817', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:31:08.000Z', updated_at: '2026-11-23T12:31:08.000Z', notes: 'Converted to Admission: ADM-2026-0010' },
  { id: 'ee36d411-8287-48db-9336-1bf005d5638e', lead_code: 'LD-2026-03', full_name: 'Ameer shaiz bin iqbal', email: 'ameer@example.com', phone: '+919502955078', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:32:03.000Z', updated_at: '2026-11-23T12:32:03.000Z', notes: 'Converted to Admission: ADM-2026-0009' },
  { id: '6620a551-0f9f-4f37-8404-3646c6428531', lead_code: 'LD-2026-04', full_name: 'P denny joy', email: 'denny@example.com', phone: '+916309260226', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:32:42.000Z', updated_at: '2026-11-23T12:32:42.000Z', notes: 'Converted to Admission: ADM-2026-0008' },
  { id: '46995a17-8d37-4670-a6db-7eac8ab05423', lead_code: 'LD-2026-05', full_name: 'K Geetha devi', email: 'geetha@example.com', phone: '+916361037348', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:33:33.000Z', updated_at: '2026-11-23T12:33:33.000Z', notes: 'Converted to Admission: ADM-2026-0007' },
  { id: 'e2a8078d-f768-49d4-915d-9405cf30462b', lead_code: 'LD-2026-06', full_name: 'Bhanu prakash', email: 'bhanu@example.com', phone: '+917036954198', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:34:53.000Z', updated_at: '2026-11-23T12:34:53.000Z', notes: 'Converted to Admission: ADM-2026-0002' },
  { id: 'b350177a-4915-4a33-8c5e-d6f3b07e452a', lead_code: 'LD-2026-07', full_name: 'Vinoth venkataraman', email: 'vinoth@example.com', phone: '+919094182645', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-23T12:35:32.000Z', updated_at: '2026-11-23T12:35:32.000Z', notes: 'Converted to Admission: ADM-2026-0001' },
  { id: 'cefe8e46-7a5b-4d0b-918f-a059c01c4999', lead_code: 'LD-2026-08', full_name: 'Dinesh Reddy Kalakoti', email: 'dinesh@example.com', phone: '+919381471372', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-25T11:47:15.000Z', updated_at: '2026-11-25T11:47:15.000Z', notes: 'Converted to Admission: ADM-2026-0025' },
  { id: '04007fbc-fdfc-4b10-9a61-31d4901ba34f', lead_code: 'LD-2026-09', full_name: 'Narayana Reddy Satti', email: 'narayana@example.com', phone: '+917989630335', stage: 'Converted', counsellor_id: VINEETHAA_ID, created_by: VINEETHAA_ID, tenant_id: 'default', created_at: '2026-11-26T06:19:01.000Z', updated_at: '2026-11-26T06:19:01.000Z', notes: 'Converted to Admission: ADM-2026-0026' },
];

const mockMohanLead: Lead = {
  id: '11e15d52-f1bd-4509-871c-f2dae5b014d1',
  lead_code: 'LD-2026-10',
  full_name: 'Pradeep Kumar lellela',
  email: 'pradeep@example.com',
  phone: '+919642526222',
  stage: 'Converted',
  counsellor_id: MOHAN_ID,
  created_by: MOHAN_ID,
  tenant_id: 'default',
  created_at: '2026-11-23T12:20:58.000Z',
  updated_at: '2026-11-23T12:20:58.000Z',
  notes: 'Converted to Admission: ADM-2026-0005',
};

beforeEach(() => {
  store.leads = [...mockVineethaaLeads, mockMohanLead];
  store.users = [vineethaa, superAdmin, mohan];
  store.admissions = [];
  store.auditLogs = [];
  vi.spyOn(store, 'persist').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLeadCache();
});

describe('BUG-12: Critical CRM Lead Ownership and Role-Based Data Reconciliation', () => {
  it('1. Counsellor (Vineethaa) lists all 9 reconciled leads under My Leads', async () => {
    const leads = await getLeads({}, vineethaa);
    expect(leads).toHaveLength(9);
    expect(leads.map((l) => l.full_name)).toEqual(
      expect.arrayContaining([
        'Mohammed abdul moin siddiqui',
        'Ekkurthi pavan kumar',
        'Ameer shaiz bin iqbal',
        'P denny joy',
        'K Geetha devi',
        'Bhanu prakash',
        'Vinoth venkataraman',
        'Dinesh Reddy Kalakoti',
        'Narayana Reddy Satti',
      ])
    );
  });

  it('2. Super Admin filter for Vineethaa returns exactly the same 9 leads', async () => {
    const leads = await getLeads({ counsellor_id: VINEETHAA_ID }, superAdmin);
    expect(leads).toHaveLength(9);
    expect(leads.map((l) => l.id).sort()).toEqual(mockVineethaaLeads.map((l) => l.id).sort());
  });

  it('3. GET /api/crm/leads under Vineethaa session returns all 9 leads', async () => {
    auth.mockResolvedValue(vineethaa);
    const request = new NextRequest('http://localhost/api/crm/leads');
    const response = await getLeadsRoute(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.leads).toHaveLength(9);
  });

  it('4. GET /api/crm/summary under Vineethaa session returns 100% conversion rate across all 9 leads', async () => {
    auth.mockResolvedValue(vineethaa);
    const request = new NextRequest('http://localhost/api/crm/summary');
    const response = await getSummaryRoute(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.metrics).toMatchObject({
      total: 9,
      new: 0,
      followups: 0,
      pending: 0,
      converted: 9,
      conversionRate: 100,
    });
    const vineethaaPerf = json.performance.find((p: any) => p.id === VINEETHAA_ID);
    expect(vineethaaPerf).toBeDefined();
    expect(vineethaaPerf.total).toBe(9);
    expect(vineethaaPerf.converted).toBe(9);
  });

  it('5. Cross-counsellor isolation: Mohan cannot see Vineethaa leads', async () => {
    const leads = await getLeads({}, mohan);
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe(mockMohanLead.id);
    expect(leads.some((l) => l.created_by === VINEETHAA_ID)).toBe(false);
  });

  it('6. Cross-counsellor isolation: Vineethaa cannot see Mohan lead', async () => {
    const leads = await getLeads({}, vineethaa);
    expect(leads.some((l) => l.id === mockMohanLead.id)).toBe(false);
  });
});
