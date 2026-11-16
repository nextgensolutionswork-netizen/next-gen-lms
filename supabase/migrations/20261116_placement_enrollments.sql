-- Migration: 20261116_placement_enrollments.sql
-- Description: Schema for Placement Enrollments, Eligibility Settings, and Status History.
-- Status: Prepared for Super Admin approval. DO NOT APPLY AUTOMATICALLY.

-- 1. Placement Eligibility Settings Table
CREATE TABLE IF NOT EXISTS public.placement_eligibility_settings (
    id TEXT PRIMARY KEY DEFAULT 'pes-default',
    min_course_progress_percentage NUMERIC NOT NULL DEFAULT 80,
    min_attendance_percentage NUMERIC NOT NULL DEFAULT 80,
    require_assessments_completed BOOLEAN NOT NULL DEFAULT true,
    require_mock_interview_completed BOOLEAN NOT NULL DEFAULT true,
    min_mock_interview_score NUMERIC NOT NULL DEFAULT 75,
    require_resume_approved BOOLEAN NOT NULL DEFAULT true,
    require_mandatory_documents_verified BOOLEAN NOT NULL DEFAULT true,
    require_fees_cleared BOOLEAN NOT NULL DEFAULT true,
    allow_admin_override BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Placement Enrollments Table
CREATE TABLE IF NOT EXISTS public.placement_enrollments (
    id TEXT PRIMARY KEY DEFAULT ('pe-' || encode(gen_random_bytes(6), 'hex')),
    tenant_id TEXT NOT NULL DEFAULT 'default',
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    admission_number TEXT,
    student_code TEXT,
    email TEXT NOT NULL,
    mobile_number TEXT,
    whatsapp_number TEXT,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    course_name TEXT,
    sap_module TEXT NOT NULL,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    batch_name TEXT,
    trainer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    trainer_name TEXT,

    -- Lifecycle & Status
    enrollment_status TEXT NOT NULL DEFAULT 'Enrolled' CHECK (
        enrollment_status IN (
            'Not Enrolled', 'Enrolled', 'Under Review', 'Verified',
            'Approved', 'On Hold', 'Action Required', 'Rejected',
            'Suspended', 'Completed', 'Opted Out'
        )
    ),
    is_placement_eligible BOOLEAN NOT NULL DEFAULT false,
    eligibility_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
    eligibility_overridden BOOLEAN DEFAULT false,
    override_reason TEXT,
    overridden_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    overridden_at TIMESTAMPTZ,

    -- Professional Profile
    current_status TEXT NOT NULL DEFAULT 'Fresher',
    employment_status TEXT NOT NULL DEFAULT 'Immediate Joiner',
    current_company TEXT,
    current_designation TEXT,
    total_experience_years NUMERIC(4, 1),
    relevant_sap_experience_years NUMERIC(4, 1),
    current_ctc_lpa NUMERIC(6, 2),
    expected_ctc_lpa NUMERIC(6, 2),
    notice_period TEXT,
    last_working_date DATE,

    -- Academic Background
    highest_qualification TEXT NOT NULL,
    degree TEXT NOT NULL,
    specialization TEXT NOT NULL,
    college_university TEXT NOT NULL,
    graduation_year INTEGER NOT NULL,
    percentage_or_cgpa TEXT NOT NULL,

    -- Candidate Preferences
    preferred_job_roles TEXT[] DEFAULT ARRAY[]::TEXT[],
    preferred_locations TEXT[] DEFAULT ARRAY[]::TEXT[],
    preferred_work_mode TEXT NOT NULL DEFAULT 'Hybrid' CHECK (preferred_work_mode IN ('On-site', 'Remote', 'Hybrid')),
    willing_to_relocate BOOLEAN NOT NULL DEFAULT true,
    immediate_joiner BOOLEAN NOT NULL DEFAULT true,
    preferred_industry TEXT,

    -- Resume & Documents
    resume_url TEXT,
    resume_name TEXT,
    resume_status TEXT NOT NULL DEFAULT 'Pending Review' CHECK (
        resume_status IN ('Not Uploaded', 'Pending Review', 'Reviewed & Approved', 'Needs Improvement')
    ),
    documents JSONB DEFAULT '[]'::JSONB,

    -- Mandatory Terms and Declaration (All 7 required)
    declaration JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- Administrative Review & Assignment
    enrollment_date TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by_name TEXT,
    assigned_placement_officer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_placement_officer_name TEXT,
    internal_notes TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Status Notes
    rejection_reason TEXT,
    hold_reason TEXT,
    withdrawal_reason TEXT,
    more_info_required_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Placement Enrollment Status Histories Table
CREATE TABLE IF NOT EXISTS public.placement_enrollment_status_histories (
    id TEXT PRIMARY KEY DEFAULT ('pesh-' || encode(gen_random_bytes(6), 'hex')),
    enrollment_id TEXT NOT NULL REFERENCES public.placement_enrollments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_by_name TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Foreign Key & Unique Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_placement_enrollments_student_unique ON public.placement_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_placement_enrollments_student_id ON public.placement_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_placement_enrollments_course_id ON public.placement_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_placement_enrollments_batch_id ON public.placement_enrollments(batch_id);
CREATE INDEX IF NOT EXISTS idx_placement_enrollments_status ON public.placement_enrollments(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_placement_enrollments_tenant_id ON public.placement_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_placement_histories_enrollment_id ON public.placement_enrollment_status_histories(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_placement_histories_student_id ON public.placement_enrollment_status_histories(student_id);

-- 5. Row-Level Security (RLS) Policies
ALTER TABLE public.placement_eligibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_enrollment_status_histories ENABLE ROW LEVEL SECURITY;

-- 5.1 Placement Eligibility Settings RLS
DROP POLICY IF EXISTS "Staff view placement eligibility settings" ON public.placement_eligibility_settings;
CREATE POLICY "Staff view placement eligibility settings" ON public.placement_eligibility_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage placement eligibility settings" ON public.placement_eligibility_settings;
CREATE POLICY "Admin manage placement eligibility settings" ON public.placement_eligibility_settings
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('super_admin', 'admin', 'placement_coordinator')
    );

-- 5.2 Placement Enrollments RLS
DROP POLICY IF EXISTS "Placement staff manage all enrollments" ON public.placement_enrollments;
CREATE POLICY "Placement staff manage all enrollments" ON public.placement_enrollments
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('super_admin', 'admin', 'placement_coordinator')
    );

DROP POLICY IF EXISTS "Students view own placement enrollment" ON public.placement_enrollments;
CREATE POLICY "Students view own placement enrollment" ON public.placement_enrollments
    FOR SELECT USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Students create own placement enrollment" ON public.placement_enrollments;
CREATE POLICY "Students create own placement enrollment" ON public.placement_enrollments
    FOR INSERT WITH CHECK (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    );

-- 5.3 Placement Histories RLS
DROP POLICY IF EXISTS "Placement staff view status history" ON public.placement_enrollment_status_histories;
CREATE POLICY "Placement staff view status history" ON public.placement_enrollment_status_histories
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('super_admin', 'admin', 'placement_coordinator')
    );

DROP POLICY IF EXISTS "Students view own status history" ON public.placement_enrollment_status_histories;
CREATE POLICY "Students view own status history" ON public.placement_enrollment_status_histories
    FOR SELECT USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    );

-- ==============================================================================
-- 6. NON-DESTRUCTIVE BACKUP-BASED RECOVERY & ROLLBACK PROCEDURE
-- ==============================================================================
-- CRITICAL SAFETY REQUIREMENT:
-- 1. NEVER execute unvetted 'DROP TABLE ... CASCADE' in production.
-- 2. NEVER DISABLE ROW LEVEL SECURITY (RLS) during rollback or maintenance.
--    RLS must remain enabled at all times to prevent tenant data leakage.
--
-- PRE-MIGRATION SNAPSHOT & VERIFICATION (DBA / Pipeline Pre-requisite):
--   a) Generate full pre-migration point-in-time schema and data dump:
--        supabase db dump --data-only -f backup_pre_placement_data_$(date +%Y%m%d%H%M%S).sql
--        supabase db dump -f backup_pre_placement_full_$(date +%Y%m%d%H%M%S).sql
--   b) Verify schema compatibility against live catalog:
--        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
--        SELECT table_name, column_name, data_type FROM information_schema.columns
--        WHERE table_name IN ('students', 'courses', 'batches', 'profiles');
--
-- TRANSACTIONAL APPLICATION:
--   Wrap entire migration in a single transaction block in psql / migration runner:
--   BEGIN;
--     -- [Execute Migration DDL & Policies]
--   COMMIT;
--
-- SAFE NON-DESTRUCTIVE ROLLBACK PROCEDURE (If Reversion Required):
--   Step 1: Quiesce Traffic Non-Destructively:
--     Route traffic away from placement endpoints via Vercel feature flag or DNS/Maintenance mode.
--     DO NOT disable RLS on tables. Keep RLS enabled with closed policies if traffic must be halted:
--       DROP POLICY IF EXISTS "Public access" ON public.placement_enrollments;
--       CREATE POLICY "Emergency lock" ON public.placement_enrollments FOR ALL USING (false);
--
--   Step 2: Archive All Created & Modified Data:
--     CREATE TABLE IF NOT EXISTS public._backup_placement_enrollments_archive AS
--       SELECT * FROM public.placement_enrollments;
--     CREATE TABLE IF NOT EXISTS public._backup_placement_histories_archive AS
--       SELECT * FROM public.placement_enrollment_status_histories;
--     CREATE TABLE IF NOT EXISTS public._backup_placement_settings_archive AS
--       SELECT * FROM public.placement_eligibility_settings;
--
--   Step 3: Point-In-Time Verification & Rollback Script:
--     If full schema drop is explicitly approved by Super Administrator:
--       DROP TABLE IF EXISTS public.placement_enrollment_status_histories;
--       DROP TABLE IF EXISTS public.placement_enrollments;
--       DROP TABLE IF EXISTS public.placement_eligibility_settings;
--       DROP FUNCTION IF EXISTS public.record_placement_status_change();
--     If restoring previous state from backup:
--       psql -v ON_ERROR_STOP=1 -f backup_pre_placement_full_*.sql
-- ==============================================================================

