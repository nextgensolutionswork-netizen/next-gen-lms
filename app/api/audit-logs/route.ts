import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { getAuthenticatedUserFromRequest } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/rbac';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';
import { AuditLog } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    // 1. RBAC Authentication & Session Verification
    const authUser = await getAuthenticatedUserFromRequest(req);
    const roleCookie = req.cookies.get('user_role')?.value;
    const effectiveRole = authUser?.role || roleCookie;

    const isAuthorized =
      effectiveRole === 'super_admin' ||
      effectiveRole === 'admin' ||
      (authUser && (hasPermission(authUser, 'audit:read') || hasPermission(authUser, 'all:manage')));

    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Access to forensic audit trail is strictly restricted to Super Administrators and Operational Administrators.',
        },
        { status: 403 }
      );
    }

    // 2. Fetch from Supabase if configured, otherwise serve durable local store
    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = getDb();
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          store.auditLogs = data as AuditLog[];
        }
      } catch (err) {
        console.warn('[AuditLogs API] Supabase query warning, falling back to local store:', err);
      }
    }

    return NextResponse.json({
      success: true,
      logs: store.auditLogs || [],
      total: (store.auditLogs || []).length,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve forensic audit trail',
      },
      { status: 500 }
    );
  }
}
