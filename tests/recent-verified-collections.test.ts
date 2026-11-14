/**
 * QA-017 / BUG-04: Recent Verified Fee Collections Verification
 *
 * Verifies that the dashboard section labelled "Recent Verified Fee Collections":
 * 1. Excludes pending, rejected, failed, refunded, and voided payments.
 * 2. Unifies mirrored dual-ledger payments so each verified collection appears exactly once.
 * 3. Preserves separate legitimate installments as distinct entries.
 * 4. Respects voided receipts and terminal status conflict precedence.
 * 5. Applies sorting by collection/verification timestamp descending before applying the display limit (5).
 * 6. Ensures newer unverified records do not displace older verified collections from the display limit.
 * 7. Correctly reflects period (date range) and course scope.
 * 8. Returns an empty list ("No verified fee collections") when no eligible records exist.
 * 9. Dynamically updates when a pending payment transitions to verified.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  unifyDualLedgerPayments,
  isPaymentApproved,
  isPaymentPending,
  getRecentVerifiedCollections,
  paymentCourseBucket,
  UnifiedPaymentRecord,
} from '@/lib/utils/dashboard-metrics';
import { enteredPaymentVerification } from './payment-verification-fixture';
import { StudentPaymentRecord, Payment } from '@/types';

describe('QA-017 / BUG-04: Recent Verified Fee Collections', () => {
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

  it('1. Mixed verified and non-verified payments: strictly includes only verified collections and excludes all non-verified statuses', () => {
    const fee = feeWorkflowService.createFeeProposal(
      {
        student_id: 'stu-01',
        fee_category: 'Course Fee',
        standard_fee: 100000,
        proposed_fee: 100000,
        discount_amount: 0,
        discount_percentage: 0,
        payment_plan: 'Custom',
        number_of_installments: 5,
        first_due_date: '2026-11-20',
        auto_submit: true,
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved fee');

    // 1. Genuine verified payment (25,000)
    const p1 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 25000,
        payment_mode: 'UPI',
        payment_date: '2026-11-01',
        transaction_reference: 'UPI-VER-01',
      },
      counsellorId,
      'counsellor'
    );
    const verified1 = feeWorkflowService.verifyPayment(
      p1.id,
      accountantId,
      'Verified UTR',
      enteredPaymentVerification(p1.id)
    );

    // 2. Pending payment (20,000)
    const p2 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 20000,
        payment_mode: 'UPI',
        payment_date: '2026-11-02',
        transaction_reference: 'UPI-PEND-02',
      },
      counsellorId,
      'counsellor'
    );

    // 3. Rejected payment (15,000)
    const p3 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 15000,
        payment_mode: 'UPI',
        payment_date: '2026-11-03',
        transaction_reference: 'UPI-REJ-03',
      },
      counsellorId,
      'counsellor'
    );
    feeWorkflowService.rejectPayment(p3.id, accountantId, 'Invalid UTR mismatch');

    // 4. Failed online payment (10,000)
    const failedRecord: StudentPaymentRecord = {
      id: 'spr-fail-04',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 10000,
      payment_date: '2026-11-04',
      payment_mode: 'Bank Transfer',
      status: 'Failed' as any,
      verification_status: 'Rejected',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-04T10:00:00Z',
    };
    store.studentPayments.push(failedRecord);

    // 5. Refunded payment (8,000)
    const refundedRecord: StudentPaymentRecord = {
      id: 'spr-ref-05',
      fee_id: fee.id,
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 8000,
      payment_date: '2026-11-05',
      payment_mode: 'UPI',
      status: 'Refunded' as any,
      verification_status: 'Refunded' as any,
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-05T10:00:00Z',
    };
    store.studentPayments.push(refundedRecord);

    // 6. Another genuine verified payment (30,000)
    const p6 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 30000,
        payment_mode: 'UPI',
        payment_date: '2026-11-06',
        transaction_reference: 'UPI-VER-06',
      },
      counsellorId,
      'counsellor'
    );
    const verified6 = feeWorkflowService.verifyPayment(
      p6.id,
      accountantId,
      'Verified UTR 2',
      enteredPaymentVerification(p6.id)
    );

    store.reconcileDualLedgers();

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    const recentCollections = getRecentVerifiedCollections(unified, 5);

    // Exactly 2 verified collections returned out of 6 total records
    expect(recentCollections.length).toBe(2);

    // Check that ONLY verified payments appear
    const ids = recentCollections.map((p) => p.student_payment_id || p.raw_id);
    expect(ids).toContain(verified1.id);
    expect(ids).toContain(verified6.id);

    // Verify non-verified are excluded
    expect(ids).not.toContain(p2.id);
    expect(ids).not.toContain(p3.id);
    expect(ids).not.toContain(failedRecord.id);
    expect(ids).not.toContain(refundedRecord.id);

    // Confirm all returned entries satisfy isPaymentApproved
    for (const p of recentCollections) {
      expect(isPaymentApproved(p)).toBe(true);
      expect(isPaymentPending(p)).toBe(false);
    }

    // Verify sort order: most recent verified first (verified6 on Nov 6 before verified1 on Nov 1)
    expect(recentCollections[0].student_payment_id || recentCollections[0].raw_id).toBe(verified6.id);
    expect(recentCollections[1].student_payment_id || recentCollections[1].raw_id).toBe(verified1.id);
  });

  it('2. Only pending/rejected payments or completely empty data: yields 0 records for empty state display', () => {
    // A. Completely empty store
    let unified = unifyDualLedgerPayments([], [], {});
    let recent = getRecentVerifiedCollections(unified, 5);
    expect(recent.length).toBe(0);

    // B. Store has 3 pending and 2 rejected payments, but ZERO verified payments
    const pendingPayment: StudentPaymentRecord = {
      id: 'spr-p-only',
      fee_id: 'fee-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 20000,
      payment_date: '2026-11-01',
      payment_mode: 'UPI',
      status: 'Pending Approval',
      verification_status: 'Pending Verification',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-01T10:00:00Z',
    };

    const rejectedPayment: StudentPaymentRecord = {
      id: 'spr-r-only',
      fee_id: 'fee-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 15000,
      payment_date: '2026-11-02',
      payment_mode: 'UPI',
      status: 'Rejected',
      verification_status: 'Rejected',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-02T10:00:00Z',
    };

    store.studentPayments = [pendingPayment, rejectedPayment];
    store.reconcileDualLedgers();

    unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    recent = getRecentVerifiedCollections(unified, 5);
    expect(recent.length).toBe(0);
  });

  it('3. More records than display limit: newer unverified records do NOT push older verified collections out of the limit', () => {
    // Create 7 verified payments across dates 2026-11-01 to 2026-11-07
    const verifiedPayments: StudentPaymentRecord[] = [];
    for (let day = 1; day <= 7; day++) {
      const dateStr = `2026-11-0${day}`;
      verifiedPayments.push({
        id: `spr-v-0${day}`,
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        admission_number: 'ADM-2026-0001',
        fee_category: 'Course Fee',
        amount_paid: 10000 * day,
        payment_date: dateStr,
        payment_mode: 'UPI',
        status: 'Approved',
        verification_status: 'Verified',
        receipt_number: `REC-2026-000${day}`,
        verified_at: `${dateStr}T14:00:00Z`,
        recorded_by: counsellorId,
        recorded_by_name: 'Ananya Counsellor',
        recorded_by_role: 'counsellor',
        created_at: `${dateStr}T10:00:00Z`,
      });
    }

    // Create 5 NEWER unverified (pending & rejected) payments on dates 2026-11-08 to 2026-11-12
    const unverifiedPayments: StudentPaymentRecord[] = [];
    for (let day = 8; day <= 12; day++) {
      const dateStr = `2026-11-${day < 10 ? '0' + day : day}`;
      unverifiedPayments.push({
        id: `spr-p-${day}`,
        fee_id: 'fee-01',
        student_id: 'stu-01',
        student_name: 'Rahul Verma',
        admission_number: 'ADM-2026-0001',
        fee_category: 'Course Fee',
        amount_paid: 5000,
        payment_date: dateStr,
        payment_mode: 'UPI',
        status: day % 2 === 0 ? 'Pending Approval' : 'Rejected',
        verification_status: day % 2 === 0 ? 'Pending Verification' : 'Rejected',
        recorded_by: counsellorId,
        recorded_by_name: 'Ananya Counsellor',
        recorded_by_role: 'counsellor',
        created_at: `${dateStr}T10:00:00Z`,
      });
    }

    // Combine all payments (12 total: 7 verified, 5 newer unverified)
    store.studentPayments = [...verifiedPayments, ...unverifiedPayments];
    store.reconcileDualLedgers();

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // The display limit is 5
    const recent = getRecentVerifiedCollections(unified, 5);

    // Exactly 5 records returned
    expect(recent.length).toBe(5);

    // The returned records MUST be the 5 newest VERIFIED payments (days 7, 6, 5, 4, 3)
    const expectedIds = ['spr-v-07', 'spr-v-06', 'spr-v-05', 'spr-v-04', 'spr-v-03'];
    const actualIds = recent.map((p) => p.student_payment_id || p.raw_id);
    expect(actualIds).toEqual(expectedIds);

    // None of the newer unverified records (days 8-12) appear or displace verified records
    for (let day = 8; day <= 12; day++) {
      expect(actualIds).not.toContain(`spr-p-${day}`);
    }
  });

  it('4. Mirrored payments and separate installments: unified once, distinct installments preserved', () => {
    // 1. Mirrored payment: legacy mirror in store.payments and modern record in store.studentPayments
    const legacyMirror: Payment = {
      id: 'pay-spr-install-01',
      tenant_id: 'default',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_account_id: 'fa-01',
      course_id: 'crs-fico',
      amount: 25000,
      payment_date: '2026-11-01',
      payment_mode: 'UPI',
      status: 'Success',
      receipt_number: 'REC-2026-1001',
      collected_by: counsellorId,
      created_at: '2026-11-01T10:00:00Z',
    };

    const modernMirror: StudentPaymentRecord = {
      id: 'spr-install-01',
      installment_id: 'inst-01',
      fee_id: 'fa-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 25000,
      payment_date: '2026-11-01',
      payment_mode: 'UPI',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-2026-1001',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-01T10:00:00Z',
    };

    // 2. Separate legitimate installment 2 (different installment_id and payment ID)
    const installment2: StudentPaymentRecord = {
      id: 'spr-install-02',
      installment_id: 'inst-02',
      fee_id: 'fa-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 35000,
      payment_date: '2026-11-05',
      payment_mode: 'Bank Transfer',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-2026-1002',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-05T10:00:00Z',
    };

    store.payments = [legacyMirror];
    store.studentPayments = [modernMirror, installment2];
    store.receipts = [
      {
        id: 'rcpt-1001',
        receipt_number: 'REC-2026-1001',
        payment_id: 'spr-install-01',
        payment_amount: 25000,
        payment_date: '2026-11-01',
        student_id: 'stu-01',
        receipt_status: 'Active',
      } as any,
      {
        id: 'rcpt-1002',
        receipt_number: 'REC-2026-1002',
        payment_id: 'spr-install-02',
        payment_amount: 35000,
        payment_date: '2026-11-05',
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

    const recent = getRecentVerifiedCollections(unified, 5);

    // Mirrored payment is unified into exactly 1 entry, and installment 2 is a separate 2nd entry
    expect(recent.length).toBe(2);

    const amounts = recent.map((p) => p.amount);
    expect(amounts).toContain(25000);
    expect(amounts).toContain(35000);

    // Most recent (Nov 5) comes first
    expect(recent[0].amount).toBe(35000);
    expect(recent[1].amount).toBe(25000);
  });

  it('5. Voided receipts and conflicting statuses: strictly excluded by precedence rules', () => {
    // Payment with linked void receipt
    const voidPayment: StudentPaymentRecord = {
      id: 'spr-void-rcpt',
      fee_id: 'fee-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 20000,
      payment_date: '2026-11-02',
      payment_mode: 'UPI',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-VOID-999',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-02T10:00:00Z',
    };

    const voidReceipt = {
      id: 'rcpt-void-999',
      receipt_number: 'REC-VOID-999',
      payment_id: 'spr-void-rcpt',
      payment_amount: 20000,
      payment_date: '2026-11-02',
      student_id: 'stu-01',
      status: 'Void', // Official cancellation
    };

    // Conflicting status: status = 'Failed', but verification_status left as 'Verified'
    const conflictFailed: StudentPaymentRecord = {
      id: 'spr-conflict-fail',
      fee_id: 'fee-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 18000,
      payment_date: '2026-11-03',
      payment_mode: 'UPI',
      status: 'Failed' as any,
      verification_status: 'Verified',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-03T10:00:00Z',
    };

    // Genuine valid verified payment
    const validPayment: StudentPaymentRecord = {
      id: 'spr-valid-01',
      fee_id: 'fee-01',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 22000,
      payment_date: '2026-11-04',
      payment_mode: 'UPI',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-VALID-01',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-04T10:00:00Z',
    };

    store.studentPayments = [voidPayment, conflictFailed, validPayment];
    store.receipts = [voidReceipt as any];
    store.reconcileDualLedgers();

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    const recent = getRecentVerifiedCollections(unified, 5);

    // ONLY the genuinely valid verified payment is included
    expect(recent.length).toBe(1);
    expect(recent[0].student_payment_id || recent[0].raw_id).toBe('spr-valid-01');
    expect(recent[0].amount).toBe(22000);
  });

  it('6. Applicable role/date filters: correctly isolates collections by selected course and date period', () => {
    // Course 1: FICO (stu-01) on Nov 05
    const paymentFico: StudentPaymentRecord = {
      id: 'spr-fico-01',
      fee_id: 'fee-fico',
      student_id: 'stu-01',
      student_name: 'Rahul Verma',
      admission_number: 'ADM-2026-0001',
      fee_category: 'Course Fee',
      amount_paid: 30000,
      payment_date: '2026-11-05',
      payment_mode: 'UPI',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-FICO-01',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-11-05T10:00:00Z',
    };

    // Course 2: MM (stu-02) on Oct 20 (previous month)
    const paymentMm: StudentPaymentRecord = {
      id: 'spr-mm-01',
      fee_id: 'fee-mm',
      student_id: 'stu-02',
      student_name: 'Priya Sharma',
      admission_number: 'ADM-2026-0002',
      fee_category: 'Course Fee',
      amount_paid: 25000,
      payment_date: '2026-10-20',
      payment_mode: 'UPI',
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-MM-01',
      recorded_by: counsellorId,
      recorded_by_name: 'Ananya Counsellor',
      recorded_by_role: 'counsellor',
      created_at: '2026-10-20T10:00:00Z',
    };

    store.studentPayments = [paymentFico, paymentMm];
    store.feeAccounts = [
      { id: 'fee-fico', student_id: 'stu-01', course_id: 'crs-fico' } as any,
      { id: 'fee-mm', student_id: 'stu-02', course_id: 'crs-mm' } as any,
    ];
    store.reconcileDualLedgers();

    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
      feeAccounts: store.feeAccounts,
    });

    const courseIds = new Set(store.courses.map((c) => c.id));

    // Scope A: Course filter = 'crs-fico'
    const ficoPayments = unified.filter((p) => paymentCourseBucket(p, courseIds, store.feeAccounts, store.students) === 'crs-fico');
    const recentFico = getRecentVerifiedCollections(ficoPayments, 5);
    expect(recentFico.length).toBe(1);
    expect(recentFico[0].amount).toBe(30000);
    expect(recentFico[0].student_name).toBe('Rahul Verma');

    // Scope B: Date filter = November 2026 only
    const novPayments = unified.filter((p) => (p.payment_date || '').startsWith('2026-11'));
    const recentNov = getRecentVerifiedCollections(novPayments, 5);
    expect(recentNov.length).toBe(1);
    expect(recentNov[0].amount).toBe(30000);

    // Scope C: All Time & All Courses
    const recentAll = getRecentVerifiedCollections(unified, 5);
    expect(recentAll.length).toBe(2);
  });

  it('7. A controlled payment becoming verified appears immediately in recent verified collections after refresh', () => {
    const fee = feeWorkflowService.createFeeProposal(
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
    feeWorkflowService.approveFee(fee.id, accountantId, 'Approved fee');

    // Step 1: Counsellor records a payment (pending verification)
    const recorded = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        amount_paid: 40000,
        payment_mode: 'UPI',
        payment_date: '2026-11-10',
        transaction_reference: 'UPI-DYNAMIC-01',
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

    // Before approval: 0 verified collections
    let recent = getRecentVerifiedCollections(unified, 5);
    expect(recent.length).toBe(0);

    // Step 2: Accountant approves the payment
    const verified = feeWorkflowService.verifyPayment(
      recorded.id,
      accountantId,
      'Approved via bank verification',
      enteredPaymentVerification(recorded.id)
    );
    store.reconcileDualLedgers();

    unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });

    // After approval: Exactly 1 verified collection appears
    recent = getRecentVerifiedCollections(unified, 5);
    expect(recent.length).toBe(1);
    expect(recent[0].student_payment_id || recent[0].raw_id).toBe(verified.id);
    expect(recent[0].amount).toBe(40000);
    expect(recent[0].receipt_number).toBe(verified.receipt_number);
    expect(isPaymentApproved(recent[0])).toBe(true);
  });
});
