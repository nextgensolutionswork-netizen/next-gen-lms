import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ live: true, login: vi.fn(), getUser: vi.fn(), profile: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => m.live, getDb: () => ({ auth: { signInWithPassword: m.login }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.profile }) }) }) }) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: m.getUser } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: m.profile }) }) }) }) }));
import { verifyUserCredentials } from '@/lib/auth/credentials';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
beforeEach(() => { vi.clearAllMocks(); m.live = true; vi.stubEnv('NODE_ENV', 'production'); });
afterEach(() => vi.unstubAllEnvs());
it.each(['rejected', 'missing', 'offline'])('fails closed for live credentials: %s', async reason => {
  if (reason === 'offline') m.login.mockRejectedValue(new Error('Offline'));
  else m.login.mockResolvedValue({ data: { user: null }, error: reason === 'rejected' ? new Error('Denied') : null });
  expect((await verifyUserCredentials('synthetic@example.invalid', 'synthetic-input')).success).toBe(false);
});
it('does not substitute a local profile for an absent live profile', async () => {
  m.login.mockResolvedValue({ data: { user: { id: 'synthetic' } }, error: null });
  m.profile.mockResolvedValue({ data: null, error: null });
  expect((await verifyUserCredentials('synthetic@example.invalid', 'synthetic-input')).success).toBe(false);
});
it('accepts a verified active live profile', async () => {
  m.login.mockResolvedValue({ data: { user: { id: 'synthetic' } }, error: null });
  m.profile.mockResolvedValue({ data: { id: 'synthetic', role: 'counsellor', is_active: true }, error: null });
  expect((await verifyUserCredentials('synthetic@example.invalid', 'synthetic-input')).success).toBe(true);
});
it('rejects production login when live authentication is unconfigured', async () => {
  m.live = false; expect((await verifyUserCredentials('synthetic@example.invalid', 'synthetic-input')).success).toBe(false); expect(m.login).not.toHaveBeenCalled();
});
it.each(['rejected', 'missing', 'offline'])('rejects payment authentication after %s live session', async reason => {
  if (reason === 'offline') m.getUser.mockRejectedValue(new Error('Offline'));
  else m.getUser.mockResolvedValue({ data: { user: null }, error: reason === 'rejected' ? new Error('Denied') : null });
  await expect(authenticatePaymentRequest(new NextRequest('http://localhost/api/fees/payments'))).rejects.toThrow();
  expect(m.profile).not.toHaveBeenCalled();
});
it('accepts verified payment actor and rejects an inactive profile', async () => {
  m.getUser.mockResolvedValue({ data: { user: { id: 'synthetic' } }, error: null });
  m.profile.mockResolvedValue({ data: { id: 'synthetic', role: 'accountant', tenant_id: 'synthetic', is_active: true }, error: null });
  expect((await authenticatePaymentRequest(new NextRequest('http://localhost/api/fees/payments'))).role).toBe('accountant');
  m.profile.mockResolvedValue({ data: { id: 'synthetic', tenant_id: 'synthetic', is_active: false }, error: null });
  await expect(authenticatePaymentRequest(new NextRequest('http://localhost/api/fees/payments'))).rejects.toThrow('Active user');
});
