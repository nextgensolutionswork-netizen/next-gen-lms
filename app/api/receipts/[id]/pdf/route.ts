import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { tenantId } from '@/lib/auth/tenant';
import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { generateReceiptPdfBuffer, ReceiptPdfDataError } from '@/lib/services/pdf-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_PHONE,
  OFFICIAL_LOGO_PATH,
  resolveInstituteAddress,
  resolveReceiptTerms,
} from '@/lib/constants/branding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await authenticatePaymentRequest(request);
    return await paymentTransaction(actor, async () => {
    const rawId = (await params)?.id;
    if (!rawId) {
      return NextResponse.json(
        { success: false, error: 'Receipt ID or number is required' },
        { status: 400 }
      );
    }

    let receipt =
      store.receipts.find(
        (r) =>
          r.id === rawId ||
          r.receipt_number.toLowerCase() === rawId.toLowerCase() ||
          r.payment_id === rawId
      ) ||
      // Fallback: check if rawId matches a payment that generated a receipt
      store.receipts.find((r) => {
        const payment = store.payments.find((p) => p.id === rawId || p.receipt_number === rawId);
        return payment ? r.payment_id === payment.id : false;
      });

    // Supabase database lookup fallback if not found in memory store
    if (!receipt && isLiveSupabaseEnabled()) {
      try {
        const adminSupabase = createAdminClient();
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
        let query = adminSupabase.from('receipts').select('*');
        if (isUUID) {
          query = query.or(`id.eq.${rawId},payment_id.eq.${rawId}`);
        } else {
          query = query.ilike('receipt_number', rawId);
        }
        const { data: dbReceipt, error: dbErr } = await query.maybeSingle();
        if (!dbErr && dbReceipt) {
          receipt = {
            id: dbReceipt.id,
            receipt_number: dbReceipt.receipt_number,
            payment_id: dbReceipt.payment_id,
            student_id: dbReceipt.student_id,
            student_name: dbReceipt.student_name,
            admission_number: dbReceipt.student_code || 'ADM-2026-0001',
            course_name: dbReceipt.course_name || 'SAP S/4HANA Finance',
            payment_amount: Number(dbReceipt.amount || 0),
            payment_mode: dbReceipt.payment_mode || 'UPI',
            transaction_reference: dbReceipt.transaction_reference,
            payment_date: dbReceipt.receipt_date || dbReceipt.created_at?.slice(0, 10),
            remaining_balance: 0,
            authorized_by: 'Accounts Department',
            institute_name: dbReceipt.institute_name || store.settings?.institute_name || OFFICIAL_INSTITUTE_NAME,
            institute_address: resolveInstituteAddress(dbReceipt.institute_address || store.settings?.address),
            institute_phone: dbReceipt.institute_phone || store.settings?.phone || OFFICIAL_INSTITUTE_PHONE,
            institute_gst: dbReceipt.institute_gst || store.settings?.gst_number || '36AAACN1234F1Z8',
            logo_url: store.settings?.logo_url || OFFICIAL_LOGO_PATH,
            terms_and_conditions: resolveReceiptTerms(dbReceipt.terms_and_conditions),
            created_at: dbReceipt.created_at || new Date().toISOString(),
          } as any;
        }
      } catch (dbFetchErr) {
        console.warn('[ReceiptPdf] Supabase database lookup fallback failed:', dbFetchErr);
      }
    }

    if (!receipt) {
      return NextResponse.json(
        {
          success: false,
          error: `Fee receipt '${rawId}' not found in institutional records`,
        },
        { status: 404 }
      );
    }

    const ownStudent = store.students.find(
      (s) =>
        s.id === receipt.student_id &&
        (s.user_id === actor.id || s.id === actor.id || s.email?.toLowerCase() === actor.email?.toLowerCase())
    );
    const isOwnReceipt =
      actor.role === 'student' &&
      (receipt.student_id === actor.id ||
        receipt.student_email?.toLowerCase() === actor.email?.toLowerCase() ||
        Boolean(ownStudent));

    const isStaff = ['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role);

    if (!isStaff && !isOwnReceipt) {
      return NextResponse.json({ error: 'Receipt access denied.' }, { status: 403 });
    }

    if (actor.role !== 'super_admin' && tenantId(receipt) !== tenantId(actor)) {
      return NextResponse.json({ error: 'Cross-tenant receipt access denied.' }, { status: 403 });
    }

    // Recover absent legacy amounts only from the exact payment for this student
    // and tenant. Never use today's account balance as a historical balance.
    const linkedPayment =
      store.payments.find(
        (p) =>
          p.id === receipt.payment_id &&
          p.student_id === receipt.student_id &&
          tenantId(p) === tenantId(receipt)
      ) ||
      (store.studentPayments || []).find((sp: any) => sp.id === receipt.payment_id);

    // Invariant: Pending or Rejected payments cannot produce official receipts
    const paymentStatus = (linkedPayment as any)?.status || (linkedPayment as any)?.verification_status;
    if (
      paymentStatus &&
      ['Pending', 'Pending Approval', 'Pending Verification', 'Rejected', 'Failed', 'Voided'].includes(paymentStatus)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot generate official receipt for ${paymentStatus.toLowerCase()} payment. Only verified payments produce official receipts.`,
        },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateReceiptPdfBuffer({
      ...receipt,
      institute_address: resolveInstituteAddress(receipt.institute_address || store.settings?.address),
      terms_and_conditions: resolveReceiptTerms(receipt.terms_and_conditions),
      payment_amount:
        receipt.payment_amount ??
        (linkedPayment as any)?.amount ??
        (linkedPayment as any)?.amount_paid,
    } as typeof receipt);

    const { searchParams } = new URL(request.url);
    const isDownload = searchParams.get('download') === 'true';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const filename = `receipt-${receipt.receipt_number}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${dispositionType}; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
    }, true);
  } catch (error: any) {
    console.error('Error generating receipt PDF:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate receipt PDF',
      },
      { status: error instanceof ReceiptPdfDataError ? 422 : error?.message?.startsWith('Unauthorized') ? 401 : 500 }
    );
  }
}
