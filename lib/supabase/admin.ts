import { createClient } from '@supabase/supabase-js';

// Server-only admin client with elevated privileges for transactional and system tasks
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key';

  // Staging Isolation Guardrail: Fail immediately if staging attempts to target production database
  const isStaging = (process.env.NODE_ENV as string) === 'staging' || process.env.NEXT_PUBLIC_APP_ENV === 'staging';
  const blocklist = process.env.PROD_SUPABASE_HOST_BLOCKLIST;
  if ((isStaging && supabaseUrl.includes('tgohtdzwehhjfahtgovq')) || (blocklist && supabaseUrl.includes(blocklist))) {
    throw new Error(
      'CRITICAL ISOLATION BLOCKER: Staging environment attempted to connect to production database (tgohtdzwehhjfahtgovq). Staging must connect exclusively to nextgen-lms-staging.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
