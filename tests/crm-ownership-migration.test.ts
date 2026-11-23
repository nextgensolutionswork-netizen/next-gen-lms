import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

// An isolated PostgreSQL engine. No network, .env, hosted project or customer data.
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function asUser(n: number, sql: string) {
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false);`);
  return db.query(sql);
}
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    CREATE TABLE profiles(id uuid PRIMARY KEY,tenant_id text NOT NULL,role text NOT NULL,is_active boolean DEFAULT true);
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text DEFAULT 'default', counsellor_id uuid REFERENCES profiles(id), full_name text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE lead_followups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id text,lead_id uuid REFERENCES leads(id),counsellor_id uuid,notes text);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),module text,record_id text,user_id uuid);
    CREATE TABLE admissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id text,lead_id uuid REFERENCES leads(id));
    INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n;
    INSERT INTO profiles SELECT id,'default',CASE right(id::text,1) WHEN '3' THEN 'admin' WHEN '4' THEN 'super_admin' ELSE 'counsellor' END,true FROM auth.users;
    UPDATE profiles SET tenant_id='other' WHERE id='${id(8)}';
    INSERT INTO leads(id,full_name,counsellor_id,created_at) VALUES('${id(90)}','Historical','${id(1)}','2020-01-01');
    ALTER TABLE leads ENABLE ROW LEVEL SECURITY; ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY leads_tenant_boundary ON leads AS RESTRICTIVE FOR ALL TO authenticated USING(tenant_id='default') WITH CHECK(tenant_id='default');
    CREATE POLICY "CRM staff manage leads" ON leads FOR ALL TO authenticated USING(true);
    CREATE POLICY "CRM staff manage followups" ON lead_followups FOR ALL TO authenticated USING(true);
    CREATE POLICY "Anyone can insert audit logs" ON audit_logs FOR INSERT WITH CHECK(true);
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON profiles TO anon;
  `);
  await db.exec(readFileSync('supabase/migrations/20261123122939_created_by_lead_isolation.sql','utf8'));
  await db.exec(`UPDATE profiles SET role='counsellor_lead' WHERE id IN ('${id(5)}','${id(6)}');
    INSERT INTO crm_teams(id,tenant_id,name,leader_id) VALUES('${id(20)}','default','Sales','${id(5)}');
    INSERT INTO crm_team_members VALUES('${id(20)}','default','${id(1)}');`);
}, 60000);
afterAll(async()=>{await db.close();});

