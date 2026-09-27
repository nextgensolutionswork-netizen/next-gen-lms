-- Next-Gen ERP LMS: 003_seed_data.sql
-- Seed Data for Next-Gen ERP Solutions - SAP Professional Training Institute

-- 1. System Settings
INSERT INTO system_settings (
  institute_name,
  tagline,
  address,
  phone,
  email,
  gst_number,
  default_currency,
  academic_year,
  receipt_prefix,
  invoice_prefix,
  timezone
) VALUES (
  'Next-Gen ERP Solutions',
  'Premier SAP Training, Certification & Placement Institute',
  'Plot 42, Silicon Valley Towers, Hitec City, Hyderabad, Telangana 500081',
  '+91 98765 43210',
  'admissions@next-generpsolutions.com',
  '36AAACN1234F1Z8',
  'INR',
  '2026-2027',
  'REC',
  'INV',
  'Asia/Kolkata'
) ON CONFLICT DO NOTHING;

-- 2. Staff & User Profiles
INSERT INTO profiles (id, email, full_name, role, phone, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'superadmin@next-generpsolutions.com', 'Rajesh Sharma (Director)', 'super_admin', '+91 98000 00001', true),
('22222222-2222-2222-2222-222222222222', 'admin@next-generpsolutions.com', 'Priya Nair (Operations Head)', 'admin', '+91 98000 00002', true),
('33333333-3333-3333-3333-333333333333', 'accounts@next-generpsolutions.com', 'Suresh Kumar (Chief Accountant)', 'accountant', '+91 98000 00003', true),
('44444444-4444-4444-4444-444444444444', 'counsellor@next-generpsolutions.com', 'Ananya Desai (Senior Counsellor)', 'counsellor', '+91 98000 00004', true),
('55555555-5555-5555-5555-555555555551', 'vikram.fico@next-generpsolutions.com', 'Vikram Rao (SAP FICO Lead)', 'trainer', '+91 98000 00005', true),
('55555555-5555-5555-5555-555555555552', 'neha.mm@next-generpsolutions.com', 'Neha Patel (SAP MM Lead)', 'trainer', '+91 98000 00006', true),
('66666666-6666-6666-6666-666666666666', 'placement@next-generpsolutions.com', 'Sunita Reddy (Placement Head)', 'placement_coordinator', '+91 98000 00007', true),
('77777777-7777-7777-7777-777777777771', 'amit.gupta@student.next-gen.com', 'Amit Gupta', 'student', '+91 98111 22233', true),
('77777777-7777-7777-7777-777777777772', 'sneha.k@student.next-gen.com', 'Sneha Kulkarni', 'student', '+91 98222 33344', true)
ON CONFLICT DO NOTHING;

-- 3. SAP Courses
INSERT INTO courses (id, course_name, course_code, description, duration_weeks, category, trainer_id, price, status) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAP S/4HANA Finance (FICO)', 'SAP-FICO-2026', 'Comprehensive Financial Accounting and Controlling on SAP S/4HANA with real-time enterprise implementation projects.', 12, 'SAP Functional', '55555555-5555-5555-5555-555555555551', 45000, 'Published'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'SAP S/4HANA Materials Management (MM)', 'SAP-MM-2026', 'End-to-end Procurement, Inventory Management, Physical Inventory, and Logistics Invoice Verification.', 10, 'SAP Functional', '55555555-5555-5555-5555-555555555552', 40000, 'Published'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'SAP Sales & Distribution (SD)', 'SAP-SD-2026', 'Order-to-Cash (O2C) cycle, Pricing, Billing, Shipping, and Credit Management on S/4HANA.', 10, 'SAP Functional', NULL, 40000, 'Published'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'SAP ABAP on HANA & Core Data Services', 'SAP-ABAP-2026', 'Modern ABAP programming, CDS Views, AMDP, OData Services, and RAP (RESTful Application Programming model).', 12, 'SAP Technical', NULL, 50000, 'Published')
ON CONFLICT DO NOTHING;

