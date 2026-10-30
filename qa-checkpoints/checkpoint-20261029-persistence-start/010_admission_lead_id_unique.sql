-- Migration 010: Add lead_id to admissions with unique constraint to prevent duplicate conversion
-- Verification Status: UNVERIFIED (Pending execution in verified isolated staging database)
-- Safety: Staging environment only. Never execute against production (tgohtdzwehhjfahtgovq).
-- Data Integrity: Preserves all existing data. Does not delete existing duplicate rows to force migration success.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'admissions' AND column_name = 'lead_id'
    ) THEN
        ALTER TABLE admissions ADD COLUMN lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Diagnostic duplicate check: ensure existing data is not violated before creating unique index
DO $$
DECLARE
    dup_count integer;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT lead_id
        FROM admissions
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id
        HAVING COUNT(*) > 1
    ) dups;

    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Cannot create unique index uq_admissions_lead_id: % duplicate lead_id values exist in admissions. Manual resolution required without data deletion.', dup_count;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admissions_lead_id
ON admissions(lead_id)
WHERE lead_id IS NOT NULL;
