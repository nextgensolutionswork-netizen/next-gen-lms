import { createBrowserClient } from '@supabase/ssr';

export function resolveSupabaseKey(
  url?: string,
  publishableKey?: string,
  anonKey?: string
): string {
  const targetUrl = url || '';
  const pub = publishableKey || '';
  const anon = anonKey || '';

  // Cross-Environment Key Guardrail:
  // If connected to production (tgohtdzwehhjfahtgovq), ensure we do not use the staging project key (neiccpnxftfmmwnvtgdy / ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe).
  const isProdUrl = targetUrl.includes('tgohtdzwehhjfahtgovq');
  const isStagingKey =
    pub.includes('ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe') ||
    pub.includes('neiccpnxftfmmwnvtgdy');

  if (isProdUrl && isStagingKey) {
    if (
      anon &&
      !anon.includes('ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe') &&
      !anon.includes('neiccpnxftfmmwnvtgdy')
    ) {
      return anon;
    }
  }

  return pub || anon || 'mock-key';
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const key = resolveSupabaseKey(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return createBrowserClient(url, key);
}
