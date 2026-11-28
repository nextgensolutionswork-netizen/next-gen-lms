-- Fresh business schema; preserves login profiles. No demo or historical business data.
BEGIN;
-- SOURCE: 000 schema and RLS only
-- NEXT-GEN ERP SOLUTIONS: CONSOLIDATED PRODUCTION DATABASE SETUP
-- Target: Supabase PostgreSQL
-- Includes:
--   1. Extensions (uuid-ossp, pgcrypto)
--   2. All 37 Tables + Foreign Keys + Constraints + GST Compliance Fields
--   3. Performance & Lookup Indexes
--   4. Row-Level Security (RLS) Policies for All Tables (Default-Deny + RBAC)
--   5. Core Seed Data (Profiles, 8 Role Accounts, Courses, Batches, Students, Todos)
--   6. Supabase Storage Buckets & Storage Policies


-- 1. EXTENSIONS


-- 2. TABLE DEFINITIONS

-- 2.1 Profiles & Roles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'accountant', 'counsellor', 'trainer', 'placement_coordinator', 'support', 'student')),
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    branch_id UUID,
    assigned_course_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT '11111111-1111-1111-1111-111111111111',
    institute_name TEXT NOT NULL DEFAULT 'Next-Gen ERP Solutions',
    tagline TEXT DEFAULT 'Premier SAP Training Institute & Enterprise Academy',
    address TEXT DEFAULT 'Cyber Towers, HITEC City, Hyderabad, Telangana 500081',
    phone TEXT DEFAULT '+91 98000 00000',
    email TEXT DEFAULT 'info@next-generpsolutions.com',
    gst_number TEXT DEFAULT '36AAACN1234F1Z5',
    default_currency TEXT DEFAULT 'INR',
    academic_year TEXT DEFAULT '2026-2027',
    receipt_prefix TEXT DEFAULT 'REC-2026-',
    invoice_prefix TEXT DEFAULT 'INV-2026-',
    timezone TEXT DEFAULT 'Asia/Kolkata',
    enable_email_notifications BOOLEAN DEFAULT true,
    enable_sms_notifications BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 CRM & Leads
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    interested_course_id UUID,
    current_status TEXT NOT NULL DEFAULT 'New',
    experience_years NUMERIC DEFAULT 0,
    training_preference TEXT NOT NULL DEFAULT 'Online' CHECK (training_preference IN ('Online', 'Classroom', 'Hybrid')),
    lead_source TEXT NOT NULL DEFAULT 'Website' CHECK (lead_source IN ('Website', 'Google Ads', 'Meta Ads', 'Referral', 'Walk-in', 'Other')),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    counsellor_id UUID NOT NULL REFERENCES profiles(id),
    stage_before TEXT NOT NULL,
    stage_after TEXT NOT NULL,
    notes TEXT NOT NULL,
    next_follow_up_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Courses, Modules & Lessons
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 2.5 Batches & Scheduling
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 2.6 Admissions & Students (with GST Compliance fields)
CREATE TABLE IF NOT EXISTS admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_number TEXT UNIQUE NOT NULL,
    student_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    dob DATE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state VARCHAR(100),
    state_code VARCHAR(10),
    gstin VARCHAR(20),
    education TEXT NOT NULL,
    experience_years NUMERIC DEFAULT 0,
    current_employment_status TEXT NOT NULL CHECK (current_employment_status IN ('Employed', 'Unemployed', 'Student', 'Career Gap')),
    course_id UUID NOT NULL REFERENCES courses(id),
    training_mode TEXT NOT NULL CHECK (training_mode IN ('Online', 'Classroom', 'Hybrid')),
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    admission_id UUID UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
    student_code TEXT UNIQUE NOT NULL,
    admission_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    profile_photo TEXT,
    address TEXT,
    state VARCHAR(100),
    state_code VARCHAR(10),
    gstin VARCHAR(20),
    course_id UUID NOT NULL REFERENCES courses(id),
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'On Hold', 'Completed', 'Dropped Out')),
    total_fee NUMERIC NOT NULL DEFAULT 0,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    outstanding_amount NUMERIC NOT NULL DEFAULT 0,
    attendance_percentage NUMERIC NOT NULL DEFAULT 0,
    course_progress NUMERIC NOT NULL DEFAULT 0,
    placement_status TEXT NOT NULL DEFAULT 'Not Started' CHECK (placement_status IN ('Not Started', 'In Preparation', 'Eligible', 'Interviews Ongoing', 'Placed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batch_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Transferred', 'Dropped')),
    UNIQUE(batch_id, student_id)
);

CREATE TABLE IF NOT EXISTS batch_transfer_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_batch_id UUID REFERENCES batches(id),
    to_batch_id UUID NOT NULL REFERENCES batches(id),
    reason TEXT NOT NULL,
    transferred_by UUID NOT NULL REFERENCES profiles(id),
    transfer_date TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Academic Progress, Sessions & Attendance
CREATE TABLE IF NOT EXISTS lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT false,
    watched_seconds INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES profiles(id),
    title TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    meeting_link TEXT,
    room_number TEXT,
    status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'In Progress', 'Completed', 'Cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
    notes TEXT,
    marked_by UUID REFERENCES profiles(id),
    marked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, session_id)
);

-- 2.8 Assignments & Submissions
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    max_marks INTEGER NOT NULL DEFAULT 100,
    attachment_url TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    submission_url TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    marks_obtained INTEGER,
    feedback TEXT,
    graded_by UUID REFERENCES profiles(id),
    graded_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Graded', 'Resubmission Requested')),
    UNIQUE(assignment_id, student_id)
);

-- 2.9 Quizzes & Assessments
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    passing_percentage NUMERIC NOT NULL DEFAULT 60,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('MCQ', 'TrueFalse')),
    options JSONB NOT NULL,
    correct_option_index INTEGER NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score NUMERIC NOT NULL,
    percentage NUMERIC NOT NULL,
    passed BOOLEAN NOT NULL,
    answers JSONB NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.10 Accounts, Ledgers, Receipts (with Full GST Compliance)
CREATE TABLE IF NOT EXISTS student_fee_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    admission_id UUID UNIQUE NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    original_fee NUMERIC NOT NULL CHECK (original_fee >= 0),
    discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
    net_payable NUMERIC NOT NULL CHECK (net_payable >= 0),
    collected_amount NUMERIC NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
    outstanding_balance NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid', 'Partial', 'Pending', 'Overdue')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_account_id UUID NOT NULL REFERENCES student_fee_accounts(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    due_amount NUMERIC NOT NULL CHECK (due_amount > 0),
    paid_amount NUMERIC NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Paid', 'Partial', 'Upcoming', 'Overdue')),
    paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT UNIQUE NOT NULL,
    fee_account_id UUID NOT NULL REFERENCES student_fee_accounts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Cheque', 'Bank Transfer')),
    transaction_reference TEXT UNIQUE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    collected_by UUID NOT NULL REFERENCES profiles(id),
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT UNIQUE NOT NULL,
    payment_id UUID UNIQUE NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    amount_in_words TEXT NOT NULL,
    payment_mode TEXT NOT NULL,
    transaction_reference TEXT,
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    issued_by UUID NOT NULL REFERENCES profiles(id),
    pdf_url TEXT,
    supply_type VARCHAR(20) DEFAULT 'Intrastate',
    place_of_supply VARCHAR(100) DEFAULT 'Telangana',
    place_of_supply_code VARCHAR(10) DEFAULT '36',
    sac_code VARCHAR(20) DEFAULT '999293',
    taxable_amount NUMERIC(12,2),
    cgst_rate NUMERIC(5,2) DEFAULT 9.00,
    cgst_amount NUMERIC(12,2) DEFAULT 0.00,
    sgst_rate NUMERIC(5,2) DEFAULT 9.00,
    sgst_amount NUMERIC(12,2) DEFAULT 0.00,
    igst_rate NUMERIC(5,2) DEFAULT 0.00,
    igst_amount NUMERIC(12,2) DEFAULT 0.00,
    total_tax NUMERIC(12,2) DEFAULT 0.00,
    is_reverse_charge BOOLEAN DEFAULT FALSE,
    irn VARCHAR(64),
    ack_no VARCHAR(30),
    ack_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.11 Vendors & Expenses
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Hardware / Server', 'Marketing', 'Facility', 'Software / Cloud', 'Honorarium', 'Other')),
    gst_number TEXT,
    bank_account TEXT,
    ifsc_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_number TEXT UNIQUE NOT NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('Trainer Honorarium', 'Facility Rent', 'Electricity & Utilities', 'Cloud & Servers', 'Marketing & Ads', 'Software Licenses', 'Office Supplies', 'Miscellaneous')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('UPI', 'Bank Transfer', 'Credit Card', 'Cash', 'Cheque')),
    reference_number TEXT,
    invoice_url TEXT,
    recorded_by UUID NOT NULL REFERENCES profiles(id),
    status TEXT NOT NULL DEFAULT 'Approved' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.12 Placement Support
CREATE TABLE IF NOT EXISTS placement_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    resume_url TEXT,
    is_resume_approved BOOLEAN DEFAULT false,
    mock_interview_score NUMERIC,
    mock_interview_feedback TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    skills TEXT[] DEFAULT '{}',
    is_placement_ready BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_openings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    position TEXT NOT NULL,
    job_description TEXT NOT NULL,
    location TEXT NOT NULL,
    min_package NUMERIC,
    max_package NUMERIC,
    eligible_courses UUID[] DEFAULT '{}',
    application_deadline DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    posted_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Shortlisted', 'Interviewing', 'Offered', 'Rejected')),
    notes TEXT,
    UNIQUE(job_id, student_id)
);

-- 2.13 Certificates
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number TEXT UNIQUE NOT NULL,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completion_date DATE NOT NULL,
    grade TEXT NOT NULL DEFAULT 'Distinction' CHECK (grade IN ('Distinction', 'First Class', 'Pass')),
    pdf_url TEXT,
    verification_hash TEXT UNIQUE NOT NULL,
    is_valid BOOLEAN DEFAULT true,
    issued_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.14 SAP Lab Servers & Allocations
CREATE TABLE IF NOT EXISTS sap_server_systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_name TEXT NOT NULL,
    sid TEXT NOT NULL,
    instance_number TEXT NOT NULL DEFAULT '00',
    server_host TEXT NOT NULL,
    sap_router TEXT,
    default_client TEXT NOT NULL DEFAULT '800',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Online' CHECK (status IN ('Online', 'Maintenance', 'Offline')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sap_server_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    admission_number TEXT NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    system_id UUID NOT NULL REFERENCES sap_server_systems(id) ON DELETE CASCADE,
    system_name TEXT NOT NULL,
    server_host TEXT NOT NULL,
    sid TEXT NOT NULL,
    instance_number TEXT NOT NULL,
    client_number TEXT NOT NULL DEFAULT '800',
    sap_user_id TEXT NOT NULL,
    sap_password TEXT NOT NULL,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Revoked')),
    allocated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.15 Student Doubts & Academic Support Desk
