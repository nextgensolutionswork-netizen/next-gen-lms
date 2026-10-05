import { afterEach, expect, it, vi } from 'vitest';

const sharedClient = vi.hoisted(() => ({ auth: { getSession: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => sharedClient }));

import { getDb } from '@/lib/supabase/db';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('reuses the password recovery session for every browser database client', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');
  vi.stubGlobal('window', {});
  expect(getDb().auth).toBe(sharedClient.auth);
  expect(getDb().auth).toBe(sharedClient.auth);
});
