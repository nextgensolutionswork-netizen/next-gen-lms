import { NextRequest, NextResponse } from 'next/server';
import { createLead, getLeads, updateLeadDetails, updateLeadStage } from '@/lib/services/crm-service';
import { requireCrmActor } from '@/lib/auth/lead-access';
import { authorizedLead } from '@/lib/services/lead-security';
import { resolveLeadScope, scopeLeadQuery } from '@/lib/services/lead-security';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';

async function authorize(request: NextRequest) {
  const actor = await authenticatePaymentRequest(request);
  requireCrmActor(actor);
  return actor;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Lead request failed.';
  return NextResponse.json({ success: false, error: message }, {
    status: message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 400,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const leadId = request.nextUrl.searchParams.get('leadId');
    if (leadId) return NextResponse.json({ success: true, lead: await authorizedLead(leadId, actor) }, { headers: { 'Cache-Control': 'private, no-store' } });
    const stage = request.nextUrl.searchParams.get('stage') || undefined;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const leads = await getLeads({
      stage: stage as any,
      search,
      counsellor_id: request.nextUrl.searchParams.get('counsellor_id') || undefined,
      created_by: request.nextUrl.searchParams.get('created_by') || undefined,
      course_id: request.nextUrl.searchParams.get('course_id') || undefined,
      from: request.nextUrl.searchParams.get('from') || undefined,
      to: request.nextUrl.searchParams.get('to') || undefined,
      team_id: request.nextUrl.searchParams.get('team_id') || undefined,
      training_preference: request.nextUrl.searchParams.get('training_preference') || undefined,
      lead_source: request.nextUrl.searchParams.get('lead_source') || undefined,
    }, actor);
    return NextResponse.json({ success: true, leads }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const body = await request.json();
    if (body.created_by !== undefined && body.created_by !== actor.id) {
      return NextResponse.json({ success: false, error: 'Forbidden: Cannot impersonate a creator.' }, { status: 403 });
    }
    if (body.tenant_id !== undefined && body.tenant_id !== actor.tenant_id) {
      return NextResponse.json({ success: false, error: 'Forbidden: Tenant mismatch.' }, { status: 403 });
    }
    const lead = await createLead({
      ...body,
      ...(actor.role === 'counsellor' ? { counsellor_id: actor.id } : {}),
    }, actor);
    return NextResponse.json({ success: true, lead });
  } catch (err: any) {
    return failure(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const body = await request.json();
    const { leadId, updates } = body;
    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }
    await authorizedLead(leadId, actor);
    const lead = body.action === 'stage'
      ? await updateLeadStage(leadId, body.stage, body.notes || '', actor.id, body.followUpDate, actor)
      : await updateLeadDetails(leadId, updates, actor.id, actor);
    return NextResponse.json({ success: true, lead });
  } catch (err: any) {
    return failure(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const scope = await resolveLeadScope(actor);
    if (!['super_admin', 'admin'].includes(scope.actor.role)) throw new Error('Forbidden: Management deletion required.');
    const { leadId } = await request.json();
    await authorizedLead(leadId, actor);
    if (isLiveSupabaseEnabled()) {
      const result = await scopeLeadQuery(createAdminClient().from('leads').delete().eq('id', leadId), scope).select('id');
      if (result.error || !result.data?.length) throw new Error('CRM deletion failed.');
    }
    store.leads = store.leads.filter(l => l.id !== leadId);
    store.persist();
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
