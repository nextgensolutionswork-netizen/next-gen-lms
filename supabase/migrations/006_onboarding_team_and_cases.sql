-- Next-Gen ERP LMS: 006_onboarding_team_and_cases.sql
-- Onboarding Team Role, Case Lifecycle, and Row Level Security Isolation

BEGIN;

-- 1. Safely update profiles role check constraint to include 'onboarding_team'
DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('super_admin', 'admin', 'accountant', 'counsellor', 'trainer', 'placement_coordinator', 'support', 'onboarding_team', 'student'));
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Non-blocking if table or constraint structure differs
END $$;

-- 2. Create onboarding_cases table
CREATE TABLE IF NOT EXISTS onboarding_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number TEXT NOT NULL UNIQUE,
    admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE RESTRICT,
    admission_number TEXT NOT NULL,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    student_name TEXT NOT NULL,
    student_email TEXT NOT NULL,
    student_phone TEXT NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_name TEXT,
    trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    trainer_name TEXT,
    assigned_staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_staff_name TEXT,
    assigned_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed')),
    blocked_reason TEXT,
    checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    orientation_date DATE,
    orientation_mode TEXT CHECK (orientation_mode IN ('Online', 'Classroom', 'Hybrid')),
    lms_account_created BOOLEAN DEFAULT false,
    lms_account_activated_at TIMESTAMPTZ,
    portal_access_confirmed BOOLEAN DEFAULT false,
    academic_handover_confirmed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    completed_by TEXT,
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_onboarding_admission UNIQUE (admission_id),
    CONSTRAINT uq_onboarding_student UNIQUE (student_id)
);

-- 3. Create onboarding_audit_logs table
CREATE TABLE IF NOT EXISTS onboarding_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES onboarding_cases(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_status ON onboarding_cases(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_staff ON onboarding_cases(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_admission ON onboarding_cases(admission_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_student ON onboarding_cases(student_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_audit_case ON onboarding_audit_logs(case_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE onboarding_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for onboarding_cases
-- Super Admin and Operations Admin can manage all cases
DROP POLICY IF EXISTS "Admins can manage all onboarding cases" ON onboarding_cases;
CREATE POLICY "Admins can manage all onboarding cases" ON onboarding_cases
    FOR ALL
    USING (get_current_user_role() IN ('super_admin', 'admin'));

-- Onboarding Team can only view their own assigned cases (assignment-scoped)
DROP POLICY IF EXISTS "Onboarding staff view assigned cases" ON onboarding_cases;
CREATE POLICY "Onboarding staff view assigned cases" ON onboarding_cases
    FOR SELECT
    USING (
        get_current_user_role() = 'onboarding_team' AND
        assigned_staff_id = auth.uid()
    );

-- Onboarding Team can only update their own assigned cases
DROP POLICY IF EXISTS "Onboarding staff update assigned cases" ON onboarding_cases;
CREATE POLICY "Onboarding staff update assigned cases" ON onboarding_cases
    FOR UPDATE
    USING (
        get_current_user_role() = 'onboarding_team' AND
        assigned_staff_id = auth.uid()
    )
    WITH CHECK (
        get_current_user_role() = 'onboarding_team' AND
        assigned_staff_id = auth.uid()
    );

-- 6. RLS Policies for onboarding_audit_logs
-- Admins can view all audit logs
DROP POLICY IF EXISTS "Admins view all onboarding audit logs" ON onboarding_audit_logs;
CREATE POLICY "Admins view all onboarding audit logs" ON onboarding_audit_logs
    FOR SELECT
    USING (get_current_user_role() IN ('super_admin', 'admin'));

-- Onboarding Team can view audit logs for assigned cases
DROP POLICY IF EXISTS "Onboarding staff view assigned case audit logs" ON onboarding_audit_logs;
CREATE POLICY "Onboarding staff view assigned case audit logs" ON onboarding_audit_logs
    FOR SELECT
    USING (
        get_current_user_role() = 'onboarding_team' AND
        EXISTS (
            SELECT 1 FROM onboarding_cases oc
            WHERE oc.id = case_id AND oc.assigned_staff_id = auth.uid()
        )
    );

-- Authenticated staff can insert audit log entries
DROP POLICY IF EXISTS "Staff insert onboarding audit logs" ON onboarding_audit_logs;
CREATE POLICY "Staff insert onboarding audit logs" ON onboarding_audit_logs
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
