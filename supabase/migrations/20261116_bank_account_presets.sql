-- Migration: 20261116_bank_account_presets.sql
-- Description:
--   1. Creates bank_account_presets table for institute receiving account presets.
--   2. Archives obsolete HDFC primary presets and inserts the 20 reference accounts.
--   3. Adds authorized_bank_accounts column to system_settings.
--   4. Configures RLS policies to restrict configuration and protect financial credentials.

-- 1. Create bank_account_presets table
CREATE TABLE IF NOT EXISTS bank_account_presets (
    id TEXT PRIMARY KEY,
    account_holder_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    ifsc_code TEXT, -- Preserved for schema compatibility, but omitted from active UI
    branch TEXT DEFAULT 'Main Branch',
    account_type TEXT DEFAULT 'Current',
    upi_id TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'archived')),
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    verified_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_presets_status ON bank_account_presets(is_active, is_verified, is_archived);

-- 2. Alter system_settings table to support authorized_bank_accounts jsonb
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS authorized_bank_accounts JSONB DEFAULT '[]'::jsonb;

-- 3. Archive any obsolete historical presets
UPDATE bank_account_presets
SET is_archived = true,
    is_active = false,
    verification_status = 'archived',
    archived_at = NOW(),
    updated_at = NOW()
WHERE account_number LIKE '%50200088991122%'
   OR account_holder_name ILIKE '%NEXT GEN ERP SOLUTIONS PRIVATE LIMITED%'
   OR upi_id = 'nextgenerp@hdfcbank';

-- 4. Idempotently insert the 20 reference replacement accounts
INSERT INTO bank_account_presets (
    id, account_holder_name, bank_name, account_number, upi_id, is_primary, is_active, is_verified, verification_status
) VALUES
('bank-acc-01', 'Katari Charitha', 'HDFC Bank', '50100 76776 1140', NULL, true, true, true, 'verified'),
('bank-acc-02', 'Palukuri Bindu', 'HDFC Bank', '50100 76776 1200', NULL, false, true, true, 'verified'),
('bank-acc-03', 'Katari Padmaja', 'HDFC Bank', '50100 76776 1090', NULL, false, true, true, 'verified'),
('bank-acc-04', 'Juhitech Solutions', 'HDFC Bank', '50200 09524 9939', NULL, false, true, true, 'verified'),
('bank-acc-05', 'My Erp Hub', 'HDFC Bank', '50200 11060 5431', '9550499661-2@ybl', false, true, true, 'verified'),
('bank-acc-06', 'Nextgen Erp Solutions', 'HDFC Bank', '50200 11981 7562', NULL, false, true, true, 'verified'),
('bank-acc-07', 'Shobharani Venu Naidu', 'HDFC Bank', '50100 8004 02039', NULL, false, true, true, 'verified'),
('bank-acc-08', 'C Ekambara Naidu', 'HDFC Bank', '50100 8004 02078', NULL, false, true, true, 'verified'),
('bank-acc-09', 'Hemadri Venu Naidu', 'HDFC Bank', '50100 7677 59834', NULL, false, true, true, 'verified'),
('bank-acc-10', 'C Kiran Kumari', 'HDFC Bank', '50100 8004 02052', NULL, false, true, true, 'verified'),
('bank-acc-11', 'Lalita Venu Naidu', 'HDFC Bank', '50100 8004 01891', NULL, false, true, true, 'verified'),
('bank-acc-12', 'E Anasuya', 'HDFC Bank', '50100 8984 89271', NULL, false, true, true, 'verified'),
('bank-acc-13', 'T Kusuma', 'Canara - Thenebanda', '110270 213 528', NULL, false, true, true, 'verified'),
('bank-acc-14', 'T Usha', 'Canara - Thenebanda', '110270 189 756', NULL, false, true, true, 'verified'),
('bank-acc-15', 'K Swathi', 'Canara - Thenebanda', '110270 195 820', NULL, false, true, true, 'verified'),
('bank-acc-16', 'B Jyothi', 'Canara - Thenebanda', '110270 183 210', NULL, false, true, true, 'verified'),
('bank-acc-17', 'K Munemma', 'Canara - Thenebanda', '110270 203 847', NULL, false, true, true, 'verified'),
('bank-acc-18', 'G Komalika', 'Kotak Mahindra', '80530 28484', NULL, false, true, true, 'verified'),
('bank-acc-19', 'Anthagiri Sowmya', 'Kotak Mahindra', '80515 02269', NULL, false, true, true, 'verified'),
('bank-acc-20', 'Niranjan Axis Bank', 'Axis Bank', '916010064080256', 'niranjanemparala@ybl', false, true, true, 'verified')
ON CONFLICT (id) DO UPDATE SET
    account_holder_name = EXCLUDED.account_holder_name,
    bank_name = EXCLUDED.bank_name,
    account_number = EXCLUDED.account_number,
    upi_id = EXCLUDED.upi_id,
    updated_at = NOW();

-- 5. Enable Row-Level Security
ALTER TABLE bank_account_presets ENABLE ROW LEVEL SECURITY;

-- 5.1 Authenticated users can view verified active presets
CREATE POLICY "Authenticated users view active verified bank presets"
ON bank_account_presets FOR SELECT
TO authenticated
USING (
    is_active = true 
    AND is_verified = true 
    AND is_archived = false
);

-- 5.2 Administrators & Super Admins can manage all bank presets
CREATE POLICY "Admins manage bank presets"
ON bank_account_presets FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'super_admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'super_admin')
    )
);
