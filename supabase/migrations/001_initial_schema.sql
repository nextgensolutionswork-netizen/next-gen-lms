-- Next-Gen ERP LMS: 001_initial_schema.sql
-- Complete Normalized PostgreSQL Schema for SAP Institute LMS & ERP

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles & Roles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'accountant', 'counsellor', 'trainer', 'placement_coordinator', 'student')),
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    branch_id UUID,
    assigned_course_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CRM & Leads
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    interested_course_id UUID,
    current_status TEXT NOT NULL,
    experience_years NUMERIC DEFAULT 0,
    training_preference TEXT NOT NULL CHECK (training_preference IN ('Online', 'Classroom', 'Hybrid')),
    lead_source TEXT NOT NULL CHECK (lead_source IN ('Website', 'Google Ads', 'Meta Ads', 'Referral', 'Walk-in', 'Other')),
    campaign TEXT,
    counsellor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    demo_preference BOOLEAN DEFAULT false,
    demo_date TIMESTAMPTZ,
    follow_up_date DATE,
    notes TEXT,
    stage TEXT NOT NULL DEFAULT 'New' CHECK (stage IN ('New', 'Contacted', 'Follow-up', 'Demo Scheduled', 'Demo Attended', 'Interested', 'Not Interested', 'Converted', 'Lost')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_followups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    counsellor_id UUID NOT NULL REFERENCES profiles(id),
    stage_before TEXT NOT NULL,
    stage_after TEXT NOT NULL,
    notes TEXT NOT NULL,
    next_follow_up_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Admissions
CREATE TABLE IF NOT EXISTS admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admission_number TEXT UNIQUE NOT NULL,
    student_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    dob DATE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    education TEXT NOT NULL,
    experience_years NUMERIC DEFAULT 0,
    current_employment_status TEXT NOT NULL CHECK (current_employment_status IN ('Employed', 'Unemployed', 'Student', 'Career Gap')),
    course_id UUID NOT NULL,
    training_mode TEXT NOT NULL CHECK (training_mode IN ('Online', 'Classroom', 'Hybrid')),
    batch_id UUID,
    trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    course_fee NUMERIC NOT NULL CHECK (course_fee > 0),
    discount NUMERIC DEFAULT 0 CHECK (discount >= 0),
    discount_reason TEXT,
    net_payable NUMERIC NOT NULL CHECK (net_payable >= 0),
    payment_plan TEXT NOT NULL CHECK (payment_plan IN ('Full Payment', '2 Installments', '3 Installments', 'Custom')),
    counsellor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Pending', 'Confirmed', 'Active', 'Completed', 'Cancelled', 'On Hold')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Courses, Modules & Lessons
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_name TEXT NOT NULL,
    course_code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    duration_weeks INTEGER NOT NULL CHECK (duration_weeks > 0),
    category TEXT NOT NULL CHECK (category IN ('SAP Functional', 'SAP Technical', 'SAP Cloud', 'Enterprise Other')),
    trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    thumbnail_url TEXT,
    price NUMERIC NOT NULL CHECK (price >= 0),
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published', 'Archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    lesson_type TEXT NOT NULL CHECK (lesson_type IN ('Video', 'PDF', 'Document', 'Text', 'Quiz', 'Assignment', 'External link', 'Live session')),
    duration_minutes INTEGER DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 1,
    is_published BOOLEAN DEFAULT false,
    content_url TEXT,
    text_content TEXT,
    video_signed_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Batches & Scheduling
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_code TEXT UNIQUE NOT NULL,
    batch_name TEXT NOT NULL,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES profiles(id),
    training_mode TEXT NOT NULL CHECK (training_mode IN ('Online', 'Classroom', 'Hybrid')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days TEXT[] NOT NULL DEFAULT '{"Mon","Wed","Fri"}',
    maximum_capacity INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Active', 'Completed', 'Cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    admission_id UUID UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
    student_code TEXT UNIQUE NOT NULL,
    admission_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    profile_photo TEXT,
    address TEXT,
    course_id UUID NOT NULL REFERENCES courses(id),
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'On Hold', 'Completed', 'Suspended', 'Dropped')),
    total_fee NUMERIC NOT NULL,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    outstanding_amount NUMERIC NOT NULL DEFAULT 0,
    attendance_percentage NUMERIC NOT NULL DEFAULT 0,
    course_progress NUMERIC NOT NULL DEFAULT 0,
    placement_status TEXT NOT NULL DEFAULT 'Not Started' CHECK (placement_status IN ('Not Started', 'Resume Preparation', 'Mock Interview', 'Job Search', 'Interview Scheduled', 'Interview Completed', 'Offer Received', 'Placed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batch_students (
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (batch_id, student_id)
);

CREATE TABLE IF NOT EXISTS batch_transfer_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_batch_id UUID NOT NULL REFERENCES batches(id),
    to_batch_id UUID NOT NULL REFERENCES batches(id),
    reason TEXT NOT NULL,
    transferred_by UUID NOT NULL REFERENCES profiles(id),
    transferred_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Progress & Class Sessions & Attendance
CREATE TABLE IF NOT EXISTS lesson_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    last_watched_seconds INTEGER DEFAULT 0,
    video_total_seconds INTEGER DEFAULT 0,
    completed_percentage NUMERIC DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    completion_date TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES profiles(id),
    topic TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('Online', 'Classroom', 'Hybrid')),
    meeting_link TEXT,
    classroom TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Completed', 'Cancelled', 'Rescheduled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
    notes TEXT,
    marked_by UUID NOT NULL REFERENCES profiles(id),
    marked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, session_id)
);