CREATE TABLE IF NOT EXISTS student_doubts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    admission_number TEXT NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_name TEXT,
    assigned_to_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_to_name TEXT,
    assigned_to_role TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Academic Concept',
        'SAP Configuration',
        'Lab / Server Error',
        'Assignment Doubt',
        'General Query'
    )),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN (
        'Open',
        'Assigned',
        'In Progress',
        'Resolved',
        'Closed'
    )),
    sap_tcode TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doubt_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doubt_id UUID NOT NULL REFERENCES student_doubts(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.16 Notifications, Audit Logs & Diagnostic Todos
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Info', 'Warning', 'Success', 'Urgent')),
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    record_id TEXT,
    payload JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_counsellor ON leads(counsellor_id);
CREATE INDEX IF NOT EXISTS idx_admissions_student ON admissions(student_name);
CREATE INDEX IF NOT EXISTS idx_admissions_gstin ON admissions(gstin);
CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_students_gstin ON students(gstin);
CREATE INDEX IF NOT EXISTS idx_attendance_student_session ON attendance_records(student_id, session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_batch_date ON attendance_records(batch_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_irn ON receipts(irn);
CREATE INDEX IF NOT EXISTS idx_sap_alloc_student ON sap_server_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_sap_alloc_system ON sap_server_allocations(system_id);
CREATE INDEX IF NOT EXISTS idx_doubts_student ON student_doubts(student_id);
CREATE INDEX IF NOT EXISTS idx_doubts_assigned ON student_doubts(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_doubt_messages_doubt ON doubt_messages(doubt_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module, created_at);

-- 4. ROW-LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE sap_server_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE sap_server_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_doubts ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubt_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4.1 System Settings: Anyone can read, Super Admin manages
DROP POLICY IF EXISTS "Public can view settings" ON system_settings;
CREATE POLICY "Public can view settings" ON system_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super Admin manage settings" ON system_settings;
CREATE POLICY "Super Admin manage settings" ON system_settings
  FOR ALL USING (get_current_user_role() = 'super_admin');

-- 4.2 Profiles
DROP POLICY IF EXISTS "Super Admins can manage all profiles" ON profiles;
CREATE POLICY "Super Admins can manage all profiles" ON profiles
  FOR ALL USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Staff can view staff profiles" ON profiles;
CREATE POLICY "Staff can view staff profiles" ON profiles
  FOR SELECT USING (get_current_user_role() IN ('admin', 'counsellor', 'trainer', 'placement_coordinator', 'accountant', 'support'));

-- 4.3 Courses, Modules & Lessons
DROP POLICY IF EXISTS "Super Admins and Admins manage courses" ON courses;
CREATE POLICY "Super Admins and Admins manage courses" ON courses
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Trainers view assigned courses" ON courses;
CREATE POLICY "Trainers view assigned courses" ON courses
  FOR SELECT USING (
    get_current_user_role() = 'trainer' AND
    id IN (SELECT unnest(assigned_course_ids) FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Counsellors view courses" ON courses;
CREATE POLICY "Counsellors view courses" ON courses
  FOR SELECT USING (get_current_user_role() = 'counsellor');

DROP POLICY IF EXISTS "Students view enrolled courses" ON courses;
CREATE POLICY "Students view enrolled courses" ON courses
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    status = 'Published' AND
    id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Public view published courses" ON courses;
CREATE POLICY "Public view published courses" ON courses
  FOR SELECT USING (status = 'Published');

DROP POLICY IF EXISTS "Admin manage modules" ON course_modules;
CREATE POLICY "Admin manage modules" ON course_modules
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Trainers view assigned modules" ON course_modules;
CREATE POLICY "Trainers view assigned modules" ON course_modules
  FOR SELECT USING (
    get_current_user_role() = 'trainer' AND
    course_id IN (SELECT unnest(assigned_course_ids) FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Students view enrolled modules" ON course_modules;
CREATE POLICY "Students view enrolled modules" ON course_modules
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    course_id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manage lessons" ON lessons;
CREATE POLICY "Admin manage lessons" ON lessons
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Trainers manage assigned lessons" ON lessons;
CREATE POLICY "Trainers manage assigned lessons" ON lessons
  FOR ALL USING (
    get_current_user_role() = 'trainer' AND
    course_id IN (SELECT unnest(assigned_course_ids) FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Students view enrolled lessons" ON lessons;
CREATE POLICY "Students view enrolled lessons" ON lessons
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    is_published = true AND
    course_id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

-- 4.4 Batches
DROP POLICY IF EXISTS "Admins manage batches" ON batches;
CREATE POLICY "Admins manage batches" ON batches
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Trainers view assigned batches" ON batches;
CREATE POLICY "Trainers view assigned batches" ON batches
  FOR SELECT USING (
    get_current_user_role() = 'trainer' AND trainer_id = auth.uid()
  );

DROP POLICY IF EXISTS "Students view enrolled batch" ON batches;
CREATE POLICY "Students view enrolled batch" ON batches
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    id IN (SELECT batch_id FROM students WHERE user_id = auth.uid())
  );

-- 4.5 Students & Enrollment
DROP POLICY IF EXISTS "Staff view all students" ON students;
CREATE POLICY "Staff view all students" ON students
  FOR SELECT USING (
    get_current_user_role() IN ('super_admin', 'admin', 'counsellor', 'trainer', 'placement_coordinator', 'accountant', 'support')
  );

DROP POLICY IF EXISTS "Admins manage students" ON students;
CREATE POLICY "Admins manage students" ON students
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Students view own profile" ON students;
CREATE POLICY "Students view own profile" ON students
  FOR SELECT USING (
    get_current_user_role() = 'student' AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins manage batch students" ON batch_students;
CREATE POLICY "Admins manage batch students" ON batch_students
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Admins manage batch transfer audits" ON batch_transfer_audits;
CREATE POLICY "Admins manage batch transfer audits" ON batch_transfer_audits
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

-- 4.6 Lesson Progress
DROP POLICY IF EXISTS "Students manage own progress" ON lesson_progress;
CREATE POLICY "Students manage own progress" ON lesson_progress
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff view progress" ON lesson_progress;
CREATE POLICY "Staff view progress" ON lesson_progress
  FOR SELECT USING (
    get_current_user_role() IN ('super_admin', 'admin', 'trainer')
  );

-- 4.7 Class Sessions & Attendance
DROP POLICY IF EXISTS "Staff manage class sessions" ON class_sessions;
CREATE POLICY "Staff manage class sessions" ON class_sessions
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students view class sessions" ON class_sessions;
CREATE POLICY "Students view class sessions" ON class_sessions
  FOR SELECT USING (
    batch_id IN (SELECT batch_id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage attendance records" ON attendance_records;
CREATE POLICY "Staff manage attendance records" ON attendance_records
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students view own attendance" ON attendance_records;
CREATE POLICY "Students view own attendance" ON attendance_records
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- 4.8 Assignments & Submissions
DROP POLICY IF EXISTS "Staff manage assignments" ON assignments;
CREATE POLICY "Staff manage assignments" ON assignments
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students view assignments" ON assignments;
CREATE POLICY "Students view assignments" ON assignments
  FOR SELECT USING (
    get_current_user_role() = 'student' AND
    course_id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students manage own submissions" ON assignment_submissions;
CREATE POLICY "Students manage own submissions" ON assignment_submissions
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage all submissions" ON assignment_submissions;
CREATE POLICY "Staff manage all submissions" ON assignment_submissions
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

-- 4.9 Quizzes & Assessments
DROP POLICY IF EXISTS "Staff manage quizzes" ON quizzes;
CREATE POLICY "Staff manage quizzes" ON quizzes
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students view published quizzes" ON quizzes;
CREATE POLICY "Students view published quizzes" ON quizzes
  FOR SELECT USING (
    is_published = true AND
    course_id IN (SELECT course_id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage quiz questions" ON quiz_questions;
CREATE POLICY "Staff manage quiz questions" ON quiz_questions
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students manage own attempts" ON quiz_attempts;
CREATE POLICY "Students manage own attempts" ON quiz_attempts
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff view quiz attempts" ON quiz_attempts;
CREATE POLICY "Staff view quiz attempts" ON quiz_attempts
  FOR SELECT USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

-- 4.10 CRM Leads & Admissions
DROP POLICY IF EXISTS "CRM staff manage leads" ON leads;
CREATE POLICY "CRM staff manage leads" ON leads
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'counsellor'));

DROP POLICY IF EXISTS "CRM staff manage followups" ON lead_followups;
CREATE POLICY "CRM staff manage followups" ON lead_followups
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'counsellor'));

DROP POLICY IF EXISTS "Admissions access" ON admissions;
CREATE POLICY "Admissions access" ON admissions
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'counsellor'));

-- 4.11 Finance (Fee Accounts, Installments, Payments, Receipts, Expenses, Vendors)
DROP POLICY IF EXISTS "Accounts manage fee accounts" ON student_fee_accounts;
CREATE POLICY "Accounts manage fee accounts" ON student_fee_accounts
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

DROP POLICY IF EXISTS "Students view own fee account" ON student_fee_accounts;
CREATE POLICY "Students view own fee account" ON student_fee_accounts
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Accounts manage installments" ON installments;
CREATE POLICY "Accounts manage installments" ON installments
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

DROP POLICY IF EXISTS "Students view own installments" ON installments;
CREATE POLICY "Students view own installments" ON installments
  FOR SELECT USING (
    fee_account_id IN (
      SELECT id FROM student_fee_accounts WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Accounts manage payments" ON payments;
CREATE POLICY "Accounts manage payments" ON payments
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

DROP POLICY IF EXISTS "Students view own payments" ON payments;
CREATE POLICY "Students view own payments" ON payments
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Accounts manage receipts" ON receipts;
CREATE POLICY "Accounts manage receipts" ON receipts
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

DROP POLICY IF EXISTS "Students view own receipts" ON receipts;
CREATE POLICY "Students view own receipts" ON receipts
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Accounts manage expenses" ON expenses;
CREATE POLICY "Accounts manage expenses" ON expenses
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

DROP POLICY IF EXISTS "Accounts manage vendors" ON vendors;
CREATE POLICY "Accounts manage vendors" ON vendors
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'accountant'));

-- 4.12 Placement Support
DROP POLICY IF EXISTS "Placement staff manage profiles" ON placement_profiles;
CREATE POLICY "Placement staff manage profiles" ON placement_profiles
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'placement_coordinator'));

DROP POLICY IF EXISTS "Students manage own placement profile" ON placement_profiles;
CREATE POLICY "Students manage own placement profile" ON placement_profiles
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Placement staff manage job openings" ON job_openings;
CREATE POLICY "Placement staff manage job openings" ON job_openings
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'placement_coordinator'));

DROP POLICY IF EXISTS "Students view open jobs" ON job_openings;
CREATE POLICY "Students view open jobs" ON job_openings
  FOR SELECT USING (status = 'Open');

DROP POLICY IF EXISTS "Students submit job applications" ON job_applications;
CREATE POLICY "Students submit job applications" ON job_applications
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Placement staff view job applications" ON job_applications;
CREATE POLICY "Placement staff view job applications" ON job_applications
  FOR SELECT USING (get_current_user_role() IN ('super_admin', 'admin', 'placement_coordinator'));

-- 4.13 Certificates & Public Verification
DROP POLICY IF EXISTS "Staff manage certificates" ON certificates;
CREATE POLICY "Staff manage certificates" ON certificates
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students view own certificates" ON certificates;
CREATE POLICY "Students view own certificates" ON certificates
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can verify valid certificates" ON certificates;
CREATE POLICY "Anyone can verify valid certificates" ON certificates
  FOR SELECT USING (is_valid = true);

-- 4.14 SAP Lab Servers & Allocations
DROP POLICY IF EXISTS "Staff view SAP systems" ON sap_server_systems;
CREATE POLICY "Staff view SAP systems" ON sap_server_systems
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage SAP systems" ON sap_server_systems;
CREATE POLICY "Admins manage SAP systems" ON sap_server_systems
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "Staff manage SAP allocations" ON sap_server_allocations;
CREATE POLICY "Staff manage SAP allocations" ON sap_server_allocations
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer'));

DROP POLICY IF EXISTS "Students view own SAP allocations" ON sap_server_allocations;
CREATE POLICY "Students view own SAP allocations" ON sap_server_allocations
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- 4.15 Student Doubts Desk & Messages
DROP POLICY IF EXISTS "Staff manage student doubts" ON student_doubts;
CREATE POLICY "Staff manage student doubts" ON student_doubts
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer', 'support'));

DROP POLICY IF EXISTS "Students manage own doubts" ON student_doubts;
CREATE POLICY "Students manage own doubts" ON student_doubts
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff view doubt messages" ON doubt_messages;
CREATE POLICY "Staff view doubt messages" ON doubt_messages
  FOR ALL USING (get_current_user_role() IN ('super_admin', 'admin', 'trainer', 'support'));

DROP POLICY IF EXISTS "Students view doubt messages" ON doubt_messages;
CREATE POLICY "Students view doubt messages" ON doubt_messages
  FOR ALL USING (
    doubt_id IN (
      SELECT id FROM student_doubts WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

-- 4.16 Notifications, Audit Logs & Diagnostic Todos
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Super Admin can view audit logs" ON audit_logs;
CREATE POLICY "Super Admin can view audit logs" ON audit_logs
  FOR SELECT USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Anyone can insert audit logs" ON audit_logs;
CREATE POLICY "Anyone can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Todos public access" ON todos;
CREATE POLICY "Todos public access" ON todos
  FOR ALL USING (true) WITH CHECK (true);



-- SOURCE: 006_onboarding_team_and_cases.sql
-- Next-Gen ERP LMS: 006_onboarding_team_and_cases.sql
-- Onboarding Team Role, Case Lifecycle, and Row Level Security Isolation


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



-- SOURCE: 20261012094737_payment_approval_workflow.sql
-- Existing installations are one institute. Provision new memberships explicitly;
-- browser-supplied tenant IDs are never authoritative.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'admissions', 'student_fee_accounts', 'installments', 'payments', 'receipts', 'onboarding_cases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT ''default''', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY workflow_tenant_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))) WITH CHECK (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))', t);
  END LOOP;
END $$;

CREATE POLICY profile_tenant_boundary ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid())) = 'super_admin'
    OR id = (SELECT auth.uid())
    OR tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

CREATE TABLE public.fee_workflow_state (
  tenant_id text PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_workflow_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_workflow_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fee_workflow_state TO service_role;
COMMENT ON TABLE public.fee_workflow_state IS 'Authoritative transactional snapshot for the existing LMS dual-ledger adapter. API validates current profile and tenant before reads or writes. Never accepts browser snapshots.';

CREATE TABLE public.student_lms_access (
  user_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_lms_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.student_lms_access TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.student_lms_access TO service_role;
REVOKE ALL ON public.student_lms_access FROM anon;
CREATE POLICY own_lms_access ON public.student_lms_access FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

-- One database transaction for compare-and-swap plus the middleware access gate.
-- Invoker security, service-only execution: neither authenticated clients nor anonymous
-- callers can insert a forged approval or bypass the application decision checks.
CREATE FUNCTION public.commit_fee_workflow(p_tenant text, p_revision bigint, p_snapshot jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE new_revision bigint; student jsonb; case_record jsonb; enabled boolean;
BEGIN
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot) ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state SET revision = revision + 1, snapshot = p_snapshot, updated_at = now()
      WHERE tenant_id = p_tenant AND revision = p_revision RETURNING revision INTO new_revision;
  END IF;
  IF new_revision IS NULL THEN RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001'; END IF;

  FOR student IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    IF student->>'onboarding_required' = 'true' AND student->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = student->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false);
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES (student->>'user_id', p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;
  RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;

-- Existing profiles policies can allow own-row edits. Do not allow those edits to
-- change the authoritative role, active flag or tenant membership.
CREATE FUNCTION public.protect_profile_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND
    (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'Profile authority fields require a server administrator';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_authority BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;
-- Restrictive policies also block broad pre-existing authenticated storage policies.
CREATE POLICY payment_proofs_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'payment-proofs') WITH CHECK (bucket_id <> 'payment-proofs');


-- SOURCE: 20261022_fix_profile_rls_recursion.sql
-- Fix RLS Infinite Recursion on Profiles and Workflow Tables

CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS profile_tenant_boundary ON public.profiles;

CREATE POLICY profile_tenant_boundary ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR get_current_user_role() = 'super_admin'
    OR tenant_id = get_current_user_tenant_id()
  );

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'admissions', 'student_fee_accounts', 'installments', 'payments', 'receipts', 'onboarding_cases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS workflow_tenant_boundary ON public.%I', t);
    EXECUTE format('CREATE POLICY workflow_tenant_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = get_current_user_tenant_id()) WITH CHECK (tenant_id = get_current_user_tenant_id())', t);
  END LOOP;
END $$;


-- SOURCE: 20261102_crm_lead_enhancements.sql
-- Migration: CRM Lead Creation Form Enhancements
-- Date: 2026-11-02
-- Description: Adds international country code and WhatsApp number support,
--              updates training_preference constraint (Online, Offline, Classroom, Hybrid),
--              and adds YouTube to lead_source check constraint.

-- 1. Add country_code, whatsapp_country_code, and whatsapp_number columns
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS whatsapp_country_code TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- 2. Populate default country code for existing historical records
UPDATE leads 
SET country_code = '+91' 
WHERE country_code IS NULL;

UPDATE leads 
SET whatsapp_country_code = '+91' 
WHERE whatsapp_country_code IS NULL;

-- 3. Update training_preference check constraint
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%training_preference%'
  ) LOOP
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE leads 
  ADD CONSTRAINT leads_training_preference_check 
  CHECK (training_preference IN ('Online', 'Offline', 'Classroom', 'Hybrid'));

