import { NextResponse, type NextRequest } from 'next/server';
import { createSignedUrl, StorageBucket, STORAGE_BUCKETS } from '@/lib/services/storage-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bucket, path, expiresInSeconds = 3600 } = body;

    if (!bucket || !path) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: bucket and path' },
        { status: 400 }
      );
    }

    if (!STORAGE_BUCKETS[bucket as StorageBucket]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid storage bucket: "${bucket}". Allowed buckets: ${Object.keys(STORAGE_BUCKETS).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await createSignedUrl(bucket as StorageBucket, path, Number(expiresInSeconds));

    return NextResponse.json({
      success: true,
      bucket,
      path,
      expiresInSeconds: Number(expiresInSeconds),
      signedUrl: result.signedUrl,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (err: any) {
    console.error('Error creating signed storage URL:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to generate signed storage URL' },
      { status: 500 }
    );
  }
}
