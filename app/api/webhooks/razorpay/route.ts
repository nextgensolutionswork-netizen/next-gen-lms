import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyRazorpayWebhookSignature,
  processRazorpayWebhookEvent,
  isLiveRazorpayConfigured,
} from '@/lib/services/payment-gateway-service';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature && isLiveRazorpayConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Missing x-razorpay-signature header' },
        { status: 400 }
      );
    }

    // Verify signature
    if (signature) {
      const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.warn('Unauthorized webhook signature attempt on /api/webhooks/razorpay');
        return NextResponse.json(
          { success: false, error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const result = await processRazorpayWebhookEvent(payload);

    return NextResponse.json({
      status: 'ok',
      ...result,
    });
  } catch (err: any) {
    console.error('Webhook processing exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error processing webhook' },
      { status: 500 }
    );
  }
}
