import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import { DEFAULT_INSTITUTES, formatInstituteLabel } from '@/lib/constants/institutes';
import {
  createInstituteBrand,
  getInstitutes,
  resolveActiveInstitute,
  updateInstituteBrand,
} from '@/lib/services/institute-service';
import { createLead, getLeads, updateLeadDetails } from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { createPlacementEnrollment } from '@/lib/services/placement-service';
import { GET as summaryGet } from '@/app/api/crm/summary/route';
import { generateCsvTemplate, validateLeadRows } from '@/lib/services/bulk-import-service';
import { POST as leadsPost } from '@/app/api/crm/leads/route';
import { matchesInstituteFilter } from '@/components/ui/institute-filter-dropdown';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import type { UserProfile } from '@/types';

const makeUser = (id: string, role: UserProfile['role']): UserProfile => ({
  id,
  role,
  tenant_id: 'default',
  email: `${id}@example.test`,
  full_name: id,
  is_active: true,
  created_at: '2026-11-01',
  updated_at: '2026-11-01',
});

const adminUser = makeUser('11111111-1111-1111-1111-111111111111', 'super_admin');
const counsellorUser = makeUser('44444444-4444-4444-4444-444444444444', 'counsellor');
const accountantUser = makeUser('33333333-3333-3333-3333-333333333333', 'accountant');

async function signedLeadPost(actor: UserProfile, body: unknown) {
  const value = encodeURIComponent(JSON.stringify(actor));
  const sig = await generateAuthCookieSignature(value);
  return new NextRequest('http://localhost/api/crm/leads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${sig}`,
    },
    body: JSON.stringify(body),
  });
}

