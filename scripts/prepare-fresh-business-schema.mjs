import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';

// Build a reviewed bootstrap for the profiles-only production installation.
// Deliberately excludes demo accounts, financial records and bank account seeds.
const dir = 'supabase/migrations/';
const output = `${dir}20261127115040_initialize_fresh_business_schema.sql`;
const read = name => fs.readFileSync(dir + name, 'utf8');
const clean = sql => sql.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
  .replace(/^CREATE EXTENSION[^;]+;\s*$/gm, '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()')
  .replaceAll("encode(gen_random_bytes(6), 'hex')", "replace(gen_random_uuid()::text, '-', '')");
const parts = [];
const add = (name, sql) => parts.push(`-- SOURCE: ${name}\n${clean(sql)}`);
add('000 schema and RLS only', read('000_full_schema_rls_and_seed.sql').split('-- 5. CORE SEED DATA')[0]);
add('006_onboarding_team_and_cases.sql', read('006_onboarding_team_and_cases.sql'));
add('20261012094737_payment_approval_workflow.sql', read('20261012094737_payment_approval_workflow.sql'));
add('20261022_fix_profile_rls_recursion.sql', read('20261022_fix_profile_rls_recursion.sql'));
add('20261102_crm_lead_enhancements.sql', read('20261102_crm_lead_enhancements.sql'));
// student_payments is an in-memory compatibility ledger, not a SQL table.
add('20261103_student_enrollment_enhancements.sql', read('20261103_student_enrollment_enhancements.sql').replace(/ALTER TABLE student_payments[\s\S]*?;/, ''));
add('bank schema without account seeds', read('20261116_bank_account_presets.sql').replace(/INSERT INTO bank_account_presets[\s\S]*?updated_at = NOW\(\);/, ''));
for (const name of [
  '20261116_placement_enrollments.sql',
  '20261118_add_job_openings_description.sql',
  '20261118_atomic_admission_sequence_and_workflow.sql',
  '20261118_fix_doubts_and_notifications_schema.sql',
  '20261118_update_placement_enrollments_constraints.sql',
]) add(name, read(name));

const compatibility = `
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS syllabus_url text;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
-- Explicit privileges: RLS remains the row authorization boundary.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON public.courses, public.system_settings TO anon;
ALTER POLICY "Super Admins and Admins manage courses" ON public.courses TO authenticated;
ALTER POLICY "Trainers view assigned courses" ON public.courses TO authenticated;
ALTER POLICY "Counsellors view courses" ON public.courses TO authenticated;
ALTER POLICY "Students view enrolled courses" ON public.courses TO authenticated;
REVOKE ALL ON public.fee_workflow_state, public.admission_sequences, public.idempotency_keys FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profiles, public.crm_teams, public.crm_team_members, public.student_lms_access FROM authenticated;
DROP POLICY IF EXISTS "Todos public access" ON public.todos;
CREATE POLICY "Administrators manage todos" ON public.todos FOR ALL TO authenticated
USING (public.get_current_user_role() IN ('super_admin','admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin','admin'));
ALTER FUNCTION public.get_current_user_tenant_id() SET search_path = '';
ALTER FUNCTION public.generate_next_student_unique_id() SET search_path = public;
ALTER FUNCTION public.sync_job_openings_compat_columns() SET search_path = '';
ALTER FUNCTION public.sync_notification_links() SET search_path = '';
ALTER FUNCTION public.sync_doubt_assigned_fields() SET search_path = '';
ALTER FUNCTION public.allocate_admission_number(text, integer) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.generate_next_student_unique_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_student_unique_id() TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.student_unique_id_seq TO authenticated;
INSERT INTO public.system_settings(id, institute_name, address, phone, email, gst_number)
VALUES ('11111111-1111-1111-1111-111111111111','Next-Gen ERP Solutions','','','','') ON CONFLICT DO NOTHING;
INSERT INTO public.placement_eligibility_settings(id) VALUES ('pes-default') ON CONFLICT DO NOTHING;
-- An explicit empty snapshot prevents the legacy adapter from importing demo arrays.
INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
SELECT 'default', 1, jsonb_object_agg(k, '[]'::jsonb)
FROM unnest(ARRAY['studentPayments','studentFees','studentFinancialLedgers','feeAccounts',
'installments','payments','receipts','students','admissions','onboardingCases','onboardingAuditLogs',
'notifications','auditLogs','users','batches','leads','feeApprovalHistories','feeRevisionRequests','feeCategories']) k;
INSERT INTO storage.buckets(id,name,public) VALUES
('avatars','avatars',true),('receipts','receipts',false),('resumes','resumes',false),
('assignments','assignments',false),('doubt-attachments','doubt-attachments',false),('screenshots','screenshots',false)
ON CONFLICT (id) DO NOTHING;
`;
add('followup tenant compatibility', "ALTER TABLE public.lead_followups ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';");
for (const name of [
  '20261123122939_created_by_lead_isolation.sql',
  '20261123183500_telecrm_duplicate_prevention_and_admissions_counsellor.sql',
  '20261123200000_reconcile_authoritative_training_courses.sql',
  '20261124005440_fix_crm_role_helper_search_path.sql',
  '20261124_crm_leads_created_by.sql',
  '20261125_atomic_normalized_financial_persistence.sql',
  '20261125_idempotency_keys.sql',
  '20261127_fix_commit_fee_workflow_receipt_issued_by.sql',
]) add(name, read(name));
add('fresh install compatibility, privileges and empty workflow', compatibility);

