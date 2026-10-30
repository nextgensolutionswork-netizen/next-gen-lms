import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { UserProfile, Lead } from '@/types';

describe('Lead Conversion Atomicity & Failure Modes (Synthetic/Mock Environment)', () => {
  let actor: UserProfile;

  beforeEach(() => {
    vi.clearAllMocks();
    actor = {
      id: 'staff-counsellor-atomicity',
      tenant_id: 'default',
      role: 'counsellor',
      is_active: true,
      full_name: 'Atomicity Staff',
      email: 'atomicity@test.com',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    if (!store.users.some(u => u.id === actor.id)) {
      store.users.push(actor);
    }
  });

  describe('1. Concurrent Conversion Requests for the Same Lead', () => {
    it('serializes concurrent conversion requests, allowing exactly one success and rejecting the duplicate', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { createAdmissionWorkflow } = await import('@/lib/services/admission-service');
      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');

      const testLead: Lead = {
        id: 'concurrent-lead-' + Date.now(),
        lead_code: 'LD-CNC-001',
        full_name: 'Concurrent Prospect',
        phone: '9888877771',
        email: 'concurrent@example.com',
        counsellor_id: actor.id,
        stage: 'New',
        training_preference: 'Hybrid',
        lead_source: 'Website',
        current_status: 'Employed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(testLead);

      const admissionPayload = {
        student_name: testLead.full_name,
        phone: testLead.phone,
        email: testLead.email,
        dob: '1998-05-15',
        gender: 'Female' as const,
        address: '456 Tech Park',
        city: 'Hyderabad',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        course_fee: 40000,
        discount: 0,
        training_mode: 'Hybrid' as const,
        admission_date: new Date().toISOString().slice(0, 10),
        counsellor_id: actor.id,
        lead_id: testLead.id,
        education: 'Graduate',
        experience_years: 1,
        current_employment_status: 'Employed' as const,
        payment_plan: 'Full Payment' as const,
      };

      const initialStudentsCount = store.students.length;
      const initialAdmissionsCount = store.admissions.length;
      const initialFeeAccountsCount = store.feeAccounts.length;

      // Execute two requests concurrently through paymentTransaction
      const [req1, req2] = await Promise.allSettled([
        paymentTransaction(actor, () => createAdmissionWorkflow(admissionPayload, actor.id, true)),
        paymentTransaction(actor, () => createAdmissionWorkflow(admissionPayload, actor.id, true)),
      ]);

      // Exactly one must succeed and one must reject
      const fulfilled = [req1, req2].filter(r => r.status === 'fulfilled');
      const rejected = [req1, req2].filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      if (rejected[0].status === 'rejected') {
        expect(rejected[0].reason.message).toMatch(/already been converted/i);
      }

      // Exactly one student, admission, and fee account added
      expect(store.students.length).toBe(initialStudentsCount + 1);
      expect(store.admissions.length).toBe(initialAdmissionsCount + 1);
      expect(store.feeAccounts.length).toBe(initialFeeAccountsCount + 1);

      // Lead stage is converted
      expect(testLead.stage).toBe('Converted');
    });
  });

  describe('2. Failure Midway Through Conversion (After Student Creation)', () => {
    it('rolls back in-memory student and fee account when an error occurs before completion', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { createAdmissionWorkflow } = await import('@/lib/services/admission-service');
      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');

      const testLead: Lead = {
        id: 'fail-midway-lead-' + Date.now(),
        lead_code: 'LD-FAIL-MID',
        full_name: 'Midway Failure Candidate',
        phone: '9888877772',
        email: 'failmidway@example.com',
        counsellor_id: actor.id,
        stage: 'Follow-up',
        training_preference: 'Online',
        lead_source: 'Referral',
        current_status: 'Employed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(testLead);

      const initialStudentsCount = store.students.length;
      const initialAdmissionsCount = store.admissions.length;
      const initialFeeAccountsCount = store.feeAccounts.length;

      // Intentionally cause failure after student creation by passing an invalid initial payment amount
      const invalidPayload = {
        student_name: testLead.full_name,
        phone: testLead.phone,
        email: testLead.email,
        dob: '1995-10-10',
        gender: 'Male' as const,
        address: '789 Financial District',
        city: 'Hyderabad',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        course_fee: 40000,
        discount: 0,
        training_mode: 'Online' as const,
        admission_date: new Date().toISOString().slice(0, 10),
        counsellor_id: actor.id,
        lead_id: testLead.id,
        education: 'Graduate',
        experience_years: 1,
        current_employment_status: 'Employed' as const,
        payment_plan: 'Full Payment' as const,
        initial_payment_amount: 999999, // Exceeds course fee -> throws Error
      };

      await expect(
        paymentTransaction(actor, () => createAdmissionWorkflow(invalidPayload, actor.id, true))
      ).rejects.toThrow(/cannot exceed net payable/i);

      // Verify no orphan records were left
      expect(store.students.length).toBe(initialStudentsCount);
      expect(store.admissions.length).toBe(initialAdmissionsCount);
      expect(store.feeAccounts.length).toBe(initialFeeAccountsCount);
      expect(store.students.some(s => s.email === testLead.email)).toBe(false);

      // Verify lead stage remained unchanged
      expect(testLead.stage).toBe('Follow-up');
    });
  });

  describe('3. Failure Updating Lead Stage', () => {
    it('rolls back all records if lead stage update triggers an error', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { createAdmissionWorkflow } = await import('@/lib/services/admission-service');
      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');

      const testLead: Lead = {
        id: 'fail-lead-stage-' + Date.now(),
        lead_code: 'LD-STAGE-ERR',
        full_name: 'Stage Error Candidate',
        phone: '9888877773',
        email: 'stageerror@example.com',
        counsellor_id: actor.id,
        stage: 'Interested',
        training_preference: 'Classroom',
        lead_source: 'Walk-in',
        current_status: 'Student',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(testLead);

      // Make lead.stage setter throw an error
      let stageValue = testLead.stage;
      Object.defineProperty(testLead, 'stage', {
        get: () => stageValue,
        set: (val) => {
          if (val === 'Converted') {
            throw new Error('Simulated database lock or trigger failure on lead stage update');
          }
          stageValue = val;
        },
        configurable: true,
      });

      const initialStudentsCount = store.students.length;
      const initialAdmissionsCount = store.admissions.length;
      const initialFeeAccountsCount = store.feeAccounts.length;

      const payload = {
        student_name: testLead.full_name,
        phone: testLead.phone,
        email: testLead.email,
        dob: '2001-01-15',
        gender: 'Female' as const,
        address: '101 Cyber Towers',
        city: 'Hyderabad',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        course_fee: 40000,
        discount: 0,
        training_mode: 'Classroom' as const,
        admission_date: new Date().toISOString().slice(0, 10),
        counsellor_id: actor.id,
        lead_id: testLead.id,
        education: 'Graduate',
        experience_years: 1,
        current_employment_status: 'Employed' as const,
        payment_plan: 'Full Payment' as const,
      };

      await expect(
        paymentTransaction(actor, () => createAdmissionWorkflow(payload, actor.id, true))
      ).rejects.toThrow(/Simulated database lock or trigger failure/i);

      // All state must be restored by paymentTransaction
      expect(store.students.length).toBe(initialStudentsCount);
      expect(store.admissions.length).toBe(initialAdmissionsCount);
      expect(store.feeAccounts.length).toBe(initialFeeAccountsCount);
      expect(store.students.some(s => s.email === testLead.email)).toBe(false);
      expect(store.admissions.some(a => (a as any).lead_id === testLead.id)).toBe(false);
    });
  });

  describe('4. Automatic Redirection to paymentTransaction (No Unsafe Sequential Relational Path)', () => {
    it('redirects createAdmissionWorkflow(!transactional) into paymentTransaction automatically', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { createAdmissionWorkflow } = await import('@/lib/services/admission-service');

      const testLead: Lead = {
        id: 'auto-redirect-lead-' + Date.now(),
        lead_code: 'LD-REDIR-001',
        full_name: 'Redirect Prospect',
        phone: '9888877774',
        email: 'redirect@example.com',
        counsellor_id: actor.id,
        stage: 'New',
        training_preference: 'Hybrid',
        lead_source: 'Website',
        current_status: 'Employed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(testLead);

      const payload = {
        student_name: testLead.full_name,
        phone: testLead.phone,
        email: testLead.email,
        dob: '1996-03-20',
        gender: 'Male' as const,
        address: '202 Banjara Hills',
        city: 'Hyderabad',
        course_id: store.courses[0]?.id || 'crs-fico-01',
        course_fee: 40000,
        discount: 0,
        training_mode: 'Hybrid' as const,
        admission_date: new Date().toISOString().slice(0, 10),
        counsellor_id: actor.id,
        lead_id: testLead.id,
        education: 'Graduate',
        experience_years: 2,
        current_employment_status: 'Employed' as const,
        payment_plan: 'Full Payment' as const,
      };

      // Call without specifying transactional (default = false)
      const result = await createAdmissionWorkflow(payload, actor.id);

      expect(result).toBeDefined();
      expect(result.admission).toBeDefined();
      expect(result.admission.student_name).toBe(testLead.full_name);
      expect(testLead.stage).toBe('Converted');

      // Attempting duplicate conversion via non-transactional call must also be safely rejected
      await expect(
        createAdmissionWorkflow(payload, actor.id)
      ).rejects.toThrow(/already been converted/i);
    });
  });
});
