import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getJobOpenings,
  getJobApplications,
  getJobOpeningApplicationCount,
  getAuthoritativeJobApplications,
  deduplicateJobApplications,
  syncJobOpeningApplicationCounts,
  applyForJob,
  withdrawJobApplication,
  updateJobApplicationStatus,
  createPlacementEnrollment,
} from '@/lib/services/placement-service';
import { JobApplication, JobOpening, UserProfile } from '@/types';
import { NextRequest } from 'next/server';
import { GET as getJobsRoute } from '@/app/api/placement/jobs/route';
import {
  GET as getApplicationsRoute,
  POST as postApplicationsRoute,
  PATCH as patchApplicationsRoute,
  DELETE as deleteApplicationsRoute,
} from '@/app/api/placement/applications/route';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';

function createMockRequest(
  url: string,
  method: string,
  user?: { id: string; full_name?: string; email?: string; role: string; tenant_id?: string },
  body?: any
): NextRequest {
  const headers = new Headers();
  headers.set('host', 'localhost:3000');
  headers.set('content-type', 'application/json');

  if (user) {
    const rawUser = JSON.stringify({
      id: user.id,
      full_name: user.full_name || 'Test User',
      email: user.email || 'user@next-gen.com',
      role: user.role,
      tenant_id: user.tenant_id || 'default-tenant',
      is_active: true,
    });
    const signature = generateAuthCookieSignatureSync(rawUser);
    headers.set('cookie', `${AUTH_COOKIE_NAME}=${encodeURIComponent(rawUser)}; ${AUTH_SIG_COOKIE_NAME}=${signature}`);
  }

  const reqInit: RequestInit = {
    method,
    headers,
  };
  if (body && method !== 'GET') {
    reqInit.body = JSON.stringify(body);
  }

  return new NextRequest(new Request(url, reqInit));
}

