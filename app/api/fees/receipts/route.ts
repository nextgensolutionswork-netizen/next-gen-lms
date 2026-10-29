import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { store } from '@/lib/services/data-store';
import { tenantId } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['student', 'counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) return NextResponse.json({ success: false }, { status: 403 });
    const snapshot = await paymentTransaction(actor, () => {
      const students = store.students.filter((s) => tenantId(s) === tenantId(actor) && (actor.role !== 'student' || s.user_id === actor.id));
      return { students, receipts: store.receipts.filter((r) => tenantId(r) === tenantId(actor) && students.some((s) => s.id === r.student_id)) };
    }, true);
    return NextResponse.json({ success: true, snapshot }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ success: false, error: 'Receipt access denied.' }, { status: 401 }); }
}
