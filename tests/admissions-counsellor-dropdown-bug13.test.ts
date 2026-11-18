import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getEligibleAdmissionsCounsellors,
  resolveCanonicalCounsellorId,
  isEligibleAdmissionsCounsellor,
  validateCounsellorAssignment,
  CANONICAL_COUNSELLOR_ID_MAP,
} from '@/lib/services/counsellor-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { UserProfile, Admission } from '@/types';

describe('BUG-13: Admissions Counsellor Dropdown & Authorization Verification', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
  });

  // Scenario 1: Same user returned by multiple queries / store duplicates -> single option
  it('Scenario 1: deduplicates repeated references and legacy aliases for the same staff member into a single option with canonical UUID', () => {
    const mockUsers: UserProfile[] = [
      {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'counsellor@next-generpsolutions.com',
        full_name: 'Ananya Desai (Senior Counsellor)',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'usr-counsellor',
        email: 'counsellor@next-generpsolutions.com',
        full_name: 'Ananya Desai (Senior Counsellor)',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '44444444-4444-4444-4444-444444444444', // Duplicate query result
        email: 'counsellor@next-generpsolutions.com',
        full_name: 'Ananya Desai (Senior Counsellor)',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const counsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(counsellors).toHaveLength(1);
    expect(counsellors[0].id).toBe('44444444-4444-4444-4444-444444444444');
    expect(counsellors[0].email).toBe('counsellor@next-generpsolutions.com');
  });

  // Scenario 2: Multiple role mappings -> single option
  it('Scenario 2: user with multiple role mappings or duplicate entries across role scopes renders as a single option', () => {
    const mockUsers: UserProfile[] = [
      {
        id: 'user-multi-role-1',
        email: 'multi.role@example.com',
        full_name: 'Vikram Malhotra',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'user-multi-role-1',
        email: 'multi.role@example.com',
        full_name: 'Vikram Malhotra',
        role: 'admin',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const counsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(counsellors).toHaveLength(1);
    expect(counsellors[0].id).toBe('user-multi-role-1');
  });

  // Scenario 3: Identical names on different accounts -> separate identifiable options
  it('Scenario 3: preserves distinct staff accounts with identical names and differentiates them with emails in display labels', () => {
    const mockUsers: UserProfile[] = [
      {
        id: 'counsellor-delhi-01',
        email: 'rohit.verma.delhi@lms.com',
        full_name: 'Rohit Verma',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'counsellor-mumbai-02',
        email: 'rohit.verma.mumbai@lms.com',
        full_name: 'Rohit Verma',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const counsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(counsellors).toHaveLength(2);
    expect(counsellors[0].id).not.toBe(counsellors[1].id);

    // Both should contain their respective emails to clearly identify them
    const labels = counsellors.map((c) => c.display_label);
    expect(labels.some((l) => l.includes('rohit.verma.delhi@lms.com'))).toBe(true);
    expect(labels.some((l) => l.includes('rohit.verma.mumbai@lms.com'))).toBe(true);
  });

  // Scenario 4: Inactive user -> hidden
  it('Scenario 4: excludes deactivated or inactive counsellor accounts', () => {
    const mockUsers: UserProfile[] = [
      {
        id: 'counsellor-active',
        email: 'active@lms.com',
        full_name: 'Active Counsellor',
        role: 'counsellor',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'counsellor-inactive-flag',
        email: 'inactive1@lms.com',
        full_name: 'Inactive Counsellor 1',
        role: 'counsellor',
        is_active: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'counsellor-inactive-status',
        email: 'inactive2@lms.com',
        full_name: 'Inactive Counsellor 2',
        role: 'counsellor',
        is_active: true,
        status: 'Inactive',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const counsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(counsellors).toHaveLength(1);
    expect(counsellors[0].id).toBe('counsellor-active');
  });

  // Scenario 5: Unauthorized Admin -> hidden
  it('Scenario 5: excludes unauthorized admin accounts without explicit admissions assignment permissions', () => {
    const mockUsers: UserProfile[] = [
      {
        id: 'usr-admin-ops',
        email: 'admin.ops@lms.com',
        full_name: 'Priya Nair (Operations Head)',
        role: 'admin',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'usr-superadmin-dir',
        email: 'director@lms.com',
        full_name: 'Rajesh Sharma (Director)',
        role: 'super_admin',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'usr-admin-scoped-no-admissions',
        email: 'scoped.admin@lms.com',
        full_name: 'IT Admin',
        role: 'admin',
        is_active: true,
        permissions: ['users:read', 'users:write'] as any,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const counsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(counsellors).toHaveLength(0);
  });

  // Scenario 6: Valid Admin with assignment permission -> displayed
  it('Scenario 6: displays authorized admin accounts when explicit admissions assignment permissions are granted', () => {
    const mockUsers: UserProfile[] = [
      {
        id: 'admin-with-flag',
        email: 'counselling.head@lms.com',
        full_name: 'Meenakshi Iyer (Admissions Head)',
        role: 'admin',
        is_active: true,
        can_assign_admissions: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      } as any,
      {
        id: 'admin-with-scoped-permission',
        email: 'lead.admin@lms.com',
        full_name: 'Sunil Rao (Branch Admin)',
        role: 'admin',
        is_active: true,
        permissions: ['admissions:write', 'admissions:read'] as any,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      } as any,
      {
        id: 'admin-unauthorized',
        email: 'general.admin@lms.com',
        full_name: 'General Admin',
        role: 'admin',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const counsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(counsellors).toHaveLength(2);
    const ids = counsellors.map((c) => c.id);
    expect(ids).toContain('admin-with-flag');
    expect(ids).toContain('admin-with-scoped-permission');
    expect(ids).not.toContain('admin-unauthorized');
  });

  // Scenario 7: Counsellor selection -> correct user ID saved
  it('Scenario 7: resolves legacy alias to canonical UUID when creating admission workflow', async () => {
    const timestamp = Date.now();
    const result = await createAdmissionWorkflow(
      {
        student_name: `Test Bug13 Student ${timestamp}`,
        email: `bug13.student.${timestamp}@example.com`,
        phone: '+91 98888 77771',
        course_id: 'crs-fico-01',
        course_fee: 55000,
        discount: 0,
        counsellor_id: 'usr-counsellor', // submitting legacy alias
        dob: '2000-01-15',
        gender: 'Male',
        address: '123 Test Street',
        city: 'Pune',
        state: 'Maharashtra',
        education: 'B.Tech',
        experience_years: 1,
        current_employment_status: 'Employed',
        admission_date: new Date().toISOString().slice(0, 10),
        payment_plan: 'Full Payment',
      },
      '44444444-4444-4444-4444-444444444444',
      true
    );

    expect(result.admission).toBeDefined();
    expect(result.admission.counsellor_id).toBe('44444444-4444-4444-4444-444444444444');
    expect(result.admission.counsellor_name).toContain('Ananya Desai');
  });

  // Scenario 8: Existing admissions -> assignments unchanged
  it('Scenario 8: preserves existing admissions and their assigned counsellor references without alteration', () => {
    const existingAdmissions = store.admissions.slice(0, 5);
    const existingSnapshots = existingAdmissions.map((a) => ({
      id: a.id,
      admission_number: a.admission_number,
      counsellor_id: a.counsellor_id,
      counsellor_name: a.counsellor_name,
    }));

    // Trigger selector calculation and validation
    const counsellors = getEligibleAdmissionsCounsellors(store.users, 'default');
    expect(counsellors.length).toBeGreaterThan(0);

    // Verify existing admissions were not modified
    existingSnapshots.forEach((snap) => {
      const current = store.admissions.find((a) => a.id === snap.id);
      expect(current).toBeDefined();
      expect(current?.counsellor_id).toBe(snap.counsellor_id);
      expect(current?.counsellor_name).toBe(snap.counsellor_name);
    });
  });

  // Scenario 9: Cross-tenant users -> not visible
  it('Scenario 9: enforces tenant isolation and hides counsellors belonging to other tenants', () => {
    const mockUsers: UserProfile[] = [
      {
        id: 'counsellor-tenant-a',
        email: 'counsellor.a@tenant-a.com',
        full_name: 'Counsellor Branch A',
        role: 'counsellor',
        is_active: true,
        tenant_id: 'tenant-a',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'counsellor-tenant-default',
        email: 'counsellor.default@main.com',
        full_name: 'Counsellor Main Campus',
        role: 'counsellor',
        is_active: true,
        tenant_id: 'default',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const defaultCounsellors = getEligibleAdmissionsCounsellors(mockUsers, 'default');
    expect(defaultCounsellors).toHaveLength(1);
    expect(defaultCounsellors[0].id).toBe('counsellor-tenant-default');

    const tenantACounsellors = getEligibleAdmissionsCounsellors(mockUsers, 'tenant-a');
    expect(tenantACounsellors).toHaveLength(1);
    expect(tenantACounsellors[0].id).toBe('counsellor-tenant-a');
  });

  // Scenario 10: Dropdown refresh -> no repeated entries
  it('Scenario 10: ensures idempotent, stable output with zero duplicates across repeated invocations', () => {
    const firstRun = getEligibleAdmissionsCounsellors(store.users, 'default');
    const secondRun = getEligibleAdmissionsCounsellors(store.users, 'default');
    const thirdRun = getEligibleAdmissionsCounsellors(store.users, 'default');

    expect(firstRun).toEqual(secondRun);
    expect(secondRun).toEqual(thirdRun);

    // Verify all IDs are strictly unique
    const ids = firstRun.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);

    // Verify all display labels for same staff member do not repeat
    const labels = firstRun.map((c) => c.display_label);
    const uniqueLabels = new Set(labels);
    expect(labels.length).toBe(uniqueLabels.size);
  });
});
