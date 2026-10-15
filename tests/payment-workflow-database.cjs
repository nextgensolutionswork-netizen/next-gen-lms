// Isolated PostgreSQL execution check. Install @electric-sql/pglite in a temporary
// directory and set PGLITE_MODULE to its module path; no live database is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.profiles(id uuid primary key, role text, is_active boolean);
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id text, bucket_id text);
      alter table storage.objects enable row level security;
      create policy legacy_storage_access on storage.objects for all to authenticated using (true) with check (true);
      grant usage on schema public, auth, storage to authenticated, service_role;
      grant select, update on public.profiles to authenticated;
      grant select, insert on storage.objects to authenticated;
    `);
    for (const name of ['students', 'admissions', 'student_fee_accounts', 'installments', 'payments', 'receipts', 'onboarding_cases']) {
      await db.exec(`create table public.${name}(id text);
        grant select, insert on public.${name} to authenticated;
        create policy legacy_access on public.${name} for all to authenticated using (true) with check (true);`);
    }
    await db.exec(fs.readFileSync('supabase/migrations/20261012094737_payment_approval_workflow.sql', 'utf8'));
    const userId = '00000000-0000-0000-0000-000000000001';
    await db.query('insert into profiles values ($1, $2, $3, $4)', [userId, 'accountant', true, 'tenant-a']);
    await db.exec("insert into students values ('a','tenant-a'), ('b','tenant-b')");
    const snapshot = { students: [{ id: 'a', user_id: userId, admission_id: 'enrollment-a', onboarding_required: true }], onboardingCases: [] };
    assert.equal((await db.query('select commit_fee_workflow($1,$2,$3) as revision', ['tenant-a', 0, snapshot])).rows[0].revision, 1);
    await assert.rejects(db.query('select commit_fee_workflow($1,$2,$3)', ['tenant-a', 0, snapshot]), /Conflict/);
    assert.equal((await db.query('select enabled from student_lms_access')).rows[0].enabled, false);
    const checklist = Object.fromEntries(['admission_confirmation', 'student_details_verification', 'document_verification', 'course_confirmation', 'batch_allocation', 'fee_clearance_verification'].map((key) => [key, { completed: true }]));
    snapshot.onboardingCases.push({ admission_id: 'enrollment-a', status: 'in_progress', lms_account_created: true, checklist });
    await db.query('select commit_fee_workflow($1,$2,$3)', ['tenant-a', 1, snapshot]);
    assert.equal((await db.query('select enabled from student_lms_access')).rows[0].enabled, true);
    const invalid = structuredClone(snapshot);
    invalid.onboardingCases[0].lms_account_created = 'not-a-boolean';
    await assert.rejects(db.query('select commit_fee_workflow($1,$2,$3)', ['tenant-a', 2, invalid]));
    assert.equal((await db.query('select revision from fee_workflow_state')).rows[0].revision, 2, 'failed gate write must roll back the financial snapshot too');
    await db.query("select set_config('test.uid', $1, false)", [userId]);
    await db.exec('set role authenticated');
    assert.deepEqual((await db.query('select id from students')).rows.map((r) => r.id), ['a']);
    await assert.rejects(db.query("insert into students values ('foreign', 'tenant-b')"), /row-level security/);
    await assert.rejects(db.query('select * from fee_workflow_state'), /permission denied/);
    await assert.rejects(db.query('select commit_fee_workflow($1,$2,$3)', ['tenant-a', 2, snapshot]), /permission denied/);
    await assert.rejects(db.query("update profiles set role = 'super_admin' where id = $1", [userId]), /authority fields/);
    await assert.rejects(db.query("insert into storage.objects values ('proof', 'payment-proofs')"), /row-level security/);
    console.log('PASS: migration, stale-write conflict, rollback, LMS gate, tenant RLS, profile authority, and private proof policies.');
  } finally { await db.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
