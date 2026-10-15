import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { store } from '@/lib/services/data-store';
import { tenantId } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';
async function handle(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    const notifications = await paymentTransaction(actor, () => {
      const own = store.notifications.filter((n) => n.user_id === actor.id && tenantId(n) === tenantId(actor));
      if (request.method === 'POST') own.forEach((n) => { n.is_read = true; });
      return own;
    }, request.method === 'GET');
    return NextResponse.json({ success: true, notifications }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ success: false, error: 'Valid session required.' }, { status: 401 }); }
}
export const GET = handle;
export const POST = handle;
