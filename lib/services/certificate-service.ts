import { store } from './data-store';
import { Certificate } from '@/types';
import { generateCertificateId } from '@/lib/utils/formatters';
import { recordAuditLog } from './audit-service';

export async function getCertificates(): Promise<Certificate[]> {
  return [...store.certificates];
}

export async function getCertificateByVerificationId(idOrCode: string): Promise<Certificate | undefined> {
  return store.certificates.find(
    (c) => c.certificate_id.toLowerCase() === idOrCode.toLowerCase() || c.id === idOrCode
  );
}

export async function verifyAndGenerateCertificate(
  studentId: string,
  courseId: string,
  issuedByUserId: string
): Promise<{ eligible: boolean; reasons: string[]; certificate?: Certificate }> {
  const student = store.students.find((s) => s.id === studentId);
  const course = store.courses.find((c) => c.id === courseId);
  if (!student || !course) throw new Error('Student or Course not found');

  const reasons: string[] = [];

  // Criteria 1: Attendance >= 80%
  if (student.attendance_percentage < 80) {
    reasons.push(`Attendance is ${student.attendance_percentage}%, minimum 80% required`);
  }

  // Criteria 2: Course Progress >= 80%
  if (student.course_progress < 80) {
    reasons.push(`Course completion is ${student.course_progress}%, minimum 80% required`);
  }

  // Criteria 3: Outstanding fee cleared
  if (student.outstanding_amount > 0) {
    reasons.push(`Outstanding balance of ₹${student.outstanding_amount} must be settled`);
  }

  // If already issued, return existing
  const existing = store.certificates.find(
    (c) => c.student_id === studentId && c.course_id === courseId
  );
  if (existing) {
    return { eligible: true, reasons: [], certificate: existing };
  }

  if (reasons.length > 0) {
    return { eligible: false, reasons };
  }

  // Generate certificate
  const sequence = store.certificates.length + 1;
  const certificate_id = generateCertificateId(course.course_code, sequence);

  const cert: Certificate = {
    id: `cert-${Date.now()}`,
    certificate_id,
    student_id: student.id,
    student_name: student.full_name,
    course_id: course.id,
    course_name: course.course_name,
    grade: student.course_progress >= 90 ? 'A+ (Distinction)' : 'A (First Class)',
    issue_date: new Date().toISOString().slice(0, 10),
    completion_date: new Date().toISOString().slice(0, 10),
    attendance_percentage: student.attendance_percentage,
    assignment_completion_rate: 90.0,
    exam_score_percentage: 88.0,
    verification_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/certificate/verify/${certificate_id}`,
    is_valid: true,
    created_at: new Date().toISOString(),
  };

  store.certificates.push(cert);

  const issuer = store.users.find((u) => u.id === issuedByUserId);
  await recordAuditLog({
    user_id: issuedByUserId,
    user_name: issuer?.full_name || 'Admin',
    user_role: issuer?.role || 'admin',
    action: 'CERTIFICATE_GENERATED',
    module: 'CERTIFICATES',
    record_id: cert.id,
    new_value: { certificate_id, student: student.full_name, course: course.course_name },
  });

  return { eligible: true, reasons: [], certificate: cert };
}