-- 4. Update lead_source check constraint to include YouTube
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%lead_source%'
  ) LOOP
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE leads 
  ADD CONSTRAINT leads_lead_source_check 
  CHECK (lead_source IN ('Website', 'Google Ads', 'Meta Ads', 'YouTube', 'Referral', 'Walk-in', 'Other'));


-- SOURCE: 20261103_student_enrollment_enhancements.sql
-- Migration: Student Enrollment Form Enhancements
-- Date: 2026-11-03
-- Description:
--   1. Adds student_unique_id (NGERP-YYYY-XXXXX format), alternate_phone, and photo_url to students & admissions.
--   2. Adds receiving bank fields (our_bank_name, our_bank_account_name, our_bank_account_id, our_upi_details)
--      to admissions, student_payments, and payments.
--   3. Creates monotonic sequence and helper function for student_unique_id.
--   4. Configures private storage bucket 'student-photos' with 2MB size limit and image MIME restrictions.

-- 1. Alter students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS student_unique_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_students_student_unique_id ON students(student_unique_id);
CREATE INDEX IF NOT EXISTS idx_students_alternate_phone ON students(alternate_phone);

-- 2. Alter admissions table
ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS student_unique_id TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_account_id TEXT,
  ADD COLUMN IF NOT EXISTS our_upi_details TEXT;

CREATE INDEX IF NOT EXISTS idx_admissions_student_unique_id ON admissions(student_unique_id);

-- 3. Alter student_payments & payments tables


ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS our_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_account_id TEXT,
  ADD COLUMN IF NOT EXISTS our_upi_details TEXT;

-- 4. Monotonic, non-reusing sequence for student unique IDs
CREATE SEQUENCE IF NOT EXISTS student_unique_id_seq START WITH 1 INCREMENT BY 1;

-- Function to safely generate the next student unique ID: NGERP-YYYY-XXXXX
CREATE OR REPLACE FUNCTION generate_next_student_unique_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_num BIGINT;
  curr_year TEXT;
BEGIN
  seq_num := nextval('student_unique_id_seq');
  curr_year := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'NGERP-' || curr_year || '-' || LPAD(seq_num::TEXT, 5, '0');
END;
$$;

-- 5. Storage bucket setup for student photographs (Private, max 2MB, JPG/PNG/WEBP)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-photos',
  'student-photos',
  false,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Storage RLS policies for student-photos bucket
DO $$
BEGIN
  -- Authenticated staff/admins can upload student photos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated staff can upload student photos'
  ) THEN
    CREATE POLICY "Authenticated staff can upload student photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'student-photos');
  END IF;

  -- Authenticated users can view student photos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can view student photos'
  ) THEN
    CREATE POLICY "Authenticated users can view student photos"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'student-photos');
  END IF;
END $$;


-- SOURCE: bank schema without account seeds
-- Migration: 20261116_bank_account_presets.sql
-- Description:
--   1. Creates bank_account_presets table for institute receiving account presets.
--   2. Archives obsolete HDFC primary presets and inserts the 20 reference accounts.
--   3. Adds authorized_bank_accounts column to system_settings.
--   4. Configures RLS policies to restrict configuration and protect financial credentials.

-- 1. Create bank_account_presets table
CREATE TABLE IF NOT EXISTS bank_account_presets (
    id TEXT PRIMARY KEY,
    account_holder_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    ifsc_code TEXT, -- Preserved for schema compatibility, but omitted from active UI
    branch TEXT DEFAULT 'Main Branch',
    account_type TEXT DEFAULT 'Current',
    upi_id TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'archived')),
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    verified_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_presets_status ON bank_account_presets(is_active, is_verified, is_archived);

-- 2. Alter system_settings table to support authorized_bank_accounts jsonb
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS authorized_bank_accounts JSONB DEFAULT '[]'::jsonb;

-- 3. Archive any obsolete historical presets
UPDATE bank_account_presets
SET is_archived = true,
    is_active = false,
    verification_status = 'archived',
    archived_at = NOW(),
    updated_at = NOW()
WHERE account_number LIKE '%50200088991122%'
   OR account_holder_name ILIKE '%NEXT GEN ERP SOLUTIONS PRIVATE LIMITED%'
   OR upi_id = 'nextgenerp@hdfcbank';

-- 4. Idempotently insert the 20 reference replacement accounts


-- 5. Enable Row-Level Security
ALTER TABLE bank_account_presets ENABLE ROW LEVEL SECURITY;

-- 5.1 Authenticated users can view verified active presets
CREATE POLICY "Authenticated users view active verified bank presets"
ON bank_account_presets FOR SELECT
TO authenticated
USING (
    is_active = true 
    AND is_verified = true 
    AND is_archived = false
);

-- 5.2 Administrators & Super Admins can manage all bank presets
CREATE POLICY "Admins manage bank presets"
ON bank_account_presets FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'super_admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'super_admin')
    )
);


-- SOURCE: 20261116_placement_enrollments.sql
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
    id TEXT PRIMARY KEY DEFAULT ('pe-' || replace(gen_random_uuid()::text, '-', '')),
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
    id TEXT PRIMARY KEY DEFAULT ('pesh-' || replace(gen_random_uuid()::text, '-', '')),
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



-- SOURCE: 20261118_add_job_openings_description.sql
-- Migration: Add missing description and job fields to public.job_openings
-- BUG-PL-001: Ensure description and modern job fields persist cleanly in PostgreSQL

ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS experience_required TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS salary_range TEXT;

-- Make legacy columns nullable so inserts using only modern columns do not fail
ALTER TABLE public.job_openings ALTER COLUMN position DROP NOT NULL;
ALTER TABLE public.job_openings ALTER COLUMN job_description DROP NOT NULL;

-- Create sync trigger to maintain bidirectional compatibility between position/job_title and job_description/description
CREATE OR REPLACE FUNCTION sync_job_openings_compat_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Synchronize title
    IF NEW.job_title IS NOT NULL AND (NEW.position IS NULL OR NEW.position = '') THEN
        NEW.position := NEW.job_title;
    ELSIF NEW.position IS NOT NULL AND (NEW.job_title IS NULL OR NEW.job_title = '') THEN
        NEW.job_title := NEW.position;
    END IF;

    -- Synchronize description
    IF NEW.description IS NOT NULL AND (NEW.job_description IS NULL OR NEW.job_description = '') THEN
        NEW.job_description := NEW.description;
    ELSIF NEW.job_description IS NOT NULL AND (NEW.description IS NULL OR NEW.description = '') THEN
        NEW.description := NEW.job_description;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_job_openings_compat ON public.job_openings;
CREATE TRIGGER trg_sync_job_openings_compat
BEFORE INSERT OR UPDATE ON public.job_openings
FOR EACH ROW
EXECUTE FUNCTION sync_job_openings_compat_columns();

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';


-- SOURCE: 20261118_atomic_admission_sequence_and_workflow.sql
-- ==============================================================================
-- Migration: 20261118_atomic_admission_sequence_and_workflow.sql
-- Description:
-- 1. Database-backed atomic sequence allocator for admission numbers with
--    cross-tenant uniqueness guarantees, collision skipping, and advisory transaction locks
-- 2. Atomic CRM Lead stage synchronization inside commit_fee_workflow transaction
--    with strict cross-tenant isolation and foreign key validation
-- 3. Snapshot duplicate admission number check enforcing global uniqueness
-- 4. Dynamic baseline calculation across all applicable years, tenants, admissions, snapshots, and lead notes
-- 5. Strict service_role RPC privileges and SECURITY DEFINER search_path isolation
-- ==============================================================================

