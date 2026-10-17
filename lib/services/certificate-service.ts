import { store } from './data-store';
import { Certificate } from '@/types';
import { generateCertificateId } from '@/lib/utils/formatters';
import { recordAuditLog } from './audit-service';
import {
  dispatchMultiChannelNotification,
  buildCertificateEmailHtml,
} from './notification-service';
import { generateAndSaveCertificatePdf } from './pdf-service';

export async function getCertificates(): Promise<Certificate[]> {
  return [...(store.certificates || [])];
}

export async function getCertificateByVerificationId(idOrCode: string): Promise<Certificate | undefined> {
  if (!idOrCode) return undefined;
  return (store.certificates || []).find(
    (c) => c.certificate_id?.toLowerCase() === idOrCode?.toLowerCase() || c.id === idOrCode
  );
}

export async function verifyAndGenerateCertificate(
  studentId: string,
  courseId: string,
  issuedByUserId: string
): Promise<{ eligible: boolean; reasons: string[]; certificate?: Certificate }> {
  const student = (store.students || []).find((s) => s.id === studentId);
  const course = (store.courses || []).find((c) => c.id === courseId);
  if (!student || !course) throw new Error('Student or Course not found');

  const reasons: string[] = [];

  // Criteria 0: Course enrollment binding (G17)
  const isDirectlyEnrolled = student.course_id === course.id;
  const hasAdmission = (store.admissions || []).some(
    (a) => (a.student_id === student.id || a.email?.toLowerCase() === student.email?.toLowerCase()) && a.course_id === course.id
  );
  const hasFeeAccount = (store.studentFees || []).some(
    (f) => f.student_id === student.id && (f.course_id === course.id || f.reference_id === course.id)
  );

  if (!isDirectlyEnrolled && !hasAdmission && !hasFeeAccount) {
    reasons.push(`Student "${student.full_name}" is not enrolled in course "${course.course_name}"`);
  }

  // Criteria 1: Attendance >= 80%
  if ((student.attendance_percentage ?? 0) < 80) {
    reasons.push(`Attendance is ${student.attendance_percentage ?? 0}%, minimum 80% required`);
  }

  // Criteria 2: Course Progress >= 80%
  if ((student.course_progress ?? 0) < 80) {
    reasons.push(`Course completion is ${student.course_progress ?? 0}%, minimum 80% required`);
  }

  // Criteria 3: Outstanding fee cleared
  if ((student.outstanding_amount ?? 0) > 0) {
    reasons.push(`Outstanding balance of ₹${student.outstanding_amount} must be settled`);
  }

  // Calculate actual assignment and exam metrics (G17)
  const courseAssignments = (store.assignments || []).filter((a) => a.course_id === course.id);
  const studentSubmissions = (store.submissions || []).filter(
    (s) => s.student_id === student.id && courseAssignments.some((a) => a.id === s.assignment_id)
  );
  const assignmentRate = courseAssignments.length > 0
    ? Number(((studentSubmissions.length / courseAssignments.length) * 100).toFixed(1))
    : 100.0;

  const courseQuizzes = (store.quizzes || []).filter((q) => q.course_id === course.id);
  const studentAttempts = (store.quizAttempts || []).filter(
    (qa) => qa.student_id === student.id && courseQuizzes.some((q) => q.id === qa.quiz_id)
  );
  const avgExamScore = studentAttempts.length > 0
    ? Number((studentAttempts.reduce((sum, qa) => sum + (qa.percentage || 0), 0) / studentAttempts.length).toFixed(1))
    : 85.0;

  if (!store.certificates) store.certificates = [];

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
    assignment_completion_rate: assignmentRate,
    exam_score_percentage: avgExamScore,
    verification_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/certificate/verify/${certificate_id}`,
    pdf_url: `/api/certificates/${certificate_id}/pdf`,
    is_valid: true,
    created_at: new Date().toISOString(),
  };

  // Generate and persist official binary vector PDF
  try {
    const pdfRes = await generateAndSaveCertificatePdf(cert);
    if (pdfRes.pdfUrl) {
      cert.pdf_url = pdfRes.pdfUrl;
    }
  } catch (pdfErr) {
    console.warn('Certificate PDF generation warning, falling back to direct API route:', pdfErr);
  }

  store.certificates.push(cert);

  const issuer = store.users.find((u) => u.id === issuedByUserId);
  await recordAuditLog({
    user_id: issuedByUserId,
    user_name: issuer?.full_name || 'Admin',
    user_role: issuer?.role || 'admin',
    action: 'CERTIFICATE_GENERATED',
    module: 'CERTIFICATES',
    record_id: cert.id,
    new_value: { certificate_id, student: student.full_name, course: course.course_name, pdf_url: cert.pdf_url },
  });

  // Dispatch multi-channel notification (in-app, email with PDF, WhatsApp)
  const pdfUrl = cert.pdf_url || `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/api/certificates/${cert.certificate_id}/pdf?download=true`;
  const emailHtml = buildCertificateEmailHtml({
    studentName: student.full_name,
    courseName: course.course_name,
    certificateId: cert.certificate_id,
    grade: cert.grade,
    verificationUrl: cert.verification_url,
    pdfUrl,
  });

  dispatchMultiChannelNotification({
    userId: student.user_id || student.id,
    recipientName: student.full_name,
    recipientEmail: student.email,
    recipientPhone: student.phone,
    title: `SAP Certificate Awarded: ${course.course_name}`,
    message: `Congratulations ${student.full_name}! Your course certificate (${cert.certificate_id}) has been issued with grade ${cert.grade}.`,
    category: 'certificate',
    type: 'success',
    channels: ['in_app', 'email', 'whatsapp'],
    actionUrl: `/certificate/verify/${cert.certificate_id}`,
    metadata: { htmlTemplate: emailHtml, pdfUrl },
  }).catch((err) => console.warn('Certificate notification dispatch error:', err));

  return { eligible: true, reasons: [], certificate: cert };
}

export const issueCertificate = verifyAndGenerateCertificate;

export async function revokeCertificate(
  certificateId: string,
  revokedByUserId: string,
  reason: string = 'Administrative Revocation',
  status: 'Revoked' | 'Suspended' | 'Fraudulent' = 'Revoked'
): Promise<Certificate | null> {
  if (!store.certificates) store.certificates = [];
  const cert = (store.certificates || []).find(
    (c) => c.certificate_id?.toLowerCase() === certificateId?.toLowerCase() || c.id === certificateId
  );
  if (!cert) return null;
  cert.is_valid = false;
  cert.status = status;
  cert.revocation_reason = reason;
  cert.revoked_at = new Date().toISOString();
  cert.revoked_by = revokedByUserId;
  store.persist();

  const revoker = (store.users || []).find((u) => u.id === revokedByUserId);
  await recordAuditLog({
    user_id: revokedByUserId,
    user_name: revoker?.full_name || 'Admin',
    user_role: revoker?.role || 'admin',
    action: status === 'Fraudulent' ? 'CERTIFICATE_FLAGGED_FRAUDULENT' : 'CERTIFICATE_REVOKED',
    module: 'CERTIFICATES',
    record_id: cert.id,
    new_value: { certificate_id: cert.certificate_id, reason, status, is_valid: false },
  });

  return cert;
}

export async function flagCertificateAsFraudulent(
  certificateId: string,
  flaggedByUserId: string,
  reason: string = 'Flagged as fraudulent / forged credential'
): Promise<Certificate | null> {
  return revokeCertificate(certificateId, flaggedByUserId, reason, 'Fraudulent');
}
