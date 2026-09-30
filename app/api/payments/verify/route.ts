import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyRazorpayPaymentSignature,
  isLiveRazorpayConfigured,
} from '@/lib/services/payment-gateway-service';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { store } from '@/lib/services/data-store';
import {
  dispatchMultiChannelNotification,
  buildReceiptEmailHtml,
} from '@/lib/services/notification-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      order_id,
      payment_id,
      signature,
      student_id,
      course_id,
      fee_account_id,
      installment_id,
      amount,
    } = body;

    if (!order_id || !payment_id) {
      return NextResponse.json(
        { success: false, error: 'Missing order_id or payment_id' },
        { status: 400 }
      );
    }

    // In live mode, signature verification is strictly enforced
    if (isLiveRazorpayConfigured()) {
      const isValid = verifyRazorpayPaymentSignature(order_id, payment_id, signature);
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Invalid or forged Razorpay payment signature' },
          { status: 400 }
        );
      }
    } else {
      // In sandbox/test mode: if signature provided, check signature or allow test payment
      if (signature && signature !== 'test_signature') {
        const isValid = verifyRazorpayPaymentSignature(order_id, payment_id, signature);
        if (!isValid && !signature.startsWith('test_')) {
          return NextResponse.json(
            { success: false, error: 'Invalid test signature' },
            { status: 400 }
          );
        }
      }
    }

    // Check if this payment_id is already recorded (idempotency)
    const existing = store.payments.find(
      (p) =>
        p.transaction_reference === payment_id ||
        p.gateway_payment_id === payment_id
    );

    if (existing) {
      const receipt = store.receipts.find((r) => r.payment_id === existing.id);
      const feeAccount = store.feeAccounts.find((f) => f.id === existing.fee_account_id);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        payment: existing,
        receipt,
        feeAccount,
      });
    }

    // Record atomic payment and update ledger
    const result = await recordPaymentAtomic(
      {
        student_id,
        course_id,
        fee_account_id,
        installment_id,
        amount: Number(amount),
        payment_date: new Date().toISOString().split('T')[0],
        payment_mode: 'Payment Gateway',
        transaction_reference: payment_id,
        gateway_order_id: order_id,
        gateway_payment_id: payment_id,
        gateway_signature: signature,
        gateway_name: 'Razorpay',
        status: 'Success',
        notes: `Online checkout verified. Order ID: ${order_id}`,
      },
      student_id
    );

    // Dispatch multi-channel notification (in-app, Resend email, WhatsApp)
    const student = store.students.find((s) => s.id === student_id);
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/api/receipts/${result.receipt.id}/pdf?download=true`;
    const emailHtml = buildReceiptEmailHtml({
      studentName: student?.full_name || result.receipt.student_name,
      receiptNumber: result.receipt.receipt_number,
      amount: result.receipt.payment_amount,
      remainingBalance: result.receipt.remaining_balance,
      courseName: result.receipt.course_name,
      pdfUrl,
    });

    dispatchMultiChannelNotification({
      userId: student?.user_id || student_id,
      recipientName: student?.full_name || result.receipt.student_name,
      recipientEmail: student?.email,
      recipientPhone: student?.phone,
      title: `Payment Receipt: ${result.receipt.receipt_number}`,
      message: `Payment of ₹${result.receipt.payment_amount.toLocaleString('en-IN')} received. Remaining balance: ₹${result.receipt.remaining_balance.toLocaleString('en-IN')}.`,
      category: 'payment',
      type: 'success',
      channels: ['in_app', 'email', 'whatsapp'],
      actionUrl: `/accounts/receipts/${result.receipt.id}`,
      metadata: { htmlTemplate: emailHtml, pdfUrl },
    }).catch((notifErr) => console.warn('Payment notification dispatch error:', notifErr));

    return NextResponse.json({
      success: true,
      payment: result.payment,
      receipt: result.receipt,
      feeAccount: result.updatedFeeAccount,
    });
  } catch (err: any) {
    console.error('Payment verification API error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Payment verification failed' },
      { status: 500 }
    );
  }
}