-- 1. Atomic Admission Sequences Table & Lead Tenant Boundary
CREATE TABLE IF NOT EXISTS public.admission_sequences (
  tenant_id text NOT NULL,
  year integer NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE public.admission_sequences ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.admission_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admission_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admission_sequences TO service_role, postgres;

-- Ensure leads, admissions, and students tables have tenant_id for tenant boundary isolation
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenant_id text DEFAULT 'default';
CREATE INDEX IF NOT EXISTS leads_tenant_idx ON public.leads(tenant_id);

ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS tenant_id text DEFAULT 'default';
CREATE INDEX IF NOT EXISTS admissions_tenant_idx ON public.admissions(tenant_id);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS tenant_id text DEFAULT 'default';
CREATE INDEX IF NOT EXISTS students_tenant_idx ON public.students(tenant_id);

-- 2. Dynamically calculate and seed existing sequences across all applicable years and tenants
DO $$
DECLARE
  r_year record;
  r_tenant record;
  v_max_seq integer := 0;
  v_student_seq integer := 0;
  v_snap_seq integer := 0;
  v_lead_seq integer := 0;
BEGIN
  -- Discover all active years across admissions, students, fee_workflow_state, leads notes, and current year
  FOR r_year IN (
    SELECT DISTINCT yr FROM (
      SELECT (SUBSTRING(admission_number FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.admissions
      WHERE admission_number ~ '^ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT (SUBSTRING(admission_number FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.students
      WHERE admission_number ~ '^ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT (SUBSTRING(elem->>'admission_number' FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.fee_workflow_state fws,
           jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' ~ '^ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT (SUBSTRING(elem->>'admission_number' FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.fee_workflow_state fws,
           jsonb_array_elements(COALESCE(fws.snapshot->'students', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' ~ '^ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT (SUBSTRING(notes FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.leads
      WHERE notes ~ 'ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT EXTRACT(YEAR FROM CURRENT_DATE)::integer AS yr
    ) y
    WHERE yr IS NOT NULL AND yr >= 2000
    ORDER BY yr
  ) LOOP

    -- Discover all active tenants
    FOR r_tenant IN (
      SELECT DISTINCT t.tenant_id FROM (
        SELECT fws.tenant_id FROM public.fee_workflow_state fws
        UNION
        SELECT 'default' AS tenant_id
      ) t
      WHERE t.tenant_id IS NOT NULL AND t.tenant_id <> ''
    ) LOOP
      -- Max sequence from admissions table for this tenant and year
      v_max_seq := 0;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admissions' AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format(
          'SELECT COALESCE(MAX(SUBSTRING(admission_number FROM ''ADM-[0-9]+-([0-9]+)'')::integer), 0)
           FROM public.admissions
           WHERE COALESCE(tenant_id, ''default'') = %L AND admission_number LIKE %L',
          r_tenant.tenant_id, 'ADM-' || r_year.yr || '-%'
        ) INTO v_max_seq;
      ELSE
        SELECT COALESCE(MAX(SUBSTRING(admission_number FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
        INTO v_max_seq
        FROM public.admissions
        WHERE admission_number LIKE 'ADM-' || r_year.yr || '-%';
      END IF;

      -- Max sequence from students table for this tenant and year
      v_student_seq := 0;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format(
          'SELECT COALESCE(MAX(SUBSTRING(admission_number FROM ''ADM-[0-9]+-([0-9]+)'')::integer), 0)
           FROM public.students
           WHERE COALESCE(tenant_id, ''default'') = %L AND admission_number LIKE %L',
          r_tenant.tenant_id, 'ADM-' || r_year.yr || '-%'
        ) INTO v_student_seq;
      ELSE
        SELECT COALESCE(MAX(SUBSTRING(admission_number FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
        INTO v_student_seq
        FROM public.students
        WHERE admission_number LIKE 'ADM-' || r_year.yr || '-%';
      END IF;

      -- Max sequence from fee_workflow_state snapshot for this tenant and year (both admissions and students arrays)
      SELECT COALESCE(MAX(SUBSTRING(elem->>'admission_number' FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
      INTO v_snap_seq
      FROM (
        SELECT elem FROM public.fee_workflow_state fws,
             jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
        WHERE fws.tenant_id = r_tenant.tenant_id
        UNION ALL
        SELECT elem FROM public.fee_workflow_state fws,
             jsonb_array_elements(COALESCE(fws.snapshot->'students', '[]'::jsonb)) AS elem
        WHERE fws.tenant_id = r_tenant.tenant_id
      ) snap_elems
      WHERE elem->>'admission_number' LIKE 'ADM-' || r_year.yr || '-%';

      -- For 'default' tenant, also include conversion references from leads notes
      IF r_tenant.tenant_id = 'default' THEN
        SELECT COALESCE(MAX(SUBSTRING(notes FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
        INTO v_lead_seq
        FROM public.leads
        WHERE notes LIKE '%ADM-' || r_year.yr || '-%';

        v_max_seq := GREATEST(v_max_seq, v_student_seq, v_snap_seq, v_lead_seq);
      ELSE
        v_max_seq := GREATEST(v_max_seq, v_student_seq, v_snap_seq);
      END IF;

      INSERT INTO public.admission_sequences (tenant_id, year, last_sequence, updated_at)
      VALUES (r_tenant.tenant_id, r_year.yr, v_max_seq, now())
      ON CONFLICT (tenant_id, year) DO UPDATE
        SET last_sequence = GREATEST(public.admission_sequences.last_sequence, EXCLUDED.last_sequence),
            updated_at = now();
    END LOOP;
  END LOOP;
END $$;

-- 3. Atomic Admission Number Allocation Function with Collision Skipping
CREATE OR REPLACE FUNCTION public.allocate_admission_number(p_tenant text, p_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq integer;
  v_adm_num text;
BEGIN
  IF p_tenant IS NULL OR p_tenant = '' THEN
    p_tenant := 'default';
  END IF;
  IF p_year IS NULL OR p_year < 2000 THEN
    p_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  END IF;

  -- Acquire an advisory transaction lock scoped to the year.
  -- Serializes allocation requests across concurrent callers to prevent race conditions.
  PERFORM pg_advisory_xact_lock(hashtext('admission_sequence_' || p_year::text));

  -- Ensure sequence record exists
  INSERT INTO public.admission_sequences (tenant_id, year, last_sequence, updated_at)
  VALUES (p_tenant, p_year, 0, now())
  ON CONFLICT (tenant_id, year) DO NOTHING;

  -- Increment sequence and verify candidate number against global unique constraints.
  -- Checks admissions table, students table, and all fee_workflow_state snapshots (admissions & students).
  -- If candidate number is occupied anywhere, loops forward to the next available sequence.
  LOOP
    UPDATE public.admission_sequences
    SET last_sequence = last_sequence + 1,
        updated_at = now()
    WHERE tenant_id = p_tenant AND year = p_year
    RETURNING last_sequence INTO v_seq;

    v_adm_num := 'ADM-' || p_year::text || '-' || LPAD(v_seq::text, 4, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.admissions WHERE admission_number = v_adm_num
      UNION
      SELECT 1 FROM public.students WHERE admission_number = v_adm_num
      UNION
      SELECT 1 FROM public.fee_workflow_state fws,
        jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' = v_adm_num
      UNION
      SELECT 1 FROM public.fee_workflow_state fws,
        jsonb_array_elements(COALESCE(fws.snapshot->'students', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' = v_adm_num
    );
  END LOOP;

  RETURN v_adm_num;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_admission_number(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_admission_number(text, integer) TO service_role, postgres;

-- 4. Atomic Fee Workflow Commit with Differential CRM Lead Synchronization
CREATE OR REPLACE FUNCTION public.commit_fee_workflow(p_tenant text, p_revision bigint, p_snapshot jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_revision bigint;
  student jsonb;
  case_record jsonb;
  enabled boolean;
  r_lead record;
  r_malformed record;
  v_lead_tenant text;
  v_prev_snapshot jsonb;
BEGIN
  IF p_tenant IS NULL OR p_tenant = '' THEN
    p_tenant := 'default';
  END IF;

  -- 1. Check for duplicate admission numbers within the incoming snapshot
  IF EXISTS (
    SELECT 1 
    FROM (
      SELECT elem->>'admission_number' AS adm_num, count(*) 
      FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' IS NOT NULL
      GROUP BY elem->>'admission_number'
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Snapshot contains duplicate admission numbers' USING ERRCODE = '23505';
  END IF;

  -- 2. Check for cross-tenant duplicate admission numbers in other workflow states
  IF EXISTS (
    SELECT 1 
    FROM public.fee_workflow_state other_fws,
         jsonb_array_elements(COALESCE(other_fws.snapshot->'admissions', '[]'::jsonb)) AS other_elem,
         jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS incoming_elem
    WHERE other_fws.tenant_id <> p_tenant
      AND other_elem->>'admission_number' IS NOT NULL
      AND other_elem->>'admission_number' = incoming_elem->>'admission_number'
  ) THEN
    RAISE EXCEPTION 'Admission number already exists in another tenant fee workflow' USING ERRCODE = '23505';
  END IF;

  -- 3. Explicitly validate format of non-empty lead IDs across incoming admissions
  FOR r_malformed IN
    SELECT 
      COALESCE(elem->>'id', elem->>'admission_number', 'unknown') AS adm_key,
      elem->>'lead_id' AS lead_id
    FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS elem
    WHERE elem->>'lead_id' IS NOT NULL 
      AND TRIM(elem->>'lead_id') <> ''
      AND elem->>'lead_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    RAISE EXCEPTION 'Malformed lead_id "%" for admission "%": must be a valid RFC-4122 UUID', 
      r_malformed.lead_id, r_malformed.adm_key
      USING ERRCODE = '22P02';
  END LOOP;

  -- 4. Capture previous snapshot for differential change detection
  IF p_revision > 0 THEN
    SELECT snapshot INTO v_prev_snapshot
    FROM public.fee_workflow_state
    WHERE tenant_id = p_tenant AND revision = p_revision;

    IF v_prev_snapshot IS NULL THEN
      RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001';
    END IF;
  ELSE
    v_prev_snapshot := '{}'::jsonb;
  END IF;

  -- 5. Compare-and-swap update on fee_workflow_state
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot) ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state 
    SET revision = revision + 1, 
        snapshot = p_snapshot, 
        updated_at = now()
    WHERE tenant_id = p_tenant AND revision = p_revision 
    RETURNING revision INTO new_revision;
  END IF;

  IF new_revision IS NULL THEN 
    RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001'; 
  END IF;

  -- 6. Maintain student_lms_access gates
  FOR student IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    IF student->>'onboarding_required' = 'true' AND student->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = student->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false);
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES (student->>'user_id', p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;

  -- 7. Atomically synchronize ONLY new or changed CRM Lead conversions
  -- Differential comparison checks:
  --   a) New admission added with lead_id
  --   b) Existing admission with changed lead_id
  --   c) Existing admission with changed admission_number
  -- Historical unchanged admissions referencing missing leads are skipped,
  -- ensuring Accountant workflow updates are never blocked.
  FOR r_lead IN
    WITH incoming_admissions AS (
      SELECT 
        COALESCE(elem->>'id', elem->>'admission_number') AS adm_key,
        (elem->>'lead_id')::uuid AS lead_id,
        elem->>'admission_number' AS admission_number
      FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'lead_id' IS NOT NULL 
        AND TRIM(elem->>'lead_id') <> ''
    ),
    previous_admissions AS (
      SELECT 
        COALESCE(elem->>'id', elem->>'admission_number') AS adm_key,
        elem->>'lead_id' AS lead_id,
        elem->>'admission_number' AS admission_number
      FROM jsonb_array_elements(COALESCE(v_prev_snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE COALESCE(elem->>'id', elem->>'admission_number') IS NOT NULL
    )
    SELECT 
      inc.adm_key,
      inc.lead_id,
      inc.admission_number,
      prev.admission_number AS prev_admission_number,
      (prev.adm_key IS NOT NULL AND prev.admission_number IS DISTINCT FROM inc.admission_number) AS is_number_changed
    FROM incoming_admissions inc
    LEFT JOIN previous_admissions prev ON inc.adm_key = prev.adm_key
    WHERE prev.adm_key IS NULL -- Brand new admission submitted
       OR prev.lead_id IS DISTINCT FROM inc.lead_id::text -- Existing admission changed lead reference
       OR prev.admission_number IS DISTINCT FROM inc.admission_number -- Existing admission changed admission number
  LOOP
    -- Verify lead existence for newly submitted or changed conversions
    SELECT tenant_id INTO v_lead_tenant 
    FROM public.leads 
    WHERE id = r_lead.lead_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced lead % does not exist', r_lead.lead_id 
        USING ERRCODE = '23503';
    END IF;

    -- Enforce canonical tenant ownership (reject cross-tenant lead mutations)
    IF COALESCE(v_lead_tenant, 'default') <> COALESCE(p_tenant, 'default') THEN
      RAISE EXCEPTION 'Cross-tenant violation: Lead % belongs to tenant "%", but fee workflow is for tenant "%"', 
        r_lead.lead_id, COALESCE(v_lead_tenant, 'default'), COALESCE(p_tenant, 'default')
        USING ERRCODE = '42501';
    END IF;

    -- Update lead stage and notes atomically, preserving historical audit notes
    UPDATE public.leads
    SET 
      stage = 'Converted',
      notes = CASE 
        WHEN notes IS NULL OR TRIM(notes) = '' THEN 
          'Converted to Admission: ' || r_lead.admission_number
        WHEN r_lead.is_number_changed THEN
          notes || E'\n' || 'Admission Number Updated: ' || COALESCE(r_lead.prev_admission_number, 'None') || ' -> ' || r_lead.admission_number
        WHEN notes NOT LIKE '%' || r_lead.admission_number || '%' THEN 
          notes || E'\n' || 'Converted to Admission: ' || r_lead.admission_number
        ELSE notes
      END,
      updated_at = now()
    WHERE id = r_lead.lead_id
      AND COALESCE(tenant_id, 'default') = COALESCE(p_tenant, 'default');
  END LOOP;

  RETURN new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role, postgres;

-- 5. Unique Index on Admissions (tenant_id, admission_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_admissions_tenant_admission_number'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'admissions' AND column_name = 'tenant_id'
    ) THEN
      CREATE UNIQUE INDEX idx_admissions_tenant_admission_number ON public.admissions(tenant_id, admission_number);
    ELSE
      CREATE UNIQUE INDEX idx_admissions_tenant_admission_number ON public.admissions(admission_number);
    END IF;
  END IF;
END $$;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- SOURCE: 20261118_fix_doubts_and_notifications_schema.sql
-- Migration: 20261118_fix_doubts_and_notifications_schema.sql
-- Description: Fix schema discrepancies for Role 7 Support & Faculty Doubts Desk
--   - Add assigned_to and resolution_notes to public.student_doubts
--   - Add category and action_url to public.notifications
--   - Relax notifications_type_check to accept case-insensitive types ('info', 'warning', 'success', 'urgent', 'error')
--   - Add synchronization triggers for notifications links and doubt assignment fields

-- 1. Student Doubts
ALTER TABLE public.student_doubts ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE public.student_doubts ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- 2. Notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (LOWER(type) = ANY (ARRAY['info', 'warning', 'success', 'urgent', 'error']));

-- 3. Triggers for bidirectional link and assignment compatibility
CREATE OR REPLACE FUNCTION public.sync_notification_links()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.action_url IS NOT NULL AND NEW.link IS NULL THEN
        NEW.link := NEW.action_url;
    ELSIF NEW.link IS NOT NULL AND NEW.action_url IS NULL THEN
        NEW.action_url := NEW.link;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_notification_links') THEN
        CREATE TRIGGER trg_sync_notification_links
        BEFORE INSERT OR UPDATE ON public.notifications
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_notification_links();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_doubt_assigned_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to_name IS NULL THEN
        NEW.assigned_to_name := NEW.assigned_to;
    ELSIF NEW.assigned_to_name IS NOT NULL AND NEW.assigned_to IS NULL THEN
        NEW.assigned_to := NEW.assigned_to_name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_doubt_assigned_fields') THEN
        CREATE TRIGGER trg_sync_doubt_assigned_fields
        BEFORE INSERT OR UPDATE ON public.student_doubts
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_doubt_assigned_fields();
    END IF;
END $$;


-- SOURCE: 20261118_update_placement_enrollments_constraints.sql
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


-- SOURCE: followup tenant compatibility
ALTER TABLE public.lead_followups ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

-- SOURCE: 20261123122939_created_by_lead_isolation.sql
-- Prepared locally only. No historical ownership inference or data backfill.

CREATE SCHEMA IF NOT EXISTS crm_private;
REVOKE ALL ON SCHEMA crm_private FROM PUBLIC;
GRANT USAGE ON SCHEMA crm_private TO authenticated;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
-- Set default AFTER adding column: historical rows must remain NULL.
ALTER TABLE public.leads ALTER COLUMN created_by SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS leads_creator_scope_idx ON public.leads(tenant_id, created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_followups_parent_idx ON public.lead_followups(lead_id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN
 ('super_admin','admin','accountant','counsellor','counsellor_lead','trainer','placement_coordinator','support','onboarding_team','student'));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_tenant_unique ON public.profiles(id, tenant_id);
CREATE TABLE public.crm_teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
 name text NOT NULL, leader_id uuid NOT NULL,
 UNIQUE(id, tenant_id), FOREIGN KEY(leader_id, tenant_id) REFERENCES public.profiles(id, tenant_id)
);
CREATE TABLE public.crm_team_members (
 team_id uuid NOT NULL, tenant_id text NOT NULL, member_id uuid NOT NULL,
 PRIMARY KEY(team_id, member_id),
 FOREIGN KEY(team_id, tenant_id) REFERENCES public.crm_teams(id, tenant_id),
 FOREIGN KEY(member_id, tenant_id) REFERENCES public.profiles(id, tenant_id)
);
CREATE INDEX crm_team_leader_idx ON public.crm_teams(tenant_id, leader_id);
CREATE INDEX crm_team_member_idx ON public.crm_team_members(tenant_id, member_id);
ALTER TABLE public.crm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_teams, public.crm_team_members TO authenticated;
GRANT ALL ON public.crm_teams, public.crm_team_members TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.crm_teams, public.crm_team_members FROM anon, authenticated;

CREATE FUNCTION crm_private.can_manage(t text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS TRUE
 AND p.tenant_id = t AND p.role IN ('super_admin','admin'));
$$;
CREATE FUNCTION crm_private.can_access(t text, creator uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS TRUE
 AND p.tenant_id = t AND (p.role IN ('super_admin','admin') OR
 (p.role IN ('counsellor','counsellor_lead') AND (creator = p.id OR
 (p.role = 'counsellor_lead' AND EXISTS(SELECT 1 FROM public.crm_teams teams
 JOIN public.crm_team_members members ON members.team_id = teams.id AND members.tenant_id = teams.tenant_id
 WHERE teams.tenant_id = t AND teams.leader_id = p.id AND members.member_id = creator))))));
$$;
REVOKE ALL ON FUNCTION crm_private.can_manage(text), crm_private.can_access(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_private.can_manage(text), crm_private.can_access(text,uuid) TO authenticated;
CREATE POLICY crm_teams_read ON public.crm_teams FOR SELECT TO authenticated
 USING (crm_private.can_manage(tenant_id) OR (leader_id = auth.uid() AND crm_private.can_access(tenant_id, auth.uid())));
CREATE POLICY crm_members_read ON public.crm_team_members FOR SELECT TO authenticated
 USING (crm_private.can_manage(tenant_id) OR EXISTS(SELECT 1 FROM public.crm_teams t WHERE t.id = team_id AND t.leader_id = auth.uid()));

CREATE FUNCTION crm_private.protect_lead_creator() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'New leads require a verified creator'; END IF;
   IF current_user IN ('authenticated','anon') AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Cannot impersonate lead creator';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = NEW.created_by AND p.tenant_id = NEW.tenant_id
     AND p.is_active IS TRUE AND p.role IN ('super_admin','admin','counsellor','counsellor_lead')) THEN
     RAISE EXCEPTION 'Invalid creator membership';
   END IF;
 ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Lead creator, tenant and creation time are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER protect_lead_creator BEFORE INSERT OR UPDATE ON public.leads
 FOR EACH ROW EXECUTE FUNCTION crm_private.protect_lead_creator();

-- Replace only known permissive legacy policies. Keep all restrictive tenant policies.
DROP POLICY IF EXISTS "CRM staff manage leads" ON public.leads;
DROP POLICY IF EXISTS "Super Admin, Admin, Counsellor manage leads" ON public.leads;
DROP POLICY IF EXISTS admin_all_leads ON public.leads;
DROP POLICY IF EXISTS counsellor_select_leads ON public.leads;
DROP POLICY IF EXISTS counsellor_insert_leads ON public.leads;
DROP POLICY IF EXISTS counsellor_update_assigned_leads ON public.leads;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_creator_select ON public.leads FOR SELECT TO authenticated
 USING(crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_creator_insert ON public.leads FOR INSERT TO authenticated
 WITH CHECK(created_by = auth.uid() AND crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_creator_update ON public.leads FOR UPDATE TO authenticated
 USING(crm_private.can_access(tenant_id, created_by)) WITH CHECK(crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_management_delete ON public.leads FOR DELETE TO authenticated
 USING(crm_private.can_manage(tenant_id));
-- Defense against an unrecognized permissive policy from another schema version.
CREATE POLICY leads_creator_boundary ON public.leads AS RESTRICTIVE FOR ALL TO authenticated
 USING(crm_private.can_access(tenant_id, created_by)) WITH CHECK(crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_delete_boundary ON public.leads AS RESTRICTIVE FOR DELETE TO authenticated USING(crm_private.can_manage(tenant_id));
CREATE POLICY leads_anon_boundary ON public.leads AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);

DROP POLICY IF EXISTS "CRM staff manage followups" ON public.lead_followups;
DROP POLICY IF EXISTS admin_all_followups ON public.lead_followups;
DROP POLICY IF EXISTS counsellor_select_followups ON public.lead_followups;
DROP POLICY IF EXISTS counsellor_insert_followups ON public.lead_followups;
DROP POLICY IF EXISTS counsellor_update_own_followups ON public.lead_followups;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY followups_parent_boundary ON public.lead_followups AS RESTRICTIVE FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.tenant_id = lead_followups.tenant_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.tenant_id = lead_followups.tenant_id));
CREATE POLICY followups_select ON public.lead_followups FOR SELECT TO authenticated USING(true);
CREATE POLICY followups_insert ON public.lead_followups FOR INSERT TO authenticated WITH CHECK(counsellor_id = auth.uid());
CREATE POLICY followups_update ON public.lead_followups FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY followups_delete ON public.lead_followups FOR DELETE TO authenticated USING(crm_private.can_manage(tenant_id));
CREATE POLICY followups_delete_boundary ON public.lead_followups AS RESTRICTIVE FOR DELETE TO authenticated USING(crm_private.can_manage(tenant_id));
CREATE POLICY followups_anon_boundary ON public.lead_followups AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY followups_author_boundary ON public.lead_followups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(counsellor_id = auth.uid());

CREATE FUNCTION crm_private.protect_authority() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role
   OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
   RAISE EXCEPTION 'Authority changes require a server administrator';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER crm_profile_authority BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION crm_private.protect_authority();
REVOKE ALL ON FUNCTION crm_private.protect_authority() FROM PUBLIC;

-- CRM telemetry cannot be forged against an inaccessible lead, even via direct REST.
CREATE POLICY crm_audit_boundary ON public.audit_logs AS RESTRICTIVE FOR ALL TO authenticated
 USING(upper(module) <> 'CRM' OR EXISTS(SELECT 1 FROM public.leads l WHERE l.id::text = record_id))
 WITH CHECK(upper(module) <> 'CRM' OR (user_id = auth.uid() AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id::text = record_id)));
CREATE POLICY crm_audit_read ON public.audit_logs FOR SELECT TO authenticated
 USING(upper(module) = 'CRM' AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id::text = record_id));
CREATE POLICY crm_audit_anon_boundary ON public.audit_logs AS RESTRICTIVE FOR ALL TO anon
 USING(upper(module) <> 'CRM') WITH CHECK(upper(module) <> 'CRM');

CREATE FUNCTION crm_private.check_admission_lead() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.lead_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.lead_id IS DISTINCT FROM OLD.lead_id)
   AND current_user IN ('authenticated','anon') AND NOT EXISTS
   (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.tenant_id = NEW.tenant_id) THEN
   RAISE EXCEPTION 'Lead conversion access denied';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER admission_lead_access BEFORE INSERT OR UPDATE ON public.admissions
 FOR EACH ROW EXECUTE FUNCTION crm_private.check_admission_lead();
REVOKE ALL ON FUNCTION crm_private.protect_lead_creator(), crm_private.check_admission_lead() FROM PUBLIC;


-- SOURCE: 20261123183500_telecrm_duplicate_prevention_and_admissions_counsellor.sql
-- Migration: TeleCRM Duplicate Prevention, Idempotency & Admissions Counsellor Name Field
-- Date: 2026-11-23


-- 1. Admissions Table Enhancements: Counsellor ID, Counsellor Name & Training Category
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS counsellor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS counsellor_name text;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS training_category text DEFAULT 'Normal Training' CHECK (training_category IN ('Normal Training', 'Personal Training'));

CREATE INDEX IF NOT EXISTS idx_admissions_counsellor_id ON public.admissions(tenant_id, counsellor_id);
CREATE INDEX IF NOT EXISTS idx_admissions_training_category ON public.admissions(tenant_id, training_category);

-- 2. Leads Table Enhancements: Canonical Phone, External Lead ID & Webhook Idempotency Key
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS canonical_phone text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS external_lead_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE INDEX IF NOT EXISTS idx_leads_canonical_phone ON public.leads(tenant_id, canonical_phone);
CREATE INDEX IF NOT EXISTS idx_leads_idempotency_key ON public.leads(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_leads_external_lead_id ON public.leads(tenant_id, external_lead_id);

-- 3. Function to automatically compute canonical phone digits on leads insert or update
CREATE OR REPLACE FUNCTION crm_private.sync_lead_canonical_phone()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.canonical_phone := regexp_replace(NEW.phone, '\D', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_canonical_phone ON public.leads;
CREATE TRIGGER trg_sync_lead_canonical_phone
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION crm_private.sync_lead_canonical_phone();



-- SOURCE: 20261123200000_reconcile_authoritative_training_courses.sql
-- Migration: 20261123200000_reconcile_authoritative_training_courses.sql
-- Description: Reconcile and authoritatively persist the four configured training courses
--              into Supabase courses table, ensuring single source of truth across all modules.

INSERT INTO courses (
    id,
    course_name,
    course_code,
    description,
    duration_weeks,
    category,
    price,
    status,
    created_at,
    updated_at
) VALUES
(
    'c1000000-0000-4000-a000-000000000101',
    'SAP FICO PERSONAL TRAINING',
    'SAP FICO 101',
    '1-on-1 personalized SAP S/4HANA Finance (FICO) training with dedicated mentorship and custom scheduling.',
    12,
    'SAP Functional',
    35000,
    'Published',
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-a000-000000000102',
    'SAP FICO NORMAL TRAINING',
    'SAP FICO 102',
    'Standard cohort-based SAP S/4HANA Finance (FICO) normal batch training covering financial accounting and controlling.',
    12,
    'SAP Functional',
    28000,
    'Published',
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-a000-000000000103',
    'SAP MM PERSONAL TRAINING',
    'SAP MM 103',
    '1-on-1 personalized SAP S/4HANA Materials Management (MM) training with individual mentoring and hands-on scenarios.',
    10,
    'SAP Functional',
    35000,
    'Published',
    NOW(),
    NOW()
),
(
    'c1000000-0000-4000-a000-000000000104',
    'SAP ABAP NORMAL TRAINING',
    'SAP ABAP 104',
    'Standard cohort-based SAP ABAP on HANA normal batch training covering core syntax, CDS views, AMDP, and RAP.',
    12,
    'SAP Technical',
    28000,
    'Published',
    NOW(),
    NOW()
)
ON CONFLICT (course_code) DO UPDATE SET
    course_name = EXCLUDED.course_name,
    price = EXCLUDED.price,
    category = EXCLUDED.category,
    duration_weeks = EXCLUDED.duration_weeks,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    updated_at = NOW();


-- SOURCE: 20261124005440_fix_crm_role_helper_search_path.sql
-- Preserve existing role lookup semantics while making nested RLS calls safe.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;
NOTIFY pgrst, 'reload schema';


-- SOURCE: 20261124_crm_leads_created_by.sql
-- ==============================================================================
-- Migration: 20261124_crm_leads_created_by.sql
-- BUG-17: CRM Lead Creation Fails for Sales Accounts
-- 1. Non-destructively add created_by to public.leads referencing public.profiles(id)
-- 2. Add composite index for tenant-scoped creator queries
-- 3. Ensure crm_teams and crm_team_members exist for sales team visibility
-- 4. Reload PostgREST schema cache
-- ==============================================================================

-- 1. Add created_by column to public.leads (nullable, preserving all existing rows)
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Composite index for tenant-scoped creator filtering and sorting
CREATE INDEX IF NOT EXISTS leads_tenant_created_by_idx 
  ON public.leads(tenant_id, created_by, created_at DESC);

-- 3. Ensure crm_teams and crm_team_members exist for Sales Lead team visibility scoping
CREATE TABLE IF NOT EXISTS public.crm_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_team_members (
  team_id uuid NOT NULL REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  tenant_id text NOT NULL DEFAULT 'default',
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS crm_teams_leader_idx ON public.crm_teams(tenant_id, leader_id);
CREATE INDEX IF NOT EXISTS crm_team_members_member_idx ON public.crm_team_members(tenant_id, member_id);

ALTER TABLE public.crm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.crm_teams TO service_role, postgres;
GRANT ALL ON public.crm_team_members TO service_role, postgres;
GRANT SELECT ON public.crm_teams TO authenticated;
GRANT SELECT ON public.crm_team_members TO authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- SOURCE: 20261125_atomic_normalized_financial_persistence.sql
-- =============================================================================
-- P0: Atomic Normalized Financial Persistence & Expense Settlement RPCs
-- Target: Supabase PostgreSQL (NOT YET APPLIED — PENDING PHASE 14 APPROVAL GATE)
-- =============================================================================

-- 1. Extend public.payments with normalized approval, external ID, and bank profile columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS our_bank_profile_id text,
  ADD COLUMN IF NOT EXISTS our_bank_name text,
  ADD COLUMN IF NOT EXISTS our_bank_account_name text,
  ADD COLUMN IF NOT EXISTS our_bank_account_id text,
  ADD COLUMN IF NOT EXISTS our_upi_details text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pending Approval',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'Pending Verification',
  ADD COLUMN IF NOT EXISTS external_payment_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 2. Extend public.expenses to support Settled status, paying bank profile, and settlement metadata
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('Draft', 'Pending', 'Pending Approval', 'Approved', 'Paid', 'Settled', 'Rejected'));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS bank_account_profile_id text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS settled_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_amount numeric,
  ADD COLUMN IF NOT EXISTS settlement_idempotency_key text UNIQUE;

-- 3. Atomic Normalized Commit RPC (persists ALL affected normalized financial entities in 1 PG transaction)
CREATE OR REPLACE FUNCTION public.commit_fee_workflow(
  p_tenant text,
  p_revision bigint,
  p_snapshot jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_revision bigint;
  adm jsonb;
  stu jsonb;
  fa jsonb;
  inst jsonb;
  pay jsonb;
  rcpt jsonb;
  oc jsonb;
  aud jsonb;
  case_record jsonb;
  enabled boolean;
  v_pay_uuid uuid;
  v_rcpt_uuid uuid;
  v_inst_uuid uuid;
  v_oc_uuid uuid;
  v_aud_uuid uuid;
BEGIN
  -- 3A. Optimistic revision check on fee_workflow_state
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot)
      ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state
      SET revision = revision + 1, snapshot = p_snapshot, updated_at = now()
      WHERE tenant_id = p_tenant AND revision = p_revision
      RETURNING revision INTO new_revision;
  END IF;
  IF new_revision IS NULL THEN
    RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001';
  END IF;

  -- 3B. Upsert affected normalized admissions (enforces courses FK & tenant_id)
  FOR adm IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) LOOP
    INSERT INTO public.admissions(
      id, admission_number, student_name, phone, email, dob, gender, address, city,
      education, experience_years, current_employment_status, course_id, training_mode,
      admission_date, course_fee, discount, discount_reason, net_payable, payment_plan,
      counsellor_id, status, tenant_id, student_unique_id, our_bank_name,
      our_bank_account_name, our_bank_account_id, our_upi_details, lead_id
    )
    VALUES (
      (adm->>'id')::uuid,
      adm->>'admission_number',
      COALESCE(adm->>'student_name', 'Student'),
      COALESCE(adm->>'phone', ''),
      COALESCE(adm->>'email', ''),
      COALESCE((adm->>'dob')::date, CURRENT_DATE),
      COALESCE(adm->>'gender', 'Other'),
      COALESCE(adm->>'address', ''),
      COALESCE(adm->>'city', ''),
      COALESCE(adm->>'education', ''),
      COALESCE((adm->>'experience_years')::numeric, 0),
      COALESCE(adm->>'current_employment_status', 'Student'),
      (adm->>'course_id')::uuid,
      COALESCE(adm->>'training_mode', 'Online'),
      COALESCE((adm->>'admission_date')::date, CURRENT_DATE),
      COALESCE((adm->>'course_fee')::numeric, 0),
      COALESCE((adm->>'discount')::numeric, 0),
      adm->>'discount_reason',
      COALESCE((adm->>'net_payable')::numeric, 0),
      COALESCE(adm->>'payment_plan', 'Full Payment'),
      NULLIF(adm->>'counsellor_id', '')::uuid,
      COALESCE(adm->>'status', 'Confirmed'),
      p_tenant,
      adm->>'student_unique_id',
      adm->>'our_bank_name',
      adm->>'our_bank_account_name',
      adm->>'our_bank_account_id',
      adm->>'our_upi_details',
      NULLIF(adm->>'lead_id', '')::uuid
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      course_fee = EXCLUDED.course_fee,
      discount = EXCLUDED.discount,
      net_payable = EXCLUDED.net_payable,
      updated_at = now()
    WHERE public.admissions.tenant_id = p_tenant;
  END LOOP;

  -- 3C. Upsert affected normalized students (user_id nullable until provisioned)
  FOR stu IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    INSERT INTO public.students(
      id, admission_id, student_code, admission_number, full_name, email, phone,
      course_id, total_fee, paid_amount, outstanding_amount, status, tenant_id, student_unique_id
    )
    VALUES (
      (stu->>'id')::uuid,
      NULLIF(stu->>'admission_id', '')::uuid,
      stu->>'student_code',
      stu->>'admission_number',
      COALESCE(stu->>'full_name', 'Student'),
      COALESCE(stu->>'email', ''),
      COALESCE(stu->>'phone', ''),
      NULLIF(stu->>'course_id', '')::uuid,
      COALESCE((stu->>'total_fee')::numeric, 0),
      COALESCE((stu->>'paid_amount')::numeric, 0),
      COALESCE((stu->>'outstanding_amount')::numeric, 0),
      COALESCE(stu->>'status', 'Active'),
      p_tenant,
      stu->>'student_unique_id'
    )
    ON CONFLICT (id) DO UPDATE SET
      total_fee = EXCLUDED.total_fee,
      paid_amount = EXCLUDED.paid_amount,
      outstanding_amount = EXCLUDED.outstanding_amount,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE public.students.tenant_id = p_tenant;

    -- Preserve LMS access evaluation
    IF stu->>'onboarding_required' = 'true' AND stu->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = stu->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false
        );
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES ((stu->>'user_id')::uuid, p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;

  -- 3D. Upsert affected normalized student_fee_accounts
  FOR fa IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'feeAccounts', '[]'::jsonb)) LOOP
    INSERT INTO public.student_fee_accounts(
      id, student_id, admission_id, original_fee, discount, net_payable,
      collected_amount, outstanding_balance, status, tenant_id
    )
    VALUES (
      (fa->>'id')::uuid,
      (fa->>'student_id')::uuid,
      (fa->>'admission_id')::uuid,
      COALESCE((fa->>'original_fee')::numeric, 0),
      COALESCE((fa->>'discount')::numeric, 0),
      COALESCE((fa->>'net_payable')::numeric, 0),
      COALESCE((fa->>'paid_amount')::numeric, 0),
      COALESCE((fa->>'outstanding_amount')::numeric, 0),
      CASE WHEN (fa->>'status') IN ('Paid', 'Partial', 'Pending', 'Overdue') THEN fa->>'status' ELSE 'Pending' END,
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      collected_amount = EXCLUDED.collected_amount,
      outstanding_balance = EXCLUDED.outstanding_balance,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE public.student_fee_accounts.tenant_id = p_tenant;
  END LOOP;

  -- 3E. Upsert affected normalized installments
  FOR inst IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'installments', '[]'::jsonb)) LOOP
    v_inst_uuid := CASE
      WHEN (inst->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (inst->>'id')::uuid
      ELSE regexp_replace(md5('inst:' || p_tenant || ':' || (inst->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.installments(
      id, fee_account_id, installment_number, due_date, due_amount, paid_amount, status, paid_at, tenant_id
    )
    VALUES (
      v_inst_uuid,
      (inst->>'fee_account_id')::uuid,
      COALESCE((inst->>'installment_number')::integer, 1),
      COALESCE((inst->>'due_date')::date, CURRENT_DATE),
      COALESCE((inst->>'due_amount')::numeric, (inst->>'amount')::numeric, 0),
      COALESCE((inst->>'paid_amount')::numeric, 0),
      CASE WHEN (inst->>'status') IN ('Paid', 'Partial', 'Upcoming', 'Overdue') THEN inst->>'status' ELSE 'Upcoming' END,
      NULLIF(inst->>'paid_at', '')::timestamptz,
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      paid_amount = EXCLUDED.paid_amount,
      status = EXCLUDED.status,
      paid_at = COALESCE(EXCLUDED.paid_at, public.installments.paid_at)
    WHERE public.installments.tenant_id = p_tenant;
  END LOOP;

  -- 3F. Upsert affected normalized payments (strictly validating amount > 0 & terminal protection)
  FOR pay IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'studentPayments', '[]'::jsonb)) LOOP
    IF COALESCE((pay->>'amount_paid')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;
    v_pay_uuid := CASE
      WHEN (pay->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (pay->>'id')::uuid
      ELSE regexp_replace(md5('pay:' || p_tenant || ':' || (pay->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.payments(
      id, external_payment_id, receipt_number, fee_account_id, student_id, amount,
      payment_mode, transaction_reference, payment_date, collected_by, remarks,
      our_bank_profile_id, our_bank_name, our_bank_account_name, our_bank_account_id,
      our_upi_details, status, verification_status, verified_by, verified_at,
      rejection_reason, tenant_id
    )
    VALUES (
      v_pay_uuid,
      pay->>'id',
      COALESCE(NULLIF(pay->>'receipt_number', ''), 'PENDING-' || (pay->>'id')),
      (SELECT sfa.id FROM public.student_fee_accounts sfa WHERE sfa.student_id = (pay->>'student_id')::uuid AND sfa.tenant_id = p_tenant LIMIT 1),
      (pay->>'student_id')::uuid,
      (pay->>'amount_paid')::numeric,
      COALESCE(pay->>'payment_mode', 'UPI'),
      COALESCE(pay->>'transaction_reference', pay->>'bank_upi_reference'),
      COALESCE((pay->>'payment_date')::date, CURRENT_DATE),
      COALESCE(NULLIF(pay->>'recorded_by', '')::uuid, NULLIF(pay->>'verified_by', '')::uuid),
      pay->>'notes',
      pay->>'our_bank_profile_id',
      pay->>'our_bank_name',
      pay->>'our_bank_account_name',
      pay->>'our_bank_account_id',
      pay->>'our_upi_details',
      COALESCE(pay->>'status', 'Pending Approval'),
      COALESCE(pay->>'verification_status', 'Pending Verification'),
      NULLIF(pay->>'verified_by', '')::uuid,
      NULLIF(pay->>'verified_at', '')::timestamptz,
      pay->>'rejection_reason',
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      verification_status = EXCLUDED.verification_status,
      receipt_number = EXCLUDED.receipt_number,
      verified_by = COALESCE(EXCLUDED.verified_by, public.payments.verified_by),
      verified_at = COALESCE(EXCLUDED.verified_at, public.payments.verified_at),
      rejection_reason = COALESCE(EXCLUDED.rejection_reason, public.payments.rejection_reason),
      our_bank_profile_id = COALESCE(EXCLUDED.our_bank_profile_id, public.payments.our_bank_profile_id),
      our_bank_name = COALESCE(EXCLUDED.our_bank_name, public.payments.our_bank_name),
      our_bank_account_name = COALESCE(EXCLUDED.our_bank_account_name, public.payments.our_bank_account_name),
      our_bank_account_id = COALESCE(EXCLUDED.our_bank_account_id, public.payments.our_bank_account_id)
    WHERE public.payments.tenant_id = p_tenant
      AND public.payments.verification_status NOT IN ('Verified', 'Rejected');
  END LOOP;

  -- 3G. Upsert affected normalized receipts (only for verified payments; immutable once issued)
  FOR rcpt IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'receipts', '[]'::jsonb)) LOOP
    v_rcpt_uuid := CASE
      WHEN (rcpt->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'id')::uuid
      ELSE regexp_replace(md5('rcpt:' || p_tenant || ':' || (rcpt->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    v_pay_uuid := CASE
      WHEN (rcpt->>'payment_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'payment_id')::uuid
      ELSE regexp_replace(md5('pay:' || p_tenant || ':' || regexp_replace(rcpt->>'payment_id', '^pay-', '')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.receipts(
      id, receipt_number, payment_id, student_id, student_name, student_code,
      course_name, amount, amount_in_words, payment_mode, transaction_reference,
      receipt_date, issued_by, tenant_id
    )
    VALUES (
      v_rcpt_uuid,
      rcpt->>'receipt_number',
      v_pay_uuid,
      (rcpt->>'student_id')::uuid,
      COALESCE(rcpt->>'student_name', 'Student'),
      COALESCE(rcpt->>'student_code', ''),
      COALESCE(rcpt->>'course_name', 'Course'),
      COALESCE((rcpt->>'payment_amount')::numeric, (rcpt->>'amount')::numeric, 0),
      COALESCE(rcpt->>'amount_in_words', ''),
      COALESCE(rcpt->>'payment_mode', 'UPI'),
      rcpt->>'transaction_reference',
      COALESCE((rcpt->>'payment_date')::date, CURRENT_DATE),
      COALESCE(NULLIF(rcpt->>'authorized_by', '')::uuid, NULLIF(rcpt->>'issued_by', '')::uuid),
      p_tenant
    )
    ON CONFLICT (receipt_number) DO NOTHING;
  END LOOP;

  -- 3H. Upsert affected normalized onboarding_cases
  FOR oc IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb)) LOOP
    v_oc_uuid := CASE
      WHEN (oc->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (oc->>'id')::uuid
      WHEN (oc->>'id') ~* '^onb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN regexp_replace(oc->>'id', '^onb-', '')::uuid
      ELSE regexp_replace(md5('onb:' || p_tenant || ':' || (oc->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.onboarding_cases(
      id, case_number, admission_id, admission_number, student_id, student_name,
      student_email, student_phone, course_id, course_name, status, checklist, documents, tenant_id
    )
    VALUES (
      v_oc_uuid,
      COALESCE(oc->>'case_number', 'ONB-' || (oc->>'admission_number')),
      (oc->>'admission_id')::uuid,
      oc->>'admission_number',
      (oc->>'student_id')::uuid,
      COALESCE(oc->>'student_name', 'Student'),
      COALESCE(oc->>'student_email', ''),
      COALESCE(oc->>'student_phone', ''),
      NULLIF(oc->>'course_id', '')::uuid,
      COALESCE(oc->>'course_name', 'Course'),
      CASE
        WHEN lower(replace(COALESCE(oc->>'status', ''), ' ', '_')) IN ('pending', 'in_progress', 'blocked', 'completed')
          THEN lower(replace(oc->>'status', ' ', '_'))
        ELSE 'in_progress'
      END,
      COALESCE(oc->'checklist', '{}'::jsonb),
      COALESCE(oc->'documents', '[]'::jsonb),
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      checklist = EXCLUDED.checklist,
      updated_at = now()
    WHERE public.onboarding_cases.tenant_id = p_tenant;
  END LOOP;

  -- 3I. Persist audit_logs for financial workflow mutations
  FOR aud IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'auditLogs', '[]'::jsonb)) LOOP
    v_aud_uuid := CASE
      WHEN (aud->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (aud->>'id')::uuid
      ELSE regexp_replace(md5('aud:' || p_tenant || ':' || (aud->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.audit_logs(id, user_id, user_email, module, action, record_id, payload)
    VALUES (
      v_aud_uuid,
      NULLIF(aud->>'user_id', '')::uuid,
      COALESCE(aud->>'user_name', 'system@next-generpsolutions.com'),
      COALESCE(aud->>'module', 'FINANCE'),
      COALESCE(aud->>'action', 'WORKFLOW_EVENT'),
      aud->>'record_id',
      COALESCE(aud->'new_value', '{}'::jsonb)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RETURN new_revision;
END $$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;

-- 4. Atomic Expense Settlement RPC (resolves FIN-R01 in PostgreSQL)
CREATE OR REPLACE FUNCTION public.settle_expense_atomic(
  p_expense_id uuid,
  p_tenant text,
  p_validator_id uuid,
  p_payment_mode text,
  p_reference text,
  p_bank_account text,
  p_bank_profile_id text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_exp public.expenses%ROWTYPE;
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'Mandatory reference: Bank UTR or transaction reference is required';
  END IF;

  SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND tenant_id = p_tenant
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF p_idempotency_key IS NOT NULL AND v_exp.status = 'Settled' AND v_exp.settlement_idempotency_key = p_idempotency_key THEN
    RETURN to_jsonb(v_exp);
  END IF;

  IF v_exp.status <> 'Approved' THEN
    RAISE EXCEPTION 'Conflict: Expense is not in Approved status (current: %)', v_exp.status USING ERRCODE = '40001';
  END IF;

  UPDATE public.expenses
    SET status = 'Settled',
        payment_mode = p_payment_mode,
        reference_number = btrim(p_reference),
        bank_account = p_bank_account,
        bank_account_profile_id = p_bank_profile_id,
        settled_by = p_validator_id,
        settled_at = now(),
        validated_amount = v_exp.amount,
        settlement_idempotency_key = p_idempotency_key
    WHERE id = p_expense_id AND tenant_id = p_tenant AND status = 'Approved'
    RETURNING * INTO v_exp;

  INSERT INTO public.audit_logs(user_id, user_email, module, action, record_id, payload)
    VALUES (
      p_validator_id,
      COALESCE((SELECT email FROM public.profiles WHERE id = p_validator_id), 'system@next-generpsolutions.com'),
      'FINANCE',
      'EXPENSE_SETTLED',
      p_expense_id::text,
      jsonb_build_object(
        'status', 'Settled',
        'amount', v_exp.amount,
        'reference', btrim(p_reference),
        'bank_account_profile_id', p_bank_profile_id
      )
    );

  RETURN to_jsonb(v_exp);
END $$;

REVOKE ALL ON FUNCTION public.settle_expense_atomic(uuid, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_expense_atomic(uuid, text, uuid, text, text, text, text, text) TO service_role;


-- SOURCE: 20261125_idempotency_keys.sql
-- TASK-02: Distributed Idempotency Keys table for multi-instance Vercel workloads
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'default',
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, actor_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'idempotency_keys' AND policyname = 'idempotency_keys_actor_isolation'
  ) THEN
    CREATE POLICY idempotency_keys_actor_isolation ON public.idempotency_keys
      FOR ALL
      TO authenticated
      USING (actor_id = auth.uid()::text)
      WITH CHECK (actor_id = auth.uid()::text);
  END IF;
END $$;


-- SOURCE: 20261127_fix_commit_fee_workflow_receipt_issued_by.sql
-- P0 Hotfix: Safely resolve receipts.issued_by UUID in commit_fee_workflow
-- Previously, COALESCE(NULLIF(rcpt->>'authorized_by', '')::uuid, NULLIF(rcpt->>'issued_by', '')::uuid)
-- threw SQLSTATE 22P02 when receipt.authorized_by held the verifier's display name (e.g. 'Padmaja').

CREATE OR REPLACE FUNCTION public.commit_fee_workflow(
  p_tenant text,
  p_revision bigint,
  p_snapshot jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  new_revision bigint;
  adm jsonb;
  stu jsonb;
  fa jsonb;
  inst jsonb;
  pay jsonb;
  rcpt jsonb;
  oc jsonb;
  aud jsonb;
  case_record jsonb;
  enabled boolean;
  v_pay_uuid uuid;
  v_rcpt_uuid uuid;
  v_inst_uuid uuid;
  v_oc_uuid uuid;
  v_aud_uuid uuid;
  v_issued_by uuid;
BEGIN
  -- 3A. Optimistic revision check on fee_workflow_state
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot)
      ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state
      SET revision = revision + 1, snapshot = p_snapshot, updated_at = now()
      WHERE tenant_id = p_tenant AND revision = p_revision
      RETURNING revision INTO new_revision;
  END IF;
  IF new_revision IS NULL THEN
    RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001';
  END IF;

  -- 3B. Upsert affected normalized admissions
  FOR adm IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) LOOP
    INSERT INTO public.admissions(
      id, admission_number, student_name, phone, email, dob, gender, address, city,
      education, experience_years, current_employment_status, course_id, training_mode,
      admission_date, course_fee, discount, discount_reason, net_payable, payment_plan,
      counsellor_id, status, tenant_id, student_unique_id, our_bank_name,
      our_bank_account_name, our_bank_account_id, our_upi_details, lead_id
    )
    VALUES (
      (adm->>'id')::uuid,
      adm->>'admission_number',
      COALESCE(adm->>'student_name', 'Student'),
      COALESCE(adm->>'phone', ''),
      COALESCE(adm->>'email', ''),
      COALESCE((adm->>'dob')::date, CURRENT_DATE),
      COALESCE(adm->>'gender', 'Other'),
      COALESCE(adm->>'address', ''),
      COALESCE(adm->>'city', ''),
      COALESCE(adm->>'education', ''),
      COALESCE((adm->>'experience_years')::numeric, 0),
      COALESCE(adm->>'current_employment_status', 'Student'),
      (adm->>'course_id')::uuid,
      COALESCE(adm->>'training_mode', 'Online'),
      COALESCE((adm->>'admission_date')::date, CURRENT_DATE),
      COALESCE((adm->>'course_fee')::numeric, 0),
      COALESCE((adm->>'discount')::numeric, 0),
      adm->>'discount_reason',
      COALESCE((adm->>'net_payable')::numeric, 0),
      COALESCE(adm->>'payment_plan', 'Full Payment'),
      NULLIF(adm->>'counsellor_id', '')::uuid,
      COALESCE(adm->>'status', 'Confirmed'),
      p_tenant,
      adm->>'student_unique_id',
      adm->>'our_bank_name',
      adm->>'our_bank_account_name',
      adm->>'our_bank_account_id',
      adm->>'our_upi_details',
      NULLIF(adm->>'lead_id', '')::uuid
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      course_fee = EXCLUDED.course_fee,
      discount = EXCLUDED.discount,
      net_payable = EXCLUDED.net_payable,
      updated_at = now()
    WHERE public.admissions.tenant_id = p_tenant;
  END LOOP;

  -- 3C. Upsert affected normalized students
  FOR stu IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    INSERT INTO public.students(
      id, admission_id, student_code, admission_number, full_name, email, phone,
      course_id, total_fee, paid_amount, outstanding_amount, status, tenant_id, student_unique_id
    )
    VALUES (
      (stu->>'id')::uuid,
      NULLIF(stu->>'admission_id', '')::uuid,
      stu->>'student_code',
      stu->>'admission_number',
      COALESCE(stu->>'full_name', 'Student'),
      COALESCE(stu->>'email', ''),
      COALESCE(stu->>'phone', ''),
      NULLIF(stu->>'course_id', '')::uuid,
      COALESCE((stu->>'total_fee')::numeric, 0),
      COALESCE((stu->>'paid_amount')::numeric, 0),
      COALESCE((stu->>'outstanding_amount')::numeric, 0),
      COALESCE(stu->>'status', 'Active'),
      p_tenant,
      stu->>'student_unique_id'
    )
    ON CONFLICT (id) DO UPDATE SET
      total_fee = EXCLUDED.total_fee,
      paid_amount = EXCLUDED.paid_amount,
      outstanding_amount = EXCLUDED.outstanding_amount,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE public.students.tenant_id = p_tenant;

    IF stu->>'onboarding_required' = 'true' AND stu->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = stu->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false
        );
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES ((stu->>'user_id')::uuid, p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;

  -- 3D. Upsert affected normalized student_fee_accounts
  FOR fa IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'feeAccounts', '[]'::jsonb)) LOOP
    INSERT INTO public.student_fee_accounts(
      id, student_id, admission_id, original_fee, discount, net_payable,
      collected_amount, outstanding_balance, status, tenant_id
    )
    VALUES (
      (fa->>'id')::uuid,
      (fa->>'student_id')::uuid,
      (fa->>'admission_id')::uuid,
      COALESCE((fa->>'original_fee')::numeric, 0),
      COALESCE((fa->>'discount')::numeric, 0),
      COALESCE((fa->>'net_payable')::numeric, 0),
      COALESCE((fa->>'paid_amount')::numeric, 0),
      COALESCE((fa->>'outstanding_amount')::numeric, 0),
      CASE WHEN (fa->>'status') IN ('Paid', 'Partial', 'Pending', 'Overdue') THEN fa->>'status' ELSE 'Pending' END,
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      collected_amount = EXCLUDED.collected_amount,
      outstanding_balance = EXCLUDED.outstanding_balance,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE public.student_fee_accounts.tenant_id = p_tenant;
  END LOOP;

  -- 3E. Upsert affected normalized installments
  FOR inst IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'installments', '[]'::jsonb)) LOOP
    v_inst_uuid := CASE
      WHEN (inst->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (inst->>'id')::uuid
      ELSE regexp_replace(md5('inst:' || p_tenant || ':' || (inst->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.installments(
      id, fee_account_id, installment_number, due_date, due_amount, paid_amount, status, paid_at, tenant_id
    )
    VALUES (
      v_inst_uuid,
      (inst->>'fee_account_id')::uuid,
      COALESCE((inst->>'installment_number')::integer, 1),
      COALESCE((inst->>'due_date')::date, CURRENT_DATE),
      COALESCE((inst->>'due_amount')::numeric, (inst->>'amount')::numeric, 0),
      COALESCE((inst->>'paid_amount')::numeric, 0),
      CASE WHEN (inst->>'status') IN ('Paid', 'Partial', 'Upcoming', 'Overdue') THEN inst->>'status' ELSE 'Upcoming' END,
      NULLIF(inst->>'paid_at', '')::timestamptz,
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      paid_amount = EXCLUDED.paid_amount,
      status = EXCLUDED.status,
      paid_at = COALESCE(EXCLUDED.paid_at, public.installments.paid_at)
    WHERE public.installments.tenant_id = p_tenant;
  END LOOP;

  -- 3F. Upsert affected normalized payments
  FOR pay IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'studentPayments', '[]'::jsonb)) LOOP
    IF COALESCE((pay->>'amount_paid')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;
    v_pay_uuid := CASE
      WHEN (pay->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (pay->>'id')::uuid
      ELSE regexp_replace(md5('pay:' || p_tenant || ':' || (pay->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.payments(
      id, external_payment_id, receipt_number, fee_account_id, student_id, amount,
      payment_mode, transaction_reference, payment_date, collected_by, remarks,
      our_bank_profile_id, our_bank_name, our_bank_account_name, our_bank_account_id,
      our_upi_details, status, verification_status, verified_by, verified_at,
      rejection_reason, tenant_id
    )
    VALUES (
      v_pay_uuid,
      pay->>'id',
      COALESCE(NULLIF(pay->>'receipt_number', ''), 'PENDING-' || (pay->>'id')),
      (SELECT sfa.id FROM public.student_fee_accounts sfa WHERE sfa.student_id = (pay->>'student_id')::uuid AND sfa.tenant_id = p_tenant LIMIT 1),
      (pay->>'student_id')::uuid,
      (pay->>'amount_paid')::numeric,
      COALESCE(pay->>'payment_mode', 'UPI'),
      COALESCE(pay->>'transaction_reference', pay->>'bank_upi_reference'),
      COALESCE((pay->>'payment_date')::date, CURRENT_DATE),
      COALESCE(NULLIF(pay->>'recorded_by', '')::uuid, NULLIF(pay->>'verified_by', '')::uuid),
      pay->>'notes',
      pay->>'our_bank_profile_id',
      pay->>'our_bank_name',
      pay->>'our_bank_account_name',
      pay->>'our_bank_account_id',
      pay->>'our_upi_details',
      COALESCE(pay->>'status', 'Pending Approval'),
      COALESCE(pay->>'verification_status', 'Pending Verification'),
      NULLIF(pay->>'verified_by', '')::uuid,
      NULLIF(pay->>'verified_at', '')::timestamptz,
      pay->>'rejection_reason',
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      verification_status = EXCLUDED.verification_status,
      receipt_number = EXCLUDED.receipt_number,
      verified_by = COALESCE(EXCLUDED.verified_by, public.payments.verified_by),
      verified_at = COALESCE(EXCLUDED.verified_at, public.payments.verified_at),
      rejection_reason = COALESCE(EXCLUDED.rejection_reason, public.payments.rejection_reason),
      our_bank_profile_id = COALESCE(EXCLUDED.our_bank_profile_id, public.payments.our_bank_profile_id),
      our_bank_name = COALESCE(EXCLUDED.our_bank_name, public.payments.our_bank_name),
      our_bank_account_name = COALESCE(EXCLUDED.our_bank_account_name, public.payments.our_bank_account_name),
      our_bank_account_id = COALESCE(EXCLUDED.our_bank_account_id, public.payments.our_bank_account_id)
    WHERE public.payments.tenant_id = p_tenant
      AND public.payments.verification_status NOT IN ('Verified', 'Rejected');
  END LOOP;

  -- 3G. Upsert affected normalized receipts (only for verified payments; immutable once issued)
  FOR rcpt IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'receipts', '[]'::jsonb)) LOOP
    -- Preserve existing historical receipts without altering or re-validating legacy issuer rows
    IF EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.receipt_number = rcpt->>'receipt_number'
    ) THEN
      CONTINUE;
    END IF;

    v_rcpt_uuid := CASE
      WHEN (rcpt->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'id')::uuid
      ELSE regexp_replace(md5('rcpt:' || p_tenant || ':' || (rcpt->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    v_pay_uuid := CASE
      WHEN (rcpt->>'payment_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'payment_id')::uuid
      ELSE regexp_replace(md5('pay:' || p_tenant || ':' || regexp_replace(rcpt->>'payment_id', '^pay-', '')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    v_issued_by := CASE
      WHEN (rcpt->>'issued_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'issued_by')::uuid
      WHEN (rcpt->>'authorized_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'authorized_by')::uuid
      ELSE NULL
    END;

    IF v_issued_by IS NULL THEN
      RAISE EXCEPTION 'Receipt issuer identity is required and must be a valid UUID' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_issued_by
        AND p.tenant_id = p_tenant
        AND p.is_active = true
        AND p.role IN ('accountant', 'admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized or inactive receipt issuer for tenant' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.receipts(
      id, receipt_number, payment_id, student_id, student_name, student_code,
      course_name, amount, amount_in_words, payment_mode, transaction_reference,
      receipt_date, issued_by, tenant_id
    )
    VALUES (
      v_rcpt_uuid,
      rcpt->>'receipt_number',
      v_pay_uuid,
      (rcpt->>'student_id')::uuid,
      COALESCE(rcpt->>'student_name', 'Student'),
      COALESCE(rcpt->>'student_code', ''),
      COALESCE(rcpt->>'course_name', 'Course'),
      COALESCE((rcpt->>'payment_amount')::numeric, (rcpt->>'amount')::numeric, 0),
      COALESCE(rcpt->>'amount_in_words', ''),
      COALESCE(rcpt->>'payment_mode', 'UPI'),
      rcpt->>'transaction_reference',
      COALESCE((rcpt->>'payment_date')::date, CURRENT_DATE),
      v_issued_by,
      p_tenant
    )
    ON CONFLICT (receipt_number) DO NOTHING;
  END LOOP;

  -- 3H. Upsert affected normalized onboarding_cases
  FOR oc IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb)) LOOP
    v_oc_uuid := CASE
      WHEN (oc->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (oc->>'id')::uuid
      WHEN (oc->>'id') ~* '^onb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN regexp_replace(oc->>'id', '^onb-', '')::uuid
      ELSE regexp_replace(md5('onb:' || p_tenant || ':' || (oc->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.onboarding_cases(
      id, case_number, admission_id, admission_number, student_id, student_name,
      student_email, student_phone, course_id, course_name, status, checklist, documents, tenant_id
    )
    VALUES (
      v_oc_uuid,
      COALESCE(oc->>'case_number', 'ONB-' || (oc->>'admission_number')),
      (oc->>'admission_id')::uuid,
      oc->>'admission_number',
      (oc->>'student_id')::uuid,
      COALESCE(oc->>'student_name', 'Student'),
      COALESCE(oc->>'student_email', ''),
      COALESCE(oc->>'student_phone', ''),
      NULLIF(oc->>'course_id', '')::uuid,
      COALESCE(oc->>'course_name', 'Course'),
      CASE
        WHEN lower(replace(COALESCE(oc->>'status', ''), ' ', '_')) IN ('pending', 'in_progress', 'blocked', 'completed')
          THEN lower(replace(oc->>'status', ' ', '_'))
        ELSE 'in_progress'
      END,
      COALESCE(oc->'checklist', '{}'::jsonb),
      COALESCE(oc->'documents', '[]'::jsonb),
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      checklist = EXCLUDED.checklist,
      updated_at = now()
    WHERE public.onboarding_cases.tenant_id = p_tenant;
  END LOOP;

  -- 3I. Persist audit_logs for financial workflow mutations
  FOR aud IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'auditLogs', '[]'::jsonb)) LOOP
    v_aud_uuid := CASE
      WHEN (aud->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (aud->>'id')::uuid
      ELSE regexp_replace(md5('aud:' || p_tenant || ':' || (aud->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.audit_logs(id, user_id, user_email, module, action, record_id, payload)
    VALUES (
      v_aud_uuid,
      NULLIF(aud->>'user_id', '')::uuid,
      COALESCE(aud->>'user_name', 'system@next-generpsolutions.com'),
      COALESCE(aud->>'module', 'FINANCE'),
      COALESCE(aud->>'action', 'WORKFLOW_EVENT'),
      aud->>'record_id',
      COALESCE(aud->'new_value', '{}'::jsonb)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RETURN new_revision;
END $function$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;


-- SOURCE: fresh install compatibility, privileges and empty workflow

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS syllabus_url text;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
-- Explicit privileges: RLS remains the row authorization boundary.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON public.courses, public.system_settings TO anon;
ALTER POLICY "Super Admins and Admins manage courses" ON public.courses TO authenticated;
ALTER POLICY "Trainers view assigned courses" ON public.courses TO authenticated;
ALTER POLICY "Counsellors view courses" ON public.courses TO authenticated;
ALTER POLICY "Students view enrolled courses" ON public.courses TO authenticated;
REVOKE ALL ON public.fee_workflow_state, public.admission_sequences, public.idempotency_keys FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profiles, public.crm_teams, public.crm_team_members, public.student_lms_access FROM authenticated;
DROP POLICY IF EXISTS "Todos public access" ON public.todos;
CREATE POLICY "Administrators manage todos" ON public.todos FOR ALL TO authenticated
USING (public.get_current_user_role() IN ('super_admin','admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin','admin'));
ALTER FUNCTION public.get_current_user_tenant_id() SET search_path = '';
ALTER FUNCTION public.generate_next_student_unique_id() SET search_path = public;
ALTER FUNCTION public.sync_job_openings_compat_columns() SET search_path = '';
ALTER FUNCTION public.sync_notification_links() SET search_path = '';
ALTER FUNCTION public.sync_doubt_assigned_fields() SET search_path = '';
ALTER FUNCTION public.allocate_admission_number(text, integer) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.generate_next_student_unique_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_student_unique_id() TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.student_unique_id_seq TO authenticated;
INSERT INTO public.system_settings(id, institute_name, address, phone, email, gst_number)
VALUES ('11111111-1111-1111-1111-111111111111','Next-Gen ERP Solutions','','','','') ON CONFLICT DO NOTHING;
INSERT INTO public.placement_eligibility_settings(id) VALUES ('pes-default') ON CONFLICT DO NOTHING;
-- An explicit empty snapshot prevents the legacy adapter from importing demo arrays.
INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
SELECT 'default', 1, jsonb_object_agg(k, '[]'::jsonb)
FROM unnest(ARRAY['studentPayments','studentFees','studentFinancialLedgers','feeAccounts',
'installments','payments','receipts','students','admissions','onboardingCases','onboardingAuditLogs',
'notifications','auditLogs','users','batches','leads','feeApprovalHistories','feeRevisionRequests','feeCategories']) k;
INSERT INTO storage.buckets(id,name,public) VALUES
('avatars','avatars',true),('receipts','receipts',false),('resumes','resumes',false),
('assignments','assignments',false),('doubt-attachments','doubt-attachments',false),('screenshots','screenshots',false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
