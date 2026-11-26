-- ==============================================================================
-- Migration: 20261126150000_reconcile_historical_lead_creators.sql
-- BUG-12: Critical CRM Lead Ownership and Role-Based Data Reconciliation
-- 1. Reconcile historical NULL created_by rows with legitimate counsellor_id
-- 2. Preserve immutable creator protection for all non-null creators
-- 3. Reload PostgREST schema cache
-- ==============================================================================

DO $$
BEGIN
  -- Temporarily disable the immutable creator trigger during data reconciliation
  ALTER TABLE public.leads DISABLE TRIGGER protect_lead_creator;

  -- Backfill created_by with legitimate counsellor_id for historical records where created_by IS NULL
  UPDATE public.leads
  SET created_by = counsellor_id, updated_at = now()
  WHERE created_by IS NULL AND counsellor_id IS NOT NULL;

  -- Re-enable the immutable creator trigger
  ALTER TABLE public.leads ENABLE TRIGGER protect_lead_creator;
END $$;

NOTIFY pgrst, 'reload schema';
