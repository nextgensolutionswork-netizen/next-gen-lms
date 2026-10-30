import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { createAdmissionWorkflow, CreateAdmissionInput } from '@/lib/services/admission-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({
  student_name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  course_id: z.string().min(1),
  course_fee: z.number().finite().positive(),
  discount: z.number().finite().nonnegative(),
  initial_payment_amount: z.number().finite().nonnegative().optional(),
  payment_mode: z.enum(['Cash', 'UPI', 'Card', 'Other', 'Payment Gateway', 'Credit Card', 'Debit Card', 'Net Banking', 'Bank Transfer', 'Cheque']).optional(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid payment date').optional(),
  transaction_reference: z.string().trim().max(200).optional(),
  bank_upi_reference: z.string().trim().max(200).optional(),
  payment_proof_url: z.string().max(4096).refine((v) => !v || v.startsWith('/api/fees/proof?path=') || /^https:\/\//i.test(v), 'Attach valid payment proof').optional(),
  idempotency_key: z.string().trim().max(200).optional(),
  payment_plan: z.string().optional(),
}).passthrough();

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'admin', 'super_admin', 'onboarding_team'].includes(actor.role)) throw new Error('Forbidden: Admission access required.');
    const snapshot = await paymentTransaction(actor, () => visibleWorkflowSnapshot(actor), true);
    return NextResponse.json({ success: true, snapshot }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Admission access denied.' }, { status: 403 }); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Admission registration requires counsellor access.');
    const input = schema.parse(await request.json()) as unknown as CreateAdmissionInput;
    if (input.initial_payment_amount && input.initial_payment_amount > 0) {
      if (!input.payment_proof_url) throw new Error('Attach payment proof before submitting the initial payment.');
      const mode = input.payment_mode || 'UPI';
      if (mode !== 'Cash' && !input.transaction_reference?.trim() && !input.bank_upi_reference?.trim()) {
        throw new Error('Transaction reference is required for non-cash initial payments.');
      }
    }
    const data = await paymentTransaction(actor, async () => {
      const result = await createAdmissionWorkflow({ ...input, counsellor_id: actor.role === 'counsellor' ? actor.id : input.counsellor_id }, actor.id, true);
      return { result, snapshot: visibleWorkflowSnapshot(actor) };
    });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admission failed.';
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 400 });
  }
}
