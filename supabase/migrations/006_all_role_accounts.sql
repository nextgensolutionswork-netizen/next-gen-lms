-- Next-Gen ERP LMS: 006_all_role_accounts.sql
-- Seed & Ensure All 8 RBAC Role Accounts in Supabase Auth & Public Profiles

-- 1. Ensure 'support' is allowed in profiles role constraint
ALTER TABLE IF EXISTS profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE IF EXISTS profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'admin', 'accountant', 'counsellor', 'trainer', 'placement_coordinator', 'support', 'student'));

-- 2. Upsert All 8 Role Accounts in public.profiles
INSERT INTO profiles (id, email, full_name, role, phone, is_active) VALUES
-- 1. Super Admin
('11111111-1111-1111-1111-111111111111', 'superadmin@next-generpsolutions.com', 'Rajesh Sharma (Director)', 'super_admin', '+91 98000 00001', true),

-- 2. Operations Admin
('22222222-2222-2222-2222-222222222222', 'admin@next-generpsolutions.com', 'Priya Nair (Operations Head)', 'admin', '+91 98000 00002', true),

-- 3. Accountant
('33333333-3333-3333-3333-333333333333', 'accounts@next-generpsolutions.com', 'Suresh Kumar (Chief Accountant)', 'accountant', '+91 98000 00003', true),

-- 4. Counsellor
('44444444-4444-4444-4444-444444444444', 'counsellor@next-generpsolutions.com', 'Ananya Desai (Senior Counsellor)', 'counsellor', '+91 98000 00004', true),

-- 5. Trainer / Faculty
('55555555-5555-5555-5555-555555555551', 'vikram.fico@next-generpsolutions.com', 'Vikram Rao (SAP FICO Lead)', 'trainer', '+91 98000 00005', true),
('55555555-5555-5555-5555-555555555552', 'neha.mm@next-generpsolutions.com', 'Neha Patel (SAP MM Lead)', 'trainer', '+91 98000 00006', true),

-- 6. Placement Coordinator
('66666666-6666-6666-6666-666666666666', 'placement@next-generpsolutions.com', 'Sunita Reddy (Placement Head)', 'placement_coordinator', '+91 98000 00007', true),

-- 7. Academic Support Mentor
('88888888-8888-8888-8888-888888888888', 'support@next-generpsolutions.com', 'Ananya Deshmukh (SAP Support Lead)', 'support', '+91 98000 00008', true),

-- 8. Enrolled Student
('77777777-7777-7777-7777-777777777771', 'amit.gupta@student.next-gen.com', 'Amit Gupta (SAP FICO Student)', 'student', '+91 98111 22233', true),
('77777777-7777-7777-7777-777777777772', 'sneha.k@student.next-gen.com', 'Sneha Kulkarni (SAP MM Student)', 'student', '+91 98222 33344', true)
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  is_active = true,
  updated_at = NOW();

-- 3. Seed into auth.users (if pgcrypto and auth schema are present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Super Admin
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      '00000000-0000-0000-0000-000000000000',
      'superadmin@next-generpsolutions.com',
      crypt('AdminPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Rajesh Sharma (Director)","role":"super_admin"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('AdminPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Operations Admin
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '22222222-2222-2222-2222-222222222222',
      '00000000-0000-0000-0000-000000000000',
      'admin@next-generpsolutions.com',
      crypt('AdminPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Priya Nair (Operations Head)","role":"admin"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('AdminPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Accountant
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '33333333-3333-3333-3333-333333333333',
      '00000000-0000-0000-0000-000000000000',
      'accounts@next-generpsolutions.com',
      crypt('AccountsPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Suresh Kumar (Chief Accountant)","role":"accountant"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('AccountsPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Counsellor
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '44444444-4444-4444-4444-444444444444',
      '00000000-0000-0000-0000-000000000000',
      'counsellor@next-generpsolutions.com',
      crypt('CounsellorPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Ananya Desai (Senior Counsellor)","role":"counsellor"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('CounsellorPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Trainer
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '55555555-5555-5555-5555-555555555551',
      '00000000-0000-0000-0000-000000000000',
      'vikram.fico@next-generpsolutions.com',
      crypt('TrainerPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Vikram Rao (SAP FICO Lead)","role":"trainer"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('TrainerPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Placement Coordinator
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '66666666-6666-6666-6666-666666666666',
      '00000000-0000-0000-0000-000000000000',
      'placement@next-generpsolutions.com',
      crypt('PlacementPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Sunita Reddy (Placement Head)","role":"placement_coordinator"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('PlacementPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Support Mentor
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '88888888-8888-8888-8888-888888888888',
      '00000000-0000-0000-0000-000000000000',
      'support@next-generpsolutions.com',
      crypt('SupportPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Ananya Deshmukh (SAP Support Lead)","role":"support"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('SupportPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

    -- Student
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      '77777777-7777-7777-7777-777777777771',
      '00000000-0000-0000-0000-000000000000',
      'amit.gupta@student.next-gen.com',
      crypt('StudentPass#2026', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Amit Gupta (Student)","role":"student"}',
      NOW(), NOW(), 'authenticated', 'authenticated'
    ) ON CONFLICT (email) DO UPDATE SET
      encrypted_password = crypt('StudentPass#2026', gen_salt('bf')),
      email_confirmed_at = NOW();

  END IF;
END $$;
