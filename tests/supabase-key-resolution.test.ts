import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSupabaseKey } from '@/lib/supabase/client';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';

describe('Supabase Client Key Resolution & Cross-Environment Guardrails', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('resolves publishable key when valid and matching target environment', () => {
    const key = resolveSupabaseKey(
      'https://tgohtdzwehhjfahtgovq.supabase.co',
      'sb_publishable_valid_production_key_12345',
      'legacy_anon_key'
    );
    expect(key).toBe('sb_publishable_valid_production_key_12345');
  });

  it('rejects staging key when target is production URL and falls back to anonKey', () => {
    const stagingKey = 'sb_publishable_ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe';
    const prodUrl = 'https://tgohtdzwehhjfahtgovq.supabase.co';
    const prodAnonKey = 'sb_publishable_dZxlpPtm_0IMJeU-Pa57mg_lqSEQFJI';

    const resolved = resolveSupabaseKey(prodUrl, stagingKey, prodAnonKey);
    expect(resolved).toBe(prodAnonKey);
  });

  it('rejects staging key containing staging project ref (neiccpnxftfmmwnvtgdy) when target is production', () => {
    const stagingRefKey = 'sb_publishable_neiccpnxftfmmwnvtgdy_sample';
    const prodUrl = 'https://tgohtdzwehhjfahtgovq.supabase.co';
    const prodAnonKey = 'sb_publishable_dZxlpPtm_0IMJeU-Pa57mg_lqSEQFJI';

    const resolved = resolveSupabaseKey(prodUrl, stagingRefKey, prodAnonKey);
    expect(resolved).toBe(prodAnonKey);
  });

  it('permits staging key when target is legitimately staging environment', () => {
    const stagingKey = 'sb_publishable_ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe';
    const stagingUrl = 'https://neiccpnxftfmmwnvtgdy.supabase.co';

    const resolved = resolveSupabaseKey(stagingUrl, stagingKey, 'other_key');
    expect(resolved).toBe(stagingKey);
  });

  it('defaults to mock-key when both keys are empty or missing', () => {
    expect(resolveSupabaseKey('', '', '')).toBe('mock-key');
    expect(resolveSupabaseKey(undefined, undefined, undefined)).toBe('mock-key');
  });

  it('isLiveSupabaseEnabled respects resolved keys in browser context', () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://tgohtdzwehhjfahtgovq.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_dZxlpPtm_0IMJeU-Pa57mg_lqSEQFJI');

    expect(isLiveSupabaseEnabled()).toBe(true);
  });
});
