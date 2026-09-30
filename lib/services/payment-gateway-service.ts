import crypto from 'crypto';
import { recordPaymentAtomic } from './finance-service';
import { recordAuditLog } from './audit-service';
import { store } from './data-store';
import { Payment } from '@/types';

export interface GatewayConfig {
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
}

export function getGatewayConfig(): GatewayConfig {
  return {
    razorpayKeyId:
      process.env.RAZORPAY_KEY_ID ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      'rzp_test_mock_erp_key',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_mock_erp_secret',
    razorpayWebhookSecret:
      process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_2026',
  };
}

export function isLiveRazorpayConfigured(): boolean {
  const cfg = getGatewayConfig();
  return (
    !cfg.razorpayKeyId.includes('mock') &&
    !cfg.razorpayKeySecret.includes('mock') &&
    Boolean(process.env.RAZORPAY_KEY_ID)
  );
}

export interface CreateOrderInput {
  amount: number; // in INR (e.g. 10000)
  currency?: string;
  student_id: string;
  course_id: string;
  fee_account_id: string;
  installment_id?: string;
  student_name?: string;
  student_email?: string;
  notes?: Record<string, string>;
}

export interface GatewayOrderResult {
  order_id: string;
  amount: number; // in paise
  currency: string;
  receipt: string;
  key_id: string;
  gateway: 'Razorpay' | 'Cashfree';
  status: string;
  is_mock: boolean;
  notes: Record<string, string>;
}

/**
 * Creates an official order on Razorpay or generates a valid simulated order for dev/testing.
 */
export async function createGatewayOrder(input: CreateOrderInput): Promise<GatewayOrderResult> {
  const config = getGatewayConfig();
  const amountInPaise = Math.round(input.amount * 100);
  const receipt = `rcpt_${Date.now()}`;
  const notes = {
    student_id: input.student_id,
    course_id: input.course_id,
    fee_account_id: input.fee_account_id,
    installment_id: input.installment_id || '',
    student_name: input.student_name || '',
    student_email: input.student_email || '',
    ...input.notes,
  };

  if (isLiveRazorpayConfigured()) {
    try {
      const basicAuth = Buffer.from(
        `${config.razorpayKeyId}:${config.razorpayKeySecret}`
      ).toString('base64');

      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: input.currency || 'INR',
          receipt,
          notes,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Razorpay Order API returned ${response.status}: ${errorBody}`);
      }

      const orderData = await response.json();
      return {
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        receipt: orderData.receipt,
        key_id: config.razorpayKeyId,
        gateway: 'Razorpay',
        status: orderData.status,
        is_mock: false,
        notes,
      };
    } catch (err: any) {
      console.warn('Razorpay live order creation failed, falling back to sandbox mode:', err?.message || err);
    }
  }

  // Sandbox / Test Mode Simulation
  const simulatedOrderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    order_id: simulatedOrderId,
    amount: amountInPaise,
    currency: input.currency || 'INR',
    receipt,
    key_id: config.razorpayKeyId,
    gateway: 'Razorpay',
    status: 'created',
    is_mock: true,
    notes,
  };
}

/**
 * Verifies Razorpay client payment signature:
 * hmac_sha256(order_id + "|" + payment_id, secret) === signature
 */
export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secretOverride?: string
): boolean {
  if (!orderId || !paymentId || !signature) return false;

  const secret = secretOverride || getGatewayConfig().razorpayKeySecret;
  const payload = `${orderId}|${paymentId}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Constant-time buffer comparison to prevent timing leaks
  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay Webhook signature:
 * hmac_sha256(rawBody, webhookSecret) === x-razorpay-signature
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  receivedSignature: string,
  secretOverride?: string
): boolean {
  if (!rawBody || !receivedSignature) return false;

  const webhookSecret = secretOverride || getGatewayConfig().razorpayWebhookSecret;

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(receivedSignature, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

/**
 * Auto-reconciles payment upon webhook event from Razorpay.
 * Safe and idempotent (will not create duplicate payment if already processed).
 */
export async function processRazorpayWebhookEvent(payload: any): Promise<{
  processed: boolean;
  reconciled: boolean;
  paymentId?: string;
  receiptNumber?: string;
  message: string;
}> {
  const event = payload?.event;

  if (event !== 'payment.captured' && event !== 'order.paid') {
    return {
      processed: true,
      reconciled: false,
      message: `Ignored event "${event}": Not a captured payment.`,
    };
  }

  const paymentEntity = payload?.payload?.payment?.entity;
  if (!paymentEntity) {
    throw new Error('Malformed webhook payload: missing payment entity');
  }

  const paymentId = paymentEntity.id;
  const orderId = paymentEntity.order_id;
  const amount = Number(paymentEntity.amount) / 100; // Convert paise to INR
  const notes = paymentEntity.notes || {};

  const studentId = notes.student_id;
  const feeAccountId = notes.fee_account_id;
  const courseId = notes.course_id;
  const installmentId = notes.installment_id || undefined;

  if (!studentId || !feeAccountId || !courseId) {
    throw new Error(
      `Webhook notes missing required references: student_id=${studentId}, fee_account_id=${feeAccountId}, course_id=${courseId}`
    );
  }

  // Idempotency check: see if paymentId was already recorded
  const existingPayment = store.payments.find(
    (p) =>
      p.transaction_reference === paymentId ||
      p.gateway_payment_id === paymentId ||
      (orderId && p.gateway_order_id === orderId)
  );

  if (existingPayment) {
    return {
      processed: true,
      reconciled: false,
      paymentId,
      receiptNumber: existingPayment.receipt_number,
      message: `Payment ${paymentId} already reconciled previously. Idempotent skip.`,
    };
  }

  // Execute atomic ledger credit
  const result = await recordPaymentAtomic(
    {
      student_id: studentId,
      course_id: courseId,
      fee_account_id: feeAccountId,
      installment_id: installmentId,
      amount,
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Payment Gateway',
      transaction_reference: paymentId,
      gateway_order_id: orderId,
      gateway_payment_id: paymentId,
      gateway_name: 'Razorpay',
      status: 'Success',
      notes: `Auto-reconciled via Razorpay webhook (${event}). Order: ${orderId}`,
    },
    'usr-gateway-system'
  );

  await recordAuditLog({
    user_id: 'usr-gateway-system',
    user_name: 'Razorpay Payment Gateway Webhook',
    user_role: 'system',
    action: 'PAYMENT_GATEWAY_WEBHOOK_RECONCILED',
    module: 'FINANCE',
    record_id: result.payment.id,
    new_value: {
      order_id: orderId,
      payment_id: paymentId,
      amount,
      receipt_number: result.receipt.receipt_number,
    },
  });

  return {
    processed: true,
    reconciled: true,
    paymentId,
    receiptNumber: result.receipt.receipt_number,
    message: `Payment successfully captured and reconciled. Receipt generated: ${result.receipt.receipt_number}`,
  };
}
