import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/audit-logs/route';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { UserRole } from '@/types';

function createMockAuthRequest(
  url: string,
  method: 'GET' | 'POST',
  role?: UserRole | null,
  body?: any,
  options: { userId?: string; email?: string; tenantId?: string } = {}
) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: {
      host: 'localhost:3000',
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  if (role) {
    const cookiePayload = JSON.stringify({
      id: options.userId || `usr-${role}-test`,
      email: options.email || (role === 'counsellor' ? 'audit.fixture@example.invalid' : `${role}@next-generpsolutions.com`),
      role,
      tenant_id: options.tenantId || 'default',
      is_active: true,
      full_name: `Test ${role}`,
    });

    req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));
  }

  return req;
}

describe('BUG-CO-001: Audit Telemetry Ingestion (POST /api/audit-logs)', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
    const actorId = 'usr-counsellor-01';
    store.users.unshift({ id: actorId, full_name: 'Audit fixture counsellor', email: 'audit.fixture@example.invalid', role: 'counsellor', is_active: true, tenant_id: 'default', created_at: '', updated_at: '' });
    for (const id of ['lead-test-001','lead-test-002','lead-idem-01']) store.leads.push({ id, created_by: actorId, tenant_id: 'default', lead_code: id, full_name: 'Fixture', phone: '9876543210', email: 'fixture@local.invalid', stage: 'New', created_at: '', updated_at: '' });
    store.persistSync();
    if (!store.auditLogs) store.auditLogs = [];
  });

  it('allows authenticated Counsellor to record durable lead stage update audit telemetry', async () => {
    const counsellorId = 'usr-counsellor-01';
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      'counsellor',
      {
        action: 'LEAD_STAGE_UPDATED',
        module: 'CRM',
        record_id: 'lead-test-001',
        old_value: { stage: 'New' },
        new_value: { stage: 'Contacted', notes: 'Spoke with candidate regarding SAP FICO program' },
      },
      { userId: counsellorId }
    );

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.log).toBeDefined();
    expect(json.log.action).toBe('LEAD_STAGE_UPDATED');
    expect(json.log.module).toBe('CRM');
    expect(json.log.record_id).toBe('lead-test-001');
    expect(json.log.user_id).toBe(counsellorId);
    expect(json.log.user_role).toBe('counsellor');

    // Confirm persisted in store
    const stored = store.auditLogs.find((l) => l.record_id === 'lead-test-001');
    expect(stored).toBeDefined();
    expect(stored?.action).toBe('LEAD_STAGE_UPDATED');
  });

  it('allows Counsellor to record interaction notes with telemetry alias fields (event_type, entity_id)', async () => {
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      'counsellor',
      {
        event_type: 'INTERACTION_RECORDED',
        entity_type: 'CRM',
        entity_id: 'lead-test-002',
        details: { outcome: 'Demo Scheduled', notes: 'Scheduled demo for tomorrow 4 PM' },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.log.action).toBe('INTERACTION_RECORDED');
    expect(json.log.record_id).toBe('lead-test-002');
  });

  it('rejects malformed non-JSON payload with HTTP 400 Bad Request', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/audit-logs'), {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        'Content-Type': 'application/json',
      },
      body: 'INVALID_JSON{{{',
    });
    const cookiePayload = JSON.stringify({
      id: 'usr-counsellor',
      role: 'counsellor',
      tenant_id: 'default',
      is_active: true,
    });
    req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Malformed JSON');
  });

  it('rejects audit submission with missing required fields with HTTP 400 Bad Request', async () => {
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      'counsellor',
      {
        // Missing action, module, and record_id
        notes: 'Incomplete audit telemetry',
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Missing required audit fields');
  });

  it('rejects audit submission when non-admin attempts to forge another user ID (HTTP 403)', async () => {
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      'counsellor',
      {
        action: 'LEAD_STAGE_UPDATED',
        module: 'CRM',
        record_id: 'lead-test-003',
        user_id: 'usr-superadmin-target', // Forged actor
      },
      { userId: 'usr-counsellor-actual' }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Forbidden: Cannot forge audit telemetry');
  });

  it('rejects audit submission when tenant does not match actor tenant boundary (HTTP 403)', async () => {
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      'counsellor',
      {
        action: 'LEAD_STAGE_UPDATED',
        module: 'CRM',
        record_id: 'lead-test-004',
        tenant_id: 'tenant-alien-99',
      },
      { tenantId: 'default' }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Forbidden: Tenant isolation mismatch');
  });

  it('rejects unauthenticated audit submissions with HTTP 401 Unauthorized', async () => {
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      null, // Unauthenticated
      {
        action: 'LEAD_STAGE_UPDATED',
        module: 'CRM',
        record_id: 'lead-test-005',
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/audit-logs remains strictly restricted to super_admin and admin (Counsellor gets 403)', async () => {
    const req = createMockAuthRequest('http://localhost:3000/api/audit-logs', 'GET', 'counsellor');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('rejects with HTTP 500 when simulated audit write failure is active and does not falsely claim success', async () => {
    const req = createMockAuthRequest(
      'http://localhost:3000/api/audit-logs',
      'POST',
      'counsellor',
      {
        action: 'LEAD_STAGE_UPDATED',
        module: 'CRM',
        record_id: 'lead-fail-sim-01',
        simulate_failure: true,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Database audit persistence failed');

    // Confirm not stored locally
    const found = (store.auditLogs || []).find((l) => l.record_id === 'lead-fail-sim-01');
    expect(found).toBeUndefined();
  });

  it('prevents duplicate audit records on retry with identical idempotency key or payload', async () => {
    const idemKey = `idem-audit-${Date.now()}`;
    const payload = {
      idempotency_key: idemKey,
      action: 'LEAD_STAGE_UPDATED',
      module: 'CRM',
      record_id: 'lead-idem-01',
      old_value: { stage: 'New' },
      new_value: { stage: 'Contacted' },
    };

    const req1 = createMockAuthRequest('http://localhost:3000/api/audit-logs', 'POST', 'counsellor', payload);
    const res1 = await POST(req1);
    expect(res1.status).toBe(201);
    const json1 = await res1.json();
    expect(json1.success).toBe(true);

    const initialCount = store.auditLogs.filter((l) => l.record_id === 'lead-idem-01').length;
    expect(initialCount).toBe(1);

    // Second identical submission (Retry)
    const req2 = createMockAuthRequest('http://localhost:3000/api/audit-logs', 'POST', 'counsellor', payload);
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.success).toBe(true);
    expect(json2.deduplicated).toBe(true);

    // Verify count did not increase
    const finalCount = store.auditLogs.filter((l) => l.record_id === 'lead-idem-01').length;
    expect(finalCount).toBe(1);
  });
});
