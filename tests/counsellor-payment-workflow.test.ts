import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { StudentFee, StudentPaymentRecord } from '@/types';

describe('Counsellor Payment Update & Accountant Verification Workflow', () => {
  const testStudentId = 'stu-02'; // Sneha Kulkarni
  const counsellorId = 'usr-counsellor'; // Ananya Desai (counsellor)
  const anotherCounsellorId = 'usr-counsellor-02';
  const accountantId = 'usr-accounts'; // Suresh Kumar (accountant)
  const trainerId = 'usr-trainer-fico';

  let approvedFee: StudentFee;

  beforeEach(() => {
    // Reset collections for deterministic unit testing
    store.studentFees = [];
    store.feeApprovalHistories = [];
    store.studentPayments = [];
    store.studentFinancialLedgers = [];
    store.feeRevisionRequests = [];
    store.feeAccounts = [];
    store.installments = [];
    store.receipts = [];
    store.payments = [];

    if (!store.users.find((u) => u.id === anotherCounsellorId)) {
      store.users.push({
        id: anotherCounsellorId,
        email: 'counsellor2@test.com',
        full_name: 'Rahul Verma (Counsellor)',
        role: 'counsellor',
        phone: '+91 99999 88888',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Create and approve a fee proposal
    const proposal = feeWorkflowService.createFeeProposal(
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
    // Net fee = 50,000, 18% GST = 9,000, Final payable = 59,000
    approvedFee = feeWorkflowService.approveFee(proposal.id, accountantId, 'Approved');
  });

  it('1. Counsellor records a payment -> Status is Pending Verification with balance unchanged', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 15000,
        payment_mode: 'UPI',
        transaction_reference: 'UPI/INITIAL/12345',
        notes: 'Initial fee collection by counsellor',
      },
      counsellorId,
      'counsellor'
    );

    expect(payment.id).toBeDefined();
    expect(payment.verification_status).toBe('Pending Verification');
    expect(payment.recorded_by).toBe(counsellorId);
    expect(payment.amount_paid).toBe(15000);
    expect(payment.receipt_number).toBeUndefined();

    // Verify fee balance remains uncredited until accountant approval
    const feeCheck = feeWorkflowService.getStudentFeeById(approvedFee.id);
    expect(feeCheck?.paid_amount).toBe(0);
    expect(feeCheck?.outstanding_amount).toBe(50000);
  });

  it('2. Counsellor can update payment details while Pending Verification', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 15000,
        payment_mode: 'UPI',
        transaction_reference: 'UPI/OLD/11111',
        notes: 'Entered with initial slip',
      },
      counsellorId,
      'counsellor'
    );

    // Counsellor updates amount, UTR reference, payment mode, proof URL, and notes
    const updated = feeWorkflowService.updatePayment(
      payment.id,
      {
        amount_paid: 20000,
        payment_mode: 'Bank Transfer',
        payment_date: '2026-10-12',
        transaction_reference: 'NEFT-HDFC-998877',
        bank_upi_reference: 'HDFC Corporate Account #4019',
        payment_proof_url: 'https://cdn.example.com/slips/neft-998877.pdf',
        notes: 'Student updated transfer with NEFT receipt confirmation',
      },
      counsellorId,
      'counsellor'
    );

    expect(updated.id).toBe(payment.id);
    expect(updated.amount_paid).toBe(20000);
    expect(updated.payment_mode).toBe('Bank Transfer');
    expect(updated.payment_date).toBe('2026-10-12');
    expect(updated.transaction_reference).toBe('NEFT-HDFC-998877');
    expect(updated.bank_upi_reference).toBe('HDFC Corporate Account #4019');
    expect(updated.payment_proof_url).toBe('https://cdn.example.com/slips/neft-998877.pdf');
    expect(updated.notes).toBe('Student updated transfer with NEFT receipt confirmation');
    expect(updated.verification_status).toBe('Pending Verification');

    // Audit fields verified
    expect(updated.updated_by).toBe(counsellorId);
    expect(updated.updated_by_role).toBe('counsellor');
    expect(updated.updated_at).toBeDefined();

    // Store record matches updated details
    const storedRecord = store.studentPayments.find((p) => p.id === payment.id);
    expect(storedRecord?.amount_paid).toBe(20000);
    expect(storedRecord?.transaction_reference).toBe('NEFT-HDFC-998877');

    // Outstanding amount is still untouched because verification is pending
    const feeCheck = feeWorkflowService.getStudentFeeById(approvedFee.id);
    expect(feeCheck?.paid_amount).toBe(0);
    expect(feeCheck?.outstanding_amount).toBe(50000);
  });

  it('3. Counsellor is blocked from verifying their own recorded payment (Separation of Duties)', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
      },
      counsellorId,
      'counsellor'
    );

    expect(() => {
      feeWorkflowService.verifyPayment(payment.id, counsellorId);
    }).toThrow(/Separation of duties violation: Payment recorder cannot verify their own payment entry/i);
  });

  it('4. Non-accountant role (trainer or counsellor) cannot verify payments', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
      },
      counsellorId,
      'counsellor'
    );

    // Another counsellor cannot verify
    expect(() => {
      feeWorkflowService.verifyPayment(payment.id, anotherCounsellorId);
    }).toThrow(/Unauthorized: Only an Accountant can verify student payments/i);

    // Trainer cannot verify
    expect(() => {
      feeWorkflowService.verifyPayment(payment.id, trainerId);
    }).toThrow(/Unauthorized: Only an Accountant can verify student payments/i);
  });

  it('5. Accountant approves/verifies the updated payment, generating payment receipt and clearing balance', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 15000,
        payment_mode: 'UPI',
      },
      counsellorId,
      'counsellor'
    );

    // Counsellor updates payment to 25,000
    feeWorkflowService.updatePayment(
      payment.id,
      {
        amount_paid: 25000,
        transaction_reference: 'UPI/VERIFIED/25000',
        notes: 'Adjusted to full 1st installment amount',
      },
      counsellorId,
      'counsellor'
    );

    // Accountant verifies the payment
    const verified = feeWorkflowService.verifyPayment(
      payment.id,
      accountantId,
      'Verified in Axis Bank statement'
    );

    expect(verified.verification_status).toBe('Verified');
    expect(verified.verified_by).toBe(accountantId);
    expect(verified.receipt_number).toBeDefined();
    expect(verified.amount_paid).toBe(25000);

    // Fee balance is updated with the modified amount (25,000)
    const feeCheck = feeWorkflowService.getStudentFeeById(approvedFee.id);
    expect(feeCheck?.paid_amount).toBe(25000);
    expect(feeCheck?.outstanding_amount).toBe(25000); // 59,000 - 25,000

    // Receipt is generated for the updated amount
    const receipt = (store.receipts || []).find((r) => r.payment_id === payment.id);
    expect(receipt).toBeDefined();
    expect(receipt?.payment_amount).toBe(25000);

    // Financial ledger entry is recorded
    const ledger = feeWorkflowService.getStudentLedgerEntries(testStudentId);
    const ledgerEntry = ledger.find((e) => e.reference_id === payment.id);
    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry?.credit).toBe(25000);
    expect(ledgerEntry?.running_balance).toBe(25000);
  });

  it('6. Blocks any update on an already Verified payment', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 10000,
        payment_mode: 'Cash',
      },
      counsellorId,
      'counsellor'
    );

    // Accountant verifies it
    feeWorkflowService.verifyPayment(payment.id, accountantId, 'Cash verified at counter');

    // Attempting to update the verified payment throws error
    expect(() => {
      feeWorkflowService.updatePayment(
        payment.id,
        {
          amount_paid: 12000,
        },
        counsellorId,
        'counsellor'
      );
    }).toThrow(/Cannot modify an already verified payment/i);
  });

  it('7. Accountant rejects a payment and counsellor resubmits the corrected entry', () => {
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: approvedFee.id,
        amount_paid: 10000,
        payment_mode: 'Cheque',
        transaction_reference: 'CHQ-889900',
      },
      counsellorId,
      'counsellor'
    );

    const rejected = feeWorkflowService.rejectPayment(
      payment.id,
      accountantId,
      'Cheque bounced due to signature mismatch'
    );

    expect(rejected.verification_status).toBe('Rejected');
    expect(rejected.verification_notes).toContain('Cheque bounced due to signature mismatch');

    // Attempting to update rejected payment throws error
    expect(() => {
      feeWorkflowService.updatePayment(
        payment.id,
        {
          amount_paid: 10000,
        },
        counsellorId,
        'counsellor'
      );
    }).not.toThrow();
    expect(payment.status).toBe('Pending Approval');
    expect(store.auditLogs.some((a) => a.record_id === payment.id && a.action === 'PAYMENT_RESUBMITTED')).toBe(true);
  });
});