-- Update trainer course assignment scope
UPDATE profiles SET assigned_course_ids = ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid] WHERE id = '55555555-5555-5555-5555-555555555551';
UPDATE profiles SET assigned_course_ids = ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid] WHERE id = '55555555-5555-5555-5555-555555555552';

-- 4. Course Modules & Lessons for SAP FICO
INSERT INTO course_modules (id, course_id, title, description, order_index) VALUES
('m1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Module 1: Enterprise Structure & General Ledger', 'Company Code, Chart of Accounts, Fiscal Year Variants, and Document Posting', 1),
('m2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Module 2: Accounts Payable & Accounts Receivable', 'Vendor/Customer Master, Automatic Payment Program (F110), and Dunning', 2),
('m3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Module 3: Asset Accounting & S/4HANA New GL', 'Depreciation Run, Asset Master, Universal Journal (ACDOCA)', 3)
ON CONFLICT DO NOTHING;

INSERT INTO lessons (id, module_id, course_id, title, lesson_type, duration_minutes, order_index, is_published, video_signed_path) VALUES
('l1111111-1111-1111-1111-111111111111', 'm1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1.1 Introduction to SAP S/4HANA Architecture & Navigation', 'Video', 45, 1, true, '/videos/sap-fico/mod1_intro.mp4'),
('l2222222-2222-2222-2222-222222222222', 'm1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1.2 Configuring Enterprise Structure (OX02, OX15, OX16)', 'Video', 60, 2, true, '/videos/sap-fico/mod1_config.mp4'),
('l3333333-3333-3333-3333-333333333333', 'm1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Module 1 Configuration Blueprints & Handout', 'PDF', 20, 3, true, '/docs/sap-fico/mod1_handout.pdf'),
('l4444444-4444-4444-4444-444444444444', 'm2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2.1 Business Partner (BP) Approach in S/4HANA', 'Video', 55, 1, true, '/videos/sap-fico/mod2_bp.mp4'),
('l5555555-5555-5555-5555-555555555555', 'm2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2.2 Automatic Payment Program (F110) End-to-End', 'Video', 75, 2, true, '/videos/sap-fico/mod2_f110.mp4')
ON CONFLICT DO NOTHING;

