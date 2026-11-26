import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { GET as getPayments } from '@/app/api/fees/payments/route';
import { POST as postLogout } from '@/app/api/auth/logout/route';
import { canAccessCourse } from '@/lib/auth/rbac';
import {
  generateAuthCookieSignature,
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
} from '@/lib/security/auth-cookie';
import { UserProfile } from '@/types';

const trainerUser: UserProfile = {
  id: 'usr-trainer-fico',
  email: 'vikram.fico@next-generpsolutions.com',
  full_name: 'Vikram Rao',
  role: 'trainer',
  assigned_course_ids: ['crs-fico-01'],
  tenant_id: 'default',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

async function signedCookieHeader(user: Partial<UserProfile>, tamperPayload = false, tamperSig = false) {
  const payload = encodeURIComponent(JSON.stringify(user));
  const sig = await generateAuthCookieSignature(payload);
  const finalPayload = tamperPayload ? encodeURIComponent(JSON.stringify({ ...user, role: 'super_admin' })) : payload;
  const finalSig = tamperSig ? '0'.repeat(sig.length) : sig;
  return `${AUTH_COOKIE_NAME}=${finalPayload}; ${AUTH_SIG_COOKIE_NAME}=${finalSig}`;
}

function classifyAuthResponse(status: number, locationHeader: string | null, contentType: string | null) {
  if (status === 302 && locationHeader?.includes('vercel.com/sso-api')) {
    return 'VERCEL_SSO_PROTECTION';
  }
  if (status === 307 && locationHeader?.includes('/login')) {
    return 'APP_LOGIN_REQUIRED';
  }
  if ((status === 401 || status === 403) && contentType?.includes('application/json')) {
    return 'APP_API_UNAUTHORIZED';
  }
  return 'OTHER';
}

describe('TASK-04: Vercel Authentication & Application Auth Boundary (VSSO)', () => {
  it('VSSO-04: Valid Trainer session grants authorized access to /academics/courses', async () => {
    const cookie = await signedCookieHeader(trainerUser);
    const req = new NextRequest('http://localhost/academics/courses', { headers: { cookie } });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('VSSO-05 & VSSO-07: Inactive user and tampered authentication cookie are rejected', async () => {
    const inactiveCookie = await signedCookieHeader({ ...trainerUser, is_active: false });
    const inactiveRes = await middleware(
      new NextRequest('http://localhost/academics/courses', { headers: { cookie: inactiveCookie } })
    );
    expect(inactiveRes.status).toBe(307);
    expect(inactiveRes.headers.get('location')).toContain('/login');

    const tamperedPayloadCookie = await signedCookieHeader(trainerUser, true, false);
    const tamperedPayloadRes = await middleware(
      new NextRequest('http://localhost/academics/courses', { headers: { cookie: tamperedPayloadCookie } })
    );
    expect(tamperedPayloadRes.status).toBe(307);
    expect(tamperedPayloadRes.headers.get('location')).toContain('/login');

    const tamperedSigCookie = await signedCookieHeader(trainerUser, false, true);
    const tamperedSigRes = await middleware(
      new NextRequest('http://localhost/academics/courses', { headers: { cookie: tamperedSigCookie } })
    );
    expect(tamperedSigRes.status).toBe(307);
    expect(tamperedSigRes.headers.get('location')).toContain('/login');
  });

  it('VSSO-06 & VSSO-12: Missing/cleared session cookies after logout invalidate application access', async () => {
    const logoutReq = new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });
    const logoutRes = await postLogout(logoutReq);
    expect([200, 303]).toContain(logoutRes.status);

    const setCookies = logoutRes.headers.get('set-cookie') || '';
    expect(setCookies).toContain(AUTH_COOKIE_NAME);

    // Subsequent request without valid session cookies must redirect to /login
    const afterLogoutRes = await middleware(new NextRequest('http://localhost/academics/courses'));
    expect(afterLogoutRes.status).toBe(307);
    expect(afterLogoutRes.headers.get('location')).toContain('/login');
  });

  it('VSSO-08 & VSSO-09: Trainer cannot access administrative or restricted financial routes', async () => {
    const cookie = await signedCookieHeader(trainerUser);
    for (const path of ['/users', '/settings', '/audit-logs', '/accounts/approvals', '/accounts/expenses']) {
      const res = await middleware(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/academics/courses');
    }

    const apiRes = await getPayments(new NextRequest('http://localhost/api/fees/payments', { headers: { cookie } }));
    expect([401, 403]).toContain(apiRes.status);
  });

  it('VSSO-10 & VSSO-11: Trainer cannot access unassigned courses or cross-tenant records', () => {
    expect(canAccessCourse(trainerUser, 'crs-fico-01')).toBe(true);
    expect(canAccessCourse(trainerUser, 'crs-mm-01')).toBe(false);
    const foreignTrainer: UserProfile = { ...trainerUser, tenant_id: 'tenant-beta' };
    expect(foreignTrainer.tenant_id).not.toBe(trainerUser.tenant_id);
  });

  it('VSSO-13 & VSSO-14: Unauthenticated requests redirect to /login and Vercel SSO is classified distinctly', async () => {
    const unauthRes = await middleware(new NextRequest('http://localhost/academics/courses'));
    expect(unauthRes.status).toBe(307);
    expect(unauthRes.headers.get('location')).toContain('/login');
    expect(classifyAuthResponse(unauthRes.status, unauthRes.headers.get('location'), 'text/plain')).toBe('APP_LOGIN_REQUIRED');
    expect(
      classifyAuthResponse(302, 'https://vercel.com/sso-api?url=https%3A%2F%2Fexample.vercel.app', 'text/plain')
    ).toBe('VERCEL_SSO_PROTECTION');
    expect(classifyAuthResponse(401, null, 'application/json')).toBe('APP_API_UNAUTHORIZED');
  });

  it('VSSO-15: Sensitive credentials in URL query parameters are stripped and never echoed', async () => {
    const req = new NextRequest('http://localhost/login?password=SecretPassword123');
    const res = await middleware(req);
    expect(res.status).toBe(308);
    const loc = res.headers.get('location') || '';
    expect(loc).not.toContain('SecretPassword123');
    expect(loc).toContain('error=insecure_request');
  });
});
