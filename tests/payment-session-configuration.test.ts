import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true }));
vi.mock('@/lib/services/data-store', () => ({ store: { users: [] } }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } }, error: null }) },
}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
}) }));
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co'));
afterEach(() => vi.unstubAllEnvs());
const request = () => new NextRequest('http://localhost:3000/api/admissions');

it('reports invalid server credentials without mislabeling tenant membership', async () => {
  mocks.profile.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });
  await expect(authenticatePaymentRequest(request())).rejects.toThrow('server Supabase API key is invalid');
});

it('continues to reject a valid profile without tenant membership', async () => {
  mocks.profile.mockResolvedValue({ data: { id: 'verified-user', role: 'admin' }, error: null });
  await expect(authenticatePaymentRequest(request())).rejects.toThrow('Tenant membership is not configured');
});

it('accepts an active profile with authoritative membership', async () => {
  const profile = { id: 'verified-user', role: 'admin', tenant_id: 'institute-a', is_active: true };
  mocks.profile.mockResolvedValue({ data: profile, error: null });
  await expect(authenticatePaymentRequest(request())).resolves.toEqual(profile);
});
