-- =====================================================================================
-- MIGRATION PROPOSAL: Structured CRM Lead Conversion & Archival Lifecycle
-- Migration ID: 20261126160000_proposal_structured_lead_conversion_lifecycle.sql
-- Status: PROPOSAL ONLY — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT SIGN-OFF
-- Purpose:
--   Eliminate reliance on free-text regular expressions in lead notes.
--   Establish formal, structured foreign keys and lifecycle audit timestamps on public.leads.
-- =====================================================================================

-- 1. Add structured conversion lifecycle columns to public.leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS conversion_status text DEFAULT 'unconverted'
    CHECK (conversion_status IN ('unconverted', 'active', 'historical', 'cancelled', 'integrity_error')),
  ADD COLUMN IF NOT EXISTS admission_id uuid REFERENCES public.admissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS historical_admission_reference text,
  ADD COLUMN IF NOT EXISTS converted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS converted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archival_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Create performance indexes for conversion lookups
CREATE INDEX IF NOT EXISTS idx_leads_conversion_status ON public.leads(conversion_status);
CREATE INDEX IF NOT EXISTS idx_leads_admission_id ON public.leads(admission_id);
CREATE INDEX IF NOT EXISTS idx_leads_historical_ref ON public.leads(historical_admission_reference);

-- 3. Controlled data backfill for Active Conversions (Live Admissions)
UPDATE public.leads l
SET 
  conversion_status = 'active',
  admission_id = a.id,
  converted_at = a.created_at,
  converted_by = l.counsellor_id
FROM public.admissions a
WHERE a.lead_id = l.id;

-- 4. Controlled data backfill for Historical Conversions (14 verified records from 25-Nov reset)
UPDATE public.leads
SET 
  conversion_status = 'historical',
  historical_admission_reference = substring(notes from 'Converted to Admission:\s*(ADM-[\w-]+)'),
  archived_at = '2026-11-25 11:45:00+00',
  archival_reason = 'Purged during 25-Nov-2026 pre-pilot operational database reset'
WHERE stage IN ('Converted', 'Enrolled')
  AND admission_id IS NULL
  AND notes ~* 'Converted to Admission:\s*ADM-2026-';

-- 5. Comments for documentation and maintenance
COMMENT ON COLUMN public.leads.conversion_status IS 'Lifecycle state: unconverted, active (linked live admission), historical (verified archival), cancelled, or integrity_error';
COMMENT ON COLUMN public.leads.admission_id IS 'Direct foreign key link to live admission record';
COMMENT ON COLUMN public.leads.historical_admission_reference IS 'Archived admission identifier retained for marketing and counselor attribution';
