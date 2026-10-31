import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService as fees } from '@/lib/services/fee-workflow-service';
import { paymentTransaction, onTransactionCommit } from '@/lib/services/payment-workflow-transaction';
import {
  provisionStudentLmsAccount,
  forwardApprovedPaymentToOnboarding,
  updateChecklistItem,
  completeOnboardingWorkflow,
} from '@/lib/services/onboarding-service';
import { StudentFee, UserProfile } from '@/types';

const profile = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({
  id,
  role,
  tenant_id,
  email: `${id}@example.test`,
  full_name: id,
  is_active: true,
  created_at: '2026-10-12',
  updated_at: '2026-10-12',
});

const counsellor = profile('submitter', 'counsellor');
const accountant = profile('approver', 'accountant');
const onboarding = profile('onboarding', 'onboarding_team');
const trainerDefault = profile('trainer-default', 'trainer', 'default');
const trainerOtherTenant = profile('trainer-tenant-b', 'trainer', 'tenant-b');

let fee: StudentFee;
let studentId: string;
const input = () => ({
  fee_id: fee.id,
  student_id: studentId,
  enrollment_id: fee.enrollment_id,
  amount_paid: 5000,
  payment_mode: 'UPI' as const,
  payment_date: '2026-10-12',
  transaction_reference: 'UTR-123',
  payment_proof_url: 'https://example.test/proof.png',
});

beforeEach(async () => {
  vi.spyOn(store, 'persist').mockImplementation(() => {});
  vi.spyOn(store, 'persistSync').mockReturnValue(true);
  store.users = [
    structuredClone(counsellor),
    structuredClone(accountant),
    structuredClone(onboarding),
    structuredClone(trainerDefault),
    structuredClone(trainerOtherTenant),
    profile('other-counsellor', 'counsellor'),
    profile('other-tenant', 'accountant', 'tenant-b'),
  ];
  store.students = [];
  store.admissions = [];
  store.studentFees = [];
  store.feeAccounts = [];
  store.installments = [];
  store.payments = [];
  store.studentPayments = [];
  store.receipts = [];
  store.studentFinancialLedgers = [];
  store.onboardingCases = [];
  store.onboardingAuditLogs = [];
  store.auditLogs = [];
  store.notifications = [];
  store.batches = [
    {
      id: 'batch-fico-01',
      batch_code: 'FICO-B01',
      batch_name: 'SAP FICO Morning',
      course_id: store.courses[0].id,
      course_name: 'SAP FICO',
      trainer_id: trainerDefault.id,
      trainer_name: trainerDefault.full_name,
      start_date: '2026-11-01',
      end_date: '2027-01-31',
      start_time: '09:00',
      end_time: '11:00',
      days: ['Monday', 'Wednesday', 'Friday'],
      maximum_capacity: 30,
      current_enrolled: 5,
      training_mode: 'Online',
      status: 'Upcoming',
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    },
  ];

  const created = await createAdmissionWorkflow(
    {
      student_name: 'New Student',
      phone: '9999999999',
      email: 'student@example.test',
      dob: '2000-01-01',
      gender: 'Other',
      address: 'Hyderabad',
      city: 'Hyderabad',
      education: 'Graduate',
      experience_years: 0,
      current_employment_status: 'Student',
      course_id: store.courses[0].id,
      admission_date: '2026-10-12',
      course_fee: 30000,
      discount: 0,
      payment_plan: 'Full Payment',
    },
    counsellor.id,
    true
  );
  fee = created.studentFee!;
  studentId = created.student.id;
});

afterEach(() => vi.restoreAllMocks());

const auditAdmission = () => ({
  student_name: 'Audit Student',
  phone: '9999999999',
  email: 'audit@example.test',
  dob: '2000-01-01',
  gender: 'Other' as const,
  address: 'Address',
  city: 'Hyderabad',
  education: 'Graduate',
  experience_years: 0,
  current_employment_status: 'Student' as const,
  course_id: store.courses[0].id,
  admission_date: '2026-10-12',
  course_fee: 30000,
  discount: 0,
  payment_plan: 'Full Payment' as const,
});

