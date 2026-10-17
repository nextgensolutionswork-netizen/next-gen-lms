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
    // 1. RBAC Enforcement: Authenticate caller using cryptographic session verification
    const authUser = await getAuthenticatedUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Administrative authentication session is required to modify system settings.',
        },
        { status: 401 }
      );
    }

    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Administrative role (super_admin or admin) is required to modify system settings.',
        },
        { status: 403 }
      );
    }

    const effectiveRole = authUser.role;
    const effectiveUserId = authUser.id;
    const effectiveUserName = authUser.full_name;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid settings payload' },
        { status: 400 }
      );
    }

    // Explicit field whitelist - never allow arbitrary JSON keys injection
    const allowedFields = [
      'institute_name',
      'institute_logo',
      'logo_url',
      'tagline',
      'institute_address',
      'address',
      'phone',
      'email',
      'website',
      'gst_number',
      'tax_enabled',
      'tax_rate',
      'currency',
      'default_currency',
      'bank_name',
      'bank_account_name',
      'bank_account_no',
      'bank_account_number',
      'bank_ifsc',
      'bank_branch',
      'upi_id',
      'academic_year',
      'maintenance_mode',
      'admission_prefix',
      'receipt_prefix',
      'invoice_prefix',
      'student_code_prefix',
      'invoice_terms',
      'authorized_signatory_name',
      'authorized_signatory_designation',
      'timezone',
      'date_format',
      'enable_notifications',
      'sms_alerts_enabled',
      'email_alerts_enabled',
    ];

    const safeUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in body) {
        safeUpdates[key] = body[key];
      }
    }

    const previousSettings = { ...store.settings };
    const bankAccountNo =
      safeUpdates.bank_account_no ||
      safeUpdates.bank_account_number ||
      store.settings.bank_account_no ||
      store.settings.bank_account_number ||
      '';

    store.settings = {
      ...store.settings,
      ...safeUpdates,
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
