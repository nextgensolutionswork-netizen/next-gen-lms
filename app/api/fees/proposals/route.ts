import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { assertSameTenant, isAccountsUser } from '@/lib/auth/tenant';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { feeWorkflowService as service } from '@/lib/services/fee-workflow-service';
import { store } from '@/lib/services/data-store';

const schema = z.object({ method: z.enum(['createFeeProposal', 'approveFee', 'rejectFee', 'requestFeeCorrection', 'updateAndResubmitFee', 'createFeeRevisionRequest', 'createFeeCategory']), args: z.array(z.any()).max(8) });
export async function POST(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Fee staff access required.');
    const { method, args } = schema.parse(await request.json());
    const data = await paymentTransaction(actor, () => {
      if (['approveFee', 'rejectFee', 'requestFeeCorrection', 'createFeeCategory'].includes(method) && !isAccountsUser(actor)) throw new Error('Forbidden: Accounts authorization required.');
      if (method === 'createFeeProposal') {
        const student = store.students.find((s) => s.id === args[0]?.student_id);
        if (!student) throw new Error('Student not found.');
        assertSameTenant(actor, student);
      } else if (method !== 'createFeeCategory') {
        const fee = store.studentFees.find((f) => f.id === args[0]);
        if (!fee) throw new Error('Fee not found.');
        assertSameTenant(actor, fee);
        if (actor.role === 'counsellor' && fee.counsellor_id !== actor.id) throw new Error('Forbidden: Only the submitting counsellor can change this fee.');
      }
      const result = method === 'createFeeProposal' ? service.createFeeProposal(args[0], actor.id, actor.role)
        : method === 'createFeeCategory' ? service.createFeeCategory({ ...args[0], tenant_id: actor.tenant_id } as any, actor.id)
        : method === 'approveFee' ? service.approveFee(args[0], actor.id, args[2])
        : method === 'rejectFee' ? service.rejectFee(args[0], actor.id, args[2])
        : method === 'requestFeeCorrection' ? service.requestFeeCorrection(args[0], actor.id, args[2], args[3])
        : method === 'updateAndResubmitFee' ? service.updateAndResubmitFee(args[0], actor.id, args[2])
        : service.createFeeRevisionRequest(args[0], actor.id, args[2], args[3], args[4]);
      return { result, snapshot: visibleWorkflowSnapshot(actor) };
    });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fee operation failed.';
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : /Forbidden|Access denied/.test(message) ? 403 : 400 });
  }
}
