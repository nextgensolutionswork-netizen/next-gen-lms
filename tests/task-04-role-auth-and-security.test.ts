import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { GET as getPayments } from '@/app/api/fees/payments/route';
import { POST as postLogout } from '@/app/api/auth/logout/route';
import { getSafeRedirectUrl } from '@/lib/auth/rbac';
import {
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
  generateAuthCookieSignature,
} from '@/lib/security/auth-cookie';
import { UserProfile, UserRole } from '@/types';

function makeUser(role: UserRole, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: `usr-${role}-qa`,
    email: `${role}@next-generpsolutions.com`,
    full_name: `QA ${role}`,
    role,
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-11-26T00:00:00.000Z',
    updated_at: '2026-11-26T00:00:00.000Z',
    ...overrides,
  };
}

async function signedCookie(user: Partial<UserProfile>, opts: { tamperPayload?: boolean; tamperSig?: boolean } = {}) {
  const payload = encodeURIComponent(JSON.stringify(user));
  const sig = await generateAuthCookieSignature(payload);
  const finalPayload = opts.tamperPayload
    ? encodeURIComponent(JSON.stringify({ ...user, role: 'super_admin' }))
    : payload;
  const finalSig = opts.tamperSig ? 'a'.repeat(sig.length) : sig;
  return `${AUTH_COOKIE_NAME}=${finalPayload}; ${AUTH_SIG_COOKIE_NAME}=${finalSig}`;
}

