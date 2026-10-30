import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { UserProfile, Lead } from '@/types';

describe('Remediation Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. CRM Related IDs', () => {
    it('rejects legacy non-UUID course ID in live mode', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(true);
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      vi.spyOn(dbMock, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-4111-8111-111111111111' }, error: null })
            })
          })
        })
      } as any);

      const { createLead } = await import('@/lib/services/crm-service');

      const payload: any = {
        full_name: 'Test Prospect',
        phone: '9876543210',
        email: 'prospect@test.com',
        interested_course_id: 'crs-fico-01', // legacy non-UUID
        counsellor_id: '22222222-2222-4222-8222-222222222222',
        stage: 'New',
        lead_source: 'Website',
        training_preference: 'Online',
      };

      await expect(createLead(payload)).rejects.toThrow(/invalid.*course.*uuid|uuid/i);
    });
  });

  describe('2. Lead Conversion Integrity', () => {
    it('rejects conversion of non-existent lead without fabricating a lead record', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { createAdmissionWorkflow } = await import('@/lib/services/admission-service');
      const actor = store.users.find(u => u.role === 'counsellor' && u.is_active !== false) || store.users[0];
      const initialLeadsCount = store.leads.length;

      const nonExistentLeadId = '99999999-9999-4999-8999-999999999999';

      await expect(createAdmissionWorkflow({
        student_name: 'Ghost Student',
        phone: '9876543210',
        email: 'ghost@test.com',
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Test Addr',
        city: 'Hyderabad',
        education: 'Graduate',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: store.courses[0].id,
        training_mode: 'Online',
        admission_date: '2026-10-29',
        course_fee: 40000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: actor.id,
        lead_id: nonExistentLeadId,
      }, actor.id, true)).rejects.toThrow(/lead not found/i);

      // Verify no fabricated lead was added
      expect(store.leads.length).toBe(initialLeadsCount);
      expect(store.leads.some(l => l.id === nonExistentLeadId)).toBe(false);
    });

    it('rejects duplicate conversion when lead is already converted', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { createAdmissionWorkflow } = await import('@/lib/services/admission-service');
      const actor = store.users.find(u => u.role === 'counsellor' && u.is_active !== false) || store.users[0];
      
      const testLead: Lead = {
        id: '12345678-1234-4234-8234-123456789012',
        lead_code: 'LD-TEST-DUP',
        full_name: 'Already Converted',
        phone: '9876543210',
        email: 'converted@test.com',
        interested_course_id: store.courses[0].id,
        stage: 'Converted', // Already converted
        training_preference: 'Online',
        lead_source: 'Website',
        current_status: 'Employed',
        experience_years: 1,
        counsellor_id: actor.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.unshift(testLead);

      await expect(createAdmissionWorkflow({
        student_name: 'Already Converted',
        phone: '9876543210',
        email: 'converted@test.com',
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Test Addr',
        city: 'Hyderabad',
        education: 'Graduate',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: store.courses[0].id,
        training_mode: 'Online',
        admission_date: '2026-10-29',
        course_fee: 40000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: actor.id,
        lead_id: testLead.id,
      }, actor.id, true)).rejects.toThrow(/already been converted/i);
    });
  });

  describe('3. Snapshot Isolation', () => {
    it('scopes snapshot leads to counsellor ownership and prevents cross-counsellor leakage', async () => {
      const { visibleWorkflowSnapshot } = await import('@/lib/services/payment-workflow-state');
      
      const counsellorA: UserProfile = { id: 'counsellor-a-id', full_name: 'Counsellor A', role: 'counsellor', email: 'ca@test.com', is_active: true, tenant_id: 'default', created_at: '2026-01-01', updated_at: '2026-01-01' };
      const counsellorB: UserProfile = { id: 'counsellor-b-id', full_name: 'Counsellor B', role: 'counsellor', email: 'cb@test.com', is_active: true, tenant_id: 'default', created_at: '2026-01-01', updated_at: '2026-01-01' };

      const leadA: Lead = {
        id: 'lead-a-id',
        lead_code: 'LD-A',
        full_name: 'Lead A',
        phone: '9000000001',
        email: 'leadA@test.com',
        counsellor_id: counsellorA.id,
        stage: 'New',
        training_preference: 'Online',
        lead_source: 'Website',
        current_status: 'Employed',
        experience_years: 1,
        notes: 'SECRET NOTES COUNSELLOR A',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tenant_id: 'default',
      };

      const leadB: Lead = {
        id: 'lead-b-id',
        lead_code: 'LD-B',
        full_name: 'Lead B',
        phone: '9000000002',
        email: 'leadB@test.com',
        counsellor_id: counsellorB.id,
        stage: 'New',
        training_preference: 'Online',
        lead_source: 'Website',
        current_status: 'Employed',
        experience_years: 1,
        notes: 'SECRET NOTES COUNSELLOR B',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tenant_id: 'default',
      };

      store.leads = [leadA, leadB];

      const snapshotA = visibleWorkflowSnapshot(counsellorA);
      expect(snapshotA.leads?.some(l => l.id === leadA.id)).toBe(true);
      expect(snapshotA.leads?.some(l => l.id === leadB.id)).toBe(false);
      expect(snapshotA.leads?.some(l => l.notes?.includes('SECRET NOTES COUNSELLOR B'))).toBe(false);

      const snapshotB = visibleWorkflowSnapshot(counsellorB);
      expect(snapshotB.leads?.some(l => l.id === leadB.id)).toBe(true);
      expect(snapshotB.leads?.some(l => l.id === leadA.id)).toBe(false);
    });
  });

  describe('4. Local Actor Authorization', () => {
    it('rejects an actor not present in the local trusted roster', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
      const unknownActor = { id: 'unknown-intruder', tenant_id: 'default', role: 'admin', is_active: true } as UserProfile;
      const op = vi.fn();

      await expect(paymentTransaction(unknownActor, op, true)).rejects.toThrow(/unauthorized.*roster|staff roster/i);
      expect(op).not.toHaveBeenCalled();
      expect(store.users.some(u => u.id === 'unknown-intruder')).toBe(false);
    });

    it('rejects an inactive actor in the local trusted roster', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
      const inactiveUser: UserProfile = { id: 'inactive-staff', tenant_id: 'default', role: 'counsellor', is_active: false, full_name: 'Inactive', email: 'inactive@test.com', created_at: '2026-01-01', updated_at: '2026-01-01' };
      store.users.push(inactiveUser);

      const op = vi.fn();
      await expect(paymentTransaction(inactiveUser, op, true)).rejects.toThrow(/unauthorized.*inactive|staff roster/i);
      expect(op).not.toHaveBeenCalled();
    });

    it('rejects an actor whose claimed tenant mismatches roster tenant', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
      const validUser: UserProfile = { id: 'tenant-user', tenant_id: 'tenant-alpha', role: 'counsellor', is_active: true, full_name: 'Alpha User', email: 'alpha@test.com', created_at: '2026-01-01', updated_at: '2026-01-01' };
      store.users.push(validUser);

      // Caller claims tenant-beta
      const spoofedActor = { ...validUser, tenant_id: 'tenant-beta' };
      const op = vi.fn();
      await expect(paymentTransaction(spoofedActor, op, true)).rejects.toThrow(/unauthorized|access denied/i);
      expect(op).not.toHaveBeenCalled();
    });

    it('overrides caller-supplied role claim with authoritative role from roster', async () => {
      const dbMock = await import('@/lib/supabase/db');
      vi.spyOn(dbMock, 'isLiveSupabaseEnabled').mockReturnValue(false);

      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
      const staffUser: UserProfile = { id: 'honest-counsellor', tenant_id: 'default', role: 'counsellor', is_active: true, full_name: 'Honest Staff', email: 'honest@test.com', created_at: '2026-01-01', updated_at: '2026-01-01' };
      store.users.push(staffUser);

      // Caller passes role: 'super_admin'
      const elevatedActor = { ...staffUser, role: 'super_admin' as any };
      let observedRole = '';
      await paymentTransaction(elevatedActor, () => {
        observedRole = elevatedActor.role;
      }, true);

      expect(observedRole).toBe('counsellor');
    });
  });
});
