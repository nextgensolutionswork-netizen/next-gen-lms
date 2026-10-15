import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { tenantId } from '@/lib/auth/tenant';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import {
  getOnboardingKpis,
  getOnboardingStaffPerformance,
  getUnbackfilledAdmissionsCount,
  getEligibleOnboardingStaff,
} from '@/lib/services/onboarding-service';
import { canAssignOnboardingStaff } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/onboarding/analytics
 * Returns aggregate onboarding KPIs. For administrators, includes individual staff
 * SLA performance analytics, eligible staff directory, and legacy admissions sync count.
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
    const kpis = await getOnboardingKpis(user);

    const isAdmin = canAssignOnboardingStaff(user);
    let staffPerformance = undefined;
    let unbackfilledCount = undefined;
    let eligibleStaff = undefined;

    if (isAdmin) {
      staffPerformance = await getOnboardingStaffPerformance(user);
      unbackfilledCount = await getUnbackfilledAdmissionsCount(user);
      eligibleStaff = (await getEligibleOnboardingStaff()).filter((u) => tenantId(u) === tenantId(user));
    }

    return NextResponse.json({
      success: true,
      kpis,
      ...(staffPerformance ? { staffPerformance } : {}),
      ...(typeof unbackfilledCount === 'number' ? { unbackfilledCount } : {}),
      ...(eligibleStaff ? { eligibleStaff } : {}),
    });
    }, request.method === 'GET');
  } catch (error: any) {
    console.error('[API /api/onboarding/analytics] GET error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to retrieve onboarding analytics.' },
      { status: 500 }
    );
  }
}
