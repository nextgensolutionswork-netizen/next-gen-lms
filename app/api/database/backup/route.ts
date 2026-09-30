import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { persistentStorage } from '@/lib/services/persistent-storage-adapter';

export async function GET() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      store,
    };

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="lms_database_backup_${timestamp}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to export backup snapshot' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const backup = persistentStorage.createBackup(store);
    return NextResponse.json({
      success: backup.success,
      filename: backup.filename,
      backupPath: backup.backupPath,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create backup snapshot' },
      { status: 500 }
    );
  }
}
