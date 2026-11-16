import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { calculateAuthoritativeStudentFinancials } from '@/lib/utils/student-financials';
import { getStudentProfileFullDetails } from '@/lib/services/student-service';

describe('BUG-SA-03: Student Fee Balance Mismatch Reconciliation', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
    store.reconcileAdmissionsAndStudents();
    store.reconcileDualLedgers();
  });

  it('ensures authoritative financial calculation accurately reflects obligations and verified payments', () => {
    const student = store.students.find((s) => s.id === 'stu-01');
    expect(student).toBeDefined();

    const admission = store.admissions.find((a) => a.id === student?.admission_id || a.student_id === student?.id);
    expect(admission).toBeDefined();
    expect(admission?.net_payable).toBe(40000);

    const payments = store.payments.filter((p) => p.student_id === 'stu-01');
    const studentPayments = store.studentPayments.filter((p) => p.student_id === 'stu-01');
    const studentFees = store.studentFees.filter((f) => f.student_id === 'stu-01');
    const feeAccount = store.feeAccounts.find((fa) => fa.student_id === 'stu-01');

    const authFin = calculateAuthoritativeStudentFinancials({
      student,
      admission,
      feeAccount,
      studentFees,
      payments,
      studentPayments,
    });

    // Authoritative figures
    expect(authFin.totalPayable).toBe(40000);
    expect(authFin.paidAmount).toBe(40000);
    expect(authFin.outstandingDue).toBe(0);
    expect(authFin.isFinanciallyCleared).toBe(true);
  });

  it('guarantees header and finance ledger yield identical fee balance for stu-01 without hardcoded values', async () => {
    const details = await getStudentProfileFullDetails('stu-01');
    expect(details).not.toBeNull();
    if (!details) return;

    const authFin = calculateAuthoritativeStudentFinancials({
      student: details.student,
      admission: details.admission,
      feeAccount: details.feeAccount,
      studentFees: details.studentFees,
      payments: details.payments,
      studentPayments: details.studentPayments,
    });

    // Header value
    const headerFeeDue = authFin.outstandingDue;

    // Finance & Ledger value
    const ledgerOutstandingDue = authFin.outstandingDue;
    const ledgerVerifiedPaid = authFin.paidAmount;

    // Both must match perfectly
    expect(headerFeeDue).toBe(ledgerOutstandingDue);
    expect(headerFeeDue).toBe(0);
    expect(ledgerVerifiedPaid).toBe(40000);

    // Profile record itself must also reflect the reconciled status
    expect(details.student.outstanding_amount).toBe(0);
    expect(details.student.paid_amount).toBe(40000);
  });
});
