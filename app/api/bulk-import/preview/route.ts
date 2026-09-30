import { NextRequest, NextResponse } from 'next/server';
import {
  previewBulkImport,
  BulkImportEntityType,
} from '@/lib/services/bulk-import-service';

export async function POST(req: NextRequest) {
  try {
    let entityType: BulkImportEntityType = 'students';
    let csvContent = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      entityType = (formData.get('entityType') as BulkImportEntityType) || 'students';
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
      }
      csvContent = await file.text();
    } else {
      const body = await req.json();
      entityType = body.entityType || 'students';
      csvContent = body.csvContent || '';
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'CSV content is required and cannot be empty' },
        { status: 400 }
      );
    }

    const preview = previewBulkImport(entityType, csvContent);

    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (error: any) {
    console.error('Bulk import preview error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate import preview' },
      { status: 500 }
    );
  }
}
