import { execSync } from 'child_process';

const migrations = [
  'supabase/migrations/004_sap_lab_servers.sql',
  'supabase/migrations/005_student_doubts.sql',
  'supabase/migrations/006_onboarding_team_and_cases.sql',
  'supabase/migrations/007_gst_and_compliance.sql',
  'supabase/migrations/20261012094737_payment_approval_workflow.sql',
  'supabase/storage_setup.sql',
];

console.log('Starting migration execution on nextgen-lms-staging (neiccpnxftfmmwnvtgdy)...');

for (const m of migrations) {
  console.log(`\n>>> Applying: ${m}`);
  try {
    const cmd = `npx.cmd supabase db query --linked --project-ref neiccpnxftfmmwnvtgdy -f "${m}"`;
    const out = execSync(cmd, { encoding: 'utf8' });
    console.log(`✓ Successfully applied: ${m}`);
  } catch (err) {
    console.error(`✗ Error applying ${m}:`);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
  }
}

console.log('\nAll staging migrations finished.');
