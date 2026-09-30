import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  createGatewayOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  processRazorpayWebhookEvent,
} from '@/lib/services/payment-gateway-service';
import { store } from '@/lib/services/data-store';
import { NextRequest } from 'next/server';
import { POST as createOrderRouteHandler } from '@/app/api/payments/create-order/route';
import { POST as verifyRouteHandler } from '@/app/api/payments/verify/route';
import { POST as webhookRouteHandler } from '@/app/api/webhooks/razorpay/route';

describe('10. Razorpay / Cashfree Gateway & Webhook Reconciliation Tests', () => {
  const secretKey = 'test_secret_key_123456';
  const webhookSecret = 'test_webhook_secret_654321';

  beforeEach(() => {
    // Ensure test student fee account has predictable balance
    const feeAccount = store.feeAccounts[0];
    if (feeAccount) {
      feeAccount.net_payable = 75000;
      feeAccount.paid_amount = 40000;
      feeAccount.outstanding_amount = 35000;
      feeAccount.status = 'Partially Paid';
    }
  });

  describe('Payment Signature Verification', () => {
    it('successfully verifies genuine Razorpay payment signature', () => {
      const orderId = 'order_DA2910AKSF10';
      const paymentId = 'pay_992104AAKLS';
      const payload = `${orderId}|${paymentId}`;
      const validSignature = crypto
        .createHmac('sha256', secretKey)
        .update(payload)
        .digest('hex');

      const isValid = verifyRazorpayPaymentSignature(orderId, paymentId, validSignature, secretKey);
      expect(isValid).toBe(true);
    });

    it('rejects forged or tampered payment signature', () => {
      const orderId = 'order_DA2910AKSF10';
      const paymentId = 'pay_992104AAKLS';
      const fakeSignature = 'bad_forged_signature_1234567890abcdef';

      const isValid = verifyRazorpayPaymentSignature(orderId, paymentId, fakeSignature, secretKey);
      expect(isValid).toBe(false);
    });

    it('rejects signature if paymentId was switched', () => {
      const orderId = 'order_DA2910AKSF10';
      const validPaymentId = 'pay_VALID_001';
      const validSignature = crypto
        .createHmac('sha256', secretKey)
        .update(`${orderId}|${validPaymentId}`)
        .digest('hex');

      // Attacker switches payment ID
      const isValid = verifyRazorpayPaymentSignature(orderId, 'pay_TAMPERED_002', validSignature, secretKey);
      expect(isValid).toBe(false);
    });
  });

  describe('Webhook Signature Verification', () => {
    it('verifies genuine webhook payload with valid secret', () => {
      const rawBody = JSON.stringify({
        entity: 'event',
        event: 'payment.captured',
        created_at: 1727680000,
      });

      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const isValid = verifyRazorpayWebhookSignature(rawBody, validSignature, webhookSecret);
      expect(isValid).toBe(true);
    });

    it('rejects webhook with modified payload body', () => {
      const rawBody = JSON.stringify({ event: 'payment.captured' });
      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const tamperedBody = JSON.stringify({ event: 'payment.captured', tampered: true });
      const isValid = verifyRazorpayWebhookSignature(tamperedBody, validSignature, webhookSecret);
      expect(isValid).toBe(false);
    });
  });

  describe('Gateway Order Creation', () => {
    it('creates gateway order converted to paise with notes references', async () => {
      const student = store.students[0];
      const feeAccount = store.feeAccounts[0];

      const orderResult = await createGatewayOrder({
        amount: 15000,
        currency: 'INR',
        student_id: student.id,
        course_id: student.course_id,
        fee_account_id: feeAccount.id,
        student_name: student.full_name,
      });

      expect(orderResult.order_id).toBeTruthy();
      expect(orderResult.amount).toBe(1500000); // 15,000 INR * 100 paise
      expect(orderResult.currency).toBe('INR');
      expect(orderResult.notes.student_id).toBe(student.id);
      expect(orderResult.notes.fee_account_id).toBe(feeAccount.id);
    });
  });

  describe('Webhook Event Processing & Auto-Reconciliation', () => {
    it('auto-reconciles payment.captured event and credits student fee ledger atomically', async () => {
      const student = store.students[0];
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;
      const initialPaid = feeAccount.paid_amount;
      const initialOutstanding = feeAccount.outstanding_amount;

      const testPaymentId = `pay_hook_${Date.now()}`;
      const testOrderId = `order_hook_${Date.now()}`;
      const paymentAmountINR = 10000;

      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: testPaymentId,
              order_id: testOrderId,
              amount: paymentAmountINR * 100, // in paise
              currency: 'INR',
              status: 'captured',
              notes: {
                student_id: student.id,
                course_id: student.course_id,
                fee_account_id: feeAccount.id,
              },
            },
          },
        },
      };

      const result = await processRazorpayWebhookEvent(webhookPayload);

      expect(result.processed).toBe(true);
      expect(result.reconciled).toBe(true);
      expect(result.paymentId).toBe(testPaymentId);
      expect(result.receiptNumber).toBeTruthy();

      // Verify fee account was updated
      expect(feeAccount.paid_amount).toBe(initialPaid + paymentAmountINR);
      expect(feeAccount.outstanding_amount).toBe(initialOutstanding - paymentAmountINR);

      // Verify payment was recorded in store
      const recorded = store.payments.find((p) => p.transaction_reference === testPaymentId);
      expect(recorded).toBeDefined();
      expect(recorded?.amount).toBe(paymentAmountINR);
      expect(recorded?.gateway_name).toBe('Razorpay');

      // IDEMPOTENCY TEST: Re-submitting the exact same webhook event must not create duplicate receipt
      const repeatResult = await processRazorpayWebhookEvent(webhookPayload);
      expect(repeatResult.processed).toBe(true);
      expect(repeatResult.reconciled).toBe(false);
      expect(repeatResult.message).toContain('already reconciled previously');
      // Paid amount must NOT increase again
      expect(feeAccount.paid_amount).toBe(initialPaid + paymentAmountINR);
    });

    it('safely skips non-captured events without updating ledger', async () => {
      const result = await processRazorpayWebhookEvent({
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_fail_001' } } },
      });

      expect(result.processed).toBe(true);
      expect(result.reconciled).toBe(false);
      expect(result.message).toContain('Not a captured payment');
    });
  });

  describe('Payment API Endpoints', () => {
    it('creates order via POST /api/payments/create-order', async () => {
      const student = store.students[0];
      const feeAccount = store.feeAccounts[0];

      const req = new NextRequest('http://localhost:3000/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 5000,
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
        }),
      });

      const res = await createOrderRouteHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.order.amount).toBe(500000);
    });

    it('reconciles via POST /api/webhooks/razorpay with valid signature', async () => {
      const student = store.students[0];
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;
      const testPaymentId = `pay_api_hook_${Date.now()}`;
      const testOrderId = `order_api_hook_${Date.now()}`;

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: testPaymentId,
              order_id: testOrderId,
              amount: 500000,
              notes: {
                student_id: student.id,
                course_id: student.course_id,
                fee_account_id: feeAccount.id,
              },
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', 'rzp_webhook_secret_2026')
        .update(rawBody)
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await webhookRouteHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.reconciled).toBe(true);
      expect(json.paymentId).toBe(testPaymentId);
    });
  });
});
