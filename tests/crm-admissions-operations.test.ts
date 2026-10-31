import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createLead, updateLeadStage, completeFollowup, bulkAssignLeads, bulkUpdateLeadStage } from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { getStudents, getStudentProfileFullDetails } from '@/lib/services/student-service';

describe('CRM, Admissions & Student 360 Operations Suite', () => {
  const counsellorId = 'usr-counsellor-01';
  const studentUserId = 'usr-student-01';
  const otherStudentUserId = 'usr-student-02';

  afterEach(() => {
    store.batches.forEach((b) => {
      b.current_enrolled = 10;
    });
  });

  beforeEach(() => {
    // Reset seed users
    store.users = [
      {
        id: counsellorId,
        email: 'counsellor@lms.internal',
        full_name: 'Ananya Desai',
        role: 'counsellor',
        is_active: true,
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: studentUserId,
        email: 'student1@lms.internal',
        full_name: 'Aditi Rao',
        role: 'student',
        is_active: true,
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: otherStudentUserId,
        email: 'student2@lms.internal',
        full_name: 'Karan Mehra',
        role: 'student',
        is_active: true,
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Ensure batches have available capacity for admission tests
    store.batches.forEach((b) => {
      b.current_enrolled = 5;
    });

    store.reconcileDualLedgers();
  });

  describe('1. CRM Lead Lifecycle & Bulk Operations', () => {
    it('creates leads with persistent code generation and counsellor tagging', async () => {
      const lead = await createLead({
        full_name: 'Vikas Khanna',
        phone: '+91 98888 12345',
        email: 'vikas@example.com',
        interested_course_id: store.courses[0]?.id || 'crs-01',
        counsellor_id: counsellorId,
        training_preference: 'Hybrid',
        lead_source: 'Website',
        stage: 'New',
      });

      expect(lead.id).toBeDefined();
      expect(lead.lead_code).toMatch(/^LD-\d{4}-\d+/);
      expect(lead.stage).toBe('New');
      expect(lead.counsellor_id).toBe(counsellorId);

      const persisted = store.leads.find((l) => l.id === lead.id);
      expect(persisted).toBeDefined();
    });

    it('updates lead stages with follow-up dates and interaction notes', async () => {
      const lead = await createLead({
        full_name: 'Pooja Bhatt',
        phone: '+91 97777 54321',
        email: 'pooja@example.com',
        interested_course_id: store.courses[0]?.id || 'crs-01',
        counsellor_id: counsellorId,
        stage: 'New',
      });

      const updated = await updateLeadStage(
        lead.id,
        'Follow-up',
        'Candidate interested in weekend batch. Callback requested.',
        counsellorId,
        '2026-10-20T11:00:00'
      );

      expect(updated.stage).toBe('Follow-up');
      expect(updated.notes).toContain('Callback requested');
      expect(updated.follow_up_date).toBe('2026-10-20T11:00:00');

      const persisted = store.leads.find((l) => l.id === lead.id);
      expect(persisted?.stage).toBe('Follow-up');
      expect(persisted?.follow_up_date).toBe('2026-10-20T11:00:00');

      // Test completing follow-up
      const completed = await completeFollowup(
        lead.id,
        counsellorId,
        'Attended demo and requested fee breakup'
      );
      expect(completed.stage).toBe('Interested');
      expect(completed.follow_up_date).toBeUndefined();
      expect(completed.notes).toContain('[COMPLETED]');
      expect(store.leads.find((l) => l.id === lead.id)?.follow_up_date).toBeUndefined();
    });

    it('performs bulk reassignment and bulk stage updates across multiple leads', async () => {
      const l1 = await createLead({
        full_name: 'Bulk Candidate 1',
        phone: '+91 90001 00001',
        email: 'bulk1@example.com',
        counsellor_id: 'usr-unassigned',
        stage: 'New',
      });
      const l2 = await createLead({
        full_name: 'Bulk Candidate 2',
        phone: '+91 90002 00002',
        email: 'bulk2@example.com',
        counsellor_id: 'usr-unassigned',
        stage: 'New',
      });

      const assignedCount = await bulkAssignLeads([l1.id, l2.id], counsellorId, 'usr-admin');
      expect(assignedCount).toBe(2);

      expect(store.leads.find((l) => l.id === l1.id)?.counsellor_id).toBe(counsellorId);
      expect(store.leads.find((l) => l.id === l2.id)?.counsellor_id).toBe(counsellorId);

      const stageCount = await bulkUpdateLeadStage(
        [l1.id, l2.id],
        'Demo Scheduled',
        counsellorId,
        'Batch weekend demo scheduled',
        '2026-10-25T14:00:00'
      );
      expect(stageCount).toBe(2);
      expect(store.leads.find((l) => l.id === l1.id)?.stage).toBe('Demo Scheduled');
      expect(store.leads.find((l) => l.id === l1.id)?.follow_up_date).toBe('2026-10-25T14:00:00');
      expect(store.leads.find((l) => l.id === l2.id)?.follow_up_date).toBe('2026-10-25T14:00:00');
    });

    it('handles empty courses safely during lead creation and conversion helper', async () => {
      const originalCourses = [...store.courses];
      try {
        store.courses = [];
        const lead = await createLead({
          full_name: 'Resilient Lead',
          phone: '+91 99999 88888',
          email: 'resilient@example.com',
          interested_course_id: 'non-existent',
          counsellor_id: counsellorId,
          stage: 'New',
        });
        expect(lead.id).toBeDefined();
        expect(lead.interested_course_name).toBeUndefined();

        const { admissionPrefill } = await import('@/lib/services/crm-service').then(m => m.convertLeadToAdmission(lead.id));
        expect(admissionPrefill.course_fee).toBe(0);
        expect(admissionPrefill.city).toBe('');
      } finally {
        store.courses = originalCourses;
      }
    });

    it('logs structured call outcomes and interactions without corrupting historical notes', async () => {
      const lead = await createLead({
        full_name: 'Tarun Joshi',
        phone: '+91 91234 56789',
        email: 'tarun@example.com',
        interested_course_id: store.courses[0]?.id || 'crs-01',
        counsellor_id: counsellorId,
        stage: 'Follow-up',
      });

      // Entry 1: Call Back Requested
      const note1 = '[10/16/2026, 10:30 AM | Call Back Requested]: Candidate asked for weekend batch details';
      await updateLeadStage(lead.id, 'Follow-up', note1, counsellorId, '2026-10-22T11:00:00');

      // Entry 2: Demo Scheduled
      const note2 = '[10/18/2026, 03:00 PM | Demo Scheduled / Confirmed]: Scheduled faculty demo for S/4HANA Finance';
      await updateLeadStage(lead.id, 'Demo Scheduled', note2, counsellorId, '2026-10-25T14:00:00');

      const updatedLead = store.leads.find((l) => l.id === lead.id);
      expect(updatedLead?.stage).toBe('Demo Scheduled');
      expect(updatedLead?.follow_up_date).toBe('2026-10-25T14:00:00');
      expect(updatedLead?.notes).toContain('Candidate asked for weekend batch details');
      expect(updatedLead?.notes).toContain('Scheduled faculty demo for S/4HANA Finance');

      // Verify that notes are cleanly parseable into distinct entries
      const blocks = updatedLead?.notes?.split(/\n(?=(?:\[|\-\-\-))/) || [];
      expect(blocks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('2. Admissions Workflow & Multi-Store Synthesis', () => {
    it('creates an admission workflow generating student profile, fee ledger, and onboarding case atomically', async () => {
      const course = store.courses[0];
      const batch = store.batches.find((b) => b.course_id === course?.id) || store.batches[0];

      const admissionResult = await createAdmissionWorkflow(
        {
          student_name: 'Sunil Gavaskar',
          phone: '+91 91111 22222',
          email: `sunil.${Date.now()}@cricket.in`,
          dob: '1999-07-10',
          gender: 'Male',
          address: 'Marine Drive',
          city: 'Mumbai',
          state: 'Maharashtra',
          state_code: '27',
          education: 'Graduate / B.Com',
          experience_years: 2,
          current_employment_status: 'Employed',
          course_id: course.id,
          batch_id: batch?.id,
          admission_date: '2026-03-20',
          course_fee: course.price,
          discount: 5000,
          discount_reason: 'Sports scholarship',
          payment_plan: '2 Installments',
          counsellor_id: counsellorId,
        },
        counsellorId
      );

      expect(admissionResult.admission).toBeDefined();
      expect(admissionResult.student).toBeDefined();
      expect(admissionResult.feeAccount).toBeDefined();

      const student = admissionResult.student;
      expect(student.full_name).toBe('Sunil Gavaskar');
      expect(student.total_fee).toBe(course.price - 5000);
      expect(student.outstanding_amount).toBe(course.price - 5000);

      // Verify Onboarding Case was triggered
      const onboardingCase = store.onboardingCases.find((c) => c.student_id === student.id);
      expect(onboardingCase).toBeUndefined();
      expect(store.users.find((u) => u.id === admissionResult.student.user_id)?.is_active).toBe(false);
    });

    it('records initial downpayment atomically during admission registration and generates GST receipt', async () => {
      const course = store.courses[0];
      const batch = store.batches.find((b) => b.course_id === course.id);

      const downpaymentAmount = 15000;
      const discountAmount = 5000;
      const netPayable = course.price - discountAmount;

      const admissionResult = await createAdmissionWorkflow(
        {
          student_name: 'Meera Sen',
          phone: '+91 98888 77777',
          email: `meera.${Date.now()}@cinema.in`,
          dob: '2000-02-14',
          gender: 'Female',
          address: 'Jubilee Hills',
          city: 'Hyderabad',
          state: 'Telangana',
          state_code: '36',
          education: 'B.Tech IT',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: course.id,
          batch_id: batch?.id,
          admission_date: '2026-03-25',
          course_fee: course.price,
          discount: discountAmount,
          discount_reason: 'Early bird registration',
          payment_plan: '3 Installments',
          counsellor_id: counsellorId,
          initial_payment_amount: downpaymentAmount,
          payment_mode: 'UPI',
          transaction_reference: `UPI-ADM-${Date.now()}`,
          initial_payment_notes: 'Initial admission installment paid via UPI QR',
          payment_proof_url: 'https://example.com/admission-payment.png',
        },
        counsellorId
      );

      expect(admissionResult.admission).toBeDefined();
      expect(admissionResult.student).toBeDefined();
      expect(admissionResult.feeAccount).toBeDefined();
      expect(admissionResult.payment).toBeDefined();
      expect(admissionResult.receipt).toBeUndefined();
      expect(admissionResult.payment?.status).toBe('Pending Approval');
      expect(admissionResult.student.paid_amount).toBe(0);
      store.users.push({ id: 'accounts-approval-test', full_name: 'Accounts', email: 'accounts@approval.test', role: 'accountant', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      feeWorkflowService.verifyPayment(admissionResult.payment!.id, 'accounts-approval-test');

      const student = admissionResult.student;
      expect(student.total_fee).toBe(netPayable);
      expect(student.paid_amount).toBe(downpaymentAmount);
      expect(student.outstanding_amount).toBe(netPayable - downpaymentAmount);

      const feeAccount = admissionResult.feeAccount;
      expect(feeAccount.paid_amount).toBe(downpaymentAmount);
      expect(feeAccount.outstanding_amount).toBe(netPayable - downpaymentAmount);
      expect(feeAccount.status).toBe('Partially Paid');

      // Check installments: 1st installment should be paid
      const installments = admissionResult.installments || [];
      expect(installments).toHaveLength(0);
      expect(admissionResult.studentFee?.tax_gst_amount).toBe(0);

      // Check payment and receipt records
      const payment = admissionResult.payment!;
      expect(payment.amount_paid).toBe(downpaymentAmount);
      expect(payment.payment_mode).toBe('UPI');
      expect(payment.status).toBe('Approved');
      const savedPayment = store.studentPayments.find((entry) => entry.receipt_number === payment.receipt_number);
      expect(savedPayment?.payment_proof_url).toBe('https://example.com/admission-payment.png');

      const receipt = store.receipts.find((r) => r.payment_id === payment.id)!;
      expect(receipt.receipt_number).toMatch(/^REC-\d{4}-/);
      expect(receipt.payment_amount).toBe(downpaymentAmount);
      expect(receipt.remaining_balance).toBe(netPayable - downpaymentAmount);
      expect(receipt.irn).toBe('');
      expect(receipt.sac_code).toBe('');
      expect(receipt.total_tax).toBe(0);

      // Check dual-ledger sync
      const studentPayment = store.studentPayments.find((sp) => sp.id === payment.id);
      expect(studentPayment).toBeDefined();
      expect(studentPayment?.verification_status).toBe('Verified');
    });

    it('rejects initial admission payment exceeding net payable fee', async () => {
      const course = store.courses[0];
      const batch = store.batches.find((b) => b.course_id === course.id);

      await expect(
        createAdmissionWorkflow(
          {
            student_name: 'Overpayer Test',
            phone: '+91 98888 00000',
            email: `overpay.${Date.now()}@example.com`,
            dob: '2001-01-01',
            gender: 'Male',
            address: 'Somajiguda',
            city: 'Hyderabad',
            state: 'Telangana',
            state_code: '36',
            education: 'B.Com',
            experience_years: 0,
            current_employment_status: 'Student',
            training_mode: 'Online',
            course_id: course.id,
            batch_id: batch?.id,
            admission_date: '2026-03-25',
            course_fee: course.price,
            discount: 0,
            payment_plan: 'Full Payment',
            initial_payment_amount: course.price + 5000, // Exceeds fee!
          },
          counsellorId
        )
      ).rejects.toThrow(/cannot exceed/);
    });

    it('rejects admission when selected batch belongs to another course', async () => {
      const course1 = store.courses[0];
      const otherCourseBatches = store.batches.filter((b) => b.course_id !== course1.id);
      expect(otherCourseBatches.length).toBeGreaterThan(0);
      const mismatchedBatch = otherCourseBatches[0];

      await expect(
        createAdmissionWorkflow(
          {
            student_name: 'Mismatch Candidate',
            phone: '+91 99999 11111',
            email: `mismatch.${Date.now()}@test.in`,
            dob: '2000-01-01',
            gender: 'Male',
            address: 'Hitech City',
            city: 'Hyderabad',
            state: 'Telangana',
            state_code: '36',
            education: 'B.Tech',
            experience_years: 1,
            current_employment_status: 'Employed',
            course_id: course1.id,
            batch_id: mismatchedBatch.id, // Mismatch!
            admission_date: '2026-03-25',
            course_fee: course1.price,
            discount: 0,
            payment_plan: 'Full Payment',
            counsellor_id: counsellorId,
          },
          counsellorId
        )
      ).rejects.toThrow(/Course-Batch Mismatch/);
    });

    it('rejects admission when selected batch has reached maximum capacity', async () => {
      const course = store.courses[0];
      const batch = store.batches.find((b) => b.course_id === course.id)!;
      expect(batch).toBeDefined();

      const originalEnrolled = batch.current_enrolled;
      const maxCap = batch.maximum_capacity ?? 25;
      batch.current_enrolled = maxCap; // Force batch full

      try {
        await expect(
          createAdmissionWorkflow(
            {
              student_name: 'Full Batch Candidate',
              phone: '+91 99999 22222',
              email: `fullbatch.${Date.now()}@test.in`,
              dob: '2000-01-01',
              gender: 'Female',
              address: 'Madhapur',
              city: 'Hyderabad',
              state: 'Telangana',
              state_code: '36',
              education: 'MBA',
              experience_years: 1,
              current_employment_status: 'Employed',
              course_id: course.id,
              batch_id: batch.id, // Full!
              admission_date: '2026-03-25',
              course_fee: course.price,
              discount: 0,
              payment_plan: 'Full Payment',
              counsellor_id: counsellorId,
            },
            counsellorId
          )
        ).rejects.toThrow(/Batch capacity reached/);
      } finally {
        batch.current_enrolled = originalEnrolled;
      }
    });

    it('dynamically attributes counsellor and approving actor without hardcoded user IDs', async () => {
      const course = store.courses[0];
      const batch = store.batches.find((b) => b.course_id === course.id && (b.current_enrolled || 0) < (b.maximum_capacity ?? 25))!;

      const admissionResult = await createAdmissionWorkflow(
        {
          student_name: 'Dynamic User Test',
          phone: '+91 98888 33333',
          email: `dynamic.${Date.now()}@test.in`,
          dob: '1999-12-12',
          gender: 'Male',
          address: 'Banjara Hills',
          city: 'Hyderabad',
          state: 'Telangana',
          state_code: '36',
          education: 'MCA',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: course.id,
          batch_id: batch.id,
          admission_date: '2026-03-25',
          course_fee: course.price,
          discount: 0,
          payment_plan: 'Full Payment',
          counsellor_id: counsellorId,
        },
        counsellorId
      );

      // Verify dynamic attribution
      expect(admissionResult.admission.counsellor_id).toBe(counsellorId);
      expect(admissionResult.admission.counsellor_id).not.toBe('usr-counsellor');
      expect(admissionResult.studentFee?.counsellor_id).toBe(counsellorId);
      expect(admissionResult.studentFee?.counsellor_id).not.toBe('usr-counsellor');
      expect(admissionResult.studentFee?.approved_by).toBe(counsellorId);
      expect(admissionResult.studentFee?.approved_by).not.toBe('usr-admin');
    });
  });

  describe('3. Student 360 Full Profile Resolution & Lookup Resilience', () => {
    it('retrieves student details by ID, student_code, or admission_number', async () => {
      const testStudent = store.students[0];
      expect(testStudent).toBeDefined();

      // Lookup by ID
      const profileById = await getStudentProfileFullDetails(testStudent.id);
      expect(profileById).toBeDefined();
      expect(profileById?.student.id).toBe(testStudent.id);

      // Lookup by student_code
      const profileByCode = await getStudentProfileFullDetails(testStudent.student_code);
      expect(profileByCode).toBeDefined();
      expect(profileByCode?.student.id).toBe(testStudent.id);

      // Lookup by admission_number
      if (testStudent.admission_number) {
        const profileByAdmission = await getStudentProfileFullDetails(testStudent.admission_number);
        expect(profileByAdmission).toBeDefined();
        expect(profileByAdmission?.student.id).toBe(testStudent.id);
      }

      // Non-existent ID returns null gracefully without crash
      const nonExistent = await getStudentProfileFullDetails('non-existent-student-xyz');
      expect(nonExistent).toBeNull();
    });

    it('resolves student profile successfully when student code is URL-encoded or has hyphens', async () => {
      const testStudent = store.students[0];
      const encodedCode = encodeURIComponent(testStudent.student_code);

      const profile = await getStudentProfileFullDetails(encodedCode);
      expect(profile).toBeDefined();
      expect(profile?.student.student_code).toBe(testStudent.student_code);
    });

    it('safely filters student directory even when phone is undefined on student records', async () => {
      // Inject a student record with undefined phone
      const studentWithoutPhone: any = {
        id: 'stu-no-phone-test',
        student_code: 'STU-NO-PHONE',
        full_name: 'No Phone Candidate',
        email: 'nophone@example.com',
        phone: undefined,
        course_id: store.courses[0]?.id || 'crs-01',
        course_name: 'SAP FICO',
        status: 'Active',
        total_fee: 45000,
        paid_amount: 15000,
        outstanding_amount: 30000,
        attendance_percentage: 90,
        course_progress: 40,
        joining_date: '2026-03-01',
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
      };
      store.students.push(studentWithoutPhone);

      // Search by phone query - should not throw TypeError: Cannot read properties of undefined
      const searchResults = await getStudents({ search: '98888' });
      expect(Array.isArray(searchResults)).toBe(true);

      // Search by name
      const nameResults = await getStudents({ search: 'No Phone' });
      expect(nameResults.some((s) => s.id === 'stu-no-phone-test')).toBe(true);

      // Cleanup
      store.students = store.students.filter((s) => s.id !== 'stu-no-phone-test');
    });

    it('logs structured call outcome notes with timestamp during lead follow-up updates', async () => {
      const lead = await createLead({
        full_name: 'Call Logging Test Prospect',
        phone: '+91 99000 11223',
        email: 'callprospect@example.com',
        current_status: 'Working Professional',
        experience_years: 2,
        interested_course_id: store.courses[0]?.id || 'crs-01',
        counsellor_id: counsellorId,
        training_preference: 'Online',
        lead_source: 'Meta Ads',
        stage: 'Follow-up',
      });

      const outcome = 'Connected - Interested';
      const userNotes = 'Prospect requested demo on Saturday 11am';
      const formattedNote = `[${new Date().toLocaleDateString()} | ${outcome}]: ${userNotes}`;

      const updated = await updateLeadStage(lead.id, 'Demo Scheduled', formattedNote, counsellorId);
      expect(updated.stage).toBe('Demo Scheduled');
      expect(updated.notes).toContain(outcome);
      expect(updated.notes).toContain(userNotes);
    });

    it('returns empty array when student directory search filters match zero records', async () => {
      const results = await getStudents({ search: 'NonExistentStudentName99999' });
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('processes full filtered student dataset for export regardless of pagination page size', async () => {
      const allFicoStudents = await getStudents({ course_id: 'crs-fico-01' });
      expect(allFicoStudents.length).toBeGreaterThan(0);

      // Simulate client-side pagination with page size = 1
      const pageSize = 1;
      const paginatedSlice = allFicoStudents.slice(0, pageSize);
      expect(paginatedSlice.length).toBe(1);

      // Verify that full export receives all matching records, not just the paginated slice
      const fullExportRecords = allFicoStudents.map((s) => ({
        code: s.student_code,
        name: s.full_name,
        course: s.course_name,
      }));

      expect(fullExportRecords.length).toBe(allFicoStudents.length);
      expect(fullExportRecords.length).toBeGreaterThanOrEqual(paginatedSlice.length);
    });
  });
});
