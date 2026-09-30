import { createClient as createBrowserClient } from '@supabase/supabase-js';
import { createAdminClient } from './admin';

/**
 * Checks whether live Supabase credentials are configured (non-mock).
 */
export function isLiveSupabaseEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return false;
  if (url.includes('mock-sap-lms') || anonKey.includes('mockAnonKey')) return false;
  return true;
}

/**
 * Returns an active Supabase client instance.
 * Automatically chooses between admin client (server-side with service role)
 * and standard client (browser or server anon).
 */
export function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

  if (typeof window === 'undefined') {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && !serviceRoleKey.includes('mockServiceRoleKey')) {
      return createAdminClient();
    }
  }

  return createBrowserClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: typeof window !== 'undefined',
    },
  });
}

export const createClient = getDb;

