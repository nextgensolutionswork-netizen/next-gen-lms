import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  getPlacementEnrollments,
  createPlacementEnrollment,
  overridePlacementEligibility,
  updatePlacementEnrollmentStatus,
  assignPlacementOfficer,
} from '@/lib/services/placement-service';
import { store } from '@/lib/services/data-store';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'all') as any;
    const search = searchParams.get('search') || undefined;
    const moduleFilter = searchParams.get('module') || undefined;
    let studentId = searchParams.get('student_id') || undefined;

    // Students can strictly view only their own placement enrollment
    if (auth.user.role === 'student') {
      const student = (store.students || []).find(
        (s) => s.id === auth.user.id || (s.email && s.email.toLowerCase() === auth.user.email?.toLowerCase())
      );
      studentId = student?.id || auth.user.id;
    }

    const enrollments = await getPlacementEnrollments({
      status,
      search,
      module: moduleFilter,
    });

    const filtered = studentId
      ? enrollments.filter((e) => e.student_id === studentId)
      : enrollments;

    return NextResponse.json(
      {
        success: true,
        enrollments: filtered,
        total: filtered.length,
        isLiveDatabase: isLiveSupabaseEnabled(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, private',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve placement enrollments',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator', 'student'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json();
    let studentIdToUse = body.student_id;

    if (auth.user.role === 'student') {
      const student = (store.students || []).find(
        (s) => s.id === auth.user.id || (s.email && s.email.toLowerCase() === auth.user.email?.toLowerCase())
      );
      studentIdToUse = student?.id || auth.user.id;
      body.student_id = studentIdToUse;
    }

    const enrollment = await createPlacementEnrollment(body, auth.user.id);

    return NextResponse.json(
      {
        success: true,
        enrollment,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to create placement enrollment',
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const { action, enrollment_id, reason, status, officer_id, officer_name, notes } = body;

    if (!enrollment_id) {
      return NextResponse.json(
        { success: false, error: 'enrollment_id is required' },
        { status: 400 }
      );
    }

    if (action === 'OVERRIDE_ELIGIBILITY' || action === 'override') {
      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { success: false, error: 'Mandatory justification reason is required for administrative eligibility override.' },
          { status: 400 }
        );
      }

      const updated = await overridePlacementEligibility(
        enrollment_id,
        auth.user.id,
        reason.trim(),
        auth.user.role,
        (auth.user as any).full_name || auth.user.email
      );

      return NextResponse.json({
        success: true,
        enrollment: updated,
        message: 'Placement eligibility override successfully granted.',
      });
    }

    if (action === 'UPDATE_STATUS') {
      if (!status) {
        return NextResponse.json({ success: false, error: 'status is required' }, { status: 400 });
      }
      const updated = await updatePlacementEnrollmentStatus(
        enrollment_id,
        status,
        auth.user.id,
        reason,
        notes
      );
      return NextResponse.json({ success: true, enrollment: updated });
    }

    if (action === 'ASSIGN_OFFICER') {
      if (!officer_id || !officer_name) {
        return NextResponse.json({ success: false, error: 'officer_id and officer_name are required' }, { status: 400 });
      }
      const updated = await assignPlacementOfficer(enrollment_id, officer_id, officer_name, auth.user.id);
      return NextResponse.json({ success: true, enrollment: updated });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update placement enrollment' },
      { status: err.message?.includes('Unauthorized') ? 403 : 400 }
    );
  }
}
