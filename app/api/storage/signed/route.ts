import { NextResponse, type NextRequest } from 'next/server';
import { verifySignedUrlToken, STORAGE_BUCKETS, StorageBucket } from '@/lib/services/storage-service';
import { getDb, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get('bucket') || '';
    const path = searchParams.get('path') || '';
    const expires = parseInt(searchParams.get('expires') || '0', 10);
    const signature = searchParams.get('signature') || '';

    if (!bucket || !path || !expires || !signature) {
      return NextResponse.json(
        { success: false, error: 'Malformed signed URL: missing security parameters' },
        { status: 400 }
      );
    }

    if (!STORAGE_BUCKETS[bucket as StorageBucket]) {
      return NextResponse.json(
        { success: false, error: `Invalid storage bucket "${bucket}"` },
        { status: 400 }
      );
    }

    const isValid = verifySignedUrlToken(bucket, path, expires, signature);
    if (!isValid) {
      const now = Math.floor(Date.now() / 1000);
      if (now > expires) {
        return NextResponse.json(
          { success: false, error: 'Signed storage URL has expired. Please request a new signed link.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Invalid or forged signed storage URL signature' },
        { status: 403 }
      );
    }

    // In live Supabase mode, redirect to the authenticated storage object or stream
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.storage.from(bucket).download(path);
        if (error) throw error;
        if (data) {
          const buffer = Buffer.from(await data.arrayBuffer());
          const contentType = data.type || 'application/octet-stream';
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `inline; filename="${path.split('/').pop() || 'download'}"`,
              'Cache-Control': 'private, max-age=3600',
            },
          });
        }
      } catch (err: any) {
        console.warn(`Supabase stream failed for signed [${bucket}/${path}]:`, err?.message || err);
      }
    }

    // In sandbox / mock mode: return JSON verification metadata or simulated binary payload
    return NextResponse.json({
      success: true,
      message: 'Signed URL verified and authenticated successfully',
      bucket,
      path,
      expiresAt: new Date(expires * 1000).toISOString(),
      verified: true,
      authenticatedAccess: true,
    });
  } catch (err: any) {
    console.error('Error verifying signed storage URL:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error verifying signed URL' },
      { status: 500 }
    );
  }
}
