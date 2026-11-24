import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { tenantId } from '@/lib/auth/tenant';
import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { getInvoiceByIdOrNumber } from '@/lib/services/invoice-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await authenticatePaymentRequest(request);
    const rawId = (await params)?.id;
    if (!rawId) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID or number is required' },
        { status: 400 }
      );
    }

    const invoice = getInvoiceByIdOrNumber(rawId);

    if (!invoice) {
      return NextResponse.json(
        {
          success: false,
          error: `Invoice '${rawId}' not found in institutional records`,
        },
        { status: 404 }
      );
    }

    // Role-based authorization
    const ownStudent = store.students.find(
      (s) =>
        (s.id === invoice.student_id || s.user_id === invoice.student_id) &&
        (s.user_id === actor.id || s.id === actor.id || s.email?.toLowerCase() === actor.email?.toLowerCase())
    );
    const isOwnInvoice =
      actor.role === 'student' &&
      (invoice.student_id === actor.id ||
        invoice.student_email?.toLowerCase() === actor.email?.toLowerCase() ||
        Boolean(ownStudent));

    const isStaff = ['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role);

    if (!isStaff && !isOwnInvoice) {
      return NextResponse.json({ error: 'Invoice access denied.' }, { status: 403 });
    }

    if (actor.role !== 'super_admin' && invoice.tenant_id && invoice.tenant_id !== tenantId(actor)) {
      return NextResponse.json({ error: 'Cross-tenant invoice access denied.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch invoice details',
      },
      { status: error?.message?.startsWith('Unauthorized') ? 401 : 500 }
    );
  }
}
