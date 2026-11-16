import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createUserRoute, PATCH as updateUserRoute } from '@/app/api/users/route';
import { POST as resetPasswordRoute } from '@/app/api/users/reset-password/route';
import { GET as getStudentRoute } from '@/app/api/students/[id]/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { store } from '@/lib/services/data-store';
import { ROLE_LABELS, getRoleLabel } from '@/lib/utils/role-labels';
import { UserProfile } from '@/types';

async function createSignedRequest(
  actor?: UserProfile,
  url: string = 'http://localhost/api/users',
  method: string = 'GET',
  body?: any
) {
  let cookieHeader = '';
  if (actor) {
    const value = encodeURIComponent(JSON.stringify(actor));
    const signature = await generateAuthCookieSignature(value);
    cookieHeader = `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}`;
  }

  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Role 2 Admin Defect Resolution (BUG-AD-001 through BUG-AD-004)', () => {
  const superAdminActor: UserProfile = {
    id: 'usr-superadmin-fixture',
    email: 'superadmin.fixture@next-gen.edu',
    full_name: 'Lead Super Administrator',
    role: 'super_admin',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const adminActor: UserProfile = {
    id: 'usr-admin-fixture',
    email: 'admin.fixture@next-gen.edu',
    full_name: 'Operations Administrator',
    role: 'admin',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const targetSuperAdmin: UserProfile = {
    id: 'usr-target-superadmin',
    email: 'target.sa@next-gen.edu',
    full_name: 'Target Director',
    role: 'super_admin',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const regularStaff: UserProfile = {
    id: 'usr-regular-staff',
    email: 'staff.fixture@next-gen.edu',
    full_name: 'Regular Staff',
    role: 'trainer',
    is_active: true,
    tenant_id: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    store.hydrateFromDisk();
    if (!store.users) store.users = [];
    const fixtures = [superAdminActor, adminActor, targetSuperAdmin, regularStaff];
    for (const f of fixtures) {
      const idx = store.users.findIndex((u) => u.id === f.id);
      if (idx >= 0) {
        store.users[idx] = { ...f };
      } else {
        store.users.push({ ...f });
      }
    }
  });

  describe('BUG-AD-001: Admin Privilege Escalation Prevention', () => {
    it('blocks Admin from creating a user with super_admin role (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/users', 'POST', {
        email: `new-sa-${Date.now()}@example.com`,
        full_name: 'Escalated Super Admin',
        role: 'super_admin',
      });
      const res = await createUserRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/Super Administrators/i);
    });

    it('blocks Admin from promoting another user to super_admin (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/users', 'PATCH', {
        id: regularStaff.id,
        role: 'super_admin',
      });
      const res = await updateUserRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/Super Administrators/i);
    });

    it('blocks Admin from modifying or deactivating existing Super Admin accounts (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/users', 'PATCH', {
        id: targetSuperAdmin.id,
        full_name: 'Tampered Name',
        is_active: false,
      });
      const res = await updateUserRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/not authorized to modify Super Administrator/i);
    });

    it('blocks Admin from resetting credentials for Super Admin accounts (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/users/reset-password', 'POST', {
        user_id: targetSuperAdmin.id,
        new_password: 'NewPassword@2026',
      });
      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/reset credentials for Super Administrator/i);
    });

    it('permits Super Admin to manage and provision accounts normally', async () => {
      const uniqueEmail = `legit-staff-${Date.now()}@example.com`;
      const req = await createSignedRequest(superAdminActor, 'http://localhost/api/users', 'POST', {
        email: uniqueEmail,
        full_name: 'Legit Provisioned Staff',
        role: 'trainer',
      });
      const res = await createUserRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(uniqueEmail);
    });
  });

  describe('BUG-AD-002: Admin Self-Demotion Prevention', () => {
    it('blocks Admin from demoting or changing their own role (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/users', 'PATCH', {
        id: adminActor.id,
        role: 'counsellor',
      });
      const res = await updateUserRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/Self-Demotion Blocked/i);
    });

    it('blocks Admin from elevating their own role to super_admin (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/users', 'PATCH', {
        id: adminActor.id,
        role: 'super_admin',
      });
      const res = await updateUserRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('BUG-AD-003: Role Label Mapping', () => {
    it('maps admin role to canonical display label "Administrator"', () => {
      expect(ROLE_LABELS.admin).toBe('Administrator');
      expect(getRoleLabel('admin')).toBe('Administrator');
      expect(getRoleLabel('super_admin')).toBe('Super Admin');
    });
  });

  describe('BUG-AD-004: Student API Route and ID Resolution', () => {
    it('resolves GET /api/students/stu-01 with 200 OK and complete financial ledger', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/students/stu-01', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'stu-01' }) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.student).toBeDefined();
      expect(body.student.id).toBe('stu-01');
      expect(body.student.full_name).toBe('Amit Gupta');

      // Financial reconciliation check
      expect(body.student.total_fee).toBe(40000);
      expect(body.student.paid_amount).toBe(40000);
      expect(body.student.outstanding_amount).toBe(0);
      expect(body.feeAccount).toBeDefined();
      expect(body.feeAccount.net_payable).toBe(40000);
    });

    it('resolves GET /api/students/51000000-0000-0000-0000-000000000001 (Supabase UUID) with 200 OK', async () => {
      const req = await createSignedRequest(
        adminActor,
        'http://localhost/api/students/51000000-0000-0000-0000-000000000001',
        'GET'
      );
      const res = await getStudentRoute(req, {
        params: Promise.resolve({ id: '51000000-0000-0000-0000-000000000001' }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.student).toBeDefined();
      expect(body.student.full_name).toBe('Amit Gupta');
    });

    it('returns 404 for truly nonexistent student', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/students/non-existent-id-99999', 'GET');
      const res = await getStudentRoute(req, {
        params: Promise.resolve({ id: 'non-existent-id-99999' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/not found/i);
    });
  });

  describe('TASK 1 — Student Ownership and Tenant Isolation Security Tests', () => {
    const student1: UserProfile = {
      id: 'usr-student-01',
      email: 'amit.gupta@student.next-gen.com',
      full_name: 'Amit Gupta',
      role: 'student',
      is_active: true,
      tenant_id: 'default',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const student2: UserProfile = {
      id: 'usr-student-02',
      email: 'sneha.k@student.next-gen.com',
      full_name: 'Sneha Kulkarni',
      role: 'student',
      is_active: true,
      tenant_id: 'default',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const otherTenantStudentActor: UserProfile = {
      id: 'usr-other-tenant-student',
      email: 'other.student@other-institute.edu',
      full_name: 'External Student',
      role: 'student',
      is_active: true,
      tenant_id: 'tenant-external',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    beforeEach(() => {
      // Ensure other-tenant student exists in store
      if (!store.students.some((s) => s.id === 'stu-external-01')) {
        store.students.push({
          id: 'stu-external-01',
          user_id: 'usr-other-tenant-student',
          full_name: 'External Student',
          email: 'other.student@other-institute.edu',
          tenant_id: 'tenant-external',
          student_code: 'STU-EXT-01',
          admission_number: 'ADM-EXT-01',
          admission_id: 'adm-ext-01',
          course_id: 'crs-01',
          batch_id: 'bat-01',
          counsellor_id: 'usr-counsellor-01',
          total_fee: 50000,
          paid_amount: 50000,
          outstanding_amount: 0,
          attendance_percentage: 95,
          performance_score: 90,
          placement_status: 'Eligible',
          created_at: new Date().toISOString(),
        } as any);
      }
    });

    it('Scenario 1: Student accessing own profile — allowed (200 OK)', async () => {
      const req = await createSignedRequest(student1, 'http://localhost/api/students/stu-01', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'stu-01' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.student.id).toBe('stu-01');
      expect(body.student.full_name).toBe('Amit Gupta');
    });

    it('Scenario 2: Student accessing another student profile in same tenant — 403 Forbidden', async () => {
      const req = await createSignedRequest(student1, 'http://localhost/api/students/stu-02', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'stu-02' }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/own student profile/i);
    });

    it('Scenario 3: Student accessing another tenant profile — 403 Forbidden', async () => {
      const req = await createSignedRequest(student1, 'http://localhost/api/students/stu-external-01', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'stu-external-01' }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/another tenant/i);
    });

    it('Scenario 4: Tampered student ID or UUID — denied (404/403)', async () => {
      const req = await createSignedRequest(student1, 'http://localhost/api/students/tampered-uuid-99999', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'tampered-uuid-99999' }) });
      expect([403, 404]).toContain(res.status);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('Scenario 5: Admin accessing students within authorized tenant — allowed (200 OK)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/students/stu-02', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'stu-02' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.student.id).toBe('stu-02');
      expect(body.student.full_name).toBe('Sneha Kulkarni');
    });

    it('Scenario 6: Admin accessing students outside authorized tenant — denied (403 Forbidden)', async () => {
      const req = await createSignedRequest(adminActor, 'http://localhost/api/students/stu-external-01', 'GET');
      const res = await getStudentRoute(req, { params: Promise.resolve({ id: 'stu-external-01' }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/another tenant/i);
    });

    it('Scenario 7: Legacy alias resolution — works without weakening authorization', async () => {
      // 7a: Student accessing own profile using UUID alias -> 200 OK
      const reqOwnUuid = await createSignedRequest(
        student1,
        'http://localhost/api/students/51000000-0000-0000-0000-000000000001',
        'GET'
      );
      const resOwnUuid = await getStudentRoute(reqOwnUuid, {
        params: Promise.resolve({ id: '51000000-0000-0000-0000-000000000001' }),
      });
      expect(resOwnUuid.status).toBe(200);
      const bodyOwnUuid = await resOwnUuid.json();
      expect(bodyOwnUuid.success).toBe(true);
      expect(bodyOwnUuid.student.full_name).toBe('Amit Gupta');

      // 7b: Student 2 attempting to access Student 1 profile using UUID alias -> strictly denied (403 Forbidden)
      const reqOtherUuid = await createSignedRequest(
        student2,
        'http://localhost/api/students/51000000-0000-0000-0000-000000000001',
        'GET'
      );
      const resOtherUuid = await getStudentRoute(reqOtherUuid, {
        params: Promise.resolve({ id: '51000000-0000-0000-0000-000000000001' }),
      });
      expect(resOtherUuid.status).toBe(403);
      const bodyOtherUuid = await resOtherUuid.json();
      expect(bodyOtherUuid.success).toBe(false);
      expect(bodyOtherUuid.error).toMatch(/own student profile/i);
    });
  });
});
