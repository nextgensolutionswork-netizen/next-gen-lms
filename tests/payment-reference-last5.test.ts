import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  computePaymentDueStatus,
  findPotentialDuplicatePayments,
  formatDateDDMMYYYY,
  isValidPaymentReference,
  NEXT_DUE_DATE_INVALID_ERROR,
  NEXT_DUE_DATE_ORDER_ERROR,
  NEXT_DUE_DATE_REQUIRED_ERROR,
  PAYMENT_REFERENCE_ERROR,
  PAYMENT_REFERENCE_LABEL,
  PAYMENT_REFERENCE_PLACEHOLDER,
  PAYMENT_REFERENCE_REGEX,
  validateNextDueDate,
  validatePaymentEntry,
} from '@/lib/services/payment-entry-rules';
import { getAllPaymentDues } from '@/lib/services/upcoming-dues-service';
import { validateManualPaymentVerification } from '@/lib/services/manual-payment-verification';
import { POST as paymentsPost } from '@/app/api/fees/payments/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { idempotencyService } from '@/lib/services/idempotency-service';
import type { StudentFee, StudentPaymentRecord, UserProfile } from '@/types';

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

const counsellor = makeUser('ref-counsellor', 'counsellor');
const accountant = makeUser('ref-accountant', 'accountant');

