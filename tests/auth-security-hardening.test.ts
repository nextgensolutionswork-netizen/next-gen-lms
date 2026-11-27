import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyUserCredentials, validateLoginPreflight } from '@/lib/auth/credentials';
import { store } from '@/lib/services/data-store';
import { UserProfile } from '@/types';

describe('SEC-BUG-02: Authentication Security & Fallback Credentials Hardening', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    store.hydrateFromDisk();
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
  });

  it('1. denies production login when attempting fallback demo credentials in production', async () => {
    (process.env as any).NODE_ENV = 'production';

    const result = await verifyUserCredentials(
      'superadmin@next-generpsolutions.com',
      'AdminPass#2026'
    );

    // Must be denied in production without live Supabase
    expect(result.success).toBe(false);
    expect(result.errorCode).toBeDefined();
    expect(result.user).toBeUndefined();
  });

  it('2. denies login with empty or invalid passwords', async () => {
    const emptyResult = await verifyUserCredentials('admin@next-generpsolutions.com', '');
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.errorCode).toBe('missing_credentials');

    const invalidResult = await verifyUserCredentials('admin@next-generpsolutions.com', 'CompletelyWrongPass!999');
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.errorCode).toBe('invalid_credentials');
  });

  it('3. strictly denies disabled/deactivated accounts from authenticating', () => {
    const deactivatedUser: Pick<UserProfile, 'role' | 'is_active'> = {
      role: 'counsellor',
      is_active: false,
    };

    expect(() => validateLoginPreflight(deactivatedUser)).toThrow(
      /This account has been deactivated/i
    );
  });

  it('4. blocks unprovisioned students whose onboarding is pending', () => {
    const pendingStudent: Pick<UserProfile, 'role' | 'is_active'> = {
      role: 'student',
      is_active: false,
    };

    expect(() => validateLoginPreflight(pendingStudent)).toThrow(
      /pending onboarding verification/i
    );
  });

  it('5. allows valid active staff accounts to pass preflight validation', () => {
    const activeStaff: Pick<UserProfile, 'role' | 'is_active'> = {
      role: 'accountant',
      is_active: true,
    };

    expect(() => validateLoginPreflight(activeStaff)).not.toThrow();
  });

  it('6. prevents null or missing user profiles in preflight', () => {
    expect(() => validateLoginPreflight(null)).toThrow(/User profile not found/i);
  });
});
