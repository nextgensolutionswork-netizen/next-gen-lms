-- Next-Gen ERP LMS: 007_gst_and_compliance.sql
-- GST and Tax Compliance Extensions for Admissions, Students, and Receipts

-- 1. Extend admissions table with GST state, state_code, and gstin
ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(20);

-- 2. Extend students table with GST state, state_code, and gstin
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(20);

-- 3. Extend receipts table with full GST tax breakdown, Place of Supply, and e-Invoice IRN columns
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS supply_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100),
  ADD COLUMN IF NOT EXISTS place_of_supply_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sac_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS igst_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_tax NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS is_reverse_charge BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS irn VARCHAR(64),
  ADD COLUMN IF NOT EXISTS ack_no VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ack_date TIMESTAMPTZ;

-- 4. Fast lookup indexes for compliance verification
CREATE INDEX IF NOT EXISTS idx_receipts_irn ON receipts(irn);
CREATE INDEX IF NOT EXISTS idx_students_gstin ON students(gstin);
CREATE INDEX IF NOT EXISTS idx_admissions_gstin ON admissions(gstin);

COMMENT ON COLUMN receipts.irn IS 'Cryptographic e-Invoice Invoice Reference Number (IRN) generated under GST compliance';
COMMENT ON COLUMN receipts.place_of_supply_code IS '2-digit GST state code of recipient per IGST Place of Supply rules';
