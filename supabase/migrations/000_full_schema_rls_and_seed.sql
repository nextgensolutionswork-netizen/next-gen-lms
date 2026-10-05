-- NEXT-GEN ERP SOLUTIONS: CONSOLIDATED PRODUCTION DATABASE SETUP
-- Target: Supabase PostgreSQL
-- Includes:
--   1. Extensions (uuid-ossp, pgcrypto)
--   2. All 37 Tables + Foreign Keys + Constraints + GST Compliance Fields
--   3. Performance & Lookup Indexes
--   4. Row-Level Security (RLS) Policies for All Tables (Default-Deny + RBAC)
--   5. Core Seed Data (Profiles, 8 Role Accounts, Courses, Batches, Students, Todos)
--   6. Supabase Storage Buckets & Storage Policies

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLE DEFINITIONS

-- 2.1 Profiles & Roles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- 2.5 Batches & Scheduling
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

-- 2.6 Admissions & Students (with GST Compliance fields)
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Transferred', 'Dropped')),
    UNIQUE(batch_id, student_id)
);

CREATE TABLE IF NOT EXISTS batch_transfer_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_batch_id UUID REFERENCES batches(id),
    to_batch_id UUID NOT NULL REFERENCES batches(id),
    reason TEXT NOT NULL,
    transferred_by UUID NOT NULL REFERENCES profiles(id),
    transfer_date TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Academic Progress, Sessions & Attendance
CREATE TABLE IF NOT EXISTS lesson_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('MCQ', 'TrueFalse')),
    options JSONB NOT NULL,
    correct_option_index INTEGER NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fee_account_id UUID NOT NULL REFERENCES student_fee_accounts(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    due_amount NUMERIC NOT NULL CHECK (due_amount > 0),
    paid_amount NUMERIC NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Paid', 'Partial', 'Upcoming', 'Overdue')),
    paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Shortlisted', 'Interviewing', 'Offered', 'Rejected')),
    notes TEXT,
    UNIQUE(job_id, student_id)
);

-- 2.13 Certificates
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Info', 'Warning', 'Success', 'Urgent')),
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- 5. CORE SEED DATA

-- 5.1 System Settings
INSERT INTO system_settings (
  id, institute_name, tagline, address, phone, email, gst_number, default_currency, academic_year, receipt_prefix, invoice_prefix, timezone
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Next-Gen ERP Solutions',
  'Premier SAP Training Institute & Enterprise Academy',
  'Cyber Towers, HITEC City, Hyderabad, Telangana 500081',
  '+91 98000 00000',
  'info@next-generpsolutions.com',
  '36AAACN1234F1Z5',
  'INR',
  '2026-2027',
  'REC-2026-',
  'INV-2026-',
  'Asia/Kolkata'
) ON CONFLICT (id) DO UPDATE SET
  institute_name = EXCLUDED.institute_name,
  gst_number = EXCLUDED.gst_number,
  updated_at = NOW();

-- 5.2 All 8 Role Accounts in public.profiles
INSERT INTO profiles (id, email, full_name, role, phone, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'superadmin@next-generpsolutions.com', 'Rajesh Sharma (Director)', 'super_admin', '+91 98000 00001', true),
  ('22222222-2222-2222-2222-222222222222', 'admin@next-generpsolutions.com', 'Priya Nair (Operations Head)', 'admin', '+91 98000 00002', true),
  ('33333333-3333-3333-3333-333333333333', 'accounts@next-generpsolutions.com', 'Suresh Kumar (Chief Accountant)', 'accountant', '+91 98000 00003', true),
  ('44444444-4444-4444-4444-444444444444', 'counsellor@next-generpsolutions.com', 'Ananya Desai (Senior Counsellor)', 'counsellor', '+91 98000 00004', true),
  ('55555555-5555-5555-5555-555555555551', 'vikram.fico@next-generpsolutions.com', 'Vikram Rao (SAP FICO Lead)', 'trainer', '+91 98000 00005', true),
  ('55555555-5555-5555-5555-555555555552', 'neha.mm@next-generpsolutions.com', 'Neha Patel (SAP MM Lead)', 'trainer', '+91 98000 00006', true),
  ('66666666-6666-6666-6666-666666666666', 'placement@next-generpsolutions.com', 'Sunita Reddy (Placement Head)', 'placement_coordinator', '+91 98000 00007', true),
  ('88888888-8888-8888-8888-888888888888', 'support@next-generpsolutions.com', 'Ananya Deshmukh (SAP Support Lead)', 'support', '+91 98000 00008', true),
  ('77777777-7777-7777-7777-777777777771', 'amit.gupta@student.next-gen.com', 'Amit Gupta (SAP FICO Student)', 'student', '+91 98111 22233', true),
  ('77777777-7777-7777-7777-777777777772', 'sneha.k@student.next-gen.com', 'Sneha Kulkarni (SAP MM Student)', 'student', '+91 98222 33344', true)
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  is_active = true,
  updated_at = NOW();

