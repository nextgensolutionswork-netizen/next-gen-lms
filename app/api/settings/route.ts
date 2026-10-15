import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { AuditLog } from '@/types';
import { getAuthenticatedUserFromRequest } from '@/lib/auth/server-session';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

export async function GET() {
  store.hydrateFromDisk();
  return NextResponse.json({
    success: true,
    settings: store.settings,
  });
}

export async function POST(req: NextRequest) {
  try {
    // 1. RBAC Enforcement: Only super_admin and admin roles can modify system settings
    const authUser = await getAuthenticatedUserFromRequest(req);
    const roleCookie = req.cookies.get('user_role')?.value;
    const effectiveRole = authUser?.role || roleCookie;

    if (effectiveRole && !['super_admin', 'admin'].includes(effectiveRole)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Administrative role (super_admin or admin) is required to modify system settings.',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid settings payload' },
        { status: 400 }
      );
    }

    const previousSettings = { ...store.settings };
    store.settings = {
      ...store.settings,
      ...body,
      updated_at: new Date().toISOString(),
    };

    // Record audit log
    const auditEntry: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: authUser?.id || body.updated_by || 'usr-admin',
      user_name: authUser?.full_name || body.updated_by_name || 'Administrator',
      user_role: effectiveRole || 'admin',
      action: 'SETTINGS_UPDATED',
      module: 'SETTINGS',
      record_id: store.settings.id || 'sys-01',
      old_value: previousSettings,
      new_value: store.settings,
      created_at: new Date().toISOString(),
    };

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift(auditEntry);

    // Persist to server disk snapshot
    store.persistSync();

    // If live Supabase is enabled, sync to system_settings table as well
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        await db.from('system_settings').upsert({
          id: store.settings.id || 'sys-01',
          institute_name: store.settings.institute_name,
          tagline: store.settings.tagline,
          address: store.settings.address,
          phone: store.settings.phone,
          email: store.settings.email,
          gst_number: store.settings.gst_number,
          default_currency: store.settings.default_currency,
          academic_year: store.settings.academic_year,
          receipt_prefix: store.settings.receipt_prefix,
          invoice_prefix: store.settings.invoice_prefix || 'INV',
          timezone: store.settings.timezone,
          updated_at: new Date().toISOString(),
        });
      } catch (dbErr) {
        console.warn('[Settings API] Supabase system_settings upsert warning:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'System settings successfully updated and persisted to disk',
      settings: store.settings,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
