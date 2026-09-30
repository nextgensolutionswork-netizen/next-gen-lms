import { NextRequest, NextResponse } from 'next/server';
import {
  generateCsvTemplate,
  BulkImportEntityType,
} from '@/lib/services/bulk-import-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entity = (searchParams.get('entity') || 'students') as BulkImportEntityType;

    const csvContent = generateCsvTemplate(entity);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${entity}_bulk_import_template.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate template' },
      { status: 500 }
    );
  }
}