-- 8. Assignments & Quizzes
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    module_id UUID REFERENCES course_modules(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ NOT NULL,
    maximum_marks NUMERIC NOT NULL CHECK (maximum_marks > 0),
    attachment_url TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    submission_text TEXT,
    attachment_url TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Graded', 'Resubmission Requested')),
    marks_obtained NUMERIC,
    feedback TEXT,
    graded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    graded_at TIMESTAMPTZ,
    UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    pass_percentage NUMERIC NOT NULL CHECK (pass_percentage BETWEEN 1 AND 100),
    attempts_allowed INTEGER NOT NULL DEFAULT 1,
    randomize_questions BOOLEAN DEFAULT true,
    show_answers_after BOOLEAN DEFAULT true,
    status TEXT NOT NULL DEFAULT 'Published' CHECK (status IN ('Draft', 'Published', 'Archived')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('MCQ', 'Multiple', 'TrueFalse', 'ShortAnswer')),
    points NUMERIC NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL DEFAULT 1,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation TEXT
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score NUMERIC NOT NULL DEFAULT 0,
    total_points NUMERIC NOT NULL DEFAULT 0,
    percentage NUMERIC NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress', 'Completed', 'Timed Out'))
);

-- 9. Accounts & Financial Ledger
CREATE TABLE IF NOT EXISTS student_fee_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id),
    original_fee NUMERIC NOT NULL,
    discount NUMERIC NOT NULL DEFAULT 0,
    discount_reason TEXT,
    net_payable NUMERIC NOT NULL,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    outstanding_amount NUMERIC NOT NULL,
    payment_plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid', 'Overdue', 'Refunded')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fee_account_id UUID NOT NULL REFERENCES student_fee_accounts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount NUMERIC NOT NULL,
    due_date DATE NOT NULL,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    paid_date DATE,
    status TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Due', 'Paid', 'Partial', 'Overdue')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT UNIQUE NOT NULL,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_account_id UUID NOT NULL REFERENCES student_fee_accounts(id) ON DELETE CASCADE,
    installment_id UUID REFERENCES installments(id) ON DELETE SET NULL,
    course_id UUID NOT NULL REFERENCES courses(id),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Payment Gateway', 'Other')),
    transaction_reference TEXT,
    collected_by UUID NOT NULL REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT UNIQUE NOT NULL,
    payment_id UUID UNIQUE NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    admission_number TEXT NOT NULL,
    course_name TEXT NOT NULL,
    payment_amount NUMERIC NOT NULL,
    payment_mode TEXT NOT NULL,
    transaction_reference TEXT,
    payment_date DATE NOT NULL,
    remaining_balance NUMERIC NOT NULL,
    authorized_by TEXT NOT NULL,
    institute_name TEXT NOT NULL,
    institute_address TEXT NOT NULL,
    institute_phone TEXT NOT NULL,
    institute_gst TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Expenses & Vendors
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    gst_number TEXT,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_code TEXT UNIQUE NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL CHECK (category IN (
        'Trainer payment', 'Salary', 'Rent', 'Marketing', 'Meta Ads', 'Google Ads',
        'Software', 'Internet', 'Electricity', 'Office supplies', 'Refund',
        'Travel', 'Maintenance', 'Miscellaneous'
    )),
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Payment Gateway', 'Other')),
    reference TEXT,
    attachment_url TEXT,
    paid_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Paid', 'Rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Placement Support
