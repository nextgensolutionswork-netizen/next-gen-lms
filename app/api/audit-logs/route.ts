import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';
import { AuditLog } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    // 1. RBAC Authentication & Session Verification
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'audit:read',
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const authUser = auth.user;

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
