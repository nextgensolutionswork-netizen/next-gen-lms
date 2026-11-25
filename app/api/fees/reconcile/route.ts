import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { runFinancialReconciliation } from '@/lib/services/financial-reconciliation-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/fees/reconcile
 * Read-only 7-level financial reconciliation endpoint.
 * Restricted strictly to authorized financial roles (super_admin, admin, accountant).
 * Never mutates financial records.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['super_admin', 'admin', 'accountant'].includes(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Financial reconciliation access is restricted to administrators and accountants.' },
        { status: 403 }
      );
    }

    const tenant = actor.tenant_id || 'default';
    const report = await paymentTransaction(
      actor,
      () => runFinancialReconciliation(tenant),
      true
    );

    return NextResponse.json(
      { success: true, report },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconciliation check failed.';
    const status = message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
