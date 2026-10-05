/**
 * Next-Gen ERP LMS — Supabase Status & Verification Utility
 * Usage: node scripts/supabase-status.cjs
 */
const fs = require('fs');
const path = require('path');

// Read environment from .env.local or fallback to process.env
const envFile = path.resolve(__dirname, '../.env.local');
let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  const urlMatch = content.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/);
  const keyMatch =
    content.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.*)/) ||
    content.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.*)/);
  if (urlMatch) url = urlMatch[1].trim().replace(/^['"]|['"]$/g, '');
  if (keyMatch) key = keyMatch[1].trim().replace(/^['"]|['"]$/g, '');
}

console.log('====================================================');
console.log('   Next-Gen ERP LMS — Supabase Health & Schema Status');
console.log('====================================================');
console.log('Target URL  :', url || '(Not configured)');
console.log('API Key     :', key ? `${key.substring(0, 12)}... (len: ${key.length})` : '(Not configured)');

if (!url || !key) {
  console.error('\n[!] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const client = createClient(url, key);

const TABLES = [
  'profiles',
  'system_settings',
  'leads',
  'lead_followups',
  'admissions',
  'courses',
  'course_modules',
  'lessons',
  'batches',
  'students',
  'batch_students',
  'batch_transfer_audits',
  'lesson_progress',
  'class_sessions',
  'attendance_records',
  'assignments',
  'assignment_submissions',
  'quizzes',
  'quiz_questions',
  'quiz_attempts',
  'student_fee_accounts',
  'installments',
  'payments',
  'receipts',
  'vendors',
  'expenses',
  'placement_profiles',
  'job_openings',
  'job_applications',
  'certificates',
  'sap_server_systems',
  'sap_server_allocations',
  'student_doubts',
  'doubt_messages',
  'notifications',
  'audit_logs',
  'todos',
];

async function runCheck() {
  console.log(`\nInspecting ${TABLES.length} tables in PostgreSQL schema:\n`);

  const ready = [];
  const missing = [];
  const rlsBlocked = [];

  for (const table of TABLES) {
    try {
      const { data, error, count } = await client.from(table).select('*', { count: 'exact' }).limit(1);
      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
          missing.push(table);
          process.stdout.write(`  [!] ${table.padEnd(26)} -> MISSING (Run migration)\n`);
        } else if (error.code === '42501' || error.message.includes('row-level security')) {
          rlsBlocked.push(table);
          process.stdout.write(`  [#] ${table.padEnd(26)} -> TABLE EXISTS (RLS active, auth required)\n`);
        } else {
          process.stdout.write(`  [?] ${table.padEnd(26)} -> ${error.message} (${error.code})\n`);
        }
      } else {
        ready.push({ table, count: count !== null ? count : (data ? data.length : 0) });
        process.stdout.write(`  [✓] ${table.padEnd(26)} -> READY (Rows: ${count !== null ? count : data?.length})\n`);
      }
    } catch (e) {
      process.stdout.write(`  [X] ${table.padEnd(26)} -> Request error: ${e.message}\n`);
    }
  }

  console.log('\n====================================================');
  console.log(`Summary: ${ready.length + rlsBlocked.length}/${TABLES.length} tables found`);
  if (missing.length > 0) {
    console.log(`\n[!] Action required: ${missing.length} tables are missing in your Supabase project.`);
    console.log('    Run the consolidated migration in your Supabase SQL Editor:');
    console.log('    File: supabase/migrations/000_full_schema_rls_and_seed.sql\n');
  } else {
    console.log('\n[✓] All tables exist and are connected to Supabase PostgreSQL!\n');
  }
}

runCheck().catch(console.error);
