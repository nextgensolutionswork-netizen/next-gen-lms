import { NextRequest, NextResponse } from 'next/server';
import { createLead } from '@/lib/services/crm-service';
import { store } from '@/lib/services/data-store';
import { recordAuditLog } from '@/lib/services/audit-service';
import { validatePhoneNumber } from '@/lib/utils/phone-validation';
import { UserProfile, Lead } from '@/types';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deterministic dedicated system identity for automated TeleCRM integration.
 * Prevents webhook requests from stealing or impersonating human administrator accounts.
 */
const TELECRM_SYSTEM_INTEGRATION_ACTOR: UserProfile = {
  id: '00000000-0000-4000-a000-000000000001',
  tenant_id: 'default',
  email: 'integration@telecrm.system.local',
  full_name: 'TeleCRM Integration Service',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/**
 * Validates TeleCRM webhook authorization using shared secret or bearer token.
 * Supports:
 * - Header: 'x-telecrm-secret'
 * - Header: 'x-webhook-secret'
 * - Header: 'Authorization: Bearer <secret>'
 * - Query param: '?secret=...' or '?token=...'
 */
function verifyTelecrmWebhookSecret(request: NextRequest): { isValid: boolean; reason?: string } {
  const configuredSecret =
    process.env.TELECRM_WEBHOOK_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'telecrm_webhook_dev_secret' : undefined);

  if (!configuredSecret) {
    return {
      isValid: false,
      reason: 'Server configuration error: TELECRM_WEBHOOK_SECRET is not configured in this environment',
    };
  }

  const incomingSecret =
    request.headers.get('x-telecrm-secret') ||
    request.headers.get('x-webhook-secret') ||
    (request.headers.get('authorization')?.startsWith('Bearer ')
      ? request.headers.get('authorization')!.slice(7).trim()
      : null) ||
    request.nextUrl.searchParams.get('secret') ||
    request.nextUrl.searchParams.get('token');

  if (!incomingSecret) {
    return {
      isValid: false,
      reason: 'Missing webhook authentication credentials. Provide x-telecrm-secret or Authorization header.',
    };
  }

  // Constant-time comparison to prevent timing attacks
  const bufA = Buffer.from(incomingSecret.trim());
  const bufB = Buffer.from(configuredSecret.trim());

  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return {
      isValid: false,
      reason: 'Invalid webhook authentication secret',
    };
  }

  return { isValid: true };
}

