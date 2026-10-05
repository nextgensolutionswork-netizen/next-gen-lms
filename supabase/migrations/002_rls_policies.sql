-- Next-Gen ERP LMS: 002_rls_policies.sql
-- Enforce Row Level Security (RLS) with Default-Deny Authorization

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_transfer_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. Profiles
CREATE POLICY "Super Admins can manage all profiles" ON profiles
  FOR ALL USING (get_current_user_role() = 'super_admin');

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Staff can view staff profiles" ON profiles
  FOR SELECT USING (get_current_user_role() IN ('admin', 'counsellor', 'trainer', 'placement_coordinator', 'accountant'));

-- 2. Courses & Academic Content
-- Super Admins and Admins can view/edit all courses
CREATE POLICY "Super Admins and Admins manage courses" ON courses
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

-- Trainers can ONLY view courses they are explicitly assigned to (zero access if empty)
CREATE POLICY "Trainers view assigned courses only" ON courses
  FOR SELECT USING (
    get_current_user_role() = 'trainer' AND
    id IN (SELECT unnest(assigned_course_ids) FROM profiles WHERE id = auth.uid())
  );

-- Counsellors can view courses for admission counseling
CREATE POLICY "Counsellors view courses" ON courses
  FOR SELECT USING (get_current_user_role() = 'counsellor');

-- Students can ONLY view published courses they are enrolled in
CREATE POLICY "Students view enrolled courses" ON courses
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    status = 'Published' AND
    id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

-- Course Modules & Lessons inherit course permissions
CREATE POLICY "Super Admins and Admins manage modules" ON course_modules
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Trainers view assigned modules" ON course_modules
  FOR SELECT USING (
    get_current_user_role() = 'trainer' AND
    course_id IN (SELECT unnest(assigned_course_ids) FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Students view enrolled modules" ON course_modules
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    course_id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY "Super Admins and Admins manage lessons" ON lessons
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "Trainers manage assigned lessons" ON lessons
  FOR ALL USING (
    get_current_user_role() = 'trainer' AND
    course_id IN (SELECT unnest(assigned_course_ids) FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Students view published enrolled lessons" ON lessons
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    is_published = true AND
    course_id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

-- 3. CRM & Leads
CREATE POLICY "Super Admin, Admin, Counsellor manage leads" ON leads
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'counsellor'));

-- 4. Admissions
CREATE POLICY "Admissions access" ON admissions
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'counsellor'));

-- 5. Financial Tables (Accountant, Admin, Super Admin)
CREATE POLICY "Super Admin, Admin, Accountant manage fee accounts" ON student_fee_accounts
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

CREATE POLICY "Students view own fee account" ON student_fee_accounts
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY "Super Admin, Admin, Accountant manage payments" ON payments
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

CREATE POLICY "Students view own receipts" ON receipts
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY "Super Admin, Admin, Accountant manage expenses" ON expenses
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

CREATE POLICY "Super Admin, Admin, Accountant manage vendors" ON vendors
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

-- 6. Placement Support
CREATE POLICY "Placement Coordinator, Admin, Super Admin manage placements" ON placement_profiles
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'placement_coordinator'));

CREATE POLICY "Students view own placement profile" ON placement_profiles
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- 7. Audit Logs
CREATE POLICY "Super Admin can view audit logs" ON audit_logs
  FOR SELECT USING (get_current_user_role() = 'super_admin');

-- 8. Public Certificate Verification
CREATE POLICY "Anyone can verify valid certificates" ON certificates
  FOR SELECT USING (is_valid = true);
