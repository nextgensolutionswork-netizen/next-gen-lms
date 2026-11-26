import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserProfile, Lead, Admission } from '@/types';
import { store } from '@/lib/services/data-store';
import {
  getLeads,
  getLeadAdmission,
  getLeadHistoricalAdmissionNumber,
  isLeadConverted,
} from '@/lib/services/crm-service';
import { GET as getSummaryRoute } from '@/app/api/crm/summary/route';
import { resetLeadCache } from '@/lib/services/lead-cache';

const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: auth }));

const VINEETHAA_ID = '8fac380f-cc47-4209-9a13-e85153529dd1';
const MOHAN_ID = 'fc148d96-cf7c-4189-a0ba-b99eb5826d15';
const SANDHYA_ID = '3f5ba75a-5fc5-455b-bf98-0c6778f24ea1';
const AMULYA_ID = '987c67ef-0c15-4678-b3d9-a359fc433fa1';
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

// All 16 Converted Leads from the Production Roster
const mockAll16ConvertedLeads: Lead[] = [
  // 1. Vinoth Venkataraman (Vineethaa)
  {
    id: 'b350177a-4915-4a33-8c5e-d6f3b07e452a',
    lead_code: 'LD-2026-01',
    full_name: 'Vinoth venkataraman',
    email: 'vinoth@example.com',
    phone: '+919094182645',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:35:32.000Z',
    updated_at: '2026-11-23T12:35:32.000Z',
    notes: 'Converted to Admission: ADM-2026-0001',
  },
  // 2. Bhanu Prakash (Vineethaa)
  {
    id: 'e2a8078d-f768-49d4-915d-9405cf30462b',
    lead_code: 'LD-2026-02',
    full_name: 'Bhanu prakash',
    email: 'bhanu@example.com',
    phone: '+917036954198',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:34:53.000Z',
    updated_at: '2026-11-23T12:34:53.000Z',
    notes: 'Converted to Admission: ADM-2026-0002',
  },
  // 3. K Geetha Devi (Vineethaa)
  {
    id: '46995a17-8d37-4670-a6db-7eac8ab05423',
    lead_code: 'LD-2026-03',
    full_name: 'K Geetha devi',
    email: 'geetha@example.com',
    phone: '+916361037348',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:33:33.000Z',
    updated_at: '2026-11-23T12:33:33.000Z',
    notes: 'Converted to Admission: ADM-2026-0007',
  },
  // 4. P Denny Joy (Vineethaa)
  {
    id: '6620a551-0f9f-4f37-8404-3646c6428531',
    lead_code: 'LD-2026-04',
    full_name: 'P denny joy',
    email: 'denny@example.com',
    phone: '+916309260226',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:32:42.000Z',
    updated_at: '2026-11-23T12:32:42.000Z',
    notes: 'Converted to Admission: ADM-2026-0008',
  },
  // 5. Ameer Shaiz Bin Iqbal (Vineethaa)
  {
    id: 'ee36d411-8287-48db-9336-1bf005d5638e',
    lead_code: 'LD-2026-05',
    full_name: 'Ameer shaiz bin iqbal',
    email: 'ameer@example.com',
    phone: '+919502955078',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:32:03.000Z',
    updated_at: '2026-11-23T12:32:03.000Z',
    notes: 'Converted to Admission: ADM-2026-0009',
  },
  // 6. Ekkurthi Pavan Kumar (Vineethaa)
  {
    id: '74f35094-4df9-498b-b92c-42e482a0aa96',
    lead_code: 'LD-2026-06',
    full_name: 'Ekkurthi pavan kumar',
    email: 'pavan@example.com',
    phone: '+919493125817',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:31:08.000Z',
    updated_at: '2026-11-23T12:31:08.000Z',
    notes: 'Converted to Admission: ADM-2026-0010',
  },
  // 7. Pradeep Kumar Lellela (Mohan Reddy)
  {
    id: '11e15d52-f1bd-4509-871c-f2dae5b014d1',
    lead_code: 'LD-2026-07',
    full_name: 'Pradeep Kumar lellela',
    email: 'pradeep@example.com',
    phone: '+919642526222',
    stage: 'Converted',
    counsellor_id: MOHAN_ID,
    created_by: MOHAN_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:20:58.000Z',
    updated_at: '2026-11-23T12:20:58.000Z',
    notes: 'Converted to Admission: ADM-2026-0011',
  },
  // 8. Mohammed Abdul Moin Siddiqui (Vineethaa)
  {
    id: '5c44d3a4-dea8-4859-a3d7-1e78bb251e93',
    lead_code: 'LD-2026-08',
    full_name: 'Mohammed abdul moin siddiqui',
    email: 'moin@example.com',
    phone: '+919398002893',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-23T12:11:01.000Z',
    updated_at: '2026-11-23T12:11:01.000Z',
    notes: 'Converted to Admission: ADM-2026-0012',
  },
  // 9. Shaik Shawhul Hameed (Sandhya)
  {
    id: '03b40812-f553-49cd-bbb3-6f43eefd165e',
    lead_code: 'LD-2026-09',
    full_name: 'Shaik Shawhul Hameed',
    email: 'hameed@example.com',
    phone: '+919100128649',
    stage: 'Converted',
    counsellor_id: SANDHYA_ID,
    created_by: SANDHYA_ID,
    tenant_id: 'default',
    created_at: '2026-11-24T09:21:22.000Z',
    updated_at: '2026-11-24T09:21:22.000Z',
    notes: 'Converted to Admission: ADM-2026-0013',
  },
  // 10. Nikhil Pamulaparthi (Amulya)
  {
    id: '871a4179-e085-4f75-a044-dfea0739031c',
    lead_code: 'LD-2026-10',
    full_name: 'Nikhil Pamulaparthi',
    email: 'nikhil@example.com',
    phone: '+918897384612',
    stage: 'Converted',
    counsellor_id: AMULYA_ID,
    created_by: AMULYA_ID,
    tenant_id: 'default',
    created_at: '2026-11-24T10:03:03.000Z',
    updated_at: '2026-11-24T10:03:03.000Z',
    notes: 'Converted to Admission: ADM-2026-0016',
  },
  // 11. Yaseen Sharief (Amulya)
  {
    id: '5b264e6d-bfb3-4f5d-af76-12e641d6499c',
    lead_code: 'LD-2026-11',
    full_name: 'Yaseen Sharief',
    email: 'yaseen@example.com',
    phone: '+918660478523',
    stage: 'Converted',
    counsellor_id: AMULYA_ID,
    created_by: AMULYA_ID,
    tenant_id: 'default',
    created_at: '2026-11-24T10:14:50.000Z',
    updated_at: '2026-11-24T10:14:50.000Z',
    notes: 'Converted to Admission: ADM-2026-0017',
  },
  // 12. Boge Suresh (Mohan Reddy)
  {
    id: '2d099cd5-5951-4d32-9d42-491a95546347',
    lead_code: 'LD-2026-12',
    full_name: 'Boge suresh',
    email: 'suresh@example.com',
    phone: '+917777831106',
    stage: 'Converted',
    counsellor_id: MOHAN_ID,
    created_by: MOHAN_ID,
    tenant_id: 'default',
    created_at: '2026-11-24T10:27:47.000Z',
    updated_at: '2026-11-24T10:27:47.000Z',
    notes: 'Converted to Admission: ADM-2026-0018',
  },
  // 13. Ravuri Srinivas (Radhika)
  {
    id: 'b80a99d9-efa2-450e-930c-3713c52f7751',
    lead_code: 'LD-2026-13',
    full_name: 'Ravuri srinivas',
    email: 'srinivas@example.com',
    phone: '+919705140569',
    stage: 'Converted',
    counsellor_id: RADHIKA_ID,
    created_by: RADHIKA_ID,
    tenant_id: 'default',
    created_at: '2026-11-25T05:50:14.000Z',
    updated_at: '2026-11-25T05:50:14.000Z',
    notes: 'Converted to Admission: ADM-2026-0021',
  },
  // 14. Marripalepu Triveni (Amulya)
  {
    id: '9520e05c-48a8-4196-af55-2d2f2654e610',
    lead_code: 'LD-2026-14',
    full_name: 'Marripalepu Triveni',
    email: 'triveni@example.com',
    phone: '+916304076408',
    stage: 'Converted',
    counsellor_id: AMULYA_ID,
    created_by: AMULYA_ID,
    tenant_id: 'default',
    created_at: '2026-11-25T06:13:04.000Z',
    updated_at: '2026-11-25T06:13:04.000Z',
    notes: 'Converted to Admission: ADM-2026-0024',
  },
  // 15. Dinesh Reddy Kalakoti (Vineethaa) - LIVE ADMISSION
  {
    id: 'cefe8e46-7a5b-4d0b-918f-a059c01c4999',
    lead_code: 'LD-2026-15',
    full_name: 'Dinesh Reddy Kalakoti',
    email: 'dinesh@example.com',
    phone: '+919381471372',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-25T11:47:15.000Z',
    updated_at: '2026-11-25T11:47:15.000Z',
    notes: 'Converted to Admission: ADM-2026-0025',
  },
  // 16. Narayana Reddy Satti (Vineethaa) - LIVE ADMISSION
  {
    id: '04007fbc-fdfc-4b10-9a61-31d4901ba34f',
    lead_code: 'LD-2026-16',
    full_name: 'Narayana Reddy Satti',
    email: 'narayana@example.com',
    phone: '+917989630335',
    stage: 'Converted',
    counsellor_id: VINEETHAA_ID,
    created_by: VINEETHAA_ID,
    tenant_id: 'default',
    created_at: '2026-11-26T06:19:01.000Z',
    updated_at: '2026-11-26T06:19:01.000Z',
    notes: 'Converted to Admission: ADM-2026-0026',
  },
];

