import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';

function createMockRequest(url: string, cookieValue?: string) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
    },
  });

  if (cookieValue) {
    req.cookies.set('next_gen_auth_user', cookieValue);
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(cookieValue));
  }

  return req;
}

describe('8. Middleware & Session Verification Tests', () => {
  // =========================================================================
  // 1. UNAUTHENTICATED ROUTE PROTECTION (/dashboard, /support, /portal)
  // =========================================================================
  it('redirects unauthenticated user from protected /dashboard to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/dashboard');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fdashboard');
  });

  it('redirects unauthenticated user from protected /support to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/support');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fsupport');
  });

  it('redirects unauthenticated user from protected /portal to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/portal');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fportal');
  });

  it('redirects unauthenticated user from root / to /login', async () => {
    const req = createMockRequest('http://localhost:3000/');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
  });

  it('redirects unauthenticated user from academic and accounts subroutes to /login', async () => {
    const req1 = createMockRequest('http://localhost:3000/academics/courses');
    const res1 = await middleware(req1);
    expect(res1.status).toBe(307);
    expect(res1.headers.get('location')).toContain('redirectTo=%2Facademics%2Fcourses');

    const req2 = createMockRequest('http://localhost:3000/accounts/fees');
    const res2 = await middleware(req2);
    expect(res2.status).toBe(307);
    expect(res2.headers.get('location')).toContain('redirectTo=%2Faccounts%2Ffees');
  });

  // =========================================================================
  // 2. PUBLIC ROUTES ACCESS
  // =========================================================================
  it('allows unauthenticated visitor to access public /login page', async () => {
    const req = createMockRequest('http://localhost:3000/login');
    const res = await middleware(req);

    // Should not redirect
    expect(res.status).toBe(200);
  });

  it.each(['student', 'support', 'super_admin'])(
    'preserves a password recovery callback for an authenticated %s',
    async (role) => {
      const cookie = encodeURIComponent(JSON.stringify({
        id: 'existing-user', email: 'user@example.com', role,
      }));
      const req = createMockRequest('/login?type=recovery&code=test-code', cookie);
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  );

  it('allows unauthenticated visitor to access public certificate verification', async () => {
    const req = createMockRequest('http://localhost:3000/certificate/verify/CERT-2026-FICO-0091');
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  // =========================================================================
  // 3. INVALID & CORRUPT COOKIE HANDLING
  // =========================================================================
  it('rejects corrupted JSON auth cookie and redirects to /login', async () => {
    const req = createMockRequest('http://localhost:3000/dashboard', 'not-valid-json-cookie');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('rejects inactive user session cookie and redirects to /login', async () => {
    const inactiveCookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-inactive',
        email: 'inactive@next-generpsolutions.com',
        role: 'student',
        is_active: false,
      })
    );
    const req = createMockRequest('http://localhost:3000/portal', inactiveCookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  // =========================================================================
  // 4. AUTHENTICATED ACCESS & ROLE ISOLATION
  // =========================================================================
  it('allows authenticated super_admin to access /dashboard', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-001',
        email: 'superadmin@next-generpsolutions.com',
        role: 'super_admin',
      })
    );
    const req = createMockRequest('http://localhost:3000/dashboard', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('allows authenticated support mentor to access /support', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-support-01',
        email: 'support@next-generpsolutions.com',
        role: 'support',
      })
    );
    const req = createMockRequest('http://localhost:3000/support', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('allows authenticated student to access /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/portal', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('allows authenticated student to access /accounts/receipts/:id for their payment receipt', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/accounts/receipts/rec-01', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it('redirects authenticated student attempting to access /dashboard to /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/dashboard', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/portal');
  });

  it('redirects authenticated student attempting to access /support to /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/support', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/portal');
  });

  it('redirects authenticated student attempting to access staff routes to /portal', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req = createMockRequest('http://localhost:3000/settings', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/portal');
  });

  it('redirects authenticated support staff attempting to access sensitive admin settings to /support', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-support-01',
        email: 'support@next-generpsolutions.com',
        role: 'support',
      })
    );
    const req = createMockRequest('http://localhost:3000/settings', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/support');
  });

  // =========================================================================
  // 4b. FORENSIC AUDIT LOGS RBAC ISOLATION (/audit-logs)
  // =========================================================================
  it.each([
    { role: 'trainer', expectedRedirect: '/academics/courses' },
    { role: 'accountant', expectedRedirect: '/accounts/fees' },
    { role: 'counsellor', expectedRedirect: '/crm/leads' },
    { role: 'placement_coordinator', expectedRedirect: '/placement' },
    { role: 'support', expectedRedirect: '/support' },
    { role: 'student', expectedRedirect: '/portal' },
    { role: 'onboarding_team', expectedRedirect: '/onboarding' },
  ])(
    'strictly prevents $role from accessing /audit-logs and redirects to $expectedRedirect',
    async ({ role, expectedRedirect }) => {
      const cookie = encodeURIComponent(
        JSON.stringify({
          id: `usr-${role}-test`,
          email: `${role}@next-generpsolutions.com`,
          role,
        })
      );
      const req = createMockRequest('http://localhost:3000/audit-logs', cookie);
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain(expectedRedirect);
    }
  );

  it.each(['admin', 'super_admin'])(
    'allows authorized %s to access /audit-logs forensic system trail',
    async (role) => {
      const cookie = encodeURIComponent(
        JSON.stringify({
          id: `usr-${role}-test`,
          email: `${role}@next-generpsolutions.com`,
          role,
        })
      );
      const req = createMockRequest('http://localhost:3000/audit-logs', cookie);
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  );

  it('redirects unauthenticated visitor from /audit-logs to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/audit-logs');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Faudit-logs');
  });

  // =========================================================================
  // 4c. SUPER ADMIN DIAGNOSTIC PROBE CONSOLE (/todos)
  // =========================================================================
  it('allows authenticated super_admin to access /todos diagnostic probe console', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-super-01',
        email: 'superadmin@next-generpsolutions.com',
        role: 'super_admin',
      })
    );
    const req = createMockRequest('http://localhost:3000/todos', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects operational admin attempting to access /todos to /dashboard', async () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-admin-01',
        email: 'admin@next-generpsolutions.com',
        role: 'admin',
      })
    );
    const req = createMockRequest('http://localhost:3000/todos', cookie);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
  });

  it.each([
    { role: 'trainer', expectedRedirect: '/academics/courses' },
    { role: 'accountant', expectedRedirect: '/accounts/fees' },
    { role: 'counsellor', expectedRedirect: '/crm/leads' },
    { role: 'student', expectedRedirect: '/portal' },
  ])(
    'strictly prevents $role from accessing /todos and redirects to $expectedRedirect',
    async ({ role, expectedRedirect }) => {
      const cookie = encodeURIComponent(
        JSON.stringify({
          id: `usr-${role}-test`,
          email: `${role}@next-generpsolutions.com`,
          role,
        })
      );
      const req = createMockRequest('http://localhost:3000/todos', cookie);
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain(expectedRedirect);
    }
  );

  it('redirects unauthenticated visitor from /todos to /login with redirectTo', async () => {
    const req = createMockRequest('http://localhost:3000/todos');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Ftodos');
  });

  // =========================================================================
  // 5. AUTHENTICATED REDIRECT FROM /login AND /
  // =========================================================================
  it('keeps login accessible for email callbacks with an existing session', async () => {
    const studentCookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
      })
    );
    const req1 = createMockRequest('http://localhost:3000/login', studentCookie);
    const res1 = await middleware(req1);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('location')).toBeNull();

    const adminCookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-001',
        email: 'superadmin@next-generpsolutions.com',
        role: 'super_admin',
      })
    );
    const req2 = createMockRequest('http://localhost:3000/login', adminCookie);
    const res2 = await middleware(req2);
    expect(res2.status).toBe(200);
    expect(res2.headers.get('location')).toBeNull();
  });

  it('routes the site URL through login so fragment callbacks can be handled', async () => {
    const supportCookie = encodeURIComponent(
      JSON.stringify({
        id: 'usr-support-01',
        email: 'support@next-generpsolutions.com',
        role: 'support',
      })
    );
    const req = createMockRequest('http://localhost:3000/', supportCookie);
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it.each(['?code=reset-code&type=recovery', '?error_code=otp_expired'])('preserves site URL callback parameters %s', async (query) => {
    const res = await middleware(createMockRequest(`/${query}`));
    expect(res.headers.get('location')).toBe(`http://localhost:3000/login${query}`);
  });

  // =========================================================================
  // 6. API ROUTES PASS-THROUGH
  // =========================================================================
  it('allows API requests to pass through without HTML redirect', async () => {
    const req = createMockRequest('http://localhost:3000/api/database/health');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });
});