-- 5.3 Seed into auth.users (if pgcrypto & auth schema present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    -- Remove any previous test accounts with mismatched IDs to prevent unique email conflict
    DELETE FROM auth.users WHERE email IN (
      'superadmin@next-generpsolutions.com',
      'admin@next-generpsolutions.com',
      'accounts@next-generpsolutions.com',
      'counsellor@next-generpsolutions.com',
      'vikram.fico@next-generpsolutions.com',
      'neha.mm@next-generpsolutions.com',
      'placement@next-generpsolutions.com',
      'support@next-generpsolutions.com',
      'amit.gupta@student.next-gen.com',
      'sneha.k@student.next-gen.com'
    ) AND id NOT IN (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555551',
      '55555555-5555-5555-5555-555555555552',
      '66666666-6666-6666-6666-666666666666',
      '88888888-8888-8888-8888-888888888888',
      '77777777-7777-7777-7777-777777777771',
      '77777777-7777-7777-7777-777777777772'
    );

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES 
      ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'superadmin@next-generpsolutions.com', crypt('AdminPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rajesh Sharma (Director)","role":"super_admin"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'admin@next-generpsolutions.com', crypt('AdminPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Nair (Operations Head)","role":"admin"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'accounts@next-generpsolutions.com', crypt('AccountsPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Suresh Kumar (Chief Accountant)","role":"accountant"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'counsellor@next-generpsolutions.com', crypt('CounsellorPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ananya Desai (Senior Counsellor)","role":"counsellor"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('55555555-5555-5555-5555-555555555551', '00000000-0000-0000-0000-000000000000', 'vikram.fico@next-generpsolutions.com', crypt('TrainerPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Vikram Rao (SAP FICO Lead)","role":"trainer"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('55555555-5555-5555-5555-555555555552', '00000000-0000-0000-0000-000000000000', 'neha.mm@next-generpsolutions.com', crypt('TrainerPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Neha Patel (SAP MM Lead)","role":"trainer"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'placement@next-generpsolutions.com', crypt('PlacementPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sunita Reddy (Placement Head)","role":"placement_coordinator"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'support@next-generpsolutions.com', crypt('SupportPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ananya Deshmukh (SAP Support Lead)","role":"support"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('77777777-7777-7777-7777-777777777771', '00000000-0000-0000-0000-000000000000', 'amit.gupta@student.next-gen.com', crypt('StudentPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Amit Gupta (SAP FICO Student)","role":"student"}', NOW(), NOW(), 'authenticated', 'authenticated'),
      ('77777777-7777-7777-7777-777777777772', '00000000-0000-0000-0000-000000000000', 'sneha.k@student.next-gen.com', crypt('StudentPass#2026', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sneha Kulkarni (SAP MM Student)","role":"student"}', NOW(), NOW(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO UPDATE SET
      encrypted_password = EXCLUDED.encrypted_password,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      updated_at = NOW();
  END IF;
END $$;

-- 5.4 Courses
INSERT INTO courses (id, course_name, course_code, description, duration_weeks, category, trainer_id, price, status) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'SAP S/4HANA Finance (FICO)', 'SAP-FICO-2026', 'Comprehensive financial accounting and controlling on SAP S/4HANA enterprise edition.', 12, 'SAP Functional', '55555555-5555-5555-5555-555555555551', 45000, 'Published'),
  ('c1000000-0000-0000-0000-000000000002', 'SAP S/4HANA Sourcing & Procurement (MM)', 'SAP-MM-2026', 'End-to-end materials management, purchase requisition, inventory management, and invoice verification.', 10, 'SAP Functional', '55555555-5555-5555-5555-555555555552', 40000, 'Published'),
  ('c1000000-0000-0000-0000-000000000003', 'SAP Sales & Distribution (SD)', 'SAP-SD-2026', 'Sales order processing, pricing procedures, billing, and credit management.', 10, 'SAP Functional', '55555555-5555-5555-5555-555555555551', 40000, 'Published'),
  ('c1000000-0000-0000-0000-000000000004', 'SAP ABAP on HANA & Cloud Extensibility', 'SAP-ABAP-2026', 'Modern object-oriented ABAP programming, CDS views, AMDP, and RAP framework.', 14, 'SAP Technical', '55555555-5555-5555-5555-555555555552', 50000, 'Published')
ON CONFLICT (course_code) DO UPDATE SET
  course_name = EXCLUDED.course_name,
  price = EXCLUDED.price,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Assign courses to trainers
UPDATE profiles SET assigned_course_ids = ARRAY['c1000000-0000-0000-0000-000000000001'::UUID, 'c1000000-0000-0000-0000-000000000003'::UUID] WHERE id = '55555555-5555-5555-5555-555555555551';
UPDATE profiles SET assigned_course_ids = ARRAY['c1000000-0000-0000-0000-000000000002'::UUID, 'c1000000-0000-0000-0000-000000000004'::UUID] WHERE id = '55555555-5555-5555-5555-555555555552';

-- 5.5 Course Modules & Lessons
INSERT INTO course_modules (id, course_id, title, description, order_index) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Module 1: General Ledger & Universal Journal (ACDOCA)', 'Architecture of S/4HANA Finance and GL setup', 1),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Module 2: Accounts Payable (AP) & Accounts Receivable (AR)', 'Vendor and customer business partner integration', 2),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 'Module 1: Enterprise Structure & Master Data', 'Plant, storage location, purchase organization, and material master', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO lessons (id, module_id, course_id, title, lesson_type, duration_minutes, order_index, is_published, content_url) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '1.1 Introduction to SAP S/4HANA Architecture', 'Video', 45, 1, true, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '1.2 Configuring Enterprise Structure in SPRO', 'PDF', 30, 2, true, 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'),
  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', '1.1 Material Master Record Configuration', 'Video', 40, 1, true, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4')
ON CONFLICT (id) DO NOTHING;

-- 5.6 Batches
INSERT INTO batches (id, batch_code, batch_name, course_id, trainer_id, training_mode, start_date, end_date, start_time, end_time, days, maximum_capacity, status) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'B-2026-FICO-01', 'SAP FICO Morning Cohort (Weekday)', 'c1000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555551', 'Online', '2026-09-01', '2026-11-25', '07:30:00', '09:00:00', '{"Mon","Wed","Fri"}', 25, 'Active'),
  ('b1000000-0000-0000-0000-000000000002', 'B-2026-MM-01', 'SAP MM Weekend Masterclass', 'c1000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555552', 'Hybrid', '2026-09-15', '2026-12-10', '10:00:00', '13:00:00', '{"Sat","Sun"}', 20, 'Active')
ON CONFLICT (batch_code) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = NOW();

-- 5.7 Admissions & Students
INSERT INTO admissions (
  id, admission_number, student_name, phone, email, dob, gender, address, city, state, state_code, education, current_employment_status, course_id, training_mode, batch_id, trainer_id, course_fee, discount, net_payable, payment_plan, status
) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'ADM-2026-001', 'Amit Gupta', '+91 98111 22233', 'amit.gupta@student.next-gen.com', '1998-05-12', 'Male', 'B-402, Green Glen Layout, Bellandur', 'Bengaluru', 'Karnataka', '29', 'B.Com, M.Com', 'Employed', 'c1000000-0000-0000-0000-000000000001', 'Online', 'b1000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555551', 45000, 5000, 40000, '2 Installments', 'Confirmed'),
  ('a1000000-0000-0000-0000-000000000002', 'ADM-2026-002', 'Sneha Kulkarni', '+91 98222 33344', 'sneha.k@student.next-gen.com', '1999-11-20', 'Female', 'Flat 12, Prathamesh Heights, Kothrud', 'Pune', 'Maharashtra', '27', 'B.E. Mechanical', 'Student', 'c1000000-0000-0000-0000-000000000002', 'Hybrid', 'b1000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555552', 40000, 0, 40000, 'Full Payment', 'Confirmed')
