import { NextRequest, NextResponse } from 'next/server';
import {
  syncLocalToPostgres,
  syncPostgresToLocal,
} from '@/lib/supabase/sync-service';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { recordAuditLog } from '@/lib/services/audit-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Enforce super_admin role for database sync mutations
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin'],
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await req.json().catch(() => ({}));
    const direction = body.direction === 'pull' ? 'pull' : 'push';

    let result;
    if (direction === 'pull') {
      result = await syncPostgresToLocal();
    } else {
      result = await syncLocalToPostgres();
    }

    await recordAuditLog({
      user_id: auth.user.id,
      user_name: auth.user.full_name,
      user_role: auth.user.role,
      action: 'DATABASE_SYNC_EXECUTED',
      module: 'DATABASE',
      record_id: `sync-${direction}`,
      new_value: {
        direction,
        success: result.success,
        totalSynced: result.totalSynced,
        errors: result.errors,
      },
    });

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Database synchronization failed',
      },
      { status: 500 }
    );
  }
}