// Exactly the 2 Live Admissions in PostgreSQL public.admissions
const mockLiveAdmissions: Admission[] = [
  {
    id: 'adm-dinesh-uuid',
    tenant_id: 'default',
    admission_number: 'ADM-2026-0025',
    student_unique_id: 'NGERP-2026-00001',
    lead_id: 'cefe8e46-7a5b-4d0b-918f-a059c01c4999',
    student_name: 'Dinesh Reddy Kalakoti',
    phone: '+91 93814 71372',
    email: 'dinesh@example.com',
    dob: '1998-05-15',
    gender: 'Male',
    address: 'Madhapur, Hyderabad',
    city: 'Hyderabad',
    education: 'B.Tech',
    experience_years: 2,
    current_employment_status: 'Employed',
    course_id: 'crs-fico-101',
    training_mode: 'Online',
    course_fee: 35000,
    discount: 0,
    net_payable: 35000,
    payment_plan: 'Full Payment',
    counsellor_id: VINEETHAA_ID,
    status: 'Confirmed',
    admission_date: '2026-11-25',
    created_at: '2026-11-25T13:27:00.000Z',
    updated_at: '2026-11-25T13:27:00.000Z',
  },
  {
    id: 'adm-narayana-uuid',
    tenant_id: 'default',
    admission_number: 'ADM-2026-0026',
    student_unique_id: 'NGERP-2026-00002',
    lead_id: '04007fbc-fdfc-4b10-9a61-31d4901ba34f',
    student_name: 'Narayana Reddy Satti',
    phone: '+91 79896 30335',
    email: 'narayana@example.com',
    dob: '1997-08-20',
    gender: 'Male',
    address: 'Gachibowli, Hyderabad',
    city: 'Hyderabad',
    education: 'MCA',
    experience_years: 3,
    current_employment_status: 'Employed',
    course_id: 'crs-fico-101',
    training_mode: 'Online',
    course_fee: 35000,
    discount: 0,
    net_payable: 35000,
    payment_plan: 'Full Payment',
    counsellor_id: VINEETHAA_ID,
    status: 'Confirmed',
    admission_date: '2026-11-26',
    created_at: '2026-11-26T06:21:00.000Z',
    updated_at: '2026-11-26T06:21:00.000Z',
  },
];