ON CONFLICT (admission_number) DO NOTHING;

INSERT INTO students (
  id, user_id, admission_id, student_code, admission_number, full_name, email, phone, course_id, batch_id, trainer_id, total_fee, paid_amount, outstanding_amount, attendance_percentage, course_progress, placement_status
) VALUES
  ('51000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777771', 'a1000000-0000-0000-0000-000000000001', 'STU-2026-001', 'ADM-2026-001', 'Amit Gupta', 'amit.gupta@student.next-gen.com', '+91 98111 22233', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555551', 40000, 20000, 20000, 85, 45, 'In Preparation'),
  ('51000000-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777772', 'a1000000-0000-0000-0000-000000000002', 'STU-2026-002', 'ADM-2026-002', 'Sneha Kulkarni', 'sneha.k@student.next-gen.com', '+91 98222 33344', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555552', 40000, 40000, 0, 92, 70, 'Eligible')
ON CONFLICT (student_code) DO NOTHING;

-- 5.8 Fee Accounts & Payments
INSERT INTO student_fee_accounts (
  id, student_id, admission_id, original_fee, discount, net_payable, collected_amount, outstanding_balance, status
) VALUES
  ('f1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 45000, 5000, 40000, 20000, 20000, 'Partial'),
  ('f1000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 40000, 0, 40000, 40000, 0, 'Paid')
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO payments (
  id, receipt_number, fee_account_id, student_id, amount, payment_mode, transaction_reference, payment_date, collected_by, remarks
) VALUES
  ('61000000-0000-0000-0000-000000000001', 'REC-2026-0001', 'f1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 20000, 'UPI', 'UPI-98234827104', '2026-09-01', '33333333-3333-3333-3333-333333333333', '1st installment payment at admission'),
  ('61000000-0000-0000-0000-000000000002', 'REC-2026-0002', 'f1000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 40000, 'Net Banking', 'NEFT-HDFC-9912048', '2026-09-15', '33333333-3333-3333-3333-333333333333', 'Full course fee payment')
ON CONFLICT (receipt_number) DO NOTHING;

INSERT INTO receipts (
  id, receipt_number, payment_id, student_id, student_name, student_code, course_name, amount, amount_in_words, payment_mode, transaction_reference, receipt_date, issued_by, taxable_amount, cgst_amount, sgst_amount, total_tax
) VALUES
  ('81000000-0000-0000-0000-000000000001', 'REC-2026-0001', '61000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Amit Gupta', 'STU-2026-001', 'SAP S/4HANA Finance (FICO)', 20000, 'Twenty Thousand Rupees Only', 'UPI', 'UPI-98234827104', '2026-09-01', '33333333-3333-3333-3333-333333333333', 16949.15, 1525.42, 1525.42, 3050.84),
  ('81000000-0000-0000-0000-000000000002', 'REC-2026-0002', '61000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'Sneha Kulkarni', 'STU-2026-002', 'SAP S/4HANA Sourcing & Procurement (MM)', 40000, 'Forty Thousand Rupees Only', 'Net Banking', 'NEFT-HDFC-9912048', '2026-09-15', '33333333-3333-3333-3333-333333333333', 33898.31, 3050.85, 3050.85, 6101.69)
ON CONFLICT (receipt_number) DO NOTHING;

-- 5.9 SAP Server Systems & Lab Sandbox
INSERT INTO sap_server_systems (id, system_name, sid, instance_number, server_host, sap_router, default_client, description, status) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'SAP S/4HANA 2023 Enterprise Sandbox', 'S4H', '00', 's4h.lab.next-gen.internal', '/H/router.next-gen.internal/S/3299', '800', 'Primary student training lab instance with fully pre-configured best practice company codes (1000, 1010).', 'Online'),
  ('e1000000-0000-0000-0000-000000000002', 'SAP ECC 6.0 EHP8 Legacy Environment', 'EC8', '01', 'ecc.lab.next-gen.internal', '/H/router.next-gen.internal/S/3299', '800', 'Secondary classical ERP lab instance for comparative analysis.', 'Online')
ON CONFLICT (id) DO NOTHING;

-- 5.10 Test Todos
INSERT INTO todos (id, title, is_completed) VALUES
  ('91000000-0000-0000-0000-000000000001', 'Verify Supabase PostgreSQL live connection', true),
  ('91000000-0000-0000-0000-000000000002', 'Complete RLS policies for academic and accounts tables', true),
  ('91000000-0000-0000-0000-000000000003', 'Synchronize institute student roster and fee ledgers', false)
ON CONFLICT (id) DO NOTHING;

-- 6. SUPABASE STORAGE BUCKETS SETUP & STORAGE RLS POLICIES
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES 
      ('resumes', 'resumes', true, 15728640, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
      ('assignments', 'assignments', true, 26214400, ARRAY['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
      ('doubt-attachments', 'doubt-attachments', true, 15728640, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']),
      ('receipts', 'receipts', true, 10485760, ARRAY['application/pdf', 'image/png', 'image/jpeg']),
      ('screenshots', 'screenshots', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
      ('avatars', 'avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

    -- Storage RLS Policies
    DROP POLICY IF EXISTS "Public can view active storage objects" ON storage.objects;
    CREATE POLICY "Public can view active storage objects" ON storage.objects
      FOR SELECT USING (bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'receipts', 'screenshots', 'avatars'));

    DROP POLICY IF EXISTS "Authenticated users can upload storage objects" ON storage.objects;
    CREATE POLICY "Authenticated users can upload storage objects" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'receipts', 'screenshots', 'avatars'));
  END IF;
END $$;

COMMIT;
