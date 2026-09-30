import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rawId = params?.id;
    if (!rawId) {
      return NextResponse.json(
        { success: false, error: 'Receipt ID or number is required' },
        { status: 400 }
      );
    }

    const receipt =
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

    if (!receipt) {
      return NextResponse.json(
        {
          success: false,
          error: `Fee receipt '${rawId}' not found in institutional records`,
        },
        { status: 404 }
      );
    }

    const pdfBuffer = await generateReceiptPdfBuffer(receipt);

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
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    console.error('Error generating receipt PDF:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate receipt PDF',
      },
      { status: 500 }
    );
  }
}
