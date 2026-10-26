// Audit reproductions retained as regressions for the corrected behavior.
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), gate: vi.fn(),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
  auth: { getUser: mocks.getUser },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.gate }) }) }),
}) }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true }));
import { middleware } from '@/middleware';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://isolated-audit.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic');
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('No valid Supabase session') });
  mocks.gate.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());
const identity = (role: string) => encodeURIComponent(JSON.stringify({ id: 'synthetic-nonexistent', email: 'audit@example.test', role, tenant_id: 'audit-tenant', is_active: true }));

it('F01: unsigned administrator cookie is rejected by protected-page middleware without live authentication', async () => {
  const response = await middleware(new NextRequest('http://localhost:3117/accounts/approvals', { headers: { cookie: `${AUTH_COOKIE_NAME}=${identity('super_admin')}` } }));
  expect(response.headers.get('location')).toContain('/login');
});
it('F02: financial authentication rejects a cookie-only unknown actor after live Auth rejects session', async () => {
  const value = identity('accountant');
  const signature = await generateAuthCookieSignature(value);
  await expect(
    authenticatePaymentRequest(new NextRequest('http://localhost:3117/api/fees/payments', { headers: { cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}` } }))
  ).rejects.toThrow('Unauthorized: Unknown or unverified user profile.');
});
it.each(['missing row', 'database error'])('F03: student access gate fails closed for %s', async (condition) => {
  mocks.gate.mockResolvedValue({ data: null, error: condition === 'database error' ? new Error('database unavailable') : null });
  const val = identity('student');
  const sig = await generateAuthCookieSignature(val);
  const response = await middleware(new NextRequest('http://localhost:3117/portal', { headers: { cookie: `${AUTH_COOKIE_NAME}=${val}; ${AUTH_SIG_COOKIE_NAME}=${sig}` } }));
  expect(response.headers.get('location')).toContain(condition === 'database error'
    ? '/login?error=access_unavailable'
    : '/login?error=onboarding_pending');
});
