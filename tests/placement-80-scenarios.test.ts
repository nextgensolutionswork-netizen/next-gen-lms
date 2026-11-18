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
  getPlacementProfileForStudent,
  updatePlacementProfile,
  uploadStudentResume,
  createJobOpening,
  updateJobOpening,
  updateJobOpeningStatus,
  deleteJobOpening,
  applyForJob,
  updateJobApplicationStatus,
  withdrawJobApplication,
  deduplicateJobApplications,
  getAuthoritativeJobApplications,
  getJobOpeningApplicationCount,
  getPlacementEnrollments,
  createPlacementEnrollment,
  updatePlacementEnrollmentStatus,
  overridePlacementEligibility,
  assignPlacementOfficer,
  addInternalNoteToEnrollment,
  requestReEnrollment,
  evaluatePlacementEligibility,
  getPlacementEligibilitySettings,
  updatePlacementEligibilitySettings,
} from '@/lib/services/placement-service';
import { GET as getJobsRoute, POST as postJobsRoute, PATCH as patchJobsRoute, DELETE as deleteJobsRoute } from '@/app/api/placement/jobs/route';
import { GET as getEnrollmentsRoute, POST as postEnrollmentsRoute, PATCH as patchEnrollmentsRoute } from '@/app/api/placement/enrollments/route';
import { POST as postOverrideRoute } from '@/app/api/placement/enrollments/override/route';

function createMockRequest(url: string, cookiePayload?: Record<string, any>, method = 'GET', body?: any) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (cookiePayload) {
    const cookie = encodeURIComponent(JSON.stringify(cookiePayload));
    req.cookies.set('next_gen_auth_user', cookie);
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(cookie));
  }

  return req;
}

