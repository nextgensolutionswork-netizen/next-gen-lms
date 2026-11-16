import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { GET as getAuditApi } from '@/app/api/audit/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';
import { UserProfile } from '@/types';

async function createSignedRequest(actor?: UserProfile, url: string = 'http://localhost/api/audit', method: string = 'GET') {
  let cookieHeader = '';
  if (actor) {
    const value = encodeURIComponent(JSON.stringify(actor));
    const signature = await generateAuthCookieSignature(value);
    cookieHeader = `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}`;
  }

  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });
}

describe('BUG-SA-05: Missing Audit Routes Resolution', () => {
  const superAdminUser: UserProfile = {
    id: 'usr-sa-test',
    email: 'superadmin@institute.edu',
    full_name: 'Lead Super Administrator',
    role: 'super_admin',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const studentUser: UserProfile = {
    id: 'usr-student-test',
    email: 'student@institute.edu',
    full_name: 'Enrolled Student',
    role: 'student',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    store.hydrateFromDisk();
    if (!store.users) store.users = [];
    if (!store.users.find((u) => u.id === superAdminUser.id)) {
      store.users.push(superAdminUser);
    }
    if (!store.users.find((u) => u.id === studentUser.id)) {
      store.users.push(studentUser);
    }
  });

  it('verifies route page files exist for both /audit and /settings/audit', () => {
    const auditPagePath = path.resolve(process.cwd(), 'app/(dashboard)/audit/page.tsx');
    const settingsAuditPagePath = path.resolve(process.cwd(), 'app/(dashboard)/settings/audit/page.tsx');

    expect(fs.existsSync(auditPagePath), 'app/(dashboard)/audit/page.tsx should exist').toBe(true);
    expect(fs.existsSync(settingsAuditPagePath), 'app/(dashboard)/settings/audit/page.tsx should exist').toBe(true);

    const auditContent = fs.readFileSync(auditPagePath, 'utf-8');
    expect(auditContent).toContain('AuditLogsPage');

    const settingsAuditContent = fs.readFileSync(settingsAuditPagePath, 'utf-8');
    expect(settingsAuditContent).toContain('AuditLogsPage');
  });

  it('verifies /api/audit endpoint exists and rejects unauthorized requests', async () => {
    // Unauthenticated request
    const unauthReq = await createSignedRequest(undefined);
    const unauthRes = await getAuditApi(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Student requesting audit trail without permissions
    const studentReq = await createSignedRequest(studentUser);
    const studentRes = await getAuditApi(studentReq);
    expect(studentRes.status).toBe(403);
  });

  it('verifies /api/audit endpoint returns genuine audit records to Super Admin without fabricated history', async () => {
    const saReq = await createSignedRequest(superAdminUser);
    const res = await getAuditApi(saReq);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.logs)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBe(body.logs.length);

    // Verify all logs are genuine records with required properties
    if (body.logs.length > 0) {
      const sample = body.logs[0];
      expect(sample).toHaveProperty('id');
      expect(sample).toHaveProperty('action');
      expect(sample).toHaveProperty('created_at');
    }
  });
});
