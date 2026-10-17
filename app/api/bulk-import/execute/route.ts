import { NextRequest, NextResponse } from 'next/server';
import {
  executeBulkImport,
  BulkImportEntityType,
} from '@/lib/services/bulk-import-service';
import { authenticateApiRequest } from '@/lib/auth/server-session';

export async function POST(req: NextRequest) {
  try {
    // 1. RBAC Enforcement: Authenticate caller and require super_admin or admin
    const auth = await authenticateApiRequest(req, { allowedRoles: ['super_admin', 'admin'] });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    let entityType: BulkImportEntityType = 'students';
    let csvContent = '';
    let skipInvalidRows = false;
    let userId = auth.user.id;
    let userName = auth.user.full_name;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      entityType = (formData.get('entityType') as BulkImportEntityType) || 'students';
      skipInvalidRows = formData.get('skipInvalidRows') === 'true';

      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
      }
      csvContent = await file.text();
    } else {
      const body = await req.json();
      entityType = body.entityType || 'students';
      csvContent = body.csvContent || '';
      skipInvalidRows = Boolean(body.skipInvalidRows);
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'CSV content is required and cannot be empty' },
        { status: 400 }
      );
    }

    const result = await executeBulkImport(entityType, csvContent, userId, userName, {
      skipInvalidRows,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Bulk import failed validation checks. Please resolve errors or enable skipInvalidRows.',
          data: result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Bulk import execution error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute bulk import' },
      { status: 500 }
    );
  }
}
