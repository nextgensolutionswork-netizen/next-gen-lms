import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { ROLE_PERMISSIONS } from '@/lib/auth/rbac';
import {
  getJobOpenings,
  getJobApplications,
  getPlacementProfiles,
  createJobOpening,
  updateJobOpeningStatus,
  applyForJob,
  updateJobApplicationStatus,
  getPlacementEnrollments,
  evaluatePlacementEligibility,
  getPlacementEligibilitySettings,
} from '@/lib/services/placement-service';

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

describe('Role 6: Placement Coordinator — Comprehensive RBAC & Domain Integrity Suite', () => {
  const placementUser = {
    id: '66666666-6666-6666-6666-666666666666',
    email: 'placement@next-generpsolutions.com',
    full_name: 'Sunita Reddy (Placement Head)',
    role: 'placement_coordinator' as const,
    tenant_id: 'default',
    is_active: true,
  };

  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  // ==========================================
  // MODULE 8: RBAC & BOUNDARY ISOLATION
  // ==========================================
  describe('Module 8: Security & Boundary Isolation', () => {
    it('SC-PL-71: Blocks Placement Coordinator from /accounts/* financial routes with redirect to /placement', async () => {
      const restrictedRoutes = [
        '/accounts/fees',
        '/accounts/payments',
        '/accounts/reports',
        '/accounts/approvals',
        '/accounts/expenses',
        '/accounts/vendors',
      ];
      for (const route of restrictedRoutes) {
        const req = createMockRequest(`http://localhost:3000${route}`, placementUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/placement');
      }
    });

    it('SC-PL-72: Blocks Placement Coordinator from /users staff management with redirect to /placement', async () => {
      const req = createMockRequest('http://localhost:3000/users', placementUser);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/placement');
    });

    it('SC-PL-73: Blocks Placement Coordinator from /settings, /audit-logs, and /todos consoles', async () => {
      for (const route of ['/settings', '/audit-logs', '/todos']) {
        const req = createMockRequest(`http://localhost:3000${route}`, placementUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/placement');
      }
    });

    it('SC-PL-74: Blocks Placement Coordinator from /crm/* and /admissions with redirect to /placement', async () => {
      for (const route of ['/crm/leads', '/admissions']) {
        const req = createMockRequest(`http://localhost:3000${route}`, placementUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/placement');
      }
    });

    it('SC-PL-75: Verifies Placement Coordinator permissions restrict financial and user mutations', () => {
      const perms = ROLE_PERMISSIONS.placement_coordinator;
      expect(perms).not.toContain('payments:approve');
      expect(perms).not.toContain('payments:reject');
      expect(perms).not.toContain('payments:create');
      expect(perms).not.toContain('users:create');
      expect(perms).not.toContain('users:update');
      expect(perms).not.toContain('users:delete');
      expect(perms).not.toContain('settings:write');
    });

    it('SC-PL-76: Allows Placement Coordinator to access /placement routes', async () => {
      for (const route of ['/placement', '/placement/enrollments']) {
        const req = createMockRequest(`http://localhost:3000${route}`, placementUser);
        const res = await middleware(req);
        expect(res.status).toBe(200);
      }
    });

    it('SC-PL-80: BUG-09 Regression: Job opening application count matches authoritative application records', async () => {
      const jobs = await getJobOpenings();
      const apps = await getJobApplications();

      for (const job of jobs) {
        const matchingApps = apps.filter((a) => a.job_id === job.id);
        expect(job.applications_count ?? 0).toBe(matchingApps.length);
      }
    });
  });

  // ==========================================
  // MODULE 2 & 3: ELIGIBILITY & JOB OPENINGS
  // ==========================================
  describe('Module 2 & 3: Eligibility Rules and Corporate Job Drives', () => {
    it('SC-PL-09 & SC-PL-11: Retrieves placement-eligible students with course completion check', async () => {
      const enrollments = await getPlacementEnrollments();
      expect(Array.isArray(enrollments)).toBe(true);

      const settings = await getPlacementEligibilitySettings();
      expect(settings).toBeDefined();
      expect(settings.min_course_progress_percentage).toBeGreaterThanOrEqual(0);
    });

    it('SC-PL-20 & SC-PL-21: Creates a new corporate job opening with validated fields', async () => {
      const newJob = await createJobOpening({
        job_title: 'SAP FICO Associate Consultant',
        company_name: 'Deloitte India (QA Staging Drive)',
        module: 'SAP FICO',
        experience_required: '0 - 1 Years',
        location: 'Bengaluru / Hyderabad',
        salary_range: '₹6.5 - ₹8.0 LPA',
        application_deadline: '2026-12-31',
        description: 'Enterprise SAP S/4HANA Finance implementation project.',
        status: 'Open',
      });

      expect(newJob).toBeDefined();
      expect(newJob.id).toBeDefined();
      expect(newJob.status).toBe('Open');
      expect(newJob.applications_count).toBe(0);
      expect(newJob.company_name).toBe('Deloitte India (QA Staging Drive)');
    });

    it('SC-PL-23: Closes or deactivates an active job opening', async () => {
      const jobs = await getJobOpenings();
      const targetJob = jobs[0];
      if (targetJob) {
        const updated = await updateJobOpeningStatus(targetJob.id, 'Closed', placementUser.id);
        expect(updated.status).toBe('Closed');
      }
    });
  });

  // ==========================================
  // MODULE 4: PLACEMENT APPLICATIONS
  // ==========================================
  describe('Module 4: Student Job Application Lifecycle', () => {
    it('SC-PL-32 & SC-PL-33: Creates an application and prevents duplicate applications', async () => {
      const jobs = await getJobOpenings();
      const openJob = jobs.find((j) => j.status === 'Open') || jobs[0];
      const student = store.students[0];

      if (openJob && student) {
        // Ensure student has a valid placement enrollment
        let enrollment = store.placementEnrollments.find((e) => e.student_id === student.id);
        if (!enrollment) {
          enrollment = {
            id: `pe-${Date.now()}`,
            student_id: student.id,
            student_name: student.full_name,
            course_id: student.course_id || 'crs-fico-01',
            batch_id: student.batch_id || 'bch-fico-01',
            enrollment_status: 'Enrollment Approved',
            is_placement_eligible: true,
            registered_at: new Date().toISOString(),
            mandatory_documents: [],
            eligibility_snapshot: {
              attendance_percentage: 95,
              course_progress_percentage: 100,
              mock_interview_score: 85,
              assessments_cleared: true,
              fees_cleared: true,
              resume_approved: true,
              documents_verified: true,
              is_eligible: true,
              disqualification_reasons: [],
            },
            notes: 'Test enrollment',
          };
          store.placementEnrollments.push(enrollment);
        } else {
          enrollment.enrollment_status = 'Enrollment Approved';
          enrollment.is_placement_eligible = true;
        }

        // Clean up previous application for clean idempotency
        store.jobApplications = (store.jobApplications || []).filter(
          (a) => !(a.job_id === openJob.id && a.student_id === student.id)
        );

        // First application should succeed
        const app = await applyForJob(openJob.id, student.id, 'Candidate referred by placement coordinator');
        expect(app).toBeDefined();
        expect(app.job_id).toBe(openJob.id);
        expect(app.student_id).toBe(student.id);

        // Duplicate application should be prevented or throw
        await expect(
          applyForJob(openJob.id, student.id, 'Duplicate application attempt')
        ).rejects.toThrow(/already applied/i);
      }
    });

    it('SC-PL-35: Updates application status across the recruitment pipeline', async () => {
      const apps = await getJobApplications();
      const targetApp = apps[0];
      if (targetApp) {
        const updated = await updateJobApplicationStatus(
          targetApp.id,
          'Shortlisted',
          'Candidate profile shortlisted for technical round'
        );
        expect(updated.status).toBe('Shortlisted');
      }
    });
  });
});
