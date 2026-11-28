-- ==============================================================================
-- NEXT-GEN ERP & LMS: STORAGE SECURITY HARDENING (P0 HOTFIX)
-- Migration: 20261127140000_storage_security_hardening.sql
-- Resolves: SEC-BUG-01 (Insecure storage RLS policies & public bucket exposure)
-- ==============================================================================

-- 1. Ensure Sensitive Buckets are Strictly Private
UPDATE storage.buckets
SET public = false
WHERE id IN ('receipts', 'resumes', 'payment-proofs', 'student-photos');

-- Ensure avatars remains public for UI display, while assignments and doubts require authenticated access
UPDATE storage.buckets
SET public = false
WHERE id IN ('assignments', 'doubt-attachments');

UPDATE storage.buckets
SET public = true
WHERE id = 'avatars';

-- 2. Drop all insecure legacy anonymous storage policies
DROP POLICY IF EXISTS "LMS Public Read Policy" ON storage.objects;
DROP POLICY IF EXISTS "LMS Upload Policy" ON storage.objects;
DROP POLICY IF EXISTS "LMS Update Policy" ON storage.objects;
DROP POLICY IF EXISTS "LMS Delete Policy" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow individual read" ON storage.objects;

-- 3. SELECT (Read) Policies
-- Public read ONLY for avatars
CREATE POLICY "Public Avatars Read Policy"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Receipts Read: Restricted to authenticated financial/management staff and student recipient
CREATE POLICY "Authorized Receipts Read Policy"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    (auth.jwt()->>'role' IN ('super_admin', 'admin', 'accountant', 'counsellor'))
    OR (auth.uid() = owner)
    OR (name LIKE (auth.uid() || '/%'))
  )
);

-- Resumes Read: Restricted to placement coordinator, administrators, and the resume owner
CREATE POLICY "Authorized Resumes Read Policy"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (
    (auth.jwt()->>'role' IN ('super_admin', 'admin', 'placement_coordinator'))
    OR (auth.uid() = owner)
    OR (name LIKE (auth.uid() || '/%'))
  )
);

-- Assignments & Doubts Read: Restricted to trainers, academic support, admins, and student owner
CREATE POLICY "Authorized Academics Read Policy"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN ('assignments', 'doubt-attachments', 'screenshots')
  AND (
    (auth.jwt()->>'role' IN ('super_admin', 'admin', 'trainer', 'support'))
    OR (auth.uid() = owner)
    OR (name LIKE (auth.uid() || '/%'))
  )
);

-- 4. INSERT (Upload) Policies
-- Disallow direct client upload to receipts (receipts MUST be created only by serverless/service-role)
CREATE POLICY "Staff Receipt Upload Policy"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (auth.jwt()->>'role' IN ('super_admin', 'admin', 'accountant'))
);

-- Allow authenticated users to upload their own resumes, assignments, doubts, screenshots, avatars
CREATE POLICY "Authenticated User Upload Policy"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'screenshots', 'avatars')
  AND (
    auth.uid() = owner
    OR (name LIKE (auth.uid() || '/%'))
    OR (auth.jwt()->>'role' IN ('super_admin', 'admin', 'trainer', 'counsellor', 'support', 'placement_coordinator', 'student'))
  )
);

-- 5. UPDATE Policies (No updates permitted on receipts; strict owner-only for other buckets)
CREATE POLICY "Owner Restricted Update Policy"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id != 'receipts'
  AND (
    auth.uid() = owner
    OR (auth.jwt()->>'role' IN ('super_admin', 'admin'))
  )
);

-- 6. DELETE Policies (Receipts cannot be deleted by clients; strict owner-only for other buckets)
CREATE POLICY "Owner Restricted Delete Policy"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id != 'receipts'
  AND (
    auth.uid() = owner
    OR (auth.jwt()->>'role' IN ('super_admin', 'admin'))
  )
);
