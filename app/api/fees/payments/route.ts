import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { store } from '@/lib/services/data-store';
import { assertSameTenant } from '@/lib/auth/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const details = z.object({
  amount_paid: z.number().finite().positive(),
  payment_mode: z.enum(['Cash', 'UPI', 'Card', 'Other', 'Payment Gateway', 'Credit Card', 'Debit Card', 'Net Banking', 'Bank Transfer', 'Cheque']),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid payment date'),
  transaction_reference: z.string().trim().max(200).optional(),
  bank_upi_reference: z.string().trim().max(200).optional(),
  payment_proof_url: z.string().min(1).max(4096).refine((v) => v.startsWith('/api/fees/proof?path=') || /^https:\/\//i.test(v), 'Attach payment proof'),
  notes: z.string().max(2000).optional(),
});
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('record'), input: details.extend({ fee_id: z.string().min(1), student_id: z.string().optional(), enrollment_id: z.string().optional(), idempotency_key: z.string().min(1).max(200) }) }),
  z.object({ action: z.literal('update'), paymentId: z.string(), input: details }),
  z.object({ action: z.literal('approve'), paymentId: z.string(), notes: z.string().max(2000).optional() }),
  z.object({ action: z.literal('reject'), paymentId: z.string(), reason: z.string().trim().min(1).max(2000) }),
]);

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Payment operation failed.';
  const status = message.startsWith('Unauthorized') ? 401 : /Forbidden|Access denied|Separation of duties/.test(message) ? 403 : message.startsWith('Conflict') ? 409 : 400;
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['student', 'counsellor', 'accountant', 'admin', 'super_admin', 'onboarding_team'].includes(actor.role)) throw new Error('Forbidden: Payment access required.');
    const snapshot = await paymentTransaction(actor, () => visibleWorkflowSnapshot(actor), true);
    return NextResponse.json({ success: true, snapshot }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Payment staff access required.');
    const body = command.parse(await request.json());
    const result = await paymentTransaction(actor, () => {
      if (body.action === 'record') {
        const studentFee = store.studentFees.find((f) => f.id === body.input.fee_id);
        if (!studentFee) throw new Error('Fee account not found.');
        assertSameTenant(actor, studentFee);
      } else {
        const existing = store.studentPayments.find((p) => p.id === body.paymentId);
        if (!existing) throw new Error('Payment not found.');
        assertSameTenant(actor, existing);
      }
      if ('input' in body && body.input.payment_mode !== 'Cash' && !body.input.transaction_reference?.trim() && !body.input.bank_upi_reference?.trim()) throw new Error('Transaction reference is required for non-cash payments.');
      const payment = body.action === 'record' ? feeWorkflowService.recordPayment(body.input, actor.id, actor.role)
        : body.action === 'update' ? feeWorkflowService.updatePayment(body.paymentId, body.input, actor.id, actor.role)
        : body.action === 'approve' ? feeWorkflowService.verifyPayment(body.paymentId, actor.id, body.notes)
        : feeWorkflowService.rejectPayment(body.paymentId, actor.id, body.reason);
      return { payment, snapshot: visibleWorkflowSnapshot(actor) };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return failure(error); }
}
