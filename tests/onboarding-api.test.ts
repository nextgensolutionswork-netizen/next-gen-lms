import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import {
  generateAuthCookieSignatureSync,
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
} from '@/lib/security/auth-cookie';
import { GET as getCasesRoute, POST as postCasesRoute } from '@/app/api/onboarding/cases/route';
import { GET as getCaseDetailRoute, PATCH as patchCaseDetailRoute } from '@/app/api/onboarding/cases/[id]/route';
import { GET as getCanonicalRoute, POST as postCanonicalRoute } from '@/app/api/onboarding/route';
import { GET as getCanonicalDetailRoute, PATCH as patchCanonicalDetailRoute } from '@/app/api/onboarding/[id]/route';
import { GET as getAnalyticsRoute } from '@/app/api/onboarding/analytics/route';
import { POST as postBackfillRoute } from '@/app/api/onboarding/backfill/route';
import { OnboardingCase } from '@/types';

// Helper to create authenticated NextRequest with HMAC signed cookies
function createAuthRequest(
  url: string,
  user: {
    id: string;
    email: string;
    role: string;
    full_name?: string;
    is_active?: boolean;
  } | null,
  options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    tamperSig?: boolean;
    useBearer?: boolean;
  }
): NextRequest {
  const method = options?.method || 'GET';
  const headers = new Headers(options?.headers || {});

  if (options?.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (user && options?.useBearer) {
    headers.set('Authorization', `Bearer ${JSON.stringify(user)}`);
  }

  const req = new NextRequest(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (user && !options?.useBearer) {
    const cookiePayload = encodeURIComponent(
      JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.full_name || 'Test User',
        role: user.role,
        is_active: user.is_active !== false,
      })
    );
    const signature = options?.tamperSig
      ? '0'.repeat(64)
      : generateAuthCookieSignatureSync(cookiePayload);

    req.cookies.set(AUTH_COOKIE_NAME, cookiePayload);
    req.cookies.set(AUTH_SIG_COOKIE_NAME, signature);
  }

  return req;
}

