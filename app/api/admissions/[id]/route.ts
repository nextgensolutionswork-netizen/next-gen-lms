import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import {
  ADMISSION_READ_ROLES,
  resolveAdmissionScope,
  assertAdmissionAccess,
} from '@/lib/auth/admission-access';
import { isLiveSupabaseEnabled, createClient } from '@/lib/supabase/db';
import type { Admission } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!ADMISSION_READ_ROLES.includes(actor.role as any)) {
      throw new Error('Forbidden: Admission access required.');
    }

    const rawId = (await params)?.id;
    if (!rawId || !rawId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Admission ID or admission number is required' },
        { status: 400 }
      );
    }

    const cleanId = rawId.trim();

    // 1. Check in-memory / persistent store
    let admission = store.admissions.find(
      (a) =>
        a.id.toLowerCase() === cleanId.toLowerCase() ||
        a.admission_number.toLowerCase() === cleanId.toLowerCase() ||
        a.student_unique_id?.toLowerCase() === cleanId.toLowerCase()
    );

    // 2. Check Supabase if live database enabled
    if (!admission && isLiveSupabaseEnabled()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('admissions')
          .select('*')
          .or(`id.eq.${cleanId},admission_number.ilike.${cleanId}`)
          .maybeSingle();

        if (!error && data) {
          admission = data as Admission;
        }
      } catch (err) {
        console.warn('[AdmissionsGetById] Database query failed:', err);
      }
    }

    if (!admission) {
      return NextResponse.json(
        { success: false, error: `Admission "${cleanId}" not found in institutional records.` },
        { status: 404 }
      );
    }

    // Role-based authorization assertion
    const scope = await resolveAdmissionScope(actor);
    assertAdmissionAccess(scope, admission);

    return NextResponse.json(
      { success: true, admission },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admission access denied.';
    return NextResponse.json(
      { success: false, error: message },
      {
        status: message.startsWith('Unauthorized')
          ? 401
          : message.startsWith('Forbidden')
          ? 403
          : 500,
      }
    );
  }
}
