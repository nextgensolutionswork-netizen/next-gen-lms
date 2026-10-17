// Audit-only reproductions. Passing assertions demonstrate defects, not fixes.
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

it('F01: unsigned administrator cookie passes protected-page middleware without live authentication', async () => {
  const response = await middleware(new NextRequest('http://localhost:3117/accounts/approvals', { headers: { cookie: `${AUTH_COOKIE_NAME}=${identity('super_admin')}` } }));
  expect(response.headers.get('x-middleware-next')).toBe('1');
});
it('F02: financial authentication accepts a cookie-only unknown actor after live Auth rejects session', async () => {
  const value = identity('accountant');
  const signature = await generateAuthCookieSignature(value);
  const actor = await authenticatePaymentRequest(new NextRequest('http://localhost:3117/api/fees/payments', { headers: { cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}` } }));
  expect(actor.id).toBe('synthetic-nonexistent');
  expect(actor.role).toBe('accountant');
  expect(actor.tenant_id).toBe('audit-tenant');
});
it.each(['missing row', 'database error'])('F03: student access gate fails open for %s', async (condition) => {
  mocks.gate.mockResolvedValue({ data: null, error: condition === 'database error' ? new Error('database unavailable') : null });
  const response = await middleware(new NextRequest('http://localhost:3117/portal', { headers: { cookie: `${AUTH_COOKIE_NAME}=${identity('student')}` } }));
  expect(response.headers.get('x-middleware-next')).toBe('1');
});
