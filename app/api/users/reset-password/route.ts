import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/services/audit-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate administrative session
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'users:write',
    });
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json();
    const { user_id, new_password } = body;

    if (!user_id || !new_password) {
      return NextResponse.json(
        { success: false, error: 'User ID and new password are required.' },
        { status: 400 }
      );
    }

    if (new_password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const targetUser = (store.users || []).find((u) => u.id === user_id);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Target user record not found.' },
        { status: 404 }
      );
    }

    // 2. Call Supabase Auth Admin API if live database is enabled
    if (isLiveSupabaseEnabled()) {
      try {
        const adminClient = createAdminClient();
        const { error: resetErr } = await adminClient.auth.admin.updateUserById(user_id, {
          password: new_password,
        });

        if (resetErr) {
          console.warn('[PasswordReset API] Supabase updateUserById error:', resetErr.message);
          return NextResponse.json(
            { success: false, error: `Supabase password update failed: ${resetErr.message}` },
            { status: 400 }
          );
        }
      } catch (err: any) {
        console.error('[PasswordReset API] Supabase admin exception:', err);
        return NextResponse.json(
          { success: false, error: `Failed to reset password via Supabase Auth: ${err?.message}` },
          { status: 500 }
        );
      }
    }

    // 3. Update store timestamp
    targetUser.updated_at = new Date().toISOString();
    store.persistSync();

    // 4. Record tamper-evident audit trail
    await recordAuditLog({
      user_id: auth.user.id,
      user_name: auth.user.full_name || 'Administrator',
      user_role: auth.user.role,
      action: 'PASSWORD_RESET',
      module: 'SECURITY',
      record_id: user_id,
      new_value: {
        reset_by: auth.user.id,
        user_email: targetUser.email,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Password successfully updated for ${targetUser.email}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal error processing password reset' },
      { status: 500 }
    );
  }
}
