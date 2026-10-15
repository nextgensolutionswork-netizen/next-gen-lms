import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  getOnboardingCases,
  getOnboardingKpis,
  ensureOnboardingCaseForAdmission,
  assignOnboardingStaff,
  OnboardingFilters,
} from '@/lib/services/onboarding-service';
import { canAssignOnboardingStaff } from '@/lib/auth/rbac';
import { store } from '@/lib/services/data-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/onboarding/cases
 * Lists onboarding cases with optional filters: search, status, courseId, staffId, includeKpis.
 * Enforces role-based access: super_admin, admin, onboarding_team.
 * For onboarding_team, automatically enforces assignment scope (assigned_staff_id === user.id).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin', 'onboarding_team'],
      requiredPermission: 'onboarding:read',
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { user } = auth;
    return await paymentTransaction(user, async () => {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const courseId = searchParams.get('courseId') || undefined;
    const staffId = searchParams.get('staffId') || undefined;
    const includeKpis = searchParams.get('includeKpis') === 'true';

    const filters: OnboardingFilters = {
      search,
      status: status && status.toLowerCase() !== 'all' ? status : undefined,
      courseId: courseId && courseId.toLowerCase() !== 'all' ? courseId : undefined,
      staffId: staffId && staffId.toLowerCase() !== 'all' ? staffId : undefined,
    };

    const cases = await getOnboardingCases(user, filters);
    let kpis = undefined;

    if (includeKpis) {
      kpis = await getOnboardingKpis(user);
    }

    return NextResponse.json({
      success: true,
      count: cases.length,
      cases,
      ...(kpis ? { kpis } : {}),
    });
    }, request.method === 'GET');
  } catch (error: any) {
    console.error('[API /api/onboarding/cases] GET error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to retrieve onboarding cases.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/onboarding/cases
 * Creates or ensures an onboarding case for a confirmed student admission.
 * Restricted to Administrators and Super Administrators.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'onboarding:write',
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { user } = auth;
    return await paymentTransaction(user, async () => {

    if (!canAssignOnboardingStaff(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient privileges to create onboarding cases.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { admissionId, assignedStaffId } = body;

    if (!admissionId || typeof admissionId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: "admissionId" must be provided.' },
        { status: 400 }
      );
    }

    const admission = store.admissions.find(
      (a) => a.id === admissionId || a.admission_number?.toLowerCase() === admissionId.toLowerCase()
    );

    if (!admission) {
      return NextResponse.json(
        { success: false, error: `Admission record "${admissionId}" not found in institutional database.` },
        { status: 404 }
      );
    }

    if (admission.status !== 'Confirmed') {
      return NextResponse.json(
        {
          success: false,
          error: `Admission status is "${admission.status}". Only confirmed admissions are eligible for onboarding.`,
        },
        { status: 422 }
      );
    }

    let onboardingCase = await ensureOnboardingCaseForAdmission(admission.id, user.id);

    if (assignedStaffId && typeof assignedStaffId === 'string') {
      onboardingCase = await assignOnboardingStaff(onboardingCase.id, assignedStaffId, user);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Onboarding case successfully initialized.',
        case: onboardingCase,
      },
      { status: 201 }
    );
    }, request.method === 'GET');
  } catch (error: any) {
    console.error('[API /api/onboarding/cases] POST error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to initialize onboarding case.' },
      { status: 500 }
    );
  }
}
