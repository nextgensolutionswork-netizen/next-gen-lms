-- ==============================================================================
-- NEXT-GEN ERP & LMS: SUPABASE STORAGE SETUP (HARDENED SECURITY)
-- Buckets: resumes, assignments, doubt-attachments, receipts, screenshots, avatars
-- ==============================================================================

-- 1. Create or Update Storage Buckets (Strict Privacy on Sensitive Data)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'resumes',
    'resumes',
    false, -- SEC-01 Hardening: Resumes contain PII, private access only
    15728640, -- 15MB
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'assignments',
    'assignments',
    false,
    26214400, -- 25MB
    ARRAY[
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/x-rar-compressed'
    ]
  ),
  (
    'doubt-attachments',
    'doubt-attachments',
    false,
    15728640, -- 15MB
    ARRAY[
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf'
    ]
  ),
  (
    'receipts',
    'receipts',
    false, -- SEC-01 Hardening: Financial payment receipts must never be public
    10485760, -- 10MB
    ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ]
  ),
  (
    'screenshots',
    'screenshots',
    false,
    15728640, -- 15MB
    ARRAY[
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf'
    ]
  ),
  (
    'avatars',
    'avatars',
    true, -- Public read permitted for display avatars
    5242880, -- 5MB
    ARRAY[
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop all insecure legacy anonymous storage policies
DROP POLICY IF EXISTS "LMS Public Read Policy" ON storage.objects;
DROP POLICY IF EXISTS "LMS Upload Policy" ON storage.objects;
DROP POLICY IF EXISTS "LMS Update Policy" ON storage.objects;
DROP POLICY IF EXISTS "LMS Delete Policy" ON storage.objects;

-- 3. SELECT (Read) Policies
CREATE POLICY "Public Avatars Read Policy"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

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
CREATE POLICY "Staff Receipt Upload Policy"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (auth.jwt()->>'role' IN ('super_admin', 'admin', 'accountant'))
);

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

-- 5. UPDATE Policies (No updates permitted on receipts; strict owner-only for others)
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

-- 6. DELETE Policies (Receipts cannot be deleted by clients; strict owner-only for others)
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
