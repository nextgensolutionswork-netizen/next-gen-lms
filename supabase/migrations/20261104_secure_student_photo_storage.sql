-- Migration: Secure Student Photo Storage Bucket & RLS Hardening
-- Date: 2026-11-04
-- Description:
--   1. Ensures student-photos bucket is strictly private with 2MB size limit and image MIME restrictions.
--   2. Drops overly permissive legacy policies on storage.objects for student-photos.
--   3. Implements RESTRICTIVE tenant-isolation and path-traversal policy.
--   4. Implements PERMISSIVE role-based and record-level authorization policies:
--      - Upload: super_admin, admin, counsellor, onboarding_team, or student for self
--      - Read: super_admin, admin, counsellor, onboarding_team, accountant, or student for self only
--      - Update: super_admin, admin, onboarding_team, counsellor/student for own files
--      - Delete: super_admin, admin only
--      - Unauthorized roles (trainers, support, placement, anon) explicitly denied.

-- 1. Ensure bucket configuration is private with strict constraints
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

-- 2. Drop overly broad legacy policies on storage.objects
DROP POLICY IF EXISTS "Authenticated staff can upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view student photos" ON storage.objects;
DROP POLICY IF EXISTS "student_photos_tenant_isolation" ON storage.objects;
DROP POLICY IF EXISTS "authorized_staff_upload_student_photos" ON storage.objects;
DROP POLICY IF EXISTS "authorized_read_student_photos" ON storage.objects;
DROP POLICY IF EXISTS "authorized_update_student_photos" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_student_photos" ON storage.objects;

-- 3. Tenant Boundary & Path Traversal Guard (RESTRICTIVE for student-photos)
-- Applies to all operations. Blocks cross-tenant access and malformed paths.
CREATE POLICY "student_photos_tenant_isolation"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  bucket_id <> 'student-photos'
  OR (
    name ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$'
    AND (
      (storage.foldername(name))[1] = (SELECT COALESCE(tenant_id, 'default') FROM public.profiles WHERE id = auth.uid())
      OR
      (storage.foldername(name))[1] = (SELECT encode(sha256(COALESCE(tenant_id, 'default')::bytea), 'hex') FROM public.profiles WHERE id = auth.uid())
    )
  )
)
WITH CHECK (
  bucket_id <> 'student-photos'
  OR (
    name ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$'
    AND (
      (storage.foldername(name))[1] = (SELECT COALESCE(tenant_id, 'default') FROM public.profiles WHERE id = auth.uid())
      OR
      (storage.foldername(name))[1] = (SELECT encode(sha256(COALESCE(tenant_id, 'default')::bytea), 'hex') FROM public.profiles WHERE id = auth.uid())
    )
  )
);

-- 4. Authorized Upload Policy (PERMISSIVE INSERT)
-- Allowed: super_admin, admin, counsellor, onboarding_team, or student for self
CREATE POLICY "authorized_staff_upload_student_photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-photos'
  AND (
    get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'counsellor'::text, 'onboarding_team'::text])
    OR (
      get_current_user_role() = 'student'
      AND (owner = auth.uid() OR owner IS NULL)
    )
  )
);

-- 5. Authorized Read Policy (PERMISSIVE SELECT)
-- Allowed: super_admin, admin, counsellor, onboarding_team, accountant.
-- Student allowed ONLY for their own photo record.
-- Trainers and unrelated staff (support, placement) are DENIED.
CREATE POLICY "authorized_read_student_photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-photos'
  AND (
    get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'counsellor'::text, 'onboarding_team'::text, 'accountant'::text])
    OR (
      get_current_user_role() = 'student'
      AND (
        owner = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.user_id = auth.uid()
            AND (
              s.photo_url LIKE '%' || name
              OR s.profile_photo LIKE '%' || name
            )
        )
        OR EXISTS (
          SELECT 1 FROM public.admissions a
          JOIN public.students s ON s.admission_id = a.id
          WHERE s.user_id = auth.uid()
            AND a.photo_url LIKE '%' || name
        )
      )
    )
  )
);

-- 6. Authorized Update Policy (PERMISSIVE UPDATE)
-- Allowed: super_admin, admin, onboarding_team, counsellor/student for their own file
CREATE POLICY "authorized_update_student_photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'student-photos'
  AND (
    get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'onboarding_team'::text])
    OR (
      get_current_user_role() = 'counsellor'
      AND (owner = auth.uid() OR owner IS NULL)
    )
    OR (
      get_current_user_role() = 'student'
      AND owner = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'student-photos'
  AND (
    get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'onboarding_team'::text])
    OR (
      get_current_user_role() = 'counsellor'
      AND (owner = auth.uid() OR owner IS NULL)
    )
    OR (
      get_current_user_role() = 'student'
      AND owner = auth.uid()
    )
  )
);

-- 7. Authorized Delete Policy (PERMISSIVE DELETE)
-- Allowed: super_admin and admin only.
-- Counsellors, students, trainers, accountants CANNOT delete.
CREATE POLICY "admin_delete_student_photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-photos'
  AND get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text])
);
