-- Migration: Add missing description and job fields to public.job_openings
-- BUG-PL-001: Ensure description and modern job fields persist cleanly in PostgreSQL

ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS experience_required TEXT;
ALTER TABLE public.job_openings ADD COLUMN IF NOT EXISTS salary_range TEXT;

-- Make legacy columns nullable so inserts using only modern columns do not fail
ALTER TABLE public.job_openings ALTER COLUMN position DROP NOT NULL;
ALTER TABLE public.job_openings ALTER COLUMN job_description DROP NOT NULL;

-- Create sync trigger to maintain bidirectional compatibility between position/job_title and job_description/description
CREATE OR REPLACE FUNCTION sync_job_openings_compat_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Synchronize title
    IF NEW.job_title IS NOT NULL AND (NEW.position IS NULL OR NEW.position = '') THEN
        NEW.position := NEW.job_title;
    ELSIF NEW.position IS NOT NULL AND (NEW.job_title IS NULL OR NEW.job_title = '') THEN
        NEW.job_title := NEW.position;
    END IF;

    -- Synchronize description
    IF NEW.description IS NOT NULL AND (NEW.job_description IS NULL OR NEW.job_description = '') THEN
        NEW.job_description := NEW.description;
    ELSIF NEW.job_description IS NOT NULL AND (NEW.description IS NULL OR NEW.description = '') THEN
        NEW.description := NEW.job_description;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_job_openings_compat ON public.job_openings;
CREATE TRIGGER trg_sync_job_openings_compat
BEFORE INSERT OR UPDATE ON public.job_openings
FOR EACH ROW
EXECUTE FUNCTION sync_job_openings_compat_columns();

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
