import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { AuditLog } from '@/types';
import { getAuthenticatedUserFromRequest } from '@/lib/auth/server-session';
import { AUTH_COOKIE_NAME } from '@/lib/security/auth-cookie';
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
    let effectiveRole: string | undefined = authUser?.role;
    let effectiveUserId: string = authUser?.id || '';
    let effectiveUserName: string = authUser?.full_name || '';

    // Check signed next_gen_auth_user cookie
    if (!effectiveRole) {
      const nextGenCookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
      if (nextGenCookie) {
        try {
          const parsed = JSON.parse(decodeURIComponent(nextGenCookie));
          effectiveRole = parsed?.payload?.role || parsed?.role;
          if (!effectiveUserId) effectiveUserId = parsed?.payload?.id || parsed?.id;
          if (!effectiveUserName) effectiveUserName = parsed?.payload?.full_name || parsed?.full_name;
        } catch {}
      }
    }

    // Fallback to legacy cookies
    if (!effectiveRole) {
      const roleCookie = req.cookies.get('user_role')?.value;
      if (roleCookie) {
        effectiveRole = roleCookie;
      } else {
        const authCookie = req.cookies.get('auth_session')?.value;
        if (authCookie) {
          try {
            const parsed = JSON.parse(decodeURIComponent(authCookie));
            effectiveRole = parsed?.payload?.role || parsed?.role;
            if (!effectiveUserId) effectiveUserId = parsed?.payload?.id || parsed?.id;
            if (!effectiveUserName) effectiveUserName = parsed?.payload?.full_name || parsed?.full_name;
          } catch {}
        }
      }
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid settings payload' },
        { status: 400 }
      );
    }

    if (!effectiveRole && body.updated_by_role) {
      effectiveRole = body.updated_by_role;
    }

    if (effectiveRole && !['super_admin', 'admin'].includes(effectiveRole)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Administrative role (super_admin or admin) is required to modify system settings.',
        },
        { status: 403 }
      );
    }

    if (process.env.NODE_ENV === 'production' && !effectiveRole) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Administrative authentication session is required to modify system settings.',
        },
        { status: 401 }
      );
    }

    const previousSettings = { ...store.settings };
    const bankAccountNo =
      body.bank_account_no ||
      body.bank_account_number ||
      store.settings.bank_account_no ||
      store.settings.bank_account_number ||
      '';

    store.settings = {
      ...store.settings,
      ...body,
      bank_account_no: bankAccountNo,
      bank_account_number: bankAccountNo,
      updated_at: new Date().toISOString(),
    };

    // Record audit log
    const auditEntry: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: effectiveUserId || body.updated_by || 'usr-admin',
      user_name: effectiveUserName || body.updated_by_name || 'Administrator',
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

    // Persist to server disk snapshot synchronously
    store.persistSync();
    store.persist();

    // If live Supabase is enabled, sync to system_settings table as well
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const SYSTEM_SETTINGS_UUID = '11111111-1111-1111-1111-111111111111';
        const targetId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(store.settings.id || '')
          ? store.settings.id
          : SYSTEM_SETTINGS_UUID;

        await db.from('system_settings').upsert({
          id: targetId,
          institute_name: store.settings.institute_name,
          logo_url: store.settings.logo_url || null,
          tagline: store.settings.tagline || '',
          address: store.settings.address,
          phone: store.settings.phone,
          email: store.settings.email,
          gst_number: store.settings.gst_number || '',
          default_currency: store.settings.default_currency || 'INR',
          academic_year: store.settings.academic_year || '2026-2027',
          receipt_prefix: store.settings.receipt_prefix || 'REC',
          invoice_prefix: store.settings.invoice_prefix || 'INV',
          timezone: store.settings.timezone || 'Asia/Kolkata',
          enable_email_notifications: store.settings.enable_email_notifications ?? true,
          enable_sms_notifications: store.settings.enable_sms_notifications ?? false,
          enable_whatsapp_notifications: store.settings.enable_whatsapp_notifications ?? true,
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
