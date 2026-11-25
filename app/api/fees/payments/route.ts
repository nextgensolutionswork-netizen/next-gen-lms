import { normalizePaymentFields } from '@/lib/services/payment-entry-rules';
import { PaymentVerificationError } from '@/lib/services/manual-payment-verification';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { store } from '@/lib/services/data-store';
import { assertSameTenant } from '@/lib/auth/tenant';
import { isPaymentPending } from '@/lib/utils/dashboard-metrics';
import { getAuthorizedBankAccounts } from '@/lib/utils/bank-autofill';
import { idempotencyService, IdempotencyConflictError } from '@/lib/services/idempotency-service';
import { emitSyncEvent } from '@/lib/services/sync-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const details = z.object({
  amount_paid: z.number().finite().positive(),
  payment_mode: z.enum(['Cash', 'UPI', 'Card', 'Other', 'Payment Gateway', 'Credit Card', 'Debit Card', 'Net Banking', 'Bank Transfer', 'Cheque']),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid payment date'),
  transaction_reference: z.string().trim().max(200).nullable().optional(),
  bank_upi_reference: z.string().trim().max(200).optional(),
  payment_proof_url: z.string().max(4096).refine((v) => !v || v.startsWith('/api/fees/proof?path=') || /^https:\/\//i.test(v), 'Attach valid payment proof').optional(),
  notes: z.string().max(2000).optional(),
  installment_id: z.string().trim().max(200).optional(),
  our_bank_profile_id: z.string().trim().max(200).optional(),
  our_bank_name: z.string().trim().max(200).optional(),
  our_bank_account_name: z.string().trim().max(200).optional(),
  our_bank_account_id: z.string().trim().max(200).optional(),
  our_upi_details: z.string().trim().max(200).optional(),
});
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('record'), input: details.extend({ fee_id: z.string().min(1), student_id: z.string().optional(), enrollment_id: z.string().optional(), idempotency_key: z.string().min(1).max(200) }) }),
  z.object({ action: z.literal('update'), paymentId: z.string(), input: details }),
  z.object({
    action: z.literal('approve'),
    paymentId: z.string(),
    idempotency_key: z.string().min(1).max(200).optional(),
    notes: z.string().max(2000).optional(),
    verification: z.object({
      reference: z.string().max(200).optional(),
      amount: z.string().max(100),
      payment_date: z.string().max(40),
      receiving_bank_profile_id: z.string().max(200).optional(),
      bank_account_discrepancy_reason: z.string().max(2000).optional(),
    }).optional(),
  }),
  z.object({ action: z.literal('reject'), paymentId: z.string(), reason: z.string().trim().min(1).max(2000), idempotency_key: z.string().min(1).max(200).optional() }),
  z.object({ action: z.literal('void_receipt'), receiptId: z.string().min(1), reason: z.string().trim().min(1).max(2000), amount: z.number().finite().positive().optional() }),
]);

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Payment operation failed.';
  const status = error instanceof IdempotencyConflictError
    ? 409
    : message.startsWith('Unauthorized')
      ? 401
      : /Forbidden|Access denied|Separation of duties/.test(message)
        ? 403
        : message.startsWith('Conflict')
          ? 409
          : 400;
  return NextResponse.json({ success: false, error: message, ...(error instanceof PaymentVerificationError ? { fieldErrors: error.fieldErrors } : {}) }, { status });
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
    const raw = await request.json();
    if (raw?.input) raw.input = normalizePaymentFields(raw.input);
    const body = command.parse(raw);
    const targetTenant = actor.tenant_id || 'default';

    let acquiredIdemp: { key: string; actorId: string; tenant: string; scope: string } | null = null;
    if (body.action === 'record') {
      const idemp = await idempotencyService.acquireAsync(body.input.idempotency_key, actor.id, targetTenant, body.input, 'payment_record');
      if (idemp.isExisting && idemp.result) {
        return NextResponse.json(idemp.result);
      }
      acquiredIdemp = { key: body.input.idempotency_key, actorId: actor.id, tenant: targetTenant, scope: 'payment_record' };
    } else if ((body.action === 'approve' || body.action === 'reject') && body.idempotency_key) {
      const scope = body.action === 'approve' ? 'payment_approve' : 'payment_reject';
      const idemp = await idempotencyService.acquireAsync(body.idempotency_key, actor.id, targetTenant, body, scope);
      if (idemp.isExisting && idemp.result) {
        return NextResponse.json(idemp.result);
      }
      acquiredIdemp = { key: body.idempotency_key, actorId: actor.id, tenant: targetTenant, scope };
    }

    let result;
    try {
      result = await paymentTransaction(actor, () => {
      if (body.action === 'void_receipt') {
        if (!['accountant', 'admin', 'super_admin'].includes(actor.role)) {
          throw new Error('Forbidden: Only Accounts or Administrators can void receipts.');
        }
        const receipt = (store.receipts || []).find((r) => r.id === body.receiptId || r.receipt_number === body.receiptId);
        if (!receipt) throw new Error('Receipt not found.');
        assertSameTenant(actor, receipt);
        const voidRes = feeWorkflowService.voidReceipt(receipt.id, actor.id, body.reason, body.amount);
        return { result: voidRes, snapshot: visibleWorkflowSnapshot(actor) };
      }
      if (body.action === 'record') {
        const studentFee = store.studentFees.find((f) => f.id === body.input.fee_id);
        if (!studentFee) throw new Error('Fee account not found.');
        assertSameTenant(actor, studentFee);
        if (body.input.our_bank_profile_id) {
          const validAccounts = getAuthorizedBankAccounts(actor.role, { includePending: false });
          const matchedAcc = validAccounts.find((a) => a.id === body.input.our_bank_profile_id);
          if (!matchedAcc) {
            throw new Error('The selected receiving bank account is invalid or unavailable. Please select a valid account.');
          }
          if ((matchedAcc as any).tenant_id && (matchedAcc as any).tenant_id !== targetTenant && targetTenant !== 'default') {
            throw new Error('Forbidden: Cross-tenant receiving bank account is not permitted.');
          }
        }
      } else {
        const existing = store.studentPayments.find(
          (p) => p.id === body.paymentId || p.id === body.paymentId.replace(/^pay-/, '') || `pay-${p.id}` === body.paymentId
        );
        if (!existing) throw new Error('Payment not found.');
        assertSameTenant(actor, existing);
        const legacyPayment = (store.payments || []).find(
          (p) => p.id === body.paymentId || p.id === `pay-${existing.id}` || p.id === existing.id
        );
        const linkedReceipt = (store.receipts || []).find(
          (r) =>
            r.payment_id === existing.id ||
            r.payment_id === `pay-${existing.id}` ||
            (existing.receipt_number && r.receipt_number === existing.receipt_number)
        );

        if (body.action === 'approve' || body.action === 'reject') {
          if (!['accountant', 'admin', 'super_admin'].includes(actor.role)) {
            throw new Error('Forbidden: Only Accounts or Administrators can approve or reject payments.');
          }
          if (existing.recorded_by === actor.id || (existing as any).collected_by === actor.id || legacyPayment?.collected_by === actor.id) {
            throw new Error(
              body.action === 'approve'
                ? 'Separation of duties violation: Payment recorder cannot verify their own payment entry.'
                : 'Separation of duties violation: Submitter cannot reject their own payment.'
            );
          }
          const receiptStatus = (linkedReceipt as any)?.receipt_status || (linkedReceipt?.status === 'Void' ? 'Void' : undefined);
          const pendingCheck = isPaymentPending({
            status: existing.status,
            verification_status: existing.verification_status,
            receipt_status: receiptStatus,
          }) && (!legacyPayment || isPaymentPending({ status: legacyPayment.status, receipt_status: receiptStatus }));

          if (!pendingCheck) {
            throw new Error(
              body.action === 'approve'
                ? 'Only a payment pending approval can be approved; it may already be verified or rejected.'
                : 'Cannot reject an already verified payment. Please process a refund or adjustment note.'
            );
          }
        }
      }
      if ('input' in body && body.input.payment_mode !== 'Cash' && !body.input.transaction_reference?.trim() && !body.input.bank_upi_reference?.trim()) throw new Error('Transaction reference is required for non-cash payments.');
      const payment = body.action === 'record' ? feeWorkflowService.recordPayment(body.input, actor.id, actor.role)
        : body.action === 'update' ? feeWorkflowService.updatePayment(body.paymentId, body.input, actor.id, actor.role)
        : body.action === 'approve' ? feeWorkflowService.verifyPayment(body.paymentId, actor.id, body.notes, body.verification)
        : feeWorkflowService.rejectPayment(body.paymentId, actor.id, body.reason);
      return { payment, snapshot: visibleWorkflowSnapshot(actor) };
    });
    } catch (txErr) {
      if (acquiredIdemp) {
        await idempotencyService.failAsync(acquiredIdemp.key, acquiredIdemp.actorId, acquiredIdemp.tenant, acquiredIdemp.scope);
      }
      throw txErr;
    }

    const responsePayload = { success: true, ...result };
    if (body.action === 'record') {
      await idempotencyService.completeAsync(body.input.idempotency_key, actor.id, targetTenant, responsePayload, 'payment_record');
      emitSyncEvent('payments', 'recorded', {
        entity_id: result.payment?.id,
        tenant_id: targetTenant,
        actor_id: actor.id,
      });
    } else if (body.action === 'approve') {
      if (body.idempotency_key) {
        await idempotencyService.completeAsync(body.idempotency_key, actor.id, targetTenant, responsePayload, 'payment_approve');
      }
      emitSyncEvent('payments', 'approved', {
        entity_id: body.paymentId,
        tenant_id: targetTenant,
        actor_id: actor.id,
      });
      emitSyncEvent('receipts', 'issued', {
        tenant_id: targetTenant,
        actor_id: actor.id,
      });
    } else if (body.action === 'reject') {
      if (body.idempotency_key) {
        await idempotencyService.completeAsync(body.idempotency_key, actor.id, targetTenant, responsePayload, 'payment_reject');
      }
      emitSyncEvent('payments', 'rejected', {
        entity_id: body.paymentId,
        tenant_id: targetTenant,
        actor_id: actor.id,
      });
    } else if (body.action === 'void_receipt') {
      emitSyncEvent('receipts', 'voided', {
        entity_id: body.receiptId,
        tenant_id: targetTenant,
        actor_id: actor.id,
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error) { return failure(error); }
}