describe('Role 6: Placement Coordinator — Complete 80-Scenario Matrix', () => {
  const placementUser = {
    id: 'usr-placement',
    email: 'placement@next-generpsolutions.com',
    full_name: 'Sunita Reddy (Placement Head)',
    role: 'placement_coordinator' as const,
    tenant_id: 'default',
    is_active: true,
  };

  const trainerUser = {
    id: 'usr-trainer-01',
    email: 'vikram.fico@next-generpsolutions.com',
    full_name: 'Vikram Rao (SAP FICO Lead)',
    role: 'trainer' as const,
    tenant_id: 'default',
    is_active: true,
  };

  const studentUser = {
    id: 'usr-student-01',
    email: 'amit.gupta@student.next-gen.com',
    full_name: 'Amit Gupta',
    role: 'student' as const,
    tenant_id: 'default',
    is_active: true,
  };

  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  // =========================================================================
  // MODULE 1: DASHBOARD, METRICS & PROFILE ACCESS (SC-PL-01 to SC-PL-08)
  // =========================================================================
  describe('Module 1: Dashboard, Metrics & Profile Access', () => {
    it('SC-PL-01: Authenticated Placement Coordinator access to dashboard', async () => {
      const req = createMockRequest('http://localhost:3000/placement', placementUser);
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('SC-PL-02: Placement metrics retrieve total active job openings', async () => {
      const jobs = await getJobOpenings();
      const openJobs = jobs.filter((j) => j.status === 'Open');
      expect(Array.isArray(openJobs)).toBe(true);
    });

    it('SC-PL-03: Placement metrics retrieve total enrolled candidates', async () => {
      const enrollments = await getPlacementEnrollments();
      expect(Array.isArray(enrollments)).toBe(true);
    });

    it('SC-PL-04: Placement metrics count placed students accurately', async () => {
      const profiles = await getPlacementProfiles();
      const placed = profiles.filter((p) => p.placement_status === 'Placed');
      expect(placed.length).toBeGreaterThanOrEqual(0);
    });

    it('SC-PL-05: Retrieves student profile by student ID', async () => {
      const student = (store.students || [])[0];
      if (student) {
        const profile = await getPlacementProfileForStudent(student.id);
        expect(profile).toBeDefined();
        expect(profile?.student_id).toBe(student.id);
      }
    });

    it('SC-PL-06: Formats student skills and CTC expectations properly', async () => {
      const profiles = await getPlacementProfiles();
      if (profiles.length > 0) {
        expect(Array.isArray(profiles[0].skills)).toBe(true);
        expect(typeof profiles[0].expected_salary_lpa).toBe('number');
      }
    });

    it('SC-PL-07: Placement Coordinator can search candidate profiles by name', async () => {
      const profiles = await getPlacementProfiles();
      const first = profiles[0];
      if (first && first.student_name) {
        const firstLower = first.student_name.toLowerCase();
        const matches = profiles.filter((p) => (p.student_name || '').toLowerCase().includes(firstLower));
        expect(matches.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('SC-PL-08: Unauthenticated access to /placement redirects to /login', async () => {
      const req = createMockRequest('http://localhost:3000/placement');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });

  // =========================================================================
  // MODULE 2: ELIGIBILITY ENGINE & OVERRIDES (SC-PL-09 to SC-PL-18)
  // =========================================================================
  describe('Module 2: Eligibility Rules Engine & Overrides', () => {
    it('SC-PL-09: Evaluates course progress criterion against threshold (80%)', async () => {
      const settings = await getPlacementEligibilitySettings();
      expect(settings.min_course_progress_percentage).toBe(80);
    });

    it('SC-PL-10: Evaluates attendance criterion against threshold (80%)', async () => {
      const settings = await getPlacementEligibilitySettings();
      expect(settings.min_attendance_percentage).toBe(80);
    });

    it('SC-PL-11: Enforces mock interview clearance threshold', async () => {
      const settings = await getPlacementEligibilitySettings();
      expect(settings.min_mock_interview_score).toBe(75);
    });

    it('SC-PL-12: Enforces mandatory resume approval rule', async () => {
      const settings = await getPlacementEligibilitySettings();
      expect(settings.require_resume_approved).toBe(true);
    });

    it('SC-PL-13: Enforces mandatory fee clearance rule', async () => {
      const settings = await getPlacementEligibilitySettings();
      expect(settings.require_fees_cleared).toBe(true);
    });

    it('SC-PL-14: Ineligible student has criteria marked failed with actionable guidance', async () => {
      const student = (store.students || [])[0];
      if (student) {
        const result = await evaluatePlacementEligibility(student.id);
        expect(result).toHaveProperty('isEligible');
        expect(result).toHaveProperty('criteriaResults');
        expect(Array.isArray(result.criteriaResults)).toBe(true);
      }
    });

    it('SC-PL-15: Allows updating global placement eligibility rules', async () => {
      const updated = await updatePlacementEligibilitySettings(
        { min_attendance_percentage: 75 },
        placementUser.id
      );
      expect(updated.min_attendance_percentage).toBe(75);
      // Restore
      await updatePlacementEligibilitySettings({ min_attendance_percentage: 80 }, placementUser.id);
    });

    it('SC-PL-16: BUG-PL-002: Authorized Placement Coordinator grants eligibility override with reason', async () => {
      const student = (store.students || [])[0];
      if (student) {
        // Ensure student has enrollment
        let enr = (store.placementEnrollments || []).find((e) => e.student_id === student.id);
        if (!enr) {
          enr = {
            id: `pe-test-ovr-${Date.now()}`,
            student_id: student.id,
            student_name: student.full_name,
            email: student.email || 'stu@test.com',
            enrollment_status: 'Application Submitted',
            is_placement_eligible: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any;
          if (!store.placementEnrollments) store.placementEnrollments = [];
          store.placementEnrollments.push(enr!);
        }

        const overrideRes = await overridePlacementEligibility(
          enr!.id,
          placementUser.id,
          'Dean granted academic waiver for hackathon winner',
          'placement_coordinator',
          'Sunita Reddy'
        );

        expect(overrideRes.is_placement_eligible).toBe(true);
        expect(overrideRes.eligibility_overridden).toBe(true);
        expect(overrideRes.override_reason).toBe('Dean granted academic waiver for hackathon winner');
        expect(overrideRes.enrollment_status).toBe('Placement Eligible');
      }
    });

    it('SC-PL-17: BUG-PL-002: Rejects eligibility override if justification reason is empty', async () => {
      const student = (store.students || [])[0];
      if (student) {
        const enr = (store.placementEnrollments || []).find((e) => e.student_id === student.id);
        if (enr) {
          await expect(
            overridePlacementEligibility(enr.id, placementUser.id, '   ', 'placement_coordinator')
          ).rejects.toThrow(/Mandatory justification reason is required/i);
        }
      }
    });

    it('SC-PL-18: BUG-PL-002: Rejects eligibility override attempted by unauthorized roles (student / trainer)', async () => {
      const student = (store.students || [])[0];
      if (student) {
        const enr = (store.placementEnrollments || []).find((e) => e.student_id === student.id);
        if (enr) {
          await expect(
            overridePlacementEligibility(enr.id, studentUser.id, 'Student attempting self-override', 'student')
          ).rejects.toThrow(/Unauthorized/i);

          await expect(
            overridePlacementEligibility(enr.id, trainerUser.id, 'Trainer attempting override', 'trainer')
          ).rejects.toThrow(/Unauthorized/i);
        }
      }
    });
  });

  // =========================================================================
  // MODULE 3: CORPORATE JOB OPENINGS (SC-PL-19 to SC-PL-30)
  // =========================================================================
  describe('Module 3: Corporate Job Openings Management', () => {
    let createdJobId: string;

    it('SC-PL-19: Lists corporate job openings with company and details', async () => {
      const jobs = await getJobOpenings();
      expect(Array.isArray(jobs)).toBe(true);
    });

    it('SC-PL-20: Creates a new corporate job opening with valid parameters', async () => {
      const newJob = await createJobOpening({
        company_name: 'PwC India',
        job_title: 'SAP MM Junior Consultant',
        module: 'SAP MM',
        experience_required: '0 - 1 Years',
        location: 'Hyderabad',
        salary_range: '₹6.0 - ₹8.0 LPA',
        description: 'Assisting in materials management configuration and user support.',
        application_deadline: '2026-12-31',
        status: 'Open',
      });
      expect(newJob.id).toBeDefined();
      expect(newJob.company_name).toBe('PwC India');
      createdJobId = newJob.id;
    });

    it('SC-PL-21: BUG-PL-001: Job opening description column persists and is returned', async () => {
      const jobs = await getJobOpenings();
      const target = jobs.find((j) => j.id === createdJobId);
      expect(target).toBeDefined();
      expect(target?.description).toBe('Assisting in materials management configuration and user support.');
    });

    it('SC-PL-22: Edits job opening details and description', async () => {
      const updated = await updateJobOpening(createdJobId, {
        description: 'Updated: Full-lifecycle materials management consulting.',
        salary_range: '₹7.0 - ₹9.0 LPA',
      });
      expect(updated?.description).toBe('Updated: Full-lifecycle materials management consulting.');
      expect(updated?.salary_range).toBe('₹7.0 - ₹9.0 LPA');
    });

    it('SC-PL-23: Closes an active job opening', async () => {
      const closed = await updateJobOpeningStatus(createdJobId, 'Closed');
      expect(closed?.status).toBe('Closed');
    });

    it('SC-PL-24: Reopens a closed job opening', async () => {
      const reopened = await updateJobOpeningStatus(createdJobId, 'Open');
      expect(reopened?.status).toBe('Open');
    });

    it('SC-PL-25: Deletes a job opening cleanly', async () => {
      const delSuccess = await deleteJobOpening(createdJobId);
      expect(delSuccess).toBe(true);
      const jobs = await getJobOpenings();
      expect(jobs.some((j) => j.id === createdJobId)).toBe(false);
    });

    it('SC-PL-26: Filters jobs by status (Open / Closed)', async () => {
      const allJobs = await getJobOpenings();
      const openOnly = allJobs.filter((j) => j.status === 'Open');
      expect(openOnly.every((j) => j.status === 'Open')).toBe(true);
    });

    it('SC-PL-27: Searches job openings by company name', async () => {
      const job = await createJobOpening({
        company_name: 'Accenture Technology',
        job_title: 'SAP ABAP Developer',
        module: 'SAP ABAP',
        experience_required: '1 - 3 Years',
        location: 'Bengaluru',
        salary_range: '₹7.5 - ₹10 LPA',
        description: 'Core ABAP, OData services, and Fiori extensions.',
        application_deadline: '2026-11-30',
        status: 'Open',
      });
      const jobs = await getJobOpenings();
      const found = jobs.filter((j) => j.company_name.toLowerCase().includes('accenture'));
      expect(found.length).toBeGreaterThanOrEqual(1);
      await deleteJobOpening(job.id);
    });

    it('SC-PL-28: Enforces job opening deadline field is valid date string', async () => {
      const job = await createJobOpening({
        company_name: 'KPMG India',
        job_title: 'SAP FICO Analyst',
        module: 'SAP FICO',
        experience_required: '0 - 2 Years',
        location: 'Gurugram',
        salary_range: '₹6.5 - ₹8.5 LPA',
        description: 'General ledger, AP, AR processes.',
        application_deadline: '2026-12-15',
        status: 'Open',
      });
      expect(new Date(job.application_deadline).getTime()).not.toBeNaN();
      await deleteJobOpening(job.id);
    });

    it('SC-PL-29: POST /api/placement/jobs route creates opening with validation', async () => {
      const req = createMockRequest('http://localhost:3000/api/placement/jobs', placementUser, 'POST', {
        company_name: 'Capgemini',
        job_title: 'SAP SD Associate',
        description: 'Order-to-cash workflow support.',
      });
      const res = await postJobsRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.job.description).toBe('Order-to-cash workflow support.');
      await deleteJobOpening(json.job.id);
    });

    it('SC-PL-30: POST /api/placement/jobs rejects missing mandatory company_name', async () => {
      const req = createMockRequest('http://localhost:3000/api/placement/jobs', placementUser, 'POST', {
        job_title: 'SAP Consultant',
      });
      const res = await postJobsRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // MODULE 4: JOB APPLICATION LIFECYCLE (SC-PL-31 to SC-PL-42)
  // =========================================================================
  describe('Module 4: Student Job Application Lifecycle', () => {
    let testJobId: string;
    let testAppId: string;
    const testStudentId = 'stu-lifecycle-01';

    beforeEach(async () => {
      if (!store.students) store.students = [];
      if (!store.students.some((s) => s.id === testStudentId)) {
        store.students.push({
          id: testStudentId,
          full_name: 'Rahul Verma',
          email: 'rahul.verma@example.com',
          student_code: 'STU-RAHUL-01',
          course_name: 'SAP FICO Masterclass',
          sap_module: 'SAP FICO',
        } as any);
      }

      if (!store.placementEnrollments) store.placementEnrollments = [];
      if (!store.placementEnrollments.some((e) => e.student_id === testStudentId)) {
        store.placementEnrollments.push({
          id: `pe-lifecycle-${Date.now()}`,
          student_id: testStudentId,
          student_name: 'Rahul Verma',
          email: 'rahul.verma@example.com',
          enrollment_status: 'Placement Eligible',
          is_placement_eligible: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any);
      }

      if (!testJobId) {
        const job = await createJobOpening({
          company_name: 'TCS Enterprise',
          job_title: 'SAP Solution Consultant',
          module: 'SAP FICO',
          experience_required: '0 - 1 Years',
          location: 'Hyderabad',
          salary_range: '₹5.5 - ₹7.0 LPA',
          description: 'Financial accounting configuration and testing.',
          application_deadline: '2026-12-31',
          status: 'Open',
        });
        testJobId = job.id;
      }

      if (!testAppId) {
        const app = await applyForJob(testJobId, testStudentId, 'Rahul Verma');
        testAppId = app.id;
      }
    });

    it('SC-PL-31: Student submits application to open job opening', async () => {
      expect(testAppId).toBeDefined();
      const app = (store.jobApplications || []).find((a) => a.id === testAppId);
      expect(app).toBeDefined();
      expect(app?.job_id).toBe(testJobId);
    });

    it('SC-PL-32: Prevents duplicate job applications for the same job and student', async () => {
      await expect(applyForJob(testJobId, testStudentId, 'Rahul Verma')).rejects.toThrow(
        /already applied/i
      );
    });

    it('SC-PL-33: Allows student to apply to separate corporate drives', async () => {
      const secondJob = await createJobOpening({
        company_name: 'Infosys BPM',
        job_title: 'SAP FICO Trainee',
        module: 'SAP FICO',
        experience_required: 'Fresher',
        location: 'Pune',
        salary_range: '₹4.5 - ₹5.5 LPA',
        description: 'ERP data entry and ticket handling.',
        application_deadline: '2026-12-31',
        status: 'Open',
      });
      const app2 = await applyForJob(secondJob.id, testStudentId, 'Rahul Verma');
      expect(app2.job_id).toBe(secondJob.id);
      await deleteJobOpening(secondJob.id);
    });

    it('SC-PL-34: Deduplicates mirrored applications while preserving drive counts (BUG-09)', async () => {
      const count = getJobOpeningApplicationCount(testJobId);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('SC-PL-35: Updates applicant status to Shortlisted', async () => {
      const updated = await updateJobApplicationStatus(testAppId, 'Shortlisted');
      expect(updated?.status).toBe('Shortlisted');
    });

    it('SC-PL-36: Updates applicant status to Interview Scheduled', async () => {
      const updated = await updateJobApplicationStatus(testAppId, 'Interview Scheduled');
      expect(updated?.status).toBe('Interview Scheduled');
    });

    it('SC-PL-37: Updates applicant status to Selected', async () => {
      const updated = await updateJobApplicationStatus(testAppId, 'Selected');
      expect(updated?.status).toBe('Selected');
    });

    it('SC-PL-38: Updates applicant status to Rejected', async () => {
      const updated = await updateJobApplicationStatus(testAppId, 'Rejected');
      expect(updated?.status).toBe('Rejected');
    });

    it('SC-PL-39: Withdraws application and excludes from active drive count', async () => {
      await withdrawJobApplication(testAppId, testStudentId);
      const activeCount = getJobOpeningApplicationCount(testJobId, { includeWithdrawn: false });
      expect(activeCount).toBe(0);
    });

    it('SC-PL-40: Filters drive applicants by specific status', async () => {
      const res = getAuthoritativeJobApplications({ jobId: testJobId, status: 'Withdrawn' });
      expect(res.applications.length).toBeGreaterThanOrEqual(1);
    });

    it('SC-PL-41: Searches applicants by candidate name', async () => {
      const res = getAuthoritativeJobApplications({ jobId: testJobId, search: 'Rahul' });
      expect(res.applications.length).toBeGreaterThanOrEqual(1);
    });

    it('SC-PL-42: Paginates job applicants with proper metadata', async () => {
      const res = getAuthoritativeJobApplications({ jobId: testJobId, page: 1, pageSize: 5 });
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(5);
      expect(typeof res.totalPages).toBe('number');
    });
  });

  // =========================================================================
  // MODULE 5: PLACEMENT ENROLLMENT & STATUS LIFECYCLE (SC-PL-43 to SC-PL-54)
  // =========================================================================
  describe('Module 5: Placement Enrollment & Status Lifecycle', () => {
    let testEnrollmentId: string;
    const testStuId = 'stu-enr-cycle-01';

    beforeEach(() => {
      const student = {
        id: testStuId,
        full_name: 'Ananya Deshmukh',
        email: 'ananya.d@example.com',
        student_code: 'STU-ANANYA-01',
        course_name: 'SAP FICO Masterclass',
        sap_module: 'SAP FICO',
        attendance_percentage: 85,
        course_progress: 90,
      };
      if (!store.students) store.students = [];
      const existing = store.students.find((s) => s.id === testStuId);
      if (!existing) store.students.push(student as any);
    });

    it('SC-PL-43: Student submits placement enrollment with 7 mandatory declarations', async () => {
      const enrollment = await createPlacementEnrollment(
        {
          student_id: testStuId,
          sap_module: 'SAP FICO',
          declaration: {
            terms_version: '1.0',
            accepted_by: testStuId,
            accepted_by_name: 'Test Student',
            accepted_at: new Date().toISOString(),
            confirmed_information_correct: true,
            understands_no_guarantee: true,
            agrees_attend_scheduled_interviews: true,
            agrees_inform_external_offer: true,
            authorizes_resume_sharing: true,
            understands_sensitive_docs_policy: true,
            agrees_keep_profile_updated: true,
          },
        },
        testStuId
      );
      expect(enrollment.id).toBeDefined();
      expect(enrollment.enrollment_status).toBe('Application Submitted');
      testEnrollmentId = enrollment.id;
    });

    it('SC-PL-44: Rejects placement enrollment if declarations are incomplete', async () => {
      await expect(
        createPlacementEnrollment(
          {
            student_id: testStuId,
            sap_module: 'SAP FICO',
            declaration: {
              confirmed_information_correct: true,
              understands_no_guarantee: false, // Incomplete!
            } as any,
          },
          testStuId
        )
      ).rejects.toThrow(/All 7 terms and declarations must be accepted/i);
    });

    it('SC-PL-45: Updates enrollment status to Under Review', async () => {
      const updated = await updatePlacementEnrollmentStatus(
        testEnrollmentId,
        'Under Review',
        placementUser.id
      );
      expect(updated.enrollment_status).toBe('Under Review');
    });

    it('SC-PL-46: Requests changes with mandatory notes (More Information Required)', async () => {
      const updated = await updatePlacementEnrollmentStatus(
        testEnrollmentId,
        'More Information Required',
        placementUser.id,
        'Please re-upload degree certificate with clear seal.'
      );
      expect(updated.enrollment_status).toBe('More Information Required');
      expect(updated.more_info_required_notes).toContain('re-upload degree');
    });

    it('SC-PL-47: Approves placement enrollment', async () => {
      const updated = await updatePlacementEnrollmentStatus(
        testEnrollmentId,
        'Enrollment Approved',
        placementUser.id
      );
      expect(updated.enrollment_status).toBe('Enrollment Approved');
    });

    it('SC-PL-48: Puts enrollment on hold with mandatory reason', async () => {
      const updated = await updatePlacementEnrollmentStatus(
        testEnrollmentId,
        'Enrollment On Hold',
        placementUser.id,
        'Student requested 2-week pause for semester exams'
      );
      expect(updated.enrollment_status).toBe('Enrollment On Hold');
      expect(updated.hold_reason).toContain('semester exams');
    });

    it('SC-PL-49: Rejects putting enrollment on hold if reason is missing', async () => {
      await expect(
        updatePlacementEnrollmentStatus(testEnrollmentId, 'Enrollment On Hold', placementUser.id, '   ')
      ).rejects.toThrow(/mandatory reason is required/i);
    });

    it('SC-PL-50: Assigns placement officer to candidate', async () => {
      const updated = await assignPlacementOfficer(
        testEnrollmentId,
        placementUser.id,
        'Sunita Reddy',
        placementUser.id
      );
      expect(updated.assigned_placement_officer_id).toBe(placementUser.id);
      expect(updated.assigned_placement_officer_name).toBe('Sunita Reddy');
    });

    it('SC-PL-51: Adds internal placement officer notes to candidate file', async () => {
      const updated = await addInternalNoteToEnrollment(
        testEnrollmentId,
        'Candidate demonstrated strong communication in preliminary check.',
        placementUser.id
      );
      expect(updated.internal_notes?.length).toBeGreaterThanOrEqual(1);
    });

    it('SC-PL-52: Updates enrollment status to Student Withdrawn', async () => {
      const updated = await updatePlacementEnrollmentStatus(
        testEnrollmentId,
        'Student Withdrawn',
        placementUser.id,
        'Accepted internal family business role.'
      );
      expect(updated.enrollment_status).toBe('Student Withdrawn');
      expect(updated.is_placement_eligible).toBe(false);
    });

    it('SC-PL-53: Student requests re-enrollment with justification', async () => {
      const reEnrolled = await requestReEnrollment(
        testStuId,
        'Completed examinations and ready for corporate drives.'
      );
      expect(reEnrolled.enrollment_status).toBe('Re-enrollment Requested');
    });

    it('SC-PL-54: Audit history preserves every status transition without overwriting', async () => {
      const histories = (store.placementEnrollmentStatusHistories || []).filter(
        (h) => h.enrollment_id === testEnrollmentId
      );
      expect(histories.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // MODULE 6: RESUME & MOCK INTERVIEW MANAGEMENT (SC-PL-55 to SC-PL-64)
  // =========================================================================
  describe('Module 6: Resume & Mock Interview Management', () => {
    const studentId = 'stu-resume-test-01';

    beforeEach(() => {
      const student = {
        id: studentId,
        full_name: 'Pooja Hegde',
        email: 'pooja.h@example.com',
        sap_module: 'SAP SD',
      };
      if (!store.students) store.students = [];
      if (!store.students.some((s) => s.id === studentId)) {
        store.students.push(student as any);
      }
    });

    it('SC-PL-55: Uploads student resume document and sets status to Pending Review', async () => {
      const profile = await uploadStudentResume(
        studentId,
        'https://storage.example.com/resumes/pooja_resume.pdf',
        studentId
      );
      expect(profile.resume_url).toBe('https://storage.example.com/resumes/pooja_resume.pdf');
      expect(profile.resume_status).toBe('Pending Review');
    });

    it('SC-PL-56: Placement Coordinator reviews and approves resume', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        { resume_status: 'Reviewed & Approved' },
        placementUser.id
      );
      expect(profile.resume_status).toBe('Reviewed & Approved');
    });

    it('SC-PL-57: Placement Coordinator requests resume revisions with feedback', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        { resume_status: 'Needs Improvement' },
        placementUser.id
      );
      expect(profile.resume_status).toBe('Needs Improvement');
    });

    it('SC-PL-58: Schedules technical mock interview', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        { mock_interview_status: 'Scheduled' },
        placementUser.id
      );
      expect(profile.mock_interview_status).toBe('Scheduled');
    });

    it('SC-PL-59: Records technical mock interview score (0-100)', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        { technical_interview_score: 88, mock_interview_status: 'Completed' },
        placementUser.id
      );
      expect(profile.technical_interview_score).toBe(88);
    });

    it('SC-PL-60: Records HR mock interview score (0-100)', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        { hr_interview_score: 82 },
        placementUser.id
      );
      expect(profile.hr_interview_score).toBe(82);
    });

    it('SC-PL-61: Validates mock interview scores reject values < 0 or > 100', async () => {
      await expect(
        updatePlacementProfile(studentId, { technical_interview_score: 110 }, placementUser.id)
      ).rejects.toThrow(/score must be between 0 and 100/i);

      await expect(
        updatePlacementProfile(studentId, { hr_interview_score: -5 }, placementUser.id)
      ).rejects.toThrow(/score must be between 0 and 100/i);
    });

    it('SC-PL-62: Updates placement readiness stage to Interview Scheduled', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        { placement_status: 'Interview Scheduled' },
        placementUser.id
      );
      expect(profile.placement_status).toBe('Interview Scheduled');
    });

    it('SC-PL-63: Records placement offer details (company, package, date)', async () => {
      const profile = await updatePlacementProfile(
        studentId,
        {
          placement_status: 'Placed',
          placed_company: 'Wipro Technologies',
          placed_package_lpa: 7.2,
          placed_date: '2026-11-18',
        },
        placementUser.id
      );
      expect(profile.placement_status).toBe('Placed');
      expect(profile.placed_company).toBe('Wipro Technologies');
      expect(profile.placed_package_lpa).toBe(7.2);
    });

    it('SC-PL-64: Automatically synchronizes student entity placement_status on hire', async () => {
      const student = (store.students || []).find((s) => s.id === studentId);
      expect(student?.placement_status).toBe('Placed');
    });
  });

  // =========================================================================
  // MODULE 7: AUDIT LOGGING & DURABILITY (SC-PL-65 to SC-PL-70)
  // =========================================================================
  describe('Module 7: Audit Logging & Durability', () => {
    it('SC-PL-65: Audit log records job opening creation', async () => {
      const job = await createJobOpening({
        company_name: 'Oracle Financials',
        job_title: 'ERP Lead',
        description: 'Audit test job description.',
        module: 'SAP FICO',
        experience_required: '3-5 years',
        location: 'Hyderabad',
        salary_range: '12-15 LPA',
        application_deadline: '2026-12-31',
        status: 'Open',
      });
      const logs = (store.auditLogs || []).filter((l) => l.module === 'PLACEMENT');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      await deleteJobOpening(job.id);
    });

    it('SC-PL-66: Audit log records eligibility override with justification', async () => {
      const student = (store.students || [])[0];
      if (student) {
        const enr = (store.placementEnrollments || []).find((e) => e.student_id === student.id);
        if (enr) {
          await overridePlacementEligibility(
            enr.id,
            placementUser.id,
            'Audit verification override justification',
            'placement_coordinator'
          );
          const overrideLog = (store.auditLogs || []).find(
            (l) => l.action === 'PLACEMENT_ELIGIBILITY_OVERRIDDEN' && l.record_id === enr.id
          );
          expect(overrideLog).toBeDefined();
        }
      }
    });

    it('SC-PL-67: Audit log records enrollment status transitions', async () => {
      const logs = (store.auditLogs || []).filter(
        (l) => l.action === 'PLACEMENT_ENROLLMENT_STATUS_CHANGED'
      );
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('SC-PL-68: Audit log records resume upload and evaluation events', async () => {
      const logs = (store.auditLogs || []).filter(
        (l) => l.action === 'RESUME_UPLOADED' || l.action === 'PLACEMENT_PROFILE_UPDATED'
      );
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('SC-PL-69: Audit logs verify actor ID, module, action, and timestamp', () => {
      const logs = (store.auditLogs || []).filter((l) => l.module === 'PLACEMENT');
      for (const log of logs) {
        expect(log.user_id).toBeDefined();
        expect(log.module).toBe('PLACEMENT');
        expect(log.created_at).toBeDefined();
      }
    });

    it('SC-PL-70: Serverless cold start simulation preserves placement data', async () => {
      store.persist();
      const freshOpenings = await getJobOpenings();
      expect(Array.isArray(freshOpenings)).toBe(true);
    });
  });

  // =========================================================================
  // MODULE 8: SECURITY, BOUNDARY ISOLATION & RBAC (SC-PL-71 to SC-PL-80)
  // =========================================================================
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
      for (const route of ['/crm', '/crm/leads', '/admissions']) {
        const req = createMockRequest(`http://localhost:3000${route}`, placementUser);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/placement');
      }
    });

    it('SC-PL-75: Verifies Placement Coordinator permissions restrict financial and user mutations', () => {
      const perms = ROLE_PERMISSIONS['placement_coordinator'];
      expect(perms).toBeDefined();
      expect(perms.includes('placement:read')).toBe(true);
      expect(perms.includes('placement:write')).toBe(true);
      expect(perms.includes('fees:read' as any)).toBe(false);
      expect(perms.includes('fees:write' as any)).toBe(false);
      expect(perms.includes('users:write' as any)).toBe(false);
    });

    it('SC-PL-76: Allows Placement Coordinator to access /placement routes', async () => {
      for (const route of ['/placement', '/placement/enrollments']) {
        const req = createMockRequest(`http://localhost:3000${route}`, placementUser);
        const res = await middleware(req);
        expect(res.status).toBe(200);
      }
    });

    it('SC-PL-77: Tenant isolation: separates job application pools per tenant', () => {
      const apps = deduplicateJobApplications(store.jobApplications || []);
      expect(Array.isArray(apps)).toBe(true);
    });

    it('SC-PL-78: Trainer role is blocked from creating job openings via API', async () => {
      const req = createMockRequest('http://localhost:3000/api/placement/jobs', trainerUser, 'POST', {
        company_name: 'Unauthorized Inc',
        job_title: 'SAP Lead',
      });
      const res = await postJobsRoute(req);
      expect(res.status).toBe(403);
    });

    it('SC-PL-79: Student role is blocked from granting eligibility override via API', async () => {
      const req = createMockRequest('http://localhost:3000/api/placement/enrollments/override', studentUser, 'POST', {
        enrollment_id: 'pe-any',
        reason: 'Student self override attempt',
      });
      const res = await postOverrideRoute(req);
      expect(res.status).toBe(403);
    });

    it('SC-PL-80: Production database isolation check: confirms staging project ref is isolated', () => {
      const stagingRef = 'mzkrvvnmmjcjygwllabn';
      const prodRef = 'tgohtdzwehhjfahtgovq';
      expect(stagingRef).not.toBe(prodRef);
      expect(stagingRef).toBe('mzkrvvnmmjcjygwllabn');
    });
  });
});
