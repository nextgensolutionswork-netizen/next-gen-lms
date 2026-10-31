import { tenantId } from '@/lib/auth/tenant';
import { resolveCourseId } from './course-resolver';
export const UNASSIGNED_COURSE = '__unassigned__';

export function courseBucket(courseId: string | undefined, courseIds: ReadonlySet<string>, tenant = 'default'): string {
  return resolveCourseId(courseId, courseIds, tenant) || UNASSIGNED_COURSE;
}

// Preserve historical course attribution. Only missing/general attribution may
// fall back to the linked fee account, then the student's current course.
export function paymentCourseBucket(
  payment: { tenant_id?: string; course_id?: string; fee_account_id?: string; student_id: string },
  courseIds: ReadonlySet<string>,
  feeAccounts: readonly { tenant_id?: string; id: string; course_id?: string }[],
  students: readonly { tenant_id?: string; id: string; course_id?: string }[],
  tenant = 'default',
): string {
  if (tenantId(payment) !== tenant) return UNASSIGNED_COURSE;
  const courseId = payment.course_id && payment.course_id !== 'crs-general'
    ? payment.course_id
    : feeAccounts.find((f) => f.id === payment.fee_account_id && tenantId(f) === tenant)?.course_id;
  return courseBucket(
    courseId && courseId !== 'crs-general'
      ? courseId
      : students.find((s) => s.id === payment.student_id && tenantId(s) === tenant)?.course_id,
    courseIds, tenant,
  );
}

export function formatDashboardPercentage(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'N/A';
}
