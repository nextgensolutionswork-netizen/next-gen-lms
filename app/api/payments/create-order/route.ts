import { NextResponse, type NextRequest } from 'next/server';
import { createGatewayOrder } from '@/lib/services/payment-gateway-service';

export async function POST(request: NextRequest) {
  try {
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
