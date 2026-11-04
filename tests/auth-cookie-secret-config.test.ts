import { describe, expect, it, vi } from 'vitest';

describe('AUTH_COOKIE_SECRET missing-secret protection', () => {
  it('rejects a missing authentication secret', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_COOKIE_SECRET', '');

    try {
      await expect(
        import('../lib/security/auth-cookie')
      ).rejects.toThrow(
        'AUTH_COOKIE_SECRET must be configured'
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('rejects a short authentication secret', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_COOKIE_SECRET', 'short-secret');

    try {
      await expect(
        import('../lib/security/auth-cookie')
      ).rejects.toThrow(
        'AUTH_COOKIE_SECRET must be configured'
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