describe('TASK-04: Role Authorization Matrix & Authentication Security', () => {
  describe('Phase G — 9-Role Middleware Route Protection', () => {
    const allowedCases: Array<[UserRole, string[]]> = [
      ['super_admin', ['/crm/leads', '/crm/followups', '/admissions', '/academics/courses', '/accounts/approvals', '/accounts/fees', '/accounts/expenses', '/placement', '/onboarding', '/users', '/settings']],
      ['admin', ['/crm/leads', '/crm/followups', '/admissions', '/academics/courses', '/accounts/approvals', '/accounts/fees', '/accounts/expenses', '/placement', '/onboarding', '/users', '/settings']],
      ['counsellor_lead', ['/crm/leads', '/crm/followups', '/admissions']],
      ['counsellor', ['/crm/leads', '/crm/followups', '/admissions', '/accounts/fees']],
      ['accountant', ['/accounts/approvals', '/accounts/fees', '/accounts/expenses']],
      ['trainer', ['/academics/courses']],
      ['student', ['/portal']],
      ['placement_coordinator', ['/placement']],
      ['onboarding_team', ['/onboarding']],
    ];

    it.each(allowedCases)('%s can access permitted routes', async (role, paths) => {
      const cookie = await signedCookie(makeUser(role));
      for (const path of paths) {
        const res = await middleware(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
        expect(res.status, `${role} on ${path}`).toBe(200);
      }
    });

    const deniedCases: Array<[UserRole, string[], number]> = [
      ['counsellor', ['/accounts/approvals', '/accounts/expenses'], 403],
      ['counsellor', ['/users', '/settings', '/placement', '/onboarding', '/academics/courses'], 307],
      ['counsellor_lead', ['/accounts/approvals', '/accounts/expenses', '/placement', '/users', '/settings', '/academics/courses'], 307],
      ['accountant', ['/crm/leads', '/admissions', '/placement', '/onboarding', '/users', '/settings', '/academics/courses'], 307],
      ['trainer', ['/crm/leads', '/admissions', '/accounts/approvals', '/accounts/fees', '/accounts/expenses', '/placement', '/users', '/settings'], 307],
      ['student', ['/crm/leads', '/admissions', '/academics/courses', '/accounts/approvals', '/accounts/fees', '/accounts/expenses', '/placement', '/users'], 307],
      ['placement_coordinator', ['/crm/leads', '/admissions', '/accounts/approvals', '/accounts/expenses', '/users', '/settings', '/academics/courses'], 307],
      ['onboarding_team', ['/crm/leads', '/admissions', '/accounts/approvals', '/accounts/fees', '/placement', '/users'], 307],
    ];

    it.each(deniedCases)('%s is blocked from prohibited routes with HTTP %i', async (role, paths, expectedStatus) => {
      const cookie = await signedCookie(makeUser(role));
      for (const path of paths) {
        const res = await middleware(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
        expect(res.status, `${role} denied on ${path}`).toBe(expectedStatus);
      }
    });
  });

  describe('Phase H — Session Integrity, Open Redirects, Logout & API Enforcement', () => {
    it('rejects missing, corrupt, unsigned, tampered-payload, tampered-sig, and disabled-user cookies', async () => {
      const missingRes = await middleware(new NextRequest('http://localhost/accounts/approvals'));
      expect(missingRes.status).toBe(307);
      expect(missingRes.headers.get('location')).toContain('/login');

      const corruptRes = await middleware(
        new NextRequest('http://localhost/academics/courses', {
          headers: { cookie: `${AUTH_COOKIE_NAME}=%7Bbad-json; ${AUTH_SIG_COOKIE_NAME}=bad` },
        })
      );
      expect(corruptRes.status).toBe(307);
      expect(corruptRes.headers.get('location')).toContain('/login');

      const unsignedRes = await middleware(
        new NextRequest('http://localhost/academics/courses', {
          headers: { cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(makeUser('admin')))}` },
        })
      );
      expect(unsignedRes.status).toBe(307);
      expect(unsignedRes.headers.get('location')).toContain('/login');

      const tamperedPayload = await signedCookie(makeUser('trainer'), { tamperPayload: true });
      const tamperedPayloadRes = await middleware(
        new NextRequest('http://localhost/users', { headers: { cookie: tamperedPayload } })
      );
      expect(tamperedPayloadRes.status).toBe(307);
      expect(tamperedPayloadRes.headers.get('location')).toContain('/login');

      const tamperedSig = await signedCookie(makeUser('trainer'), { tamperSig: true });
      const tamperedSigRes = await middleware(
        new NextRequest('http://localhost/academics/courses', { headers: { cookie: tamperedSig } })
      );
      expect(tamperedSigRes.status).toBe(307);
      expect(tamperedSigRes.headers.get('location')).toContain('/login');

      const disabledCookie = await signedCookie(makeUser('admin', { is_active: false }));
      const disabledRes = await middleware(
        new NextRequest('http://localhost/dashboard', { headers: { cookie: disabledCookie } })
      );
      expect(disabledRes.status).toBe(307);
      expect(disabledRes.headers.get('location')).toContain('/login');
    });

    it('rejects open redirects in getSafeRedirectUrl (VSSO-018)', () => {
      expect(getSafeRedirectUrl('trainer', 'https://evil.example.com/phish')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('accountant', '//evil.example.com')).toBe('/accounts/fees');
      expect(getSafeRedirectUrl('admin', 'javascript:alert(1)')).toBe('/dashboard');
      expect(getSafeRedirectUrl('trainer', '/accounts/approvals')).toBe('/academics/courses');
      expect(getSafeRedirectUrl('trainer', '/academics/batches')).toBe('/academics/batches');
    });

    it('enforces server-side API authorization and clears cookies on logout', async () => {
      const unauthApi = await getPayments(new NextRequest('http://localhost/api/fees/payments'));
      expect(unauthApi.status).toBe(401);

      const studentCookie = await signedCookie(makeUser('student'));
      const studentApi = await getPayments(
        new NextRequest('http://localhost/api/fees/payments', { headers: { cookie: studentCookie } })
      );
      expect([401, 403]).toContain(studentApi.status);

      const logoutRes = await postLogout(new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }));
      expect([200, 303]).toContain(logoutRes.status);
      const setCookie = logoutRes.headers.get('set-cookie') || '';
      expect(setCookie).toContain(AUTH_COOKIE_NAME);
      expect(setCookie).toContain(AUTH_SIG_COOKIE_NAME);
    });
  });
});
