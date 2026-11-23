import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { authorizedLead } from '@/lib/services/lead-security';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    const id = request.nextUrl.searchParams.get('leadId') || '';
    await authorizedLead(id, actor);
    let logs = store.auditLogs.filter(l => l.module === 'CRM' && l.record_id === id);
    if (isLiveSupabaseEnabled()) {
      const result = await createAdminClient().from('audit_logs').select('*').eq('module', 'CRM').eq('record_id', id).order('created_at', { ascending: false });
      if (result.error) throw new Error('CRM history unavailable.');
      logs = (result.data || []).map(l => ({ ...l, ...l.payload }));
    }
    return NextResponse.json({ success: true, logs }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CRM history unavailable.';
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : 403 });
  }
}