-- 5. Batches
INSERT INTO batches (id, batch_code, batch_name, course_id, trainer_id, training_mode, start_date, end_date, start_time, end_time, days, maximum_capacity, status) VALUES
('b1111111-1111-1111-1111-111111111111', 'B-FICO-2601', 'SAP FICO Morning Fast-Track Batch', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555551', 'Hybrid', '2026-02-01', '2026-04-30', '08:00:00', '10:00:00', '{"Mon","Tue","Wed","Thu","Fri"}', 25, 'Active'),
('b2222222-2222-2222-2222-222222222222', 'B-MM-2601', 'SAP MM Weekend Professional Batch', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555552', 'Online', '2026-02-15', '2026-05-15', '10:00:00', '13:00:00', '{"Sat","Sun"}', 30, 'Active')
ON CONFLICT DO NOTHING;

-- 6. Admissions & Students
INSERT INTO admissions (
  id, admission_number, student_name, phone, email, dob, gender, address, city, education, experience_years,
  current_employment_status, course_id, training_mode, batch_id, trainer_id, admission_date, course_fee,
  discount, discount_reason, net_payable, payment_plan, counsellor_id, status
) VALUES (
  'ad111111-1111-1111-1111-111111111111', 'ADM-2026-0001', 'Amit Gupta', '+91 98111 22233', 'amit.gupta@student.next-gen.com',
  '1999-05-14', 'Male', 'H-12, Madhapur', 'Hyderabad', 'B.Com, MBA Finance', 2, 'Employed',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hybrid', 'b1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555551',
  '2026-01-25', 45000, 5000, 'Early bird discount', 40000, '3 Installments', '44444444-4444-4444-4444-444444444444', 'Confirmed'
),
(
  'ad222222-2222-2222-2222-222222222222', 'ADM-2026-0002', 'Sneha Kulkarni', '+91 98222 33344', 'sneha.k@student.next-gen.com',
  '2001-08-20', 'Female', '404 Baner Road', 'Pune', 'B.Tech Mechanical', 1, 'Career Gap',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Online', 'b2222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555552',
  '2026-02-02', 40000, 0, NULL, 40000, '2 Installments', '44444444-4444-4444-4444-444444444444', 'Confirmed'
) ON CONFLICT DO NOTHING;

INSERT INTO students (
  id, user_id, admission_id, student_code, admission_number, full_name, email, phone, course_id, batch_id, trainer_id,
  joining_date, status, total_fee, paid_amount, outstanding_amount, attendance_percentage, course_progress, placement_status
) VALUES (
  's1111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777771', 'ad111111-1111-1111-1111-111111111111',
  'STU-FICO-001', 'ADM-2026-0001', 'Amit Gupta', 'amit.gupta@student.next-gen.com', '+91 98111 22233',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555551',
  '2026-02-01', 'Active', 40000, 25000, 15000, 92.5, 68.0, 'Resume Preparation'
),
(
  's2222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777772', 'ad222222-2222-2222-2222-222222222222',
  'STU-MM-002', 'ADM-2026-0002', 'Sneha Kulkarni', 'sneha.k@student.next-gen.com', '+91 98222 33344',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555552',
  '2026-02-15', 'Active', 40000, 20000, 20000, 88.0, 52.0, 'Not Started'
) ON CONFLICT DO NOTHING;

-- 7. Fee Accounts, Installments & Payments
INSERT INTO student_fee_accounts (
  id, student_id, admission_id, course_id, original_fee, discount, discount_reason, net_payable, paid_amount, outstanding_amount, payment_plan, status
) VALUES (
  'fa111111-1111-1111-1111-111111111111', 's1111111-1111-1111-1111-111111111111', 'ad111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 45000, 5000, 'Early bird discount', 40000, 25000, 15000, '3 Installments', 'Partially Paid'
) ON CONFLICT DO NOTHING;

INSERT INTO installments (id, fee_account_id, student_id, installment_number, amount, due_date, paid_amount, paid_date, status) VALUES
('inst-1', 'fa111111-1111-1111-1111-111111111111', 's1111111-1111-1111-1111-111111111111', 1, 15000, '2026-01-25', 15000, '2026-01-25', 'Paid'),
('inst-2', 'fa111111-1111-1111-1111-111111111111', 's1111111-1111-1111-1111-111111111111', 2, 10000, '2026-02-25', 10000, '2026-02-24', 'Paid'),
('inst-3', 'fa111111-1111-1111-1111-111111111111', 's1111111-1111-1111-1111-111111111111', 3, 15000, '2026-03-25', 0, NULL, 'Upcoming')
ON CONFLICT DO NOTHING;

INSERT INTO payments (id, receipt_number, student_id, fee_account_id, installment_id, course_id, amount, payment_date, payment_mode, transaction_reference, collected_by, notes) VALUES
('p1111111-1111-1111-1111-111111111111', 'REC-2026-0001', 's1111111-1111-1111-1111-111111111111', 'fa111111-1111-1111-1111-111111111111', 'inst-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 15000, '2026-01-25', 'UPI', 'UPI/260125/4491028', '33333333-3333-3333-3333-333333333333', 'Admission installment 1 paid'),
('p2222222-2222-2222-2222-222222222222', 'REC-2026-0002', 's1111111-1111-1111-1111-111111111111', 'fa111111-1111-1111-1111-111111111111', 'inst-2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10000, '2026-02-24', 'Bank Transfer', 'NEFT-HDFC-991823', '33333333-3333-3333-3333-333333333333', 'Installment 2 paid')
ON CONFLICT DO NOTHING;

INSERT INTO receipts (
  id, receipt_number, payment_id, student_id, student_name, admission_number, course_name, payment_amount, payment_mode,
  transaction_reference, payment_date, remaining_balance, authorized_by, institute_name, institute_address, institute_phone, institute_gst
) VALUES (
  'r1111111-1111-1111-1111-111111111111', 'REC-2026-0001', 'p1111111-1111-1111-1111-111111111111', 's1111111-1111-1111-1111-111111111111',
  'Amit Gupta', 'ADM-2026-0001', 'SAP S/4HANA Finance (FICO)', 15000, 'UPI', 'UPI/260125/4491028', '2026-01-25', 25000,
  'Suresh Kumar (Accountant)', 'Next-Gen ERP Solutions', 'Plot 42, Silicon Valley Towers, Hitec City, Hyderabad 500081', '+91 98765 43210', '36AAACN1234F1Z8'
) ON CONFLICT DO NOTHING;

-- 8. CRM Leads
INSERT INTO leads (
  lead_code, full_name, phone, email, interested_course_id, current_status, experience_years, training_preference,
  lead_source, counsellor_id, demo_preference, stage, notes
) VALUES
('LD-2026-001', 'Vikas Sharma', '+91 99887 76655', 'vikas.sharma@gmail.com', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Working professional', 3, 'Hybrid', 'Google Ads', '44444444-4444-4444-4444-444444444444', true, 'Demo Scheduled', 'Interested in SAP FICO S/4HANA migration syllabus'),
('LD-2026-002', 'Deepika Reddy', '+91 98711 22334', 'deepika.r@gmail.com', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fresher', 0, 'Classroom', 'Walk-in', '44444444-4444-4444-4444-444444444444', false, 'Follow-up', 'Looking for SAP MM weekend batch')
ON CONFLICT DO NOTHING;

-- 9. Expenses & Vendors
INSERT INTO vendors (id, vendor_name, contact_person, phone, email, address, gst_number) VALUES
('v1111111-1111-1111-1111-111111111111', 'Amazon Web Services India', 'AWS Billing', '+91 80 4000 1234', 'aws-billing@amazon.com', 'Bengaluru, India', '29AABCA1234F1Z1'),
('v2222222-2222-2222-2222-222222222222', 'Silicon Towers Facilities', 'K. Ramesh', '+91 94400 11223', 'facilities@silicontowers.com', 'Hitec City, Hyderabad', '36AAAFS5566G1Z2')
ON CONFLICT DO NOTHING;

INSERT INTO expenses (expense_code, expense_date, category, vendor_id, description, amount, payment_mode, reference, status, approved_by) VALUES
('EXP-2026-001', '2026-02-01', 'Rent', 'v2222222-2222-2222-2222-222222222222', 'Institute Classroom & Office Rent for Feb 2026', 75000, 'Bank Transfer', 'NEFT-RENT-FEB26', 'Paid', '11111111-1111-1111-1111-111111111111'),
('EXP-2026-002', '2026-02-05', 'Internet', 'v1111111-1111-1111-1111-111111111111', 'High-Speed Dedicated Fiber Leased Line (1 Gbps)', 12500, 'UPI', 'UPI-ACT-020526', 'Paid', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- 10. Placement Job Openings
INSERT INTO job_openings (company_name, job_title, module, experience_required, location, salary_range, description, application_deadline, status) VALUES
('Deloitte USI', 'SAP FICO Associate Consultant', 'SAP FICO', '0-2 Years', 'Hyderabad / Bengaluru', '₹6.5 - ₹8.5 LPA', 'Implementation and support of S/4HANA Finance with General Ledger, AP/AR, and Asset Accounting knowledge.', '2026-04-30', 'Open'),
('Accenture Solutions', 'SAP MM Functional Analyst', 'SAP MM', '0-3 Years', 'Pune / Mumbai', '₹6.0 - ₹8.0 LPA', 'Procure to pay lifecycle, master data governance, inventory control, and purchase order configuration.', '2026-05-15', 'Open')
ON CONFLICT DO NOTHING;

-- 11. Certificates
INSERT INTO certificates (certificate_id, student_id, student_name, course_id, course_name, grade, issue_date, completion_date, attendance_percentage, assignment_completion_rate, exam_score_percentage, verification_url, is_valid) VALUES
('CERT-2026-FICO-0091', 's1111111-1111-1111-1111-111111111111', 'Amit Gupta', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAP S/4HANA Finance (FICO)', 'A+ (Distinction)', '2026-04-20', '2026-04-18', 92.5, 95.0, 91.0, 'https://lms.next-generpsolutions.com/certificate/verify/CERT-2026-FICO-0091', true)
ON CONFLICT DO NOTHING;
