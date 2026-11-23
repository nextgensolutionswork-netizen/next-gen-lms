-- Migration: TeleCRM Duplicate Prevention, Idempotency & Admissions Counsellor Name Field
-- Date: 2026-11-23

BEGIN;

-- 1. Admissions Table Enhancements: Counsellor ID, Counsellor Name & Training Category
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS counsellor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS counsellor_name text;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS training_category text DEFAULT 'Normal Training' CHECK (training_category IN ('Normal Training', 'Personal Training'));

CREATE INDEX IF NOT EXISTS idx_admissions_counsellor_id ON public.admissions(tenant_id, counsellor_id);
CREATE INDEX IF NOT EXISTS idx_admissions_training_category ON public.admissions(tenant_id, training_category);

-- 2. Leads Table Enhancements: Canonical Phone, External Lead ID & Webhook Idempotency Key
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS canonical_phone text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS external_lead_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE INDEX IF NOT EXISTS idx_leads_canonical_phone ON public.leads(tenant_id, canonical_phone);
CREATE INDEX IF NOT EXISTS idx_leads_idempotency_key ON public.leads(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_leads_external_lead_id ON public.leads(tenant_id, external_lead_id);

-- 3. Function to automatically compute canonical phone digits on leads insert or update
CREATE OR REPLACE FUNCTION crm_private.sync_lead_canonical_phone()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.canonical_phone := regexp_replace(NEW.phone, '\D', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_canonical_phone ON public.leads;
CREATE TRIGGER trg_sync_lead_canonical_phone
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION crm_private.sync_lead_canonical_phone();

COMMIT;
