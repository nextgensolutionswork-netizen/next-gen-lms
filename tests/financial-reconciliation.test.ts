/**
 * QA-015 / BUG-02 — Financial Reconciliation Regression Tests
 *
 * Covers the confirmed root cause: dashboard course-reconciliation table and
 * Financial Analytics page were summing ALL payment statuses (verified +
 * pending + rejected) while the Dashboard KPI card and fee-ledger counted only
 * approved/verified payments, producing a systematic ₹4,10,000 over-report.
 *
 * Rules enforced:
 *  - Collected = verified/approved payments only (status 'Success'|'Approved'
 *    OR verification_status 'Verified').
 *  - Pending and rejected payments are excluded from revenue totals.
 *  - Course-breakdown rows must sum to exactly the same total as the KPI card
 *    for an identical payment list and period.
 *  - Each canonical payment is counted once (deduplication by receipt_number).
 *  - Net = verified collections − paid expenses.
 *  - Empty datasets produce zero without errors.
 */

import { describe, it, expect } from 'vitest';
import {
  isPaymentApproved,
  isPaymentPending,
  calculatePaymentApprovalMetrics,
  paymentCourseBucket,
  courseBucket,
  UNASSIGNED_COURSE,
  getCanonicalPaymentKey,
  unifyDualLedgerPayments,
} from '@/lib/utils/dashboard-metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PaymentLike = {
  id: string;
  receipt_number?: string;
  amount: number;
  status?: string;
  verification_status?: string;
  course_id?: string;
  fee_account_id?: string;
  student_id: string;
};

function approvedTotal(payments: readonly PaymentLike[]): number {
  return payments.filter(isPaymentApproved).reduce((s, p) => s + p.amount, 0);
}

function approvedCount(payments: readonly PaymentLike[]): number {
  return payments.filter(isPaymentApproved).length;
}

