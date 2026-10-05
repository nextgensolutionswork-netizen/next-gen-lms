BEGIN;

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
