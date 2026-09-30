import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { generateCertificatePdfBuffer } from '@/lib/services/pdf-service';

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
        { success: false, error: 'Certificate ID or verification code is required' },
        { status: 400 }
      );
    }

    const cert = store.certificates.find(
      (c) =>
        c.id === rawId ||
        c.certificate_id.toLowerCase() === rawId.toLowerCase() ||
        c.student_id === rawId
    );

    if (!cert) {
      return NextResponse.json(
        {
          success: false,
          error: `Verified certificate '${rawId}' not found in institutional ledger`,
        },
        { status: 404 }
      );
    }

    const pdfBuffer = await generateCertificatePdfBuffer(cert);

    const { searchParams } = new URL(request.url);
    const isDownload = searchParams.get('download') === 'true';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const filename = `certificate-${cert.certificate_id}.pdf`;

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
    console.error('Error generating certificate PDF:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate certificate PDF',
      },
      { status: 500 }
    );
  }
}
