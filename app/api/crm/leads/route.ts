import { NextRequest, NextResponse } from 'next/server';
import { createLead, getLeads } from '@/lib/services/crm-service';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { tenantId } from '@/lib/auth/tenant';

async function authorize(request: NextRequest) {
  const actor = await authenticatePaymentRequest(request);
  if (!['super_admin', 'admin', 'counsellor'].includes(actor.role) || tenantId(actor) !== 'default') {
    throw new Error('Forbidden: CRM access required.');
  }
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
    await authorize(request);
    const stage = request.nextUrl.searchParams.get('stage') || undefined;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const leads = await getLeads({
      stage: stage as any,
      search,
    });
    return NextResponse.json({ success: true, leads }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const body = await request.json();
    const lead = await createLead({ ...body, ...(actor.role === 'counsellor' ? { counsellor_id: actor.id } : {}) });
    return NextResponse.json({ success: true, lead });
  } catch (err: any) {
    return failure(err);
  }
}