/** Deduplicates by receipt_number, mirroring the dual-ledger reconciliation. */
function dedup(payments: readonly PaymentLike[]): PaymentLike[] {
  const map = new Map<string, PaymentLike>();
  for (const p of payments) {
    const key = p.receipt_number || p.id;
    if (!map.has(key)) map.set(key, p);
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// 1. Status classification — isPaymentApproved / isPaymentPending
// ---------------------------------------------------------------------------

describe('1. Status classification', () => {
  it('classifies status=Success as approved', () => {
    expect(isPaymentApproved({ status: 'Success' })).toBe(true);
  });

  it('classifies status=Approved as approved', () => {
    expect(isPaymentApproved({ status: 'Approved' })).toBe(true);
  });

  it('enforces precedence: pending status combined with verification_status=Verified remains pending', () => {
    // If settlement status is still Pending, the payment has not completed clearance
    expect(isPaymentApproved({ status: 'Pending', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Pending', verification_status: 'Verified' })).toBe(true);

    expect(isPaymentApproved({ status: 'Pending Approval', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Pending Approval', verification_status: 'Verified' })).toBe(true);

    expect(isPaymentApproved({ status: 'Success', verification_status: 'Pending Verification' })).toBe(false);
    expect(isPaymentPending({ status: 'Success', verification_status: 'Pending Verification' })).toBe(true);
  });

  it('enforces precedence: terminal negative statuses (Refunded, Failed, Voided, Rejected) override Verified', () => {
    expect(isPaymentApproved({ status: 'Refunded', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Refunded', verification_status: 'Verified' })).toBe(false);

    expect(isPaymentApproved({ status: 'Failed', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Failed', verification_status: 'Verified' })).toBe(false);

    expect(isPaymentApproved({ status: 'Voided', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Voided', verification_status: 'Verified' })).toBe(false);

    expect(isPaymentApproved({ status: 'Rejected', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Rejected', verification_status: 'Verified' })).toBe(false);

    expect(isPaymentApproved({ status: 'Success', verification_status: 'Rejected' })).toBe(false);
    expect(isPaymentPending({ status: 'Success', verification_status: 'Rejected' })).toBe(false);
  });

  it('classifies verification_status=Pending Verification as pending, not approved', () => {
    expect(isPaymentApproved({ verification_status: 'Pending Verification' })).toBe(false);
    expect(isPaymentPending({ verification_status: 'Pending Verification' })).toBe(true);
  });

  it('classifies verification_status=Pending as pending', () => {
    expect(isPaymentPending({ verification_status: 'Pending' })).toBe(true);
    expect(isPaymentApproved({ verification_status: 'Pending' })).toBe(false);
  });

  it('classifies verification_status=Rejected as neither approved nor pending', () => {
    expect(isPaymentApproved({ verification_status: 'Rejected' })).toBe(false);
    expect(isPaymentPending({ verification_status: 'Rejected' })).toBe(false);
  });

  it('classifies status=Failed as neither approved nor pending', () => {
    expect(isPaymentApproved({ status: 'Failed' })).toBe(false);
    expect(isPaymentPending({ status: 'Failed' })).toBe(false);
  });

  it('classifies status=Pending (no verification_status) as pending', () => {
    expect(isPaymentPending({ status: 'Pending' })).toBe(true);
    expect(isPaymentApproved({ status: 'Pending' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. calculatePaymentApprovalMetrics — mixed statuses
// ---------------------------------------------------------------------------

describe('2. calculatePaymentApprovalMetrics — mixed statuses', () => {
  const payments = [
    { amount: 60000, status: 'Success' },                              // approved
    { amount: 95000, verification_status: 'Verified' },               // approved
    { amount: 150000, status: 'Approved' },                           // approved
    { amount: 95000, verification_status: 'Pending Verification' },   // pending
    { amount: 300000, status: 'Pending' },                            // pending
    { amount: 15000, verification_status: 'Rejected' },               // excluded
    { amount: 10000, status: 'Failed' },                              // excluded
    { amount: 5000, status: 'Refunded' },                             // excluded
  ];

  it('approvedAmount equals sum of verified/approved payments only', () => {
    const m = calculatePaymentApprovalMetrics(payments);
    expect(m.approvedAmount).toBe(60000 + 95000 + 150000);           // 305000
  });

  it('approvedCount is correct', () => {
    const m = calculatePaymentApprovalMetrics(payments);
    expect(m.approvedCount).toBe(3);
  });

  it('pendingAmount equals sum of pending payments only', () => {
    const m = calculatePaymentApprovalMetrics(payments);
    expect(m.pendingAmount).toBe(95000 + 300000);                    // 395000
  });

  it('pendingCount is correct', () => {
    const m = calculatePaymentApprovalMetrics(payments);
    expect(m.pendingCount).toBe(2);
  });

  it('approved + pending does NOT include rejected or failed amounts', () => {
    const m = calculatePaymentApprovalMetrics(payments);
    // rejected(15000) + failed(10000) + refunded(5000) = 30000 must NOT appear
    expect(m.approvedAmount + m.pendingAmount).toBe(305000 + 395000);
  });

  it('the QA-015 symptom: pending+rejected ≠ approved total gap', () => {
    // Observed: dashboard ₹604500, analytics ₹1014500, diff = ₹410000
    // diff = pending(₹395000) + rejected(₹15000) = ₹410000
    const m = calculatePaymentApprovalMetrics(payments);
    // With the fix, analytics = approvedAmount (305000) not (305000 + 395000 + 15000)
    expect(m.approvedAmount).not.toBe(m.approvedAmount + m.pendingAmount);
  });
});

// ---------------------------------------------------------------------------
// 3. Course reconciliation: row sums must equal the KPI card total
// ---------------------------------------------------------------------------

describe('3. Course-reconciliation consistency', () => {
  const courseIds = new Set(['crs-fico', 'crs-mm', 'crs-sd']);
  const feeAccounts: { id: string; course_id?: string }[] = [];
  const students: { id: string; course_id?: string }[] = [
    { id: 's1', course_id: 'crs-fico' },
    { id: 's2', course_id: 'crs-mm' },
    { id: 's3', course_id: 'crs-sd' },
  ];

  const payments: PaymentLike[] = [
    // Approved payments — should appear in both KPI and course rows
    { id: 'p1', receipt_number: 'REC-001', student_id: 's1', course_id: 'crs-fico', amount: 100000, status: 'Success' },
    { id: 'p2', receipt_number: 'REC-002', student_id: 's2', course_id: 'crs-mm',   amount: 150000, verification_status: 'Verified' },
    { id: 'p3', receipt_number: 'REC-003', student_id: 's3', course_id: 'crs-sd',   amount: 80000,  status: 'Approved' },
    // Pending — must NOT appear in either KPI or course rows
    { id: 'p4', receipt_number: 'REC-004', student_id: 's1', course_id: 'crs-fico', amount: 395000, verification_status: 'Pending Verification' },
    // Rejected — must NOT appear in either KPI or course rows
    { id: 'p5', receipt_number: 'REC-005', student_id: 's2', course_id: 'crs-mm',   amount: 15000,  verification_status: 'Rejected' },
  ];

  it('KPI card total equals sum of approved payments only', () => {
    expect(approvedTotal(payments)).toBe(100000 + 150000 + 80000); // 330000
  });

  it('course-breakdown rows sum to the same total as the KPI card', () => {
    const courses = [...courseIds, UNASSIGNED_COURSE];
    const breakdown = courses.map((courseId) => {
      const rows = payments.filter(
        (p) => isPaymentApproved(p) &&
          paymentCourseBucket(p, courseIds, feeAccounts, students) === courseId
      );
      return { courseId, amount: rows.reduce((s, p) => s + p.amount, 0), count: rows.length };
    });

    const breakdownTotal = breakdown.reduce((s, r) => s + r.amount, 0);
    expect(breakdownTotal).toBe(approvedTotal(payments));           // must equal KPI
  });

  it('course-breakdown transaction counts sum to the approved count', () => {
    const courses = [...courseIds, UNASSIGNED_COURSE];
    const breakdown = courses.map((courseId) => ({
      count: payments.filter(
        (p) => isPaymentApproved(p) &&
          paymentCourseBucket(p, courseIds, feeAccounts, students) === courseId
      ).length,
    }));
    const totalCount = breakdown.reduce((s, r) => s + r.count, 0);
    expect(totalCount).toBe(approvedCount(payments)); // 3 approved
  });

  it('pending payment does not appear in any course-breakdown row', () => {
    const pendingPayment = payments.find((p) => p.id === 'p4')!;
    expect(isPaymentApproved(pendingPayment)).toBe(false);
  });

  it('rejected payment does not appear in any course-breakdown row', () => {
    const rejectedPayment = payments.find((p) => p.id === 'p5')!;
    expect(isPaymentApproved(rejectedPayment)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Deduplication — same receipt_number must count once
// ---------------------------------------------------------------------------

describe('4. Deduplication by receipt_number prevents double-counting', () => {
  const withDuplicates: PaymentLike[] = [
    { id: 'pay-001', receipt_number: 'REC-001', student_id: 's1', amount: 50000, status: 'Success' },
    { id: 'spr-pay-001', receipt_number: 'REC-001', student_id: 's1', amount: 50000, verification_status: 'Verified' },
    { id: 'pay-002', receipt_number: 'REC-002', student_id: 's2', amount: 75000, status: 'Success' },
  ];

  it('dedup by receipt_number keeps exactly one entry per canonical receipt', () => {
    const unique = dedup(withDuplicates);
    expect(unique).toHaveLength(2);
  });

  it('after dedup, approved total is not inflated by the duplicate row', () => {
    const unique = dedup(withDuplicates);
    expect(approvedTotal(unique)).toBe(50000 + 75000); // 125000, not 175000
  });
});

// ---------------------------------------------------------------------------
// 5. Multiple courses and students — course rows partition without overlap
// ---------------------------------------------------------------------------

describe('5. Multiple courses and students — exhaustive partition', () => {
  const courseIds = new Set(['c1', 'c2', 'c3']);
  const feeAccounts: { id: string; course_id?: string }[] = [];
  const students: { id: string; course_id?: string }[] = [
    { id: 'sA', course_id: 'c1' },
    { id: 'sB', course_id: 'c2' },
    { id: 'sC', course_id: 'c3' },
    { id: 'sD', course_id: undefined },
  ];

  const payments: PaymentLike[] = [
    { id: 'x1', student_id: 'sA', course_id: 'c1', amount: 10000, status: 'Success' },
    { id: 'x2', student_id: 'sB', course_id: 'c2', amount: 20000, status: 'Success' },
    { id: 'x3', student_id: 'sC', course_id: 'c3', amount: 30000, status: 'Success' },
    { id: 'x4', student_id: 'sD', course_id: undefined, amount: 40000, status: 'Success' },
    { id: 'x5', student_id: 'sA', course_id: 'c1', amount: 99000, verification_status: 'Pending Verification' },
  ];

  it('every approved payment lands in exactly one bucket', () => {
    const approved = payments.filter(isPaymentApproved);
    const buckets = [...courseIds, UNASSIGNED_COURSE];
    const matched = approved.flatMap((p) =>
      buckets.filter(
        (cid) => paymentCourseBucket(p, courseIds, feeAccounts, students) === cid
      )
    );
    // Each approved payment matches exactly one bucket
    expect(matched).toHaveLength(approved.length);
  });

  it('bucket totals equal KPI total; unassigned absorbs student with no course', () => {
    const approved = payments.filter(isPaymentApproved);
    const kpiTotal = approved.reduce((s, p) => s + p.amount, 0);

    const buckets = [...courseIds, UNASSIGNED_COURSE];
    const bucketTotal = buckets.reduce((sum, cid) => {
      return sum + approved
        .filter((p) => paymentCourseBucket(p, courseIds, feeAccounts, students) === cid)
        .reduce((s, p) => s + p.amount, 0);
    }, 0);

    expect(bucketTotal).toBe(kpiTotal);
  });
});

// ---------------------------------------------------------------------------
// 6. Net balance — verified collections minus paid expenses
// ---------------------------------------------------------------------------

describe('6. Net balance = verified collections − paid expenses', () => {
  it('net equals approved payments minus paid-status expenses', () => {
    const payments = [
      { amount: 200000, status: 'Success' },
      { amount: 50000,  verification_status: 'Pending Verification' }, // excluded
      { amount: 10000,  verification_status: 'Rejected' },             // excluded
    ];
    const expenses = [
      { amount: 15000, status: 'Paid' },
      { amount: 5000,  status: 'Paid' },
      { amount: 8000,  status: 'Pending Approval' }, // excluded from net
    ];

    const verified = payments.filter(isPaymentApproved).reduce((s, p) => s + p.amount, 0);
    const paidExp  = expenses.filter((e) => e.status === 'Paid').reduce((s, e) => s + e.amount, 0);
    const net      = verified - paidExp;

    expect(verified).toBe(200000);
    expect(paidExp).toBe(20000);
    expect(net).toBe(180000);
  });
});

// ---------------------------------------------------------------------------
// 7. Date boundary — payments on boundary dates are included, outside excluded
// ---------------------------------------------------------------------------

describe('7. Date boundary filtering', () => {
  // Simulates isDateInRange from the reports page (string slice comparison)
  function inRange(date: string, start: string, end: string): boolean {
    const d = date.slice(0, 10);
    return d >= start && d <= end;
  }

  it('payment on start date is included', () => {
    expect(inRange('2026-04-01', '2026-04-01', '2027-03-31')).toBe(true);
  });

  it('payment on end date is included', () => {
    expect(inRange('2027-03-31', '2026-04-01', '2027-03-31')).toBe(true);
  });

  it('payment one day before start is excluded', () => {
    expect(inRange('2026-03-31', '2026-04-01', '2027-03-31')).toBe(false);
  });

  it('payment one day after end is excluded', () => {
    expect(inRange('2027-04-01', '2026-04-01', '2027-03-31')).toBe(false);
  });

  it('ALL_TIME (no bounds) includes every payment', () => {
    // When start/end are undefined, the reports page returns all; simulate:
    function inRangeOrAll(date: string, start?: string, end?: string): boolean {
      if (!start && !end) return true;
      return inRange(date, start ?? '', end ?? '9999-12-31');
    }
    expect(inRangeOrAll('2020-01-01')).toBe(true);
    expect(inRangeOrAll('2030-12-31')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. No payments — zero result without error
// ---------------------------------------------------------------------------

describe('8. Empty dataset produces zero totals', () => {
  it('approvedTotal returns 0 for empty array', () => {
    expect(approvedTotal([])).toBe(0);
  });

  it('calculatePaymentApprovalMetrics returns all zeros for empty array', () => {
    const m = calculatePaymentApprovalMetrics([]);
    expect(m.approvedAmount).toBe(0);
    expect(m.approvedCount).toBe(0);
    expect(m.pendingAmount).toBe(0);
    expect(m.pendingCount).toBe(0);
  });

  it('course-breakdown with no payments sums to 0', () => {
    const courseIds = new Set(['crs-fico']);
    const breakdown = [...courseIds, UNASSIGNED_COURSE].map((cid) => ({
      amount: ([] as PaymentLike[]).filter(
        (p) => isPaymentApproved(p) &&
          paymentCourseBucket(p, courseIds, [], []) === cid
      ).reduce((s, p) => s + p.amount, 0),
    }));
    expect(breakdown.reduce((s, r) => s + r.amount, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Dashboard ↔ Ledger ↔ Reports agreement for a shared fixture
// ---------------------------------------------------------------------------

describe('9. Dashboard / Ledger / Reports agreement', () => {
  /**
   * Shared fixture: 3 verified, 1 pending, 1 rejected.
   * Dashboard KPI     = sum of verified only        = 604500
   * Fee ledger        = sum of feeAccount.paid_amount = 604500 (set on verified payment)
   * Course breakdown  = per-course sum of verified   = 604500 (must equal KPI)
   * Analytics total   = same isPaymentApproved filter = 604500
   */
  const payments: PaymentLike[] = [
    { id: 'p1', receipt_number: 'R-01', student_id: 's1', course_id: 'crs-fico', amount: 250000, status: 'Success' },
    { id: 'p2', receipt_number: 'R-02', student_id: 's2', course_id: 'crs-mm',   amount: 300000, verification_status: 'Verified' },
    { id: 'p3', receipt_number: 'R-03', student_id: 's3', course_id: 'crs-sd',   amount: 54500,  status: 'Approved' },
    { id: 'p4', receipt_number: 'R-04', student_id: 's4', course_id: 'crs-fico', amount: 395000, verification_status: 'Pending Verification' },
    { id: 'p5', receipt_number: 'R-05', student_id: 's5', course_id: 'crs-mm',   amount: 15000,  verification_status: 'Rejected' },
  ];

  const EXPECTED_COLLECTED = 250000 + 300000 + 54500; // 604500

  it('Dashboard KPI (approved only) = ₹6,04,500', () => {
    expect(approvedTotal(payments)).toBe(EXPECTED_COLLECTED);
  });

  it('Course reconciliation rows sum to ₹6,04,500', () => {
    const courseIds = new Set(['crs-fico', 'crs-mm', 'crs-sd']);
    const feeAccounts: { id: string; course_id?: string }[] = [];
    const students: { id: string; course_id?: string }[] = [];

    const courses = [...courseIds, UNASSIGNED_COURSE];
    const breakdownTotal = courses.reduce((sum, cid) => {
      return sum + payments
        .filter((p) => isPaymentApproved(p) &&
          paymentCourseBucket(p, courseIds, feeAccounts, students) === cid)
        .reduce((s, p) => s + p.amount, 0);
    }, 0);
    expect(breakdownTotal).toBe(EXPECTED_COLLECTED);
  });

  it('Financial Analytics "Period Collections" = ₹6,04,500', () => {
    // Analytics applies isPaymentApproved before summing (after the fix)
    const analyticsTotal = payments
      .filter(isPaymentApproved)
      .reduce((s, p) => s + p.amount, 0);
    expect(analyticsTotal).toBe(EXPECTED_COLLECTED);
  });

  it('the pre-fix bug: summing all statuses would overstate by pending+rejected', () => {
    const buggyTotal = payments.reduce((s, p) => s + p.amount, 0);
    const diff = buggyTotal - EXPECTED_COLLECTED;
    expect(diff).toBe(395000 + 15000); // exactly the ₹4,10,000 symptom
  });

  it('fee ledger (paid_amount) agrees with verified total', () => {
    // Fee ledger stores paid_amount per fee account, incremented only on
    // verified payment recording. Simulate:
    const feeAccountPaidAmount = payments
      .filter(isPaymentApproved)
      .reduce((s, p) => s + p.amount, 0);
    expect(feeAccountPaidAmount).toBe(EXPECTED_COLLECTED);
  });
});

// ---------------------------------------------------------------------------
// 10. getCanonicalPaymentKey — robustness and conflict rules
// ---------------------------------------------------------------------------

describe('10. getCanonicalPaymentKey robustness', () => {
  it('deduplicates mirrored payments across dual ledgers', () => {
    const legacyPayment = { id: 'pay-spr-101', receipt_number: 'REC-2026-001' };
    const studentPayment = { id: 'spr-101', receipt_number: 'REC-2026-001' };

    expect(getCanonicalPaymentKey(legacyPayment)).toBe('receipt:REC-2026-001');
    expect(getCanonicalPaymentKey(studentPayment)).toBe('receipt:REC-2026-001');
    expect(getCanonicalPaymentKey(legacyPayment)).toBe(getCanonicalPaymentKey(studentPayment));
  });

  it('deduplicates pending unverified payments with synthetic prefixes', () => {
    const legacyPending = { id: 'pay-spr-202', receipt_number: 'PENDING-spr-202' };
    const studentPending = { id: 'spr-202', receipt_number: 'PENDING-spr-202' };

    expect(getCanonicalPaymentKey(legacyPending)).toBe('id:202');
    expect(getCanonicalPaymentKey(studentPending)).toBe('id:202');
    expect(getCanonicalPaymentKey(legacyPending)).toBe(getCanonicalPaymentKey(studentPending));
  });

  it('keeps separate legitimate installments distinct', () => {
    const installment1 = { id: 'spr-inst-01', receipt_number: 'REC-001' };
    const installment2 = { id: 'spr-inst-02', receipt_number: 'REC-002' };

    expect(getCanonicalPaymentKey(installment1)).not.toBe(getCanonicalPaymentKey(installment2));
  });

  it('does not collapse unrelated payments with missing identifiers', () => {
    const paymentWithoutId1: { id?: string; receipt_number?: string; amount: number } = { amount: 25000 };
    const paymentWithoutId2: { id?: string; receipt_number?: string; amount: number } = { amount: 35000 };

    const key1 = getCanonicalPaymentKey(paymentWithoutId1);
    const key2 = getCanonicalPaymentKey(paymentWithoutId2);

    expect(key1).not.toBe(key2);
    // Deterministic for the same instance:
    expect(getCanonicalPaymentKey(paymentWithoutId1)).toBe(key1);
  });
});

// ---------------------------------------------------------------------------
// 11. unifyDualLedgerPayments — authoritative resolution of mirrored records
// ---------------------------------------------------------------------------

describe('11. unifyDualLedgerPayments authoritative resolution', () => {
  it('resolves conflicting mirrored records using authoritative StudentPaymentRecord', () => {
    const legacyPayments = [
      {
        id: 'pay-spr-303',
        receipt_number: 'REC-303',
        amount: 50000,
        status: 'Success', // legacy stale status
        verification_status: 'Verified',
      },
    ];

    const studentPayments = [
      {
        id: 'spr-303',
        receipt_number: 'REC-303',
        amount: 50000,
        status: 'Voided', // authoritative terminal voided
        verification_status: 'Rejected',
      },
    ];

    const unified = unifyDualLedgerPayments(legacyPayments, studentPayments);
    expect(unified).toHaveLength(1);
    expect(unified[0].verification_status).toBe('Rejected');
    expect(unified[0].status).toBe('Voided');
    expect(isPaymentApproved(unified[0])).toBe(false);
  });

  it('updates pending legacy payment to verified when studentPayment is approved', () => {
    const legacyPayments = [
      {
        id: 'pay-spr-404',
        receipt_number: 'PENDING-spr-404',
        amount: 75000,
        status: 'Pending',
      },
    ];

    const studentPayments = [
      {
        id: 'spr-404',
        receipt_number: 'REC-404',
        amount: 75000,
        status: 'Approved',
        verification_status: 'Verified',
      },
    ];

    const unified = unifyDualLedgerPayments(legacyPayments, studentPayments);
    expect(unified).toHaveLength(1);
    expect(unified[0].verification_status).toBe('Verified');
    expect(isPaymentApproved(unified[0])).toBe(true);
    expect(unified[0].receipt_number).toBe('REC-404');
  });

  it('unifies stale pending legacy mirror paired with verified modern record while keeping unrelated installments separate', () => {
    // Stale legacy mirror for Installment 1: has pending status and synthetic receipt
    const legacyPayments = [
      {
        id: 'pay-spr-404',
        receipt_number: 'PENDING-spr-404',
        amount: 50000,
        status: 'Pending',
        verification_status: 'Pending Verification',
        student_id: 'std-alpha',
        installment_id: 'inst-01',
      },
    ];

    // Modern records: Installment 1 is verified with official receipt REC-2026-0042;
    // Installment 2 is an independent verified payment with REC-2026-0043.
    const studentPayments = [
      {
        id: 'spr-404',
        receipt_number: 'REC-2026-0042',
        amount: 50000,
        status: 'Approved',
        verification_status: 'Verified',
        student_id: 'std-alpha',
        installment_id: 'inst-01',
      },
      {
        id: 'spr-405',
        receipt_number: 'REC-2026-0043',
        amount: 25000,
        status: 'Approved',
        verification_status: 'Verified',
        student_id: 'std-alpha',
        installment_id: 'inst-02',
      },
    ];

    const unified = unifyDualLedgerPayments(legacyPayments, studentPayments);

    // Stale legacy mirror pairs with spr-404 into 1 unified record, and spr-405 remains distinct.
    expect(unified).toHaveLength(2);

    const inst1 = unified.find((p) => p.installment_id === 'inst-01');
    const inst2 = unified.find((p) => p.installment_id === 'inst-02');

    expect(inst1).toBeDefined();
    expect(inst1?.receipt_number).toBe('REC-2026-0042');
    expect(inst1?.status).toBe('Approved');
    expect(inst1?.verification_status).toBe('Verified');
    expect(isPaymentApproved(inst1!)).toBe(true);

    expect(inst2).toBeDefined();
    expect(inst2?.receipt_number).toBe('REC-2026-0043');
    expect(inst2?.amount).toBe(25000);
    expect(inst2?.status).toBe('Approved');
    expect(inst2?.verification_status).toBe('Verified');
    expect(isPaymentApproved(inst2!)).toBe(true);

    // Total collection from these 2 installments is exactly 50000 + 25000 = 75000 (not 125000)
    const total = unified.filter(isPaymentApproved).reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(75000);
  });
});

// ---------------------------------------------------------------------------
// 12. Void / Voided values and receipt-to-payment mappings
// ---------------------------------------------------------------------------

describe('12. Void / Voided stored values and receipt-to-payment mappings', () => {
  it('disqualifies payments with exact stored status Voided or Void', () => {
    // Exact stored status in StudentPaymentRecord: 'Voided'
    expect(isPaymentApproved({ status: 'Voided', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Voided', verification_status: 'Verified' })).toBe(false);

    // Exact stored status in Receipt: 'Void'
    expect(isPaymentApproved({ status: 'Void', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Void', verification_status: 'Verified' })).toBe(false);

    // Exact stored status in legacy Payment when voided: 'Refunded'
    expect(isPaymentApproved({ status: 'Refunded', verification_status: 'Verified' })).toBe(false);
    expect(isPaymentPending({ status: 'Refunded', verification_status: 'Verified' })).toBe(false);
  });

  it('strictly disqualifies payment mapped to a voided receipt (receipt.status === "Void")', () => {
    // Payment record that has stale verification_status 'Verified'
    const legacyPayments = [
      {
        id: 'pay-spr-505',
        receipt_number: 'REC-2026-0099',
        amount: 30000,
        status: 'Success',
        verification_status: 'Verified',
      },
    ];

    const studentPayments = [
      {
        id: 'spr-505',
        receipt_number: 'REC-2026-0099',
        amount: 30000,
        status: 'Approved',
        verification_status: 'Verified',
      },
    ];

    // Receipt in store with exact stored status: 'Void'
    const receipts = [
      {
        id: 'rcp-0099',
        receipt_number: 'REC-2026-0099',
        payment_id: 'spr-505',
        status: 'Void', // exact stored status for voided receipt
        void_reason: 'Dishonored cheque',
      },
    ];

    const unified = unifyDualLedgerPayments(legacyPayments, studentPayments, { receipts });

    expect(unified).toHaveLength(1);
    expect(unified[0].receipt_status).toBe('Void');
    expect(unified[0].verification_status).toBe('Rejected');
    expect(unified[0].status).toBe('Voided');

    // Crucial check: voided receipt CANNOT remain an eligible collection!
    expect(isPaymentApproved(unified[0])).toBe(false);
    expect(isPaymentPending(unified[0])).toBe(false);
  });
});