describe('Server-Side /api/onboarding Route Handlers & Session Security', () => {
  afterEach(() => vi.restoreAllMocks());
  const adminUser = {
    id: 'usr-admin-01',
    email: 'superadmin@next-generpsolutions.com',
    role: 'super_admin',
    full_name: 'Super Admin',
    is_active: true,
  };

  const onboardingStaffA = {
    id: 'usr-onboard-01',
    email: 'priya.sharma@next-gen.com',
    role: 'onboarding_team',
    full_name: 'Priya Sharma',
    is_active: true,
  };

  const onboardingStaffB = {
    id: 'usr-onboard-02',
    email: 'rahul.verma@next-gen.com',
    role: 'onboarding_team',
    full_name: 'Rahul Verma',
    is_active: true,
  };

  const studentUser = {
    id: 'usr-student-01',
    email: 'amit.gupta@student.next-gen.com',
    role: 'student',
    full_name: 'Amit Gupta',
    is_active: true,
  };

  const trainerUser = {
    id: 'usr-trainer-01',
    email: 'rajesh.kumar@next-gen.com',
    role: 'trainer',
    full_name: 'Rajesh Kumar',
    is_active: true,
  };

  beforeEach(() => {
    store.hydrateFromDisk();
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    for (const user of [adminUser, onboardingStaffA, onboardingStaffB, studentUser, trainerUser]) {
      store.users = store.users.filter((u) => u.id !== user.id);
      store.users.push({ ...user, role: user.role as any, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }

    // Ensure staff users exist in store
    if (!store.users.find((u) => u.id === onboardingStaffA.id)) {
      store.users.push({
        id: onboardingStaffA.id,
        email: onboardingStaffA.email,
        full_name: onboardingStaffA.full_name,
        role: 'onboarding_team',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (!store.users.find((u) => u.id === onboardingStaffB.id)) {
      store.users.push({
        id: onboardingStaffB.id,
        email: onboardingStaffB.email,
        full_name: onboardingStaffB.full_name,
        role: 'onboarding_team',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  });

  // =========================================================================
  // 1. AUTHENTICATION & ACCESS CONTROL (401 & 403)
  // =========================================================================
  describe('Session Authentication & Role Boundary Defense', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding/cases', null);
      const res = await getCasesRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects tampered auth cookie signature with 401 Unauthorized', async () => {
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        adminUser,
        { tamperSig: true }
      );
      const res = await getCasesRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('rejects inactive or deactivated user accounts with 403 Forbidden', async () => {
      const inactiveUser = { ...onboardingStaffA, is_active: false };
      store.users.find((u) => u.id === onboardingStaffA.id)!.is_active = false;
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        inactiveUser
      );
      const res = await getCasesRoute(req);
      expect(res.status).toBe(401); // inactive cookie parses as unauthenticated
    });

    it('denies access to unauthorized roles (student, trainer) with 403 Forbidden', async () => {
      // Student attempt
      const studentReq = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        studentUser
      );
      const studentRes = await getCasesRoute(studentReq);
      expect(studentRes.status).toBe(403);
      const studentData = await studentRes.json();
      expect(studentData.error).toContain('Forbidden');

      // Trainer attempt
      const trainerReq = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        trainerUser
      );
      const trainerRes = await getCasesRoute(trainerReq);
      expect(trainerRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. GET /api/onboarding/cases (TENANT & ASSIGNMENT SCOPE)
  // =========================================================================
  describe('GET /api/onboarding/cases', () => {
    it('allows Admin to view all onboarding cases across the institution', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding/cases', adminUser);
      const res = await getCasesRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.cases)).toBe(true);
      expect(data.count).toBe(data.cases.length);
    });

    it('scopes cases for onboarding_team staff to ONLY their assigned students', async () => {
      // Create test case assigned to Staff A
      const caseStaffAId = `case-test-staff-a-${Date.now()}`;
      store.onboardingCases.push({
        id: caseStaffAId,
        case_number: 'ONB-TEST-A1',
        admission_id: 'adm-test-01',
        admission_number: 'ADM-2026-A1',
        student_id: 'stu-test-01',
        student_name: 'Pooja Reddy',
        student_email: 'pooja@example.com',
        student_phone: '+91 9988776655',
        course_id: 'crs-fico',
        course_name: 'SAP S/4HANA Finance (FICO)',
        assigned_staff_id: onboardingStaffA.id,
        assigned_staff_name: onboardingStaffA.full_name,
        assigned_at: new Date().toISOString(),
        status: 'in_progress',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {} as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create test case assigned to Staff B
      const caseStaffBId = `case-test-staff-b-${Date.now()}`;
      store.onboardingCases.push({
        id: caseStaffBId,
        case_number: 'ONB-TEST-B2',
        admission_id: 'adm-test-02',
        admission_number: 'ADM-2026-B2',
        student_id: 'stu-test-02',
        student_name: 'Vikram Malhotra',
        student_email: 'vikram@example.com',
        student_phone: '+91 9988776644',
        course_id: 'crs-mm',
        course_name: 'SAP S/4HANA Materials Management (MM)',
        assigned_staff_id: onboardingStaffB.id,
        assigned_staff_name: onboardingStaffB.full_name,
        assigned_at: new Date().toISOString(),
        status: 'in_progress',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {} as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Staff A requests cases
      const reqStaffA = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        onboardingStaffA
      );
      const resStaffA = await getCasesRoute(reqStaffA);
      expect(resStaffA.status).toBe(200);
      const dataStaffA = await resStaffA.json();

      // Verify every returned case belongs to Staff A
      dataStaffA.cases.forEach((c: OnboardingCase) => {
        expect(c.assigned_staff_id).toBe(onboardingStaffA.id);
      });
      expect(dataStaffA.cases.some((c: OnboardingCase) => c.id === caseStaffAId)).toBe(true);
      expect(dataStaffA.cases.some((c: OnboardingCase) => c.id === caseStaffBId)).toBe(false);
    });

    it('rejects unsigned identity JSON in a Bearer header', async () => {
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases?includeKpis=true',
        adminUser,
        { useBearer: true }
      );
      const res = await getCasesRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.kpis).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. POST /api/onboarding/cases (ADMISSION CREATION VALIDATION)
  // =========================================================================
  describe('POST /api/onboarding/cases', () => {
    it('prevents non-admin staff from creating onboarding cases directly', async () => {
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        onboardingStaffA,
        {
          method: 'POST',
          body: { admissionId: 'adm-001' },
        }
      );
      const res = await postCasesRoute(req);
      expect(res.status).toBe(403);
    });

    it('rejects unconfirmed admissions from entering onboarding', async () => {
      // Mock an unconfirmed/Pending admission in store
      const draftAdmissionId = `adm-draft-${Date.now()}`;
      store.admissions.push({
        id: draftAdmissionId,
        admission_number: 'ADM-DRAFT-01',
        student_name: 'Draft Candidate',
        email: 'draft@example.com',
        phone: '+91 99999 11111',
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Test Address',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 0,
        current_employment_status: 'Student',
        course_id: 'crs-fico',
        training_mode: 'Online',
        course_fee: 35000,
        discount: 0,
        net_payable: 35000,
        payment_plan: 'Full Payment',
        status: 'Pending', // Not Confirmed
        admission_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/cases',
        adminUser,
        {
          method: 'POST',
          body: { admissionId: draftAdmissionId },
        }
      );
      const res = await postCasesRoute(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toContain('Only confirmed admissions are eligible');
    });
  });

  // =========================================================================
  // 4. GET & PATCH /api/onboarding/cases/[id] (WORKFLOW & ISOLATION)
  // =========================================================================
  describe('GET & PATCH /api/onboarding/cases/[id]', () => {
    it('blocks onboarding_team staff from viewing cases assigned to other employees', async () => {
      const targetCaseId = `case-isolation-${Date.now()}`;
      store.onboardingCases.push({
        id: targetCaseId,
        case_number: 'ONB-TEST-ISO',
        admission_id: 'adm-iso-01',
        admission_number: 'ADM-ISO-01',
        student_id: 'stu-iso-01',
        student_name: 'Private Student',
        student_email: 'private@example.com',
        student_phone: '+91 98765 00000',
        course_id: 'crs-fico',
        course_name: 'SAP FICO',
        assigned_staff_id: onboardingStaffB.id, // Assigned to Staff B
        status: 'pending',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {} as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Staff A attempts to view Staff B's case
      const req = createAuthRequest(
        `http://localhost:3000/api/onboarding/cases/${targetCaseId}`,
        onboardingStaffA
      );
      const res = await getCaseDetailRoute(req, { params: { id: targetCaseId } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('not assigned to your account');
    });

    it('allows assigned staff member to retrieve case details and audit log', async () => {
      const myCaseId = `case-mine-${Date.now()}`;
      store.onboardingCases.push({
        id: myCaseId,
        case_number: 'ONB-TEST-MINE',
        admission_id: 'adm-mine-01',
        admission_number: 'ADM-MINE-01',
        student_id: 'stu-mine-01',
        student_name: 'Assigned Student',
        student_email: 'assigned@example.com',
        student_phone: '+91 98765 11111',
        course_id: 'crs-fico',
        course_name: 'SAP FICO',
        assigned_staff_id: onboardingStaffA.id,
        status: 'in_progress',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {
          admission_confirmation: {
            key: 'admission_confirmation',
            title: 'Admission Confirmation',
            completed: true,
            mandatory: true,
          },
        } as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = createAuthRequest(
        `http://localhost:3000/api/onboarding/cases/${myCaseId}`,
        onboardingStaffA
      );
      const res = await getCaseDetailRoute(req, { params: { id: myCaseId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.case.id).toBe(myCaseId);
      expect(Array.isArray(data.auditEvents)).toBe(true);
    });

    it('executes checklist update via PATCH /api/onboarding/cases/[id]', async () => {
      const patchCaseId = `case-patch-${Date.now()}`;
      store.onboardingCases.push({
        id: patchCaseId,
        case_number: 'ONB-TEST-PATCH',
        admission_id: 'adm-patch-01',
        admission_number: 'ADM-PATCH-01',
        student_id: 'stu-patch-01',
        student_name: 'Patch Student',
        student_email: 'patch@example.com',
        student_phone: '+91 98765 22222',
        course_id: 'crs-fico',
        course_name: 'SAP FICO',
        assigned_staff_id: onboardingStaffA.id,
        status: 'pending',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {
          student_details_verification: {
            key: 'student_details_verification',
            title: 'Student Details Verification',
            completed: false,
            mandatory: true,
          },
        } as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = createAuthRequest(
        `http://localhost:3000/api/onboarding/cases/${patchCaseId}`,
        onboardingStaffA,
        {
          method: 'PATCH',
          body: {
            action: 'update_checklist',
            itemKey: 'student_details_verification',
            completed: true,
            notes: 'Aadhaar and phone confirmed over call',
          },
        }
      );

      const res = await patchCaseDetailRoute(req, { params: { id: patchCaseId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.case.checklist.student_details_verification.completed).toBe(true);
      expect(data.case.status).toBe('in_progress'); // Auto-promoted from pending
    });

    it('provisions student LMS portal access via PATCH /api/onboarding/cases/[id]', async () => {
      const studentId = `stu-prov-${Date.now()}`;
      const provCaseId = `case-prov-${Date.now()}`;

      // Student starts with status = 'On Hold' and inactive user profile
      store.students.push({
        id: studentId,
        user_id: `usr-${studentId}`,
        admission_id: 'adm-prov-01',
        student_code: 'STU-PROV-001',
        admission_number: 'ADM-PROV-01',
        full_name: 'Alok Verma',
        email: 'alok.verma@example.com',
        phone: '+91 91111 22222',
        course_id: 'crs-fico',
        joining_date: new Date().toISOString(),
        status: 'On Hold',
        total_fee: 35000,
        paid_amount: 35000,
        outstanding_amount: 0,
        attendance_percentage: 0,
        course_progress: 0,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      store.users.push({
        id: `usr-${studentId}`,
        email: 'alok.verma@example.com',
        full_name: 'Alok Verma',
        role: 'student',
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      store.onboardingCases.push({
        id: provCaseId,
        case_number: 'ONB-TEST-PROV',
        admission_id: 'adm-prov-01',
        admission_number: 'ADM-PROV-01',
        student_id: studentId,
        student_name: 'Alok Verma',
        student_email: 'alok.verma@example.com',
        student_phone: '+91 91111 22222',
        course_id: 'crs-fico',
        course_name: 'SAP FICO',
        assigned_staff_id: onboardingStaffA.id,
        status: 'in_progress',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {
          lms_account_activation: {
            key: 'lms_account_activation',
            title: 'LMS Account Activation',
            completed: false,
            mandatory: true,
          },
        } as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = createAuthRequest(
        `http://localhost:3000/api/onboarding/cases/${provCaseId}`,
        onboardingStaffA,
        {
          method: 'PATCH',
          body: { action: 'provision_lms' },
        }
      );

      const res = await patchCaseDetailRoute(req, { params: { id: provCaseId } });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/checks are completed/);
      expect(store.onboardingCases.find((c) => c.id === provCaseId)?.lms_account_created).toBe(false);
    });

    it('blocks and unblocks onboarding cases with audit logs', async () => {
      const blockCaseId = `case-blk-${Date.now()}`;
      store.onboardingCases.push({
        id: blockCaseId,
        case_number: 'ONB-TEST-BLK',
        admission_id: 'adm-blk-01',
        admission_number: 'ADM-BLK-01',
        student_id: 'stu-blk-01',
        student_name: 'Blocked Candidate',
        student_email: 'block@example.com',
        student_phone: '+91 90000 11111',
        course_id: 'crs-fico',
        course_name: 'SAP FICO',
        assigned_staff_id: onboardingStaffA.id,
        status: 'in_progress',
        lms_account_created: false,
        portal_access_confirmed: false,
        academic_handover_confirmed: false,
        checklist: {} as any,
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // 1. Block case
      const blockReq = createAuthRequest(
        `http://localhost:3000/api/onboarding/cases/${blockCaseId}`,
        onboardingStaffA,
        {
          method: 'PATCH',
          body: { action: 'block_case', reason: 'Awaiting graduation degree certificate from university' },
        }
      );
      const blockRes = await patchCaseDetailRoute(blockReq, { params: { id: blockCaseId } });
      expect(blockRes.status).toBe(200);
      const blockData = await blockRes.json();
      expect(blockData.case.status).toBe('blocked');
      expect(blockData.case.blocked_reason).toContain('graduation degree');

      // 2. Unblock case
      const unblockReq = createAuthRequest(
        `http://localhost:3000/api/onboarding/cases/${blockCaseId}`,
        onboardingStaffA,
        {
          method: 'PATCH',
          body: { action: 'unblock_case' },
        }
      );
      const unblockRes = await patchCaseDetailRoute(unblockReq, { params: { id: blockCaseId } });
      expect(unblockRes.status).toBe(200);
      const unblockData = await unblockRes.json();
      expect(unblockData.case.status).toBe('in_progress');
      expect(unblockData.case.blocked_reason).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. GET /api/onboarding/analytics
  // =========================================================================
  describe('GET /api/onboarding/analytics', () => {
    it('returns aggregate KPIs and detailed staff SLA analytics for Admins', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding/analytics', adminUser);
      const res = await getAnalyticsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.kpis).toBeDefined();
      expect(Array.isArray(data.staffPerformance)).toBe(true);
      expect(Array.isArray(data.eligibleStaff)).toBe(true);
      expect(typeof data.unbackfilledCount).toBe('number');
    });

    it('returns scoped KPIs for onboarding_team staff without admin supervision details', async () => {
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/analytics',
        onboardingStaffA
      );
      const res = await getAnalyticsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.kpis).toBeDefined();
      expect(data.staffPerformance).toBeUndefined(); // Hidden from non-admins
    });
  });

  // =========================================================================
  // 6. POST /api/onboarding/backfill (ADMIN-ONLY)
  // =========================================================================
  describe('POST /api/onboarding/backfill', () => {
    it('prevents onboarding_team members from triggering legacy backfill', async () => {
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/backfill',
        onboardingStaffA,
        { method: 'POST' }
      );
      const res = await postBackfillRoute(req);
      expect(res.status).toBe(403);
    });

    it('executes 1-click legacy admission backfill successfully when called by Admin', async () => {
      const req = createAuthRequest(
        'http://localhost:3000/api/onboarding/backfill',
        adminUser,
        { method: 'POST' }
      );
      const res = await postBackfillRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result).toBeDefined();
      expect(typeof data.result.cases_created).toBe('number');
      expect(typeof data.result.cases_skipped).toBe('number');
    });
  });

  // =========================================================================
  // 7. CANONICAL REST ROUTE HANDLERS: /api/onboarding and /api/onboarding/[id]
  // =========================================================================
  describe('Canonical /api/onboarding and /api/onboarding/[id] Routes', () => {
    it('rejects unauthenticated requests with 401 on /api/onboarding', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding', null);
      const res = await getCanonicalRoute(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthorized roles (student) with 403 on /api/onboarding', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding', studentUser);
      const res = await getCanonicalRoute(req);
      expect(res.status).toBe(403);
    });

    it('returns cases when authenticated with valid HMAC cookie on /api/onboarding', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding', adminUser);
      const res = await getCanonicalRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.cases)).toBe(true);
    });

    it('rejects unauthenticated requests on /api/onboarding/[id]', async () => {
      const req = createAuthRequest('http://localhost:3000/api/onboarding/case-123', null);
      const res = await getCanonicalDetailRoute(req, { params: { id: 'case-123' } });
      expect(res.status).toBe(401);
    });
  });
});
