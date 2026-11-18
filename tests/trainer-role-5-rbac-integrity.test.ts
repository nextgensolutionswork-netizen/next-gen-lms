import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { canAccessCourse, canAccessBatch, ROLE_PERMISSIONS } from '@/lib/auth/rbac';
import {
  createAssignment,
  submitAssignment,
  gradeAssignmentSubmission,
  createClassSession,
  getClassSessions,
} from '@/lib/services/academics-service';
import { getSapSystems, getSapAllocations } from '@/lib/services/sap-lab-service';

function createMockRequest(url: string, cookiePayload?: Record<string, any>) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
    },
  });

  if (cookiePayload) {
    const cookie = encodeURIComponent(JSON.stringify(cookiePayload));
    req.cookies.set('next_gen_auth_user', cookie);
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(cookie));
  }

  return req;
}

describe('Role 5: Trainer / Faculty — Comprehensive RBAC & Academic Integrity Suite', () => {
  const trainerVikram = {
    id: 'usr-trainer-01',
    email: 'vikram.fico@next-generpsolutions.com',
    full_name: 'Vikram Rao (SAP FICO Lead)',
    role: 'trainer' as const,
    assigned_course_ids: ['crs-fico-01'],
    tenant_id: 'staging-tenant',
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const otherTrainer = {
    id: 'usr-trainer-02',
    email: 'neha.mm@next-generpsolutions.com',
    full_name: 'Neha Patel (SAP MM Lead)',
    role: 'trainer' as const,
    assigned_course_ids: ['crs-mm-01'],
    tenant_id: 'staging-tenant',
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  // ==========================================
  // MODULE 8: RBAC & BOUNDARY ISOLATION TESTS
  // ==========================================
  describe('Module 8: RBAC Boundaries & Strict Redirections', () => {
    it('SC-TR-61: Blocks Trainer from /accounts/approvals & /accounts/fees with redirect to /academics/courses', async () => {
      for (const route of ['/accounts/approvals', '/accounts/fees']) {
        const req = createMockRequest(`http://localhost:3000${route}`, trainerVikram);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/academics/courses');
      }
    });

    it('SC-TR-62: Blocks Trainer from /accounts/expenses & /accounts/vendors with redirect to /academics/courses', async () => {
      for (const route of ['/accounts/expenses', '/accounts/vendors']) {
        const req = createMockRequest(`http://localhost:3000${route}`, trainerVikram);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/academics/courses');
      }
    });

    it('SC-TR-63: Blocks Trainer from /users staff directory with redirect to /academics/courses', async () => {
      const req = createMockRequest('http://localhost:3000/users', trainerVikram);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/academics/courses');
    });

    it('SC-TR-64: Blocks Trainer from /settings & /todos consoles with redirect to /academics/courses', async () => {
      for (const route of ['/settings', '/todos']) {
        const req = createMockRequest(`http://localhost:3000${route}`, trainerVikram);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/academics/courses');
      }
    });

    it('SC-TR-65: Blocks Trainer from /audit-logs with redirect to /academics/courses', async () => {
      const req = createMockRequest('http://localhost:3000/audit-logs', trainerVikram);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/academics/courses');
    });

    it('SC-TR-66: Blocks Trainer from /crm/leads & /admissions desks with redirect to /academics/courses', async () => {
      for (const route of ['/crm/leads', '/admissions']) {
        const req = createMockRequest(`http://localhost:3000${route}`, trainerVikram);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/academics/courses');
      }
    });

    it('SC-TR-67: Blocks Trainer from /placement portal with redirect to /academics/courses', async () => {
      const req = createMockRequest('http://localhost:3000/placement', trainerVikram);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/academics/courses');
    });

    it('SC-TR-68: Verifies Trainer permissions define ZERO administrative or financial privileges', () => {
      const perms = ROLE_PERMISSIONS.trainer;
      expect(perms).not.toContain('users:create');
      expect(perms).not.toContain('users:update');
      expect(perms).not.toContain('users:delete');
      expect(perms).not.toContain('payments:approve');
      expect(perms).not.toContain('payments:reject');
      expect(perms).not.toContain('settings:write');
      expect(perms).not.toContain('courses:write');
      expect(perms).not.toContain('batches:write');
    });

    it('SC-TR-69: Financial Immutability: Trainer cannot approve or modify verified payments', () => {
      const perms = ROLE_PERMISSIONS.trainer;
      const financialKeywords = ['finance', 'payment', 'fee', 'expense', 'vendor'];
      const hasFinancialAccess = perms.some((p) => financialKeywords.some((k) => p.includes(k)));
      expect(hasFinancialAccess).toBe(false);
    });

    it('SC-TR-70: Unauthenticated access to /academics/courses redirects to /login', async () => {
      const req = createMockRequest('http://localhost:3000/academics/courses');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });

  // ==========================================
  // MODULE 2: COURSE & SYLLABUS ACCESS CHECKS
  // ==========================================
  describe('Module 2: Course Access & Scoping', () => {
    it('allows trainer to access their assigned course (FICO)', () => {
      expect(canAccessCourse(trainerVikram, 'crs-fico-01')).toBe(true);
    });

    it('denies trainer from accessing unassigned course (MM)', () => {
      expect(canAccessCourse(trainerVikram, 'crs-mm-01')).toBe(false);
    });

    it('denies inactive trainer from accessing any course', () => {
      const inactive = { ...trainerVikram, is_active: false };
      expect(canAccessCourse(inactive, 'crs-fico-01')).toBe(false);
    });
  });

  // ==========================================
  // MODULE 3: BATCH ROSTER CHECKS
  // ==========================================
  describe('Module 3: Batch Roster Scoping', () => {
    it('allows trainer to access batch where they are the assigned instructor', () => {
      // Find a batch in store or create fixture
      const batch = store.batches[0];
      if (batch) {
        batch.trainer_id = trainerVikram.id;
        expect(canAccessBatch(trainerVikram, batch.id)).toBe(true);
      }
    });

    it('denies trainer access to batch instructed by another faculty member', () => {
      const batch = store.batches[0];
      if (batch) {
        batch.trainer_id = otherTrainer.id;
        expect(canAccessBatch(trainerVikram, batch.id)).toBe(false);
      }
    });
  });

  // ==========================================
  // MODULE 4: SESSIONS & SCHEDULING
  // ==========================================
  describe('Module 4: Session Creation & Persistence', () => {
    it('creates lecture session for an assigned batch and returns structured session record', async () => {
      const batchId = store.batches[0]?.id || 'batch-01';
      const session = await createClassSession({
        batch_id: batchId,
        topic: 'QA Staging Lecture - FBZP Config',
        session_date: '2026-12-01',
        start_time: '10:00',
        end_time: '12:00',
        meeting_provider: 'Google Meet',
        meeting_link: 'https://meet.google.com/xyz-fico-sap',
        mode: 'Online',
        status: 'Scheduled',
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.topic).toBe('QA Staging Lecture - FBZP Config');
      expect(session.status).toBe('Scheduled');

      const sessions = await getClassSessions(batchId);
      expect(sessions.some((s) => s.id === session.id)).toBe(true);
    });
  });

  // ==========================================
  // MODULE 5: ASSIGNMENT CREATION & GRADING
  // ==========================================
  describe('Module 5: Assignment Creation, Validation & Grading', () => {
    it('creates an assignment fixture with custom max marks', async () => {
      const asg = await createAssignment({
        title: 'QA Staging Assignment - Asset Classes',
        description: 'Configure depreciation keys and asset classes in staging',
        course_id: 'crs-fico-01',
        batch_id: store.batches[0]?.id || 'batch-01',
        due_date: '2026-12-31T23:59',
        maximum_marks: 50,
        created_by: trainerVikram.id,
      });

      expect(asg).toBeDefined();
      expect(asg.maximum_marks).toBe(50);
      expect(asg.title).toBe('QA Staging Assignment - Asset Classes');
    });

    it('grades a student submission with score, percentage and trainer feedback', async () => {
      const student = store.students[0];
      const asg = await createAssignment({
        title: 'Depreciation Configuration Lab',
        description: 'Test run AFAB',
        course_id: 'crs-fico-01',
        batch_id: student?.batch_id || store.batches[0]?.id || 'batch-01',
        due_date: '2026-12-31T23:59',
        maximum_marks: 50,
        created_by: trainerVikram.id,
      });

      const submission = await submitAssignment(
        asg.id,
        student?.id || 'stu-01',
        'Completed FBZP and AFAB depreciation run configuration.'
      );

      const graded = await gradeAssignmentSubmission(
        submission.id,
        45,
        'Excellent configuration work. All line items reconciled.',
        trainerVikram.id
      );

      expect(graded.status).toBe('Graded');
      expect(graded.marks_obtained).toBe(45);
      expect(graded.feedback).toContain('Excellent configuration work');
    });

    it('rejects grade exceeding maximum marks', async () => {
      const student = store.students[0];
      const asg = await createAssignment({
        title: 'Boundary Test Assignment',
        description: 'Boundary test',
        course_id: 'crs-fico-01',
        batch_id: student?.batch_id || store.batches[0]?.id || 'batch-01',
        due_date: '2026-12-31T23:59',
        maximum_marks: 50,
        created_by: trainerVikram.id,
      });

      const submission = await submitAssignment(
        asg.id,
        student?.id || 'stu-01',
        'Test submission'
      );

      await expect(
        gradeAssignmentSubmission(
          submission.id,
          60, // Exceeds 50
          'Invalid marks',
          trainerVikram.id
        )
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // MODULE 6: SAP LAB SERVERS
  // ==========================================
  describe('Module 6: SAP Lab Server Inventory & Allocations', () => {
    it('retrieves SAP systems inventory with health status', async () => {
      const systems = await getSapSystems();
      expect(Array.isArray(systems)).toBe(true);
      expect(systems.length).toBeGreaterThan(0);
      expect(systems[0].system_name).toBeDefined();
      expect(['Online', 'Offline', 'Maintenance']).toContain(systems[0].status);
    });

    it('retrieves student sandbox allocations with entitlement dates', async () => {
      const allocations = await getSapAllocations();
      expect(Array.isArray(allocations)).toBe(true);
      if (allocations.length > 0) {
        expect(allocations[0].valid_from).toBeDefined();
        expect(allocations[0].valid_to).toBeDefined();
      }
    });
  });
});