describe('Institute / Brand Selection & Lifecycle Synchronization', () => {
  beforeEach(() => {
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    store.institutes = DEFAULT_INSTITUTES.map((i) => ({ ...i }));
    store.users = [
      structuredClone(adminUser),
      structuredClone(counsellorUser),
      structuredClone(accountantUser),
    ];
    store.leads = [];
    store.admissions = [];
    store.students = [];
    store.feeAccounts = [];
    store.studentFees = [];
    store.studentPayments = [];
    store.payments = [];
    store.receipts = [];
    store.studentFinancialLedgers = [];
    store.onboardingCases = [];
    store.placementEnrollments = [];
    store.auditLogs = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds MyERP Hub, NextGen, and Tecopad and supports Institute Master CRUD with RBAC & audit trail', async () => {
    const initial = getInstitutes({ activeOnly: true });
    expect(initial.map((i) => i.name)).toEqual(['MyERP Hub', 'NextGen', 'Tecopad']);

    await expect(
      createInstituteBrand(counsellorUser, { name: 'Unauthorized Brand' })
    ).rejects.toThrow(/Forbidden/i);

    const added = await createInstituteBrand(adminUser, {
      name: 'SAP Academy Pro',
      code: 'SAPPRO',
    });
    expect(added.is_active).toBe(true);
    expect(getInstitutes({ activeOnly: true }).map((i) => i.name)).toContain('SAP Academy Pro');

    const deactivated = await updateInstituteBrand(adminUser, added.id, {
      name: 'SAP Academy Legacy',
      is_active: false,
    });
    expect(deactivated.is_active).toBe(false);
    expect(getInstitutes({ activeOnly: true }).some((i) => i.id === added.id)).toBe(false);
    expect(() => resolveActiveInstitute({ institute_id: added.id })).toThrow(/active Institute/i);
    expect(store.auditLogs.some((l) => l.action === 'INSTITUTE_CREATED')).toBe(true);
    expect(store.auditLogs.some((l) => l.action === 'INSTITUTE_UPDATED')).toBe(true);
  });

  it('rejects missing or inactive institutes on lead creation API and accepts all 3 active institutes', async () => {
    const missingRes = await leadsPost(
      await signedLeadPost(counsellorUser, {
        full_name: 'No Institute Lead',
        phone: '9876500001',
        email: 'noinst@example.test',
        experience: 'Fresher',
        stage: 'New',
        require_institute: true,
      })
    );
    expect(missingRes.status).toBe(400);

    let idx = 10;
    for (const inst of DEFAULT_INSTITUTES) {
      idx++;
      const okRes = await leadsPost(
        await signedLeadPost(counsellorUser, {
          full_name: `Lead ${inst.name}`,
          phone: `98765000${idx}`,
          email: `lead-${idx}@example.test`,
          experience: 'Fresher',
          stage: 'New',
          institute_id: inst.id,
          require_institute: true,
        })
      );
      expect(okRes.status).toBe(200);
      const body = await okRes.json();
      expect(body.lead.institute_id).toBe(inst.id);
      expect(body.lead.institute_name).toBe(inst.name);
    }
  });

  it('carries selected institute from Lead -> Admission -> Onboarding -> Student -> Accounts -> Placement', async () => {
    const lead = await createLead(
      {
        full_name: 'Lifecycle Student',
        phone: '9876541234',
        email: 'lifecycle@example.test',
        experience: '0–2 Years',
        experience_years: 1,
        stage: 'Interested',
        institute_id: 'inst-nextgen',
        require_institute: true,
      } as any,
      counsellorUser
    );
    expect(lead.institute_name).toBe('NextGen');

    const admRes = await createAdmissionWorkflow(
      {
        student_name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        dob: '2000-05-10',
        gender: 'Female',
        address: 'Hyderabad',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: store.courses[0].id,
        training_mode: 'Online',
        admission_date: '2026-11-10',
        course_fee: 30000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorUser.id,
        lead_id: lead.id,
      },
      counsellorUser.id,
      true
    );

    expect(admRes.admission.institute_id).toBe('inst-nextgen');
    expect(admRes.admission.institute_name).toBe('NextGen');
    expect(admRes.student.institute_id).toBe('inst-nextgen');
    expect(admRes.student.institute_name).toBe('NextGen');
    expect(admRes.feeAccount.institute_id).toBe('inst-nextgen');
    expect(admRes.studentFee?.institute_id).toBe('inst-nextgen');

    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: admRes.studentFee!.id,
        student_id: admRes.student.id,
        amount_paid: 30000,
        payment_mode: 'UPI',
        payment_date: '2026-11-10',
        next_due_date: null,
        transaction_reference: '55443',
      },
      counsellorUser.id
    );
    expect(payment.institute_id).toBe('inst-nextgen');

    feeWorkflowService.verifyPayment(payment.id, accountantUser.id, 'Verified', {
      reference: '55443',
      amount: '30000',
      payment_date: '2026-11-10',
    });
    expect(store.receipts[0].institute_id).toBe('inst-nextgen');

    const onb = store.onboardingCases.find((c) => c.student_id === admRes.student.id);
    expect(onb?.institute_id).toBe('inst-nextgen');
    expect(onb?.institute_name).toBe('NextGen');

    const placement = await createPlacementEnrollment(
      {
        student_id: admRes.student.id,
        eligibility_overridden: true,
        override_reason: 'QA sync test',
        declaration: {
          terms_version: 'v1.0',
          accepted_by: adminUser.id,
          accepted_by_name: adminUser.full_name,
          accepted_at: '2026-11-10T00:00:00Z',
          confirmed_information_correct: true,
          understands_no_guarantee: true,
          agrees_attend_scheduled_interviews: true,
          agrees_inform_external_offer: true,
          authorizes_resume_sharing: true,
          understands_sensitive_docs_policy: true,
          agrees_keep_profile_updated: true,
        },
      },
      adminUser.id
    );
    expect(placement.institute_id).toBe('inst-nextgen');
    expect(placement.institute_name).toBe('NextGen');
  });

  it('preserves historical unassigned records as Not Assigned, audits institute edits, and filters accurately', async () => {
    const historicalLead = await createLead(
      {
        full_name: 'Historical Lead',
        phone: '9876549999',
        email: 'hist@example.test',
        experience: 'Fresher',
        stage: 'New',
      },
      counsellorUser
    );
    expect(historicalLead.institute_id).toBeUndefined();
    expect(formatInstituteLabel(historicalLead.institute_name)).toBe('Not Assigned');

    expect(matchesInstituteFilter(historicalLead, 'All')).toBe(true);
    expect(matchesInstituteFilter(historicalLead, 'unassigned')).toBe(true);
    expect(matchesInstituteFilter(historicalLead, 'inst-tecopad')).toBe(false);

    const updated = await updateLeadDetails(
      historicalLead.id,
      { institute_id: 'inst-tecopad' },
      adminUser.id,
      adminUser
    );
    expect(updated.institute_id).toBe('inst-tecopad');
    expect(updated.institute_name).toBe('Tecopad');
    expect(matchesInstituteFilter(updated, 'inst-tecopad')).toBe(true);
    expect(matchesInstituteFilter(updated, 'unassigned')).toBe(false);
    expect(store.auditLogs.some((l) => l.action === 'LEAD_DETAILS_UPDATED' && l.record_id === historicalLead.id)).toBe(true);
  });

  it('computes dynamic KPI summary, combined filters, RBAC scope, and CSV import/template validation per institute', async () => {
    const otherCounsellor = makeUser('55555555-5555-5555-5555-555555555555', 'counsellor');
    store.users.push(otherCounsellor);

    await createLead(
      {
        full_name: 'MyERP New',
        phone: '9876501111',
        email: 'myerp1@example.test',
        experience: 'Fresher',
        stage: 'New',
        institute_id: 'inst-myerp-hub',
        require_institute: true,
        counsellor_id: counsellorUser.id,
      } as any,
      counsellorUser
    );
    await createLead(
      {
        full_name: 'MyERP Converted',
        phone: '9876501112',
        email: 'myerp2@example.test',
        experience: 'Fresher',
        stage: 'Converted',
        institute_id: 'inst-myerp-hub',
        require_institute: true,
        counsellor_id: counsellorUser.id,
      } as any,
      counsellorUser
    );
    await createLead(
      {
        full_name: 'Other Counsellor NextGen',
        phone: '9876501113',
        email: 'nextgen@example.test',
        experience: 'Fresher',
        stage: 'New',
        institute_id: 'inst-nextgen',
        require_institute: true,
        counsellor_id: otherCounsellor.id,
      } as any,
      otherCounsellor
    );

    const makeSummaryGet = async (actor: UserProfile, query: string) => {
      const value = encodeURIComponent(JSON.stringify(actor));
      const sig = await generateAuthCookieSignature(value);
      return summaryGet(
        new NextRequest(`http://localhost/api/crm/summary${query}`, {
          headers: { cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${sig}` },
        })
      );
    };

    const adminMyErpRes = await makeSummaryGet(adminUser, '?institute_id=inst-myerp-hub');
    expect(adminMyErpRes.status).toBe(200);
    const adminMyErpBody = await adminMyErpRes.json();
    expect(adminMyErpBody.metrics.total).toBe(2);
    expect(adminMyErpBody.metrics.new).toBe(1);
    expect(adminMyErpBody.metrics.converted).toBe(1);
    expect(adminMyErpBody.metrics.conversionRate).toBe(50);

    // Counsellor filtering NextGen cannot see otherCounsellor's lead
    const counsellorNextGenRes = await makeSummaryGet(counsellorUser, '?institute_id=inst-nextgen');
    expect((await counsellorNextGenRes.json()).metrics.total).toBe(0);

    // Combined filters
    const combined = await getLeads(
      { institute_id: 'inst-myerp-hub', stage: 'New', search: 'MyERP' } as any,
      adminUser
    );
    expect(combined).toHaveLength(1);
    expect(combined[0].full_name).toBe('MyERP New');

    // CSV template & import validation
    const tpl = generateCsvTemplate('leads');
    expect(tpl.split('\n')[0]).toContain('institute');
    const importValidation = validateLeadRows([
      {
        rowNumber: 2,
        data: {
          full_name: 'CSV Valid',
          email: 'csv1@example.test',
          phone: '9876511111',
          institute: 'Tecopad',
          course_code: store.courses[0].course_code,
        },
      },
      {
        rowNumber: 3,
        data: {
          full_name: 'CSV Invalid Inst',
          email: 'csv2@example.test',
          phone: '9876511112',
          institute: 'Unknown Brand',
          course_code: store.courses[0].course_code,
        },
      },
    ]);
    expect(importValidation.previewRows[0].isValid).toBe(true);
    expect(importValidation.previewRows[0].data.institute_id).toBe('inst-tecopad');
    expect(importValidation.previewRows[1].isValid).toBe(false);
    expect(importValidation.previewRows[1].errors[0]).toMatch(/Invalid or inactive institute/i);
  });

  it('enforces Edit Lead institute validation, converted lead sync, financial safeguard, and audit trail', async () => {
    const lead = await createLead(
      {
        full_name: 'Edit Lead Candidate',
        phone: '9876543219',
        email: 'editlead@example.test',
        experience: 'Fresher',
        stage: 'Interested',
        institute_id: 'inst-myerp-hub',
        require_institute: true,
        counsellor_id: counsellorUser.id,
      } as any,
      counsellorUser
    );

    // Reject empty or invalid institute on update
    await expect(
      updateLeadDetails(lead.id, { institute_id: '' }, counsellorUser.id, counsellorUser)
    ).rejects.toThrow(/active Institute/i);

    await expect(
      updateLeadDetails(lead.id, { institute_id: 'non-existent' }, counsellorUser.id, counsellorUser)
    ).rejects.toThrow(/active Institute/i);

    // Convert lead with payment
    const admRes = await createAdmissionWorkflow(
      {
        student_name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Hyderabad',
        city: 'Hyderabad',
        education: 'Graduate',
        experience_years: 0,
        current_employment_status: 'Student',
        course_id: store.courses[0].id,
        training_mode: 'Online',
        admission_date: '2026-11-28',
        course_fee: 30000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorUser.id,
        lead_id: lead.id,
      },
      counsellorUser.id,
      true
    );
    lead.stage = 'Converted';

    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: admRes.studentFee!.id,
        student_id: admRes.student.id,
        amount_paid: 30000,
        payment_mode: 'UPI',
        payment_date: '2026-11-28',
        next_due_date: null,
        transaction_reference: '77889',
      },
      counsellorUser.id
    );
    feeWorkflowService.verifyPayment(payment.id, accountantUser.id, 'Verified', {
      reference: '77889',
      amount: '30000',
      payment_date: '2026-11-28',
    });

    // Changing institute on converted lead with financial records requires authorized review
    await expect(
      updateLeadDetails(lead.id, { institute_id: 'inst-tecopad' }, adminUser.id, adminUser)
    ).rejects.toThrow(/Authorized review required/i);

    await expect(
      updateLeadDetails(
        lead.id,
        { institute_id: 'inst-tecopad', confirm_financial_institute_change: true } as any,
        counsellorUser.id,
        counsellorUser
      )
    ).rejects.toThrow(/Authorized review required/i);

    // Authorized admin with review confirmation updates lead, admission, and student without mutating payment/receipt
    const updatedConverted = await updateLeadDetails(
      lead.id,
      { institute_id: 'inst-tecopad', confirm_financial_institute_change: true } as any,
      adminUser.id,
      adminUser
    );
    expect(updatedConverted.stage).toBe('Converted');
    expect(updatedConverted.institute_id).toBe('inst-tecopad');
    expect(updatedConverted.institute_name).toBe('Tecopad');
    expect(admRes.admission.institute_id).toBe('inst-tecopad');
    expect(admRes.student.institute_id).toBe('inst-tecopad');
    expect(payment.institute_id).toBe('inst-myerp-hub'); // Verified payment record preserved untouched
    expect(store.receipts[0].institute_id).toBe('inst-myerp-hub'); // Receipt preserved untouched

    const instAudit = store.auditLogs.find(
      (l) => l.action === 'LEAD_INSTITUTE_UPDATED' && l.record_id === lead.id
    );
    expect(instAudit).toBeDefined();
    expect(instAudit?.old_value).toEqual({ institute_id: 'inst-myerp-hub', institute_name: 'MyERP Hub' });
    expect(instAudit?.new_value).toEqual({ institute_id: 'inst-tecopad', institute_name: 'Tecopad' });
    expect(instAudit?.user_id).toBe(adminUser.id);
    expect(instAudit?.created_at).toBeTruthy();
  });
});
