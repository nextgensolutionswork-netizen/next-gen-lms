import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { persistentStorage } from '@/lib/services/persistent-storage-adapter';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { recordAuditLog } from '@/lib/services/audit-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    // Enforce Super Admin authorization
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin'],
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      store,
    };

    await recordAuditLog({
      user_id: auth.user.id,
      user_name: auth.user.full_name,
      user_role: auth.user.role,
      action: 'DATABASE_BACKUP_SNAPSHOT_EXPORTED',
      module: 'DATABASE',
      record_id: `backup-${timestamp}`,
      new_value: { timestamp },
    });

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
    store.hydrateFromDisk();

    // Enforce Super Admin authorization
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin'],
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const backup = persistentStorage.createBackup(store);

    await recordAuditLog({
      user_id: auth.user.id,
      user_name: auth.user.full_name,
      user_role: auth.user.role,
      action: 'DATABASE_BACKUP_SNAPSHOT_CREATED',
      module: 'DATABASE',
      record_id: backup.filename || 'backup',
      new_value: { backupPath: backup.backupPath },
    });

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
