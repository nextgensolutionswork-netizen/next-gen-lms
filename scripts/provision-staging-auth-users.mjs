import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STAGING_URL = 'https://neiccpnxftfmmwnvtgdy.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laWNjcG54ZnRmbW13bnZ0Z2R5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjIxNjkxOCwiZXhwIjoyMTA3NzkyOTE4fQ.Kbqf_ih7F-Scto8MevqzFNeScZ-djT96mKXBtnaOENQ';
const TENANT_ID = 'staging-isolated-tenant';

const supabase = createClient(STAGING_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('='.repeat(80));
  console.log(' PROVISIONING 100 SYNTHETIC USERS INTO SUPABASE AUTH (neiccpnxftfmmwnvtgdy)');
  console.log('='.repeat(80));

  const manifestPath = path.resolve(__dirname, '..', 'docs', 'staging', '100-synthetic-staging-accounts.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  let createdCount = 0;
  let alreadyExistsCount = 0;
  let studentLmsAccessCount = 0;

  for (const u of manifest.users) {
    const hash = crypto.createHash('md5').update(u.id).digest('hex');
    const profileId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

    const { data: newUser, error } = await supabase.auth.admin.createUser({
      id: profileId,
      email: u.email,
      password: 'StagingPass#2026',
      email_confirm: true,
      user_metadata: {
        role: u.role,
        full_name: u.full_name,
        tenant_id: TENANT_ID,
      },
    });

    if (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        alreadyExistsCount++;
      } else {
        console.error(`  - Error creating auth user ${u.email}:`, error.message);
      }
    } else {
      createdCount++;
    }

    if (u.role === 'student') {
      const { error: accessErr } = await supabase.from('student_lms_access').upsert({
        user_id: profileId,
        tenant_id: TENANT_ID,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (accessErr) {
        console.error(`  - Failed to set student_lms_access for ${u.email}:`, accessErr.message);
      } else {
        studentLmsAccessCount++;
      }
    }
  }

  console.log(`\nResults:`);
  console.log(` - Newly created in auth.users: ${createdCount}`);
  console.log(` - Already existed in auth.users: ${alreadyExistsCount}`);
  console.log(` - Total verified: ${createdCount + alreadyExistsCount} / 100`);
  console.log(` - student_lms_access rows enabled: ${studentLmsAccessCount} / 70`);

  // Test sample logins across roles with anon client
  console.log('\n--- VERIFYING REAL LOGINS VIA SUPABASE AUTH ---');
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laWNjcG54ZnRmbW13bnZ0Z2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMTY5MTgsImV4cCI6MjEwNzc5MjkxOH0.QMWa1r4JQ-SQWcrq2zZCeIJCc0EH7suUCf_KpT8I4FM';
  const anonClient = createClient(STAGING_URL, anonKey);

  const sampleRoles = [
    { role: 'super_admin', email: 'staging.superadmin@next-gen-staging.local' },
    { role: 'admin', email: 'staging.admin.1@next-gen-staging.local' },
    { role: 'accountant', email: 'staging.accounts.1@next-gen-staging.local' },
    { role: 'onboarding_team', email: 'staging.onboarding.1@next-gen-staging.local' },
    { role: 'counsellor', email: 'staging.counsellor.1@next-gen-staging.local' },
    { role: 'trainer', email: 'staging.trainer.1@next-gen-staging.local' },
    { role: 'student', email: 'staging.student.1@next-gen-staging.local' },
  ];

  for (const s of sampleRoles) {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: s.email,
      password: 'StagingPass#2026',
    });
    if (error) {
      console.log(` ✗ [${s.role}] Login FAILED: ${error.message}`);
    } else {
      console.log(` ✓ [${s.role}] Real Auth Login SUCCESS: ${data.user.email} (UUID: ${data.user.id})`);
    }
  }
}

main().catch(console.error);
