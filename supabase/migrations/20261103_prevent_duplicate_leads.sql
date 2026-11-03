-- Migration: CRM Duplicate Lead Prevention & Authorized Repeat Inquiries (Tenant-Scoped)
-- Date: 2026-11-03
-- Description: Adds canonical_phone, idempotency_key, and repeat inquiry tracking columns.
--              Implements non-destructive, tenant-aware database safeguards against concurrent duplicate submissions
--              while supporting authorized, auditable repeat inquiries.
-- NOTE: Do not apply to production without staging verification and prior duplicate review.

-- 1. Add tenant, canonical_phone, and idempotency tracking columns safely
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS canonical_phone TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS is_repeat_inquiry BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS repeat_inquiry_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- 2. Backfill canonical_phone for existing historical records without double-prefixing
UPDATE leads 
SET canonical_phone = CASE 
  WHEN (country_code = '+91' OR country_code = '91' OR country_code IS NULL) THEN
    '91' || RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10)
  ELSE
    CASE 
      WHEN REGEXP_REPLACE(phone, '\D', '', 'g') LIKE REGEXP_REPLACE(country_code, '\D', '', 'g') || '%' THEN
        REGEXP_REPLACE(phone, '\D', '', 'g')
      ELSE
        REGEXP_REPLACE(country_code, '\D', '', 'g') || REGEXP_REPLACE(phone, '\D', '', 'g')
    END
END
WHERE canonical_phone IS NULL AND phone IS NOT NULL;

-- 3. Create index for fast phone deduplication queries scoped by tenant
CREATE INDEX IF NOT EXISTS idx_leads_tenant_canonical_phone 
  ON leads (COALESCE(tenant_id, 'default'), canonical_phone);

-- 4. Create conditional unique index to prevent duplicate active leads per tenant
-- Allows repeat inquiries (is_repeat_inquiry = TRUE) while guarding against duplicate active submissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_unique_active_tenant_canonical_phone
  ON leads (COALESCE(tenant_id, 'default'), canonical_phone)
  WHERE is_repeat_inquiry IS FALSE 
    AND canonical_phone IS NOT NULL 
    AND stage NOT IN ('Lost', 'Not Interested');

-- 5. Create unique index for idempotency replay and retries scoped by tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_idempotency_key 
  ON leads (COALESCE(tenant_id, 'default'), idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- 6. Create index for linked repeat inquiries
CREATE INDEX IF NOT EXISTS idx_leads_original_lead_id 
  ON leads (original_lead_id) 
  WHERE original_lead_id IS NOT NULL;

-- 7. Trigger function to compute and synchronize canonical_phone automatically
CREATE OR REPLACE FUNCTION trg_compute_lead_canonical_phone()
RETURNS TRIGGER AS $$
DECLARE
  clean_dial TEXT;
  clean_phone TEXT;
BEGIN
  IF NEW.phone IS NOT NULL THEN
    clean_dial := REGEXP_REPLACE(COALESCE(NEW.country_code, '+91'), '\D', '', 'g');
    clean_phone := REGEXP_REPLACE(NEW.phone, '\D', '', 'g');

    -- Strip leading zero for Indian trunk numbers (11 digits starting with 0)
    IF (clean_dial = '91' OR clean_dial = '') AND LENGTH(clean_phone) = 11 AND clean_phone LIKE '0%' THEN
      clean_phone := SUBSTRING(clean_phone FROM 2);
    END IF;

    -- Strip country prefix if already included in national digits
    IF LENGTH(clean_phone) > LENGTH(clean_dial) AND clean_phone LIKE clean_dial || '%' THEN
      clean_phone := SUBSTRING(clean_phone FROM LENGTH(clean_dial) + 1);
    END IF;

    IF clean_dial = '91' OR clean_dial = '' THEN
      NEW.canonical_phone := '91' || RIGHT(clean_phone, 10);
    ELSE
      NEW.canonical_phone := clean_dial || clean_phone;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_canonical_phone_sync ON leads;
CREATE TRIGGER trg_leads_canonical_phone_sync
BEFORE INSERT OR UPDATE OF phone, country_code ON leads
FOR EACH ROW
EXECUTE FUNCTION trg_compute_lead_canonical_phone();
