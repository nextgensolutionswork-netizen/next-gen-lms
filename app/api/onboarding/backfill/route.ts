import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { tenantId } from '@/lib/auth/tenant';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { backfillLegacyAdmissions } from '@/lib/services/onboarding-service';
import { canAssignOnboardingStaff } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/onboarding/backfill
 * 1-Click synchronization for legacy confirmed admissions into onboarding cases.
 * Restricted strictly to Administrators and Super Administrators.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'onboarding:assign',
    });

    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { user } = auth;
    return await paymentTransaction(user, async () => {

    if (!canAssignOnboardingStaff(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators can execute legacy onboarding sync.' },
        { status: 403 }
      );
    }

    const result = await backfillLegacyAdmissions(user);

    return NextResponse.json({
      success: true,
      message: `Legacy onboarding synchronization completed: ${result.cases_created} cases created, ${result.cases_skipped} already existing.`,
      result,
    });
    }, request.method === 'GET');
  } catch (error: any) {
    console.error('[API /api/onboarding/backfill] POST error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to backfill legacy admissions.' },
      { status: 500 }
    );
  }
}
