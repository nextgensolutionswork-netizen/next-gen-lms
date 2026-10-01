import { NextResponse, type NextRequest } from 'next/server';
import { createGatewayOrder } from '@/lib/services/payment-gateway-service';
import { checkRateLimit, validateCsrfOrigin, getClientIp } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // 1. Validate CSRF Origin
    if (!validateCsrfOrigin(request)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request origin or CSRF verification failed' },
        { status: 403 }
      );
    }

    // 2. Sliding window rate limiting per IP
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`payment-order:${clientIp}`, 15, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded for payment creation. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.resetSeconds),
            'X-RateLimit-Limit': '15',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateCheck.resetSeconds),
          },
        }
      );
    }
    const body = await request.json();
    const {
      amount,
      currency,
      student_id,
      course_id,
      fee_account_id,
      installment_id,
      student_name,
      student_email,
      notes,
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Payment amount must be greater than zero' },
        { status: 400 }
      );
    }

    if (!student_id || !course_id || !fee_account_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required student or fee account identifiers' },
        { status: 400 }
      );
    }

    const order = await createGatewayOrder({
      amount: Number(amount),
      currency: currency || 'INR',
      student_id,
      course_id,
      fee_account_id,
      installment_id,
      student_name,
      student_email,
      notes,
    });

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err: any) {
    console.error('Create payment order error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to create payment order' },
      { status: 500 }
    );
  }
}
