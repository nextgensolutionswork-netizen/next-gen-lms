import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import { createLead, getLeads, updateLeadDetails } from '@/lib/services/crm-service';
import { createAdmissionWorkflow, getAdmissions } from '@/lib/services/admission-service';
import { getEligibleAdmissionsCounsellors, validateCounsellorAssignment } from '@/lib/services/counsellor-service';
import {
  getStandardFeeForCourseAndTraining,
  calculateEnrollmentFinancials,
  updateTrainingFeeConfiguration,
  getSystemFeeConfiguration,
} from '@/lib/services/fee-config-service';
import { POST as telecrmWebhook, GET as telecrmHealth } from '@/app/api/webhooks/telecrm/route';
import { POST as admissionApi } from '@/app/api/admissions/route';
import { Lead, Admission, UserProfile, Course } from '@/types';

const authMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/payment-session', () => ({
  authenticatePaymentRequest: authMock,
}));

describe('TASK 1, 2, 3: TeleCRM Duplicate Prevention, Enrollment Counsellor & Fee Configuration', () => {
  const counsellorA: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    tenant_id: 'default',
    email: 'ananya@next-generpsolutions.com',
    full_name: 'Ananya Desai',
    role: 'counsellor',
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const counsellorB: UserProfile = {
    id: '55555555-5555-5555-5555-555555555555',
    tenant_id: 'default',
    email: 'vikram.counsellor@next-generpsolutions.com',
    full_name: 'Vikram Joshi',
    role: 'counsellor',
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const counsellorLead: UserProfile = {
    id: '66666666-6666-6666-6666-666666666666',
    tenant_id: 'default',
    email: 'lead@next-generpsolutions.com',
    full_name: 'Pooja Hegde',
    role: 'counsellor_lead',
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const adminUser: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: 'default',
    email: 'admin@next-generpsolutions.com',
    full_name: 'System Admin',
    role: 'admin',
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const inactiveUser: UserProfile = {
    id: '77777777-7777-7777-7777-777777777777',
    tenant_id: 'default',
    email: 'inactive@next-generpsolutions.com',
    full_name: 'Inactive Staff',
    role: 'counsellor',
    is_active: false,
    created_at: '',
    updated_at: '',
  };

  const sampleCourse: Course = {
    id: 'crs-fico-01',
    course_name: 'SAP S/4HANA Finance (FICO)',
    course_code: 'SAP-FICO-2026',
    description: 'Financial accounting & controlling',
    duration_weeks: 12,
    category: 'SAP Functional',
    price: 45000,
    status: 'Published',
    created_at: '',
    updated_at: '',
  };

  const sampleCourseMM: Course = {
    id: 'crs-mm-01',
    course_name: 'SAP S/4HANA Materials Management (MM)',
    course_code: 'SAP-MM-2026',
    description: 'Materials & Procurement',
    duration_weeks: 10,
    category: 'SAP Functional',
    price: 40000,
    status: 'Published',
    created_at: '',
    updated_at: '',
  };

  beforeEach(() => {
    store.leads = [];
    store.admissions = [];
    store.students = [];
    store.feeAccounts = [];
    store.auditLogs = [];
    store.users = [counsellorA, counsellorB, counsellorLead, adminUser, inactiveUser];
    store.courses = [sampleCourse, sampleCourseMM];
    store.batches = [
      {
        id: 'batch-01',
        course_id: sampleCourse.id,
        batch_name: 'FICO Morning Cohort',
        current_enrolled: 5,
        maximum_capacity: 25,
      } as any,
    ];
    authMock.mockResolvedValue(adminUser);
    vi.spyOn(store, 'persist').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TASK 1: Duplicate Lead Prevention Tests
  // ==========================================================================
  describe('TASK 1: Automatic Duplicate Lead Prevention', () => {
    it('1.1: Same mobile number submitted twice creates only one unique lead', async () => {
      const phone = '9876543210';
      const lead1 = await createLead(
        {
          full_name: 'Rohan Sharma',
          phone,
          country_code: '+91',
          email: 'rohan.sharma@example.com',
          counsellor_id: counsellorA.id,
          stage: 'New',
          notes: 'Inquiry via Website form',
        },
        counsellorA
      );

      expect(lead1).toBeDefined();
      expect(lead1.phone).toContain('98765');
      expect(store.leads.length).toBe(1);

      // Second submission with same phone number
      const lead2 = await createLead(
        {
          full_name: 'Rohan Sharma Duplicate',
          phone,
          country_code: '+91',
          email: 'rohan.new@example.com',
          counsellor_id: counsellorB.id,
          stage: 'Interested',
          notes: 'Second submission from ads campaign',
        },
        counsellorB
      );

      // Verify no duplicate record was created
      expect(store.leads.length).toBe(1);
      expect(lead2.id).toBe(lead1.id);
      expect((lead2 as any).is_duplicate_prevented).toBe(true);
      // Lead ownership and assigned counsellor are preserved
      expect(lead2.counsellor_id).toBe(counsellorA.id);
      // New notes are appended without overwriting original history
      expect(lead2.notes).toContain('Inquiry via Website form');
      expect(lead2.notes).toContain('Second submission from ads campaign');
    });

    it('1.2: Same lead received through TeleCRM and website does not create duplicate', async () => {
      const phone = '+91 99887 76655';

      // First received via Website
      const webLead = await createLead(
        {
          full_name: 'Priya Patel',
          phone,
          country_code: '+91',
          email: 'priya@example.com',
          counsellor_id: counsellorA.id,
          stage: 'Follow-up',
          lead_source: 'Website',
          notes: 'Downloaded course syllabus',
        },
        counsellorA
      );

      expect(store.leads.length).toBe(1);

      // TeleCRM Webhook arrives later with same lead
      const webhookReq = new NextRequest('http://localhost/api/webhooks/telecrm', {
        method: 'POST',
        headers: {
          'x-telecrm-secret': 'telecrm_webhook_dev_secret',
        },
        body: JSON.stringify({
          event: 'lead_sync',
          event_id: 'telecrm_evt_001',
          lead: {
            name: 'Priya Patel (TeleCRM)',
            phone: '9988776655', // unformatted phone
            email: 'priya@example.com',
            course_name: 'SAP S/4HANA Finance (FICO)',
            notes: 'Spoke on call; requested demo date',
          },
        }),
      });

      const response = await telecrmWebhook(webhookReq);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.duplicate_prevented).toBe(true);
      expect(json.lead.id).toBe(webLead.id);
      expect(store.leads.length).toBe(1);
      // Follow-up stage and ownership are preserved
      expect(store.leads[0].stage).toBe('Follow-up');
      expect(store.leads[0].counsellor_id).toBe(counsellorA.id);
      expect(store.leads[0].notes).toContain('Spoke on call; requested demo date');
    });

    it('1.3: Repeated webhook delivery with same idempotency key is idempotent', async () => {
      const payload = {
        idempotency_key: 'telecrm_retry_key_999',
        name: 'Amitabh Sen',
        phone: '9812345678',
        email: 'amitabh@example.com',
        course_name: 'SAP S/4HANA Finance (FICO)',
      };

      const req1 = new NextRequest('http://localhost/api/webhooks/telecrm', {
        method: 'POST',
        headers: {
          'x-telecrm-secret': 'telecrm_webhook_dev_secret',
        },
        body: JSON.stringify(payload),
      });
      const res1 = await telecrmWebhook(req1);
      const data1 = await res1.json();
      expect(res1.status).toBe(200);
      expect(data1.success).toBe(true);
      expect(store.leads.length).toBe(1);

      // Second delivery (retry)
      const req2 = new NextRequest('http://localhost/api/webhooks/telecrm', {
        method: 'POST',
        headers: {
          'x-telecrm-secret': 'telecrm_webhook_dev_secret',
        },
        body: JSON.stringify(payload),
      });
      const res2 = await telecrmWebhook(req2);
      const data2 = await res2.json();
      expect(res2.status).toBe(200);
      expect(data2.duplicate_prevented).toBe(true);
      expect(data2.lead.id).toBe(data1.lead.id);
      expect(store.leads.length).toBe(1);
    });

    it('1.3.1: Rejects unauthenticated webhook requests with 401 Unauthorized', async () => {
      const unauthReq = new NextRequest('http://localhost/api/webhooks/telecrm', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Hacker Inquirer',
          phone: '9899988877',
        }),
      });

      const res = await telecrmWebhook(unauthReq);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/unauthorized|missing|credentials/i);
    });

    it('1.3.2: Rejects invalid webhook authentication secret with 401 Unauthorized', async () => {
      const badReq = new NextRequest('http://localhost/api/webhooks/telecrm', {
        method: 'POST',
        headers: {
          'x-telecrm-secret': 'wrong_secret_123',
        },
        body: JSON.stringify({
          name: 'Fake Lead',
          phone: '9899988866',
        }),
      });

      const res = await telecrmWebhook(badReq);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/invalid webhook authentication secret/i);
    });

    it('1.3.3: Authenticated webhook lead does NOT impersonate human administrators', async () => {
      const validReq = new NextRequest('http://localhost/api/webhooks/telecrm', {
        method: 'POST',
        headers: {
          'x-telecrm-secret': 'telecrm_webhook_dev_secret',
        },
        body: JSON.stringify({
          name: 'Automated Lead',
          phone: '9877700011',
          email: 'automated@example.com',
          course_name: 'SAP S/4HANA Finance (FICO)',
        }),
      });

      const res = await telecrmWebhook(validReq);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify lead is NOT attributed to any human admin in store
      const adminUsers = store.users.filter((u) => u.role === 'admin' || u.role === 'super_admin');
      for (const admin of adminUsers) {
        expect(data.lead.created_by).not.toBe(admin.id);
      }
      expect(data.lead.lead_source).toBe('Other');
      expect(data.lead.campaign).toBe('TeleCRM Integration');
    });

    it('1.4: Concurrent lead creation requests with same phone are serialized and deduplicated', async () => {
      const phone = '9822233344';
      const input = {
        full_name: 'Concurrent Inquirer',
        phone,
        country_code: '+91',
        email: 'concurrent@example.com',
        counsellor_id: counsellorA.id,
        stage: 'New' as const,
      };

      // Dispatch 3 concurrent requests simultaneously
      const results = await Promise.all([
        createLead(input, counsellorA),
        createLead(input, counsellorA),
        createLead(input, counsellorA),
      ]);

      expect(store.leads.length).toBe(1);
      const primaryId = results[0].id;
      for (const res of results) {
        expect(res.id).toBe(primaryId);
      }
    });

    it('1.5: Different valid leads with distinct numbers are created independently', async () => {
      const l1 = await createLead(
        { full_name: 'Lead One', phone: '9800000001', country_code: '+91', email: 'one@example.com', counsellor_id: counsellorA.id, stage: 'New' },
        counsellorA
      );
      const l2 = await createLead(
        { full_name: 'Lead Two', phone: '9800000002', country_code: '+91', email: 'two@example.com', counsellor_id: counsellorB.id, stage: 'New' },
        counsellorB
      );

      expect(store.leads.length).toBe(2);
      expect(l1.id).not.toBe(l2.id);
      expect(l1.phone).not.toBe(l2.phone);
    });

    it('1.6: Normalizes international and Indian phone numbers reliably for duplicate matching', async () => {
      // Create US lead
      const usLead = await createLead(
        { full_name: 'John Doe', phone: '+1 202 555 0123', country_code: '+1', email: 'john@example.com', counsellor_id: counsellorA.id, stage: 'New' },
        counsellorA
      );
      expect(store.leads.length).toBe(1);

      // Re-submit without space
      const usDup = await createLead(
        { full_name: 'John Doe Dup', phone: '+12025550123', country_code: '+1', email: 'john.dup@example.com', counsellor_id: counsellorB.id, stage: 'New' },
        counsellorB
      );
      expect(store.leads.length).toBe(1);
      expect(usDup.id).toBe(usLead.id);

      // Indian lead with leading 0 vs +91
      const inLead = await createLead(
        { full_name: 'Kavita Rao', phone: '09811122233', country_code: '+91', email: 'kavita@example.com', counsellor_id: counsellorA.id, stage: 'New' },
        counsellorA
      );
      expect(store.leads.length).toBe(2);

      const inDup = await createLead(
        { full_name: 'Kavita Rao Dup', phone: '+91 98111 22233', country_code: '+91', email: 'kavita.dup@example.com', counsellor_id: counsellorB.id, stage: 'New' },
        counsellorB
      );
      expect(store.leads.length).toBe(2);
      expect(inDup.id).toBe(inLead.id);
    });

    it('1.7: Duplicate detection records audit log telemetry for duplicate attempts', async () => {
      const phone = '9855566677';
      await createLead({ full_name: 'Audit Inquirer', phone, country_code: '+91', email: 'audit1@example.com', counsellor_id: counsellorA.id, stage: 'New' }, counsellorA);
      await createLead({ full_name: 'Audit Inquirer Retry', phone, country_code: '+91', email: 'audit2@example.com', counsellor_id: counsellorA.id, stage: 'New' }, counsellorA);

      const auditEvent = store.auditLogs.find((a) => a.action === 'DUPLICATE_LEAD_DETECTED');
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.module).toBe('CRM');
    });
  });

  // ==========================================================================
  // TASK 2: Counsellor Name Field on Enrollment Page
  // ==========================================================================
  describe('TASK 2: Counsellor Name Field on Enrollment Page', () => {
    it('2.1: getEligibleAdmissionsCounsellors loads active counsellors and counsellor leads', () => {
      const eligible = getEligibleAdmissionsCounsellors(store.users, 'default');
      const ids = eligible.map((c) => c.id);

      expect(ids).toContain(counsellorA.id);
      expect(ids).toContain(counsellorB.id);
      expect(ids).toContain(counsellorLead.id);
      // Inactive user must be excluded
      expect(ids).not.toContain(inactiveUser.id);
      // Display labels include full name and role badge
      expect(eligible.find((c) => c.id === counsellorA.id)?.full_name).toBe('Ananya Desai');
    });

    it('2.2: Assigned counsellor auto-populates when enrollment is created from a CRM lead', async () => {
      const lead = await createLead(
        {
          full_name: 'Admissions Candidate',
          phone: '9844433322',
          country_code: '+91',
          email: 'candidate@example.com',
          counsellor_id: counsellorB.id,
          stage: 'Interested',
        },
        counsellorB
      );

      const result = await createAdmissionWorkflow(
        {
          lead_id: lead.id,
          student_name: lead.full_name,
          phone: lead.phone,
          email: lead.email,
          course_id: sampleCourse.id,
          admission_date: '2026-11-23',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          counsellor_id: lead.counsellor_id,
          dob: '2000-01-01',
          gender: 'Male',
          address: '123 Tech Park',
          city: 'Bengaluru',
          education: 'B.Tech',
          experience_years: 1,
          current_employment_status: 'Employed',
        },
        adminUser.id,
        true
      );

      expect(result.admission).toBeDefined();
      expect(result.admission.counsellor_id).toBe(counsellorB.id);
      expect(result.admission.counsellor_name).toBe('Vikram Joshi');
    });

    it('2.3: Authorized user (Admin / Super Admin) can assign or change counsellor', async () => {
      const result = await createAdmissionWorkflow(
        {
          student_name: 'Direct Candidate',
          phone: '+91 98333 22211',
          email: 'direct@example.com',
          course_id: sampleCourse.id,
          admission_date: '2026-11-23',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          counsellor_id: counsellorLead.id,
          dob: '2001-05-15',
          gender: 'Female',
          address: '456 Residency Rd',
          city: 'Bengaluru',
          education: 'B.Com',
          experience_years: 0,
          current_employment_status: 'Student',
        },
        adminUser.id,
        true
      );

      expect(result.admission.counsellor_id).toBe(counsellorLead.id);
      expect(result.admission.counsellor_name).toBe('Pooja Hegde');
    });

    it('2.4: Rejects assignment of inactive or non-existent counsellor', () => {
      expect(() => {
        validateCounsellorAssignment(inactiveUser.id, store.users, 'default');
      }).toThrow(/inactive|unauthorized|invalid/i);

      expect(() => {
        validateCounsellorAssignment('non-existent-user-id', store.users, 'default');
      }).toThrow(/not found|invalid/i);
    });

    it('2.5: Counsellor Name persists on admission and is returned via API', async () => {
      authMock.mockResolvedValue(adminUser);

      const req = new NextRequest('http://localhost/api/admissions', {
        method: 'POST',
        body: JSON.stringify({
          student_name: 'API Enrolled Student',
          phone: '9812345670',
          email: 'api.enrolled@example.com',
          course_id: sampleCourse.id,
          admission_date: '2026-11-23',
          course_fee: 45000,
          discount: 0,
          counsellor_id: counsellorA.id,
          counsellor_name: counsellorA.full_name,
        }),
      });

      const res = await admissionApi(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.result.admission.counsellor_id).toBe(counsellorA.id);
      expect(json.result.admission.counsellor_name).toBe('Ananya Desai');
    });

    it('2.6: Existing enrollments continue working when counsellor information is missing', async () => {
      const legacyAdmission: Admission = {
        id: 'legacy-adm-001',
        admission_number: 'ADM-2025-0001',
        student_name: 'Legacy Student',
        phone: '+91 98000 00000',
        course_id: sampleCourse.id,
        course_name: sampleCourse.course_name,
        training_mode: 'Online',
        admission_date: '2025-01-01',
        course_fee: 40000,
        discount: 0,
        net_payable: 40000,
        payment_plan: 'Full Payment',
        status: 'Confirmed',
        created_at: '',
        updated_at: '',
        // counsellor_id and counsellor_name missing
      } as unknown as Admission;
      store.admissions.push(legacyAdmission);

      const allAdmissions = await getAdmissions();
      const found = allAdmissions.find((a) => a.id === legacyAdmission.id);
      expect(found).toBeDefined();
      expect(found?.counsellor_id).toBeUndefined();
      expect(found?.counsellor_name).toBeUndefined();
    });
  });

  // ==========================================================================
  // TASK 3: Normal Training & Personal Training Standard Fees
  // ==========================================================================
  describe('TASK 3: Normal Training and Personal Training Standard Fees', () => {
    it('3.1: Normal Training uses baseline course standard fee when pending confirmation', () => {
      const feeInfo = getStandardFeeForCourseAndTraining({
        courseId: sampleCourse.id,
        trainingCategory: 'Normal Training',
      });

      expect(feeInfo.standard_fee).toBe(sampleCourse.price); // 45000
      expect(feeInfo.training_category).toBe('Normal Training');
      expect(feeInfo.requires_confirmation).toBe(true);
      expect(feeInfo.is_revised_applied).toBe(false);
    });

    it('3.2: Personal Training safely falls back to standard course baseline pending confirmation', () => {
      const feeInfo = getStandardFeeForCourseAndTraining({
        courseId: sampleCourse.id,
        trainingCategory: 'Personal Training',
      });

      expect(feeInfo.standard_fee).toBe(sampleCourse.price); // 45000
      expect(feeInfo.training_category).toBe('Personal Training');
      expect(feeInfo.requires_confirmation).toBe(true);
    });

    it('3.3: Course-specific fee variation: different courses use their respective standard fees', () => {
      const ficoFee = getStandardFeeForCourseAndTraining({
        courseId: sampleCourse.id,
        trainingCategory: 'Normal Training',
      });
      const mmFee = getStandardFeeForCourseAndTraining({
        courseId: sampleCourseMM.id,
        trainingCategory: 'Normal Training',
      });

      expect(ficoFee.standard_fee).toBe(45000);
      expect(mmFee.standard_fee).toBe(40000);
    });

    it('3.4: Recalculates total course fee, approved discounts, net payable and installments correctly', () => {
      const calc = calculateEnrollmentFinancials({
        standardFee: 50000,
        discount: 5000,
        paymentPlan: '2 Installments',
        initialPayment: 10000,
        admissionDate: '2026-11-23',
        feeDueDate: '2026-12-23',
      });

      expect(calc.totalCourseFee).toBe(50000);
      expect(calc.discount).toBe(5000);
      expect(calc.netPayable).toBe(45000);
      expect(calc.discountPercent).toBe(10);
      expect(calc.amountPaid).toBe(10000);
      expect(calc.outstandingBalance).toBe(35000);
      expect(calc.installments.length).toBe(2);
      expect(calc.installments[0].amount).toBe(22500);
      expect(calc.installments[1].amount).toBe(22500);
    });

    it('3.5: Preserves historical agreed fee for existing enrollments regardless of fee updates', async () => {
      // Historical admission with agreed fee of ₹38,000
      const historicalAdmission: Admission = {
        id: 'hist-adm-001',
        admission_number: 'ADM-2026-0001',
        student_name: 'Historical Student',
        course_id: sampleCourse.id,
        course_name: sampleCourse.course_name,
        training_mode: 'Online',
        admission_date: '2026-01-15',
        course_fee: 38000,
        discount: 2000,
        net_payable: 36000,
        payment_plan: 'Full Payment',
        status: 'Confirmed',
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-15T10:00:00Z',
      } as unknown as Admission;
      store.admissions.push(historicalAdmission);

      // Apply a revised fee update for future enrollments
      updateTrainingFeeConfiguration('Normal Training', {
        configured_fee: 55000,
        effective_date: '2026-12-01',
        status: 'ACTIVE',
      });

      // Historical record in database / store remains completely unchanged
      const loaded = store.admissions.find((a) => a.id === historicalAdmission.id);
      expect(loaded?.course_fee).toBe(38000);
      expect(loaded?.net_payable).toBe(36000);

      // Revert test config
      updateTrainingFeeConfiguration('Normal Training', {
        configured_fee: null,
        effective_date: null,
        status: 'PENDING_CONFIRMATION',
      });
    });

    it('3.6: Applies revised fee only on or after configured effective date', () => {
      // Set an effective date of 2026-12-01 with a configured fee of 60,000
      updateTrainingFeeConfiguration('Personal Training', {
        configured_fee: 60000,
        effective_date: '2026-12-01',
        status: 'ACTIVE',
      });

      // Enrollment date BEFORE effective date (2026-11-25) -> Uses baseline price (45000)
      const beforeEffective = getStandardFeeForCourseAndTraining({
        courseId: sampleCourse.id,
        trainingCategory: 'Personal Training',
        enrollmentDate: '2026-11-25',
      });
      expect(beforeEffective.standard_fee).toBe(45000);
      expect(beforeEffective.is_revised_applied).toBe(false);

      // Enrollment date ON or AFTER effective date (2026-12-05) -> Uses revised fee (60000)
      const afterEffective = getStandardFeeForCourseAndTraining({
        courseId: sampleCourse.id,
        trainingCategory: 'Personal Training',
        enrollmentDate: '2026-12-05',
      });
      expect(afterEffective.standard_fee).toBe(60000);
      expect(afterEffective.is_revised_applied).toBe(true);

      // Reset to pending confirmation
      updateTrainingFeeConfiguration('Personal Training', {
        configured_fee: null,
        effective_date: null,
        status: 'PENDING_CONFIRMATION',
      });
    });
  });
});
