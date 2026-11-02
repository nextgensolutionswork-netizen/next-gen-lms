export const UNASSIGNED_COURSE = '__unassigned__';

export function courseBucket(courseId: string | undefined, courseIds: ReadonlySet<string>): string {
  return courseId && courseIds.has(courseId) ? courseId : UNASSIGNED_COURSE;
}

// Preserve historical course attribution. Only missing/general attribution may
// fall back to the linked fee account, then the student's current course.
export function paymentCourseBucket(
  payment: { course_id?: string; fee_account_id?: string; student_id: string },
  courseIds: ReadonlySet<string>,
  feeAccounts: readonly { id: string; course_id?: string }[],
  students: readonly { id: string; course_id?: string }[],
): string {
  const courseId = payment.course_id && payment.course_id !== 'crs-general'
    ? payment.course_id
    : feeAccounts.find((f) => f.id === payment.fee_account_id)?.course_id;
  return courseBucket(
    courseId && courseId !== 'crs-general'
      ? courseId
      : students.find((s) => s.id === payment.student_id)?.course_id,
    courseIds,
  );
}

export function formatDashboardPercentage(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'N/A';
}

export interface PaymentApprovalMetrics {
  approvedAmount: number;
  approvedCount: number;
  pendingAmount: number;
  pendingCount: number;
}

export function isPaymentApproved(payment: { status?: string; verification_status?: string }): boolean {
  if (payment.verification_status) {
    return payment.verification_status === 'Verified';
  }
  return payment.status === 'Success' || payment.status === 'Approved';
}

export function isPaymentPending(payment: { status?: string; verification_status?: string }): boolean {
  if (payment.verification_status) {
    return payment.verification_status === 'Pending Verification' || payment.verification_status === 'Pending';
  }
  return payment.status === 'Pending' || payment.status === 'Pending Approval';
}

export function calculatePaymentApprovalMetrics(
  payments: readonly {
    amount: number;
    status?: string;
    verification_status?: string;
  }[]
): PaymentApprovalMetrics {
  let approvedAmount = 0;
  let approvedCount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;

  for (const p of payments) {
    // Exclude rejected, failed, voided, or refunded payments
    if (
      p.status === 'Failed' ||
      p.status === 'Refunded' ||
      p.verification_status === 'Rejected' ||
      (p as any).status === 'Voided'
    ) {
      continue;
    }

    const amt = typeof p.amount === 'number' && Number.isFinite(p.amount) ? Math.max(0, p.amount) : 0;

    if (isPaymentApproved(p)) {
      approvedAmount += amt;
      approvedCount += 1;
    } else if (isPaymentPending(p)) {
      pendingAmount += amt;
      pendingCount += 1;
    }
  }

  return {
    approvedAmount,
    approvedCount,
    pendingAmount,
    pendingCount,
  };
}

export interface EnrollmentMetrics {
  newEnrollmentsCount: number;
  activeStudentsCount: number;
}

export function calculateEnrollmentMetrics<
  A extends {
    id?: string;
    student_id?: string;
    admission_number?: string;
    status?: string;
    course_id?: string;
  },
  S extends {
    id?: string;
    status?: string;
    course_id?: string;
  }
>(
  admissionsInPeriod: readonly A[],
  allStudents: readonly S[],
  matchesCourseFn?: (courseId?: string) => boolean
): EnrollmentMetrics {
  const seenStudentIds = new Set<string>();
  let newEnrollmentsCount = 0;

  for (const a of admissionsInPeriod) {
    // Exclude cancelled, withdrawn, or draft admissions
    if (a.status === 'Cancelled' || a.status === 'Draft' || a.status === 'On Hold') {
      continue;
    }

    if (matchesCourseFn && !matchesCourseFn(a.course_id)) {
      continue;
    }

    const identifier = a.student_id || a.admission_number || a.id;
    if (identifier) {
      if (seenStudentIds.has(identifier)) continue;
      seenStudentIds.add(identifier);
    }
    newEnrollmentsCount += 1;
  }

  const activeStudentsCount = allStudents.filter((s) => {
    if (s.status !== 'Active') return false;
    if (matchesCourseFn && !matchesCourseFn(s.course_id)) return false;
    return true;
  }).length;

  return {
    newEnrollmentsCount,
    activeStudentsCount,
  };
}