CREATE TABLE IF NOT EXISTS placement_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    resume_url TEXT,
    resume_status TEXT NOT NULL DEFAULT 'Not Uploaded' CHECK (resume_status IN ('Not Uploaded', 'Pending Review', 'Reviewed & Approved', 'Needs Improvement')),
    mock_interview_status TEXT NOT NULL DEFAULT 'Not Scheduled' CHECK (mock_interview_status IN ('Not Scheduled', 'Scheduled', 'Completed', 'Needs Retake')),
    technical_interview_score NUMERIC CHECK (technical_interview_score BETWEEN 0 AND 100),
    hr_interview_score NUMERIC CHECK (hr_interview_score BETWEEN 0 AND 100),
    skills TEXT[] DEFAULT '{}',
    experience_years NUMERIC DEFAULT 0,
    preferred_location TEXT DEFAULT 'Hyderabad / Bengaluru / Pune',
    expected_salary_lpa NUMERIC DEFAULT 6.5,
    placement_status TEXT NOT NULL DEFAULT 'Not Started' CHECK (placement_status IN ('Not Started', 'Resume Preparation', 'Mock Interview', 'Job Search', 'Interview Scheduled', 'Interview Completed', 'Offer Received', 'Placed')),
    placed_company TEXT,
    placed_package_lpa NUMERIC,
    placed_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_openings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    module TEXT NOT NULL,
    experience_required TEXT NOT NULL,
    location TEXT NOT NULL,
    salary_range TEXT NOT NULL,
    description TEXT NOT NULL,
    application_deadline DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed', 'Draft')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected')),
    notes TEXT,
    UNIQUE(job_id, student_id)
);

-- 12. Certificates
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id TEXT UNIQUE NOT NULL,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    course_id UUID NOT NULL REFERENCES courses(id),
    course_name TEXT NOT NULL,
    grade TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completion_date DATE NOT NULL,
    attendance_percentage NUMERIC NOT NULL,
    assignment_completion_rate NUMERIC NOT NULL,
    exam_score_percentage NUMERIC NOT NULL,
    verification_url TEXT NOT NULL,
    is_valid BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Notifications, Audit Logs & System Settings
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
    category TEXT NOT NULL CHECK (category IN ('admission', 'payment', 'fee', 'class', 'assignment', 'exam', 'certificate', 'placement')),
    is_read BOOLEAN DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_name TEXT NOT NULL DEFAULT 'Next-Gen ERP Solutions',
    logo_url TEXT,
    tagline TEXT DEFAULT 'Excellence in Enterprise SAP Training & Placement',
    address TEXT NOT NULL DEFAULT 'Plot 42, Silicon Valley Towers, Hitec City, Hyderabad 500081',
    phone TEXT NOT NULL DEFAULT '+91 98765 43210',
    email TEXT NOT NULL DEFAULT 'admissions@next-generpsolutions.com',
    gst_number TEXT NOT NULL DEFAULT '36AAACN1234F1Z8',
    default_currency TEXT NOT NULL DEFAULT 'INR',
    academic_year TEXT NOT NULL DEFAULT '2026-2027',
    receipt_prefix TEXT NOT NULL DEFAULT 'REC',
    invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    enable_email_notifications BOOLEAN DEFAULT true,
    enable_sms_notifications BOOLEAN DEFAULT false,
    enable_whatsapp_notifications BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_counsellor ON leads(counsellor_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_course ON batches(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
