import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getAdmissions,
  getAdmissionById,
  createAdmissionWorkflow,
} from '@/lib/services/admission-service';
import {
  resolveAdmissionScope,
  canAccessAdmission,
  assertAdmissionAccess,
  validateAdmissionRegistrationOwnership,
} from '@/lib/auth/admission-access';
import { visibleWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import type { UserProfile } from '@/types';

describe('BUG-21: Role-Based Admissions Data Visibility', () => {
  const amulyaActor: UserProfile = {
    id: '987c67ef-388c-4467-90d6-4c4635398ed7',
    full_name: 'Amulya',
    email: 'amulya@nextgen.com',
    role: 'counsellor',
    tenant_id: 'default',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sandhyaActor: UserProfile = {
    id: '3f5ba75a-ba23-4612-be74-e075a7d81f9b',
    full_name: 'Sandhya',
    email: 'sandhya@nextgen.com',
    role: 'counsellor',
    tenant_id: 'default',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const vineethaaActor: UserProfile = {
    id: '8fac380f-cc47-4209-9a13-e85153529dd1',
    full_name: 'Vineethaa',
    email: 'vineethaa@nextgen.com',
    role: 'counsellor',
    tenant_id: 'default',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const radhikaLeadActor: UserProfile = {
    id: '2983a160-0764-40c5-ab50-a41cff9f0c68',
    full_name: 'Radhika',
    email: 'radhika@nextgen.com',
    role: 'counsellor_lead',
    tenant_id: 'default',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const adminActor: UserProfile = {
    id: '11111111-1111-4111-a111-111111111111',
    full_name: 'Admin User',
    email: 'admin@nextgen.com',
    role: 'admin',
    tenant_id: 'default',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const superAdminActor: UserProfile = {
    id: '00000000-0000-4000-a000-000000000000',
    full_name: 'Super Admin',
    email: 'superadmin@nextgen.com',
    role: 'super_admin',
    tenant_id: 'default',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const crossTenantActor: UserProfile = {
    id: '99999999-9999-4999-a999-999999999999',
    full_name: 'Cross Tenant Counsellor',
    email: 'counsellor@othercorp.com',
    role: 'counsellor',
    tenant_id: 'tenant-2',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    store.reconcileAuthoritativeStaffProfiles();
    store.reconcileAuthoritativeCourses();
    store.reconcileAuthoritativeAdmissions();
  });

  describe('1. Individual Counsellor Visibility Scenarios', () => {
    it('Amulya sees only Nikhil Pamulaparthi and Garpally Vedhasri', async () => {
      const admissions = await getAdmissions(amulyaActor);
      const studentNames = admissions.map((a) => a.student_name);
      const admissionNumbers = admissions.map((a) => a.admission_number);

      expect(studentNames).toContain('Nikhil Pamulaparthi');
      expect(studentNames).toContain('Garpally Vedhasri');
      expect(admissionNumbers).toContain('ADM-2026-0031');
      expect(admissionNumbers).toContain('ADM-2026-0032');

      // Sandhya's and Vineethaa's admissions must NOT be visible
      expect(studentNames).not.toContain('Sandeep Kumar');
      expect(studentNames).not.toContain('Shaik Shawhul Hameed');
      expect(studentNames).not.toContain('Mohammed abdul moin siddiqui');
      expect(admissionNumbers).not.toContain('ADM-2026-0033');
      expect(admissionNumbers).not.toContain('ADM-2026-0034');
      expect(admissionNumbers).not.toContain('ADM-2026-0035');

      // All returned admissions must belong to Amulya
      expect(admissions.every((a) => a.counsellor_id === amulyaActor.id)).toBe(true);
    });

    it('Sandhya sees only Sandeep Kumar and Shaik Shawhul Hameed', async () => {
      const admissions = await getAdmissions(sandhyaActor);
      const studentNames = admissions.map((a) => a.student_name);
      const admissionNumbers = admissions.map((a) => a.admission_number);

      expect(studentNames).toContain('Sandeep Kumar');
      expect(studentNames).toContain('Shaik Shawhul Hameed');
      expect(admissionNumbers).toContain('ADM-2026-0033');
      expect(admissionNumbers).toContain('ADM-2026-0034');

      // Amulya's and Vineethaa's admissions must NOT be visible
      expect(studentNames).not.toContain('Nikhil Pamulaparthi');
      expect(studentNames).not.toContain('Garpally Vedhasri');
      expect(studentNames).not.toContain('Mohammed abdul moin siddiqui');
      expect(admissionNumbers).not.toContain('ADM-2026-0031');
      expect(admissionNumbers).not.toContain('ADM-2026-0032');
      expect(admissionNumbers).not.toContain('ADM-2026-0035');

      expect(admissions.every((a) => a.counsellor_id === sandhyaActor.id)).toBe(true);
    });

    it('Vineethaa sees only Mohammed abdul moin siddiqui', async () => {
      const admissions = await getAdmissions(vineethaaActor);
      const studentNames = admissions.map((a) => a.student_name);
      const admissionNumbers = admissions.map((a) => a.admission_number);

      expect(studentNames).toContain('Mohammed abdul moin siddiqui');
      expect(admissionNumbers).toContain('ADM-2026-0035');

      // Other counsellors' admissions must NOT be visible
      expect(studentNames).not.toContain('Nikhil Pamulaparthi');
      expect(studentNames).not.toContain('Garpally Vedhasri');
      expect(studentNames).not.toContain('Sandeep Kumar');
      expect(studentNames).not.toContain('Shaik Shawhul Hameed');

      expect(admissions.every((a) => a.counsellor_id === vineethaaActor.id)).toBe(true);
    });
  });

  describe('2. Sales Lead Team Visibility Scenarios', () => {
    it('Radhika (Sales Lead) sees admissions for self and team members (Amulya & Sandhya)', async () => {
      const admissions = await getAdmissions(radhikaLeadActor);
      const studentNames = admissions.map((a) => a.student_name);
      const admissionNumbers = admissions.map((a) => a.admission_number);

      // Amulya's students
      expect(studentNames).toContain('Nikhil Pamulaparthi');
      expect(studentNames).toContain('Garpally Vedhasri');
      expect(admissionNumbers).toContain('ADM-2026-0031');
      expect(admissionNumbers).toContain('ADM-2026-0032');

      // Sandhya's students
      expect(studentNames).toContain('Sandeep Kumar');
      expect(studentNames).toContain('Shaik Shawhul Hameed');
      expect(admissionNumbers).toContain('ADM-2026-0033');
      expect(admissionNumbers).toContain('ADM-2026-0034');

      // Vineethaa's students must NOT be visible to Radhika (Vineethaa is not in Radhika's team)
      expect(studentNames).not.toContain('Mohammed abdul moin siddiqui');
      expect(admissionNumbers).not.toContain('ADM-2026-0035');
    });
  });

  describe('3. Admin and Super Admin Full Tenant Access', () => {
    it('Admin sees all admissions across all counsellors in the tenant', async () => {
      const admissions = await getAdmissions(adminActor);
      const admissionNumbers = admissions.map((a) => a.admission_number);

      expect(admissionNumbers).toContain('ADM-2026-0031');
      expect(admissionNumbers).toContain('ADM-2026-0032');
      expect(admissionNumbers).toContain('ADM-2026-0033');
      expect(admissionNumbers).toContain('ADM-2026-0034');
      expect(admissionNumbers).toContain('ADM-2026-0035');
      expect(admissions.length).toBeGreaterThanOrEqual(5);
    });

    it('Super Admin sees all admissions across the tenant', async () => {
      const admissions = await getAdmissions(superAdminActor);
      const admissionNumbers = admissions.map((a) => a.admission_number);

      expect(admissionNumbers).toContain('ADM-2026-0031');
      expect(admissionNumbers).toContain('ADM-2026-0032');
      expect(admissionNumbers).toContain('ADM-2026-0033');
      expect(admissionNumbers).toContain('ADM-2026-0034');
      expect(admissionNumbers).toContain('ADM-2026-0035');
    });
  });

  describe('4. Tenant Isolation and Cross-Tenant Rejection', () => {
    it('rejects cross-tenant actor access to admissions in default tenant', async () => {
      const admissions = await getAdmissions(crossTenantActor);
      expect(admissions.length).toBe(0);
    });

    it('assertAdmissionAccess throws 403 on tenant mismatch', async () => {
      const adm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0031');
      expect(adm).toBeDefined();

      const scope = await resolveAdmissionScope(crossTenantActor);
      expect(() => {
        assertAdmissionAccess(scope, adm!);
      }).toThrow(/tenant mismatch/i);
    });

    it('assertAdmissionAccess throws 403 on counsellor mismatch', async () => {
      const adm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0031'); // Amulya's admission
      expect(adm).toBeDefined();

      const scope = await resolveAdmissionScope(sandhyaActor);
      expect(() => {
        assertAdmissionAccess(scope, adm!);
      }).toThrow(/not authorized/i);
    });

    it('assertAdmissionAccess succeeds for assigned counsellor', async () => {
      const adm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0031');
      expect(adm).toBeDefined();

      const scope = await resolveAdmissionScope(amulyaActor);
      expect(() => {
        assertAdmissionAccess(scope, adm!);
      }).not.toThrow();
    });

    it('assertAdmissionAccess succeeds for sales lead with team member admission', async () => {
      const adm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0031');
      expect(adm).toBeDefined();

      const scope = await resolveAdmissionScope(radhikaLeadActor);
      expect(() => {
        assertAdmissionAccess(scope, adm!);
      }).not.toThrow();
    });

    it('assertAdmissionAccess throws 403 for sales lead on non-team admission', async () => {
      const adm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0035'); // Vineethaa's
      expect(adm).toBeDefined();

      const scope = await resolveAdmissionScope(radhikaLeadActor);
      expect(() => {
        assertAdmissionAccess(scope, adm!);
      }).toThrow(/not authorized/i);
    });
  });

  describe('5. Financial and Student Snapshot Privacy Protection', () => {
    it('visibleWorkflowSnapshot strips students, fee accounts, and payments belonging to other counsellors', () => {
      const snapshot = visibleWorkflowSnapshot(amulyaActor);
      expect(snapshot.admissions).toBeDefined();
      expect(snapshot.students).toBeDefined();
      expect(snapshot.feeAccounts).toBeDefined();
      expect(snapshot.studentPayments).toBeDefined();
      expect(snapshot.receipts).toBeDefined();

      const admissions = snapshot.admissions || [];
      const students = snapshot.students || [];
      const feeAccounts = snapshot.feeAccounts || [];
      const studentPayments = snapshot.studentPayments || [];
      const receipts = snapshot.receipts || [];

      // Admissions scoped
      expect(admissions.every((a) => a.counsellor_id === amulyaActor.id)).toBe(true);

      const amulyaStudentIds = new Set(admissions.map((a) => a.student_id).filter(Boolean));

      // Students scoped
      expect(students.every((s) => amulyaStudentIds.has(s.id))).toBe(true);

      // Fee accounts scoped
      expect(feeAccounts.every((fa) => amulyaStudentIds.has(fa.student_id))).toBe(true);

      // Student payments scoped
      expect(studentPayments.every((sp) => amulyaStudentIds.has(sp.student_id))).toBe(true);

      // Receipts scoped
      expect(receipts.every((r) => amulyaStudentIds.has(r.student_id))).toBe(true);
    });

    it('visibleWorkflowSnapshot for Admin includes all tenant records', () => {
      const snapshot = visibleWorkflowSnapshot(adminActor);
      expect(snapshot.admissions).toBeDefined();
      expect(snapshot.students).toBeDefined();

      expect((snapshot.admissions || []).length).toBeGreaterThanOrEqual(5);
      expect((snapshot.students || []).length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('6. Admission Creation Ownership Rules', () => {
    it('counsellor registering under own ID succeeds', async () => {
      const validated = await validateAdmissionRegistrationOwnership(
        amulyaActor,
        amulyaActor.id,
        store.users
      );
      expect(validated.counsellor_id).toBe(amulyaActor.id);
    });

    it('counsellor attempting to register under another counsellor ID is rejected with 403', async () => {
      expect(() => {
        validateAdmissionRegistrationOwnership(
          amulyaActor,
          sandhyaActor.id,
          store.users
        );
      }).toThrow(/counsellors can only register admissions assigned to themselves/i);
    });

    it('sales lead can assign to verified team member', async () => {
      const validated = await validateAdmissionRegistrationOwnership(
        radhikaLeadActor,
        amulyaActor.id,
        store.users,
        ['987c67ef-388c-4467-90d6-4c4635398ed7', '3f5ba75a-ba23-4612-be74-e075a7d81f9b']
      );
      expect(validated.counsellor_id).toBe(amulyaActor.id);
    });

    it('sales lead attempting to assign to non-team counsellor is rejected with 403', async () => {
      expect(() => {
        validateAdmissionRegistrationOwnership(
          radhikaLeadActor,
          vineethaaActor.id,
          store.users,
          ['987c67ef-388c-4467-90d6-4c4635398ed7', '3f5ba75a-ba23-4612-be74-e075a7d81f9b']
        );
      }).toThrow(/sales leads can only assign admissions to themselves or verified team members/i);
    });

    it('admin can assign to any eligible counsellor', async () => {
      const validated = await validateAdmissionRegistrationOwnership(
        adminActor,
        vineethaaActor.id,
        store.users
      );
      expect(validated.counsellor_id).toBe(vineethaaActor.id);
    });
  });

  describe('7. Single Admission Access Verification (getAdmissionById)', () => {
    it('counsellor can retrieve their own admission record', async () => {
      const amulyaAdm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0031');
      expect(amulyaAdm).toBeDefined();

      const result = await getAdmissionById(amulyaAdm!.id, amulyaActor);
      expect(result).toBeDefined();
      expect(result?.admission_number).toBe('ADM-2026-0031');
    });

    it('counsellor cannot retrieve another counsellor admission record', async () => {
      const sandhyaAdm = store.admissions.find((a) => a.admission_number === 'ADM-2026-0033');
      expect(sandhyaAdm).toBeDefined();

      await expect(getAdmissionById(sandhyaAdm!.id, amulyaActor)).rejects.toThrow(
        /not authorized to view or manage this admission/i
      );
    });
  });
});