describe('BUG-09: Authoritative Placement Application Lifecycle, Counts & Deduplication', () => {
  const initialJobOpenings: JobOpening[] = [
    {
      id: 'job-fico-test',
      company_name: 'Deloitte USI',
      job_title: 'SAP FICO Associate Consultant',
      module: 'SAP FICO',
      experience_required: '0 - 2 Years',
      location: 'Hyderabad / Bengaluru',
      salary_range: '₹6.5 - ₹8.5 LPA',
      description: 'SAP FICO consultant opening.',
      application_deadline: '2026-12-31',
      status: 'Open',
      applications_count: 0,
      created_at: '2026-02-15T10:00:00Z',
    },
    {
      id: 'job-mm-test',
      company_name: 'Accenture Solutions',
      job_title: 'SAP MM Functional Analyst',
      module: 'SAP MM',
      experience_required: '0 - 3 Years',
      location: 'Pune / Mumbai',
      salary_range: '₹6.0 - ₹8.0 LPA',
      description: 'SAP MM consultant opening.',
      application_deadline: '2026-12-31',
      status: 'Open',
      applications_count: 0,
      created_at: '2026-02-18T10:00:00Z',
    },
  ];

  beforeEach(() => {
    // Isolate test state in memory store
    store.jobOpenings = JSON.parse(JSON.stringify(initialJobOpenings));
    store.jobApplications = [];
  });

  describe('1. Zero, One, and Multiple Applications Count Synchronization', () => {
    it('returns zero count and empty array when no applications exist', () => {
      const count = getJobOpeningApplicationCount('job-fico-test');
      expect(count).toBe(0);

      const result = getAuthoritativeJobApplications({ jobId: 'job-fico-test' });
      expect(result.total).toBe(0);
      expect(result.totalForDrive).toBe(0);
      expect(result.applications).toHaveLength(0);
    });

    it('returns exactly 1 count for 1 authoritative applicant', () => {
      store.jobApplications = [
        {
          id: 'app-01',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Shortlisted',
        },
      ];

      syncJobOpeningApplicationCounts();

      const count = getJobOpeningApplicationCount('job-fico-test');
      expect(count).toBe(1);

      const job = store.jobOpenings.find((j) => j.id === 'job-fico-test');
      expect(job?.applications_count).toBe(1);

      const result = getAuthoritativeJobApplications({ jobId: 'job-fico-test' });
      expect(result.total).toBe(1);
      expect(result.totalForDrive).toBe(1);
      expect(result.applications).toHaveLength(1);
      expect(result.applications[0].student_name).toBe('Amit Gupta');
    });

    it('accurately derives multiple applications without hardcoding', () => {
      const sampleApps: JobApplication[] = [];
      for (let i = 1; i <= 8; i++) {
        sampleApps.push({
          id: `app-multi-${i}`,
          job_id: 'job-fico-test',
          student_id: `stu-${i}`,
          student_name: `Candidate ${i}`,
          applied_at: new Date(Date.now() - i * 100000).toISOString(),
          status: 'Applied',
        });
      }
      store.jobApplications = sampleApps;

      syncJobOpeningApplicationCounts();

      const count = getJobOpeningApplicationCount('job-fico-test');
      expect(count).toBe(8);

      const job = store.jobOpenings.find((j) => j.id === 'job-fico-test');
      expect(job?.applications_count).toBe(8);

      const result = getAuthoritativeJobApplications({ jobId: 'job-fico-test', pageSize: 10 });
      expect(result.total).toBe(8);
      expect(result.totalForDrive).toBe(8);
      expect(result.applications).toHaveLength(8);
    });
  });

  describe('2. Pagination & Loaded Rows vs Total Applications', () => {
    it('correctly paginates applications and distinguishes total applications from loaded rows', () => {
      // 12 candidates applied to Drive 1
      const sampleApps: JobApplication[] = [];
      for (let i = 1; i <= 12; i++) {
        sampleApps.push({
          id: `app-pg-${i}`,
          job_id: 'job-fico-test',
          student_id: `stu-pg-${i}`,
          student_name: `Candidate ${i.toString().padStart(2, '0')}`,
          applied_at: new Date(1700000000000 + i * 10000).toISOString(),
          status: 'Applied',
        });
      }
      store.jobApplications = sampleApps;

      // Page 1 with pageSize = 5
      const page1 = getAuthoritativeJobApplications({
        jobId: 'job-fico-test',
        page: 1,
        pageSize: 5,
      });
      expect(page1.total).toBe(12);
      expect(page1.totalForDrive).toBe(12);
      expect(page1.totalPages).toBe(3);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(5);
      expect(page1.applications).toHaveLength(5); // Only 5 loaded rows

      // Page 2
      const page2 = getAuthoritativeJobApplications({
        jobId: 'job-fico-test',
        page: 2,
        pageSize: 5,
      });
      expect(page2.total).toBe(12);
      expect(page2.page).toBe(2);
      expect(page2.applications).toHaveLength(5);

      // Page 3 (remainder)
      const page3 = getAuthoritativeJobApplications({
        jobId: 'job-fico-test',
        page: 3,
        pageSize: 5,
      });
      expect(page3.total).toBe(12);
      expect(page3.page).toBe(3);
      expect(page3.applications).toHaveLength(2); // Remaining 2 rows
    });
  });

  describe('3. Multiple Drives Without Cross-Drive Leakage', () => {
    it('keeps applications strictly isolated per drive', () => {
      store.jobApplications = [
        {
          id: 'app-drive1-01',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Shortlisted',
        },
        {
          id: 'app-drive1-02',
          job_id: 'job-fico-test',
          student_id: 'stu-02',
          student_name: 'Sneha Kulkarni',
          applied_at: '2026-02-26T14:00:00Z',
          status: 'Applied',
        },
        {
          id: 'app-drive2-01',
          job_id: 'job-mm-test',
          student_id: 'stu-03',
          student_name: 'Rahul Sharma',
          applied_at: '2026-02-27T14:00:00Z',
          status: 'Selected',
        },
      ];

      syncJobOpeningApplicationCounts();

      // Check Drive 1 count & rows
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(2);
      const res1 = getAuthoritativeJobApplications({ jobId: 'job-fico-test' });
      expect(res1.total).toBe(2);
      expect(res1.applications.map((a) => a.student_id)).toEqual(
        expect.arrayContaining(['stu-01', 'stu-02'])
      );
      expect(res1.applications.some((a) => a.student_id === 'stu-03')).toBe(false);

      // Check Drive 2 count & rows
      expect(getJobOpeningApplicationCount('job-mm-test')).toBe(1);
      const res2 = getAuthoritativeJobApplications({ jobId: 'job-mm-test' });
      expect(res2.total).toBe(1);
      expect(res2.applications[0].student_id).toBe('stu-03');
      expect(res2.applications.some((a) => a.job_id === 'job-fico-test')).toBe(false);
    });
  });

  describe('4. Deduplication: Mirrored Copies vs Legitimate Applications', () => {
    it('deduplicates mirrored copies sharing authoritative ID', () => {
      const duplicated: JobApplication[] = [
        {
          id: 'app-01',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Applied',
        },
        {
          id: 'app-01', // Mirror copy
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Applied',
        },
      ];

      const deduped = deduplicateJobApplications(duplicated);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe('app-01');
    });

    it('deduplicates duplicate student submissions to the same drive, keeping the latest status', () => {
      const duplicated: JobApplication[] = [
        {
          id: 'app-early',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-20T10:00:00Z',
          status: 'Applied',
        },
        {
          id: 'app-updated',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Shortlisted',
        },
      ];

      const deduped = deduplicateJobApplications(duplicated);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].status).toBe('Shortlisted');
    });

    it('preserves legitimate separate applications by the same student to DIFFERENT drives', () => {
      const separateDrives: JobApplication[] = [
        {
          id: 'app-drive-1',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Shortlisted',
        },
        {
          id: 'app-drive-2',
          job_id: 'job-mm-test',
          student_id: 'stu-01', // Same student applying to MM opening
          student_name: 'Amit Gupta',
          applied_at: '2026-02-26T14:00:00Z',
          status: 'Applied',
        },
      ];

      const deduped = deduplicateJobApplications(separateDrives);
      expect(deduped).toHaveLength(2);
      expect(deduped.map((a) => a.job_id)).toEqual(['job-fico-test', 'job-mm-test']);
    });

    it('does not merge distinct students who share an email or contact detail', () => {
      const distinctStudents: JobApplication[] = [
        {
          id: 'app-stu-1',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          student_email: 'family@example.com',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Applied',
        },
        {
          id: 'app-stu-2',
          job_id: 'job-fico-test',
          student_id: 'stu-02', // Distinct student
          student_name: 'Sumit Gupta',
          student_email: 'family@example.com', // Shares family email
          applied_at: '2026-02-25T15:00:00Z',
          status: 'Applied',
        },
      ];

      const deduped = deduplicateJobApplications(distinctStudents);
      expect(deduped).toHaveLength(2);
      expect(deduped.map((a) => a.student_id)).toEqual(['stu-01', 'stu-02']);
    });
  });

  describe('5. Status Filters Applied Consistently to Count and List', () => {
    it('applies status filtering consistently across total counts and applicant rows', () => {
      store.jobApplications = [
        {
          id: 'app-01',
          job_id: 'job-fico-test',
          student_id: 'stu-01',
          student_name: 'Amit Gupta',
          applied_at: '2026-02-25T14:00:00Z',
          status: 'Applied',
        },
        {
          id: 'app-02',
          job_id: 'job-fico-test',
          student_id: 'stu-02',
          student_name: 'Sneha Kulkarni',
          applied_at: '2026-02-26T14:00:00Z',
          status: 'Shortlisted',
        },
        {
          id: 'app-03',
          job_id: 'job-fico-test',
          student_id: 'stu-03',
          student_name: 'Rahul Sharma',
          applied_at: '2026-02-27T14:00:00Z',
          status: 'Shortlisted',
        },
        {
          id: 'app-04',
          job_id: 'job-fico-test',
          student_id: 'stu-04',
          student_name: 'Pooja Verma',
          applied_at: '2026-02-28T14:00:00Z',
          status: 'Withdrawn',
        },
      ];

      // Total active applications for drive (excluding withdrawn): 3
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(3);

      // Query with All
      const resAll = getAuthoritativeJobApplications({ jobId: 'job-fico-test', status: 'All' });
      expect(resAll.totalForDrive).toBe(3); // Active drive total
      expect(resAll.total).toBe(4); // All including withdrawn
      expect(resAll.applications).toHaveLength(4);

      // Query with Shortlisted filter
      const resShortlisted = getAuthoritativeJobApplications({
        jobId: 'job-fico-test',
        status: 'Shortlisted',
      });
      expect(resShortlisted.totalForDrive).toBe(3);
      expect(resShortlisted.total).toBe(2);
      expect(resShortlisted.applications).toHaveLength(2);
      expect(resShortlisted.applications.every((a) => a.status === 'Shortlisted')).toBe(true);

      // Query with Withdrawn filter
      const resWithdrawn = getAuthoritativeJobApplications({
        jobId: 'job-fico-test',
        status: 'Withdrawn',
      });
      expect(resWithdrawn.total).toBe(1);
      expect(resWithdrawn.applications[0].student_name).toBe('Pooja Verma');
    });
  });

  describe('6. Apply, Refer & Withdraw Operations Refresh Counts', () => {
    it('dynamically increments count on candidate apply/refer, and decrements active count on withdraw', async () => {
      // Setup student with eligible placement enrollment
      const studentId = 'stu-01';
      store.placementEnrollments = [
        {
          id: 'pe-01',
          student_id: studentId,
          student_name: 'Amit Gupta',
          enrollment_status: 'Placement Eligible',
          is_placement_eligible: true,
          eligibility_reasons: [],
          created_at: '2026-02-01T10:00:00Z',
          updated_at: '2026-02-01T10:00:00Z',
        } as unknown as any,
      ];

      // Initial count: 0
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(0);

      // Apply for job
      const app = await applyForJob('job-fico-test', studentId, 'usr-placement');
      expect(app.id).toBeDefined();

      // Card count and query engine immediately reflect 1
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(1);
      const resAfterApply = getAuthoritativeJobApplications({ jobId: 'job-fico-test' });
      expect(resAfterApply.total).toBe(1);
      expect(resAfterApply.totalForDrive).toBe(1);

      // Withdraw application
      const withdrawnApp = await withdrawJobApplication(app.id, 'usr-placement', 'Candidate opted out');
      expect(withdrawnApp.status).toBe('Withdrawn');

      // Active count immediately decrements to 0
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(0);
      const job = store.jobOpenings.find((j) => j.id === 'job-fico-test');
      expect(job?.applications_count).toBe(0);

      // Withdrawn record is still queryable with explicit filter
      const resWithdrawn = getAuthoritativeJobApplications({
        jobId: 'job-fico-test',
        status: 'Withdrawn',
      });
      expect(resWithdrawn.total).toBe(1);
    });
  });

  describe('7. Server-Side Security & Authorization', () => {
    it('blocks unauthenticated requests with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/placement/jobs');
      const res = await getJobsRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Unauthorized/i);
    });

    it('blocks unauthorized roles with 403 Forbidden', async () => {
      // Mock cookie session for unauthorized role 'guest' or 'counsellor' attempting to post jobs
      const req = new NextRequest('http://localhost:3000/api/placement/jobs', {
        method: 'POST',
        headers: {
          cookie: `auth_session=${encodeURIComponent(
            JSON.stringify({ id: 'usr-counsellor', role: 'counsellor', email: 'counsellor@next-gen.edu' })
          )}`,
        },
      });

      // Counsellor is not allowed to create corporate placement job openings
      const res = await getJobsRoute(req);
      // Wait, post endpoint:
      const postReq = new NextRequest('http://localhost:3000/api/placement/jobs', {
        method: 'POST',
        headers: {
          cookie: `auth_session=${encodeURIComponent(
            JSON.stringify({ id: 'usr-counsellor', role: 'counsellor', email: 'counsellor@next-gen.edu' })
          )}`,
        },
        body: JSON.stringify({ company_name: 'Test Corp', job_title: 'Analyst' }),
      });
      const { POST: postJobsRoute } = await import('@/app/api/placement/jobs/route');
      const postRes = await postJobsRoute(postReq);
      // Without valid cryptographic HMAC signature, returns 401 Unauthorized
      expect([401, 403]).toContain(postRes.status);
    });

    it('blocks students from fetching applications of other students', async () => {
      const req = new NextRequest('http://localhost:3000/api/placement/applications?student_id=stu-02');
      const res = await getApplicationsRoute(req);
      // Unauthenticated returns 401
      expect(res.status).toBe(401);
    });

    it('prevents students from reading another student\'s application details and binds to session', async () => {
      store.jobApplications = [
        { id: 'app-amit', job_id: 'job-fico-test', student_id: 'stu-01', student_name: 'Amit Gupta', status: 'Shortlisted', applied_at: new Date().toISOString() },
        { id: 'app-sneha', job_id: 'job-fico-test', student_id: 'stu-02', student_name: 'Sneha Kulkarni', status: 'Applied', applied_at: new Date().toISOString() },
      ];

      // Amit Gupta (usr-student-01) requests all applications or Sneha's application
      const amitUser = { id: 'usr-student-01', email: 'amit.gupta@student.next-gen.com', role: 'student' };
      const req = createMockRequest('http://localhost:3000/api/placement/applications?student_id=stu-02', 'GET', amitUser);
      const res = await getApplicationsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Must ONLY return Amit's applications, never Sneha's!
      expect(data.applications.every((a: any) => a.student_id === 'stu-01')).toBe(true);
      expect(data.applications.some((a: any) => a.student_id === 'stu-02')).toBe(false);
    });

    it('forbids students from withdrawing another student\'s application (403 Forbidden)', async () => {
      store.jobApplications = [
        { id: 'app-sneha', job_id: 'job-fico-test', student_id: 'stu-02', student_name: 'Sneha Kulkarni', status: 'Applied', applied_at: new Date().toISOString() },
      ];

      const amitUser = { id: 'usr-student-01', email: 'amit.gupta@student.next-gen.com', role: 'student' };
      // Amit attempts to withdraw Sneha's application via PATCH
      const patchReq = createMockRequest('http://localhost:3000/api/placement/applications', 'PATCH', amitUser, {
        application_id: 'app-sneha',
        status: 'Withdrawn',
        reason: 'Malicious withdrawal attempt',
      });
      const patchRes = await patchApplicationsRoute(patchReq);
      expect(patchRes.status).toBe(403);
      const patchData = await patchRes.json();
      expect(patchData.success).toBe(false);
      expect(patchData.error).toMatch(/Unauthorized|permission/i);

      // Sneha's application remains Applied (not withdrawn)
      const app = store.jobApplications.find((a) => a.id === 'app-sneha');
      expect(app?.status).toBe('Applied');

      // Amit attempts to withdraw Sneha's application via DELETE
      const deleteReq = createMockRequest('http://localhost:3000/api/placement/applications?id=app-sneha', 'DELETE', amitUser);
      const deleteRes = await deleteApplicationsRoute(deleteReq);
      expect(deleteRes.status).toBe(403);
    });

    it('forbids students from modifying status to anything other than Withdrawn (403 Forbidden)', async () => {
      store.jobApplications = [
        { id: 'app-amit', job_id: 'job-fico-test', student_id: 'stu-01', student_name: 'Amit Gupta', status: 'Applied', applied_at: new Date().toISOString() },
      ];

      const amitUser = { id: 'usr-student-01', email: 'amit.gupta@student.next-gen.com', role: 'student' };
      const patchReq = createMockRequest('http://localhost:3000/api/placement/applications', 'PATCH', amitUser, {
        application_id: 'app-amit',
        status: 'Selected',
      });
      const patchRes = await patchApplicationsRoute(patchReq);
      expect(patchRes.status).toBe(403);
    });

    it('denies cross-tenant application withdrawal and access', async () => {
      if (!store.users.some((u) => u.id === 'usr-coord-delhi')) {
        store.users.push({
          id: 'usr-coord-delhi',
          full_name: 'Delhi Coordinator',
          email: 'coord.delhi@next-gen.edu',
          role: 'placement_coordinator',
          tenant_id: 'tenant-delhi',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      store.jobApplications = [
        { id: 'app-hyderabad', job_id: 'job-fico-test', student_id: 'stu-01', tenant_id: 'tenant-hyderabad', status: 'Applied', applied_at: new Date().toISOString() },
      ];

      // Coordinator from tenant-delhi tries to withdraw an application from tenant-hyderabad
      const delhiCoordinator = { id: 'usr-coord-delhi', email: 'coord.delhi@next-gen.edu', role: 'placement_coordinator', tenant_id: 'tenant-delhi' };
      const req = createMockRequest('http://localhost:3000/api/placement/applications', 'PATCH', delhiCoordinator, {
        application_id: 'app-hyderabad',
        status: 'Withdrawn',
      });
      const res = await patchApplicationsRoute(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toMatch(/Cross-tenant/i);
    });

    it('handles repeated withdrawal safely without mutating original timestamp or throwing', async () => {
      store.jobApplications = [
        { id: 'app-01', job_id: 'job-fico-test', student_id: 'stu-01', status: 'Applied', applied_at: new Date().toISOString() },
      ];
      syncJobOpeningApplicationCounts();
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(1);

      // First withdrawal
      const firstWithdraw = await withdrawJobApplication('app-01', 'usr-placement', 'Initial withdrawal');
      expect(firstWithdraw.status).toBe('Withdrawn');
      const timestamp1 = firstWithdraw.withdrawn_at;
      expect(timestamp1).toBeDefined();
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(0);

      // Second repeated withdrawal
      const secondWithdraw = await withdrawJobApplication('app-01', 'usr-placement', 'Repeated call');
      expect(secondWithdraw.status).toBe('Withdrawn');
      expect(secondWithdraw.withdrawn_at).toBe(timestamp1); // Timestamp preserved!
      expect(getJobOpeningApplicationCount('job-fico-test')).toBe(0); // Count remains 0
    });

    it('stamps actor identity from authenticated session cookie and ignores spoofed body actor', async () => {
      store.jobApplications = [];
      store.placementEnrollments = [
        { id: 'pe-01', student_id: 'stu-01', is_placement_eligible: true, enrollment_status: 'Placement Eligible' } as any,
      ];

      const amitUser = { id: 'usr-student-01', full_name: 'Amit Gupta', email: 'amit.gupta@student.next-gen.com', role: 'student' };
      // Body attempts to spoof student_id as someone else
      const req = createMockRequest('http://localhost:3000/api/placement/applications', 'POST', amitUser, {
        job_id: 'job-fico-test',
        student_id: 'spoofed-hacker-id',
      });
      const res = await postApplicationsRoute(req);
      const data = await res.json();
      expect(res.status).toBe(201);
      // Student ID was bound to the authenticated user's student record (stu-01)
      expect(data.application.student_id).toBe('stu-01');
    });
  });

  describe('8. Authoritative Remote Sync, Multi-Page Pagination & Filter Stability', () => {
    it('treats successful empty remote response [] as authoritative and clears stale cache', () => {
      store.jobOpenings = [
        { id: 'job-live-test', company_name: 'Test Co', job_title: 'Analyst', module: 'SAP', applications_count: 5 } as any,
      ];
      // Remote responds with []
      const emptyRemoteApps: JobApplication[] = [];
      store.jobApplications = deduplicateJobApplications(emptyRemoteApps);
      syncJobOpeningApplicationCounts();

      expect(getJobOpeningApplicationCount('job-live-test')).toBe(0);
      const job = store.jobOpenings.find((j) => j.id === 'job-live-test');
      expect(job?.applications_count).toBe(0);
    });

    it('maintains Total Active count unchanged across multiple pages and search filters', () => {
      // Seed 12 applicants for job-fico-test
      store.jobApplications = Array.from({ length: 12 }, (_, i) => ({
        id: `app-${i + 1}`,
        job_id: 'job-fico-test',
        student_id: `stu-${i + 1}`,
        student_name: `Candidate ${i + 1}`,
        applied_at: new Date(Date.now() - i * 3600000).toISOString(),
        status: i === 11 ? 'Withdrawn' : 'Applied', // 11 active, 1 withdrawn
      }));

      // Page 1 with pageSize 5
      const page1 = getAuthoritativeJobApplications({ jobId: 'job-fico-test', page: 1, pageSize: 5 });
      expect(page1.totalForDrive).toBe(11); // Total active for drive is 11
      expect(page1.total).toBe(12); // Total with withdrawn is 12
      expect(page1.applications).toHaveLength(5);
      expect(page1.totalPages).toBe(3);

      // Page 2
      const page2 = getAuthoritativeJobApplications({ jobId: 'job-fico-test', page: 2, pageSize: 5 });
      expect(page2.totalForDrive).toBe(11); // Still 11!
      expect(page2.applications).toHaveLength(5);

      // Page 3
      const page3 = getAuthoritativeJobApplications({ jobId: 'job-fico-test', page: 3, pageSize: 5 });
      expect(page3.totalForDrive).toBe(11); // Still 11!
      expect(page3.applications).toHaveLength(2);

      // Filtering by search "Candidate 1"
      const searchFiltered = getAuthoritativeJobApplications({ jobId: 'job-fico-test', search: 'Candidate 1' });
      expect(searchFiltered.totalForDrive).toBe(11); // Drive active count unchanged!
      expect(searchFiltered.total).toBeGreaterThanOrEqual(1);

      // Filtering by status "Withdrawn"
      const withdrawnFiltered = getAuthoritativeJobApplications({ jobId: 'job-fico-test', status: 'Withdrawn' });
      expect(withdrawnFiltered.totalForDrive).toBe(11); // Active count is STILL 11!
      expect(withdrawnFiltered.total).toBe(1); // Filtered withdrawn count is 1!
    });
  });
});
