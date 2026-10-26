import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), client: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => {
  mocks.client(...args);
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-student', email: 'student@example.test' } }, error: null }) },
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: table === 'profiles'
      ? async () => ({ data: { role: 'student', is_active: true }, error: null }) : mocks.access }) }) }),
  };
} }));
import { middleware } from '@/middleware';
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://isolated.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'synthetic-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'must-never-be-used');
  mocks.client.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

it('permits verified active students only with explicitly enabled LMS access', async () => {
  mocks.access.mockResolvedValue({ data: { enabled: true }, error: null });
  expect((await middleware(new NextRequest('http://localhost/portal'))).status).toBe(200);
  expect(mocks.client.mock.calls.every(args => args[1] === 'synthetic-anon')).toBe(true);
});
it.each([null, { enabled: false }])('keeps missing or disabled LMS access blocked with useful feedback: %s', async data => {
  mocks.access.mockResolvedValue({ data, error: null });
  expect((await middleware(new NextRequest('http://localhost/portal'))).headers.get('location')).toContain('error=onboarding_pending');
});
it('distinguishes verification outages from pending onboarding while still denying access', async () => {
  mocks.access.mockResolvedValue({ data: null, error: { message: 'private database diagnostic' } });
  const response = await middleware(new NextRequest('http://localhost/portal'));
  expect(response.headers.get('location')).toContain('error=access_unavailable');
  expect(response.headers.get('location')).not.toContain('private');
});
