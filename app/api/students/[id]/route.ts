import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { store } from '@/lib/services/data-store';
import { tenantId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await authenticatePaymentRequest(request);
    const allowedRoles = [
      'super_admin',
      'admin',
      'accountant',
      'trainer',
      'placement_coordinator',
      'support',
      'onboarding_team',
      'counsellor',
      'student',
    ];

    if (!allowedRoles.includes(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Student profile access required.' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const resolvedParams = await params;
    const targetId = decodeURIComponent(String(resolvedParams.id || '')).trim().toLowerCase();

    if (!targetId) {
      return NextResponse.json(
        { success: false, error: 'Student ID is required.' },
        { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const data = await paymentTransaction(actor, async () => {
      store.reconcileAdmissionsAndStudents();
      const tenant = tenantId(actor);
      const student = store.students.find(
        (s) =>
          tenantId(s) === tenant &&
          (s.id?.toLowerCase() === targetId ||
            s.student_code?.toLowerCase() === targetId ||
            s.student_unique_id?.toLowerCase() === targetId ||
            s.admission_id?.toLowerCase() === targetId ||
            s.admission_number?.toLowerCase() === targetId ||
            (s.email && s.email.toLowerCase() === targetId) ||
            (s.phone && s.phone.toLowerCase() === targetId))
      );

      if (!student) {
        return null;
      }

      // Security: Students can only view their own profile
      if (actor.role === 'student' && student.user_id !== actor.id && student.id !== (actor as any).student_id) {
        throw new Error('Forbidden: You can only view your own student profile.');
      }

      const admission = store.admissions.find((a) => a.id === student.admission_id || a.admission_number === student.admission_number);
      const course = store.courses.find((c) => c.id === student.course_id);
      const batch = store.batches.find((b) => b.id === student.batch_id);
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id || f.admission_id === student.admission_id);
      const payments = store.payments.filter((p) => p.student_id === student.id);
      const receipts = store.receipts.filter((r) => r.student_id === student.id);
      const attendance = store.attendanceRecords.filter((a) => a.student_id === student.id);
      const submissions = store.submissions.filter((sub) => sub.student_id === student.id);
      const quizAttempts = store.quizAttempts.filter((qa) => qa.student_id === student.id);
      const placement = store.placementProfiles.find((pp) => pp.student_id === student.id);
      const certificate = store.certificates.find((cert) => cert.student_id === student.id);
      const transfers = store.batchTransferAudits.filter((bta) => bta.student_id === student.id);
      const studentFees = (store.studentFees || []).filter((f) => f.student_id === student.id);
      const studentPayments = (store.studentPayments || []).filter((p) => p.student_id === student.id);
      const studentLedger = (store.studentFinancialLedgers || [])
        .filter((l) => l.student_id === student.id)
        .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
      const jobApplications = (store.jobApplications || []).filter((j) => j.student_id === student.id);
      const doubts = (store.doubts || []).filter((d) => d.student_id === student.id);
      const onboardingCase = (store.onboardingCases || []).find((c) => c.student_id === student.id || c.admission_id === student.admission_id);

      return {
        student,
        admission,
        course,
        batch,
        feeAccount,
        payments,
        receipts,
        attendance,
        submissions,
        quizAttempts,
        placement,
        certificate,
        transfers,
        studentFees,
        studentPayments,
        studentLedger,
        jobApplications,
        doubts,
        onboardingCase,
        snapshot: visibleWorkflowSnapshot(actor),
      };
    }, true);

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Student profile not found.' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    return NextResponse.json(
      { success: true, ...data },
      { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } }
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve student profile.';
    return NextResponse.json(
      { success: false, error: message },
      {
        status: message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 500,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