describe.sequential('Created-by RLS in isolated PostgreSQL',()=>{
 it('1 Radhika creates Lead A; creator defaults to auth.uid',async()=>{
  const r=await asUser(1,`INSERT INTO leads(id,full_name,counsellor_id) VALUES('${id(50)}','Lead A','${id(2)}') RETURNING created_by`);
  expect(r.rows).toEqual([{created_by:id(1)}]);
 });
 it('2 Radhika sees her lead',async()=>{expect((await asUser(1,`SELECT id FROM leads`)).rows).toEqual([{id:id(50)}]);});
 it('3 assignment does not let Mohan view Lead A',async()=>{expect((await asUser(2,'SELECT id FROM leads')).rows).toEqual([]);});
 it('4 Mohan cannot edit Lead A',async()=>{expect((await asUser(2,`UPDATE leads SET full_name='Stolen' WHERE id='${id(50)}' RETURNING id`)).rows).toEqual([]);});
 it('5 Mohan cannot search Lead A',async()=>{expect((await asUser(2,"SELECT id FROM leads WHERE full_name ILIKE '%Lead%' ")).rows).toEqual([]);});
 it('6 export query excludes another creator',async()=>{expect((await asUser(2,'SELECT * FROM leads ORDER BY created_at')).rows).toEqual([]);});
 it('7 creator and tenant are immutable',async()=>{
  await expect(asUser(1,`UPDATE leads SET created_by='${id(2)}' WHERE id='${id(50)}'`)).rejects.toThrow(/immutable/);
  await expect(asUser(1,`UPDATE leads SET tenant_id='other' WHERE id='${id(50)}'`)).rejects.toThrow(/immutable/);
 });
 it('8 Admin sees Lead A',async()=>{expect((await asUser(3,`SELECT id FROM leads WHERE id='${id(50)}'`)).rows).toHaveLength(1);});
 it('9 Super Admin sees Lead A',async()=>{expect((await asUser(4,`SELECT id FROM leads WHERE id='${id(50)}'`)).rows).toHaveLength(1);});
 it('10 authorized team leader sees Lead A',async()=>{expect((await asUser(5,`SELECT id FROM leads WHERE id='${id(50)}'`)).rows).toHaveLength(1);});
 it('11 unrelated team leader cannot see Lead A',async()=>{expect((await asUser(6,'SELECT id FROM leads')).rows).toEqual([]);});
 it('12 unauthenticated access denied',async()=>{
  await db.exec('RESET ROLE; SET ROLE anon;'); await expect(db.query('SELECT * FROM leads')).rejects.toThrow(/permission denied/);
 });
 it('13 direct impersonation insert denied',async()=>{await expect(asUser(2,`INSERT INTO leads(full_name,created_by) VALUES('Forged','${id(1)}')`)).rejects.toThrow(/impersonate/);});
 it('14 followups and notes inherit parent access',async()=>{
  await asUser(1,`INSERT INTO lead_followups(lead_id,tenant_id,counsellor_id,notes) VALUES('${id(50)}','default','${id(1)}','Private note')`);
  expect((await asUser(2,'SELECT * FROM lead_followups')).rows).toEqual([]);
  await expect(asUser(2,`INSERT INTO lead_followups(lead_id,tenant_id,counsellor_id,notes) VALUES('${id(50)}','default','${id(2)}','Forged')`)).rejects.toThrow(/row-level security/);
  await expect(asUser(2,`INSERT INTO audit_logs(module,record_id,user_id) VALUES('CRM','${id(50)}','${id(2)}')`)).rejects.toThrow(/row-level security/);
 });
 it('15 historical lead, assignment and timestamps preserved without inferred creator',async()=>{
  const r=await asUser(3,`SELECT created_by,counsellor_id,created_at::text,full_name FROM leads WHERE id='${id(90)}'`);
  expect(r.rows[0]).toMatchObject({created_by:null,counsellor_id:id(1),full_name:'Historical'});
  expect((r.rows[0] as any).created_at).toContain('2020-01-01');
 });
 it('denies salesperson delete and allows management deletion',async()=>{
  expect((await asUser(1,`DELETE FROM leads WHERE id='${id(50)}' RETURNING id`)).rows).toEqual([]);
  await asUser(3,`INSERT INTO leads(id,full_name) VALUES('${id(51)}','Disposable')`);
  expect((await asUser(3,`DELETE FROM leads WHERE id='${id(51)}' RETURNING id`)).rows).toHaveLength(1);
 });
 it('denies direct conversion of someone else lead',async()=>{await expect(asUser(2,`INSERT INTO admissions(tenant_id,lead_id) VALUES('default','${id(50)}')`)).rejects.toThrow(/conversion access denied/);});
 it('protects team membership and tenant boundaries',async()=>{
  await expect(asUser(6,`INSERT INTO crm_team_members VALUES('${id(20)}','default','${id(2)}')`)).rejects.toThrow(/permission denied/);
  expect((await asUser(8,'SELECT * FROM leads')).rows).toEqual([]);
  await db.exec('RESET ROLE;');
  const p=await db.query("SELECT permissive FROM pg_policies WHERE policyname='leads_tenant_boundary'");
  expect(p.rows).toEqual([{permissive:'RESTRICTIVE'}]);
 });
 it('rejects self-promotion and tenant membership edits',async()=>{
  await expect(asUser(2,`UPDATE profiles SET role='admin' WHERE id='${id(2)}'`)).rejects.toThrow(/server administrator/);
  await expect(asUser(2,`UPDATE profiles SET tenant_id='other' WHERE id='${id(2)}'`)).rejects.toThrow(/server administrator/);
 });
});