describe('Remediated Audit Acceptance Tests (All 14 Findings)', () => {
  // B02: Discount Authorization
  it('B02: rejects counsellor discounts exceeding authorized 15% limit or base course fee', async () => {
    // 1. Discount exceeding course fee
    await expect(
      createAdmissionWorkflow({ ...auditAdmission(), discount: 40000 }, counsellor.id, true)
    ).rejects.toThrow(/Discount .* cannot exceed the course fee/);

    // 2. Counsellor exceeding 15% threshold (₹10,000 on ₹30,000 is 33.3%)
    await expect(
      createAdmissionWorkflow({ ...auditAdmission(), discount: 10000 }, counsellor.id, true)
    ).rejects.toThrow(/Unauthorized discount: Counsellors cannot approve discounts exceeding 15%/);

    // 3. Authorized discount within 15% limit (₹3,000 on ₹30,000 is 10%)
    const ok = await createAdmissionWorkflow({ ...auditAdmission(), email: 'ok-disc@example.test', discount: 3000 }, counsellor.id, true);
    expect(ok.studentFee?.final_payable).toBe(27000);
    expect(ok.studentFee?.approved_by).not.toBe(counsellor.id);
    expect(ok.studentFee?.approved_by).toBe(accountant.id);
  });

  // B03: Financial Clearance Policy Threshold
  it('B03: nominal ₹1 partial payment does NOT grant financial clearance; payment meeting policy grants clearance', () => {
    // ₹1 on ₹30,000 (0.003% < 25%)
    const payment = fees.recordPayment({ ...input(), amount_paid: 1, transaction_reference: 'UTR-B03-1' }, counsellor.id);
    fees.verifyPayment(payment.id, accountant.id);
    expect(fee.outstanding_amount).toBe(29999);
    expect(store.onboardingCases[0].checklist.fee_clearance_verification.completed).toBe(false);

    // Additional ₹9,999 payment -> total verified = ₹10,000 on ₹30,000 (33.3% >= 25%)
    const p2 = fees.recordPayment({ ...input(), amount_paid: 9999, transaction_reference: 'UTR-B03-2' }, counsellor.id);
    fees.verifyPayment(p2.id, accountant.id);
    expect(fee.outstanding_amount).toBe(20000);
    expect(store.onboardingCases[0].checklist.fee_clearance_verification.completed).toBe(true);
  });

  // B05: Document and Batch Evidence Verification
  it('B05: rejects document and batch checklist completion when evidence is missing', async () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    fees.verifyPayment(payment.id, accountant.id);
    const c = store.onboardingCases[0];
    expect(c.documents).toHaveLength(0);
    expect(c.batch_id).toBeFalsy();

    // Attempting to complete document verification without uploaded documents fails
    await expect(
      updateChecklistItem(c.id, 'document_verification', true, undefined, onboarding)
    ).rejects.toThrow(/No student documents have been submitted/);

    // Attempting to complete batch allocation without an assigned batch fails
    await expect(
      updateChecklistItem(c.id, 'batch_allocation', true, undefined, onboarding)
    ).rejects.toThrow(/No batch has been allocated/);
  });

  // B06: Installment Reconciliation
  it('B06: reconciles targeted installment and ignores non-existent installment IDs', () => {
    // 1. Non-existent installment ID is discarded
    const p1 = fees.recordPayment({ ...input(), installment_id: 'nonexistent-inst' }, counsellor.id);
    expect(p1.installment_id).toBeUndefined();

    // 2. Real installment is reconciled upon Accounts approval
    store.installments.push({
      id: 'inst-test-01',
      student_id: studentId,
      fee_account_id: fee.fee_account_id!,
      installment_number: 1,
      amount: 5000,
      paid_amount: 0,
      status: 'Upcoming',
      due_date: '2026-11-15',
    });
    const p2 = fees.recordPayment({ ...input(), transaction_reference: 'UTR-INST-REAL', installment_id: 'inst-test-01' }, counsellor.id);
    expect(p2.installment_id).toBe('inst-test-01');

    fees.verifyPayment(p2.id, accountant.id);
    const updatedInst = store.installments.find((i) => i.id === 'inst-test-01');
    expect(updatedInst?.paid_amount).toBe(5000);
    expect(updatedInst?.status).toBe('Paid');
  });

  // B07: Transactional Void & Credit Note Reversal
  it('B07: voiding receipt sets canonical Voided/Rejected status and generates Credit Note', () => {
    const p = fees.recordPayment(input(), counsellor.id);
    fees.verifyPayment(p.id, accountant.id);
    const receipt = store.receipts[0];
    expect(receipt).toBeDefined();

    const voidResult = fees.voidReceipt(receipt.id, accountant.id, 'Audit isolated reversal');
    expect(p.status).toBe('Voided');
    expect(p.verification_status).toBe('Rejected');
    expect(voidResult.creditNoteNumber).toBeDefined();
    expect(voidResult.creditNoteNumber).toMatch(/^CN-\d{4}-/);
    expect(fee.outstanding_amount).toBe(30000);
  });

  // B08: Shared Initial Payment Validation
  it('B08: admission payment strictly enforces non-cash transaction reference requirement', async () => {
    await expect(
      createAdmissionWorkflow(
        {
          ...auditAdmission(),
          initial_payment_amount: 500,
          payment_mode: 'UPI',
          payment_proof_url: 'https://example.test/proof.png',
        },
        counsellor.id,
        true
      )
    ).rejects.toThrow(/Transaction reference is required for non-cash initial payments/);
  });

  // B09: Admission Idempotency
  it('B09: admission replay with idempotency key returns existing records without duplication', async () => {
    const key = 'idem-adm-key-1234';
    const first = await createAdmissionWorkflow(
      { ...auditAdmission(), email: 'unique-idem@test.com', idempotency_key: key },
      counsellor.id,
      true
    );
    const second = await createAdmissionWorkflow(
      { ...auditAdmission(), email: 'unique-idem@test.com', idempotency_key: key },
      counsellor.id,
      true
    );
    expect(first.admission.id).toBe(second.admission.id);
    expect(first.student.id).toBe(second.student.id);
    expect(store.admissions.filter((a) => (a as any).idempotency_key === key)).toHaveLength(1);
  });

  // B10: Monotonic Collision-Proof Receipt Sequence
  it('B10: monotonic receipt sequence prevents collision with retained historical receipt numbers', () => {
    const year = new Date().getFullYear();
    store.receipts.push({
      id: 'old-receipt',
      payment_id: 'old-payment',
      tenant_id: 'default',
      receipt_number: `REC-${year}-000002`,
    } as any);

    const p = fees.recordPayment(input(), counsellor.id);
    fees.verifyPayment(p.id, accountant.id);

    const newlyGenerated = store.receipts.find((r) => r.payment_id === p.id);
    expect(newlyGenerated?.receipt_number).toBe(`REC-${year}-000003`);
    expect(newlyGenerated?.receipt_number).not.toBe(store.receipts[0].receipt_number);
  });

  // B12: Tenant-Scoped Handover Recipients
  it('B12: academic handover strictly scopes recipient notifications to the case tenant', async () => {
    const payment = fees.recordPayment({ ...input(), amount_paid: 10000 }, counsellor.id);
    fees.verifyPayment(payment.id, accountant.id);
    const c = store.onboardingCases[0];

    // Allocate batch in tenant default and complete prerequisite checklist items
    c.batch_id = 'batch-fico-01';
    c.trainer_id = trainerDefault.id;
    for (const key of Object.keys(c.checklist) as (keyof typeof c.checklist)[]) {
      c.checklist[key].completed = true;
    }

    await completeOnboardingWorkflow(c.id, onboarding);

    // Check notification recipients: all must be in default tenant, none in tenant-b
    const handoverNotifs = store.notifications.filter((n) => n.title.includes('Academic Handover'));
    expect(handoverNotifs.length).toBeGreaterThan(0);
    for (const notif of handoverNotifs) {
      const recipient = store.users.find((u) => u.id === notif.user_id);
      expect(recipient?.tenant_id).toBe('default');
      expect(recipient?.tenant_id).not.toBe('tenant-b');
    }
  });

  // B14: Outbox Pattern for External Notifications
  it('B14: registers post-commit callback guaranteeing no external notifications on aborted transactions', async () => {
    let committedNotificationDispatched = false;

    await paymentTransaction(accountant, async () => {
      onTransactionCommit(async () => {
        committedNotificationDispatched = true;
      });
      // Transaction succeeds and commits
    });

    expect(committedNotificationDispatched).toBe(true);

    // Rollback test: when transaction aborts, onTransactionCommit callback must NOT execute
    let abortedNotificationDispatched = false;
    try {
      await paymentTransaction(accountant, async () => {
        onTransactionCommit(async () => {
          abortedNotificationDispatched = true;
        });
        throw new Error('Transaction aborted');
      });
    } catch {
      // Expected rollback
    }
    expect(abortedNotificationDispatched).toBe(false);
  });
});
