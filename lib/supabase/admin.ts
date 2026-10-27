import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createResilientFetch } from './fetch-resilience';

let cachedAdminClient: SupabaseClient | null = null;
let cachedCacheKey: string | null = null;

// Server-only admin client with elevated privileges for transactional and system tasks
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key';
  const cacheKey = `${supabaseUrl}::${serviceRoleKey}`;

  if (cachedAdminClient && cachedCacheKey === cacheKey) {
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: createResilientFetch({ maxRetries: 3, timeoutMs: 20000 }),
    },
  });
  cachedCacheKey = cacheKey;

  return cachedAdminClient;
}
