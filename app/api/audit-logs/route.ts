import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { store } from '@/lib/services/data-store';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenantId } from '@/lib/auth/tenant';
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

/**
 * Audit Telemetry Ingestion Schema
 * Supports canonical and common telemetry alias properties:
 * - action / event_type
 * - module / entity_type
 * - record_id / entity_id
 */
const AuditLogInputSchema = z.object({
  action: z.string().trim().min(1, 'action or event_type is required').max(120).optional(),
  event_type: z.string().trim().min(1).max(120).optional(),
  module: z.string().trim().min(1, 'module or entity_type is required').max(120).optional(),
  entity_type: z.string().trim().min(1).max(120).optional(),
  record_id: z.string().trim().min(1, 'record_id or entity_id is required').max(250).optional(),
  entity_id: z.string().trim().min(1).max(250).optional(),
  user_id: z.string().trim().optional(),
  user_name: z.string().trim().optional(),
  user_role: z.string().trim().optional(),
  tenant_id: z.string().trim().optional(),
  old_value: z.any().optional(),
  new_value: z.any().optional(),
  details: z.any().optional(),
  payload: z.any().optional(),
  metadata: z.any().optional(),
  notes: z.string().max(4000).optional(),
});

/**
 * POST /api/audit-logs
 * Ingestion endpoint for durable audit telemetry from CRM lead updates, counsellor interactions,
 * and operational workflows. Enforces session authentication, actor/tenant validation, and durable storage.
 */
export async function POST(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    // 1. RBAC Session Authentication (All authenticated staff roles can record audit telemetry)
    const allowedStaffRoles = [
      'super_admin',
      'admin',
      'counsellor',
      'accountant',
      'trainer',
      'placement_coordinator',
      'onboarding_team',
      'support',
    ];
    const auth = await authenticateApiRequest(req, {
      allowedRoles: allowedStaffRoles,
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const actor = auth.user;

    // 2. Parse & Validate Payload
    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }

    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    const parseResult = AuditLogInputSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation error: ${parseResult.error.errors.map((e) => e.message).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const input = parseResult.data;
    const action = input.action || input.event_type;
    const moduleName = input.module || input.entity_type;
    const recordId = input.record_id || input.entity_id;

    if (!action || !moduleName || !recordId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required audit fields: action, module, and record_id (or entity_id) are required.',
        },
        { status: 400 }
      );
    }

    // 3. Security Boundary: Actor & Tenant Verification
    const actorTenant = tenantId(actor);
    if (input.tenant_id && input.tenant_id !== actorTenant && actor.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Tenant isolation mismatch.' },
        { status: 403 }
      );
    }

    // Prevent non-admin actors from spoofing another user's actor ID
    if (input.user_id && input.user_id !== actor.id && !['super_admin', 'admin'].includes(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cannot forge audit telemetry for another user ID.' },
        { status: 403 }
      );
    }

    // 4. Construct Server-Authoritative Audit Record
    const oldValue = input.old_value !== undefined ? input.old_value : null;
    const newValue =
      input.new_value !== undefined
        ? input.new_value
        : input.details !== undefined
        ? input.details
        : input.payload !== undefined
        ? input.payload
        : input.notes
        ? { notes: input.notes }
        : null;

    const auditEntry: AuditLog = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenant_id: actorTenant,
      user_id: actor.id,
      user_name: actor.full_name || actor.email || 'Staff Member',
      user_role: actor.role,
      action,
      module: moduleName,
      record_id: recordId,
      old_value: oldValue,
      new_value: newValue,
      ip_address: req.ip || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1',
      created_at: new Date().toISOString(),
    };

    // 5. Store Locally with Atomic Disk Flush
    store.auditLogs.unshift(auditEntry);
    store.persist();

    // 6. Persist to PostgreSQL audit_logs if Supabase is Live
    if (isLiveSupabaseEnabled()) {
      try {
        const supabase = createAdminClient();
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor.id);
        const logUuid = crypto.randomUUID();

        await supabase.from('audit_logs').insert({
          id: logUuid,
          user_id: isUUID ? actor.id : null,
          user_email: actor.email || `${actor.id}@lms.internal`,
          module: moduleName,
          action,
          record_id: recordId,
          payload: {
            tenant_id: actorTenant,
            user_name: auditEntry.user_name,
            user_role: auditEntry.user_role,
            old_value: oldValue,
            new_value: newValue,
            metadata: input.metadata || null,
          },
          ip_address: auditEntry.ip_address,
          created_at: auditEntry.created_at,
        });

        // If CRM lead stage or interaction followup, mirror into lead_followups if recordId is valid UUID
        const isRecordUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId);
        if (moduleName.toUpperCase() === 'CRM' && isRecordUUID && isUUID) {
          const notesText =
            typeof newValue?.notes === 'string'
              ? newValue.notes
              : typeof input.notes === 'string'
              ? input.notes
              : `${action}: ${JSON.stringify(newValue || {})}`;
          const stageBefore = oldValue?.stage || 'Previous';
          const stageAfter = newValue?.stage || 'Current';

          await supabase.from('lead_followups').insert({
            id: crypto.randomUUID(),
            lead_id: recordId,
            counsellor_id: actor.id,
            stage_before: stageBefore,
            stage_after: stageAfter,
            notes: notesText,
            next_follow_up_date: newValue?.follow_up_date || null,
            created_at: auditEntry.created_at,
          }).catch((fErr: any) => {
            console.warn('[AuditLogs API] lead_followups secondary mirror notice:', fErr?.message);
          });
        }
      } catch (dbErr: any) {
        console.warn('[AuditLogs API] Supabase PostgreSQL insert warning, preserved locally:', dbErr?.message);
      }
    }

    return NextResponse.json(
      {
        success: true,
        log: auditEntry,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to record audit telemetry.',
      },
      { status: 500 }
    );
  }
}
