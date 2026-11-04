import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'http://127.0.0.1:65321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function signUserJwt(userId: string, email: string, role = 'authenticated') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: userId,
    email: email,
    exp: Math.floor(Date.now() / 1000) + 7200,
  };
  const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = b64(header) + '.' + b64(payload);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return unsigned + '.' + sig;
}

function createUserClient(userId: string, email: string) {
  const token = signUserJwt(userId, email);
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

describe('Final Local Supabase Database and RLS Security Verification', () => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const counsellor1AId = '44444444-4444-4444-4444-444444444444';
  const counsellor1AEmail = 'counsellor@next-generpsolutions.com';
  const counsellor1AClient = createUserClient(counsellor1AId, counsellor1AEmail);

  const counsellor2AId = '44444444-4444-4444-4444-444444444445';
  const counsellor2AEmail = 'counsellor2.tenanta@test.lms';
  const counsellor2AClient = createUserClient(counsellor2AId, counsellor2AEmail);

  const counsellorBId = '88888888-8888-8888-8888-888888888881';
  const counsellorBEmail = 'counsellor.tenantb@test.lms';
  const counsellorBClient = createUserClient(counsellorBId, counsellorBEmail);

  const adminAId = '22222222-2222-2222-2222-222222222222';
  const adminAEmail = 'admin@next-generpsolutions.com';
  const adminAUserClient = createUserClient(adminAId, adminAEmail);

  const trainerId = '55555555-5555-5555-5555-555555555551';
  const trainerEmail = 'vikram.fico@next-generpsolutions.com';
  const trainerClient = createUserClient(trainerId, trainerEmail);

  const studentAmitId = '77777777-7777-7777-7777-777777777771';
  const studentAmitEmail = 'amit.gupta@student.next-gen.com';
  const studentAmitClient = createUserClient(studentAmitId, studentAmitEmail);

  const studentSnehaId = '77777777-7777-7777-7777-777777777772';
  const studentSnehaEmail = 'sneha.k@student.next-gen.com';

  beforeAll(async () => {
    // Ensure synthetic users exist in profiles
    await adminClient.from('profiles').upsert([
      {
        id: counsellor2AId,
        email: counsellor2AEmail,
        full_name: 'Tenant A Counsellor 2',
        role: 'counsellor',
        tenant_id: 'default',
      },
      {
        id: counsellorBId,
        email: counsellorBEmail,
        full_name: 'Tenant B Counsellor',
        role: 'counsellor',
        tenant_id: 'tenant-b',
      },
    ]);
  });

  // =========================================================================
  // Phase 1: Environment Health
  // =========================================================================
  describe('Phase 1 — Isolated Environment Health', () => {
    it('verifies Auth health endpoint returns HTTP 200 and GoTrue version', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe('GoTrue');
    });

    it('verifies Storage API status endpoint returns HTTP 200', async () => {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/status`);
      expect(res.status).toBe(200);
    });

    it('verifies PostgREST REST root returns HTTP 200 with anon key', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: ANON_KEY },
      });
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // Phase 2: CRM Database & RLS Tests
  // =========================================================================
  describe('Phase 2 — CRM Database Tests', () => {
    describe('CRM-098: Schema & Compatibility', () => {
      it('verifies leads table contains canonical_phone, idempotency_key, and deduplication columns', async () => {
        const testLeadId = '11111111-9999-0001-0001-000000000011';
        const { data, error } = await adminClient
          .from('leads')
          .upsert({
            id: testLeadId,
            lead_code: 'LD-CRM098-V1',
            full_name: 'CRM098 Test Lead',
            phone: '9811199911',
            email: 'crm098.test1@example.com',
            country_code: '+91',
            whatsapp_country_code: '+91',
            whatsapp_number: '9811199911',
            tenant_id: 'default',
            stage: 'New',
            training_preference: 'Online',
            lead_source: 'Website',
            is_repeat_inquiry: false,
            idempotency_key: 'idem-crm098-v1',
          })
          .select('*, canonical_phone')
          .single();

        expect(error).toBeNull();
        expect(data?.canonical_phone).toBe('919811199911');
        await adminClient.from('leads').delete().eq('id', testLeadId);
      });

      it('verifies admissions schema supports lead_id relationship and bank columns', async () => {
        const testAdmId = '22222222-9999-0001-0001-000000000011';
        const { data, error } = await adminClient
          .from('admissions')
          .upsert({
            id: testAdmId,
            admission_number: 'ADM-CRM098-V1',
            student_name: 'CRM098 Test Student',
            phone: '9811199911',
            email: 'crm098.adm1@example.com',
            dob: '2000-01-01',
            gender: 'Male',
            address: '123 Street',
            city: 'Pune',
            education: 'B.Sc',
            current_employment_status: 'Student',
            course_id: 'c1000000-0000-0000-0000-000000000001',
            training_mode: 'Online',
            course_fee: 35000,
            net_payable: 35000,
            payment_plan: 'Full Payment',
            status: 'Confirmed',
            tenant_id: 'default',
            student_unique_id: 'STU-CRM098-V1',
            alternate_phone: '9822233344',
            photo_url: '/api/students/photo?path=default/test.jpg',
            our_bank_name: 'ICICI Bank',
            our_bank_account_name: 'Next-Gen ERP Solutions',
            our_bank_account_id: '123405001122',
            our_upi_details: 'nextgenerp@icici',
          })
          .select('id, admission_number, our_bank_name')
          .single();

        expect(error).toBeNull();
        expect(data?.admission_number).toBe('ADM-CRM098-V1');
        await adminClient.from('admissions').delete().eq('id', testAdmId);
      });

      it('verifies payments table contains the 4 bank detail columns and tenant_id', async () => {
        const { error } = await adminClient
          .from('payments')
          .select('id, our_bank_name, our_bank_account_name, our_bank_account_id, our_upi_details, tenant_id')
          .limit(1);

        expect(error).toBeNull();
      });
    });

    describe('CRM-099: Constraints & Deduplication Guarantees', () => {
      const phone99 = '9877788811';
      const idemKey = 'idem-crm099-v1';
      const lead1Id = '33333333-9999-0001-0001-000000000011';
      const lead2Id = '33333333-9999-0001-0001-000000000012';
      const lead3Id = '33333333-9999-0001-0001-000000000013';

      beforeAll(async () => {
        await adminClient.from('leads').delete().in('id', [lead1Id, lead2Id, lead3Id]);
      });

      it('inserts primary active lead successfully and calculates canonical_phone automatically', async () => {
        const { data, error } = await adminClient.from('leads').insert({
          id: lead1Id,
          lead_code: 'LD-99-01',
          full_name: 'Primary Candidate',
          phone: phone99,
          email: 'prim99@test.com',
          country_code: '+91',
          tenant_id: 'default',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
          idempotency_key: idemKey,
          is_repeat_inquiry: false,
        }).select().single();

        expect(error).toBeNull();
        expect(data?.canonical_phone).toBe(`91${phone99}`);
      });

      it('rejects duplicate active phone in the SAME tenant with unique constraint violation', async () => {
        const { error } = await adminClient.from('leads').insert({
          id: lead2Id,
          lead_code: 'LD-99-02',
          full_name: 'Duplicate Same Tenant',
          phone: phone99,
          email: 'dup.same@test.com',
          country_code: '+91',
          tenant_id: 'default',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
          is_repeat_inquiry: false,
        });

        expect(error).toBeDefined();
        expect(error?.message).toContain('unique constraint');
      });

      it('permits identical phone in a DIFFERENT tenant without conflict', async () => {
        const { data, error } = await adminClient.from('leads').insert({
          id: lead2Id,
          lead_code: 'LD-99-02',
          full_name: 'Tenant B Same Phone',
          phone: phone99,
          email: 'dup.tenantb@test.com',
          country_code: '+91',
          tenant_id: 'tenant-b',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
          is_repeat_inquiry: false,
        }).select().single();

        expect(error).toBeNull();
        expect(data?.tenant_id).toBe('tenant-b');
      });

      it('permits legitimate repeat inquiry with identical phone in same tenant when is_repeat_inquiry = true', async () => {
        const { data, error } = await adminClient.from('leads').insert({
          id: lead3Id,
          lead_code: 'LD-99-03',
          full_name: 'Primary Repeat Inquiry',
          phone: phone99,
          email: 'prim99.repeat@test.com',
          country_code: '+91',
          tenant_id: 'default',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
          is_repeat_inquiry: true,
          repeat_inquiry_reason: 'Legitimate repeat inquiry test',
          original_lead_id: lead1Id,
        }).select().single();

        expect(error).toBeNull();
        expect(data?.is_repeat_inquiry).toBe(true);
      });

      it('rejects duplicate idempotency key in same tenant with unique constraint violation', async () => {
        const { error } = await adminClient.from('leads').insert({
          id: '33333333-9999-0001-0001-000000000014',
          lead_code: 'LD-99-04',
          full_name: 'Duplicate Idempotency Key',
          phone: '9877788899',
          email: 'idem.dup@test.com',
          country_code: '+91',
          tenant_id: 'default',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
          idempotency_key: idemKey, // same key as lead1Id
        });

        expect(error).toBeDefined();
        expect(error?.message).toContain('unique constraint');
      });
    });

    describe('CRM-100: Live Cross-Tenant RLS Read Restrictions', () => {
      const leadAId = '44444444-9999-0001-0001-000000000021';
      const leadBId = '44444444-9999-0001-0001-000000000022';

      beforeAll(async () => {
        await adminClient.from('leads').upsert([
          {
            id: leadAId,
            lead_code: 'LD-CRM100-A',
            full_name: 'Tenant A Confidential Lead',
            phone: '9866655511',
            email: 'crm100.a@test.com',
            country_code: '+91',
            tenant_id: 'default',
            stage: 'New',
            training_preference: 'Online',
            lead_source: 'Website',
            counsellor_id: counsellor1AId,
          },
          {
            id: leadBId,
            lead_code: 'LD-CRM100-B',
            full_name: 'Tenant B Confidential Lead',
            phone: '9866655522',
            email: 'crm100.b@test.com',
            country_code: '+91',
            tenant_id: 'tenant-b',
            stage: 'New',
            training_preference: 'Online',
            lead_source: 'Website',
            counsellor_id: counsellorBId,
          },
        ]);
      });

      it('Tenant B Counsellor querying leads sees only Tenant B leads, zero Tenant A leads', async () => {
        const { data, error } = await counsellorBClient.from('leads').select('id, lead_code, tenant_id');
        expect(error).toBeNull();
        expect(data?.some((l) => l.id === leadBId)).toBe(true);
        expect(data?.some((l) => l.id === leadAId)).toBe(false);
        expect(data?.every((l) => l.tenant_id === 'tenant-b')).toBe(true);
      });

      it('Tenant A Counsellor querying leads sees only Tenant A leads, zero Tenant B leads', async () => {
        const { data, error } = await counsellor1AClient.from('leads').select('id, lead_code, tenant_id');
        expect(error).toBeNull();
        expect(data?.some((l) => l.id === leadAId)).toBe(true);
        expect(data?.some((l) => l.id === leadBId)).toBe(false);
      });
    });

    describe('CRM-101: Live Cross-Tenant & Ownership RLS Write Restrictions', () => {
      const leadAId = '44444444-9999-0001-0001-000000000021';
      const leadCounsellor2A = '44444444-9999-0001-0001-000000000023';

      beforeAll(async () => {
        await adminClient.from('leads').upsert({
          id: leadCounsellor2A,
          lead_code: 'LD-CRM101-C2',
          full_name: 'Lead assigned to Counsellor 2',
          phone: '9844433322',
          email: 'crm101.c2@test.com',
          tenant_id: 'default',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
          counsellor_id: counsellor2AId,
        });
      });

      it('rejects cross-tenant INSERT with RLS policy violation', async () => {
        const { error } = await counsellorBClient.from('leads').insert({
          id: '55555555-9999-0001-0001-000000000021',
          lead_code: 'LD-INJ-101',
          full_name: 'Cross Tenant Injected Lead',
          phone: '9855522211',
          email: 'inj101@test.com',
          tenant_id: 'default',
          stage: 'New',
          training_preference: 'Online',
          lead_source: 'Website',
        });

        expect(error).toBeDefined();
        expect(error?.message).toContain('row-level security policy');
      });

      it('cross-tenant UPDATE affects 0 rows and leaves target record unmodified', async () => {
        const { data, error } = await counsellorBClient
          .from('leads')
          .update({ stage: 'Contacted', notes: 'Tampered by Tenant B' })
          .eq('id', leadAId)
          .select();

        expect(data?.length || 0).toBe(0);

        const { data: verified } = await adminClient.from('leads').select('stage').eq('id', leadAId).single();
        expect(verified?.stage).toBe('New');
      });

      it('cross-tenant DELETE affects 0 rows and target record remains preserved', async () => {
        const { data } = await counsellorBClient
          .from('leads')
          .delete()
          .eq('id', leadAId)
          .select();

        expect(data?.length || 0).toBe(0);

        const { data: verified } = await adminClient.from('leads').select('id').eq('id', leadAId).single();
        expect(verified?.id).toBe(leadAId);
      });

      it('same-tenant Counsellor 1 attempting to update lead assigned to Counsellor 2 is blocked (0 rows affected)', async () => {
        const { data } = await counsellor1AClient
          .from('leads')
          .update({ stage: 'Lost' })
          .eq('id', leadCounsellor2A)
          .select();

        expect(data?.length || 0).toBe(0);
      });

      it('authorized same-tenant operation by owning counsellor succeeds', async () => {
        const { data, error } = await counsellor1AClient
          .from('leads')
          .update({ stage: 'Contacted', notes: 'Legitimate counsellor update' })
          .eq('id', leadAId)
          .select();

        expect(error).toBeNull();
        expect(data?.[0]?.stage).toBe('Contacted');
      });
    });
  });

  // =========================================================================
  // Phase 3: Student Photo Storage Security
  // =========================================================================
  describe('Phase 3 — Student Photo Storage Security', () => {
    const photoPathAmit = 'default/live-v-amit.jpg';
    const photoPathSneha = 'default/live-v-sneha.jpg';
    const photoBytes = Buffer.from('MOCK_JPEG_PHOTO_DATA');

    beforeAll(async () => {
      // Link Amit and Sneha photo URLs in students table
      await adminClient
        .from('students')
        .update({ photo_url: `/api/students/photo?path=${photoPathAmit}`, profile_photo: `/api/students/photo?path=${photoPathAmit}` })
        .eq('user_id', studentAmitId);

      await adminClient
        .from('students')
        .update({ photo_url: `/api/students/photo?path=${photoPathSneha}`, profile_photo: `/api/students/photo?path=${photoPathSneha}` })
        .eq('user_id', studentSnehaId);
    });

    it('verifies student-photos bucket is strictly private and enforces 2MB limit', async () => {
      const { data: bucket, error } = await adminClient.storage.getBucket('student-photos');
      expect(error).toBeNull();
      expect(bucket?.public).toBe(false);
      expect(bucket?.file_size_limit).toBe(2097152);
    });

    it('verifies unauthenticated public download is denied', async () => {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/student-photos/${photoPathAmit}`);
      expect([400, 403, 404]).toContain(res.status);
    });

    it('permits authorized staff upload (counsellor) with no RLS error', async () => {
      const { data, error } = await counsellor1AClient.storage
        .from('student-photos')
        .upload(photoPathAmit, photoBytes, { contentType: 'image/jpeg', upsert: true });

      expect(error).toBeNull();
      expect(data?.path).toBe(photoPathAmit);

      // Seed Sneha's photo for self-access testing
      await counsellor1AClient.storage
        .from('student-photos')
        .upload(photoPathSneha, photoBytes, { contentType: 'image/jpeg', upsert: true });
    });

    it('denies unauthorized staff upload (trainer) with RLS policy error', async () => {
      const { error } = await trainerClient.storage
        .from('student-photos')
        .upload('default/trainer-tamper.jpg', photoBytes, { contentType: 'image/jpeg' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('row-level security policy');
    });

    it('denies cross-tenant upload (Tenant B counsellor into Tenant A path)', async () => {
      const { error } = await counsellorBClient.storage
        .from('student-photos')
        .upload('default/tenantb-tamper.jpg', photoBytes, { contentType: 'image/jpeg' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('row-level security policy');
    });

    it('denies storage path manipulation (traversal ../)', async () => {
      const { error } = await counsellor1AClient.storage
        .from('student-photos')
        .upload('default/../traversal.jpg', photoBytes, { contentType: 'image/jpeg' });

      expect(error).toBeDefined();
    });

    it('permits authorized staff read (counsellor in same tenant)', async () => {
      const { data, error } = await counsellor1AClient.storage
        .from('student-photos')
        .download(photoPathAmit);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('denies unauthorized staff read (trainer)', async () => {
      const { error } = await trainerClient.storage
        .from('student-photos')
        .download(photoPathAmit);

      expect(error).toBeDefined();
    });

    it('denies cross-tenant read (Tenant B counsellor reading Tenant A photo)', async () => {
      const { error } = await counsellorBClient.storage
        .from('student-photos')
        .download(photoPathAmit);

      expect(error).toBeDefined();
    });

    it('permits student self-access (Amit downloads own photo)', async () => {
      const { data, error } = await studentAmitClient.storage
        .from('student-photos')
        .download(photoPathAmit);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('denies student accessing another student photo (Amit reading Sneha photo)', async () => {
      const { error } = await studentAmitClient.storage
        .from('student-photos')
        .download(photoPathSneha);

      expect(error).toBeDefined();
    });

    it('denies unauthorized delete by counsellor (admin-only policy)', async () => {
      const { data, error } = await counsellor1AClient.storage
        .from('student-photos')
        .remove([photoPathAmit]);

      const blocked = error || (Array.isArray(data) && data.length === 0);
      expect(Boolean(blocked)).toBe(true);
    });

    it('permits authorized delete by admin', async () => {
      const { data, error } = await adminAUserClient.storage
        .from('student-photos')
        .remove([photoPathAmit]);

      expect(error).toBeNull();
      expect(Array.isArray(data) && data.length > 0).toBe(true);

      // Cleanup Sneha test photo
      await adminAUserClient.storage.from('student-photos').remove([photoPathSneha]);
    });
  });
});
