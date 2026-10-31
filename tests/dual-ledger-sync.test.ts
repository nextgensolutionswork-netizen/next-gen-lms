import { enteredPaymentVerification } from './payment-verification-fixture';
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { recordPaymentAtomic } from '@/lib/services/finance-service';

describe('Dual-Ledger Bi-Directional Financial Synchronization Suite', () => {
  const accountantId = 'usr-accounts';
  const counsellorId = 'usr-counsellor';

  beforeEach(() => {
    // Reconcile and clear any transient test leftovers
    store.reconcileDualLedgers();
  });

  describe('1. Admissions Creation Bridges Both Ledgers', () => {
    it('automatically generates both legacy feeAccount/installments and approved StudentFee/ledger on admission', async () => {
      const email = `dual.ledger.${Date.now()}@example.com`;
      const result = await createAdmissionWorkflow(
        {
          student_name: 'Aditi Deshpande',
          phone: '+91 98888 77777',
          email,
          dob: '1998-05-15',
          gender: 'Female',
          address: 'Gachibowli',
          city: 'Hyderabad',
          education: 'B.Com',
          experience_years: 2,
          current_employment_status: 'Employed',
          course_id: 'crs-fico-01',
          training_mode: 'Online',
          admission_date: '2026-03-10',
          course_fee: 50000,
          discount: 5000,
          discount_reason: 'Women in Tech Scholarship',
          payment_plan: '2 Installments',
        },
        'usr-admin'
      );

      const studentId = result.student.id;

      // 1. Check Legacy Store
      expect(result.feeAccount).toBeDefined();
      expect(result.feeAccount.net_payable).toBe(45000);
      expect(result.feeAccount.paid_amount).toBe(0);
      expect(result.feeAccount.outstanding_amount).toBe(45000);

      const legacyInsts = store.installments.filter((i) => i.fee_account_id === result.feeAccount.id);
      expect(legacyInsts).toHaveLength(0);

      // 2. Check Advanced Store
      const advancedFee = store.studentFees.find((f) => f.student_id === studentId);
      expect(advancedFee).toBeDefined();
      expect(advancedFee?.approval_status).toBe('Approved');
      expect(advancedFee?.is_payable).toBe(true);
      expect(advancedFee?.final_payable).toBe(45000);
      expect(advancedFee?.paid_amount).toBe(0);
      expect(advancedFee?.outstanding_amount).toBe(45000);

      // 3. Check Financial Ledger
      const ledgers = feeWorkflowService.getStudentLedgerEntries(studentId);
      expect(ledgers.length).toBeGreaterThanOrEqual(1);
      const feeRaised = ledgers.find((l) => l.entry_type === 'Fee Raised');
      expect(feeRaised).toBeDefined();
      expect(feeRaised?.debit).toBe(45000);
      expect(feeRaised?.running_balance).toBe(45000);
    });
  });

  describe('2. Advanced Workflow Payment Finalization Updates Legacy Store', () => {
    it('updates legacy feeAccount, installments, payments, and student profile when payment verified', async () => {
      // 1. Setup isolated test student without pre-existing fee accounts
      const student = {
        id: `stu-adv-${Date.now()}`,
        student_code: 'STU-ADV-99',
        admission_number: `ADM-ADV-${Date.now()}`,
        full_name: 'Pooja Hegde',
        email: `pooja.${Date.now()}@example.com`,
        phone: '+91 91234 56789',
        course_id: 'crs-fico-01',
        total_fee: 10000,
        paid_amount: 0,
        outstanding_amount: 10000,
        status: 'Active' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.students.push(student as any);

      const initialStudentPaid = student.paid_amount || 0;
      const initialStudentOut = student.outstanding_amount || 0;

      const proposal = feeWorkflowService.createFeeProposal(
        {
          student_id: student.id,
          fee_category: 'Exam / Assessment Fee',
          standard_fee: 10000,
          proposed_fee: 10000,
          discount_amount: 0,
          payment_plan: 'Full Payment',
          number_of_installments: 1,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );

      const approvedFee = feeWorkflowService.approveFee(proposal.id, accountantId, 'Approved by Finance');
      expect(approvedFee.approval_status).toBe('Approved');

      // Verify legacy feeAccount was automatically created/synchronized
      const matchingFeeAccount = store.feeAccounts.find((fa) => fa.id === `fa-${approvedFee.id}`);
      expect(matchingFeeAccount).toBeDefined();
      expect(matchingFeeAccount?.net_payable).toBe(approvedFee.final_payable);

      // 2. Record payment via advanced workflow
      const payAmount = 5000;
      const paymentRec = feeWorkflowService.recordPayment(
        {
          fee_id: approvedFee.id,
          amount_paid: payAmount,
          payment_mode: 'UPI',
          transaction_reference: `UPI-SYNC-${Date.now()}`,
        },
        counsellorId,
        'counsellor'
      );

      // 3. Verify payment by Accountant
      const verified = feeWorkflowService.verifyPayment(paymentRec.id, accountantId, 'Verified in Bank Statement', enteredPaymentVerification(paymentRec.id));
      expect(verified.verification_status).toBe('Verified');

      // Check Advanced balances
      const updatedFee = feeWorkflowService.getStudentFeeById(approvedFee.id);
      expect(updatedFee?.paid_amount).toBe(payAmount);

      // Check Legacy feeAccount balances were updated
      expect(matchingFeeAccount?.paid_amount).toBe(payAmount);
      expect(matchingFeeAccount?.outstanding_amount).toBe(approvedFee.final_payable - payAmount);

      // Check Legacy store.payments has the verified payment
      const legacyPayment = store.payments.find((p) => p.receipt_number === verified.receipt_number);
      expect(legacyPayment).toBeDefined();
      expect(legacyPayment?.amount).toBe(payAmount);

      // Check Student profile updated
      expect(student.paid_amount).toBe(initialStudentPaid + payAmount);
    });
  });

  describe('3. Legacy recordPaymentAtomic Updates Advanced Store', () => {
    it('updates StudentFee balances, pushes verified StudentPaymentRecord, and posts to studentFinancialLedgers', async () => {
      // 1. Create student admission with dual ledgers
      const email = `atomic.sync.${Date.now()}@example.com`;
      const adm = await createAdmissionWorkflow(
        {
          student_name: 'Vikram Joshi',
          phone: '+91 97777 66666',
          email,
          dob: '1995-10-20',
          gender: 'Male',
          address: 'Kondapur',
          city: 'Hyderabad',
          education: 'MCA',
          experience_years: 3,
          current_employment_status: 'Employed',
          course_id: 'crs-mm-01',
          training_mode: 'Classroom',
          admission_date: '2026-03-12',
          course_fee: 40000,
          discount: 0,
          payment_plan: '2 Installments',
        },
        'usr-admin'
      );

      const studentId = adm.student.id;
      const feeAccountId = adm.feeAccount.id;
      const payAmount = 20000;
      const txnRef = `TXN-ATOMIC-${Date.now()}`;

      // 2. Execute recordPaymentAtomic
      const payResult = await recordPaymentAtomic(
        {
          student_id: studentId,
          course_id: adm.student.course_id,
          fee_account_id: feeAccountId,
          amount: payAmount,
          payment_date: '2026-03-12',
          payment_mode: 'Bank Transfer',
          transaction_reference: txnRef,
        },
        accountantId
      );

      // Verify Legacy results
      expect(payResult.payment.amount).toBe(payAmount);
      expect(payResult.updatedFeeAccount.paid_amount).toBe(payAmount);
      expect(payResult.updatedFeeAccount.outstanding_amount).toBe(20000);

      // 3. Verify Advanced StudentFee was updated
      const studentFee = store.studentFees.find((f) => f.student_id === studentId);
      expect(studentFee).toBeDefined();
      expect(studentFee?.paid_amount).toBe(payAmount);
      expect(studentFee?.outstanding_amount).toBe(20000);

      // 4. Verify StudentPaymentRecord was added as Verified
      const spr = store.studentPayments.find((p) => p.receipt_number === payResult.receipt.receipt_number);
      expect(spr).toBeDefined();
      expect(spr?.amount_paid).toBe(payAmount);
      expect(spr?.verification_status).toBe('Verified');

      // 5. Verify StudentFinancialLedgerEntry was posted
      const ledger = feeWorkflowService.getStudentLedgerEntries(studentId);
      const paymentEntry = ledger.find((e) => e.receipt_id === payResult.receipt.id);
      expect(paymentEntry).toBeDefined();
      expect(paymentEntry?.entry_type).toBe('Payment Verified');
      expect(paymentEntry?.credit).toBe(payAmount);
      expect(paymentEntry?.running_balance).toBe(20000);
    });
  });

  describe('4. Self-Healing Dual-Ledger Reconciliation on Store Hydration', () => {
    it('reconciles any orphaned legacy fee account or payment into advanced store', () => {
      // Simulate an orphaned legacy fee account
      const orphanedFaId = `fa-orphan-${Date.now()}`;
      const orphanStudentId = `stu-orphan-${Date.now()}`;
      store.feeAccounts.push({
        id: orphanedFaId,
        student_id: orphanStudentId,
        student_name: 'Orphan Student',
        admission_id: `adm-orphan-${Date.now()}`,
        course_id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance (FICO)',
        original_fee: 30000,
        discount: 0,
        net_payable: 30000,
        paid_amount: 10000,
        outstanding_amount: 20000,
        payment_plan: 'Full Payment',
        status: 'Partially Paid',
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
      });

      // Run reconciliation
      store.reconcileDualLedgers();

      // Verify synthesized StudentFee in advanced store
      const synthesizedFee = store.studentFees.find((f) => f.id === `fee-${orphanedFaId}`);
      expect(synthesizedFee).toBeDefined();
      expect(synthesizedFee?.final_payable).toBe(30000);
      expect(synthesizedFee?.paid_amount).toBe(10000);
      expect(synthesizedFee?.outstanding_amount).toBe(20000);
      expect(synthesizedFee?.approval_status).toBe('Approved');
    });
  });
});
