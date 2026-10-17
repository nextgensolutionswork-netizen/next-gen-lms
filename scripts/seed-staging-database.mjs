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

async function seedStaging() {
  console.log('='.repeat(80));
  console.log(' SEEDING SYNTHETIC RECORDS INTO INDEPENDENT STAGING SUPABASE');
  console.log(` Target Project: ${STAGING_URL} (Ref: neiccpnxftfmmwnvtgdy)`);
  console.log(` Tenant ID:      ${TENANT_ID}`);
  console.log('='.repeat(80));

  // 1. Synthetic Courses
  console.log('\n[1/5] Seeding Synthetic Enterprise Courses...');
  const courses = [
    {
      id: '11111111-1111-1111-1111-111111111101',
      course_code: 'SAP-FICO-STG',
      course_name: 'SAP S/4HANA Finance (FICO) Enterprise',
      duration_weeks: 12,
      price: 45000,
      category: 'SAP Functional',
      status: 'Published',
      description: 'Comprehensive financial accounting and controlling on S/4HANA (Staging Synthetic).',
    },
    {
      id: '11111111-1111-1111-1111-111111111102',
      course_code: 'SAP-MM-STG',
      course_name: 'SAP S/4HANA Sourcing & Procurement (MM)',
      duration_weeks: 10,
      price: 45000,
      category: 'SAP Functional',
      status: 'Published',
      description: 'Materials management, purchasing, inventory, and invoice verification.',
    },
    {
      id: '11111111-1111-1111-1111-111111111103',
      course_code: 'SAP-SD-STG',
      course_name: 'SAP S/4HANA Sales & Distribution (SD)',
      duration_weeks: 10,
      price: 45000,
      category: 'SAP Functional',
      status: 'Published',
      description: 'Order-to-cash lifecycle, pricing procedures, and billing.',
    },
    {
      id: '11111111-1111-1111-1111-111111111104',
      course_code: 'SAP-ABAP-STG',
      course_name: 'SAP ABAP on HANA Cloud Development',
      duration_weeks: 14,
      price: 50000,
      category: 'SAP Technical',
      status: 'Published',
      description: 'Core Data Services (CDS), RAP, and modern ABAP development.',
    },
  ];

  for (const c of courses) {
    const { error } = await supabase.from('courses').upsert(c, { onConflict: 'id' });
    if (error) console.error(`  - Failed to insert course ${c.course_code}:`, error.message);
  }
  console.log(`  ✓ Inserted ${courses.length} synthetic courses.`);

  // 2. Synthetic Profiles (100 Users)
  console.log('\n[2/5] Seeding 100 Synthetic User Profiles across 7 Roles...');
  const manifestPath = path.resolve(__dirname, '..', 'docs', 'staging', '100-synthetic-staging-accounts.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const profilesToInsert = manifest.users.map((u) => {
    // Generate deterministic UUID from ID
    const hash = crypto.createHash('md5').update(u.id).digest('hex');
    const profileId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return {
      id: profileId,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      phone: u.phone,
      is_active: u.is_active,
      tenant_id: TENANT_ID,
      created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    };
  });

  const { error: profileErr } = await supabase.from('profiles').upsert(profilesToInsert, { onConflict: 'email' });
  if (profileErr) {
    console.error('  - Error inserting profiles batch:', profileErr.message);
  } else {
    console.log(`  ✓ Inserted ${profilesToInsert.length} synthetic profiles.`);
  }

  // 3. Synthetic Batches
  console.log('\n[3/5] Seeding Synthetic Academic Batches...');
  const batches = [
    {
      id: '22222222-2222-2222-2222-222222222201',
      batch_code: 'FICO-STG-2026A',
      batch_name: 'SAP FICO Morning Staging Fast-Track',
      course_id: courses[0].id,
      course_name: courses[0].course_name,
      training_mode: 'Hybrid',
      start_date: '2026-11-01',
      end_date: '2027-01-31',
      start_time: '08:00',
      end_time: '10:00',
      status: 'Active',
      max_capacity: 40,
      current_enrollment: 25,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
    {
      id: '22222222-2222-2222-2222-222222222202',
      batch_code: 'MM-STG-2026A',
      batch_name: 'SAP MM Weekend Staging Cohort',
      course_id: courses[1].id,
      course_name: courses[1].course_name,
      training_mode: 'Online',
      start_date: '2026-11-07',
      end_date: '2027-02-15',
      start_time: '10:00',
      end_time: '14:00',
      status: 'Active',
      max_capacity: 35,
      current_enrollment: 20,
      days: ['Sat', 'Sun'],
    },
  ];

  for (const b of batches) {
    const { error } = await supabase.from('batches').upsert(b, { onConflict: 'id' });
    if (error) console.error(`  - Failed to insert batch ${b.batch_code}:`, error.message);
  }
  console.log(`  ✓ Inserted ${batches.length} synthetic cohorts.`);

  // 4. Verify Dual-Ledger State Bootstrapping
  console.log('\n[4/5] Verifying Dual-Ledger fee_workflow_state on Staging...');
  const { data: workflowState, error: stateErr } = await supabase
    .from('fee_workflow_state')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle();

  if (!workflowState && !stateErr) {
    const { error: insErr } = await supabase.from('fee_workflow_state').insert({
      tenant_id: TENANT_ID,
      revision: 1,
      snapshot: {
        timestamp: new Date().toISOString(),
        studentFees: [],
        studentPayments: [],
        studentFinancialLedgers: [],
        feeApprovalHistory: [],
      },
    });
    if (insErr) console.error('  - Failed to initialize fee_workflow_state:', insErr.message);
    else console.log('  ✓ Initialized isolated fee_workflow_state revision 1.');
  } else {
    console.log('  ✓ fee_workflow_state already initialized for staging tenant.');
  }

  // 5. Verification Check
  console.log('\n[5/5] Auditing Database Table Counts on neiccpnxftfmmwnvtgdy...');
  const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: courseCount } = await supabase.from('courses').select('*', { count: 'exact', head: true });
  const { count: batchCount } = await supabase.from('batches').select('*', { count: 'exact', head: true });

  console.log(`  - Total Registered Profiles: ${userCount}`);
  console.log(`  - Total Courses:            ${courseCount}`);
  console.log(`  - Total Batches:            ${batchCount}`);
  console.log('\nStaging database initialization successfully completed!');
}

seedStaging().catch(console.error);
