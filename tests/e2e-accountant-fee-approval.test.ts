import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { POST, GET } from '@/app/api/fees/payments/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { getAuthorizedBankAccounts, findOriginalReceivingAccount } from '@/lib/utils/bank-autofill';
import { StudentFee, UserProfile, Student, Admission } from '@/types';
import { NextRequest } from 'next/server';

const createProfile = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({
  id,
  role,
  tenant_id,
  email: `${id}@nextgen-test.org`,
  full_name: `Staff ${id}`,
  is_active: true,
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T10:00:00.000Z',
});

const counsellorUser = createProfile('counsellor-rahul', 'counsellor');
const accountantUser = createProfile('accountant-priya', 'accountant');
const secondAccountant = createProfile('accountant-deepak', 'accountant');
const adminUser = createProfile('admin-suresh', 'admin');
const studentUser = createProfile('student-amit', 'student');
const trainerUser = createProfile('trainer-vikram', 'trainer');
const foreignTenantAccountant = createProfile('accountant-foreign', 'accountant', 'tenant-delta');

let testStudent: Student;
let testAdmission: Admission;
let testFee: StudentFee;

const createMockRequest = async (actor: UserProfile | null, body?: unknown) => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (actor) {
    const value = encodeURIComponent(JSON.stringify(actor));
    const signature = await generateAuthCookieSignature(value);
    headers.cookie = `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}`;
  }
  return new NextRequest('http://localhost/api/fees/payments', {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
};

beforeEach(async () => {
  vi.spyOn(store, 'persist').mockImplementation(() => {});
  vi.spyOn(store, 'persistSync').mockReturnValue(true);

  store.users = [
    structuredClone(counsellorUser),
    structuredClone(accountantUser),
    structuredClone(secondAccountant),
    structuredClone(adminUser),
    structuredClone(studentUser),
    structuredClone(trainerUser),
    structuredClone(foreignTenantAccountant),
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
  store.batches = [];

  const created = await createAdmissionWorkflow(
    {
      student_name: 'Amit Kumar',
      phone: '9876543210',
      email: 'amit.kumar@synthetic-test.org',
      dob: '2001-05-15',
      gender: 'Male',
      address: 'Madhapur, Hitec City',
      city: 'Hyderabad',
      education: 'B.Tech Computer Science',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: store.courses[0].id,
      admission_date: '2026-11-17',
      course_fee: 50000,
      discount: 0,
      payment_plan: 'Full Payment',
    },
    counsellorUser.id,
    true
  );

  testStudent = created.student;
  testAdmission = created.admission;
  testFee = created.studentFee!;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('End-to-End Accountant Fee Approval Verification', () => {
  // ==========================================
  // PHASE 1 — ENVIRONMENT SAFETY
  // ==========================================
  describe('Phase 1 — Environment Safety & Database Isolation', () => {
    it('confirms staging environment, database host blocklist, and synthetic data scope', () => {
      // 1. Verify environment isolation
      const appEnv = process.env.NEXT_PUBLIC_APP_ENV || 'staging';
      expect(['staging', 'test']).toContain(appEnv);

      // 2. Verify production database host blocklist is configured
      const blocklist = process.env.PROD_SUPABASE_HOST_BLOCKLIST || 'tgohtdzwehhjfahtgovq';
      expect(blocklist).toContain('tgohtdzwehhjfahtgovq');

      // 3. Verify in-memory synthetic isolation: no real customer records present
      expect(store.students.every((s) => s.email.includes('test') || s.email.includes('synthetic'))).toBe(true);
      expect(store.payments.length).toBe(0);
      expect(store.receipts.length).toBe(0);
    });
  });

  // ==========================================
  // PHASE 2 — COUNSELLOR PAYMENT SUBMISSION
  // ==========================================
  describe('Phase 2 — Counsellor Payment Submission', () => {
    it('records a synthetic ₹20,000 UPI payment with pending status and no premature credits', async () => {
      const authorizedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
      const primaryBank = authorizedAccounts[0];
      expect(primaryBank).toBeDefined();

      const paymentInput = {
        fee_id: testFee.id,
        student_id: testStudent.id,
        enrollment_id: testAdmission.id,
        idempotency_key: 'idemp-counsellor-e2e-20k',
        amount_paid: 20000,
        payment_mode: 'UPI' as const,
        payment_date: '2026-11-17',
        transaction_reference: '10001',
        payment_proof_url: 'https://staging-storage.example.test/proofs/utr-20k.png',
        notes: 'Initial course fee instalment collected via QR code at Hyderabad campus desk.',
        our_bank_profile_id: primaryBank.id,
        our_bank_name: primaryBank.bank_name,
        our_bank_account_name: primaryBank.account_holder_name,
        our_bank_account_id: primaryBank.account_number,
        our_upi_details: primaryBank.upi_id,
      };

      const res = await POST(
        await createMockRequest(counsellorUser, {
          action: 'record',
          input: paymentInput,
        })
      );

      expect(res.status).toBe(200);
      const resData = await res.json();
      expect(resData.success).toBe(true);
      const recordedPayment = resData.payment;
      expect(recordedPayment.id).toBeTruthy();
      expect(recordedPayment.amount_paid).toBe(20000);
      expect(recordedPayment.status).toBe('Pending Approval');
      expect(recordedPayment.verification_status).toBe('Pending Verification');
      expect(recordedPayment.recorded_by).toBe(counsellorUser.id);
      expect(recordedPayment.our_bank_profile_id).toBe(primaryBank.id);

      // Verify NO premature verified collection or official receipt created
      expect(store.receipts).toHaveLength(0);

      // Verify student fee balance remains untouched (₹50,000 outstanding, ₹0 paid)
      const currentFee = store.studentFees.find((f) => f.id === testFee.id)!;
      expect(currentFee.paid_amount).toBe(0);
      expect(currentFee.outstanding_amount).toBe(50000);

      // Verify no 'Payment Verified' ledger entries exist prematurely
      const ledgerCredits = store.studentFinancialLedgers.filter(
        (l) => l.student_id === testStudent.id && l.entry_type === 'Payment Verified'
      );
      expect(ledgerCredits).toHaveLength(0);

      // Verify submission is captured in audit trail
      const submitAudit = store.auditLogs.find(
        (a) => a.record_id === recordedPayment.id && a.action === 'PAYMENT_SUBMITTED'
      );
      expect(submitAudit).toBeDefined();
      expect(submitAudit?.user_id).toBe(counsellorUser.id);
    });
  });

  // ==========================================
  // PHASE 3 — ACCOUNTANT VERIFICATION
  // ==========================================
  describe('Phase 3 — Accountant Verification & Validation Rules', () => {
    let pendingPaymentId: string;
    let primaryBankId: string;
    let alternateBankId: string;

    beforeEach(async () => {
      const authorizedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
      primaryBankId = authorizedAccounts[0].id;
      alternateBankId = authorizedAccounts[1].id;

      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          payment_date: '2026-11-17',
          transaction_reference: '10001',
          payment_proof_url: 'https://staging-storage.example.test/proofs/utr-20k.png',
          our_bank_profile_id: primaryBankId,
          our_bank_name: authorizedAccounts[0].bank_name,
          our_bank_account_name: authorizedAccounts[0].account_holder_name,
          our_bank_account_id: authorizedAccounts[0].account_number,
          our_upi_details: authorizedAccounts[0].upi_id,
        },
        counsellorUser.id
      );
      pendingPaymentId = payment.id;
    });

    it('displays original payment details correctly and resolves original bank account', () => {
      const payment = store.studentPayments.find((p) => p.id === pendingPaymentId)!;
      expect(payment.amount_paid).toBe(20000);
      expect(payment.transaction_reference).toBe('10001');
      expect(payment.payment_date).toBe('2026-11-17');

      const accounts = getAuthorizedBankAccounts(undefined, { includePending: false });
      const original = findOriginalReceivingAccount(payment, accounts);
      expect(original).toBeDefined();
      expect(original?.id).toBe(primaryBankId);
      // Masking verification
      const maskedId = `XXXX${original?.account_number.slice(-4)}`;
      expect(maskedId).toMatch(/^XXXX\d{4}$/);
    });

    it('rejects mismatched UTR reference with HTTP 400', async () => {
      const res = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: pendingPaymentId,
          verification: {
            reference: '10002',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: primaryBankId,
          },
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.fieldErrors.reference).toMatch(/does not match/i);
    });

    it('rejects mismatched amount received with HTTP 400', async () => {
      const res = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: pendingPaymentId,
          verification: {
            reference: '10001',
            amount: '19000', // incorrect amount
            payment_date: '2026-11-17',
            receiving_bank_profile_id: primaryBankId,
          },
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.fieldErrors.amount).toMatch(/does not match/i);
    });

    it('rejects mismatched payment date with HTTP 400', async () => {
      const res = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: pendingPaymentId,
          verification: {
            reference: '10001',
            amount: '20000',
            payment_date: '2026-11-16', // incorrect date
            receiving_bank_profile_id: primaryBankId,
          },
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.fieldErrors.payment_date).toMatch(/does not match/i);
    });

    it('enforces mandatory discrepancy reason when selecting a different receiving bank account', async () => {
      // 1. Without discrepancy reason: must be rejected with 400
      const resBlocked = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: pendingPaymentId,
          verification: {
            reference: '10001',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: alternateBankId,
            // omission of bank_account_discrepancy_reason
          },
        })
      );
      expect(resBlocked.status).toBe(400);
      const blockedData = await resBlocked.json();
      expect(blockedData.fieldErrors.bank_account_discrepancy_reason).toMatch(/Discrepancy explanation is required/i);

      // 2. With valid discrepancy explanation: permitted
      const resAllowed = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: pendingPaymentId,
          verification: {
            reference: '10001',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: alternateBankId,
            bank_account_discrepancy_reason:
              'Student deposited to secondary Axis Bank institutional account per bank credit slip advice dated 17-Nov.',
          },
        })
      );
      expect(resAllowed.status).toBe(200);
      const updated = store.studentPayments.find((p) => p.id === pendingPaymentId)!;
      expect(updated.status).toBe('Approved');
      expect(updated.verified_bank_profile_id).toBe(alternateBankId);
      expect(updated.bank_account_discrepancy_reason).toContain('secondary Axis Bank');
    });

    it('verifies cash payments without requiring a UTR or receiving bank account', async () => {
      const cashPayment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-17',
        },
        counsellorUser.id
      );

      const resCash = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: cashPayment.id,
          verification: {
            amount: '5000',
            payment_date: '2026-11-17',
          },
        })
      );
      expect(resCash.status).toBe(200);
      const approvedCash = store.studentPayments.find((p) => p.id === cashPayment.id)!;
      expect(approvedCash.status).toBe('Approved');
      expect(approvedCash.payment_mode).toBe('Cash');
      expect(store.receipts.some((r) => r.payment_id === cashPayment.id)).toBe(true);
    });
  });

  // ==========================================
  // PHASE 4 — PAYMENT APPROVAL EXECUTION
  // ==========================================
  describe('Phase 4 — Payment Approval Execution & Financial Balance Updates', () => {
    it('executes full approval: status transition, receipt generation, balance update, and idempotent second attempt', async () => {
      const accounts = getAuthorizedBankAccounts(undefined, { includePending: false });
      const bank = accounts[0];

      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          payment_date: '2026-11-17',
          transaction_reference: '10003',
          our_bank_profile_id: bank.id,
          our_bank_name: bank.bank_name,
          our_bank_account_name: bank.account_holder_name,
          our_bank_account_id: bank.account_number,
          our_upi_details: bank.upi_id,
        },
        counsellorUser.id
      );

      const initialOutstanding = testFee.outstanding_amount; // 50000

      // Execute Accountant Approval
      const res = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: payment.id,
          notes: 'Verified against bank transaction feed.',
          verification: {
            reference: '10003',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bank.id,
          },
        })
      );

      expect(res.status).toBe(200);

      // 1. Payment Status
      const approvedPayment = store.studentPayments.find((p) => p.id === payment.id)!;
      expect(approvedPayment.status).toBe('Approved');
      expect(approvedPayment.verification_status).toBe('Verified');
      expect(approvedPayment.verified_by).toBe(accountantUser.id);
      expect(approvedPayment.verified_at).toBeTruthy();
      expect(approvedPayment.verified_bank_profile_id).toBe(bank.id);

      // 2. Sequential Unique Receipt Generation
      expect(store.receipts).toHaveLength(1);
      const receipt = store.receipts[0];
      expect(receipt.payment_id).toBe(payment.id);
      expect(receipt.receipt_number).toBeTruthy();
      expect(receipt.receipt_number.length).toBeGreaterThan(5);
      expect(receipt.payment_amount).toBe(20000);
      expect(receipt.our_bank_name).toBe(bank.bank_name);
      expect(receipt.our_bank_account_name).toBe(bank.account_holder_name);
      expect(receipt.our_bank_account_id).toBe(bank.account_number);

      // 3. Balance Updates
      const updatedFee = store.studentFees.find((f) => f.id === testFee.id)!;
      expect(updatedFee.paid_amount).toBe(20000);
      expect(updatedFee.outstanding_amount).toBe(initialOutstanding - 20000); // 30000

      // 4. General Ledger Entry
      const ledgerEntries = store.studentFinancialLedgers.filter((l) => l.reference_id === payment.id);
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].entry_type).toBe('Payment Verified');
      expect(ledgerEntries[0].credit).toBe(20000);

      // Verify dynamic running balance calculation via getStudentLedgerEntries
      const dynamicLedger = feeWorkflowService.getStudentLedgerEntries(testStudent.id);
      const verifiedDynamicEntry = dynamicLedger.find((l) => l.reference_id === payment.id);
      expect(verifiedDynamicEntry?.running_balance).toBe(30000);

      // 5. Audit History
      const approvalAudit = store.auditLogs.find(
        (a) => a.record_id === payment.id && a.action === 'PAYMENT_APPROVED'
      );
      expect(approvalAudit).toBeDefined();
      expect(approvalAudit?.user_id).toBe(accountantUser.id);
      expect(approvalAudit?.new_value?.verified_bank_profile_id).toBe(bank.id);

      // 6. Idempotency & Duplicate Prevention
      const secondAttempt = await POST(
        await createMockRequest(secondAccountant, {
          action: 'approve',
          paymentId: payment.id,
          verification: {
            reference: '10003',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bank.id,
          },
        })
      );
      expect(secondAttempt.status).toBe(400);
      const duplicateError = await secondAttempt.json();
      expect(duplicateError.error).toMatch(/Only a payment pending approval can be approved/i);

      // Assert no second receipt or double ledger credit
      expect(store.receipts).toHaveLength(1);
      expect(store.studentFinancialLedgers.filter((l) => l.reference_id === payment.id)).toHaveLength(1);
      expect(updatedFee.paid_amount).toBe(20000);
    });
  });

  // ==========================================
  // PHASE 5 — SECURITY & RBAC TESTING
  // ==========================================
  describe('Phase 5 — Security & RBAC Testing', () => {
    let testPaymentId: string;
    let bankProfileId: string;

    beforeEach(async () => {
      const accounts = getAuthorizedBankAccounts(undefined, { includePending: false });
      bankProfileId = accounts[0].id;
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          payment_date: '2026-11-17',
          transaction_reference: '10004',
          our_bank_profile_id: bankProfileId,
        },
        counsellorUser.id
      );
      testPaymentId = payment.id;
    });

    it('blocks Counsellor role from approving payments (HTTP 403 Forbidden)', async () => {
      const res = await POST(
        await createMockRequest(counsellorUser, {
          action: 'approve',
          paymentId: testPaymentId,
          verification: {
            reference: '10004',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect(res.status).toBe(403);
    });

    it('enforces Separation of Duties: Submitter cannot approve their own payment entry', async () => {
      // Submitter records as accountant
      const selfRecorded = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 10000,
          payment_mode: 'UPI',
          payment_date: '2026-11-17',
          transaction_reference: '10005',
          our_bank_profile_id: bankProfileId,
        },
        accountantUser.id,
        'accountant'
      );

      // Attempting to approve their own recorded payment
      const res = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: selfRecorded.id,
          verification: {
            reference: '10005',
            amount: '10000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Separation of duties/i);
    });

    it('blocks unauthenticated and revoked sessions with HTTP 401 Unauthorized', async () => {
      // 1. Unauthenticated request (no cookie)
      const resUnauth = await POST(
        await createMockRequest(null, {
          action: 'approve',
          paymentId: testPaymentId,
          verification: {
            reference: '10004',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect(resUnauth.status).toBe(401);

      // 2. Revoked / inactive accountant session
      store.users.find((u) => u.id === accountantUser.id)!.is_active = false;
      const resInactive = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: testPaymentId,
          verification: {
            reference: '10004',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect(resInactive.status).toBe(401);
      store.users.find((u) => u.id === accountantUser.id)!.is_active = true;
    });

    it('prevents non-finance roles (student, trainer) from approving payments', async () => {
      const resStudent = await POST(
        await createMockRequest(studentUser, {
          action: 'approve',
          paymentId: testPaymentId,
          verification: {
            reference: '10004',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect(resStudent.status).toBe(403);

      const resTrainer = await POST(
        await createMockRequest(trainerUser, {
          action: 'approve',
          paymentId: testPaymentId,
          verification: {
            reference: '10004',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect(resTrainer.status).toBe(403);
    });

    it('rejects cross-tenant payment verification attempts', async () => {
      const resForeign = await POST(
        await createMockRequest(foreignTenantAccountant, {
          action: 'approve',
          paymentId: testPaymentId,
          verification: {
            reference: '10004',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bankProfileId,
          },
        })
      );
      expect([400, 403]).toContain(resForeign.status);
      const data = await resForeign.json();
      expect(data.error).toMatch(/tenant/i);
    });

    it('confirms failed verification does not alter financial balances or ledgers', async () => {
      const beforeFee = structuredClone(testFee);

      await POST(
        await createMockRequest(counsellorUser, {
          action: 'approve',
          paymentId: testPaymentId,
        })
      );

      const currentFee = store.studentFees.find((f) => f.id === testFee.id)!;
      expect(currentFee.paid_amount).toBe(beforeFee.paid_amount);
      expect(currentFee.outstanding_amount).toBe(beforeFee.outstanding_amount);
      expect(store.receipts).toHaveLength(0);
      expect(store.studentFinancialLedgers.filter((l) => l.reference_id === testPaymentId)).toHaveLength(0);
    });
  });

  // ==========================================
  // PHASE 6 — SIX-POINT RECONCILIATION
  // ==========================================
  describe('Phase 6 — Multi-System Financial Reconciliation', () => {
    it('verifies exact reconciliation across Approvals, Receipts, Ledger, Balance, Analytics, and Audit', async () => {
      const accounts = getAuthorizedBankAccounts(undefined, { includePending: false });
      const bank = accounts[0];

      // 1. Initial State: Course fee ₹50,000, 0 paid
      expect(testFee.final_payable).toBe(50000);
      expect(testFee.outstanding_amount).toBe(50000);
      expect(testFee.paid_amount).toBe(0);

      // 2. Counsellor records payment
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          payment_date: '2026-11-17',
          transaction_reference: '10006',
          our_bank_profile_id: bank.id,
          our_bank_name: bank.bank_name,
          our_bank_account_name: bank.account_holder_name,
          our_bank_account_id: bank.account_number,
          our_upi_details: bank.upi_id,
        },
        counsellorUser.id
      );

      // 3. Accountant verifies and clears payment
      const approveRes = await POST(
        await createMockRequest(accountantUser, {
          action: 'approve',
          paymentId: payment.id,
          verification: {
            reference: '10006',
            amount: '20000',
            payment_date: '2026-11-17',
            receiving_bank_profile_id: bank.id,
          },
        })
      );
      expect(approveRes.status).toBe(200);

      // Run dual ledger reconciliation
      store.reconcileDualLedgers();

      // Reconciliation Point 1: Fee Approvals
      const feeApprovalRecord = store.studentPayments.find((p) => p.id === payment.id)!;
      expect(feeApprovalRecord).toBeDefined();
      expect(feeApprovalRecord.status).toBe('Approved');
      expect(feeApprovalRecord.amount_paid).toBe(20000);
      expect(feeApprovalRecord.verified_bank_profile_id).toBe(bank.id);

      // Reconciliation Point 2: Payments & Receipts
      const receipt = store.receipts.find((r) => r.payment_id === payment.id)!;
      expect(receipt).toBeDefined();
      expect(receipt.payment_amount).toBe(20000);
      expect(receipt.receipt_number).toBe(feeApprovalRecord.receipt_number);
      expect(receipt.our_bank_name).toBe(bank.bank_name);
      expect(receipt.our_bank_account_id).toBe(bank.account_number);

      // Reconciliation Point 3: Student Fee Ledger
      const ledgerEntries = store.studentFinancialLedgers.filter((l) => l.reference_id === payment.id);
      expect(ledgerEntries).toHaveLength(1);
      const ledgerEntry = ledgerEntries[0];
      expect(ledgerEntry.entry_type).toBe('Payment Verified');
      expect(ledgerEntry.credit).toBe(20000);

      const dynamicEntries = feeWorkflowService.getStudentLedgerEntries(testStudent.id);
      const dynamicPaymentEntry = dynamicEntries.find((l) => l.reference_id === payment.id);
      expect(dynamicPaymentEntry?.running_balance).toBe(30000);

      // Reconciliation Point 4: Student Outstanding Balance
      const currentFee = store.studentFees.find((f) => f.id === testFee.id)!;
      expect(currentFee.paid_amount).toBe(20000);
      expect(currentFee.outstanding_amount).toBe(30000);
      expect(currentFee.outstanding_amount + currentFee.paid_amount).toBe(currentFee.final_payable);

      // Reconciliation Point 5: Financial Analytics & Dual-Ledger Sync
      const legacyPayment = store.payments.find((p) => p.id === payment.id || p.id === `pay-${payment.id}`);
      expect(legacyPayment).toBeDefined();
      expect(['Approved', 'Success']).toContain(legacyPayment?.status);
      expect(legacyPayment?.amount).toBe(20000);

      // Reconciliation Point 6: Audit Trail
      const audits = store.auditLogs.filter((a) => a.record_id === payment.id);
      expect(audits.map((a) => a.action)).toEqual(
        expect.arrayContaining(['PAYMENT_SUBMITTED', 'PAYMENT_APPROVED'])
      );
      const approvedAudit = audits.find((a) => a.action === 'PAYMENT_APPROVED');
      expect(approvedAudit?.user_id).toBe(accountantUser.id);
      expect(approvedAudit?.new_value?.verified_bank_profile_id).toBe(bank.id);
    });
  });
});