/**
 * TeleCRM Webhook Ingestion Route
 * Handles authenticated automated lead ingestion, webhook retries, and duplicate prevention.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Mandatory Webhook Authentication & Authorization Check
    const authCheck = verifyTelecrmWebhookSecret(request);
    if (!authCheck.isValid) {
      await recordAuditLog({
        user_id: TELECRM_SYSTEM_INTEGRATION_ACTOR.id,
        user_name: 'Unauthenticated Webhook Caller',
        user_role: 'system' as any,
        action: 'SECURITY_ALERT',
        module: 'CRM',
        record_id: 'telecrm-webhook',
        new_value: {
          error: authCheck.reason,
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          path: '/api/webhooks/telecrm',
        },
      });

      return NextResponse.json(
        { success: false, error: authCheck.reason || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload received from TeleCRM webhook' },
        { status: 400 }
      );
    }

    // Extract lead fields supporting both nested and flat TeleCRM webhook schemas
    const rawLead = body.lead || body.data || body;
    const fullName = rawLead.full_name || rawLead.name || rawLead.lead_name || 'TeleCRM Prospect';
    const rawPhone = rawLead.phone || rawLead.mobile || rawLead.contact_number || rawLead.phone_number;
    const email = rawLead.email || undefined;
    const rawCountryCode = rawLead.country_code || '+91';
    const notes = rawLead.notes || rawLead.remarks || rawLead.message || '';
    const courseId = rawLead.interested_course_id || rawLead.course_id;
    const courseName = rawLead.interested_course_name || rawLead.course_name || rawLead.course;
    const externalLeadId = String(body.event_id || rawLead.external_lead_id || rawLead.lead_id || rawLead.id || '');
    const idempotencyKey = String(body.idempotency_key || request.headers.get('x-idempotency-key') || externalLeadId || '');

    if (!rawPhone || !String(rawPhone).trim()) {
      return NextResponse.json(
        { success: false, error: 'Mobile phone number is mandatory for TeleCRM lead ingestion' },
        { status: 400 }
      );
    }

    // Validate and normalize phone
    const phoneValidation = validatePhoneNumber(rawCountryCode, String(rawPhone).trim(), 'Mobile number', false);
    if (!phoneValidation.isValid) {
      await recordAuditLog({
        user_id: TELECRM_SYSTEM_INTEGRATION_ACTOR.id,
        user_name: TELECRM_SYSTEM_INTEGRATION_ACTOR.full_name,
        user_role: 'system' as any,
        action: 'INTEGRATION_ERROR',
        module: 'CRM',
        record_id: externalLeadId || 'telecrm-unknown',
        new_value: { error: phoneValidation.error, rawPhone },
      });
      return NextResponse.json(
        { success: false, error: phoneValidation.error || 'Invalid mobile phone number format' },
        { status: 422 }
      );
    }

    // Match course by ID or name
    let matchedCourseId = courseId;
    if (!matchedCourseId && courseName) {
      const matched = (store.courses || []).find(
        (c) => c.course_name.toLowerCase().includes(courseName.toLowerCase()) ||
               c.course_code.toLowerCase() === courseName.toLowerCase()
      );
      if (matched) matchedCourseId = matched.id;
    }

    // Assign to active counsellor or counsellor lead
    const activeCounsellors = (store.users || []).filter(
      (u) => (u.role === 'counsellor' || u.role === 'counsellor_lead') && u.is_active !== false
    );
    const assignedCounsellor = rawLead.counsellor_id
      ? activeCounsellors.find((c) => c.id === rawLead.counsellor_id) || activeCounsellors[0]
      : activeCounsellors[0];

    // Dedicated system actor: NEVER impersonates human administrators
    const systemActor: UserProfile = TELECRM_SYSTEM_INTEGRATION_ACTOR;

    const leadData: any = {
      full_name: fullName,
      phone: phoneValidation.normalized || String(rawPhone).trim(),
      country_code: phoneValidation.dialCode || '+91',
      whatsapp_country_code: phoneValidation.dialCode || '+91',
      whatsapp_number: phoneValidation.normalized || String(rawPhone).trim(),
      email,
      interested_course_id: matchedCourseId,
      counsellor_id: assignedCounsellor?.id,
      notes: notes ? `[TeleCRM Ingestion] ${notes}` : '[TeleCRM Ingestion]',
      lead_source: 'Other',
      campaign: 'TeleCRM Integration',
      stage: 'New',
      tenant_id: systemActor.tenant_id || 'default',
      external_lead_id: externalLeadId || undefined,
      idempotency_key: idempotencyKey || undefined,
      rejectOnDuplicate: false, // Idempotent deduplication preserves existing lead
    };

    const resultLead = await createLead(leadData, systemActor);
    const wasDuplicate = Boolean((resultLead as any).is_duplicate_prevented);

    return NextResponse.json({
      success: true,
      lead: resultLead,
      duplicate_prevented: wasDuplicate,
      message: wasDuplicate
        ? 'Duplicate lead detected: existing record preserved and inquiry notes appended'
        : 'Lead created successfully',
    });
  } catch (err: any) {
    console.error('[TeleCRM Webhook Error]', err);
    await recordAuditLog({
      user_id: TELECRM_SYSTEM_INTEGRATION_ACTOR.id,
      user_name: TELECRM_SYSTEM_INTEGRATION_ACTOR.full_name,
      user_role: 'system' as any,
      action: 'INTEGRATION_ERROR',
      module: 'CRM',
      record_id: 'telecrm-webhook',
      new_value: { error: err.message },
    });
    return NextResponse.json(
      { success: false, error: err.message || 'TeleCRM webhook ingestion failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'TeleCRM Webhook Ingestion API',
    duplicate_prevention: 'Active (Canonical phone & idempotency-key based)',
    authentication: 'Mandatory (Shared Secret / Bearer Token)',
  });
}
