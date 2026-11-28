-- Add institute_id and institute_name columns across CRM, Admission, Student, Onboarding, Receipt, and Placement tables.
-- Existing rows remain NULL so unassigned historical leads are never auto-assigned.

ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS institute_id TEXT,
  ADD COLUMN IF NOT EXISTS institute_name TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_institute_id ON public.leads (institute_id);

ALTER TABLE IF EXISTS public.admissions
  ADD COLUMN IF NOT EXISTS institute_id TEXT,
  ADD COLUMN IF NOT EXISTS institute_name TEXT;

ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS institute_id TEXT,
  ADD COLUMN IF NOT EXISTS institute_name TEXT;

ALTER TABLE IF EXISTS public.onboarding_cases
  ADD COLUMN IF NOT EXISTS institute_id TEXT,
  ADD COLUMN IF NOT EXISTS institute_name TEXT;

ALTER TABLE IF EXISTS public.receipts
  ADD COLUMN IF NOT EXISTS institute_id TEXT,
  ADD COLUMN IF NOT EXISTS institute_name TEXT;

ALTER TABLE IF EXISTS public.placement_enrollments
  ADD COLUMN IF NOT EXISTS institute_id TEXT,
  ADD COLUMN IF NOT EXISTS institute_name TEXT;
