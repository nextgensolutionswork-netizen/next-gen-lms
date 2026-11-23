import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEligibleAdmissionsCounsellors, isStaleDemoCounsellor } from '@/lib/services/counsellor-service';
import { tenantId } from '@/lib/auth/tenant';
import { UserProfile } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    const allowedRoles = ['super_admin', 'admin', 'counsellor', 'counsellor_lead', 'accountant', 'onboarding_team'];
    if (!allowedRoles.includes(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admissions counsellor access required.' },
        { status: 403 }
      );
    }

    const actorTenant = tenantId(actor) || 'default';
    const reqTenant = request.nextUrl.searchParams.get('tenant');
    const currentTenant = (actor.role === 'super_admin' && reqTenant) ? reqTenant : actorTenant;

    let userCandidates: UserProfile[] = [];

    if (isLiveSupabaseEnabled()) {
      try {
        const adminClient = createAdminClient();
        const { data: profiles, error } = await adminClient
          .from('profiles')
          .select('*')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (!error && profiles && profiles.length > 0) {
          userCandidates = profiles as UserProfile[];
          // Update store users with live profiles
          store.users = profiles as UserProfile[];
          store.reconcileAuthoritativeStaffProfiles();
        }
      } catch (err: any) {
        console.warn('[Counsellors API] Live Supabase query error, using local store:', err?.message);
      }
    }

    if (userCandidates.length === 0) {
      store.reconcileAuthoritativeStaffProfiles();
      userCandidates = store.users || [];
    }

    const rawCounsellors = getEligibleAdmissionsCounsellors(userCandidates, currentTenant);
    // Remove stale demo-only accounts absent from authoritative database (profiles)
    const counsellors = rawCounsellors.filter((c) => !isStaleDemoCounsellor(c));

    return NextResponse.json(
      {
        success: true,
        counsellors,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Admissions counsellor access denied.' },
      { status: 401 }
    );
  }
}
