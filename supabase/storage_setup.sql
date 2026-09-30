-- ==============================================================================
-- NEXT-GEN ERP & LMS: SUPABASE STORAGE SETUP
-- Buckets: resumes, assignments, doubt-attachments, receipts, screenshots, avatars
-- ==============================================================================

-- 1. Create or Update Storage Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'resumes',
    'resumes',
    true,
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
    true,
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
    true,
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
    true,
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
    true,
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
    true,
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

-- 2. Storage RLS Policies
-- Allow read on LMS buckets (public read & signed URL verification)
DROP POLICY IF EXISTS "LMS Public Read Policy" ON storage.objects;
CREATE POLICY "LMS Public Read Policy"
ON storage.objects FOR SELECT
USING (bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'receipts', 'screenshots', 'avatars'));

-- Allow upload for users/anon key
DROP POLICY IF EXISTS "LMS Upload Policy" ON storage.objects;
CREATE POLICY "LMS Upload Policy"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'receipts', 'screenshots', 'avatars'));

-- Allow update
DROP POLICY IF EXISTS "LMS Update Policy" ON storage.objects;
CREATE POLICY "LMS Update Policy"
ON storage.objects FOR UPDATE
USING (bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'receipts', 'screenshots', 'avatars'));

-- Allow delete
DROP POLICY IF EXISTS "LMS Delete Policy" ON storage.objects;
CREATE POLICY "LMS Delete Policy"
ON storage.objects FOR DELETE
USING (bucket_id IN ('resumes', 'assignments', 'doubt-attachments', 'receipts', 'screenshots', 'avatars'));
