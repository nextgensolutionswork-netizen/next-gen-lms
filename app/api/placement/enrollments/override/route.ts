import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { overridePlacementEligibility } from '@/lib/services/placement-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'placement_coordinator'],
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const { enrollment_id, reason } = body;

    if (!enrollment_id) {
      return NextResponse.json(
        { success: false, error: 'enrollment_id is required' },
        { status: 400 }
      );
    }

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
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to override placement eligibility' },
      { status: err.message?.includes('Unauthorized') ? 403 : 400 }
    );
  }
}
