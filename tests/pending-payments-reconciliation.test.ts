/**
 * QA-016 / BUG-03: Pending Payment Approval & Dashboard Count Reconciliation Tests
 *
 * Verifies that:
 * 1. Exactly 1 mirrored pending payment is counted once (count = 1, not 2).
 * 2. Multiple legitimate payments for the same student remain separate and are not collapsed.
 * 3. Mixed statuses (Pending, Approved, Rejected, Voided, Refunded) are cleanly separated.
 * 4. Conflicting statuses across legacy and modern records resolve deterministically using workflow precedence.
 * 5. Zero pending payments yields 0 counts and 0 amounts without error.
 * 6. Paginated approvals queue calculates total count and amount across the full eligible dataset, not just the page slice.
 * 7. Filtered scope (date range, role, course) operates consistently on canonical records.
 * 8. Approving or rejecting a pending payment decrements count by 1 and amount by the payment's amount on both surfaces.
 * 9. Approvals desk "Total Recorded Payments" card vs "Verified Collections" card:
 *    - Verified Collections represents eligible verified payments only.
 *    - Total Recorded Payments represents all recorded payments (Verified, Pending, Rejected) from the same dataset.
 *    - Pending and rejected amounts do not inflate verified collections.
 * 10. Server-side approval/rejection authorization, session identity, and alias resistance:
 *    - Actor identity comes from authenticated session.
 *    - Role permissions enforced server-side (only Accounts/Admin can approve/reject).
 *    - Self-approval is rejected server-side (separation of duties).
 *    - Already processed payments cannot be approved or rejected again.
 *    - Canonical-ID aliases (pay-spr-xxx) cannot bypass these checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as paymentPostRoute } from '@/app/api/fees/payments/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  getCanonicalPaymentKey,
  unifyDualLedgerPayments,
  calculatePaymentApprovalMetrics,
  isPaymentApproved,
  isPaymentPending,
  paymentCourseBucket,
  UNASSIGNED_COURSE,
} from '@/lib/utils/dashboard-metrics';
import { enteredPaymentVerification } from './payment-verification-fixture';
import { StudentPaymentRecord, Payment, UserProfile } from '@/types';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

// Simulates the exact approvals desk calculation from app/(dashboard)/accounts/approvals/page.tsx
function computeApprovalsDeskMetrics(payments: readonly StudentPaymentRecord[]) {
  const pendingPayments = payments.filter((p) => isPaymentPending(p));
  const verifiedPayments = payments.filter((p) => isPaymentApproved(p));
  const rejectedPayments = payments.filter((p) => !isPaymentPending(p) && !isPaymentApproved(p));

  return {
    pendingCount: pendingPayments.length,
    pendingAmount: pendingPayments.reduce((sum, p) => sum + safeAmount(p.amount_paid), 0),
    verifiedCount: verifiedPayments.length,
    verifiedAmount: verifiedPayments.reduce((sum, p) => sum + safeAmount(p.amount_paid), 0),
    rejectedCount: rejectedPayments.length,
    totalCount: payments.length,
    totalAmount: payments.reduce((sum, p) => sum + safeAmount(p.amount_paid), 0),
  };
}

async function createSignedRequest(actor: UserProfile, body?: unknown) {
  const value = encodeURIComponent(JSON.stringify(actor));
  const signature = await generateAuthCookieSignature(value);
  return new NextRequest('http://localhost/api/fees/payments', {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('QA-016 / BUG-03: Pending Payment Approval & Dashboard Reconciliation', () => {
  const counsellorId = 'usr-counsellor-01';
  const accountantId = 'usr-accountant-01';

  beforeEach(() => {
    store.users = [
      {
        id: counsellorId,
        email: 'counsellor@test.com',
        full_name: 'Ananya Counsellor',
        role: 'counsellor',
        tenant_id: 'default',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: accountantId,
        email: 'accountant@test.com',
        full_name: 'Suresh Accountant',
        role: 'accountant',
        tenant_id: 'default',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    store.courses = [
      {
        id: 'crs-fico',
        course_name: 'SAP S/4HANA Finance (FICO)',
        code: 'SAP-FICO',
        duration_weeks: 12,
        is_active: true,
      } as any,
      {
        id: 'crs-mm',
        course_name: 'SAP S/4HANA Materials Management (MM)',
        code: 'SAP-MM',
        duration_weeks: 12,
        is_active: true,
      } as any,
    ];

    store.students = [
      {
        id: 'stu-01',
        full_name: 'Rahul Verma',
        admission_number: 'ADM-2026-0001',
        course_id: 'crs-fico',
        course_name: 'SAP S/4HANA Finance (FICO)',
        email: 'rahul@test.com',
        phone: '9876543210',
        status: 'Active',
        total_fee: 60000,
        paid_amount: 0,
        outstanding_amount: 60000,
        attendance_percentage: 100,
        course_progress: 0,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any,
      {
        id: 'stu-02',
        full_name: 'Priya Sharma',
        admission_number: 'ADM-2026-0002',
        course_id: 'crs-mm',
        course_name: 'SAP S/4HANA Materials Management (MM)',
        email: 'priya@test.com',
        phone: '9876543211',
        status: 'Active',
        total_fee: 55000,
        paid_amount: 0,
        outstanding_amount: 55000,
        attendance_percentage: 100,
        course_progress: 0,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any,
    ];

    store.studentFees = [];
    store.feeAccounts = [];
    store.studentPayments = [];
    store.payments = [];
    store.receipts = [];
    store.studentFinancialLedgers = [];
  });

  it('1. Exactly 1 mirrored pending payment counts once (count = 1, not 2)', () => {
    // Propose and approve a fee
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 60000,
        proposed_fee: 60000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 2,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved for payment recording');

    // Record a pending payment
    const p1 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 25000,
        payment_mode: 'UPI',
        payment_date: '2026-11-14',
        transaction_reference: '10001',
        payment_proof_url: 'https://example.com/proof1.png',
      },
      counsellorId,
      'counsellor'
    );

    // Verify dual-ledger sync created mirrors:
    // 1 in store.studentPayments (id: spr-xxx)
    // 1 in store.payments (id: pay-spr-xxx)
    expect(store.studentPayments.length).toBe(1);
    expect(store.payments.length).toBe(1);
    expect(store.studentPayments[0].verification_status).toBe('Pending Verification');
    expect(store.payments[0].status).toBe('Pending');

    // Unify across dual ledgers
    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // Unification MUST collapse the 2 mirrored rows into exactly 1 canonical payment record
    expect(unified.length).toBe(1);
    expect(unified[0].amount).toBe(25000);
    expect(isPaymentPending(unified[0])).toBe(true);

    // Dashboard Pending Metrics
    const dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    expect(dashboardMetrics.pendingCount).toBe(1); // NOT 2
    expect(dashboardMetrics.pendingAmount).toBe(25000); // NOT 50,000

    // Approvals Desk Metrics
    const deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);
    expect(deskMetrics.pendingCount).toBe(1);
    expect(deskMetrics.pendingAmount).toBe(25000);

    // Both surfaces agree exactly
    expect(dashboardMetrics.pendingCount).toBe(deskMetrics.pendingCount);
    expect(dashboardMetrics.pendingAmount).toBe(deskMetrics.pendingAmount);
  });

  it('2. Multiple legitimate payments for the same student remain separate and uncollapsed', () => {
    const fee1 = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 60000,
        proposed_fee: 60000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 3,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee1.id, accountantId, 'Fee 1 Approved');

    const fee2 = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Exam Fee',
        standard_fee: 5000,
        proposed_fee: 5000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Full Payment',
        number_of_installments: 1,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee2.id, accountantId, 'Fee 2 Approved');

    // Installment 1: 20,000
    feeWorkflowService.recordPayment(
      {
        fee_id: fee1.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
        payment_date: '2026-11-10',
        transaction_reference: '10002',
      },
      counsellorId,
      'counsellor'
    );

    // Installment 2: 25,000
    feeWorkflowService.recordPayment(
      {
        fee_id: fee1.id,
        amount_paid: 25000,
        payment_mode: 'Bank Transfer',
        payment_date: '2026-11-11',
        transaction_reference: '10003',
      },
      counsellorId,
      'counsellor'
    );

    // Exam fee payment: 5,000
    feeWorkflowService.recordPayment(
      {
        fee_id: fee2.id,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-12',
      },
      counsellorId,
      'counsellor'
    );

    // Total records before unification: 3 modern + 3 legacy = 6 records
    expect(store.studentPayments.length).toBe(3);
    expect(store.payments.length).toBe(3);

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // Unification MUST NOT collapse the 3 distinct installments
    expect(unified.length).toBe(3);
    const amounts = unified.map((u) => u.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([5000, 20000, 25000]);

    // Dashboard Pending
    const dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    expect(dashboardMetrics.pendingCount).toBe(3);
    expect(dashboardMetrics.pendingAmount).toBe(50000);

    // Approvals Desk
    const deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);
    expect(deskMetrics.pendingCount).toBe(3);
    expect(deskMetrics.pendingAmount).toBe(50000);
  });

  it('3. Mixed statuses (Pending, Approved, Rejected, Voided) are cleanly separated', () => {
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 80000,
        proposed_fee: 80000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 4,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved');

    // 1. Pending payment (20,000)
    const pPending = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
        payment_date: '2026-11-01',
        transaction_reference: '10004',
      },
      counsellorId,
      'counsellor'
    );

    // 2. Approved payment (25,000)
    const pToVerify = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 25000,
        payment_mode: 'UPI',
        payment_date: '2026-11-02',
        transaction_reference: '10005',
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.verifyPayment(
      pToVerify.id,
      accountantId,
      'Verified in bank',
      enteredPaymentVerification(pToVerify.id)
    );

    // 3. Rejected payment (15,000)
    const pToReject = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 15000,
        payment_mode: 'UPI',
        payment_date: '2026-11-03',
        transaction_reference: '10006',
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.rejectPayment(pToReject.id, accountantId, 'UTR mismatch');

    // 4. Voided receipt payment (10,000)
    const pToVoid = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 10000,
        payment_mode: 'UPI',
        payment_date: '2026-11-04',
        transaction_reference: '10007',
      },
      counsellorId,
      'counsellor'
    );
    const verifiedVoid = feeWorkflowService.verifyPayment(
      pToVoid.id,
      accountantId,
      'Verified before void',
      enteredPaymentVerification(pToVoid.id)
    );
    feeWorkflowService.voidReceipt(verifiedVoid.receipt_number!, accountantId, 'Check bounced / wrong account');

    // 5. Refunded payment (5,000)
    const pRefunded = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 5000,
        payment_mode: 'UPI',
        payment_date: '2026-11-05',
        transaction_reference: '10008',
      },
      counsellorId,
      'counsellor'
    );
    const verifiedRefund = feeWorkflowService.verifyPayment(
      pRefunded.id,
      accountantId,
      'Verified before refund',
      enteredPaymentVerification(pRefunded.id)
    );
    verifiedRefund.status = 'Refunded' as any;
    verifiedRefund.verification_status = 'Refunded' as any;
    store.reconcileDualLedgers();

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    const pending = unified.filter((p) => isPaymentPending(p));
    const approved = unified.filter((p) => isPaymentApproved(p));

    // ONLY the pending payment is in pending
    expect(pending.length).toBe(1);
    expect(pending[0].amount).toBe(20000);

    // ONLY the verified, unvoided, unrefunded payment is in approved
    expect(approved.length).toBe(1);
    expect(approved[0].amount).toBe(25000);

    // Dashboard metrics
    const dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    expect(dashboardMetrics.pendingCount).toBe(1);
    expect(dashboardMetrics.pendingAmount).toBe(20000);
    expect(dashboardMetrics.approvedCount).toBe(1);
    expect(dashboardMetrics.approvedAmount).toBe(25000);

    // Approvals desk metrics
    const deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);
    expect(deskMetrics.pendingCount).toBe(1);
    expect(deskMetrics.pendingAmount).toBe(20000);
    expect(deskMetrics.verifiedCount).toBe(1);
    expect(deskMetrics.verifiedAmount).toBe(25000);
  });

  it('4. Conflicting statuses across legacy and modern records resolve deterministically using authoritative precedence', () => {
    // Scenario A: Stale pending in legacy store.payments, but modern store.studentPayments is Verified
    const legacyStalePending: Payment = {
      course_id: 'crs-fico',
      id: 'pay-spr-conflict-01',
      tenant_id: 'default',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_account_id: 'fa-01',
      amount: 30000,
      payment_date: '2026-11-01',
      payment_mode: 'UPI',
      status: 'Pending', // Stale
      collected_by: counsellorId,
      receipt_number: 'PENDING-spr-conflict-01',
      created_at: '2026-11-01T10:00:00Z',
    };

    const modernVerified: any = {
      id: 'spr-conflict-01',
      tenant_id: 'default',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      fee_id: 'fee-01',
      amount_paid: 30000,
      payment_date: '2026-11-01',
      payment_mode: 'UPI',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-2026-0099',
      recorded_by: counsellorId,
      verified_by: accountantId,
      created_at: '2026-11-01T10:00:00Z',
    };

    store.payments = [legacyStalePending];
    store.studentPayments = [modernVerified];
    store.receipts = [
      {
        id: 'rcpt-0099',
        receipt_number: 'REC-2026-0099',
        payment_id: 'spr-conflict-01',
        payment_amount: 30000,
        payment_date: '2026-11-01',
        student_id: 'stu-01',
        receipt_status: 'Active',
      } as any,
    ];

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // Authoritative modern status (Verified) wins over stale legacy (Pending)
    expect(unified.length).toBe(1);
    expect(isPaymentApproved(unified[0])).toBe(true);
    expect(isPaymentPending(unified[0])).toBe(false);

    const dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    expect(dashboardMetrics.pendingCount).toBe(0);
    expect(dashboardMetrics.pendingAmount).toBe(0);
    expect(dashboardMetrics.approvedCount).toBe(1);
    expect(dashboardMetrics.approvedAmount).toBe(30000);

    // Scenario B: Stale pending in legacy store.payments, but modern store.studentPayments is Rejected
    const legacyStalePending2: any = {
      id: 'pay-spr-conflict-02',
      tenant_id: 'default',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      amount: 15000,
      payment_date: '2026-11-02',
      payment_mode: 'UPI',
      status: 'Pending',
      collected_by: counsellorId,
      receipt_number: 'PENDING-spr-conflict-02',
      created_at: '2026-11-02T10:00:00Z',
    };

    const modernRejected: any = {
      id: 'spr-conflict-02',
      tenant_id: 'default',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      fee_id: 'fee-01',
      amount_paid: 15000,
      payment_date: '2026-11-02',
      payment_mode: 'UPI',
      status: 'Rejected',
      verification_status: 'Rejected',
      recorded_by: counsellorId,
      created_at: '2026-11-02T10:00:00Z',
    };

    store.payments = [legacyStalePending2];
    store.studentPayments = [modernRejected];

    const unified2 = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // Authoritative modern status (Rejected) wins over stale legacy (Pending)
    expect(unified2.length).toBe(1);
    expect(isPaymentPending(unified2[0])).toBe(false);
    expect(isPaymentApproved(unified2[0])).toBe(false);

    const dashboardMetrics2 = calculatePaymentApprovalMetrics(unified2);
    expect(dashboardMetrics2.pendingCount).toBe(0);
    expect(dashboardMetrics2.pendingAmount).toBe(0);
  });

  it('5. Zero pending payments yields 0 counts and 0 amounts without error', () => {
    store.payments = [];
    store.studentPayments = [];

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    expect(unified.length).toBe(0);

    const dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    expect(dashboardMetrics.pendingCount).toBe(0);
    expect(dashboardMetrics.pendingAmount).toBe(0);
    expect(dashboardMetrics.approvedCount).toBe(0);
    expect(dashboardMetrics.approvedAmount).toBe(0);

    const deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);
    expect(deskMetrics.pendingCount).toBe(0);
    expect(deskMetrics.pendingAmount).toBe(0);
    expect(deskMetrics.verifiedCount).toBe(0);
    expect(deskMetrics.verifiedAmount).toBe(0);
    expect(deskMetrics.rejectedCount).toBe(0);
    expect(deskMetrics.totalCount).toBe(0);
    expect(deskMetrics.totalAmount).toBe(0);
  });

  it('6. Paginated approvals queue calculates total count and amount across full eligible dataset, not just page slice', () => {
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 100000,
        proposed_fee: 100000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 10,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved');

    // Create 12 pending payments of 5,000 each = 60,000 total
    for (let i = 1; i <= 12; i++) {
      feeWorkflowService.recordPayment(
        {
          fee_id: fee.id,
          amount_paid: 5000,
          payment_mode: 'UPI',
          payment_date: '2026-11-10',
          transaction_reference: String(20000 + Number(i || 0)).slice(0, 5),
        },
        counsellorId,
        'counsellor'
      );
    }
    store.reconcileDualLedgers();

    // Verify 12 payments present in store
    expect(store.studentPayments.length).toBe(12);

    // Simulate Approvals Desk pagination: pageSize = 5
    const pageSize = 5;
    const page1Slice = store.studentPayments.slice(0, pageSize);
    expect(page1Slice.length).toBe(5);

    // Summary KPI cards MUST calculate across the FULL eligible dataset (store.studentPayments), NOT page1Slice
    const fullDeskMetrics = computeApprovalsDeskMetrics(store.studentPayments);
    const sliceMetrics = computeApprovalsDeskMetrics(page1Slice);

    // Full desk metrics reflects all 12 payments
    expect(fullDeskMetrics.pendingCount).toBe(12);
    expect(fullDeskMetrics.pendingAmount).toBe(60000);

    // Slice metrics would only be 5 and 25,000 (which must not be what is shown in KPI cards)
    expect(sliceMetrics.pendingCount).toBe(5);
    expect(sliceMetrics.pendingAmount).toBe(25000);

    // Dashboard metrics on unified records
    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });
    const dashboardMetrics = calculatePaymentApprovalMetrics(unified);

    // Dashboard matches the FULL dataset, not the sliced view
    expect(dashboardMetrics.pendingCount).toBe(fullDeskMetrics.pendingCount);
    expect(dashboardMetrics.pendingAmount).toBe(fullDeskMetrics.pendingAmount);
  });

  it('7. Filtered scope (date range, role, course) operates consistently on canonical records', () => {
    // Stu 1 in SAP-FICO
    const feeFico = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 60000,
        proposed_fee: 60000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Full Payment',
        number_of_installments: 1,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(feeFico.id, accountantId, 'Approved FICO');

    // Stu 2 in SAP-MM
    const feeMm = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-02',
        fee_category: 'Course Fee',
        standard_fee: 55000,
        proposed_fee: 55000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Full Payment',
        number_of_installments: 1,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(feeMm.id, accountantId, 'Approved MM');

    // Payment 1 in FICO (30,000) on 2026-11-05
    feeWorkflowService.recordPayment(
      {
        fee_id: feeFico.id,
        amount_paid: 30000,
        payment_mode: 'UPI',
        payment_date: '2026-11-05',
        transaction_reference: '10009',
      },
      counsellorId,
      'counsellor'
    );

    // Payment 2 in MM (25,000) on 2026-10-15 (previous month)
    feeWorkflowService.recordPayment(
      {
        fee_id: feeMm.id,
        amount_paid: 25000,
        payment_mode: 'UPI',
        payment_date: '2026-10-15',
        transaction_reference: '10010',
      },
      counsellorId,
      'counsellor'
    );
    store.reconcileDualLedgers();

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // Scope A: Course filter = 'crs-fico'
    const courseIdSet = new Set(store.courses.map((c) => c.id));
    const ficoPayments = unified.filter((p) => paymentCourseBucket(p, courseIdSet, store.feeAccounts, store.students) === 'crs-fico');
    const ficoMetrics = calculatePaymentApprovalMetrics(ficoPayments);
    expect(ficoMetrics.pendingCount).toBe(1);
    expect(ficoMetrics.pendingAmount).toBe(30000);

    // Scope B: Date filter = November 2026
    const novPayments = unified.filter((p) => p.payment_date.startsWith('2026-11'));
    const novMetrics = calculatePaymentApprovalMetrics(novPayments);
    expect(novMetrics.pendingCount).toBe(1);
    expect(novMetrics.pendingAmount).toBe(30000);

    // Scope C: All Time
    const allMetrics = calculatePaymentApprovalMetrics(unified);
    expect(allMetrics.pendingCount).toBe(2);
    expect(allMetrics.pendingAmount).toBe(55000);
  });

  it('8. Approving or rejecting a pending payment decrements count by 1 and amount by the payment amount on both surfaces', () => {
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 100000,
        proposed_fee: 100000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 2,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved');

    // Payment 1: 50,000
    const p1 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 50000,
        payment_mode: 'UPI',
        payment_date: '2026-11-04',
        transaction_reference: '10011',
      },
      counsellorId,
      'counsellor'
    );

    // Payment 2: 30,000
    const p2 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 30000,
        payment_mode: 'UPI',
        payment_date: '2026-11-05',
        transaction_reference: '10012',
      },
      counsellorId,
      'counsellor'
    );
    store.reconcileDualLedgers();

    let unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    let dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    let deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);

    // Initial state: 2 pending, 80,000 amount
    expect(dashboardMetrics.pendingCount).toBe(2);
    expect(dashboardMetrics.pendingAmount).toBe(80000);
    expect(deskMetrics.pendingCount).toBe(2);
    expect(deskMetrics.pendingAmount).toBe(80000);

    // ACTION A: Approve p1 (50,000)
    feeWorkflowService.verifyPayment(
      p1.id,
      accountantId,
      'Approved p1 in full',
      enteredPaymentVerification(p1.id)
    );
    store.reconcileDualLedgers();

    unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);

    // Pending count decremented by exactly 1, amount decremented by 50,000 on BOTH surfaces
    expect(dashboardMetrics.pendingCount).toBe(1);
    expect(dashboardMetrics.pendingAmount).toBe(30000);
    expect(deskMetrics.pendingCount).toBe(1);
    expect(deskMetrics.pendingAmount).toBe(30000);

    // Approved count incremented by 1, approved amount incremented by 50,000
    expect(dashboardMetrics.approvedCount).toBe(1);
    expect(dashboardMetrics.approvedAmount).toBe(50000);
    expect(deskMetrics.verifiedCount).toBe(1);
    expect(deskMetrics.verifiedAmount).toBe(50000);

    // ACTION B: Reject p2 (30,000)
    feeWorkflowService.rejectPayment(p2.id, accountantId, 'Invalid UTR reference');
    store.reconcileDualLedgers();

    unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    dashboardMetrics = calculatePaymentApprovalMetrics(unified);
    deskMetrics = computeApprovalsDeskMetrics(store.studentPayments);

    // Pending count decremented to 0, pending amount decremented to 0 on BOTH surfaces
    expect(dashboardMetrics.pendingCount).toBe(0);
    expect(dashboardMetrics.pendingAmount).toBe(0);
    expect(deskMetrics.pendingCount).toBe(0);
    expect(deskMetrics.pendingAmount).toBe(0);

    // Approved totals remain unchanged
    expect(dashboardMetrics.approvedCount).toBe(1);
    expect(dashboardMetrics.approvedAmount).toBe(50000);
    expect(deskMetrics.verifiedCount).toBe(1);
    expect(deskMetrics.verifiedAmount).toBe(50000);

    // Rejected totals on approvals desk reflect the rejected payment
    expect(deskMetrics.rejectedCount).toBe(1);
  });

  it('9. correctly separates "Verified Collections" from "Total Recorded Payments" using the same unified dataset', () => {
    // Setup a mixed controlled dataset:
    // 2 Verified payments: 40,000 + 20,000 = 60,000
    // 2 Pending payments: 15,000 + 25,000 = 40,000
    // 1 Rejected payment: 10,000
    // Total recorded payments = 5 payments, total amount = 1,10,000
    const payments: any[] = [
      {
        id: 'spr-v1',
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        amount_paid: 40000,
        payment_date: '2026-11-01',
        payment_mode: 'UPI',
        verification_status: 'Verified',
        status: 'Approved',
        receipt_number: 'REC-001',
        recorded_by: counsellorId,
        created_at: '2026-11-01T10:00:00Z',
      },
      {
        id: 'spr-v2',
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        amount_paid: 20000,
        payment_date: '2026-11-02',
        payment_mode: 'Bank Transfer',
        verification_status: 'Verified',
        status: 'Approved',
        receipt_number: 'REC-002',
        recorded_by: counsellorId,
        created_at: '2026-11-02T10:00:00Z',
      },
      {
        id: 'spr-p1',
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        amount_paid: 15000,
        payment_date: '2026-11-03',
        payment_mode: 'UPI',
        verification_status: 'Pending Verification',
        recorded_by: counsellorId,
        created_at: '2026-11-03T10:00:00Z',
      },
      {
        id: 'spr-p2',
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        amount_paid: 25000,
        payment_date: '2026-11-04',
        payment_mode: 'UPI',
        verification_status: 'Pending Verification',
        recorded_by: counsellorId,
        created_at: '2026-11-04T10:00:00Z',
      },
      {
        id: 'spr-r1',
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        amount_paid: 10000,
        payment_date: '2026-11-05',
        payment_mode: 'UPI',
        verification_status: 'Rejected',
        status: 'Rejected',
        rejection_reason: 'Invalid UTR',
        recorded_by: counsellorId,
        created_at: '2026-11-05T10:00:00Z',
      },
    ];

    const deskMetrics = computeApprovalsDeskMetrics(payments);

    // Verified Collections card: strictly verified collections only
    expect(deskMetrics.verifiedCount).toBe(2);
    expect(deskMetrics.verifiedAmount).toBe(60000);

    // Pending Approval card: strictly pending approval only
    expect(deskMetrics.pendingCount).toBe(2);
    expect(deskMetrics.pendingAmount).toBe(40000);

    // Rejected / Flagged card
    expect(deskMetrics.rejectedCount).toBe(1);

    // Total Recorded Payments card: exactly 5 count, 1,10,000 amount from the exact same dataset
    expect(deskMetrics.totalCount).toBe(5);
    expect(deskMetrics.totalAmount).toBe(110000);

    // Mathematical identity: Total Recorded = Verified + Pending + Rejected
    expect(deskMetrics.totalCount).toBe(deskMetrics.verifiedCount + deskMetrics.pendingCount + deskMetrics.rejectedCount);
    expect(deskMetrics.totalAmount).toBe(deskMetrics.verifiedAmount + deskMetrics.pendingAmount + 10000);

    // Pending and rejected payments DO NOT inflate verified collections
    expect(deskMetrics.verifiedAmount).not.toBe(deskMetrics.totalAmount);
    expect(deskMetrics.verifiedAmount).toBe(60000);
  });

  it('10. enforces server-side authorization, separation of duties, double-action prevention, and alias resistance', async () => {
    const counsellorUser: UserProfile = {
      id: counsellorId,
      email: 'counsellor@test.com',
      full_name: 'Ananya Counsellor',
      role: 'counsellor',
      tenant_id: 'default',
      is_active: true,
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    };

    const accountantUser: UserProfile = {
      id: accountantId,
      email: 'accountant@test.com',
      full_name: 'Suresh Accountant',
      role: 'accountant',
      tenant_id: 'default',
      is_active: true,
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    };

    const studentUser: UserProfile = {
      id: 'usr-student-01',
      email: 'student@test.com',
      full_name: 'Rahul Verma',
      role: 'student',
      tenant_id: 'default',
      is_active: true,
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    };

    const secondAccountant: UserProfile = {
      id: 'usr-accountant-02',
      email: 'accountant2@test.com',
      full_name: 'Pooja Accountant',
      role: 'accountant',
      tenant_id: 'default',
      is_active: true,
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    };

    store.users = [counsellorUser, accountantUser, studentUser, secondAccountant];

    // Seed student fee
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 60000,
        proposed_fee: 60000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 2,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved fee');

    // 1. Counsellor records a payment (canonical ID: spr-auth-01)
    const payment = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
        payment_date: '2026-11-05',
        transaction_reference: '10013',
        bank_upi_reference: 'BANK-AUTH-999',
      },
      counsellorId,
      'counsellor'
    );
    store.reconcileDualLedgers();

    // A. Unauthenticated request to approve payment -> HTTP 401
    const unauthReq = new NextRequest('http://localhost/api/fees/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', paymentId: payment.id }),
    });
    const unauthRes = await paymentPostRoute(unauthReq);
    expect(unauthRes.status).toBe(401);

    // B. Unauthorized role (counsellor or student) attempting to approve -> HTTP 403
    const counsellorApproveReq = await createSignedRequest(counsellorUser, {
      action: 'approve',
      paymentId: payment.id,
    });
    const counsellorApproveRes = await paymentPostRoute(counsellorApproveReq);
    expect(counsellorApproveRes.status).toBe(403);
    const counsellorErr = await counsellorApproveRes.json();
    expect(counsellorErr.error).toMatch(/Forbidden|Only Accounts/i);

    const studentApproveReq = await createSignedRequest(studentUser, {
      action: 'approve',
      paymentId: payment.id,
    });
    const studentApproveRes = await paymentPostRoute(studentApproveReq);
    expect(studentApproveRes.status).toBe(403);

    // C. Self-Approval Rejection (Separation of duties)
    // Create a payment recorded by accountantUser
    const selfPayment = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 15000,
        payment_mode: 'UPI',
        payment_date: '2026-11-06',
        transaction_reference: '10014',
      },
      accountantId,
      'accountant'
    );
    store.reconcileDualLedgers();

    // accountantUser attempts to approve their own payment -> HTTP 403 Forbidden
    const selfApproveReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: selfPayment.id,
      verification: enteredPaymentVerification(selfPayment.id),
    });
    const selfApproveRes = await paymentPostRoute(selfApproveReq);
    expect(selfApproveRes.status).toBe(403);
    const selfErr = await selfApproveRes.json();
    expect(selfErr.error).toMatch(/Separation of duties violation/i);

    // D. Canonical-ID Alias Bypass Resistance:
    // Submitting 'pay-' prefixed alias cannot bypass self-approval check -> HTTP 403 Forbidden
    const aliasApproveReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: `pay-${selfPayment.id}`,
      verification: enteredPaymentVerification(selfPayment.id),
    });
    const aliasApproveRes = await paymentPostRoute(aliasApproveReq);
    expect(aliasApproveRes.status).toBe(403);
    const aliasErr = await aliasApproveRes.json();
    expect(aliasErr.error).toMatch(/Separation of duties violation/i);

    // Similarly, submitter cannot reject their own payment with canonical alias
    const aliasRejectReq = await createSignedRequest(accountantUser, {
      action: 'reject',
      paymentId: `pay-${selfPayment.id}`,
      reason: 'Self rejection attempt',
    });
    const aliasRejectRes = await paymentPostRoute(aliasRejectReq);
    expect(aliasRejectRes.status).toBe(403);

    // E. Independent authorized accountant CAN approve the counsellor's payment
    const validApproveReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: payment.id,
      verification: enteredPaymentVerification(payment.id),
    });
    const validApproveRes = await paymentPostRoute(validApproveReq);
    expect(validApproveRes.status).toBe(200);

    // F. Already Processed Payments: Cannot be approved or rejected again
    // Re-approving via canonical ID 'spr-...' fails -> HTTP 400
    const reApproveReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: payment.id,
      verification: enteredPaymentVerification(payment.id),
    });
    const reApproveRes = await paymentPostRoute(reApproveReq);
    expect(reApproveRes.status).toBe(400);
    const reApproveErr = await reApproveRes.json();
    expect(reApproveErr.error).toMatch(/already be verified or rejected/i);

    // Re-approving via alias 'pay-spr-...' fails -> HTTP 400
    const reApproveAliasReq = await createSignedRequest(secondAccountant, {
      action: 'approve',
      paymentId: `pay-${payment.id}`,
      verification: enteredPaymentVerification(payment.id),
    });
    const reApproveAliasRes = await paymentPostRoute(reApproveAliasReq);
    expect(reApproveAliasRes.status).toBe(400);

    // Rejecting an already approved payment fails -> HTTP 400
    const rejectApprovedReq = await createSignedRequest(secondAccountant, {
      action: 'reject',
      paymentId: payment.id,
      reason: 'Late rejection attempt',
    });
    const rejectApprovedRes = await paymentPostRoute(rejectApprovedReq);
    expect(rejectApprovedRes.status).toBe(400);
    const rejectApprovedErr = await rejectApprovedRes.json();
    expect(rejectApprovedErr.error).toMatch(/Cannot reject an already verified payment/i);
  });

  it('11. blocks conflicting terminal statuses across API, service, and canonical aliases with zero financial side effects', async () => {
    const accountantUser: UserProfile = {
      id: accountantId,
      email: 'accountant@test.com',
      full_name: 'Suresh Accountant',
      role: 'accountant',
      tenant_id: 'default',
      is_active: true,
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    };

    store.users = [
      {
        id: counsellorId,
        email: 'counsellor@test.com',
        full_name: 'Ananya Counsellor',
        role: 'counsellor',
        tenant_id: 'default',
        is_active: true,
        created_at: '2026-10-12',
        updated_at: '2026-10-12',
      },
      accountantUser,
    ];

    // Seed student fee account
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 60000,
        proposed_fee: 60000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 2,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved fee');

    expect(fee.paid_amount).toBe(0);
    expect(fee.outstanding_amount).toBe(60000);
    expect(store.receipts.length).toBe(0);
    // Initial financial ledger has 1 debit entry for fee assignment, and 0 payment credit entries
    expect(store.studentFinancialLedgers.length).toBe(1);
    expect(store.studentFinancialLedgers.filter((l) => l.entry_type === 'Payment Verified').length).toBe(0);

    // --- CASE 1: status = 'Failed', verification_status = 'Pending Verification' ---
    const failedPayment: StudentPaymentRecord = {
      id: 'spr-fail-01',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 10000,
      payment_date: '2026-11-01',
      payment_mode: 'UPI',
      transaction_reference: '10015',
      status: 'Failed' as any,
      verification_status: 'Pending Verification',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-01T10:00:00Z',
    };
    store.studentPayments.push(failedPayment);
    store.reconcileDualLedgers();

    // 1A. Attempt approve via canonical ID 'spr-fail-01' -> HTTP 400
    const appFailReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: failedPayment.id,
      verification: enteredPaymentVerification(failedPayment.id),
    });
    const appFailRes = await paymentPostRoute(appFailReq);
    expect(appFailRes.status).toBe(400);
    const appFailJson = await appFailRes.json();
    expect(appFailJson.error).toMatch(/Only a payment pending approval can be approved/i);

    // 1B. Attempt approve via canonical alias 'pay-spr-fail-01' -> HTTP 400
    const appFailAliasReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: 'pay-' + failedPayment.id,
      verification: enteredPaymentVerification(failedPayment.id),
    });
    const appFailAliasRes = await paymentPostRoute(appFailAliasReq);
    expect(appFailAliasRes.status).toBe(400);

    // 1C. Attempt approve directly via service -> throws
    expect(() =>
      feeWorkflowService.verifyPayment(
        failedPayment.id,
        accountantId,
        'Trying to verify failed payment',
        enteredPaymentVerification(failedPayment.id)
      )
    ).toThrow(/Only a payment pending approval can be approved/i);

    // 1D. Attempt reject via canonical ID and alias -> HTTP 400 / throws
    const rejFailReq = await createSignedRequest(accountantUser, {
      action: 'reject',
      paymentId: failedPayment.id,
      reason: 'Trying to reject failed payment',
    });
    const rejFailRes = await paymentPostRoute(rejFailReq);
    expect(rejFailRes.status).toBe(400);
    expect(() =>
      feeWorkflowService.rejectPayment(failedPayment.id, accountantId, 'Reason')
    ).toThrow(/Cannot reject an already verified payment/i);

    // --- CASE 2: status = 'Refunded', verification_status = 'Pending Verification' ---
    const refundedPayment: StudentPaymentRecord = {
      id: 'spr-ref-01',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 12000,
      payment_date: '2026-11-02',
      payment_mode: 'UPI',
      transaction_reference: '10016',
      status: 'Refunded' as any,
      verification_status: 'Pending Verification',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-02T10:00:00Z',
    };
    store.studentPayments.push(refundedPayment);
    store.reconcileDualLedgers();

    // 2A. Attempt approve via canonical ID and alias -> HTTP 400
    const appRefReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: refundedPayment.id,
      verification: enteredPaymentVerification(refundedPayment.id),
    });
    const appRefRes = await paymentPostRoute(appRefReq);
    expect(appRefRes.status).toBe(400);

    const appRefAliasReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: 'pay-' + refundedPayment.id,
      verification: enteredPaymentVerification(refundedPayment.id),
    });
    const appRefAliasRes = await paymentPostRoute(appRefAliasReq);
    expect(appRefAliasRes.status).toBe(400);

    expect(() =>
      feeWorkflowService.verifyPayment(
        refundedPayment.id,
        accountantId,
        'Notes',
        enteredPaymentVerification(refundedPayment.id)
      )
    ).toThrow(/Only a payment pending approval can be approved/i);

    // --- CASE 3: status = 'Void', verification_status = 'Pending Verification' ---
    const voidPayment: StudentPaymentRecord = {
      id: 'spr-void-01',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 8000,
      payment_date: '2026-11-03',
      payment_mode: 'UPI',
      transaction_reference: '10017',
      status: 'Void' as any,
      verification_status: 'Pending Verification',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-03T10:00:00Z',
    };
    store.studentPayments.push(voidPayment);
    store.reconcileDualLedgers();

    const appVoidReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: voidPayment.id,
      verification: enteredPaymentVerification(voidPayment.id),
    });
    const appVoidRes = await paymentPostRoute(appVoidReq);
    expect(appVoidRes.status).toBe(400);

    const appVoidAliasReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: 'pay-' + voidPayment.id,
      verification: enteredPaymentVerification(voidPayment.id),
    });
    const appVoidAliasRes = await paymentPostRoute(appVoidAliasReq);
    expect(appVoidAliasRes.status).toBe(400);

    expect(() =>
      feeWorkflowService.verifyPayment(
        voidPayment.id,
        accountantId,
        'Notes',
        enteredPaymentVerification(voidPayment.id)
      )
    ).toThrow(/Only a payment pending approval can be approved/i);

    // --- CASE 4: Linked receipt is 'Void', payment verification_status = 'Pending Verification' ---
    const voidReceiptPayment: StudentPaymentRecord = {
      id: 'spr-voidrcpt-01',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 14000,
      payment_date: '2026-11-04',
      payment_mode: 'UPI',
      transaction_reference: '10018',
      status: 'Pending Approval',
      verification_status: 'Pending Verification',
      receipt_number: 'REC-VOID-01',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-04T10:00:00Z',
    };
    store.studentPayments.push(voidReceiptPayment);
    store.receipts.push({
      id: 'rcpt-void-01',
      receipt_number: 'REC-VOID-01',
      payment_id: voidReceiptPayment.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      course_name: 'SAP-FICO',
      payment_amount: 14000,
      payment_mode: 'UPI',
      payment_date: '2026-11-04',
      remaining_balance: 46000,
      authorized_by: accountantId,
      institute_name: 'ERP Hub',
      institute_address: 'Main St',
      institute_phone: '1234567890',
      institute_gst: 'GST123',
      created_at: '2026-11-04T10:00:00Z',
      status: 'Void',
    });
    store.reconcileDualLedgers();

    const appVoidRcptReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: voidReceiptPayment.id,
      verification: enteredPaymentVerification(voidReceiptPayment.id),
    });
    const appVoidRcptRes = await paymentPostRoute(appVoidRcptReq);
    expect(appVoidRcptRes.status).toBe(400);

    const appVoidRcptAliasReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: 'pay-' + voidReceiptPayment.id,
      verification: enteredPaymentVerification(voidReceiptPayment.id),
    });
    const appVoidRcptAliasRes = await paymentPostRoute(appVoidRcptAliasReq);
    expect(appVoidRcptAliasRes.status).toBe(400);

    expect(() =>
      feeWorkflowService.verifyPayment(
        voidReceiptPayment.id,
        accountantId,
        'Notes',
        enteredPaymentVerification(voidReceiptPayment.id)
      )
    ).toThrow(/Only a payment pending approval can be approved/i);

    // --- CASE 5: Modern record Pending, but legacy mirror is 'Failed' ---
    const mirrorPayment: StudentPaymentRecord = {
      id: 'spr-mirror-01',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 11000,
      payment_date: '2026-11-05',
      payment_mode: 'UPI',
      transaction_reference: '10019',
      status: 'Pending Approval',
      verification_status: 'Pending Verification',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      receipt_number: 'REC-FAILED-01',
      created_at: '2026-11-05T10:00:00Z',
    };
    store.studentPayments.push(mirrorPayment);
    // Legacy mirror in store.payments with status 'Failed'
    const legacyFailMirror: Payment = {
      id: 'pay-' + mirrorPayment.id,
      tenant_id: 'default',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_account_id: fee.id,
      course_id: 'crs-fico',
      amount: 11000,
      payment_date: '2026-11-05',
      payment_mode: 'UPI',
      status: 'Failed',
      collected_by: counsellorId,
      receipt_number: 'REC-FAILED-01',
      created_at: '2026-11-05T10:00:00Z',
    };
    store.payments.push(legacyFailMirror);

    const appMirrorReq = await createSignedRequest(accountantUser, {
      action: 'approve',
      paymentId: mirrorPayment.id,
      verification: enteredPaymentVerification(mirrorPayment.id),
    });
    const appMirrorRes = await paymentPostRoute(appMirrorReq);
    expect(appMirrorRes.status).toBe(400);

    expect(() =>
      feeWorkflowService.verifyPayment(
        mirrorPayment.id,
        accountantId,
        'Notes',
        enteredPaymentVerification(mirrorPayment.id)
      )
    ).toThrow(/Only a payment pending approval can be approved/i);

    // --- ZERO SIDE EFFECT VERIFICATION FOR ALL BLOCKED CONFLICTS ---
    // Zero official receipts generated (only the 1 pre-existing void receipt exists)
    expect(store.receipts.length).toBe(1);
    expect(store.receipts[0].id).toBe('rcpt-void-01');

    // Fee balance remains completely unchanged
    const refreshedFee = feeWorkflowService.getStudentFeeById(fee.id)!;
    expect(refreshedFee.paid_amount).toBe(0);
    expect(refreshedFee.outstanding_amount).toBe(60000);

    // Financial ledgers remain unchanged: zero payment credit entries posted
    expect(store.studentFinancialLedgers.length).toBe(1);
    expect(store.studentFinancialLedgers.filter((l) => l.entry_type === 'Payment Verified').length).toBe(0);

    // --- CASE 6: Legitimate rejection of a genuine pending payment causes ZERO balance or receipt changes ---
    const genuinePending = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
        payment_date: '2026-11-06',
        transaction_reference: '10020',
      },
      counsellorId,
      'counsellor'
    );
    store.reconcileDualLedgers();

    // Verify initial balance before rejection
    expect(refreshedFee.paid_amount).toBe(0);
    expect(refreshedFee.outstanding_amount).toBe(60000);

    // Accountant rejects the genuine pending payment via API
    const legitimateRejectReq = await createSignedRequest(accountantUser, {
      action: 'reject',
      paymentId: genuinePending.id,
      reason: 'Invalid UTR reference on screenshot',
    });
    const legitimateRejectRes = await paymentPostRoute(legitimateRejectReq);
    expect(legitimateRejectRes.status).toBe(200);

    // Zero receipts created by rejection
    expect(store.receipts.length).toBe(1); // Still only the void receipt from Case 4

    // Student fee balances are unchanged
    const afterRejectFee = feeWorkflowService.getStudentFeeById(fee.id)!;
    expect(afterRejectFee.paid_amount).toBe(0);
    expect(afterRejectFee.outstanding_amount).toBe(60000);

    // No payment credit financial ledgers posted
    expect(store.studentFinancialLedgers.length).toBe(1);
    expect(store.studentFinancialLedgers.filter((l) => l.entry_type === 'Payment Verified').length).toBe(0);

    // Confirm payment status updated to Rejected
    const rejectedRecord = store.studentPayments.find((p) => p.id === genuinePending.id)!;
    expect(rejectedRecord.status).toBe('Rejected');
    expect(rejectedRecord.verification_status).toBe('Rejected');
    expect(rejectedRecord.rejection_reason).toBe('Invalid UTR reference on screenshot');

    // Confirm legacy mirror also updated
    const rejectedLegacy = store.payments.find((p) => p.id === 'pay-' + genuinePending.id || p.id === genuinePending.id);
    expect(rejectedLegacy?.status).toBe('Failed');
  });

});