async function signedRequest(actor: UserProfile, body: unknown) {
  const value = encodeURIComponent(JSON.stringify(actor));
  const sig = await generateAuthCookieSignature(value);
  return new NextRequest('http://localhost/api/fees/payments', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${sig}`,
    },
    body: JSON.stringify(body),
  });
}

describe('Transaction / Cheque / UTR Ref – Last 5 Digits', () => {
  let fee: StudentFee;
  let studentId: string;

  beforeEach(async () => {
    idempotencyService.clear();
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    store.users = [structuredClone(counsellor), structuredClone(accountant)];
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
    store.batches = [];

    const created = await createAdmissionWorkflow(
      {
        student_name: 'Ref Test Student',
        phone: '9876543210',
        email: 'reftest@example.test',
        dob: '2000-01-01',
        gender: 'Other',
        address: 'Hyderabad',
        city: 'Hyderabad',
        education: 'Graduate',
        experience_years: 0,
        current_employment_status: 'Student',
        course_id: store.courses[0].id,
        admission_date: '2026-11-01',
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses exact label, placeholder, regex, and error message constants', () => {
    expect(PAYMENT_REFERENCE_LABEL).toBe('Transaction / Cheque / UTR Ref – Last 5 Digits');
    expect(PAYMENT_REFERENCE_PLACEHOLDER).toBe('Enter last 5 digits');
    expect(PAYMENT_REFERENCE_REGEX.source).toBe('^[0-9]{5}$');
    expect(PAYMENT_REFERENCE_ERROR).toBe('Please enter exactly 5 digits.');
  });

  it('validates 5-digit numeric strings and preserves leading zeros', () => {
    expect(isValidPaymentReference('00123')).toBe(true);
    expect(isValidPaymentReference('98765')).toBe(true);
    expect(isValidPaymentReference('1234')).toBe(false);
    expect(isValidPaymentReference('123456')).toBe(false);
    expect(isValidPaymentReference('12a45')).toBe(false);
    expect(isValidPaymentReference('')).toBe(false);
    expect(isValidPaymentReference(null)).toBe(false);

    expect(() =>
      validatePaymentEntry({ payment_mode: 'UPI', transaction_reference: '1234', payment_date: '2026-11-01' })
    ).toThrow('Please enter exactly 5 digits.');

    expect(() =>
      validatePaymentEntry({ payment_mode: 'Cash', transaction_reference: null, payment_date: '2026-11-01' })
    ).not.toThrow();
  });

  it('enforces 5-digit validation across creation, editing, and verification APIs and preserves leading zeros', async () => {
    const invalidCreate = await paymentsPost(
      await signedRequest(counsellor, {
        action: 'record',
        input: {
          fee_id: fee.id,
          student_id: studentId,
          enrollment_id: fee.enrollment_id,
          amount_paid: 5000,
          payment_mode: 'UPI',
          payment_date: '2026-11-01',
          transaction_reference: 'UTR-123',
          idempotency_key: 'ref-create-invalid',
        },
      })
    );
    expect(invalidCreate.status).toBe(400);
    expect((await invalidCreate.json()).error).toBe('Please enter exactly 5 digits.');

    const validCreate = await paymentsPost(
      await signedRequest(counsellor, {
        action: 'record',
        input: {
          fee_id: fee.id,
          student_id: studentId,
          enrollment_id: fee.enrollment_id,
          amount_paid: 5000,
          payment_mode: 'UPI',
          payment_date: '2026-11-01',
          transaction_reference: '00421',
          idempotency_key: 'ref-create-valid',
        },
      })
    );
    expect(validCreate.status).toBe(200);
    const createdBody = await validCreate.json();
    expect(createdBody.payment.transaction_reference).toBe('00421');
    expect(typeof createdBody.payment.transaction_reference).toBe('string');

    const invalidUpdate = await paymentsPost(
      await signedRequest(counsellor, {
        action: 'update',
        paymentId: createdBody.payment.id,
        input: {
          amount_paid: 5000,
          payment_mode: 'Cheque',
          payment_date: '2026-11-01',
          transaction_reference: '12AB5',
        },
      })
    );
    expect(invalidUpdate.status).toBe(400);
    expect((await invalidUpdate.json()).error).toBe('Please enter exactly 5 digits.');

    const validUpdate = await paymentsPost(
      await signedRequest(counsellor, {
        action: 'update',
        paymentId: createdBody.payment.id,
        input: {
          amount_paid: 5000,
          payment_mode: 'Cheque',
          payment_date: '2026-11-01',
          transaction_reference: '00987',
        },
      })
    );
    expect(validUpdate.status).toBe(200);
    expect((await validUpdate.json()).payment.transaction_reference).toBe('00987');

    const invalidVerify = await paymentsPost(
      await signedRequest(accountant, {
        action: 'approve',
        paymentId: createdBody.payment.id,
        verification: {
          reference: '987',
          amount: '5000',
          payment_date: '2026-11-01',
        },
      })
    );
    expect(invalidVerify.status).toBe(400);
    expect((await invalidVerify.json()).fieldErrors.reference).toBe('Please enter exactly 5 digits.');

    const validVerify = await paymentsPost(
      await signedRequest(accountant, {
        action: 'approve',
        paymentId: createdBody.payment.id,
        verification: {
          reference: '00987',
          amount: '5000',
          payment_date: '2026-11-01',
        },
      })
    );
    expect(validVerify.status).toBe(200);
    expect(store.receipts[0].transaction_reference).toBe('00987');
  });

  it('detects potential duplicate payments by reference digits, amount, and date', () => {
    const existing: StudentPaymentRecord[] = [
      {
        id: 'p-1',
        fee_id: fee.id,
        student_id: studentId,
        student_name: 'Alice',
        admission_number: 'ADM-TEST',
        fee_category: 'Tuition Fee',
        amount_paid: 15000,
        payment_date: '2026-11-01',
        payment_mode: 'UPI',
        transaction_reference: '00543',
        recorded_by: counsellor.id,
        recorded_by_name: 'Counsellor',
        recorded_by_role: 'counsellor',
        verification_status: 'Pending Verification',
        created_at: '2026-11-01T10:00:00Z',
      },
      {
        id: 'p-historical',
        fee_id: fee.id,
        student_id: studentId,
        student_name: 'Bob',
        admission_number: 'ADM-TEST',
        fee_category: 'Tuition Fee',
        amount_paid: 20000,
        payment_date: '2026-11-02',
        payment_mode: 'Bank Transfer',
        transaction_reference: 'NEFT-HDFC-991823',
        recorded_by: counsellor.id,
        recorded_by_name: 'Counsellor',
        recorded_by_role: 'counsellor',
        verification_status: 'Verified',
        created_at: '2026-11-02T10:00:00Z',
      },
      {
        id: 'p-rejected',
        fee_id: fee.id,
        student_id: studentId,
        student_name: 'Charlie',
        admission_number: 'ADM-TEST',
        fee_category: 'Tuition Fee',
        amount_paid: 15000,
        payment_date: '2026-11-01',
        payment_mode: 'UPI',
        transaction_reference: '00543',
        recorded_by: counsellor.id,
        recorded_by_name: 'Counsellor',
        recorded_by_role: 'counsellor',
        verification_status: 'Rejected',
        created_at: '2026-11-01T10:00:00Z',
      },
    ];

    expect(
      findPotentialDuplicatePayments(existing, {
        reference: '00543',
        amount: 15000,
        paymentDate: '2026-11-01',
      }).map((p) => p.id)
    ).toEqual(['p-1']);

    // Historical full reference matches by last 5 digits
    expect(
      findPotentialDuplicatePayments(existing, {
        reference: '91823',
        amount: 20000,
        paymentDate: '2026-11-02',
      }).map((p) => p.id)
    ).toEqual(['p-historical']);

    // Exclude current payment when editing/verifying
    expect(
      findPotentialDuplicatePayments(existing, {
        reference: '00543',
        amount: 15000,
        paymentDate: '2026-11-01',
        excludePaymentId: 'p-1',
      })
    ).toEqual([]);
  });

  it('preserves historical full transaction reference records and allows verification via last 5 digits', () => {
    const historicalPayment: StudentPaymentRecord = {
      id: 'p-hist-verify',
      fee_id: fee.id,
      student_id: studentId,
      student_name: 'Historical Student',
      admission_number: 'ADM-TEST',
      fee_category: 'Tuition Fee',
      amount_paid: 12000,
      payment_date: '2026-10-15',
      payment_mode: 'UPI',
      transaction_reference: 'UPI/260125/4491028',
      recorded_by: counsellor.id,
      recorded_by_name: 'Counsellor',
      recorded_by_role: 'counsellor',
      verification_status: 'Pending Verification',
      created_at: '2026-10-15T10:00:00Z',
    };

    const result = validateManualPaymentVerification(historicalPayment, {
      reference: '91028',
      amount: '12000',
      payment_date: '2026-10-15',
    });
    expect(result.reference).toBe('91028');
    expect(historicalPayment.transaction_reference).toBe('UPI/260125/4491028');
  });

  it('requires 5 digits for non-cash admission initial payments', async () => {
    await expect(
      createAdmissionWorkflow(
        {
          student_name: 'Admission Ref Student',
          phone: '9876543211',
          email: 'admref@example.test',
          dob: '2000-01-01',
          gender: 'Other',
          address: 'Hyderabad',
          city: 'Hyderabad',
          education: 'Graduate',
          experience_years: 0,
          current_employment_status: 'Student',
          course_id: store.courses[0].id,
          admission_date: '2026-11-01',
          course_fee: 30000,
          discount: 0,
          payment_plan: 'Full Payment',
          collect_initial_payment: true,
          initial_payment_amount: 5000,
          payment_mode: 'UPI',
          transaction_reference: 'BAD-REF',
        },
        counsellor.id,
        true
      )
    ).rejects.toThrow('Please enter exactly 5 digits.');
  });

  it('validates next payment due date rules and DD-MM-YYYY formatting', () => {
    expect(formatDateDDMMYYYY('2026-12-05')).toBe('05-12-2026');
    expect(() =>
      validateNextDueDate({ nextDueDate: '', paymentDate: '2026-11-01', remainingOutstanding: 10000 })
    ).toThrow(NEXT_DUE_DATE_REQUIRED_ERROR);
    expect(() =>
      validateNextDueDate({ nextDueDate: '31-02-2026', paymentDate: '2026-11-01', remainingOutstanding: 10000 })
    ).toThrow(NEXT_DUE_DATE_INVALID_ERROR);
    expect(() =>
      validateNextDueDate({ nextDueDate: '2026-11-01', paymentDate: '2026-11-01', remainingOutstanding: 10000 })
    ).toThrow(NEXT_DUE_DATE_ORDER_ERROR);
    expect(() =>
      validateNextDueDate({ nextDueDate: '2026-10-31', paymentDate: '2026-11-01', remainingOutstanding: 10000 })
    ).toThrow(NEXT_DUE_DATE_ORDER_ERROR);

    // Accepts DD-MM-YYYY and normalizes to YYYY-MM-DD
    expect(
      validateNextDueDate({ nextDueDate: '15-12-2026', paymentDate: '2026-11-01', remainingOutstanding: 10000 })
    ).toBe('2026-12-15');

    // Full payment clears next due date
    expect(
      validateNextDueDate({ nextDueDate: '2026-12-15', paymentDate: '2026-11-01', remainingOutstanding: 0 })
    ).toBeNull();
  });

  it('synchronizes next due date across partial payments, multiple installments, full payment, rejection, and reversal', () => {
    // 1. Pending partial payment must NOT reduce outstanding balance or change due date
    const p1 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: studentId,
        amount_paid: 10000,
        payment_mode: 'UPI',
        payment_date: '2026-11-01',
        next_due_date: '2026-11-20',
        transaction_reference: '11111',
      },
      counsellor.id
    );
    expect(fee.outstanding_amount).toBe(30000);
    expect(fee.next_due_date).toBeUndefined();

    // 2. Rejected payment must NOT reduce outstanding balance
    const pRejected = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: studentId,
        amount_paid: 5000,
        payment_mode: 'UPI',
        payment_date: '2026-11-01',
        next_due_date: '2026-11-25',
        transaction_reference: '22222',
      },
      counsellor.id
    );
    feeWorkflowService.rejectPayment(pRejected.id, accountant.id, 'Invalid reference');
    expect(fee.outstanding_amount).toBe(30000);

    // 3. Verify p1 -> syncs outstanding to 20000 and next_due_date to 2026-11-20 + audit trail
    feeWorkflowService.verifyPayment(p1.id, accountant.id, 'Verified p1', {
      reference: '11111',
      amount: '10000',
      payment_date: '2026-11-01',
    });
    expect(fee.outstanding_amount).toBe(20000);
    expect(fee.next_due_date).toBe('2026-11-20');
    expect(store.feeAccounts.find((fa) => fa.student_id === studentId)?.next_due_date).toBe('2026-11-20');
    expect(store.admissions.find((a) => a.student_id === studentId)?.fee_due_date).toBe('2026-11-20');
    expect(store.auditLogs.some((l) => l.action === 'PAYMENT_DUE_DATE_UPDATED')).toBe(true);

    const duesAfterP1 = getAllPaymentDues(accountant, { scope: 'all', baseDate: new Date('2026-11-20T06:00:00Z') });
    const itemP1 = duesAfterP1.dues.find((i) => i.student_id === studentId);
    expect(itemP1?.due_date).toBe('2026-11-20');
    expect(itemP1?.due_status).toBe('Due Today');
    expect(itemP1?.outstanding_amount).toBe(20000);

    // 4. Second partial payment updates due date to 2026-12-10
    const p2 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: studentId,
        amount_paid: 10000,
        payment_mode: 'UPI',
        payment_date: '2026-11-10',
        next_due_date: '2026-12-10',
        transaction_reference: '33333',
      },
      counsellor.id
    );
    feeWorkflowService.verifyPayment(p2.id, accountant.id, 'Verified p2', {
      reference: '33333',
      amount: '10000',
      payment_date: '2026-11-10',
    });
    expect(fee.outstanding_amount).toBe(10000);
    expect(fee.next_due_date).toBe('2026-12-10');

    // 5. Reversing p2 restores outstanding to 20000 and previous due date 2026-11-20
    const p2Receipt = store.receipts.find((r) => r.payment_id === p2.id)!;
    feeWorkflowService.voidReceipt(p2Receipt.id, accountant.id, 'Cheque bounced');
    expect(fee.outstanding_amount).toBe(20000);
    expect(fee.next_due_date).toBe('2026-11-20');

    // 6. Final full payment clears outstanding and clears next_due_date
    const pFinal = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: studentId,
        amount_paid: 20000,
        payment_mode: 'Cash',
        payment_date: '2026-11-15',
        next_due_date: null,
      },
      counsellor.id
    );
    feeWorkflowService.verifyPayment(pFinal.id, accountant.id, 'Verified final', {
      amount: '20000',
      payment_date: '2026-11-15',
    });
    expect(fee.outstanding_amount).toBe(0);
    expect(fee.next_due_date).toBeNull();
    expect(store.feeAccounts.find((fa) => fa.student_id === studentId)?.status).toBe('Paid');
  });

  it('computes payment statuses in Asia/Kolkata timezone and checks duplicate receiving bank account', () => {
    const now = new Date('2026-11-27T13:30:00Z'); // 2026-11-27 19:00 IST
    expect(computePaymentDueStatus({ outstandingAmount: 0, paidAmount: 30000, nextDueDate: '2026-11-20', now })).toBe('Paid');
    expect(computePaymentDueStatus({ outstandingAmount: 10000, paidAmount: 20000, nextDueDate: null, now })).toBe('Partially Paid');
    expect(computePaymentDueStatus({ outstandingAmount: 10000, paidAmount: 20000, nextDueDate: '2026-11-27', now })).toBe('Due Today');
    expect(computePaymentDueStatus({ outstandingAmount: 10000, paidAmount: 20000, nextDueDate: '2026-11-28', now })).toBe('Upcoming');
    expect(computePaymentDueStatus({ outstandingAmount: 10000, paidAmount: 20000, nextDueDate: '2026-11-26', now })).toBe('Overdue');

    const records: StudentPaymentRecord[] = [
      {
        id: 'dup-bank-1',
        fee_id: fee.id,
        student_id: studentId,
        student_name: 'Bank Match',
        admission_number: 'ADM-1',
        fee_category: 'Tuition Fee',
        amount_paid: 5000,
        payment_date: '2026-11-27',
        payment_mode: 'UPI',
        transaction_reference: '00112',
        our_bank_profile_id: 'bank-hdfc',
        recorded_by: counsellor.id,
        recorded_by_name: 'C',
        recorded_by_role: 'counsellor',
        verification_status: 'Pending Verification',
        created_at: '2026-11-27T10:00:00Z',
      },
    ];
    expect(
      findPotentialDuplicatePayments(records, {
        reference: '00112',
        amount: 5000,
        paymentDate: '2026-11-27',
        receivingBankAccount: 'bank-hdfc',
      })
    ).toHaveLength(1);
    expect(
      findPotentialDuplicatePayments(records, {
        reference: '00112',
        amount: 5000,
        paymentDate: '2026-11-27',
        receivingBankAccount: 'bank-icici',
      })
    ).toHaveLength(0);
  });

  it('enforces independent accountant verification, financial integrity on failure, audit trail, and repeated submission protection', async () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: studentId,
        amount_paid: 10000,
        payment_mode: 'UPI',
        payment_date: '2026-11-12',
        next_due_date: '2026-12-12',
        transaction_reference: '00125',
      },
      counsellor.id
    );

    const invalidInputs = ['', '1234', '123456', '12a45', '12 45', '12-45', '99999'];
    for (const badRef of invalidInputs) {
      const res = await paymentsPost(
        await signedRequest(accountant, {
          action: 'approve',
          paymentId: p.id,
          verification: { reference: badRef, amount: '10000', payment_date: '2026-11-12' },
        })
      );
      expect(res.status).toBe(400);
      expect(p.verification_status).toBe('Pending Verification');
      expect(store.receipts).toHaveLength(0);
      expect(fee.outstanding_amount).toBe(30000);
      expect(fee.next_due_date).toBeUndefined();
      expect(store.studentFinancialLedgers.some((l) => l.reference_id === p.id)).toBe(false);
    }

    // Valid verification with leading zeros succeeds atomically and preserves audit trail
    const okRes = await paymentsPost(
      await signedRequest(accountant, {
        action: 'approve',
        paymentId: p.id,
        verification: { reference: '00125', amount: '10000', payment_date: '2026-11-12' },
      })
    );
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    const verifiedPayment = okBody.payment;
    const updatedFee = store.studentFees.find((f) => f.id === fee.id)!;
    expect(verifiedPayment.verification_status).toBe('Verified');
    expect(verifiedPayment.transaction_reference).toBe('00125');
    expect(verifiedPayment.manual_verification?.reference).toBe('00125');
    expect(verifiedPayment.recorded_by).toBe(counsellor.id);
    expect(verifiedPayment.verified_by).toBe(accountant.id);
    expect(verifiedPayment.verified_at).toBeTruthy();
    expect(store.receipts).toHaveLength(1);
    expect(updatedFee.outstanding_amount).toBe(20000);
    expect(updatedFee.next_due_date).toBe('2026-12-12');

    // Repeated verification attempt is blocked without duplicate receipt or balance change
    const dupVerifyRes = await paymentsPost(
      await signedRequest(accountant, {
        action: 'approve',
        paymentId: p.id,
        verification: { reference: '00125', amount: '10000', payment_date: '2026-11-12' },
      })
    );
    expect(dupVerifyRes.status).toBe(400);
    expect(store.receipts).toHaveLength(1);
    expect(store.studentFees.find((f) => f.id === fee.id)!.outstanding_amount).toBe(20000);
  });
});
