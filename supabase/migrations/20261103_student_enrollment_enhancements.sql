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
ALTER TABLE student_payments
  ADD COLUMN IF NOT EXISTS our_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS our_bank_account_id TEXT,
  ADD COLUMN IF NOT EXISTS our_upi_details TEXT;

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
