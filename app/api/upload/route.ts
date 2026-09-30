import { NextResponse, type NextRequest } from 'next/server';
import { uploadFile, StorageBucket, STORAGE_BUCKETS, validateFile } from '@/lib/services/storage-service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as StorageBucket) || 'screenshots';
    const entityId = (formData.get('entityId') as string) || undefined;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file was provided in the upload request' },
        { status: 400 }
      );
    }

    if (!STORAGE_BUCKETS[bucket]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid bucket "${bucket}". Allowed buckets: ${Object.keys(STORAGE_BUCKETS).join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Pre-validate file size and type
    const validation = validateFile(
      {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      bucket
    );

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadFile({
      bucket,
      file: buffer,
      fileName: file.name,
      contentType: file.type,
      entityId,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('File upload API error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error processing file upload' },
      { status: 500 }
    );
  }
}
