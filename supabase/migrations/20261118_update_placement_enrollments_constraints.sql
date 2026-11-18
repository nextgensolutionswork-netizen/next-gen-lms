-- Migration: 20261118_update_placement_enrollments_constraints.sql
-- BUG-PL-002: Align placement_enrollments constraints with full application lifecycle and eligibility overrides

ALTER TABLE public.placement_enrollments DROP CONSTRAINT IF EXISTS placement_enrollments_enrollment_status_check;
ALTER TABLE public.placement_enrollments ADD CONSTRAINT placement_enrollments_enrollment_status_check CHECK (
    enrollment_status IN (
        'Not Enrolled',
        'Application Submitted',
        'Under Review',
        'More Information Required',
        'Enrollment Approved',
        'Profile Completion Pending',
        'Documents Pending',
        'Resume Review Pending',
        'Mock Interview Pending',
        'Placement Eligible',
        'Active Placement',
        'Placed',
        'Placement Closed',
        'Enrollment Rejected',
        'Enrollment On Hold',
        'Student Withdrawn',
        'Re-enrollment Requested',
        'Re-enrollment Under Review',
        'Re-enrollment Approved',
        'Re-enrollment Rejected',
        'Enrolled', 'Verified', 'Approved', 'On Hold', 'Action Required', 'Rejected', 'Suspended', 'Completed', 'Opted Out'
    )
);

ALTER TABLE public.placement_enrollments ALTER COLUMN highest_qualification DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN degree DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN specialization DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN college_university DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN graduation_year DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN percentage_or_cgpa DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN declaration DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN sap_module DROP NOT NULL;
ALTER TABLE public.placement_enrollments ALTER COLUMN email DROP NOT NULL;
