import { enteredPaymentVerification } from './payment-verification-fixture';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getOnboardingCases,
  getOnboardingCaseById,
  getOnboardingKpis,
  ensureOnboardingCaseForAdmission,
  assignOnboardingStaff,
  updateChecklistItem,
  uploadStudentDocument,
  verifyStudentDocument,
  provisionStudentLmsAccount,
  arrangeStudentOrientation,
  confirmStudentPortalAccess,
  setCaseBlocked,
  unblockCase,
  completeOnboardingWorkflow,
  getOnboardingAuditLogs,
  getOnboardingStaffPerformance,
  getUnbackfilledAdmissionsCount,
  backfillLegacyAdmissions,
  dispatchStudentWelcomeNotification,
} from '@/lib/services/onboarding-service';
import { hasPermission, canAccessOnboardingCase, canAssignOnboardingStaff } from '@/lib/auth/rbac';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { UserProfile, Admission, OnboardingCase } from '@/types';

describe('24. Student Onboarding Team & Lifecycle Management Tests', () => {
  const adminUser: UserProfile = {
    id: 'usr-admin',
    email: 'admin@next-generpsolutions.com',
    full_name: 'Priya Nair (Operations Head)',
    role: 'admin',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const onboardingStaff1: UserProfile = {
    id: 'usr-onb-staff-1',
    email: 'sneha.patel@next-generpsolutions.com',
    full_name: 'Sneha Patel',
    role: 'onboarding_team',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const onboardingStaff2: UserProfile = {
    id: 'usr-onb-staff-2',
    email: 'rahul.deshmukh@next-generpsolutions.com',
    full_name: 'Rahul Deshmukh',
    role: 'onboarding_team',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const studentUser: UserProfile = {
    id: 'usr-stu-test',
    email: 'test.student@example.com',
    full_name: 'Test Student',
    role: 'student',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Ensure users exist in store
    if (!store.users.some((u) => u.id === onboardingStaff1.id)) {
      store.users.push(onboardingStaff1);
    }
    if (!store.users.some((u) => u.id === onboardingStaff2.id)) {
      store.users.push(onboardingStaff2);
    }
    // Ensure batches have capacity for onboarding admission tests
    store.batches.forEach((b) => {
      b.current_enrolled = Math.min(b.current_enrolled || 0, 10);
    });
  });

  // ==========================================
  // 1. ROLE MANAGEMENT & RBAC BOUNDARIES
  // ==========================================
  describe('1. Role Management & Default-Deny RBAC Permissions', () => {
    it('grants onboarding staff operational onboarding permissions', () => {
      expect(hasPermission(onboardingStaff1, 'onboarding:read')).toBe(true);
      expect(hasPermission(onboardingStaff1, 'onboarding:write')).toBe(true);
      expect(hasPermission(onboardingStaff1, 'onboarding:activate')).toBe(true);
      expect(hasPermission(onboardingStaff1, 'onboarding:complete')).toBe(true);
      expect(hasPermission(onboardingStaff1, 'students:read')).toBe(true);
      expect(hasPermission(onboardingStaff1, 'courses:read')).toBe(true);
      expect(hasPermission(onboardingStaff1, 'batches:read')).toBe(true);
    });

    it('strictly denies onboarding staff financial and administrative mutations', () => {
      // Cannot modify accounts or create payments
      expect(hasPermission(onboardingStaff1, 'accounts:write')).toBe(false);
      expect(hasPermission(onboardingStaff1, 'payments:create')).toBe(false);
      expect(hasPermission(onboardingStaff1, 'expenses:write')).toBe(false);

      // Cannot assign staff (only Admin can assign)
      expect(hasPermission(onboardingStaff1, 'onboarding:assign')).toBe(false);

      // Cannot convert CRM leads or manage roles
      expect(hasPermission(onboardingStaff1, 'crm:convert')).toBe(false);
      expect(hasPermission(onboardingStaff1, 'roles:manage')).toBe(false);
      expect(hasPermission(onboardingStaff1, 'admissions:approve')).toBe(false);
    });

    it('allows Admin to assign staff, but prohibits Onboarding staff from self-assigning', () => {
      expect(canAssignOnboardingStaff(adminUser)).toBe(true);
      expect(canAssignOnboardingStaff(onboardingStaff1)).toBe(false);
      expect(canAssignOnboardingStaff(studentUser)).toBe(false);
    });
  });

  // ==========================================
  // 2. ADMISSION HANDOFF & CRM ELIGIBILITY
  // ==========================================
  describe('2. Admission Handoff & CRM Eligibility Rules', () => {
    it('creates an onboarding case after admission confirmation and Accounts approval', async () => {
      const result = await createAdmissionWorkflow(
        {
          student_name: 'Pooja Sharma',
          phone: '+91 98333 44455',
          email: 'pooja.sharma@example.com',
          dob: '2000-01-10',
          gender: 'Female',
          address: 'Plot 10, HITEC City',
          city: 'Hyderabad',
          education: 'B.Tech IT',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: 'crs-fico-01',
          training_mode: 'Online',
          batch_id: 'batch-fico-01',
          admission_date: '2026-03-01',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
        },
        adminUser.id
      );

      expect(result.admission.status).toBe('Confirmed');

      expect(store.onboardingCases.find((c) => c.admission_id === result.admission.id)).toBeUndefined();
      const submitted = feeWorkflowService.recordPayment({ fee_id: result.studentFee!.id, amount_paid: 1000, payment_mode: 'Cash' }, adminUser.id);
      feeWorkflowService.verifyPayment(submitted.id, store.users.find((u) => u.role === 'accountant')!.id, undefined, enteredPaymentVerification(submitted.id));
      // Verify onboarding case was automatically created
      const onbCase = store.onboardingCases.find((c) => c.admission_id === result.admission.id);
      expect(onbCase).toBeDefined();
      expect(onbCase?.student_name).toBe('Pooja Sharma');
      expect(onbCase?.status).toBe('pending');
      expect(onbCase?.checklist.admission_confirmation.completed).toBe(true);
    });

    it('rejects onboarding initialization for unconfirmed or draft admissions', async () => {
      const draftAdmission: Admission = {
        id: `adm-draft-${Date.now()}`,
        admission_number: 'ADM-DRAFT-999',
        student_name: 'Draft Student',
        phone: '+91 99999 00000',
        email: 'draft@example.com',
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Test Addr',
        city: 'Hyderabad',
        education: 'Graduate',
        experience_years: 0,
        current_employment_status: 'Student',
        course_id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance (FICO)',
        training_mode: 'Online',
        admission_date: '2026-03-01',
        course_fee: 45000,
        discount: 0,
        net_payable: 45000,
        payment_plan: 'Full Payment',
        status: 'Cancelled',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.admissions.unshift(draftAdmission);

      await expect(
        ensureOnboardingCaseForAdmission(draftAdmission.id, adminUser.id)
      ).rejects.toThrow(/Only Confirmed admissions are eligible/);
    });

    it('CRM stage change (Closed Won) does NOT automatically create onboarding case', () => {
      const initialCount = store.onboardingCases.length;

      // Simulate lead stage updated to Converted / Won
      const lead = store.leads[0];
      if (lead) {
        lead.stage = 'Converted';
        lead.notes = 'Closed Won - prospective lead';
      }

      // Verify no onboarding case was secretly created
      expect(store.onboardingCases.length).toBe(initialCount);
    });

    it('prevents duplicate onboarding cases for the same admission (Idempotency)', async () => {
      const existingAdmission = store.admissions.find((a) => a.status === 'Confirmed')!;
      expect(existingAdmission).toBeDefined();

      const case1 = await ensureOnboardingCaseForAdmission(existingAdmission.id, adminUser.id);
      const case2 = await ensureOnboardingCaseForAdmission(existingAdmission.id, adminUser.id);

      expect(case1.id).toBe(case2.id);
      expect(case1.case_number).toBe(case2.case_number);
    });
  });

  // ==========================================
  // 3. ASSIGNMENT & TENANT ISOLATION
  // ==========================================
  describe('3. Assignment & Staff Scoping Isolation', () => {
    it('allows Admin to assign a case to an onboarding specialist', async () => {
      const targetCase = store.onboardingCases[0];
      const updated = await assignOnboardingStaff(targetCase.id, onboardingStaff1.id, adminUser);

      expect(updated.assigned_staff_id).toBe(onboardingStaff1.id);
      expect(updated.assigned_staff_name).toBe(onboardingStaff1.full_name);
      expect(updated.status).toBe('in_progress');
    });

    it('prohibits unauthorized non-admin from reassigning staff', async () => {
      const targetCase = store.onboardingCases[0];

      await expect(
        assignOnboardingStaff(targetCase.id, onboardingStaff2.id, onboardingStaff1)
      ).rejects.toThrow(/Only administrators can assign onboarding staff/);
    });

    it('onboarding specialist can view only their own assigned cases', async () => {
      // Set case 0 to staff 1, and case 1 to staff 2
      if (store.onboardingCases[0]) {
        store.onboardingCases[0].assigned_staff_id = onboardingStaff1.id;
      }
      if (store.onboardingCases[1]) {
        store.onboardingCases[1].assigned_staff_id = onboardingStaff2.id;
      }

      const staff1Cases = await getOnboardingCases(onboardingStaff1);
      const staff2Cases = await getOnboardingCases(onboardingStaff2);
      const adminCases = await getOnboardingCases(adminUser);

      // Staff 1 only sees their cases
      expect(staff1Cases.every((c) => c.assigned_staff_id === onboardingStaff1.id)).toBe(true);

      // Staff 2 only sees their cases
      expect(staff2Cases.every((c) => c.assigned_staff_id === onboardingStaff2.id)).toBe(true);

      // Admin sees all cases
      expect(adminCases.length).toBeGreaterThanOrEqual(staff1Cases.length + staff2Cases.length);
    });

    it('onboarding specialist cannot access or update an unassigned case or another specialist case', async () => {
      const caseAssignedToStaff2 = store.onboardingCases.find(
        (c) => c.assigned_staff_id === onboardingStaff2.id
      );
      expect(caseAssignedToStaff2).toBeDefined();

      // canAccessOnboardingCase evaluates to false
      expect(canAccessOnboardingCase(onboardingStaff1, caseAssignedToStaff2)).toBe(false);

      // Updating checklist throws access denied
      await expect(
        updateChecklistItem(
          caseAssignedToStaff2!.id,
          'student_details_verification',
          true,
          'Tampering attempt',
          onboardingStaff1
        )
      ).rejects.toThrow(/Access denied/);
    });
  });

  // ==========================================
  // 4. CHECKLIST RULES & LIFECYCLE COMPLETION
  // ==========================================
  describe('4. Checklist Rules, Document Verification & Completion', () => {
    it('allows assigned specialist to upload and verify documents', async () => {
      const targetCase = store.onboardingCases.find(
        (c) => c.assigned_staff_id === onboardingStaff1.id
      )!;

      const updated = await uploadStudentDocument(
        targetCase.id,
        {
          name: 'Passport_Photo.png',
          doc_type: 'photo',
          file_url: 'https://storage.next-gen.com/docs/photo.png',
        },
        onboardingStaff1
      );

      const addedDoc = updated.documents.find((d) => d.name === 'Passport_Photo.png');
      expect(addedDoc).toBeDefined();
      expect(addedDoc?.status).toBe('pending');

      // Verify the document
      const verifiedCase = await verifyStudentDocument(
        targetCase.id,
        addedDoc!.id,
        'verified',
        undefined,
        onboardingStaff1
      );
      const verifiedDoc = verifiedCase.documents.find((d) => d.id === addedDoc!.id);
      expect(verifiedDoc?.status).toBe('verified');
      expect(verifiedDoc?.verified_by).toBe(onboardingStaff1.full_name);
    });

    it('provisions LMS account idempotently without exposing credentials', async () => {
      const targetCase = store.onboardingCases.find(
        (c) => c.assigned_staff_id === onboardingStaff1.id
      )!;

      await expect(provisionStudentLmsAccount(targetCase.id, onboardingStaff1)).rejects.toThrow(/checks are completed/);
      for (const key of ['admission_confirmation', 'student_details_verification', 'document_verification', 'course_confirmation', 'batch_allocation', 'fee_clearance_verification'] as const) targetCase.checklist[key].completed = true;
      const linkedAdmission = store.admissions.find((a) => a.id === targetCase.admission_id);
      if (linkedAdmission) linkedAdmission.status = 'Confirmed';
      const linkedPayment = store.studentPayments.find((p) => p.student_id === targetCase.student_id && p.verification_status === 'Verified');
      if (!linkedPayment) store.studentPayments.push({ id: 'approved-for-activation', fee_id: 'legacy', student_id: targetCase.student_id, enrollment_id: targetCase.admission_id, student_name: targetCase.student_name, admission_number: targetCase.admission_number, fee_category: 'Course Fee', amount_paid: 1000, payment_date: '2026-10-12', payment_mode: 'Cash', recorded_by: adminUser.id, recorded_by_name: 'Admin', recorded_by_role: 'admin', verification_status: 'Verified', created_at: new Date().toISOString() });
      const result = await provisionStudentLmsAccount(targetCase.id, onboardingStaff1);
      expect(result.success).toBe(true);
      expect(result.caseRecord.lms_account_created).toBe(true);
      expect(result.caseRecord.checklist.lms_account_activation.completed).toBe(true);
      expect(result.caseRecord.checklist.welcome_notification.completed).toBe(true);

      // Verify student user in store is active
      const userRecord = store.users.find((u) => u.email === targetCase.student_email);
      expect(userRecord?.is_active).toBe(true);
      expect(userRecord?.role).toBe('student');
      expect(
        store.notifications.some(
          (n) => n.user_id === userRecord?.id || n.title.includes('LMS Student Portal')
        )
      ).toBe(true);

      // Calling again is idempotent and does not error
      const repeatResult = await provisionStudentLmsAccount(targetCase.id, onboardingStaff1);
      expect(repeatResult.success).toBe(true);
    });

    it('requires a mandatory reason when placing a case on hold/blocked', async () => {
      const targetCase = store.onboardingCases.find(
        (c) => c.assigned_staff_id === onboardingStaff1.id
      )!;

      await expect(setCaseBlocked(targetCase.id, '', onboardingStaff1)).rejects.toThrow(
        /A blocking reason is required/
      );

      const blockedCase = await setCaseBlocked(
        targetCase.id,
        'Student requesting batch shift to next month',
        onboardingStaff1
      );
      expect(blockedCase.status).toBe('blocked');
      expect(blockedCase.blocked_reason).toBe('Student requesting batch shift to next month');

      // Unblock resumes status
      const unblocked = await unblockCase(targetCase.id, onboardingStaff1);
      expect(unblocked.status).toBe('in_progress');
      expect(unblocked.blocked_reason).toBeUndefined();
    });

    it('prohibits completing onboarding if mandatory checklist items are incomplete', async () => {
      const targetCase = store.onboardingCases.find(
        (c) => c.assigned_staff_id === onboardingStaff1.id
      )!;

      // Ensure at least one mandatory item is incomplete
      targetCase.checklist.academic_handover.completed = false;
      targetCase.checklist.first_class_confirmation.completed = false;

      await expect(
        completeOnboardingWorkflow(targetCase.id, onboardingStaff1)
      ).rejects.toThrow(/Cannot complete onboarding: The following mandatory checklist items must be completed first/);
    });

    it('successfully completes onboarding and logs academic handover when all mandatory items are done', async () => {
      const targetCase = store.onboardingCases.find(
        (c) => c.assigned_staff_id === onboardingStaff1.id
      )!;

      // Mark all mandatory items as completed
      for (const key of Object.keys(targetCase.checklist) as (keyof typeof targetCase.checklist)[]) {
        targetCase.checklist[key].completed = true;
        targetCase.checklist[key].completed_at = new Date().toISOString();
        targetCase.checklist[key].completed_by = onboardingStaff1.id;
      }

      const completedCase = await completeOnboardingWorkflow(targetCase.id, onboardingStaff1);
      expect(completedCase.status).toBe('completed');
      expect(completedCase.completed_by).toBe(onboardingStaff1.full_name);
      expect(completedCase.academic_handover_confirmed).toBe(true);

      // Verify audit logs record completion and academic handover dispatch
      const auditLogs = await getOnboardingAuditLogs(targetCase.id, onboardingStaff1);
      expect(auditLogs.some((l) => l.action === 'ONBOARDING_COMPLETED')).toBe(true);
      expect(auditLogs.some((l) => l.action === 'ACADEMIC_HANDOVER_DISPATCHED')).toBe(true);

      // Verify academic notifications dispatched to Trainer & Academic Operations team
      const trainerNotif = store.notifications.find(
        (n) => n.category === 'onboarding' && n.title.includes('Academic Handover:')
      );
      expect(trainerNotif).toBeDefined();
      expect(trainerNotif?.title).toContain('Pooja Sharma');
      expect(trainerNotif?.message).toContain('Pooja Sharma');
      expect(trainerNotif?.message).toContain('SAP S/4HANA Finance (FICO)');
      expect(trainerNotif?.message).toContain('Batch:');
      expect(trainerNotif?.message).toContain('Orientation Date:');
      expect(trainerNotif?.message).toContain('First Lecture Confirmation:');

      // Verify academic operations team alert
      const opsNotif = store.notifications.find(
        (n) => n.category === 'onboarding' && n.title.includes('Academic Handover Dispatched:')
      );
      expect(opsNotif).toBeDefined();
      expect(opsNotif?.message).toContain('Pooja Sharma');
      expect(opsNotif?.message).toContain('First Lecture Confirmation:');
    });

    it('defends against unprovisioned student login with clear onboarding guidance', async () => {
      // 1. Create admission and student workflow
      const unprovisionedEmail = `unprov.${Date.now()}@example.com`;
      const admResult = await createAdmissionWorkflow(
        {
          student_name: 'Rahul Verma',
          phone: '+91 99999 11111',
          email: unprovisionedEmail,
          dob: '2001-05-15',
          gender: 'Male',
          address: 'Gachibowli',
          city: 'Hyderabad',
          education: 'B.Com Computers',
          experience_years: 0,
          current_employment_status: 'Student',
          course_id: 'crs-fico-01',
          training_mode: 'Online',
          batch_id: 'btc-fico-01',
          admission_date: '2026-03-01',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
        },
        adminUser.id
      );

      // Deactivate user to simulate pre-provisioning state
      const matched = store.users.find((u) => u.email === unprovisionedEmail);
      if (matched) {
        matched.is_active = false;
      }
      expect(matched?.is_active).toBe(false);
      expect(matched?.role).toBe('student');

      // 2. Fetch the created onboarding case
      const initialPayment = feeWorkflowService.recordPayment({ fee_id: admResult.studentFee!.id, amount_paid: 1000, payment_mode: 'Cash' }, adminUser.id);
      feeWorkflowService.verifyPayment(initialPayment.id, store.users.find((u) => u.role === 'accountant')!.id, undefined, enteredPaymentVerification(initialPayment.id));
      const unprovCase = store.onboardingCases.find((c) => c.admission_id === admResult.admission.id)!;
      expect(unprovCase).toBeDefined();
      expect(unprovCase.lms_account_created).toBe(false);

      // Assign to staff
      await assignOnboardingStaff(unprovCase.id, onboardingStaff1.id, adminUser);

      // 3. Complete LMS provisioning step
      for (const key of ['admission_confirmation', 'student_details_verification', 'document_verification', 'course_confirmation', 'batch_allocation', 'fee_clearance_verification'] as const) unprovCase.checklist[key].completed = true;
      const provisioned = await provisionStudentLmsAccount(unprovCase.id, onboardingStaff1);
      expect(provisioned.success).toBe(true);
      expect(matched?.is_active).toBe(true);
      expect(provisioned.caseRecord.lms_account_created).toBe(true);
    });

    it('computes accurate staff performance and SLA turnaround metrics for administrators', async () => {
      const performanceList = await getOnboardingStaffPerformance(adminUser);
      expect(performanceList.length).toBeGreaterThan(0);

      // Verify each staff record has required SLA and workload metrics
      const staff1Perf = performanceList.find((s) => s.staff_id === onboardingStaff1.id);
      expect(staff1Perf).toBeDefined();
      expect(staff1Perf?.staff_name).toBe(onboardingStaff1.full_name);
      expect(typeof staff1Perf?.total_assigned).toBe('number');
      expect(typeof staff1Perf?.pending_count).toBe('number');
      expect(typeof staff1Perf?.in_progress_count).toBe('number');
      expect(typeof staff1Perf?.completed_count).toBe('number');
      expect(typeof staff1Perf?.overdue_count).toBe('number');
      expect(typeof staff1Perf?.avg_completion_days).toBe('number');
      expect(typeof staff1Perf?.sla_compliance_rate).toBe('number');
      expect(['Available', 'Balanced', 'High Workload']).toContain(staff1Perf?.workload_status);
    });

    it('strictly denies non-admin users from viewing staff performance analytics', async () => {
      // Onboarding team member must be rejected
      await expect(getOnboardingStaffPerformance(onboardingStaff1)).rejects.toThrow(
        'Access denied: Only administrators can view staff performance analytics.'
      );

      // Student user must be rejected
      await expect(getOnboardingStaffPerformance(studentUser)).rejects.toThrow(
        'Access denied: Only administrators can view staff performance analytics.'
      );
    });

    it('accurately identifies and backfills unhandled legacy admissions idempotently for admins', async () => {
      // 1. Check unbackfilled count
      const initialUnbackfilled = await getUnbackfilledAdmissionsCount(adminUser);
      expect(typeof initialUnbackfilled).toBe('number');

      // 2. Perform backfill as administrator
      const result = await backfillLegacyAdmissions(adminUser);
      expect(result.total_processed).toBeGreaterThanOrEqual(result.cases_created);
      expect(result.cases_created).toBe(initialUnbackfilled);
      expect(result.created_case_numbers.length).toBe(result.cases_created);

      // 3. Verify unbackfilled count is now 0
      const remainingUnbackfilled = await getUnbackfilledAdmissionsCount(adminUser);
      expect(remainingUnbackfilled).toBe(0);

      // 4. Test idempotency: Running backfill again produces 0 new cases
      const secondRun = await backfillLegacyAdmissions(adminUser);
      expect(secondRun.cases_created).toBe(0);
      expect(secondRun.cases_skipped).toBe(result.total_processed);

      // 5. Verify audit logs recorded for backfilled cases
      if (result.created_case_numbers.length > 0) {
        const firstCase = store.onboardingCases.find((c) => c.case_number === result.created_case_numbers[0]);
        expect(firstCase).toBeDefined();
        const logs = await getOnboardingAuditLogs(firstCase!.id, adminUser);
        expect(logs.some((l) => l.action === 'LEGACY_ADMISSION_BACKFILL')).toBe(true);
      }
    });

    it('strictly denies non-admin users from executing legacy admission backfill', async () => {
      await expect(backfillLegacyAdmissions(onboardingStaff1)).rejects.toThrow(
        'Access denied: Only administrators can backfill legacy admissions.'
      );
      await expect(backfillLegacyAdmissions(studentUser)).rejects.toThrow(
        'Access denied: Only administrators can backfill legacy admissions.'
      );
    });

    it('dispatches multi-channel welcome notification and orientation kit via email & whatsapp', async () => {
      // 1. Pick an assigned onboarding case
      const targetCase = store.onboardingCases.find((c) => c.assigned_staff_id === onboardingStaff1.id);
      expect(targetCase).toBeDefined();

      // 2. Dispatch welcome kit with orientation details
      const result = await dispatchStudentWelcomeNotification(targetCase!.id, onboardingStaff1, {
        orientationDate: '2026-03-10',
        orientationMode: 'Online',
        customMessage: 'Welcome to SAP S/4HANA Finance batch! Please check your portal credentials.',
      });

      expect(result.success).toBe(true);
      expect(result.caseRecord.checklist.welcome_notification.completed).toBe(true);
      expect(result.caseRecord.orientation_date).toBe('2026-03-10');

      // 3. Verify in-app notification created
      const studentNotif = store.notifications.find(
        (n) => n.user_id === targetCase!.student_id && n.category === 'onboarding'
      );
      expect(studentNotif).toBeDefined();
      expect(studentNotif?.title).toContain('Welcome to Next-Gen ERP');

      // 4. Verify audit event recorded
      const logs = await getOnboardingAuditLogs(targetCase!.id, onboardingStaff1);
      expect(logs.some((l) => l.action === 'WELCOME_NOTIFICATION_DISPATCHED')).toBe(true);
    });
  });
});



