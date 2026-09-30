-- ==============================================================================
-- NEXT-GEN ERP & LMS: SUPABASE STORAGE SETUP
-- Buckets: resumes, screenshots, assignments, avatars
-- ==============================================================================

-- 1. Create or Update Storage Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'resumes',
    'resumes',
    true,
    10485760, -- 10MB
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'screenshots',
    'screenshots',
    true,
    10485760, -- 10MB
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
    'assignments',
    'assignments',
    true,
    20971520, -- 20MB
    ARRAY[
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
-- Allow public read on all 4 LMS buckets
DROP POLICY IF EXISTS "LMS Public Read Policy" ON storage.objects;
CREATE POLICY "LMS Public Read Policy"
ON storage.objects FOR SELECT
USING (bucket_id IN ('resumes', 'screenshots', 'assignments', 'avatars'));

-- Allow upload for users/anon key
DROP POLICY IF EXISTS "LMS Upload Policy" ON storage.objects;
CREATE POLICY "LMS Upload Policy"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id IN ('resumes', 'screenshots', 'assignments', 'avatars'));

-- Allow update
DROP POLICY IF EXISTS "LMS Update Policy" ON storage.objects;
CREATE POLICY "LMS Update Policy"
ON storage.objects FOR UPDATE
USING (bucket_id IN ('resumes', 'screenshots', 'assignments', 'avatars'));

-- Allow delete
DROP POLICY IF EXISTS "LMS Delete Policy" ON storage.objects;
CREATE POLICY "LMS Delete Policy"
ON storage.objects FOR DELETE
USING (bucket_id IN ('resumes', 'screenshots', 'assignments', 'avatars'));
