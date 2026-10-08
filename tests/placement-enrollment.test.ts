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
  getPlacementEligibilitySettings,
  updatePlacementEligibilitySettings,
} from '@/lib/services/placement-service';
import { PlacementEnrollment } from '@/types';

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
        profile = {
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
          placement_status: 'In Progress',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.placementProfiles.push(profile);
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
  });
});
