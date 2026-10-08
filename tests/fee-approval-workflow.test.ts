import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { StudentFee, FeeCategoryItem } from '@/types';

describe('Global LMS Fee Approval & Payment Management Workflow', () => {
  const testStudentId = 'stu-02'; // Sneha Kulkarni
  const counsellorId = 'usr-counsellor'; // Ananya Desai
  const accountantId = 'usr-accounts'; // Suresh Kumar
  const superAdminId = 'usr-superadmin'; // Rajesh Sharma

  beforeEach(() => {
    // Reset collections to clean state for deterministic unit testing
    store.studentFees = [];
    store.feeApprovalHistories = [];
    store.studentPayments = [];
    store.studentFinancialLedgers = [];
    store.feeRevisionRequests = [];
  });

  describe('1. Fee Category Management & Proposal Creation', () => {
    it('returns configurable fee categories including standard courses and placement', () => {
      const categories = feeWorkflowService.getFeeCategories();
      expect(categories.length).toBeGreaterThanOrEqual(10);

      const courseCategory = categories.find((c) => c.name === 'Course Fee');
      expect(courseCategory).toBeDefined();
      expect(courseCategory?.reference_type).toBe('Course');

      const placementCategory = categories.find((c) => c.name === 'Placement Fee');
      expect(placementCategory).toBeDefined();
      expect(placementCategory?.reference_type).toBe('Placement');
    });

    it('creates a new fee proposal with auto-calculated GST and discounts', () => {
      const proposal = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Course Fee',
          reference_type: 'Course',
          standard_fee: 60000,
          proposed_fee: 60000,
          discount_amount: 10000,
          discount_reason: 'Merit scholarship',
          payment_plan: '2 Installments',
          number_of_installments: 2,
          auto_submit: false,
        },
        counsellorId,
        'counsellor'
      );

      expect(proposal.id).toBeDefined();
      expect(proposal.student_id).toBe(testStudentId);
      expect(proposal.standard_fee).toBe(60000);
      expect(proposal.proposed_fee).toBe(60000);
      expect(proposal.discount_amount).toBe(10000);
      expect(proposal.discount_percentage).toBeCloseTo(16.67, 1);
      // Net fee = 50,000, 18% GST = 9,000, Final payable = 59,000
      expect(proposal.tax_gst_amount).toBe(9000);
      expect(proposal.final_payable).toBe(59000);
      expect(proposal.outstanding_amount).toBe(59000);
      expect(proposal.approval_status).toBe('Draft');
      expect(proposal.is_payable).toBe(false);
      expect(proposal.counsellor_id).toBe(counsellorId);
    });

    it('submits a draft fee proposal for accountant review', () => {
      const draft = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Placement Fee',
          reference_type: 'Placement',
          standard_fee: 25000,
          proposed_fee: 25000,
          discount_amount: 5000,
          discount_reason: 'Early bird registration',
          auto_submit: false,
        },
        counsellorId,
        'counsellor'
      );

      expect(draft.approval_status).toBe('Draft');

      const submitted = feeWorkflowService.submitFeeForApproval(
        draft.id,
        counsellorId,
        'Requesting speedy review for upcoming placement drive'
      );

      expect(submitted.approval_status).toBe('Pending Accountant Approval');
      expect(submitted.submitted_by).toBe(counsellorId);
      expect(submitted.is_payable).toBe(false);

      // Verify audit history was recorded
      const histories = store.feeApprovalHistories.filter((h) => h.fee_id === draft.id);
      expect(histories.length).toBe(2); // Created + Submitted
      expect(histories[1].action).toBe('Submitted');
    });
  });

  describe('2. Strict Separation of Duties Enforcement', () => {
    let pendingFee: StudentFee;

    beforeEach(() => {
      pendingFee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Course Fee',
          standard_fee: 50000,
          proposed_fee: 50000,
          discount_amount: 5000,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );
    });

    it('PREVENTS the fee creator/counsellor from approving their own fee proposal', () => {
      expect(() => {
        feeWorkflowService.approveFee(pendingFee.id, counsellorId, 'Self approving');
      }).toThrow(/Separation of duties violation: The creator or submitter of a fee proposal cannot approve their own fee/i);

      // Fee status must remain Pending Accountant Approval
      const check = feeWorkflowService.getStudentFeeById(pendingFee.id);
      expect(check?.approval_status).toBe('Pending Accountant Approval');
      expect(check?.is_payable).toBe(false);
    });

    it('PREVENTS non-accountant roles from approving fees', () => {
      expect(() => {
        feeWorkflowService.approveFee(pendingFee.id, 'usr-trainer-fico', 'Trainer approving');
      }).toThrow(/Unauthorized: Only an Accountant or Finance Director can approve fees/i);
    });

    it('ALLOWS an authorized, independent Accountant to approve the fee', () => {
      const approved = feeWorkflowService.approveFee(
        pendingFee.id,
        accountantId,
        'Approved after fee schedule verification'
      );

      expect(approved.approval_status).toBe('Approved');
      expect(approved.approved_by).toBe(accountantId);
      expect(approved.is_payable).toBe(true);

      // Check student ledger was automatically created for this approved fee
      const ledgerEntries = feeWorkflowService.getStudentLedgerEntries(testStudentId);
      expect(ledgerEntries.length).toBe(1);
      expect(ledgerEntries[0].entry_type).toBe('Fee Raised');
      expect(ledgerEntries[0].debit).toBe(approved.final_payable);
      expect(ledgerEntries[0].credit).toBe(0);
      expect(ledgerEntries[0].running_balance).toBe(approved.final_payable);
    });
  });

  describe('3. Correction Request & Resubmission Flow', () => {
    let fee: StudentFee;

    beforeEach(() => {
      fee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Certification Fee',
          standard_fee: 10000,
          proposed_fee: 10000,
          discount_amount: 3000,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );
    });

    it('requires mandatory reason when requesting fee correction', () => {
      expect(() => {
        feeWorkflowService.requestFeeCorrection(fee.id, accountantId, '');
      }).toThrow(/correction reason is mandatory/i);
    });

    it('transitions fee to Correction Required with accountant feedback', () => {
      const returned = feeWorkflowService.requestFeeCorrection(
        fee.id,
        accountantId,
        'Discount exceeds 20% limit',
        'Please reduce discount to max ₹2,000 or get director approval'
      );

      expect(returned.approval_status).toBe('Correction Required');
      expect(returned.correction_reason).toBe('Discount exceeds 20% limit');
      expect(returned.is_payable).toBe(false);
    });

    it('allows counsellor to update parameters and resubmit returned fee', () => {
      feeWorkflowService.requestFeeCorrection(
        fee.id,
        accountantId,
        'Discount exceeds policy'
      );

      const resubmitted = feeWorkflowService.updateAndResubmitFee(
        fee.id,
        counsellorId,
        {
          discount_amount: 1500,
          discount_reason: 'Standard 15% promotional discount',
          counsellor_notes: 'Adjusted discount to compliant 15%',
        }
      );

      expect(resubmitted.approval_status).toBe('Pending Accountant Approval');
      expect(resubmitted.discount_amount).toBe(1500);
      // Net fee = 8,500, GST = 1,530, Final = 10,030
      expect(resubmitted.final_payable).toBe(10030);
    });
  });

  describe('4. Payment Management & Verification Gate', () => {
    let approvedFee: StudentFee;

    beforeEach(() => {
      const fee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Course Fee',
          standard_fee: 60000,
          proposed_fee: 60000,
          discount_amount: 10000,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );
      approvedFee = feeWorkflowService.approveFee(fee.id, accountantId, 'Approved');
    });

    it('PREVENTS recording payment against an unapproved fee', () => {
      const unapprovedFee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Exam / Assessment Fee',
          standard_fee: 3500,
          auto_submit: false,
        },
        counsellorId,
        'counsellor'
      );

      expect(() => {
        feeWorkflowService.recordPayment(
          {
            fee_id: unapprovedFee.id,
            amount_paid: 3500,
            payment_mode: 'UPI',
          },
          counsellorId,
          'counsellor'
        );
      }).toThrow(/Cannot record payment.*not approved by Finance/i);
    });

    it('marks non-accountant payments as "Pending Verification" without clearing balance', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: approvedFee.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          transaction_reference: 'UPI/TEST/2026/01',
        },
        counsellorId,
        'counsellor'
      );

      expect(payment.verification_status).toBe('Pending Verification');
      expect(payment.verified_by).toBeUndefined();

      // Invariant: Unverified payment does NOT update fee paid_amount yet!
      const feeCheck = feeWorkflowService.getStudentFeeById(approvedFee.id);
      expect(feeCheck?.paid_amount).toBe(0);
      expect(feeCheck?.outstanding_amount).toBe(59000);
    });

    it('enforces separation of duties on payment verification', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: approvedFee.id,
          amount_paid: 20000,
          payment_mode: 'Bank Transfer',
        },
        counsellorId,
        'counsellor'
      );

      // Counsellor who recorded the payment cannot verify their own payment
      expect(() => {
        feeWorkflowService.verifyPayment(payment.id, counsellorId);
      }).toThrow(/Separation of duties violation: Payment recorder cannot verify their own payment entry/i);

      // Other non-accountant staff (e.g. trainer) cannot verify payments
      expect(() => {
        feeWorkflowService.verifyPayment(payment.id, 'usr-trainer-fico');
      }).toThrow(/Unauthorized: Only an Accountant can verify student payments/i);
    });

    it('allows Accountant to verify payment, update fee balance, post to ledger, and generate receipt', () => {
      const payment = feeWorkflowService.recordPayment(
        {
          fee_id: approvedFee.id,
          amount_paid: 20000,
          payment_mode: 'UPI',
          transaction_reference: 'UPI/VALID/2026/02',
        },
        counsellorId,
        'counsellor'
      );

      const verified = feeWorkflowService.verifyPayment(
        payment.id,
        accountantId,
        'Verified in HDFC bank statement'
      );

      expect(verified.verification_status).toBe('Verified');
      expect(verified.verified_by).toBe(accountantId);
      expect(verified.receipt_number).toBeDefined();

      // Check fee balances were updated
      const updatedFee = feeWorkflowService.getStudentFeeById(approvedFee.id);
      expect(updatedFee?.paid_amount).toBe(20000);
      expect(updatedFee?.outstanding_amount).toBe(39000); // 59000 - 20000

      // Check receipt was issued in store
      const receipt = (store.receipts || []).find((r) => r.payment_id === payment.id);
      expect(receipt).toBeDefined();
      expect(receipt?.payment_amount).toBe(20000);
      expect(receipt?.supply_type).toBeDefined();

      // Check financial ledger entry was posted
      const ledger = feeWorkflowService.getStudentLedgerEntries(testStudentId);
      const paymentEntry = ledger.find((e) => e.reference_id === payment.id);
      expect(paymentEntry).toBeDefined();
      expect(paymentEntry?.entry_type).toBe('Payment Verified');
      expect(paymentEntry?.credit).toBe(20000);
      expect(paymentEntry?.running_balance).toBe(39000);
    });
  });

  describe('5. Fee Revisions & Immutable History', () => {
    it('creates revision request on approved fees and maintains version history', () => {
      const fee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Course Fee',
          standard_fee: 60000,
          proposed_fee: 60000,
          discount_amount: 5000,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );
      const approved = feeWorkflowService.approveFee(fee.id, accountantId);

      // Raise revision for additional management discount
      const revision = feeWorkflowService.createFeeRevisionRequest(
        approved.id,
        counsellorId,
        'Additional Discount',
        'Student granted additional ₹5,000 scholarship by director',
        {
          discount_amount: 10000,
          final_payable: 59000,
        }
      );

      expect(revision.status).toBe('Pending Review');
      expect(revision.original_fee_id).toBe(approved.id);

      // Accountant approves revision
      const result = feeWorkflowService.approveFeeRevision(
        revision.id,
        accountantId,
        'Director approval email verified'
      );

      expect(result.originalFee.approval_status).toBe('Superseded');
      expect(result.originalFee.is_payable).toBe(false);

      expect(result.newFee.version).toBe(2);
      expect(result.newFee.approval_status).toBe('Approved');
      expect(result.newFee.is_payable).toBe(true);
      expect(result.newFee.parent_fee_id).toBe(approved.id);
    });
  });

  describe('6. Universal Financial Clearance Gate', () => {
    it('denies clearance when student has outstanding balance', () => {
      const fee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Course Fee',
          standard_fee: 50000,
          proposed_fee: 50000,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );
      feeWorkflowService.approveFee(fee.id, accountantId);

      const clearance = feeWorkflowService.checkFinancialClearance(
        testStudentId,
        'placement_eligibility'
      );

      expect(clearance.is_cleared).toBe(false);
      expect(clearance.outstanding_balance).toBeGreaterThan(0);
      expect(clearance.reasons.length).toBeGreaterThan(0);
    });

    it('grants clearance when all approved fees are fully paid and verified', () => {
      const fee = feeWorkflowService.createFeeProposal(
        {
          student_id: testStudentId,
          fee_category: 'Course Fee',
          standard_fee: 20000,
          proposed_fee: 20000,
          discount_amount: 0,
          auto_submit: true,
        },
        counsellorId,
        'counsellor'
      );
      // Final payable: 20,000 + 18% GST = 23,600
      const approved = feeWorkflowService.approveFee(fee.id, accountantId);

      // Accountant records full payment directly
      feeWorkflowService.recordPayment(
        {
          fee_id: approved.id,
          amount_paid: approved.final_payable,
          payment_mode: 'Bank Transfer',
        },
        accountantId,
        'accountant'
      );

      const summary = feeWorkflowService.getStudentFinancialSummary(testStudentId);
      expect(summary.outstanding_balance).toBe(0);
      expect(summary.status).toBe('Financially Cleared');

      const clearance = feeWorkflowService.checkFinancialClearance(
        testStudentId,
        'placement_eligibility'
      );
      expect(clearance.is_cleared).toBe(true);
      expect(clearance.outstanding_balance).toBe(0);
    });
  });
});
