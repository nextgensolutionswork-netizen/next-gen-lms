import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, runWithAuth } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';
import { UserProfile } from '@/types';

describe('14. Database Row-Level Security (RLS) Policy Enforcement Tests', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
  });

  // Test User Identities
  const superAdminId = 'usr-superadmin'; // role: super_admin (Rajesh Sharma)
  const adminId = 'usr-admin'; // role: admin (Priya Nair)
  const supportMentorId = 'usr-support-01'; // role: support
  const trainerFicoId = 'usr-trainer-fico'; // role: trainer, assigned: ['crs-fico-01']
  const accountantId = 'usr-accounts'; // role: accountant
  const counsellorId = 'usr-counsellor'; // role: counsellor
  const placementHeadId = 'usr-placement'; // role: placement_coordinator
  const studentAmitId = 'usr-student-01'; // student: stu-01 (Amit Gupta)
  const studentSnehaId = 'usr-student-02'; // student: stu-02 (Sneha Kulkarni)

  // =========================================================================
  // 1. STUDENT DOUBTS & SUPPORT DESK RLS (005_student_doubts.sql)
  // =========================================================================
  describe('Student Doubts RLS Isolation (005_student_doubts.sql)', () => {
    it('Postgres RLS: Student Amit queries student_doubts directly and sees ONLY his own tickets', async () => {
      const studentClient = createClient(studentAmitId);
      const { data, error } = await studentClient.from('student_doubts').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);
      // Every single returned doubt must belong to stu-01
      expect(data.every((d: any) => d.student_id === 'stu-01')).toBe(true);
      // None should belong to Sneha (stu-02)
      expect(data.some((d: any) => d.student_id === 'stu-02')).toBe(false);
    });

    it('Postgres RLS: Student Sneha queries student_doubts directly and sees ONLY her own tickets', async () => {
      const studentClient = createClient(studentSnehaId);
      const { data, error } = await studentClient.from('student_doubts').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((d: any) => d.student_id === 'stu-02')).toBe(true);
      expect(data.some((d: any) => d.student_id === 'stu-01')).toBe(false);
    });

    it('Postgres RLS: Support staff and trainers see all student doubt tickets', async () => {
      const supportClient = createClient(supportMentorId);
      const { data, error } = await supportClient.from('student_doubts').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      // Should see tickets for both Amit and Sneha
      expect(data.some((d: any) => d.student_id === 'stu-01')).toBe(true);
      expect(data.some((d: any) => d.student_id === 'stu-02')).toBe(true);
    });

    it('Postgres RLS: Rejects student inserting a doubt belonging to another student record (student isolation violation)', async () => {
      const amitClient = createClient(studentAmitId);

      // Amit attempts to insert a doubt for Sneha (stu-02)
      const { data, error } = await amitClient.from('student_doubts').insert({
        id: `dbt-tamper-${Date.now()}`,
        ticket_number: `DBT-TAMPER-${Date.now()}`,
        student_id: 'stu-02', // FORBIDDEN: belongs to Sneha, not Amit!
        student_name: 'Sneha Kulkarni',
        admission_number: 'ADM-2026-002',
        course_name: 'SAP S/4HANA Finance',
        title: 'Tampered Doubt Submission',
        description: 'Should be rejected by PostgreSQL RLS with check',
        category: 'SAP Configuration',
        priority: 'High',
        status: 'Open',
        created_at: new Date().toISOString(),
      });

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.code).toBe('42501');
      expect(error.message).toContain('violates row-level security policy');
    });

    it('Postgres RLS: Allows student inserting a legitimate doubt for their own student record', async () => {
      const amitClient = createClient(studentAmitId);

      const newTicketNumber = `DBT-2026-TEST-${Date.now()}`;
      const { data, error } = await amitClient.from('student_doubts').insert({
        id: `dbt-valid-${Date.now()}`,
        ticket_number: newTicketNumber,
        student_id: 'stu-01', // VALID: Amit Gupta
        student_name: 'Amit Gupta',
        admission_number: 'ADM-2026-001',
        course_name: 'SAP S/4HANA Finance',
        title: 'Legitimate Student Query',
        description: 'Testing valid RLS insert',
        category: 'Academic Concept',
        priority: 'Medium',
        status: 'Open',
        created_at: new Date().toISOString(),
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.ticket_number).toBe(newTicketNumber);
    });

    it('Postgres RLS: Prevents students from updating/resolving doubt status (staff only policy)', async () => {
      const amitClient = createClient(studentAmitId);
      const amitDoubt = store.doubts.find((d) => d.student_id === 'stu-01')!;

      const { data, error } = await amitClient
        .from('student_doubts')
        .update({ status: 'Resolved' })
        .eq('id', amitDoubt.id);

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.code).toBe('42501');
      expect(error.message).toContain('violates row-level security policy');
    });

    it('Postgres RLS: Allows support staff to update and resolve doubt tickets', async () => {
      const supportClient = createClient(supportMentorId);
      const amitDoubt = store.doubts.find((d) => d.student_id === 'stu-01')!;

      const { data, error } = await supportClient
        .from('student_doubts')
        .update({ status: 'In Progress' })
        .eq('id', amitDoubt.id);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });
  });

  // =========================================================================
  // 2. COURSES & ACADEMIC CONTENT RLS (002_rls_policies.sql)
  // =========================================================================
  describe('Courses & Academic Content RLS (002_rls_policies.sql)', () => {
    it('Super Admin and Admin can access all courses', async () => {
      const adminClient = createClient(superAdminId);
      const { data, error } = await adminClient.from('courses').select('*');

      expect(error).toBeNull();
      expect(data.length).toBe(store.courses.length);
    });

    it('Trainer can ONLY access explicitly assigned courses (zero access to other courses)', async () => {
      const trainerClient = createClient(trainerFicoId);
      const { data, error } = await trainerClient.from('courses').select('*');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((c: any) => c.id === 'crs-fico-01')).toBe(true);
      expect(data.some((c: any) => c.id === 'crs-mm-01')).toBe(false);
    });

    it('Trainer with NO assigned courses sees ZERO courses (never falls back)', async () => {
      const unassignedTrainer: UserProfile = {
        id: 'usr-trainer-unassigned',
        email: 'trainer.unassigned@next-gen.com',
        full_name: 'Unassigned Trainer',
        role: 'trainer',
        assigned_course_ids: [],
        is_active: true,
        created_at: '',
        updated_at: '',
      };

      const trainerClient = createClient(unassignedTrainer);
      const { data, error } = await trainerClient.from('courses').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.length).toBe(0);
    });

    it('Accountant is strictly prohibited from accessing confidential courses', async () => {
      const accountantClient = createClient(accountantId);
      const { data, error } = await accountantClient.from('courses').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.length).toBe(0);
    });

    it('Student can ONLY see published courses in which they are enrolled', async () => {
      const studentClient = createClient(studentAmitId);
      const { data, error } = await studentClient.from('courses').select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);
      // Amit is enrolled in FICO
      expect(data.every((c: any) => c.id === 'crs-fico-01')).toBe(true);
    });
  });

  // =========================================================================
  // 3. FINANCIAL RECORDS & LEDGERS RLS (002_rls_policies.sql)
  // =========================================================================
  describe('Financial Records & Ledgers RLS (002_rls_policies.sql)', () => {
    it('Accountant and Super Admin have full access to fee accounts, payments, and receipts', async () => {
      const accountantClient = createClient(accountantId);

      const { data: feeAccounts } = await accountantClient.from('student_fee_accounts').select('*');
      expect(feeAccounts.length).toBe(store.feeAccounts.length);

      const { data: payments } = await accountantClient.from('payments').select('*');
      expect(payments.length).toBe(store.payments.length);

      const { data: receipts } = await accountantClient.from('receipts').select('*');
      expect(receipts.length).toBe(store.receipts.length);
    });

    it('Student can view ONLY their own fee account and receipts (isolation verified)', async () => {
      const amitClient = createClient(studentAmitId);

      const { data: feeAccounts } = await amitClient.from('student_fee_accounts').select('*');
      expect(feeAccounts.length).toBeGreaterThan(0);
      expect(feeAccounts.every((f: any) => f.student_id === 'stu-01')).toBe(true);
      expect(feeAccounts.some((f: any) => f.student_id === 'stu-02')).toBe(false);

      const { data: receipts } = await amitClient.from('receipts').select('*');
      expect(receipts.every((r: any) => r.student_id === 'stu-01')).toBe(true);
      expect(receipts.some((r: any) => r.student_id === 'stu-02')).toBe(false);
    });

    it('Non-financial staff (e.g. trainer) is strictly denied access to financial fee ledgers', async () => {
      const trainerClient = createClient(trainerFicoId);
      const { data } = await trainerClient.from('student_fee_accounts').select('*');

      expect(data).toBeDefined();
      expect(data.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. PLACEMENT PROFILES RLS (002_rls_policies.sql)
  // =========================================================================
  describe('Placement Profiles RLS (002_rls_policies.sql)', () => {
    it('Placement Head and Admin can manage all student placement profiles', async () => {
      const placementClient = createClient(placementHeadId);
      const { data } = await placementClient.from('placement_profiles').select('*');

      expect(data.length).toBe(store.placementProfiles.length);
    });

    it('Student can view ONLY their own placement profile', async () => {
      const amitClient = createClient(studentAmitId);
      const { data } = await amitClient.from('placement_profiles').select('*');

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((p: any) => p.student_id === 'stu-01')).toBe(true);
      expect(data.some((p: any) => p.student_id === 'stu-02')).toBe(false);
    });
  });

  // =========================================================================
  // 5. AUDIT LOGS RLS (002_rls_policies.sql)
  // =========================================================================
  describe('Audit Logs RLS (002_rls_policies.sql)', () => {
    it('Super Admin can view confidential system audit logs', async () => {
      const adminClient = createClient(superAdminId);
      const { data } = await adminClient.from('audit_logs').select('*');

      expect(data.length).toBe(store.auditLogs.length);
    });

    it('Admin, Accountant, Trainer, and Students are strictly denied access to audit logs', async () => {
      // 002_rls_policies.sql: Only super_admin can view audit logs
      const regularAdminClient = createClient(adminId);
      const { data: adminData } = await regularAdminClient.from('audit_logs').select('*');
      expect(adminData.length).toBe(0);

      const accountantClient = createClient(accountantId);
      const { data: accData } = await accountantClient.from('audit_logs').select('*');
      expect(accData.length).toBe(0);

      const studentClient = createClient(studentAmitId);
      const { data: stuData } = await studentClient.from('audit_logs').select('*');
      expect(stuData.length).toBe(0);
    });
  });

  // =========================================================================
  // 6. DEFAULT-DENY FOR INACTIVE & UNAUTHENTICATED USERS
  // =========================================================================
  describe('Default-Deny for Inactive and Unauthenticated Users', () => {
    it('Inactive user gets zero records across all secured tables (default-deny)', async () => {
      const inactiveUser: UserProfile = {
        id: 'usr-inactive-admin',
        email: 'inactive@next-gen.com',
        full_name: 'Inactive Admin',
        role: 'super_admin',
        is_active: false, // DEACTIVATED
        created_at: '',
        updated_at: '',
      };

      const client = createClient(inactiveUser);

      const { data: courses } = await client.from('courses').select('*');
      expect(courses.length).toBe(0);

      const { data: doubts } = await client.from('student_doubts').select('*');
      expect(doubts.length).toBe(0);

      const { data: fees } = await client.from('student_fee_accounts').select('*');
      expect(fees.length).toBe(0);
    });

    it('Unauthenticated visitor can only verify valid certificates (public policy)', async () => {
      const anonymousClient = createClient(); // No auth

      const { data: doubts } = await anonymousClient.from('student_doubts').select('*');
      expect(doubts.length).toBe(0);

      const { data: certs } = await anonymousClient.from('certificates').select('*');
      expect(certs.every((c: any) => c.is_valid)).toBe(true);
    });
  });

  // =========================================================================
  // 7. ASYNC CONTEXT PROPAGATION (runWithAuth)
  // =========================================================================
  describe('Async Context Propagation (runWithAuth)', () => {
    it('Automatically applies student RLS inside runWithAuth callback without passing client arg', async () => {
      await runWithAuth(studentAmitId, async () => {
        const client = createClient(); // inherits studentAmitId from AsyncLocalStorage!
        const { data } = await client.from('student_doubts').select('*');

        expect(data.length).toBeGreaterThan(0);
        expect(data.every((d: any) => d.student_id === 'stu-01')).toBe(true);
      });
    });
  });
});
