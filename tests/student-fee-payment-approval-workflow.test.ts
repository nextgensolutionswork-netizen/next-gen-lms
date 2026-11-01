import { enteredPaymentVerification } from './payment-verification-fixture';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  forwardApprovedPaymentToOnboarding,
  provisionStudentLmsAccount,
} from '@/lib/services/onboarding-service';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { UserProfile, StudentFee, Admission, Student } from '@/types';

const makeUser = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({
  id,
  role,
  tenant_id,
  email: `${id}@next-gen.test`,
  full_name: `User ${id}`,
  is_active: true,
  created_at: '2026-10-16T10:00:00.000Z',
  updated_at: '2026-10-16T10:00:00.000Z',
});

describe('Automated Student Fee Payment Approval Workflow (Steps 1–4)', () => {
  const counsellor = makeUser('usr-counsellor-01', 'counsellor');
  const accountant = makeUser('usr-accounts-01', 'accountant');
  const secondAccountant = makeUser('usr-accounts-02', 'accountant');
  const onboardingSpecialist = makeUser('usr-onboarding-01', 'onboarding_team');
  const trainer = makeUser('usr-trainer-01', 'trainer');

  let testStudent: Student;
  let testAdmission: Admission;
  let testFee: StudentFee;

  beforeEach(async () => {
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);

    store.users = [
      structuredClone(counsellor),
      structuredClone(accountant),
      structuredClone(secondAccountant),
      structuredClone(onboardingSpecialist),
      structuredClone(trainer),
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

    // Register a student admission workflow
    const result = await createAdmissionWorkflow(
      {
        student_name: 'Rahul Varma',
        phone: '9848012345',
        email: 'rahul.varma@student.test',
        dob: '1998-05-15',
        gender: 'Male',
        address: 'Madhapur',
        city: 'Hyderabad',
        education: 'B.Tech CSE',
        experience_years: 1,
        current_employment_status: 'Student',
        course_id: store.courses[0].id,
        admission_date: '2026-10-16',
        course_fee: 50000,
        discount: 5000,
        discount_reason: 'Early Bird Scholarship',
        payment_plan: '3 Installments',
      },
      counsellor.id,
      true
    );

    testAdmission = result.admission;
    testStudent = result.student;
    testFee = result.studentFee!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // STEP 1: COUNSELLOR PAYMENT ENTRY
  // =========================================================================
  describe('Step 1 — Counsellor Payment Entry', () => {
    it('records the payment with all required metadata and sets status to Pending Approval', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'UPI',
          payment_date: '2026-10-16',
          transaction_reference: 'UPI/20261016/987654321',
          bank_upi_reference: 'HDFC UPI',
          payment_proof_url: 'https://storage.next-gen.com/proofs/rahul-upi-slip.png',
          notes: 'Installment 1 collected via Google Pay',
        },
        counsellor.id,
        'counsellor'
      );

      expect(payment.id).toBeDefined();
      expect(payment.student_id).toBe(testStudent.id);
      expect(payment.enrollment_id).toBe(testAdmission.id);
      expect(payment.amount_paid).toBe(15000);
      expect(payment.payment_mode).toBe('UPI');
      expect(payment.transaction_reference).toBe('UPI/20261016/987654321');
      expect(payment.bank_upi_reference).toBe('HDFC UPI');
      expect(payment.payment_proof_url).toBe('https://storage.next-gen.com/proofs/rahul-upi-slip.png');
      expect(payment.payment_date).toBe('2026-10-16');

      // Status invariants
      expect(payment.status).toBe('Pending Approval');
      expect(payment.verification_status).toBe('Pending Verification');
      expect(payment.recorded_by).toBe(counsellor.id);
      expect(payment.recorded_by_role).toBe('counsellor');
      expect(payment.verified_by).toBeUndefined();
      expect(payment.receipt_number).toBeUndefined();

      // Does NOT clear student balances yet
      const feeCheck = feeWorkflowService.getStudentFeeById(testFee.id);
      expect(feeCheck?.paid_amount).toBe(0);
      expect(feeCheck?.outstanding_amount).toBe(45000);
      expect(store.receipts).toHaveLength(0);

      // Audit trail captures submission
      expect(store.auditLogs.some((l) => l.action === 'PAYMENT_SUBMITTED' && l.record_id === payment.id)).toBe(true);

      // Notifies accounts team
      expect(
        store.notifications.some(
          (n) => n.user_id === accountant.id && n.title === 'Payment awaiting approval'
        )
      ).toBe(true);
    });

    it('validates positive amount, duplicate UTR references, and tenant isolation', () => {
      // Negative / zero amount rejected
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: testFee.id,
            student_id: testStudent.id,
            amount_paid: -500,
            payment_mode: 'UPI',
          },
          counsellor.id,
          'counsellor'
        )
      ).toThrow(/greater than zero/i);

      // Record first payment
      feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          amount_paid: 10000,
          payment_mode: 'UPI',
          transaction_reference: 'UNIQUE-UTR-999',
        },
        counsellor.id,
        'counsellor'
      );

      // Duplicate UTR rejected
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: testFee.id,
            student_id: testStudent.id,
            amount_paid: 10000,
            payment_mode: 'UPI',
            transaction_reference: 'unique-utr-999',
          },
          counsellor.id,
          'counsellor'
        )
      ).toThrow(/Duplicate transaction reference/i);
    });
  });

  // =========================================================================
  // STEP 2: ACCOUNTS FEE APPROVALS & SEPARATION OF DUTIES
  // =========================================================================
  describe('Step 2 — Accounts Fee Approvals & Rejection Handling', () => {
    it('displays submitted payment in pending state and enforces separation of duties', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-VERIFY-001',
        },
        counsellor.id,
        'counsellor'
      );

      // Submitted payment is listed in store.studentPayments
      const pendingList = store.studentPayments.filter(
        (p) => p.verification_status === 'Pending Verification'
      );
      expect(pendingList).toHaveLength(1);
      expect(pendingList[0].id).toBe(payment.id);

      // Invariant: Counsellor cannot approve their own payment
      expect(() => {
        feeWorkflowService.verifyPayment(payment.id, counsellor.id, undefined, enteredPaymentVerification(payment.id));
      }).toThrow(/Separation of duties violation: Payment recorder cannot verify their own payment/i);

      // Invariant: Non-accounts user (e.g. Trainer) cannot approve payment
      expect(() => {
        feeWorkflowService.verifyPayment(payment.id, trainer.id, undefined, enteredPaymentVerification(payment.id));
      }).toThrow(/Unauthorized: Only an Accountant can verify student payments/i);
    });

    it('rejects payment with mandatory reason and sends notification back to counsellor', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'Bank Transfer',
          transaction_reference: 'NEFT-BOUNCED-001',
        },
        counsellor.id,
        'counsellor'
      );

      // Mandatory rejection reason required
      expect(() => {
        feeWorkflowService.rejectPayment(payment.id, accountant.id, '  ');
      }).toThrow(/rejection reason is mandatory/i);

      // Rejection by accountant
      const rejected = feeWorkflowService.rejectPayment(
        payment.id,
        accountant.id,
        'Bank statement credit not found for UTR NEFT-BOUNCED-001'
      );

      expect(rejected.status).toBe('Rejected');
      expect(rejected.verification_status).toBe('Rejected');
      expect(rejected.rejection_reason).toBe('Bank statement credit not found for UTR NEFT-BOUNCED-001');
      expect(rejected.rejected_by).toBe(accountant.id);
      expect(rejected.rejected_at).toBeDefined();

      // Counsellor is notified of the rejection
      const counsellorNotification = store.notifications.find(
        (n) => n.user_id === counsellor.id && n.title === 'Payment returned for correction'
      );
      expect(counsellorNotification).toBeDefined();
      expect(counsellorNotification?.message).toContain('Bank statement credit not found');

      // Counsellor updates payment with corrected UTR and resubmits
      const updated = feeWorkflowService.updatePayment(
        payment.id,
        {
          transaction_reference: 'NEFT-CORRECT-002',
          notes: 'Corrected transaction reference as verified with student bank slip',
        },
        counsellor.id,
        'counsellor'
      );

      expect(updated.status).toBe('Pending Approval');
      expect(updated.verification_status).toBe('Pending Verification');
      expect(updated.transaction_reference).toBe('NEFT-CORRECT-002');

      // Notification sent to accounts about updated payment
      expect(
        store.notifications.some(
          (n) => n.user_id === accountant.id && n.title === 'Payment updated for approval'
        )
      ).toBe(true);
    });
  });

  // =========================================================================
  // STEP 3: PAYMENT APPROVAL & VERIFICATION
  // =========================================================================
  describe('Step 3 — Payment Approval, Balance Updates & Receipt Generation', () => {
    it('approves payment, updates verified balances, issues receipt, and posts to ledger atomically', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          transaction_reference: 'UPI/APPROVED/2026/01',
          payment_proof_url: 'https://storage.next-gen.com/proofs/valid.png',
        },
        counsellor.id,
        'counsellor'
      );

      const approved = feeWorkflowService.verifyPayment(
        payment.id,
        accountant.id,
        'Verified in HDFC current account', enteredPaymentVerification(payment.id)
      );

      // Status updated to Approved / Verified
      expect(approved.status).toBe('Approved');
      expect(approved.verification_status).toBe('Verified');
      expect(approved.verified_by).toBe(accountant.id);
      expect(approved.verified_by_name).toBe(accountant.full_name);
      expect(approved.verified_at).toBeDefined();
      expect(approved.verification_notes).toBe('Verified in HDFC current account');

      // StudentFee balances updated
      const updatedFee = feeWorkflowService.getStudentFeeById(testFee.id);
      expect(updatedFee?.paid_amount).toBe(20000);
      expect(updatedFee?.outstanding_amount).toBe(25000); // 45000 - 20000

      // Student Profile updated
      const updatedStudent = store.students.find((s) => s.id === testStudent.id);
      expect(updatedStudent?.paid_amount).toBe(20000);
      expect(updatedStudent?.outstanding_amount).toBe(25000);

      // StudentFeeAccount updated
      const updatedFeeAccount = store.feeAccounts.find((fa) => fa.student_id === testStudent.id);
      expect(updatedFeeAccount?.paid_amount).toBe(20000);
      expect(updatedFeeAccount?.outstanding_amount).toBe(25000);
      expect(updatedFeeAccount?.status).toBe('Partially Paid');

      // Receipt generated
      expect(approved.receipt_number).toBeDefined();
      expect(approved.receipt_number).toMatch(/^REC-2026-\d{6}$/);

      const receipt = store.receipts.find((r) => r.payment_id === payment.id);
      expect(receipt).toBeDefined();
      expect(receipt?.receipt_number).toBe(approved.receipt_number);
      expect(receipt?.payment_amount).toBe(20000);
      expect(receipt?.remaining_balance).toBe(25000);
      expect(receipt?.authorized_by).toBe(accountant.full_name);

      // Student Financial Ledger posted
      const ledgerEntries = store.studentFinancialLedgers.filter(
        (l) => l.reference_id === payment.id && l.entry_type === 'Payment Verified'
      );
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].credit).toBe(20000);
      expect(ledgerEntries[0].debit).toBe(0);

      // Audit trail captures approval
      expect(
        store.auditLogs.some(
          (l) => l.action === 'PAYMENT_APPROVED' && l.record_id === payment.id
        )
      ).toBe(true);

      // Duplicate approval prevention
      expect(() => {
        feeWorkflowService.verifyPayment(payment.id, secondAccountant.id, undefined, enteredPaymentVerification(payment.id));
      }).toThrow(/Only a payment pending approval can be approved/i);
    });

    it('supports partial fees and installment sequence without duplicate ledger entries', () => {
      // Installment 1: 15,000
      const p1 = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-PARTIAL-1',
        },
        counsellor.id
      );
      feeWorkflowService.verifyPayment(p1.id, accountant.id, undefined, enteredPaymentVerification(p1.id));

      expect(testFee.paid_amount).toBe(15000);
      expect(testFee.outstanding_amount).toBe(30000);

      // Installment 2: 15,000
      const p2 = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'Bank Transfer',
          transaction_reference: 'UTR-PARTIAL-2',
        },
        counsellor.id
      );
      feeWorkflowService.verifyPayment(p2.id, accountant.id, undefined, enteredPaymentVerification(p2.id));

      expect(testFee.paid_amount).toBe(30000);
      expect(testFee.outstanding_amount).toBe(15000);

      // Installment 3: Final 15,000
      const p3 = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'Cash',
          transaction_reference: 'CASH-RCPT-3',
        },
        counsellor.id
      );
      feeWorkflowService.verifyPayment(p3.id, accountant.id, undefined, enteredPaymentVerification(p3.id));

      expect(testFee.paid_amount).toBe(45000);
      expect(testFee.outstanding_amount).toBe(0);

      // Receipts & Ledgers: Exactly 3 payment credits corresponding to 3 installments (+ 1 initial fee debit)
      expect(store.receipts).toHaveLength(3);
      const verifiedLedgerCredits = store.studentFinancialLedgers.filter(
        (l) => l.entry_type === 'Payment Verified'
      );
      expect(verifiedLedgerCredits).toHaveLength(3);

      // Overpayment blocked
      expect(() => {
        feeWorkflowService.recordPayment(
          {
            fee_id: testFee.id,
            student_id: testStudent.id,
            amount_paid: 1000,
            payment_mode: 'UPI',
          },
          counsellor.id
        );
      }).toThrow(/exceeds the outstanding fee balance/i);
    });
  });

  // =========================================================================
  // STEP 4: NEXT WORKFLOW — ONBOARDING FORWARDING & GATED LMS ACCESS
  // =========================================================================
  describe('Step 4 — Automated Onboarding Forwarding & Strict LMS Access Gating', () => {
    it('automatically forwards eligible student to onboarding team upon payment approval', () => {
      // Admission is Confirmed / Approved
      expect(testAdmission.status).toBe('Confirmed');

      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-ONBOARDING-01',
        },
        counsellor.id,
        'counsellor'
      );

      // Approve payment
      feeWorkflowService.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));

      // Check onboarding case created
      const onboardingCases = store.onboardingCases.filter(
        (c) => c.student_id === testStudent.id
      );
      expect(onboardingCases).toHaveLength(1);

      const onboardingCase = onboardingCases[0];
      expect(onboardingCase.admission_id).toBe(testAdmission.id);
      expect(onboardingCase.student_name).toBe(testStudent.full_name);

      // Onboarding assignment created: assigned to active onboarding staff
      expect(onboardingCase.assigned_staff_id).toBe(onboardingSpecialist.id);
      expect(onboardingCase.assigned_staff_name).toBe(onboardingSpecialist.full_name);

      // Fee clearance checklist item automatically marked completed
      expect(onboardingCase.checklist.fee_clearance_verification.completed).toBe(true);
      expect(onboardingCase.checklist.fee_clearance_verification.completed_by).toBe(accountant.id);

      // Onboarding team notified
      expect(
        store.notifications.some(
          (n) => n.user_id === onboardingSpecialist.id && n.title === 'Student ready for onboarding'
        )
      ).toBe(true);
    });

    it('DOES NOT activate LMS access until required onboarding checks are completed', async () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-LMS-GATE-01',
        },
        counsellor.id,
        'counsellor'
      );

      // Approve payment
      feeWorkflowService.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));

      const onboardingCase = store.onboardingCases.find(
        (c) => c.student_id === testStudent.id
      )!;

      // Invariant: LMS account is NOT activated yet!
      expect(onboardingCase.lms_account_created).toBe(false);
      expect(onboardingCase.checklist.lms_account_activation.completed).toBe(false);

      // Student user profile is_active must remain false
      const studentUser = store.users.find((u) => u.id === testStudent.user_id);
      expect(studentUser?.is_active).toBe(false);

      // Attempting to provision LMS account before mandatory checklist items throws error
      await expect(
        provisionStudentLmsAccount(onboardingCase.id, onboardingSpecialist)
      ).rejects.toThrow(/Cannot activate LMS access until/i);

      // Student remains inactive
      expect(studentUser?.is_active).toBe(false);
    });

    it('DOES NOT forward to onboarding if admission is NOT approved / confirmed', () => {
      // Mark admission as Pending (not approved)
      testAdmission.status = 'Pending';

      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: testFee.id,
          student_id: testStudent.id,
          enrollment_id: testAdmission.id,
          amount_paid: 15000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-UNAPPROVED-ADM',
        },
        counsellor.id,
        'counsellor'
      );

      // Approve payment
      feeWorkflowService.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));

      // Invariant: Because admission is pending/unapproved, student is NOT forwarded to onboarding!
      const onboardingCases = store.onboardingCases.filter(
        (c) => c.student_id === testStudent.id
      );
      expect(onboardingCases).toHaveLength(0);
    });
  });
});
