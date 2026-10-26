import { afterEach, expect, it, vi } from 'vitest';
import { getStoredUser } from '@/components/providers/auth-provider';

afterEach(() => vi.unstubAllGlobals());

it.each([1, 2])('restores a session profile with %i cookie encoding layers', (layers) => {
  const profile = { id: 'synthetic-cookie-user', email: 'cookie@example.invalid', role: 'student', is_active: true };
  let value = JSON.stringify(profile);
  for (let i = 0; i < layers; i++) value = encodeURIComponent(value);
  vi.stubGlobal('document', { cookie: `unrelated=value; next_gen_auth_user=${value}` });
  expect(getStoredUser()).toEqual(profile);
});

it('rejects malformed cookie JSON', () => {
  vi.stubGlobal('document', { cookie: 'next_gen_auth_user=%7Bbroken' });
  expect(getStoredUser()).toBeNull();
});
