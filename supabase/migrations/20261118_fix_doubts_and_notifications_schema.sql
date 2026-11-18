-- Migration: 20261118_fix_doubts_and_notifications_schema.sql
-- Description: Fix schema discrepancies for Role 7 Support & Faculty Doubts Desk
--   - Add assigned_to and resolution_notes to public.student_doubts
--   - Add category and action_url to public.notifications
--   - Relax notifications_type_check to accept case-insensitive types ('info', 'warning', 'success', 'urgent', 'error')
--   - Add synchronization triggers for notifications links and doubt assignment fields

-- 1. Student Doubts
ALTER TABLE public.student_doubts ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE public.student_doubts ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- 2. Notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (LOWER(type) = ANY (ARRAY['info', 'warning', 'success', 'urgent', 'error']));

-- 3. Triggers for bidirectional link and assignment compatibility
CREATE OR REPLACE FUNCTION public.sync_notification_links()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.action_url IS NOT NULL AND NEW.link IS NULL THEN
        NEW.link := NEW.action_url;
    ELSIF NEW.link IS NOT NULL AND NEW.action_url IS NULL THEN
        NEW.action_url := NEW.link;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_notification_links') THEN
        CREATE TRIGGER trg_sync_notification_links
        BEFORE INSERT OR UPDATE ON public.notifications
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_notification_links();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_doubt_assigned_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to_name IS NULL THEN
        NEW.assigned_to_name := NEW.assigned_to;
    ELSIF NEW.assigned_to_name IS NOT NULL AND NEW.assigned_to IS NULL THEN
        NEW.assigned_to := NEW.assigned_to_name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_doubt_assigned_fields') THEN
        CREATE TRIGGER trg_sync_doubt_assigned_fields
        BEFORE INSERT OR UPDATE ON public.student_doubts
        FOR EACH ROW
        EXECUTE FUNCTION public.sync_doubt_assigned_fields();
    END IF;
END $$;
