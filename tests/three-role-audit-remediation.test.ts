import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { ROLE_PERMISSIONS } from '@/lib/auth/rbac';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, getAuthCookieSecret } from '@/lib/security/auth-cookie';
import { middleware } from '@/middleware';
import { GET as getDbHealth } from '@/app/api/database/health/route';
import { GET as getSettings } from '@/app/api/settings/route';
import { GET as getReceipts } from '@/app/api/fees/receipts/route';
import { store } from '@/lib/services/data-store';

async function makeSignedHeaders(user: Record<string, unknown>) {
  const payload = encodeURIComponent(JSON.stringify(user));
  const sig = await generateAuthCookieSignature(payload, getAuthCookieSecret());
  return {
    cookie: `${AUTH_COOKIE_NAME}=${payload}; ${AUTH_SIG_COOKIE_NAME}=${sig}`,
  };
}

describe('Three-Role Audit Remediation Regression Suite', () => {
  it('BUG-003: /api/database/health and /api/settings reject unauthenticated requests with 401', async () => {
    const reqHealth = new NextRequest('http://localhost:3000/api/database/health');
    const resHealth = await getDbHealth(reqHealth);
    expect(resHealth.status).toBe(401);

    const reqSettings = new NextRequest('http://localhost:3000/api/settings');
    const resSettings = await getSettings(reqSettings);
    expect(resSettings.status).toBe(401);
  });

  it('BUG-002: /api/fees/receipts isolates students by counsellor_id for counsellor role', async () => {
    const originalStudents = [...store.students];
    const originalUsers = [...store.users];
    store.users = [
      ...store.users,
      {
        id: 'counsellor-1',
        email: 'sales@example.com',
        full_name: 'Sales User',
        role: 'counsellor',
        is_active: true,
        tenant_id: 'default',
        created_at: new Date().toISOString(),
      } as any,
    ];
    store.students = [
      { id: 'stu-own', full_name: 'Own Student', counsellor_id: 'counsellor-1', tenant_id: 'default' } as any,
      { id: 'stu-other', full_name: 'Other Student', counsellor_id: 'counsellor-2', tenant_id: 'default' } as any,
    ];
    try {
      const headers = await makeSignedHeaders({
        id: 'counsellor-1',
        email: 'sales@example.com',
        full_name: 'Sales User',
        role: 'counsellor',
        is_active: true,
        tenant_id: 'default',
      });
      const req = new NextRequest('http://localhost:3000/api/fees/receipts', { headers });
      const res = await getReceipts(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snapshot.students.map((s: any) => s.id)).toEqual(['stu-own']);
    } finally {
      store.students = originalStudents;
      store.users = originalUsers;
    }
  });

  it('BUG-004: middleware blocks counsellor from /academics/courses, /support, and /audit', async () => {
    const headers = await makeSignedHeaders({
      id: 'counsellor-1',
      email: 'sales@example.com',
      full_name: 'Sales User',
      role: 'counsellor',
      is_active: true,
      tenant_id: 'default',
    });

    for (const path of ['/academics/courses', '/support', '/audit']) {
      const req = new NextRequest(`http://localhost:3000${path}`, { headers });
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/crm/leads');
    }
  });

  it('BUG-005: ROLE_PERMISSIONS.admin includes vendors:read and vendors:write', () => {
    expect(ROLE_PERMISSIONS.admin).toContain('vendors:read');
    expect(ROLE_PERMISSIONS.admin).toContain('vendors:write');
  });
});