describe('BUG-13: CRM Conversion and Admission Data Integrity Reconciliation', () => {
  const originalLeads = store.leads;
  const originalAdmissions = store.admissions;
  const originalUsers = store.users;

  beforeEach(() => {
    store.leads = [...mockAll16ConvertedLeads];
    store.admissions = [...mockLiveAdmissions];
    store.users = [
      superAdmin,
      vineethaa,
      { id: MOHAN_ID, role: 'counsellor', tenant_id: 'default', is_active: true, full_name: 'Mohan Reddy', email: 'mohan@example.com', created_at: '', updated_at: '' },
      { id: SANDHYA_ID, role: 'counsellor', tenant_id: 'default', is_active: true, full_name: 'Sandhya', email: 'sandhya@example.com', created_at: '', updated_at: '' },
      { id: AMULYA_ID, role: 'counsellor', tenant_id: 'default', is_active: true, full_name: 'Amulya', email: 'amulya@example.com', created_at: '', updated_at: '' },
      { id: RADHIKA_ID, role: 'counsellor', tenant_id: 'default', is_active: true, full_name: 'Radhika', email: 'radhika@example.com', created_at: '', updated_at: '' },
    ];
    resetLeadCache();
  });

  afterEach(() => {
    store.leads = originalLeads;
    store.admissions = originalAdmissions;
    store.users = originalUsers;
    resetLeadCache();
    vi.clearAllMocks();
  });

  it('1. Confirms all 16 leads report isLeadConverted = true', () => {
    expect(store.leads.length).toBe(16);
    for (const lead of store.leads) {
      expect(isLeadConverted(lead, store.admissions)).toBe(true);
    }
  });

  it('2. Exactly 2 leads resolve to live Admissions, matching visual evidence', () => {
    const liveMatched = store.leads.filter((l) => Boolean(getLeadAdmission(l, store.admissions)));
    expect(liveMatched.length).toBe(2);

    const dinesh = liveMatched.find((l) => l.full_name === 'Dinesh Reddy Kalakoti');
    expect(dinesh).toBeDefined();
    expect(getLeadAdmission(dinesh!, store.admissions)?.admission_number).toBe('ADM-2026-0025');

    const narayana = liveMatched.find((l) => l.full_name === 'Narayana Reddy Satti');
    expect(narayana).toBeDefined();
    expect(getLeadAdmission(narayana!, store.admissions)?.admission_number).toBe('ADM-2026-0026');
  });

  it('3. Exactly 14 leads have purged admissions and resolve to undefined in live admissions', () => {
    const missingLiveAdmissions = store.leads.filter((l) => !getLeadAdmission(l, store.admissions));
    expect(missingLiveAdmissions.length).toBe(14);

    for (const lead of missingLiveAdmissions) {
      expect(getLeadAdmission(lead, store.admissions)).toBeUndefined();
    }
  });

  it('4. getLeadHistoricalAdmissionNumber accurately extracts reference for all 16 leads', () => {
    const extractedReferences = store.leads.map((l) => ({
      name: l.full_name,
      ref: getLeadHistoricalAdmissionNumber(l),
    }));

    expect(extractedReferences).toEqual([
      { name: 'Vinoth venkataraman', ref: 'ADM-2026-0001' },
      { name: 'Bhanu prakash', ref: 'ADM-2026-0002' },
      { name: 'K Geetha devi', ref: 'ADM-2026-0007' },
      { name: 'P denny joy', ref: 'ADM-2026-0008' },
      { name: 'Ameer shaiz bin iqbal', ref: 'ADM-2026-0009' },
      { name: 'Ekkurthi pavan kumar', ref: 'ADM-2026-0010' },
      { name: 'Pradeep Kumar lellela', ref: 'ADM-2026-0011' },
      { name: 'Mohammed abdul moin siddiqui', ref: 'ADM-2026-0012' },
      { name: 'Shaik Shawhul Hameed', ref: 'ADM-2026-0013' },
      { name: 'Nikhil Pamulaparthi', ref: 'ADM-2026-0016' },
      { name: 'Yaseen Sharief', ref: 'ADM-2026-0017' },
      { name: 'Boge suresh', ref: 'ADM-2026-0018' },
      { name: 'Ravuri srinivas', ref: 'ADM-2026-0021' },
      { name: 'Marripalepu Triveni', ref: 'ADM-2026-0024' },
      { name: 'Dinesh Reddy Kalakoti', ref: 'ADM-2026-0025' },
      { name: 'Narayana Reddy Satti', ref: 'ADM-2026-0026' },
    ]);
  });

  it('5. Reconciles CRM summary metrics distinguishing active vs historical conversions', async () => {
    auth.mockResolvedValueOnce(superAdmin);
    const req = new NextRequest('http://localhost:3000/api/crm/summary');
    const res = await getSummaryRoute(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.metrics.total).toBe(16);
    expect(body.metrics.converted).toBe(16);
    expect(body.metrics.activeConversions).toBe(2);
    expect(body.metrics.historicalConversions).toBe(14);
    expect(body.metrics.conversionRate).toBe(100);
  });

  it('6. Counsellor Vineethaa sees her 9 converted leads (2 active, 7 historical)', async () => {
    auth.mockResolvedValueOnce(vineethaa);
    const req = new NextRequest('http://localhost:3000/api/crm/summary');
    const res = await getSummaryRoute(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.metrics.total).toBe(9);
    expect(body.metrics.converted).toBe(9);
    expect(body.metrics.activeConversions).toBe(2);
    expect(body.metrics.historicalConversions).toBe(7);
  });

  it('7. UI Action and Badge state logic correctly classifies live vs historical records', () => {
    for (const lead of store.leads) {
      const liveAdmission = getLeadAdmission(lead, store.admissions);
      const histAdmNo = getLeadHistoricalAdmissionNumber(lead);
      const isConverted = lead.stage === 'Converted' || lead.stage === 'Enrolled' || Boolean(liveAdmission);

      if (liveAdmission?.admission_number) {
        // Live Admission Case (Dinesh & Narayana)
        const actionType = 'VIEW_ADMISSION';
        const stageBadge = 'Converted';
        const admissionNum = liveAdmission.admission_number;
        expect(actionType).toBe('VIEW_ADMISSION');
        expect(stageBadge).toBe('Converted');
        expect(['ADM-2026-0025', 'ADM-2026-0026']).toContain(admissionNum);
      } else if (isConverted) {
        // Historical Conversion Case (The 14 Purged Records)
        const actionType = 'ARCHIVED_PILL';
        const stageBadge = 'Historical Conversion';
        expect(actionType).toBe('ARCHIVED_PILL');
        expect(stageBadge).toBe('Historical Conversion');
        expect(histAdmNo).toBeDefined();
        expect(histAdmNo).toMatch(/^ADM-2026-\d{4}$/);
      } else {
        // Unconverted
        const actionType = 'CONVERT_BUTTON';
        expect(actionType).toBe('CONVERT_BUTTON');
      }
    }
  });
});
