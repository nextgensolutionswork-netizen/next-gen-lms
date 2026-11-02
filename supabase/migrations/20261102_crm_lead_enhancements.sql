-- Migration: CRM Lead Creation Form Enhancements
-- Date: 2026-11-02
-- Description: Adds international country code and WhatsApp number support,
--              updates training_preference constraint (Online, Offline, Classroom, Hybrid),
--              and adds YouTube to lead_source check constraint.

-- 1. Add country_code, whatsapp_country_code, and whatsapp_number columns
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS whatsapp_country_code TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- 2. Populate default country code for existing historical records
UPDATE leads 
SET country_code = '+91' 
WHERE country_code IS NULL;

UPDATE leads 
SET whatsapp_country_code = '+91' 
WHERE whatsapp_country_code IS NULL;

-- 3. Update training_preference check constraint
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%training_preference%'
  ) LOOP
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE leads 
  ADD CONSTRAINT leads_training_preference_check 
  CHECK (training_preference IN ('Online', 'Offline', 'Classroom', 'Hybrid'));

-- 4. Update lead_source check constraint to include YouTube
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%lead_source%'
  ) LOOP
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE leads 
  ADD CONSTRAINT leads_lead_source_check 
  CHECK (lead_source IN ('Website', 'Google Ads', 'Meta Ads', 'YouTube', 'Referral', 'Walk-in', 'Other'));
