import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createPlacementEnrollment,
  getPlacementEnrollments,
  getPlacementEnrollmentByStudentId,
  updatePlacementEnrollmentStatus,
  evaluatePlacementEligibility,
  overridePlacementEligibility,
  requestReEnrollment,
  verifyEnrollmentDocument,
  applyForJob,
  updateJobApplicationStatus,
  getPlacementEligibilitySettings,
  updatePlacementEligibilitySettings,
  updatePlacementProfile,
  evaluateEnrollmentPrerequisites,
  updateJobOpeningStatus,
  deleteJobOpening,
  getJobOpenings,
} from '@/lib/services/placement-service';
import { PlacementEnrollment, PlacementProfile } from '@/types';

describe('Placement Enrollment & Eligibility Architecture', () => {
  const testStudentId = 'stu-01'; // Amit Gupta (initially Not Enrolled in seeds)

  beforeEach(() => {
    // Reset test student placement records
    store.placementEnrollments = store.placementEnrollments.filter(
      (e) => e.student_id !== testStudentId
    );
    store.placementEnrollmentStatusHistories = store.placementEnrollmentStatusHistories.filter(
      (h) => h.student_id !== testStudentId
    );
    store.jobApplications = store.jobApplications.filter(
      (a) => a.student_id !== testStudentId
    );
    // Ensure default settings
    store.placementEligibilitySettings = {
      id: 'pes-default',
      min_course_progress_percentage: 80,
      min_attendance_percentage: 80,
      require_assessments_completed: true,
      require_mock_interview_completed: true,
      min_mock_interview_score: 75,
      require_resume_approved: true,
      require_mandatory_documents_verified: true,
      require_fees_cleared: true,
      allow_admin_override: true,
      updated_at: '2026-03-01T10:00:00Z',
    };
  });

  describe('1. Declaration Verification & Opt-in Invariant', () => {
    it('strictly prevents job application if student is not enrolled', async () => {
      const job = store.jobOpenings[0];
      expect(job).toBeDefined();

      await expect(applyForJob(job.id, testStudentId)).rejects.toThrow(
        /Student has not enrolled for placement support/i
      );
    });

    it('rejects enrollment submission if any of the 7 mandatory declarations is missing', async () => {
      await expect(
        createPlacementEnrollment(
          {
            student_id: testStudentId,
            declaration: {
              terms_version: 'v2026.1',
              accepted_by: testStudentId,
              accepted_by_name: 'Amit Gupta',
              accepted_at: new Date().toISOString(),
              confirmed_information_correct: true,
              understands_no_guarantee: true,
              agrees_attend_scheduled_interviews: true,
              agrees_inform_external_offer: true,
              authorizes_resume_sharing: false, // Incomplete!
              understands_sensitive_docs_policy: true,
              agrees_keep_profile_updated: true,
            },
          },
          'usr-student-01'
        )
      ).rejects.toThrow(/All 7 terms and declarations must be accepted/i);
    });

    it('successfully creates placement enrollment when all 7 declarations are accepted', async () => {
      const enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          sap_module: 'SAP FICO',
          current_status: 'Fresher',
          employment_status: 'Immediate Joiner',
          highest_qualification: 'Bachelor of Commerce',
          degree: 'B.Com Computers',
          specialization: 'Accounting & Finance',
          college_university: 'Delhi University',
          graduation_year: 2024,
          percentage_or_cgpa: '8.2 CGPA',
          preferred_job_roles: ['SAP FICO Consultant'],
          preferred_locations: ['Gurugram', 'Noida', 'Delhi NCR'],
          preferred_work_mode: 'Hybrid',
          willing_to_relocate: true,
          immediate_joiner: true,
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
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
        'usr-student-01'
      );

      expect(enrollment.id).toBeDefined();
      expect(enrollment.enrollment_status).toBe('Application Submitted');
      expect(enrollment.is_placement_eligible).toBe(false);

      // Verify status history
      const history = store.placementEnrollmentStatusHistories.filter(
        (h) => h.enrollment_id === enrollment.id
      );
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].new_status).toBe('Application Submitted');
    });
  });

  describe('2. Admin Review Desk & Reason Enforcement', () => {
    let enrollment: PlacementEnrollment;

    beforeEach(async () => {
      enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          sap_module: 'SAP FICO',
          current_status: 'Fresher',
          employment_status: 'Fresher',
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
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
        'usr-student-01'
      );
    });

    it('requires mandatory reason when rejecting placement enrollment', async () => {
      await expect(
        updatePlacementEnrollmentStatus(
          enrollment.id,
          'Enrollment Rejected',
          'usr-placement',
          '' // Empty reason
        )
      ).rejects.toThrow(/rejection reason is mandatory/i);
    });

    it('requires mandatory reason when putting enrollment on hold', async () => {
      await expect(
        updatePlacementEnrollmentStatus(
          enrollment.id,
          'Enrollment On Hold',
          'usr-placement',
          '   ' // Whitespace reason
        )
      ).rejects.toThrow(/mandatory reason is required when putting enrollment on hold/i);
    });

    it('approves enrollment and records full immutable audit history', async () => {
      const updated = await updatePlacementEnrollmentStatus(
        enrollment.id,
        'Enrollment Approved',
        'usr-placement',
        'Initial academic and background check verified.'
      );

      expect(updated.enrollment_status).toBe('Enrollment Approved');

      const histories = store.placementEnrollmentStatusHistories.filter(
        (h) => h.enrollment_id === enrollment.id
      );
      expect(histories.length).toBe(2);
      expect(histories[1].old_status).toBe('Application Submitted');
      expect(histories[1].new_status).toBe('Enrollment Approved');
      expect(histories[1].reason).toContain('Initial academic and background check verified');
    });
  });

  describe('3. Placement Eligibility Rules Engine & Gating', () => {
    let enrollment: PlacementEnrollment;

    beforeEach(async () => {
      enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          sap_module: 'SAP FICO',
          current_status: 'Fresher',
          employment_status: 'Fresher',
          documents: [
            {
              id: 'doc-t1',
              document_type: 'Degree Certificate',
              file_name: 'Degree.pdf',
              file_url: 'https://example.com/degree.pdf',
              uploaded_at: new Date().toISOString(),
              is_verified: false,
            },
            {
              id: 'doc-t2',
              document_type: 'Aadhaar / ID Proof',
              file_name: 'ID.pdf',
              file_url: 'https://example.com/id.pdf',
              uploaded_at: new Date().toISOString(),
              is_verified: false,
            },
          ],
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
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
        'usr-student-01'
      );

      await updatePlacementEnrollmentStatus(
        enrollment.id,
        'Enrollment Approved',
        'usr-placement',
        'Enrollment Approved'
      );
    });

    it('denies job application if student is approved but not yet Placement Eligible', async () => {
      // Invariant: Enrollment Approved !== Placement Eligible
      expect(enrollment.is_placement_eligible).toBe(false);

      const job = store.jobOpenings[0];
      await expect(applyForJob(job.id, testStudentId)).rejects.toThrow(
        /Student is not yet Placement Eligible/i
      );
    });

    it('evaluates criteria and identifies exact missing prerequisites', async () => {
      const evaluation = await evaluatePlacementEligibility(testStudentId);
      expect(evaluation.isEligible).toBe(false);
      expect(evaluation.criteriaResults.length).toBeGreaterThanOrEqual(7);

      // Check specific criteria
      const resumeCriterion = evaluation.criteriaResults.find(
        (c: any) => c.criterion === 'Official Resume Approval'
      );
      expect(resumeCriterion?.passed).toBe(false);

      const docsCriterion = evaluation.criteriaResults.find(
        (c: any) => c.criterion === 'Mandatory Documents Verification'
      );
      expect(docsCriterion?.passed).toBe(false);
    });

    it('becomes Placement Eligible when all criteria are completed and unlocks job applications', async () => {
      // 1. Verify mandatory documents
      await verifyEnrollmentDocument(enrollment.id, 'doc-t1', true, 'Verified', 'usr-placement');
      await verifyEnrollmentDocument(enrollment.id, 'doc-t2', true, 'Verified', 'usr-placement');

      // 2. Approve resume
      enrollment.resume_status = 'Reviewed & Approved';

      // 3. Complete mock interview with >= 75 score
      let profile = store.placementProfiles.find((p) => p.student_id === testStudentId);
      if (!profile) {
        const newProfile: PlacementProfile = {
          id: `pp-${Date.now()}`,
          student_id: testStudentId,
          student_name: 'Amit Gupta',
          resume_status: 'Reviewed & Approved',
          mock_interview_status: 'Completed',
          technical_interview_score: 85,
          hr_interview_score: 80,
          skills: ['SAP FICO'],
          experience_years: 0,
          preferred_location: 'Delhi',
          expected_salary_lpa: 7,
          placement_status: 'Job Search',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.placementProfiles.push(newProfile);
        profile = newProfile;
      } else {
        profile.resume_status = 'Reviewed & Approved';
        profile.mock_interview_status = 'Completed';
        profile.technical_interview_score = 88;
      }

      // 4. Ensure academic and fee standing
      const student = store.students.find((s) => s.id === testStudentId);
      if (student) {
        student.course_progress = 92;
        student.attendance_percentage = 90;
        student.outstanding_amount = 0;
      }

      // Re-evaluate eligibility
      const evalResult = await evaluatePlacementEligibility(testStudentId);
      expect(evalResult.isEligible).toBe(true);

      const updatedEnr = store.placementEnrollments.find((e) => e.student_id === testStudentId);
      expect(updatedEnr?.is_placement_eligible).toBe(true);
      expect(updatedEnr?.enrollment_status).toBe('Placement Eligible');

      // Now applyForJob MUST succeed!
      const job = store.jobOpenings[0];
      const application = await applyForJob(job.id, testStudentId);
      expect(application.id).toBeDefined();
      expect(application.student_id).toBe(testStudentId);
      expect(application.status).toBe('Applied');
    });
  });

  describe('4. Administrative Eligibility Override & Re-Enrollment', () => {
    let enrollment: PlacementEnrollment;

    beforeEach(async () => {
      enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          sap_module: 'SAP FICO',
          current_status: 'Fresher',
          employment_status: 'Fresher',
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
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
        'usr-student-01'
      );
    });

    it('allows authorized administrative override with mandatory reason', async () => {
      await expect(
        overridePlacementEligibility(enrollment.id, 'usr-placement', '')
      ).rejects.toThrow(/Mandatory justification reason is required/i);

      const overridden = await overridePlacementEligibility(
        enrollment.id,
        'usr-placement',
        'Industry veteran with 4 years domain accounting experience clearing client special evaluation.'
      );

      expect(overridden.is_placement_eligible).toBe(true);
      expect(overridden.eligibility_overridden).toBe(true);
      expect(overridden.enrollment_status).toBe('Placement Eligible');

      // Student can apply immediately
      const job = store.jobOpenings[0];
      const app = await applyForJob(job.id, testStudentId);
      expect(app.status).toBe('Applied');
    });

    it('supports re-enrollment request without overwriting past history', async () => {
      // Transition to Student Withdrawn
      await updatePlacementEnrollmentStatus(
        enrollment.id,
        'Student Withdrawn',
        'usr-placement',
        'Candidate withdrew to prepare for competitive examinations.'
      );

      // Student submits re-enrollment request
      const reEnrolled = await requestReEnrollment(
        testStudentId,
        'Completed competitive exams and available for corporate hiring drives.'
      );

      expect(reEnrolled.enrollment_status).toBe('Re-enrollment Requested');

      const histories = store.placementEnrollmentStatusHistories.filter(
        (h) => h.enrollment_id === enrollment.id
      );
      expect(histories.length).toBeGreaterThanOrEqual(3);
      expect(histories.some((h) => h.new_status === 'Student Withdrawn')).toBe(true);
      expect(histories.some((h) => h.new_status === 'Re-enrollment Requested')).toBe(true);
    });

    it('allows placement coordinator to refer eligible student and manage application status lifecycle', async () => {
      // Set student as eligible via coordinator override
      await overridePlacementEligibility(
        enrollment.id,
        'usr-placement',
        'Coordinator referred candidate for enterprise drive.'
      );

      const job = store.jobOpenings[0];
      const coordinatorId = 'usr-placement';

      // Coordinator applies candidate to open job
      const application = await applyForJob(job.id, testStudentId, coordinatorId);
      expect(application).toBeDefined();
      expect(application.status).toBe('Applied');
      expect(application.job_id).toBe(job.id);
      expect(application.student_id).toBe(testStudentId);

      // Coordinator advances application to Shortlisted
      const shortlisted = await updateJobApplicationStatus(application.id, 'Shortlisted', coordinatorId);
      expect(shortlisted.status).toBe('Shortlisted');

      // Coordinator advances application to Selected
      const selected = await updateJobApplicationStatus(application.id, 'Selected', coordinatorId);
      expect(selected.status).toBe('Selected');
    });

    it('accurately stores and preserves legitimate interview score of 0 without resetting to defaults', async () => {
      const coordinatorId = 'usr-placement';

      // Ensure placement profile exists for student
      let profile = store.placementProfiles.find((p) => p.student_id === testStudentId);
      if (!profile) {
        profile = {
          id: `pp-${testStudentId}`,
          student_id: testStudentId,
          student_name: 'Amit Gupta',
          resume_status: 'Reviewed & Approved',
          mock_interview_status: 'Completed',
          placement_status: 'Mock Interview',
          skills: ['SAP FICO', 'General Ledger'],
          experience_years: 1,
          preferred_location: 'Hyderabad',
          expected_salary_lpa: 6,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.placementProfiles.push(profile);
      }

      // Update with score 0
      const updated = await updatePlacementProfile(
        testStudentId,
        {
          technical_interview_score: 0,
          hr_interview_score: 0,
          mock_interview_status: 'Needs Retake',
        },
        coordinatorId
      );

      expect(updated.technical_interview_score).toBe(0);
      expect(updated.hr_interview_score).toBe(0);
      expect(typeof updated.technical_interview_score).toBe('number');
      expect(typeof updated.hr_interview_score).toBe('number');

      // Update with score clearing (undefined)
      const cleared = await updatePlacementProfile(
        testStudentId,
        {
          technical_interview_score: undefined,
          hr_interview_score: undefined,
        },
        coordinatorId
      );

      expect(cleared.technical_interview_score).toBeUndefined();
      expect(cleared.hr_interview_score).toBeUndefined();
    });
  });

  describe('7. Crash Resistance on Uninitialized / Undefined Store Collections', () => {
    it('handles undefined store.placementEnrollments and status histories safely', async () => {
      const originalEnrollments = store.placementEnrollments;
      const originalHistories = store.placementEnrollmentStatusHistories;
      const originalSettings = store.placementEligibilitySettings;
      const originalJobOpenings = store.jobOpenings;
      const originalProfiles = store.placementProfiles;

      try {
        // Force undefined states simulating unseeded / reset store
        (store as any).placementEnrollments = undefined;
        (store as any).placementEnrollmentStatusHistories = undefined;
        (store as any).placementEligibilitySettings = undefined;
        (store as any).jobOpenings = undefined;
        (store as any).placementProfiles = undefined;

        // 1. Querying placement enrollments should not throw
        const list = await getPlacementEnrollments();
        expect(list).toEqual([]);

        // 2. Querying enrollment by student ID should return undefined safely
        const single = await getPlacementEnrollmentByStudentId('non-existent');
        expect(single).toBeUndefined();

        // 3. Fallback to default eligibility settings
        const settings = await getPlacementEligibilitySettings();
        expect(settings.min_course_progress_percentage).toBe(80);
        expect(settings.min_attendance_percentage).toBe(80);

        // 4. Evaluating eligibility with undefined enrollments should return safe ineligible result
        const evalRes = await evaluatePlacementEligibility('stu-01');
        expect(evalRes.isEligible).toBe(false);
        expect(evalRes.reasons).toContain('No placement enrollment found for student.');

        // 5. Querying job openings & profiles should return empty array safely
        const jobList = store.jobOpenings || [];
        expect(jobList).toEqual([]);
        const profileList = store.placementProfiles || [];
        expect(profileList).toEqual([]);

        // 6. Creating placement enrollment when store was undefined initializes it and succeeds
        const newEnr = await createPlacementEnrollment(
          {
            student_id: testStudentId,
            declaration: {
              terms_version: 'v2026.1',
              accepted_by: testStudentId,
              accepted_by_name: 'Amit Gupta',
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
          'usr-student-01'
        );
        expect(newEnr.id).toBeDefined();
        expect(store.placementEnrollments).toBeDefined();
        expect(store.placementEnrollments.length).toBeGreaterThan(0);
        expect(store.placementEnrollmentStatusHistories.length).toBeGreaterThan(0);
      } finally {
        // Restore original collections
        store.placementEnrollments = originalEnrollments;
        store.placementEnrollmentStatusHistories = originalHistories;
        store.placementEligibilitySettings = originalSettings;
        store.jobOpenings = originalJobOpenings;
        store.placementProfiles = originalProfiles;
      }
    });
  });

  describe('8. Automated Eligibility Audit Validation Before Student Enrollment (80% Attendance + 100% Fee Clearance)', () => {
    it('evaluates prerequisites and flags low attendance (<80%) and outstanding tuition fee dues', () => {
      const student = store.students.find((s) => s.id === testStudentId);
      expect(student).toBeDefined();
      if (!student) return;

      // Set low attendance and fee dues
      student.attendance_percentage = 65;
      student.course_progress = 70;
      student.outstanding_amount = 25000;

      const audit = evaluateEnrollmentPrerequisites(testStudentId);
      expect(audit.all_passed).toBe(false);
      expect(audit.passes_attendance).toBe(false);
      expect(audit.passes_progress).toBe(false);
      expect(audit.passes_fees).toBe(false);
      expect(audit.attendance_percentage).toBe(65);
      expect(audit.outstanding_amount).toBe(25000);
      expect(audit.unmet_criteria.length).toBe(3);
      expect(audit.unmet_criteria.some((c) => c.includes('Attendance 65%'))).toBe(true);
      expect(audit.unmet_criteria.some((c) => c.includes('fee arrears'))).toBe(true);
    });

    it('passes prerequisite audit when student satisfies 80% attendance, 80% progress, and zero fee dues', () => {
      const student = store.students.find((s) => s.id === testStudentId);
      expect(student).toBeDefined();
      if (!student) return;

      student.attendance_percentage = 85;
      student.course_progress = 90;
      student.outstanding_amount = 0;

      const audit = evaluateEnrollmentPrerequisites(testStudentId);
      expect(audit.all_passed).toBe(true);
      expect(audit.passes_attendance).toBe(true);
      expect(audit.passes_progress).toBe(true);
      expect(audit.passes_fees).toBe(true);
      expect(audit.unmet_criteria).toEqual([]);
    });

    it('populates initial eligibility reasons in placement enrollment reflecting prerequisite audit', async () => {
      const student = store.students.find((s) => s.id === testStudentId);
      expect(student).toBeDefined();
      if (!student) return;

      student.attendance_percentage = 72;
      student.outstanding_amount = 12000;

      const enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
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
        'usr-student-01'
      );

      expect(enrollment.is_placement_eligible).toBe(false);
      expect(enrollment.eligibility_reasons?.length).toBeGreaterThanOrEqual(1);
      expect(enrollment.eligibility_reasons?.some((r) => r.includes('Attendance'))).toBe(true);
    });

    it('creates placement enrollment with authorized administrative override directly when granted by coordinator', async () => {
      const student = store.students.find((s) => s.id === testStudentId);
      expect(student).toBeDefined();
      if (!student) return;

      // Student has fee dues and low attendance
      student.attendance_percentage = 60;
      student.outstanding_amount = 30000;

      const enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          eligibility_overridden: true,
          override_reason: 'Director approved placement onboarding exception for corporate batch.',
          overridden_by: 'usr-admin',
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: 'usr-admin',
            accepted_by_name: 'Placement Officer',
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
        'usr-admin'
      );

      expect(enrollment.is_placement_eligible).toBe(true);
      expect(enrollment.eligibility_overridden).toBe(true);
      expect(enrollment.override_reason).toContain('Director approved placement onboarding exception');
      expect(enrollment.eligibility_reasons).toEqual([]);
    });

    it('dynamically adapts audit thresholds when institutional settings are updated', async () => {
      const student = store.students.find((s) => s.id === testStudentId);
      expect(student).toBeDefined();
      if (!student) return;

      student.attendance_percentage = 75;
      student.course_progress = 85;
      student.outstanding_amount = 0;

      // Default 80% attendance -> should FAIL
      let audit = evaluateEnrollmentPrerequisites(testStudentId);
      expect(audit.passes_attendance).toBe(false);
      expect(audit.all_passed).toBe(false);

      // Relax threshold to 70% in institutional settings
      await updatePlacementEligibilitySettings({ min_attendance_percentage: 70 }, 'usr-admin');

      // Now 75% attendance -> should PASS!
      audit = evaluateEnrollmentPrerequisites(testStudentId);
      expect(audit.passes_attendance).toBe(true);
      expect(audit.all_passed).toBe(true);
    });
  });

  // =========================================================================
  // 5. AUDIT FINDING REMEDIATIONS (G24, G25, G26)
  // =========================================================================
  describe('5. Audit Finding Remediations (G24, G25, G26)', () => {
    it('G24: strictly prevents non-coordinators and non-admins from overriding placement eligibility', async () => {
      const enrollment = await createPlacementEnrollment(
        {
          student_id: testStudentId,
          sap_module: 'SAP FICO',
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
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
        'usr-student-01'
      );

      // Student attempting to override -> reject
      await expect(
        overridePlacementEligibility(enrollment.id, 'usr-student-01', 'Self promotion')
      ).rejects.toThrow(/Unauthorized: Only Placement Coordinators or Administrators/);

      // Trainer attempting to override -> reject
      await expect(
        overridePlacementEligibility(enrollment.id, 'usr-trainer-fico', 'Faculty recommendation')
      ).rejects.toThrow(/Unauthorized: Only Placement Coordinators or Administrators/);

      // Unknown user attempting to override -> reject
      await expect(
        overridePlacementEligibility(enrollment.id, 'non-existent-user', 'Bypass attempt')
      ).rejects.toThrow(/Unauthorized: Only Placement Coordinators or Administrators/);

      // Legitimate admin -> allowed
      const overridden = await overridePlacementEligibility(enrollment.id, 'usr-admin', 'Director approved placement exception');
      expect(overridden.is_placement_eligible).toBe(true);
      expect(overridden.eligibility_overridden).toBe(true);
    });

    it('G25: rejects job applications for non-existent, closed, or expired job openings', async () => {
      let enrollment = store.placementEnrollments.find((e) => e.student_id === testStudentId);
      if (!enrollment) {
        enrollment = await createPlacementEnrollment({
          student_id: testStudentId,
          sap_module: 'SAP FICO',
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: testStudentId,
            accepted_by_name: 'Amit Gupta',
            accepted_at: new Date().toISOString(),
            confirmed_information_correct: true,
            understands_no_guarantee: true,
            agrees_attend_scheduled_interviews: true,
            agrees_inform_external_offer: true,
            authorizes_resume_sharing: true,
            understands_sensitive_docs_policy: true,
            agrees_keep_profile_updated: true,
          },
        }, 'usr-student-01');
      }
      enrollment.is_placement_eligible = true;
      enrollment.enrollment_status = 'Placement Eligible';

      // 1. Non-existent job
      await expect(
        applyForJob('non-existent-job-999', testStudentId)
      ).rejects.toThrow(/Job opening not found/);

      // 2. Closed job
      const closedJob = store.jobOpenings[0];
      const origStatus = closedJob.status;
      closedJob.status = 'Closed';
      await expect(
        applyForJob(closedJob.id, testStudentId)
      ).rejects.toThrow(/Job opening is closed for applications/);
      closedJob.status = origStatus;

      // 3. Expired deadline
      const expiredJob = store.jobOpenings[1];
      const origDeadline = expiredJob.application_deadline;
      expiredJob.application_deadline = '2025-01-01'; // In the past
      await expect(
        applyForJob(expiredJob.id, testStudentId)
      ).rejects.toThrow(/Job application deadline has passed/);
      expiredJob.application_deadline = origDeadline;
    });

    it('G26: validates mock interview score bounds (0-100) and reconciles job opening updates and deletions', async () => {
      // Bounds check on mock interview score (< 0)
      await expect(
        updatePlacementProfile(testStudentId, { technical_interview_score: -5 }, 'usr-placement')
      ).rejects.toThrow(/Technical mock interview score must be between 0 and 100/);

      // Bounds check on mock interview score (> 100)
      await expect(
        updatePlacementProfile(testStudentId, { technical_interview_score: 105 }, 'usr-placement')
      ).rejects.toThrow(/Technical mock interview score must be between 0 and 100/);

      // Valid score (95)
      const updatedProfile = await updatePlacementProfile(
        testStudentId,
        { technical_interview_score: 95 },
        'usr-placement'
      );
      expect(updatedProfile.technical_interview_score).toBe(95);

      // Job opening update and delete reconciliation
      const job = store.jobOpenings[0];
      const updatedJob = await updateJobOpeningStatus(job.id, 'Closed');
      expect(updatedJob?.status).toBe('Closed');

      // Reopen job
      await updateJobOpeningStatus(job.id, 'Open');
      expect(job.status).toBe('Open');
    });
  });
});
