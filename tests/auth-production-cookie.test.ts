import { afterEach, expect, it, vi } from 'vitest';
import { setAuthCookie } from '@/components/providers/auth-provider';
import type { UserProfile } from '@/types';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('preserves server-signed cookies when the production profile is refreshed', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const cookie = 'next_gen_auth_user=server-payload; next_gen_auth_user_sig=server-signature';
  const document = { cookie };
  const setItem = vi.fn();
  vi.stubGlobal('document', document);
  vi.stubGlobal('localStorage', { setItem });
  const profile = { id: 'test-id', email: 'test@example.invalid', role: 'admin', is_active: true } as UserProfile;
  await setAuthCookie(profile);
  expect(document.cookie).toBe(cookie);
  expect(setItem).toHaveBeenCalledWith('next_gen_auth_user', JSON.stringify(profile));
});