const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid,bucket_id text,name text,owner uuid);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;`);
  await db.exec(read('20261127113458_restore_admin_login_profiles.sql'));
  for (const part of parts) {
    try { await db.exec(part); console.log('PASS', part.split('\n')[0]); }
    catch (error) { console.error('FAIL', part.split('\n')[0], error.message); throw error; }
  }
  await db.exec(read('20261127115432_isolate_rls_lookup_helpers.sql'));
  for (const match of read('20261127_fix_commit_fee_workflow_receipt_issued_by.sql').matchAll(/INSERT INTO public\.(\w+)\s*\(([^)]+)\)/g)) {
    const columns = (await db.query('select column_name from information_schema.columns where table_schema=\'public\' and table_name=$1',[match[1]])).rows.map(r => r.column_name);
    for (const column of match[2].split(',').map(c => c.trim())) assert(columns.includes(column), `Missing RPC column ${match[1]}.${column}`);
  }
  assert.equal((await db.query('select count(*)::int n from courses')).rows[0].n, 4);
  for (const table of ['students','admissions','payments','receipts','bank_account_presets'])
    assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from pg_tables where schemaname=\'public\' and not rowsecurity')).rows[0].n, 0);
  await db.exec('SET ROLE anon');
  assert.equal((await db.query('select count(*)::int n from courses')).rows[0].n,4);
  await assert.rejects(db.query('select * from profiles'), /permission denied/);
  await assert.rejects(db.query("delete from courses"), /permission denied/);
  await db.exec('RESET ROLE; SET ROLE authenticated');
  await assert.rejects(db.query('select * from fee_workflow_state'), /permission denied/);
  await assert.rejects(db.query("select commit_fee_workflow('default',1,'{}')"), /permission denied/);
  await db.exec('RESET ROLE; SET ROLE service_role');
  assert.equal((await db.query("select commit_fee_workflow('default',1,'{}') revision")).rows[0].revision, 2);
  await assert.rejects(db.query("select commit_fee_workflow('default',1,'{}')"), /Conflict/);
  await db.exec('RESET ROLE');
  console.log('PASS: empty records, course REST privileges, RLS, RPC column compatibility, service-only commit and revision conflict');
  fs.writeFileSync(output, '-- Fresh business schema; preserves login profiles. No demo or historical business data.\nBEGIN;\n' + parts.join('\n\n') + "\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n");
  console.log('Validated and wrote', output);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.close(); }
