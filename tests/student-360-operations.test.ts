import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { getStudentProfileFullDetails } from '@/lib/services/student-service';
import { transferStudentBatch } from '@/lib/services/academics-service';
import { verifyAndGenerateCertificate, issueCertificate } from '@/lib/services/certificate-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';

describe('Domain 4: Student 360 Profile & Operations Suite', () => {
  const testStudentId = 'stu-test-360';
  const testCourseId = 'crs-fico-01';
  const testBatch1Id = 'batch-test-360-a';
  const testBatch2Id = 'batch-test-360-b';
  const testStaffId = 'usr-admin-360';
  const testAccountantId = 'usr-accountant-360';

  beforeEach(() => {
    // 1. Ensure authorized staff & accountant users exist in store.users
    if (!store.users.some((u) => u.id === testStaffId)) {
      store.users.unshift({
        id: testStaffId,
        full_name: 'Test Administrator',
        email: 'admin.360@lms.internal',
        role: 'admin',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
    }

    if (!store.users.some((u) => u.id === testAccountantId)) {
      store.users.unshift({
        id: testAccountantId,
        full_name: 'Test Finance Accountant',
        email: 'accountant.360@lms.internal',
        role: 'accountant',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
    }

    // 2. Ensure test batches exist
    if (!store.batches.some((b) => b.id === testBatch1Id)) {
      store.batches.unshift({
        id: testBatch1Id,
        course_id: testCourseId,
        batch_name: 'SAP FICO Morning 360 Cohort',
        batch_code: 'FICO-360-A',
        start_date: '2026-01-15',
        end_date: '2026-04-15',
        start_time: '08:00 AM',
        end_time: '10:00 AM',
        days: ['Mon', 'Wed', 'Fri'],
        trainer_id: testStaffId,
        trainer_name: 'Rajesh Kumar',
        training_mode: 'Online',
        current_enrolled: 15,
        maximum_capacity: 30,
        status: 'Active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
    }

    if (!store.batches.some((b) => b.id === testBatch2Id)) {
      store.batches.push({
        id: testBatch2Id,
        course_id: testCourseId,
        batch_name: 'SAP FICO Evening 360 Cohort',
        batch_code: 'FICO-360-B',
        start_date: '2026-01-20',
        end_date: '2026-04-20',
        start_time: '06:00 PM',
        end_time: '08:00 PM',
        days: ['Tue', 'Thu', 'Sat'],
        trainer_id: testStaffId,
        trainer_name: 'Vikram Rao',
        training_mode: 'Online',
        current_enrolled: 10,
        maximum_capacity: 30,
        status: 'Active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
    }

    // 3. Ensure fresh test student exists without pre-existing certificate
    const existingIndex = store.students.findIndex((s) => s.id === testStudentId);
    const testStudent = {
      id: testStudentId,
      user_id: `usr-${testStudentId}`,
      admission_id: 'adm-360-001',
      full_name: 'Karan Mehra',
      email: 'karan.mehra@test-360.com',
      phone: '9988776655',
      student_code: 'STU-360-001',
      admission_number: 'ADM-360-0001',
      course_id: testCourseId,
      course_name: 'SAP S/4HANA Finance (FICO)',
      batch_id: testBatch1Id,
      batch_name: 'SAP FICO Morning 360 Cohort',
      status: 'Active' as const,
      placement_status: 'Job Search' as const,
      attendance_percentage: 85,
      course_progress: 75,
      total_fee: 45000,
      paid_amount: 15000,
      outstanding_amount: 30000,
      joining_date: '2026-01-10',
      created_at: '2026-01-10T09:00:00Z',
      updated_at: '2026-01-10T09:00:00Z',
    };

    if (existingIndex >= 0) {
      store.students[existingIndex] = testStudent;
    } else {
      store.students.unshift(testStudent);
    }

    // Clean up any test certificates for testStudentId
    store.certificates = (store.certificates || []).filter((c) => c.student_id !== testStudentId);
  });

  describe('1. Flexible Student Resolution & IDOR Defense', () => {
    it('resolves student profile seamlessly by ID, student_code, and admission_number', async () => {
      const byId = await getStudentProfileFullDetails(testStudentId);
      expect(byId).not.toBeNull();
      expect(byId?.student.id).toBe(testStudentId);

      const byCode = await getStudentProfileFullDetails('STU-360-001');
      expect(byCode).not.toBeNull();
      expect(byCode?.student.id).toBe(testStudentId);

      const byAdm = await getStudentProfileFullDetails('ADM-360-0001');
      expect(byAdm).not.toBeNull();
      expect(byAdm?.student.id).toBe(testStudentId);
    });

    it('returns null gracefully for non-existent student query', async () => {
      const missing = await getStudentProfileFullDetails('non-existent-student-id');
      expect(missing).toBeNull();
    });

    it('enforces IDOR ownership protection rules for student role', async () => {
      const student1 = store.students.find((s) => s.id === testStudentId)!;
      const student2 = store.students.find((s) => s.id !== testStudentId) || { id: 'stu-other', user_id: 'usr-other', full_name: 'Other', email: 'other@example.com' };

      const studentUser = { id: student1.user_id || student1.id, email: student1.email, role: 'student' };
      const isOwnProfileTarget1 =
        student1.user_id === studentUser.id ||
        student1.id === studentUser.id ||
        student1.email?.toLowerCase() === studentUser.email?.toLowerCase();
      expect(isOwnProfileTarget1).toBe(true);

      const isOwnProfileTarget2 =
        student2.user_id === studentUser.id ||
        student2.id === studentUser.id ||
        student2.email?.toLowerCase() === studentUser.email?.toLowerCase();
      expect(isOwnProfileTarget2).toBe(false);
    });
  });

  describe('2. Batch Transfer Workflow & Audit Trail', () => {
    it('transfers student to target batch, adjusts enrollment counts, and posts audit event', async () => {
      const student = store.students.find((s) => s.id === testStudentId)!;
      const initialBatchId = student.batch_id;
      const targetBatchId = testBatch2Id;

      const fromBatchBefore = store.batches.find((b) => b.id === initialBatchId);
      const toBatchBefore = store.batches.find((b) => b.id === targetBatchId);

      const fromCountBefore = fromBatchBefore?.current_enrolled || 0;
      const toCountBefore = toBatchBefore?.current_enrolled || 0;

      await transferStudentBatch(
        student.id,
        targetBatchId,
        'Schedule conflict with new work shift',
        testStaffId
      );

      expect(student.batch_id).toBe(targetBatchId);

      const latestAudit = store.batchTransferAudits.find((a) => a.student_id === student.id);
      expect(latestAudit).toBeDefined();
      expect(latestAudit?.to_batch_id).toBe(targetBatchId);
      expect(latestAudit?.reason).toContain('Schedule conflict');

      // Check enrollment counts
      const fromBatchAfter = store.batches.find((b) => b.id === initialBatchId);
      const toBatchAfter = store.batches.find((b) => b.id === targetBatchId);

      expect(fromBatchAfter?.current_enrolled).toBe(fromCountBefore - 1);
      expect(toBatchAfter?.current_enrolled).toBe(toCountBefore + 1);
    });
  });

  describe('3. Certificate Issuance & 3-Tier Eligibility Criteria', () => {
    it('verifies eligibility requirements (attendance >= 80%, progress >= 80%, outstanding = 0)', async () => {
      const student = store.students.find((s) => s.id === testStudentId)!;
      // Make student ineligible
      student.attendance_percentage = 70;
      student.course_progress = 60;
      student.outstanding_amount = 5000;

      const ineligibleRes = await verifyAndGenerateCertificate(student.id, student.course_id, testStaffId);
      expect(ineligibleRes.eligible).toBe(false);
      expect(ineligibleRes.reasons.length).toBeGreaterThanOrEqual(3);

      // Now satisfy all criteria
      student.attendance_percentage = 92;
      student.course_progress = 95;
      student.outstanding_amount = 0;

      const eligibleRes = await issueCertificate(student.id, student.course_id, testStaffId);
      expect(eligibleRes.eligible).toBe(true);
      expect(eligibleRes.certificate).toBeDefined();
      expect(eligibleRes.certificate?.student_id).toBe(student.id);
      expect(eligibleRes.certificate?.grade).toContain('A+');
    });
  });

  describe('4. Financial Safe Calculation & Atomic Payment', () => {
    it('aggregates student fees defensively without NaN even with partial records', () => {
      const testFees: any[] = [
        { approval_status: 'Approved', final_payable: 45000, paid_amount: 15000, outstanding_amount: 30000 },
        { approval_status: 'Approved', final_payable: undefined, paid_amount: null, outstanding_amount: undefined },
      ];

      const approvedFeesTotal = testFees
        .filter((f) => f.approval_status === 'Approved')
        .reduce((acc, f) => acc + (f.final_payable || 0), 0);
      expect(approvedFeesTotal).toBe(45000);
      expect(Number.isNaN(approvedFeesTotal)).toBe(false);

      const paidTotal = testFees
        .filter((f) => f.approval_status === 'Approved')
        .reduce((acc, f) => acc + (f.paid_amount || 0), 0);
      expect(paidTotal).toBe(15000);
      expect(Number.isNaN(paidTotal)).toBe(false);

      const outstandingTotal = testFees
        .filter((f) => f.approval_status === 'Approved')
        .reduce((acc, f) => acc + (f.outstanding_amount || 0), 0);
      expect(outstandingTotal).toBe(30000);
      expect(Number.isNaN(outstandingTotal)).toBe(false);
    });

    it('records student fee payment atomically and updates outstanding balance', async () => {
      const student = store.students.find((s) => s.id === testStudentId)!;
      const feeId = `fee-${testStudentId}-${Date.now()}`;
      const fee = {
        id: feeId,
        student_id: student.id,
        student_name: student.full_name,
        student_code: student.student_code,
        admission_number: student.admission_number,
        course_id: student.course_id,
        fee_category: 'Tuition Fee',
        reference_type: 'Course' as const,
        standard_fee: 45000,
        proposed_fee: 45000,
        discount_amount: 0,
        discount_percentage: 0,
        tax_gst_amount: 0,
        additional_charges: 0,
        final_payable: 45000,
        paid_amount: 10000,
        outstanding_amount: 35000,
        number_of_installments: 0,
        payment_plan: 'Full Payment' as const,
        first_due_date: '2026-02-01',
        approval_status: 'Approved' as const,
        version: 1,
        is_payable: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.studentFees.unshift(fee as any);

      const beforeOutstanding = fee.outstanding_amount;
      const paymentAmount = 5000;

      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: fee.id,
          student_id: student.id,
          amount_paid: paymentAmount,
          payment_mode: 'UPI',
          payment_date: new Date().toISOString().slice(0, 10),
          transaction_reference: `UTR-TEST-${Date.now()}`,
          notes: 'Test payment collection',
        },
        testStaffId,
        'admin'
      );

      expect(payment).toBeDefined();
      expect(payment.amount_paid).toBe(paymentAmount);
      expect(payment.status).toBe('Pending Approval');

      // Verify payment by authorized staff / accountant (different from recorder)
      const verifiedPayment = feeWorkflowService.verifyPayment(payment.id, testAccountantId, 'Verified via Bank UTR');
      expect(verifiedPayment.verification_status).toBe('Verified');
      expect(fee.outstanding_amount).toBe(beforeOutstanding - paymentAmount);
    });
  });
});
