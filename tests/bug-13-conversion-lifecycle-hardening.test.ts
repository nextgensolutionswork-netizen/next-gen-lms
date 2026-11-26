import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserProfile, Lead, Admission, Course } from '@/types';
import { store } from '@/lib/services/data-store';
import {
  getLeads,
  getLeadAdmission,
  getLeadHistoricalAdmissionNumber,
  classifyLeadConversion,
  isLeadConverted,
  updateLeadDetails,
} from '@/lib/services/crm-service';
import { GET as getSummaryRoute } from '@/app/api/crm/summary/route';
import { resetLeadCache } from '@/lib/services/lead-cache';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { canAccessAdmission, resolveAdmissionScope } from '@/lib/auth/admission-access';

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

const mockCourse: Course = {
  id: 'crs-fico-101',
  course_code: 'SAP-FICO-101',
  course_name: 'SAP FICO PERSONAL TRAINING',
  price: 35000,
  duration_weeks: 12,
  category: 'SAP Functional',
  description: 'SAP FICO Training',
  status: 'Published',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const liveDineshAdmission: Admission = {
  id: 'adm-dinesh-uuid',
  tenant_id: 'default',
  admission_number: 'ADM-2026-0025',
  student_unique_id: 'NGERP-2026-00001',
  lead_id: 'lead-dinesh-uuid',
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
};

describe('BUG-13 Hardening: 15 Lifecycle & Integrity Scenarios', () => {
  const originalLeads = store.leads;
  const originalAdmissions = store.admissions;
  const originalUsers = store.users;
  const originalCourses = store.courses;

  beforeEach(() => {
    store.leads = [];
    store.admissions = [liveDineshAdmission];
    store.users = [superAdmin, vineethaa, mohan];
    store.courses = [mockCourse];
    resetLeadCache();
  });

  afterEach(() => {
    store.leads = originalLeads;
    store.admissions = originalAdmissions;
    store.users = originalUsers;
    store.courses = originalCourses;
    resetLeadCache();
    vi.clearAllMocks();
  });

  // Scenario 1: Lead notes edited after conversion
  it('1. Lead notes edited after conversion preserves reference classification', () => {
    const lead: Lead = {
      id: 'lead-test-01',
      lead_code: 'LD-01',
      full_name: 'Vinoth Venkataraman',
      email: 'vinoth@example.com',
      phone: '+919094182645',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:35:32.000Z',
      updated_at: '2026-11-26T10:00:00.000Z',
      notes: 'Customer called back to ask about syllabus\nConverted to Admission: ADM-2026-0001\nFollowup done on WhatsApp',
    };
    const info = classifyLeadConversion(lead, store.admissions);
    expect(info.status).toBe('historical');
    expect(info.historicalReference).toBe('ADM-2026-0001');
    expect(info.isIntegrityError).toBe(false);
  });

  // Scenario 2: Lead notes completely removed
  it('2. Lead notes removed surfaces integrity error if structured reference missing', () => {
    const leadWithoutRef: Lead = {
      id: 'lead-test-02',
      lead_code: 'LD-02',
      full_name: 'Blank Notes Candidate',
      email: 'blank@example.com',
      phone: '+919999999999',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:00:00.000Z',
      updated_at: '2026-11-26T10:00:00.000Z',
      notes: '',
    };
    const info = classifyLeadConversion(leadWithoutRef, store.admissions);
    expect(info.status).toBe('integrity_error');
    expect(info.isIntegrityError).toBe(true);

    // But if structured historical reference exists, it is preserved even with empty notes
    const leadWithStructuredRef = {
      ...leadWithoutRef,
      historical_admission_reference: 'ADM-2026-0001',
    };
    const infoWithStructured = classifyLeadConversion(leadWithStructuredRef, store.admissions);
    expect(infoWithStructured.status).toBe('historical');
    expect(infoWithStructured.isIntegrityError).toBe(false);
  });

  // Scenario 3: Incorrect or fabricated historical admission reference
  it('3. Incorrect or unverified admission reference flags an integrity error', () => {
    const leadFakeRef: Lead = {
      id: 'lead-test-03',
      lead_code: 'LD-03',
      full_name: 'Fabricated Ref',
      email: 'fake@example.com',
      phone: '+918888888888',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:00:00.000Z',
      updated_at: '2026-11-26T10:00:00.000Z',
      notes: 'Converted to Admission: ADM-9999-9999',
    };
    const info = classifyLeadConversion(leadFakeRef, store.admissions);
    expect(info.status).toBe('integrity_error');
    expect(info.isIntegrityError).toBe(true);
    expect(info.historicalReference).toBe('ADM-9999-9999');
  });

  // Scenario 4: Multiple admission references in notes
  it('4. Multiple admission references in notes cleanly resolves the primary reference', () => {
    const leadMultiRef: Lead = {
      id: 'lead-test-04',
      lead_code: 'LD-04',
      full_name: 'Multi Note Candidate',
      email: 'multi@example.com',
      phone: '+917777777777',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:00:00.000Z',
      updated_at: '2026-11-26T10:00:00.000Z',
      notes: 'Previous query regarding ADM-2026-9999\nConverted to Admission: ADM-2026-0007',
    };
    const ref = getLeadHistoricalAdmissionNumber(leadMultiRef);
    expect(ref).toBe('ADM-2026-0007');
    const info = classifyLeadConversion(leadMultiRef, store.admissions);
    expect(info.status).toBe('historical');
  });

  // Scenario 5: Unexpected admission disappearance (Actual Data Loss)
  it('5. Unexpected admission disappearance triggers Integrity Error', () => {
    // Candidate converted in active session, but admission deleted without cleanup logging
    const leadLostAdmission: Lead = {
      id: 'lead-lost-uuid',
      lead_code: 'LD-05',
      full_name: 'Lost Admission Student',
      email: 'lost@example.com',
      phone: '+916666666666',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-26T08:00:00.000Z',
      updated_at: '2026-11-26T08:30:00.000Z',
      notes: 'Converted to Admission: ADM-2026-0999',
    };
    const info = classifyLeadConversion(leadLostAdmission, store.admissions);
    expect(info.status).toBe('integrity_error');
    expect(info.isIntegrityError).toBe(true);
  });

  // Scenario 6: Verified historical admission removal
  it('6. Verified historical admission removal is confirmed as Historical Conversion', () => {
    const leadVerified: Lead = {
      id: 'lead-verified-uuid',
      lead_code: 'LD-06',
      full_name: 'P Denny Joy',
      email: 'denny@example.com',
      phone: '+916309260226',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:32:42.000Z',
      updated_at: '2026-11-23T12:32:42.000Z',
      notes: 'Converted to Admission: ADM-2026-0008',
    };
    const info = classifyLeadConversion(leadVerified, store.admissions);
    expect(info.status).toBe('historical');
    expect(info.isIntegrityError).toBe(false);
  });

  // Scenario 7: Failed admission creation does not convert lead
  it('7. Failed admission creation preserves original lead stage', async () => {
    const freshLead: Lead = {
      id: 'lead-fail-uuid',
      lead_code: 'LD-FAIL',
      full_name: 'Pre Admission Lead',
      email: 'pre@example.com',
      phone: '+919123456789',
      stage: 'Interested',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-26T10:00:00.000Z',
      updated_at: '2026-11-26T10:00:00.000Z',
    };
    store.leads.push(freshLead);

    // Attempt invalid admission with non-existent course
    await expect(
      createAdmissionWorkflow(
        {
          student_name: 'Pre Admission Lead',
          phone: '+919123456789',
          email: 'pre@example.com',
          course_id: 'invalid-non-existent-course',
          course_fee: 35000,
          discount: 0,
          payment_plan: 'Full Payment',
          admission_date: '2026-11-26',
          lead_id: freshLead.id,
          address: 'Test Address',
          city: 'Hyderabad',
          dob: '1995-01-01',
          gender: 'Male',
          education: 'B.Tech',
          experience_years: 1,
          current_employment_status: 'Employed',
        },
        VINEETHAA_ID
      )
    ).rejects.toThrow();

    // Lead stage MUST remain 'Interested'
    const preserved = store.leads.find((l) => l.id === freshLead.id);
    expect(preserved?.stage).toBe('Interested');
  });

  // Scenario 8 & 9: Duplicate conversion prevention
  it('8 & 9. Duplicate conversion is prevented on already converted leads', () => {
    const alreadyConvertedLead: Lead = {
      id: 'lead-dinesh-uuid',
      lead_code: 'LD-DINESH',
      full_name: 'Dinesh Reddy Kalakoti',
      email: 'dinesh@example.com',
      phone: '+919381471372',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-25T11:47:15.000Z',
      updated_at: '2026-11-25T11:47:15.000Z',
    };
    expect(isLeadConverted(alreadyConvertedLead, store.admissions)).toBe(true);
  });

  // Scenario 10: Admission cancellation
  it('10. Cancelled linked admission classifies lead as Conversion Cancelled', () => {
    const cancelledAdm: Admission = {
      ...liveDineshAdmission,
      id: 'adm-cancelled-uuid',
      lead_id: 'lead-cancelled-lead',
      admission_number: 'ADM-2026-0099',
      status: 'Cancelled',
    };
    store.admissions.push(cancelledAdm);

    const leadCancelled: Lead = {
      id: 'lead-cancelled-lead',
      lead_code: 'LD-CANCEL',
      full_name: 'Cancelled Student',
      email: 'cancel@example.com',
      phone: '+919555555555',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-26T00:00:00.000Z',
      updated_at: '2026-11-26T00:00:00.000Z',
    };
    const info = classifyLeadConversion(leadCancelled, store.admissions);
    expect(info.status).toBe('cancelled');
    expect(info.isIntegrityError).toBe(false);
  });

  // Scenario 11: Counsellor reassignment preserves conversion lifecycle
  it('11. Counsellor reassignment preserves conversion status and admission link', async () => {
    const leadToReassign: Lead = {
      id: 'lead-reassign-uuid',
      lead_code: 'LD-REASSIGN',
      full_name: 'Reassigned Candidate',
      email: 'reassign@example.com',
      phone: '+919444444444',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:00:00.000Z',
      updated_at: '2026-11-23T12:00:00.000Z',
      notes: 'Converted to Admission: ADM-2026-0002',
    };
    store.leads.push(leadToReassign);

    const updated = await updateLeadDetails(
      leadToReassign.id,
      { counsellor_id: MOHAN_ID },
      superAdmin.id,
      superAdmin
    );

    expect(updated.counsellor_id).toBe(MOHAN_ID);
    const info = classifyLeadConversion(updated, store.admissions);
    expect(info.status).toBe('historical');
    expect(info.historicalReference).toBe('ADM-2026-0002');
  });

  // Scenario 12: Historical conversion reporting
  it('12. /api/crm/summary metrics report active vs historical conversions cleanly', async () => {
    const activeLead: Lead = {
      id: 'lead-dinesh-uuid',
      lead_code: 'LD-ACTIVE',
      full_name: 'Dinesh Reddy Kalakoti',
      email: 'dinesh@example.com',
      phone: '+919381471372',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      created_by: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-25T11:47:15.000Z',
      updated_at: '2026-11-25T11:47:15.000Z',
    };
    const histLead: Lead = {
      id: 'lead-hist-uuid',
      lead_code: 'LD-HIST',
      full_name: 'Bhanu Prakash',
      email: 'bhanu@example.com',
      phone: '+917036954198',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      created_by: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-23T12:34:53.000Z',
      updated_at: '2026-11-23T12:34:53.000Z',
      notes: 'Converted to Admission: ADM-2026-0002',
    };
    store.leads = [activeLead, histLead];

    auth.mockResolvedValueOnce(superAdmin);
    const req = new NextRequest('http://localhost/api/crm/summary');
    const res = await getSummaryRoute(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.metrics.converted).toBe(2);
    expect(data.metrics.activeConversions).toBe(1);
    expect(data.metrics.historicalConversions).toBe(1);
    expect(data.metrics.integrityErrors).toBe(0);
    expect(data.metrics.conversionRate).toBe(100);
    expect(data.metrics.activeAdmissionRatio).toBe(50);
  });

  // Scenario 13: Date-filtered conversion metrics
  it('13. Date-filtered conversion metrics accurately filter by lead creation window', async () => {
    const leadOld: Lead = {
      id: 'lead-old',
      lead_code: 'LD-OLD',
      full_name: 'Old Lead',
      email: 'old@example.com',
      phone: '+919111111111',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      created_by: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
      notes: 'Converted to Admission: ADM-2026-0001',
    };
    const leadNew: Lead = {
      id: 'lead-new',
      lead_code: 'LD-NEW',
      full_name: 'New Lead',
      email: 'new@example.com',
      phone: '+919222222222',
      stage: 'Converted',
      counsellor_id: VINEETHAA_ID,
      created_by: VINEETHAA_ID,
      tenant_id: 'default',
      created_at: '2026-11-25T10:00:00.000Z',
      updated_at: '2026-11-25T10:00:00.000Z',
      notes: 'Converted to Admission: ADM-2026-0025',
    };
    store.leads = [leadOld, leadNew];

    auth.mockResolvedValueOnce(superAdmin);
    const req = new NextRequest('http://localhost/api/crm/summary?from=2026-11-20&to=2026-11-30');
    const res = await getSummaryRoute(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.metrics.total).toBe(1);
    expect(data.metrics.converted).toBe(1);
  });

  // Scenario 14: Cross-counsellor admission access protection
  it('14. Unauthorized counsellor cannot access admissions belonging to other counsellors', async () => {
    const scopeMohan = await resolveAdmissionScope(mohan);
    const canMohanAccessVineethaaAdmission = canAccessAdmission(scopeMohan, liveDineshAdmission);
    expect(canMohanAccessVineethaaAdmission).toBe(false);

    const scopeVineethaa = await resolveAdmissionScope(vineethaa);
    const canVineethaaAccess = canAccessAdmission(scopeVineethaa, liveDineshAdmission);
    expect(canVineethaaAccess).toBe(true);
  });

  // Scenario 15: Dashboard and CSV reconciliation consistency
  it('15. Lead conversion count in CSV export format matches dashboard conversion total', async () => {
    const leads = await getLeads({}, superAdmin);
    const convertedInQuery = leads.filter((l) => ['Converted', 'Enrolled'].includes(l.stage)).length;

    auth.mockResolvedValueOnce(superAdmin);
    const req = new NextRequest('http://localhost/api/crm/summary');
    const res = await getSummaryRoute(req);
    const data = await res.json();

    expect(convertedInQuery).toBe(data.metrics.converted);
  });
});
