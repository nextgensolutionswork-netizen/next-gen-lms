import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
import { middleware } from '@/middleware';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  mocks.getUser.mockResolvedValue({ data: { user: {
    id: 'verified-user', email: 'user@example.com', user_metadata: { role: 'super_admin' },
  } }, error: null });
  mocks.profile.mockResolvedValue({ data: { role: 'admin', is_active: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

function request() {
  const req = new NextRequest('http://localhost:3000/dashboard');
  req.cookies.set('next_gen_auth_user', encodeURIComponent(JSON.stringify({ role: 'super_admin' })));
  req.cookies.set('next_gen_auth_user_sig', 'stale-signature');
  return req;
}

it('accepts a verified live session despite an outdated application cookie signature', async () => {
  expect((await middleware(request())).status).toBe(200);
});

it('does not let application cookies replace a rejected Supabase session', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
  expect((await middleware(request())).headers.get('location')).toContain('/login');
});

it('uses the database role instead of user-editable metadata or cached role', async () => {
  mocks.profile.mockResolvedValue({ data: { role: 'student', is_active: true }, error: null });
  expect((await middleware(request())).headers.get('location')).toBe('http://localhost:3000/portal');
});

it('rejects inactive profiles even with a valid Supabase session', async () => {
  mocks.profile.mockResolvedValue({ data: { role: 'admin', is_active: false }, error: null });
  expect((await middleware(request())).headers.get('location')).toContain('/login');
});
