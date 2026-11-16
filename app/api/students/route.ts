import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { store } from '@/lib/services/data-store';
import { tenantId } from '@/lib/auth/tenant';
import type { Student } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
        { success: false, error: 'Forbidden: Student directory access required.' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const { searchParams } = request.nextUrl;
    const courseId = searchParams.get('course_id') || undefined;
    const batchId = searchParams.get('batch_id') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search')?.trim().toLowerCase() || undefined;

    const data = await paymentTransaction(actor, async () => {
      // 1. Reconcile admissions to students idempotently
      store.reconcileAdmissionsAndStudents();
      const snapshot = visibleWorkflowSnapshot(actor);
      const tenant = tenantId(actor);

      let students: Student[] = (snapshot.students || store.students || []).filter(
        (s) => tenantId(s) === tenant
      );

      // 2. Role-based scoping
      if (actor.role === 'student') {
        students = students.filter(
          (s) => s.user_id === actor.id || s.id === (actor as any).student_id
        );
      } else if (actor.role === 'counsellor') {
        const counsellorAdmissionIds = new Set(
          (store.admissions || [])
            .filter((a) => a.counsellor_id === actor.id || tenantId(a) === tenant)
            .map((a) => a.id)
        );
        students = students.filter(
          (s) =>
            counsellorAdmissionIds.has(s.admission_id) ||
            s.counsellor_id === actor.id ||
            tenantId(s) === tenant
        );
      }

      // 3. Query parameter filters
      if (courseId && courseId !== 'All') {
        students = students.filter((s) => s.course_id === courseId);
      }
      if (batchId && batchId !== 'All') {
        students = students.filter((s) => s.batch_id === batchId);
      }
      if (status && status !== 'All') {
        students = students.filter((s) => s.status === status);
      }
      if (search) {
        students = students.filter(
          (s) =>
            s.full_name?.toLowerCase().includes(search) ||
            s.student_code?.toLowerCase().includes(search) ||
            s.student_unique_id?.toLowerCase().includes(search) ||
            s.admission_number?.toLowerCase().includes(search) ||
            s.email?.toLowerCase().includes(search) ||
            (s.phone != null && String(s.phone).toLowerCase().includes(search))
        );
      }

      return { students, snapshot };
    }, false);

    return NextResponse.json(
      {
        success: true,
        count: data.students.length,
        students: data.students,
        snapshot: data.snapshot,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve students.';
    return NextResponse.json(
      { success: false, error: message },
      {
        status: message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 500,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
