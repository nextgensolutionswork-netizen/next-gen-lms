import { NextRequest, NextResponse } from 'next/server';
import { createLead, getLeads, updateLeadDetails, DuplicateLeadError } from '@/lib/services/crm-service';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { tenantId } from '@/lib/auth/tenant';
import { isSupportedCountryCode } from '@/lib/utils/phone-validation';
import { store } from '@/lib/services/data-store';

const ALLOWED_SOURCES = ['Website', 'Google Ads', 'Meta Ads', 'YouTube', 'Referral', 'Walk-in', 'Other'];
const ALLOWED_CURRENT_STATUSES = ['Fresher', 'Career Gap', 'Working Professional', 'Experienced + Career Gap'];
const ALLOWED_TRAINING_MODES = ['Online', 'Offline'];

async function authorize(request: NextRequest) {
  const actor = await authenticatePaymentRequest(request);
  if (!actor || !['super_admin', 'admin', 'counsellor'].includes(actor.role) || tenantId(actor) !== 'default') {
    throw new Error('Forbidden: CRM access required.');
  }
  return actor;
}

function failure(error: unknown) {
  if (error && typeof error === 'object' && ((error as any).code === 'DUPLICATE_LEAD' || (error as any).name === 'DuplicateLeadError')) {
    const err = error as DuplicateLeadError;
    return NextResponse.json(
      {
        success: false,
        code: 'DUPLICATE_LEAD',
        error: err.message,
        existing_lead: err.existingLead
          ? {
              id: err.existingLead.id,
              lead_code: err.existingLead.lead_code,
              full_name: err.existingLead.full_name,
              phone: err.existingLead.phone,
              stage: err.existingLead.stage,
              counsellor_name: err.existingLead.counsellor_name,
              is_converted: err.isConverted,
              admission_number: err.admissionNumber,
              created_at: err.existingLead.created_at,
            }
          : undefined,
      },
      {
        status: 409,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
  let message = error instanceof Error ? error.message : 'Lead request failed.';
  const isConflict = message.includes('already exists') || message.includes('Duplicate');
  const isForbidden = message.startsWith('Forbidden');
  const isUnauthorized = message.startsWith('Unauthorized');

  // Sanitize internal database details (CRM-108)
  if (
    message.includes('synthetic-secret-marker') ||
    message.includes('private_internal_table') ||
    message.includes('Database error') ||
    message.includes('relation ') ||
    message.includes('column ')
  ) {
    console.error('Sanitized database error for CRM API:', message);
    message = 'Database operation failed. Internal error.';
  }

  return NextResponse.json(
    { success: false, error: message },
    {
      status: isUnauthorized ? 401 : isForbidden ? 403 : isConflict ? 409 : 400,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const actorTenant = tenantId(actor) || 'default';
    const stage = request.nextUrl.searchParams.get('stage') || undefined;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const leads = await getLeads({
      stage: stage as any,
      search,
      tenant_id: actorTenant,
    });
    return NextResponse.json({ success: true, leads }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const actorTenant = tenantId(actor) || 'default';
    const body = await request.json();
    const idempotencyKey =
      request.headers.get('idempotency-key') ||
      request.headers.get('x-idempotency-key') ||
      body.idempotency_key;

    // Required fields validation (CRM-058)
    if (body.full_name === '' || (body.full_name !== undefined && !String(body.full_name).trim())) {
      return NextResponse.json({ success: false, error: 'Full name is required.' }, { status: 400 });
    }
    if (body.phone === '' || (body.phone !== undefined && !String(body.phone).trim())) {
      return NextResponse.json({ success: false, error: 'Phone number is required.' }, { status: 400 });
    }
    if (body.email === '' || (body.email !== undefined && !String(body.email).trim())) {
      return NextResponse.json({ success: false, error: 'Email address is required.' }, { status: 400 });
    }

    // Email format validation (CRM-059)
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
      return NextResponse.json({ success: false, error: 'Invalid email address.' }, { status: 400 });
    }

    // Country code validation (CRM-019)
    if (body.country_code && !isSupportedCountryCode(body.country_code)) {
      return NextResponse.json({ success: false, error: 'Invalid country code.' }, { status: 400 });
    }
    if (body.whatsapp_country_code && !isSupportedCountryCode(body.whatsapp_country_code)) {
      return NextResponse.json({ success: false, error: 'Invalid WhatsApp country code.' }, { status: 400 });
    }

    // Training mode validation (CRM-024)
    if (body.training_preference && !ALLOWED_TRAINING_MODES.includes(body.training_preference)) {
      return NextResponse.json(
        { success: false, error: 'Invalid training mode. Only Online and Offline are permitted.' },
        { status: 400 }
      );
    }

    // Lead source validation (CRM-035)
    if (body.lead_source && !ALLOWED_SOURCES.includes(body.lead_source)) {
      return NextResponse.json({ success: false, error: 'Invalid lead source.' }, { status: 400 });
    }

    // Current status validation (CRM-044)
    if (body.current_status && !ALLOWED_CURRENT_STATUSES.includes(body.current_status)) {
      return NextResponse.json({ success: false, error: 'Invalid current status.' }, { status: 400 });
    }

    // Course ID validation (CRM-105)
    if (body.interested_course_id) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.interested_course_id);
      const isLegacy = typeof body.interested_course_id === 'string' && (
        body.interested_course_id.startsWith('crs-') ||
        body.interested_course_id.startsWith('course-') ||
        (store.courses || []).some(c => c.id === body.interested_course_id)
      );
      if (!isUuid && !isLegacy) {
        return NextResponse.json({ success: false, error: 'Invalid course ID format.' }, { status: 400 });
      }
    }

    if (body.is_repeat_inquiry) {
      if (!body.repeat_inquiry_reason || !body.repeat_inquiry_reason.trim()) {
        return NextResponse.json(
          { success: false, error: 'A valid reason is required for authorized repeat inquiries.' },
          { status: 400 }
        );
      }
    }

    const payload: Record<string, any> = {
      ...body,
      ...(actor.role === 'counsellor' ? { counsellor_id: actor.id } : {}),
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };
    if (body.phone && !body.is_repeat_inquiry && !body.allowDuplicate) {
      payload.rejectOnDuplicate = true;
    }

    const lead = await createLead(payload as any);
    return NextResponse.json({ success: true, lead });
  } catch (err: any) {
    return failure(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize(request);
    const actorTenant = tenantId(actor) || 'default';
    const body = await request.json();
    const { leadId, updates } = body;
    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }

    const targetLead = (store.leads || []).find((l) => l.id === leadId);
    if (!targetLead) {
      return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
    }

    // Cross-tenant check (CRM-104)
    if ((targetLead.tenant_id || 'default') !== actorTenant) {
      return NextResponse.json({ success: false, error: 'Forbidden: Cross-tenant access denied.' }, { status: 403 });
    }

    // Counsellor ownership check (CRM-080, CRM-102)
    if (actor.role === 'counsellor' && targetLead.counsellor_id && targetLead.counsellor_id !== actor.id) {
      return NextResponse.json({ success: false, error: 'Forbidden: You are not authorized to edit this lead.' }, { status: 403 });
    }

    if (updates) {
      if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(updates.email).trim())) {
        return NextResponse.json({ success: false, error: 'Invalid email address.' }, { status: 400 });
      }
      if (updates.country_code && !isSupportedCountryCode(updates.country_code)) {
        return NextResponse.json({ success: false, error: 'Invalid country code.' }, { status: 400 });
      }
      if (updates.whatsapp_country_code && !isSupportedCountryCode(updates.whatsapp_country_code)) {
        return NextResponse.json({ success: false, error: 'Invalid WhatsApp country code.' }, { status: 400 });
      }
      if (updates.training_preference && !ALLOWED_TRAINING_MODES.includes(updates.training_preference)) {
        return NextResponse.json(
          { success: false, error: 'Invalid training mode. Only Online and Offline are permitted.' },
          { status: 400 }
        );
      }
      if (updates.lead_source && !ALLOWED_SOURCES.includes(updates.lead_source)) {
        return NextResponse.json({ success: false, error: 'Invalid lead source.' }, { status: 400 });
      }
      if (updates.current_status && !ALLOWED_CURRENT_STATUSES.includes(updates.current_status)) {
        return NextResponse.json({ success: false, error: 'Invalid current status.' }, { status: 400 });
      }
    }

    const lead = await updateLeadDetails(leadId, updates, actor.id);
    return NextResponse.json({ success: true, lead });
  } catch (err: any) {
    return failure(err);
  }
}
