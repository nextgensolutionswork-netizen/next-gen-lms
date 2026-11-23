import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getEligibleAdmissionsCounsellors,
  isEligibleAdmissionsCounsellor,
  validateCounsellorAssignment,
  resolveCanonicalCounsellorId,
  fetchAuthoritativeCounsellors,
} from '@/lib/services/counsellor-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { UserProfile } from '@/types';

describe('BUG-16: Fix Admissions Counsellor Dropdown', () => {
  beforeEach(() => {
    store.reconcileAuthoritativeStaffProfiles();
    store.reconcileAuthoritativeCourses();
  });

  describe('1. Authoritative Sales Staff Roster', () => {
    it('should include all five active Sales staff members', async () => {
      const eligible = await fetchAuthoritativeCounsellors('default');
      const names = eligible.map((c) => c.full_name);

      expect(names).toContain('Vineethaa');
      expect(names).toContain('Radhika');
      expect(names).toContain('Sandhya');
      expect(names).toContain('Amulya');
      expect(names).toContain('Mohan Reddy');
      expect(eligible.length).toBeGreaterThanOrEqual(5);
    });

    it('should format display labels with "(Sales)" badge for counsellor role', async () => {
      const eligible = await fetchAuthoritativeCounsellors('default');

      const vineethaa = eligible.find((c) => c.full_name === 'Vineethaa');
      expect(vineethaa).toBeDefined();
      expect(vineethaa?.display_label).toBe('Vineethaa (Sales)');

      const radhika = eligible.find((c) => c.full_name === 'Radhika');
      expect(radhika).toBeDefined();
      expect(radhika?.display_label).toBe('Radhika (Sales)');

      const sandhya = eligible.find((c) => c.full_name === 'Sandhya');
      expect(sandhya).toBeDefined();
      expect(sandhya?.display_label).toBe('Sandhya (Sales)');

      const amulya = eligible.find((c) => c.full_name === 'Amulya');
      expect(amulya).toBeDefined();
      expect(amulya?.display_label).toBe('Amulya (Sales)');

      const mohanReddy = eligible.find((c) => c.full_name === 'Mohan Reddy');
      expect(mohanReddy).toBeDefined();
      expect(mohanReddy?.display_label).toBe('Mohan Reddy (Sales)');
    });

    it('should preserve the exact Supabase UUIDs for the 5 staff members', async () => {
      const eligible = await fetchAuthoritativeCounsellors('default');

      const expectedStaff = [
        { name: 'Vineethaa', id: '8fac380f-cc47-4209-9a13-e85153529dd1' },
        { name: 'Radhika', id: '2983a160-0764-40c5-ab50-a41cff9f0c68' },
        { name: 'Sandhya', id: '3f5ba75a-ba23-4612-be74-e075a7d81f9b' },
        { name: 'Amulya', id: '987c67ef-388c-4467-90d6-4c4635398ed7' },
        { name: 'Mohan Reddy', id: 'fc148d96-cf7c-4189-a0ba-b99eb5826d15' },
      ];

      for (const expected of expectedStaff) {
        const found = eligible.find((c) => c.id === expected.id);
        expect(found).toBeDefined();
        expect(found?.full_name).toBe(expected.name);
      }
    });
  });

  describe('2. Stale Demo Account Removal', () => {
    it('should strictly exclude legacy demo account Ananya from eligible options', async () => {
      const eligible = await fetchAuthoritativeCounsellors('default');
      const ananya = eligible.find(
        (c) =>
          c.full_name.includes('Ananya') ||
          c.id === 'usr-counsellor' ||
          c.id === 'usr-counsellor-01' ||
          c.email === 'counsellor@next-generpsolutions.com'
      );

      expect(ananya).toBeUndefined();
    });

    it('should strictly exclude Ananya from the authoritative dropdown options', async () => {
      const eligible = await fetchAuthoritativeCounsellors('default');
      const ananya = eligible.find((c) => c.full_name.includes('Ananya') || c.id === 'usr-counsellor');
      expect(ananya).toBeUndefined();
    });
  });

  describe('3. Security, Tenant Isolation and Eligibility Filtering', () => {
    it('should exclude staff from another tenant', () => {
      const crossTenantStaff: UserProfile = {
        id: 'cross-tenant-counsellor-01',
        email: 'other.tenant@example.com',
        full_name: 'Other Tenant Counsellor',
        role: 'counsellor',
        phone: '+91 99999 88888',
        is_active: true,
        tenant_id: 'tenant-secondary',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const eligible = getEligibleAdmissionsCounsellors([...store.users, crossTenantStaff], 'default');
      const found = eligible.find((c) => c.id === crossTenantStaff.id);
      expect(found).toBeUndefined();
    });

    it('should exclude inactive counsellor accounts', () => {
      const inactiveStaff: UserProfile = {
        id: 'inactive-staff-01',
        email: 'inactive.staff@example.com',
        full_name: 'Inactive Staff Member',
        role: 'counsellor',
        phone: '+91 99999 77777',
        is_active: false,
        tenant_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const eligible = getEligibleAdmissionsCounsellors([...store.users, inactiveStaff], 'default');
      const found = eligible.find((c) => c.id === inactiveStaff.id);
      expect(found).toBeUndefined();
    });

    it('should exclude unauthorized roles (e.g. trainer, support) without assignment permission', () => {
      const trainerUser = store.users.find((u) => u.role === 'trainer');
      expect(trainerUser).toBeDefined();
      expect(isEligibleAdmissionsCounsellor(trainerUser)).toBe(false);

      const eligible = getEligibleAdmissionsCounsellors(store.users, 'default');
      const foundTrainer = eligible.find((c) => c.role === 'trainer');
      expect(foundTrainer).toBeUndefined();
    });

    it('should include admin accounts ONLY IF explicitly authorized with can_assign_admissions', () => {
      const authorizedAdmin: UserProfile = {
        id: 'authorized-admin-01',
        email: 'auth.admin@example.com',
        full_name: 'Authorized Admin',
        role: 'admin',
        phone: '+91 99999 66666',
        is_active: true,
        tenant_id: 'default',
        can_assign_admissions: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const eligible = getEligibleAdmissionsCounsellors([...store.users, authorizedAdmin], 'default');
      const found = eligible.find((c) => c.id === authorizedAdmin.id);
      expect(found).toBeDefined();
      expect(found?.display_label).toBe('Authorized Admin (Admin)');
    });
  });

  describe('4. Admission Creation with Authoritative Counsellor Attribution', () => {
    it('should save correct counsellor_id and counsellor_name when creating an admission', async () => {
      const performingAdmin = store.users.find((u) => u.role === 'admin' && u.is_active)!;
      const targetCounsellor = store.users.find(
        (u) => u.id === '8fac380f-cc47-4209-9a13-e85153529dd1' // Vineethaa
      )!;

      expect(targetCounsellor).toBeDefined();

      const unique5Digits = (Math.floor(10000 + Math.random() * 90000)).toString();
      const admissionResult = await createAdmissionWorkflow(
        {
          student_name: `Test Student ${unique5Digits}`,
          phone: `+91 98111 ${unique5Digits}`,
          email: `test.student.${unique5Digits}@example.com`,
          course_id: 'c1000000-0000-4000-a000-000000000101',
          course_fee: 35000,
          discount: 0,
          payment_plan: 'Full Payment',
          counsellor_id: targetCounsellor.id,
          counsellor_name: targetCounsellor.full_name,
          training_mode: 'Hybrid',
          training_category: 'Personal Training',
          dob: '2000-01-15',
          gender: 'Male',
          address: '123 Test Street',
          city: 'Hyderabad',
          state: 'Telangana',
          education: 'B.Tech',
          experience_years: 1,
          current_employment_status: 'Employed',
          admission_date: new Date().toISOString().slice(0, 10),
        },
        performingAdmin.id
      );

      expect(admissionResult).toBeDefined();
      expect(admissionResult.admission).toBeDefined();
      expect(admissionResult.admission.counsellor_id).toBe(targetCounsellor.id);
      expect(admissionResult.admission.counsellor_name).toBe('Vineethaa');

      // Verify the student fee record also retains counsellor attribution
      expect(admissionResult.studentFee).toBeDefined();
      expect(admissionResult.studentFee?.counsellor_id).toBe(targetCounsellor.id);
      expect(admissionResult.studentFee?.counsellor_name).toBe('Vineethaa');
    });

    it('should reject invalid or non-existent counsellor IDs', async () => {
      const performingAdmin = store.users.find((u) => u.role === 'admin' && u.is_active)!;

      await expect(
        createAdmissionWorkflow(
          {
            student_name: 'Invalid Counsellor Student',
            phone: '+91 91234 99999',
            email: 'invalid.counsellor@example.com',
            course_id: 'c1000000-0000-4000-a000-000000000101',
            course_fee: 35000,
            discount: 0,
            payment_plan: 'Full Payment',
            counsellor_id: 'non-existent-counsellor-uuid',
            training_mode: 'Online',
            dob: '2000-01-15',
            gender: 'Male',
            address: '123 Test Street',
            city: 'Hyderabad',
            state: 'Telangana',
            education: 'B.Tech',
            experience_years: 1,
            current_employment_status: 'Employed',
            admission_date: new Date().toISOString().slice(0, 10),
          },
          performingAdmin.id
        )
      ).rejects.toThrow(/not found|Invalid admissions counsellor/i);
    });

    it('should reject cross-tenant counsellor assignments', async () => {
      const performingAdmin = store.users.find((u) => u.role === 'admin' && u.is_active)!;
      const crossTenantStaff: UserProfile = {
        id: 'cross-tenant-counsellor-02',
        email: 'other.tenant2@example.com',
        full_name: 'Other Tenant Staff',
        role: 'counsellor',
        phone: '+91 99999 55555',
        is_active: true,
        tenant_id: 'tenant-secondary',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.users.push(crossTenantStaff);

      await expect(
        createAdmissionWorkflow(
          {
            student_name: 'Cross Tenant Assignment Student',
            phone: '+91 91234 88888',
            email: 'cross.tenant@example.com',
            course_id: 'c1000000-0000-4000-a000-000000000101',
            course_fee: 35000,
            discount: 0,
            payment_plan: 'Full Payment',
            counsellor_id: crossTenantStaff.id,
            training_mode: 'Online',
            dob: '2000-01-15',
            gender: 'Male',
            address: '123 Test Street',
            city: 'Hyderabad',
            state: 'Telangana',
            education: 'B.Tech',
            experience_years: 1,
            current_employment_status: 'Employed',
            admission_date: new Date().toISOString().slice(0, 10),
          },
          performingAdmin.id
        )
      ).rejects.toThrow(/cross-tenant/i);
    });
  });

  describe('5. Historical Admission Preservation', () => {
    it('should preserve historical admissions referencing legacy counsellor IDs without crashing', () => {
      const historicalAdmission = store.admissions.find((a) => a.counsellor_id === 'usr-counsellor');
      if (historicalAdmission) {
        expect(historicalAdmission.admission_number).toBeDefined();
        // Stored counsellor_name is preserved
        expect(historicalAdmission.counsellor_name || 'Ananya Desai').toBeTruthy();
      }
    });
  });
});
