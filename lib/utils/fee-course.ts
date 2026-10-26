import { tenantId } from '@/lib/auth/tenant';
import type { StudentFee } from '@/types';

type LinkedCourse = {
  id: string;
  student_id?: string;
  tenant_id?: string;
  course_id?: string;
  course_name?: string;
};

/** Resolve the fee's enrollment, never a student's potentially changed course. */
export function feeCourseName(
  fee: StudentFee,
  courses: readonly { id: string; course_name: string }[],
  feeAccounts: readonly LinkedCourse[],
  admissions: readonly LinkedCourse[],
): string {
  const sameStudent = (record: LinkedCourse) => record.student_id === fee.student_id && tenantId(record) === tenantId(fee);
  const account = feeAccounts.find((a) => a.id === fee.fee_account_id && sameStudent(a));
  const admission = admissions.find((a) => sameStudent(a) && a.id === fee.enrollment_id);
  const courseId = fee.course_id || (fee.reference_type === 'Course' ? fee.reference_id : undefined);
  if (courseId) {
    return courses.find((c) => c.id === courseId)?.course_name || fee.course_name?.trim() || fee.sap_module?.trim() || 'Course mapping unavailable';
  }
  if (fee.course_name?.trim()) return fee.course_name.trim();
  const linked = account || admission;
  if (linked) {
    return courses.find((c) => c.id === linked.course_id)?.course_name || linked.course_name?.trim() || 'Course mapping unavailable';
  }
  return fee.sap_module?.trim() || 'Course mapping unavailable';
}
