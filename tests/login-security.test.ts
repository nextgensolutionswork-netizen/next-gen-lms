import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginPostHandler } from '@/app/api/auth/login/route';
import { POST as logoutPostHandler, GET as logoutGetHandler } from '@/app/api/auth/logout/route';
import { middleware } from '@/middleware';
import { generateAuthCookieSignature, verifyAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, AUTH_COOKIE_SECRET } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';
import { verifyUserCredentials } from '@/lib/auth/credentials';

describe('Login Security & Credential Protection Tests', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
  });

  // =========================================================================
  // 1. CREDENTIALS VERIFICATION SERVICE TESTS
  // =========================================================================
  describe('Credentials Verification (verifyUserCredentials)', () => {
    it('authenticates valid credentials for all implemented roles with correct passwords', async () => {
      const validCases = [
        { email: 'superadmin@next-generpsolutions.com', password: 'AdminPass#2026', expectedRole: 'super_admin' },
        { email: 'admin@next-generpsolutions.com', password: 'AdminPass#2026', expectedRole: 'admin' },
        { email: 'accounts@next-generpsolutions.com', password: 'AccountsPass#2026', expectedRole: 'accountant' },
        { email: 'counsellor@next-generpsolutions.com', password: 'CounsellorPass#2026', expectedRole: 'counsellor' },
        { email: 'vikram.fico@next-generpsolutions.com', password: 'TrainerPass#2026', expectedRole: 'trainer' },
        { email: 'placement@next-generpsolutions.com', password: 'PlacementPass#2026', expectedRole: 'placement_coordinator' },
        { email: 'support@next-generpsolutions.com', password: 'SupportPass#2026', expectedRole: 'support' },
        { email: 'onboarding@next-generpsolutions.com', password: 'OnboardPass#2026', expectedRole: 'onboarding_team' },
        { email: 'amit.gupta@student.next-gen.com', password: 'StudentPass#2026', expectedRole: 'student' },
      ];

      for (const c of validCases) {
        const res = await verifyUserCredentials(c.email, c.password);
        expect(res.success).toBe(true);
        expect(res.user).toBeDefined();
        expect(res.user?.role).toBe(c.expectedRole);
      }
    });

    it('rejects incorrect password with generic error and zero secret exposure', async () => {
      const res = await verifyUserCredentials('admin@next-generpsolutions.com', 'CompletelyWrongPass!999');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('invalid_credentials');
      expect(res.error).toBe('Unable to sign in. Check your email and password and try again.');
      // Ensure password never appears in error message
      expect(res.error).not.toContain('CompletelyWrongPass!999');
    });

    it('rejects non-existent email safely', async () => {
      const res = await verifyUserCredentials('ghost.user@doesnotexist.com', 'AnyPassword#2026');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('invalid_credentials');
      expect(res.error).toBe('Unable to sign in. Check your email and password and try again.');
    });

    it('rejects empty email or empty password safely', async () => {
      const emptyEmail = await verifyUserCredentials('', 'SomePass#2026');
      expect(emptyEmail.success).toBe(false);
      expect(emptyEmail.errorCode).toBe('missing_credentials');

      const emptyPassword = await verifyUserCredentials('admin@next-generpsolutions.com', '');
      expect(emptyPassword.success).toBe(false);
      expect(emptyPassword.errorCode).toBe('missing_credentials');
    });

    it('blocks deactivated staff account with account_deactivated code', async () => {
      const testUser = store.users.find((u) => u.email === 'admin@next-generpsolutions.com')!;
      const originalStatus = testUser.is_active;
      testUser.is_active = false;

      try {
        const res = await verifyUserCredentials('admin@next-generpsolutions.com', 'AdminPass#2026');
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('account_deactivated');
        expect(res.error).toContain('deactivated');
      } finally {
        testUser.is_active = originalStatus;
      }
    });

    it('blocks unprovisioned student with onboarding_pending code', async () => {
      const studentUser = store.users.find((u) => u.role === 'student')!;
      const originalStatus = studentUser.is_active;
      studentUser.is_active = false;

      try {
        const res = await verifyUserCredentials(studentUser.email, 'StudentPass#2026');
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('onboarding_pending');
        expect(res.error).toContain('pending onboarding verification');
      } finally {
        studentUser.is_active = originalStatus;
      }
    });
  });

  // =========================================================================
  // 2. SERVER-SIDE FORM POST AUTHENTICATION (NO-JAVASCRIPT FLOW)
  // =========================================================================
  describe('Server-Side Form POST Flow (JavaScript Disabled Simulation)', () => {
    it('processes form POST with valid credentials and redirects to role workspace with 303', async () => {
      const formData = new URLSearchParams();
      formData.append('email', 'admin@next-generpsolutions.com');
      formData.append('password', 'AdminPass#2026');
      formData.append('redirectTo', '/dashboard');

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: formData.toString(),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(303);

      const location = res.headers.get('location');
      expect(location).toBe('http://localhost:3000/dashboard');
      // Verify password never appears in redirect location!
      expect(location).not.toContain('password');
      expect(location).not.toContain('AdminPass#2026');

      // Verify HMAC-signed cookies are set on the redirect response
      const authCookie = res.cookies.get(AUTH_COOKIE_NAME);
      const sigCookie = res.cookies.get(AUTH_SIG_COOKIE_NAME);
      expect(authCookie).toBeDefined();
      expect(sigCookie).toBeDefined();

      const isValidSig = await verifyAuthCookieSignature(authCookie!.value, sigCookie!.value, AUTH_COOKIE_SECRET);
      expect(isValidSig).toBe(true);
    });

    it('redirects student role to /portal with 303 upon successful form POST', async () => {
      const formData = new URLSearchParams();
      formData.append('email', 'amit.gupta@student.next-gen.com');
      formData.append('password', 'StudentPass#2026');

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: formData.toString(),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('http://localhost:3000/portal');
    });

    it('redirects accountant role to /accounts/fees with 303 upon successful form POST', async () => {
      const formData = new URLSearchParams();
      formData.append('email', 'accounts@next-generpsolutions.com');
      formData.append('password', 'AccountsPass#2026');

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: formData.toString(),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('http://localhost:3000/accounts/fees');
    });

    it('redirects invalid credentials back to /login?error=invalid_credentials without secret leakage', async () => {
      const formData = new URLSearchParams();
      formData.append('email', 'admin@next-generpsolutions.com');
      formData.append('password', 'WRONG_SECRET_PASSWORD_123');

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: formData.toString(),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(303);

      const location = res.headers.get('location')!;
      expect(location).toContain('/login?error=invalid_credentials');
      // CRITICAL ASSERTION: Password must NEVER appear in URL!
      expect(location).not.toContain('WRONG_SECRET_PASSWORD_123');
      expect(location).not.toContain('password');
    });

    it('redirects empty credentials back to /login?error=missing_credentials', async () => {
      const formData = new URLSearchParams();
      formData.append('email', '');
      formData.append('password', '');

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: formData.toString(),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toContain('/login?error=missing_credentials');
    });
  });

  // =========================================================================
  // 3. JSON API AUTHENTICATION TESTS
  // =========================================================================
  describe('JSON API Authentication Flow', () => {
    it('authenticates valid JSON payload and returns signed session profile', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'admin@next-generpsolutions.com',
          password: 'AdminPass#2026',
        }),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe('admin@next-generpsolutions.com');
      expect(data.redirectTo).toBe('/dashboard');
      // Password must not be in returned JSON
      expect(data.password).toBeUndefined();
    });

    it('rejects invalid JSON payload with HTTP 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'admin@next-generpsolutions.com',
          password: 'BadPassword',
        }),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unable to sign in. Check your email and password and try again.');
    });
  });

  // =========================================================================
  // 4. CSRF ORIGIN PROTECTION TESTS
  // =========================================================================
  describe('CSRF Origin Protection', () => {
    it('blocks cross-origin form POST submission from untrusted origin', async () => {
      const formData = new URLSearchParams();
      formData.append('email', 'admin@next-generpsolutions.com');
      formData.append('password', 'AdminPass#2026');

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          host: 'localhost:3000',
          origin: 'https://malicious-phishing-site.com',
        },
        body: formData.toString(),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toContain('/login?error=csrf_failed');
    });

    it('blocks cross-origin JSON request from untrusted origin with 403', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          host: 'localhost:3000',
          origin: 'https://malicious-attacker.com',
        },
        body: JSON.stringify({
          email: 'admin@next-generpsolutions.com',
          password: 'AdminPass#2026',
        }),
      });

      const res = await loginPostHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. MIDDLEWARE URL SANITIZATION & STRIPPING TESTS
  // =========================================================================
  describe('Middleware URL Query Credential Sanitization', () => {
    it('intercepts GET request containing password query parameter and redirects with secrets stripped', async () => {
      const dirtyUrl = 'http://localhost:3000/login?email=user%40example.com&password=LeakedPassword123%23';
      const req = new NextRequest(dirtyUrl, {
        method: 'GET',
        headers: { host: 'localhost:3000' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(308);

      const redirectLocation = res.headers.get('location')!;
      // Password must be completely removed from redirect location
      expect(redirectLocation).not.toContain('LeakedPassword123%23');
      expect(redirectLocation).not.toContain('password');
      expect(redirectLocation).toContain('error=insecure_request');
      expect(redirectLocation).toContain('email=user%40example.com');
    });

    it('strips variations of sensitive parameter names (pass, pwd, secret)', async () => {
      const dirtyUrl = 'http://localhost:3000/login?pass=secret1&pwd=secret2&secret=secret3&user=john';
      const req = new NextRequest(dirtyUrl, {
        method: 'GET',
        headers: { host: 'localhost:3000' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(308);

      const redirectLocation = res.headers.get('location')!;
      expect(redirectLocation).not.toContain('secret1');
      expect(redirectLocation).not.toContain('secret2');
      expect(redirectLocation).not.toContain('secret3');
      expect(redirectLocation).toContain('error=insecure_request');
      expect(redirectLocation).toContain('user=john');
    });
  });

  // =========================================================================
  // 6. LOGOUT AND SESSION INVALIDATION TESTS
  // =========================================================================
  describe('Logout & Session Invalidation', () => {
    it('clears auth cookies and redirects to /login?notice=logged_out upon POST logout', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await logoutPostHandler(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?notice=logged_out');

      const authCookie = res.cookies.get(AUTH_COOKIE_NAME);
      const sigCookie = res.cookies.get(AUTH_SIG_COOKIE_NAME);
      expect(authCookie?.value).toBe('');
      expect(sigCookie?.value).toBe('');
    });

    it('supports GET logout for simple hyperlink logout', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'GET',
        headers: { host: 'localhost:3000' },
      });

      const res = await logoutGetHandler(req);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('http://localhost:3000/login?notice=logged_out');
    });
  });

  // =========================================================================
  // 7. OPERATIONS ADMIN & ALL-ROLE ISOLATION VALIDATION
  // =========================================================================
  describe('Operations Admin & Role-Specific Access Isolation', () => {
    it('resolves Operations Admin with canonical UUID and active status upon valid credentials', async () => {
      const res = await verifyUserCredentials('admin@next-generpsolutions.com', 'AdminPass#2026');
      expect(res.success).toBe(true);
      expect(res.user).toBeDefined();
      expect(res.user?.role).toBe('admin');
      expect(res.user?.is_active).toBe(true);
      expect(res.user?.email).toBe('admin@next-generpsolutions.com');
      // Must have canonical UUID
      expect(res.user?.id).toBe('22222222-2222-2222-2222-222222222222');
    });

    it('preserves backward-compatible legacy usr-admin alias in store', () => {
      const canonical = store.users.find((u) => u.id === '22222222-2222-2222-2222-222222222222');
      const alias = store.users.find((u) => u.id === 'usr-admin');
      expect(canonical).toBeDefined();
      expect(alias).toBeDefined();
      expect(canonical?.email).toBe('admin@next-generpsolutions.com');
      expect(alias?.email).toBe('admin@next-generpsolutions.com');
    });

    it('enforces role-specific redirects and access restrictions across all 8 supported roles', async () => {
      const rolePerms = [
        {
          role: 'super_admin',
          email: 'superadmin@next-generpsolutions.com',
          id: '11111111-1111-1111-1111-111111111111',
          allowed: ['/dashboard', '/settings', '/todos', '/accounts/approvals'],
          denied: [],
        },
        {
          role: 'admin',
          email: 'admin@next-generpsolutions.com',
          id: '22222222-2222-2222-2222-222222222222',
          allowed: ['/dashboard', '/settings', '/users', '/onboarding'],
          denied: [{ path: '/todos', fallback: '/dashboard' }],
        },
        {
          role: 'accountant',
          email: 'accounts@next-generpsolutions.com',
          id: '33333333-3333-3333-3333-333333333333',
          allowed: ['/accounts/fees', '/accounts/approvals'],
          denied: [{ path: '/settings', fallback: '/accounts/fees' }],
        },
        {
          role: 'counsellor',
          email: 'counsellor@next-generpsolutions.com',
          id: '44444444-4444-4444-4444-444444444444',
          allowed: ['/crm/leads', '/accounts/payments'],
          denied: [{ path: '/accounts/approvals', fallback: '/crm/leads' }, { path: '/settings', fallback: '/crm/leads' }],
        },
        {
          role: 'trainer',
          email: 'vikram.fico@next-generpsolutions.com',
          id: '55555555-5555-5555-5555-555555555551',
          allowed: ['/academics/courses'],
          denied: [{ path: '/settings', fallback: '/academics/courses' }, { path: '/accounts/fees', fallback: '/academics/courses' }],
        },
        {
          role: 'placement_coordinator',
          email: 'placement@next-generpsolutions.com',
          id: '66666666-6666-6666-6666-666666666666',
          allowed: ['/placement'],
          denied: [{ path: '/settings', fallback: '/placement' }],
        },
        {
          role: 'support',
          email: 'support@next-generpsolutions.com',
          id: '88888888-8888-8888-8888-888888888888',
          allowed: ['/support'],
          denied: [{ path: '/settings', fallback: '/support' }],
        },
        {
          role: 'onboarding_team',
          email: 'onboarding@next-generpsolutions.com',
          id: '99999999-9999-9999-9999-999999999999',
          allowed: ['/onboarding'],
          denied: [{ path: '/dashboard', fallback: '/onboarding' }, { path: '/settings', fallback: '/onboarding' }],
        },
      ];

      for (const item of rolePerms) {
        const cookiePayload = encodeURIComponent(
          JSON.stringify({
            id: item.id,
            email: item.email,
            role: item.role,
            is_active: true,
          })
        );
        const sig = await generateAuthCookieSignature(cookiePayload, AUTH_COOKIE_SECRET);

        // Verify allowed paths
        for (const allowedPath of item.allowed) {
          const req = new NextRequest(`http://localhost:3000${allowedPath}`, {
            headers: {
              host: 'localhost:3000',
              cookie: `${AUTH_COOKIE_NAME}=${cookiePayload}; ${AUTH_SIG_COOKIE_NAME}=${sig}`,
            },
          });
          const res = await middleware(req);
          // Should not redirect away from allowed path
          if (res.status === 303 || res.status === 307 || res.status === 308) {
            const loc = res.headers.get('location');
            expect(loc).toBeNull();
          }
        }

        // Verify denied paths redirect to fallback
        for (const deniedItem of item.denied) {
          const req = new NextRequest(`http://localhost:3000${deniedItem.path}`, {
            headers: {
              host: 'localhost:3000',
              cookie: `${AUTH_COOKIE_NAME}=${cookiePayload}; ${AUTH_SIG_COOKIE_NAME}=${sig}`,
            },
          });
          const res = await middleware(req);
          expect([303, 307]).toContain(res.status);
          expect(res.headers.get('location')).toBe(`http://localhost:3000${deniedItem.fallback}`);
        }
      }
    });
  });
});
