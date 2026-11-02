import { describe, expect, it } from 'vitest';
import {
  calculatePaymentApprovalMetrics,
  calculateEnrollmentMetrics,
  isPaymentApproved,
  isPaymentPending,
  courseBucket,
  paymentCourseBucket,
  UNASSIGNED_COURSE,
} from '@/lib/utils/dashboard-metrics';

describe('Executive Dashboard 6 KPI Cards Metric Calculations', () => {
  describe('Card 1 & Card 5: Payment Approval Status & Collections', () => {
    it('accurately calculates approved payment totals and count', () => {
      const payments = [
        { id: 'p1', amount: 25000, verification_status: 'Verified', status: 'Approved' },
        { id: 'p2', amount: 15000, verification_status: 'Verified', status: 'Success' },
        { id: 'p3', amount: 10000, status: 'Success' },
      ];

      const metrics = calculatePaymentApprovalMetrics(payments);
      expect(metrics.approvedAmount).toBe(50000);
      expect(metrics.approvedCount).toBe(3);
      expect(metrics.pendingAmount).toBe(0);
      expect(metrics.pendingCount).toBe(0);
    });

    it('accurately calculates pending payment totals and count awaiting approval', () => {
      const payments = [
        { id: 'p1', amount: 20000, verification_status: 'Pending Verification', status: 'Pending Approval' },
        { id: 'p2', amount: 12000, verification_status: 'Pending Verification' },
        { id: 'p3', amount: 8000, status: 'Pending' },
      ];

      const metrics = calculatePaymentApprovalMetrics(payments);
      expect(metrics.pendingAmount).toBe(40000);
      expect(metrics.pendingCount).toBe(3);
      expect(metrics.approvedAmount).toBe(0);
      expect(metrics.approvedCount).toBe(0);
    });

    it('strictly excludes rejected, failed, voided, and refunded payments', () => {
      const payments = [
        { id: 'p-valid-approved', amount: 30000, verification_status: 'Verified' },
        { id: 'p-valid-pending', amount: 10000, verification_status: 'Pending Verification' },
        { id: 'p-rejected-1', amount: 25000, verification_status: 'Rejected', status: 'Rejected' },
        { id: 'p-rejected-2', amount: 15000, status: 'Failed' },
        { id: 'p-voided', amount: 20000, status: 'Voided' as any },
        { id: 'p-refunded', amount: 18000, status: 'Refunded' },
      ];

      const metrics = calculatePaymentApprovalMetrics(payments);
      // Only p-valid-approved
      expect(metrics.approvedAmount).toBe(30000);
      expect(metrics.approvedCount).toBe(1);
      // Only p-valid-pending
      expect(metrics.pendingAmount).toBe(10000);
      expect(metrics.pendingCount).toBe(1);
    });

    it('correctly identifies approved vs pending statuses with helpers', () => {
      expect(isPaymentApproved({ verification_status: 'Verified' })).toBe(true);
      expect(isPaymentApproved({ status: 'Success' })).toBe(true);
      expect(isPaymentApproved({ status: 'Approved' })).toBe(true);
      expect(isPaymentApproved({ verification_status: 'Pending Verification' })).toBe(false);
      expect(isPaymentApproved({ status: 'Pending' })).toBe(false);
      expect(isPaymentApproved({ verification_status: 'Rejected' })).toBe(false);

      expect(isPaymentPending({ verification_status: 'Pending Verification' })).toBe(true);
      expect(isPaymentPending({ verification_status: 'Pending' })).toBe(true);
      expect(isPaymentPending({ status: 'Pending' })).toBe(true);
      expect(isPaymentPending({ status: 'Pending Approval' })).toBe(true);
      expect(isPaymentPending({ verification_status: 'Verified' })).toBe(false);
      expect(isPaymentPending({ verification_status: 'Rejected' })).toBe(false);
    });

    it('prevents negative amounts and non-finite values from corrupting financial totals', () => {
      const payments = [
        { id: 'p1', amount: 20000, verification_status: 'Verified' },
        { id: 'p2', amount: -5000, verification_status: 'Verified' },
        { id: 'p3', amount: NaN, verification_status: 'Verified' },
        { id: 'p4', amount: null as any, verification_status: 'Verified' },
      ];

      const metrics = calculatePaymentApprovalMetrics(payments);
      expect(metrics.approvedAmount).toBe(20000);
      expect(metrics.approvedCount).toBe(4);
    });
  });

  describe('Card 6: Student Enrollment Metrics', () => {
    it('counts new student enrollments in period and deduplicates duplicate admissions for the same student', () => {
      const admissions = [
        { id: 'adm-01', student_id: 'std-01', status: 'Confirmed', course_id: 'crs-sap-fico' },
        { id: 'adm-02', student_id: 'std-02', status: 'Active', course_id: 'crs-sap-mm' },
        // Duplicate admission record for std-01 (e.g. re-admission or double entry)
        { id: 'adm-03', student_id: 'std-01', status: 'Confirmed', course_id: 'crs-sap-fico' },
        { id: 'adm-04', student_id: 'std-03', status: 'Enrolled', course_id: 'crs-sap-abap' },
      ];

      const students = [
        { id: 'std-01', status: 'Active', course_id: 'crs-sap-fico' },
        { id: 'std-02', status: 'Active', course_id: 'crs-sap-mm' },
        { id: 'std-03', status: 'Active', course_id: 'crs-sap-abap' },
      ];

      const metrics = calculateEnrollmentMetrics(admissions, students);
      // 3 unique students: std-01, std-02, std-03
      expect(metrics.newEnrollmentsCount).toBe(3);
      expect(metrics.activeStudentsCount).toBe(3);
    });

    it('excludes cancelled, draft, and on-hold admissions from new enrollments count', () => {
      const admissions = [
        { id: 'adm-01', student_id: 'std-01', status: 'Confirmed', course_id: 'crs-sap-fico' },
        { id: 'adm-02', student_id: 'std-02', status: 'Cancelled', course_id: 'crs-sap-fico' },
        { id: 'adm-03', student_id: 'std-03', status: 'Draft', course_id: 'crs-sap-mm' },
        { id: 'adm-04', student_id: 'std-04', status: 'On Hold', course_id: 'crs-sap-abap' },
      ];

      const students = [
        { id: 'std-01', status: 'Active', course_id: 'crs-sap-fico' },
        { id: 'std-02', status: 'Inactive', course_id: 'crs-sap-fico' },
      ];

      const metrics = calculateEnrollmentMetrics(admissions, students);
      expect(metrics.newEnrollmentsCount).toBe(1); // Only adm-01
      expect(metrics.activeStudentsCount).toBe(1); // Only std-01
    });

    it('excludes inactive, dropped, and suspended students from active students count', () => {
      const students = [
        { id: 's1', status: 'Active' },
        { id: 's2', status: 'Active' },
        { id: 's3', status: 'Inactive' },
        { id: 's4', status: 'Suspended' },
        { id: 's5', status: 'Dropped' },
        { id: 's6', status: 'Completed' },
      ];

      const metrics = calculateEnrollmentMetrics([], students);
      expect(metrics.activeStudentsCount).toBe(2);
    });

    it('applies course filtering cleanly to both new enrollments and active students', () => {
      const admissions = [
        { id: 'adm-01', student_id: 's1', course_id: 'crs-fico', status: 'Confirmed' },
        { id: 'adm-02', student_id: 's2', course_id: 'crs-mm', status: 'Confirmed' },
        { id: 'adm-03', student_id: 's3', course_id: 'crs-fico', status: 'Confirmed' },
      ];

      const students = [
        { id: 's1', course_id: 'crs-fico', status: 'Active' },
        { id: 's2', course_id: 'crs-mm', status: 'Active' },
        { id: 's3', course_id: 'crs-fico', status: 'Active' },
        { id: 's4', course_id: 'crs-fico', status: 'Inactive' },
      ];

      const ficoFilter = (cid?: string) => cid === 'crs-fico';
      const ficoMetrics = calculateEnrollmentMetrics(admissions, students, ficoFilter);
      expect(ficoMetrics.newEnrollmentsCount).toBe(2);
      expect(ficoMetrics.activeStudentsCount).toBe(2);

      const mmFilter = (cid?: string) => cid === 'crs-mm';
      const mmMetrics = calculateEnrollmentMetrics(admissions, students, mmFilter);
      expect(mmMetrics.newEnrollmentsCount).toBe(1);
      expect(mmMetrics.activeStudentsCount).toBe(1);
    });
  });

  describe('Course Attribution and Reconciliation', () => {
    const courseIds = new Set(['crs-fico', 'crs-mm', 'crs-abap']);

    it('correctly maps known courses and isolates unassigned ones', () => {
      expect(courseBucket('crs-fico', courseIds)).toBe('crs-fico');
      expect(courseBucket('crs-unknown', courseIds)).toBe(UNASSIGNED_COURSE);
      expect(courseBucket(undefined, courseIds)).toBe(UNASSIGNED_COURSE);
    });

    it('resolves payment course bucket prioritizing payment course, then fee account, then student', () => {
      const feeAccounts = [{ id: 'fa-1', course_id: 'crs-mm' }];
      const students = [{ id: 'std-1', course_id: 'crs-abap' }];

      // 1. Direct course
      expect(paymentCourseBucket(
        { course_id: 'crs-fico', fee_account_id: 'fa-1', student_id: 'std-1' },
        courseIds,
        feeAccounts,
        students
      )).toBe('crs-fico');

      // 2. Fallback to fee account when payment has crs-general
      expect(paymentCourseBucket(
        { course_id: 'crs-general', fee_account_id: 'fa-1', student_id: 'std-1' },
        courseIds,
        feeAccounts,
        students
      )).toBe('crs-mm');

      // 3. Fallback to student course when fee account has no course
      expect(paymentCourseBucket(
        { course_id: '', fee_account_id: 'fa-none', student_id: 'std-1' },
        courseIds,
        [],
        students
      )).toBe('crs-abap');
    });
  });
});
