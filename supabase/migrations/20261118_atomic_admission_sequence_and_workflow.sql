-- ==============================================================================
-- Migration: 20261118_atomic_admission_sequence_and_workflow.sql
-- Description:
-- 1. Database-backed atomic sequence allocator for admission numbers (preventing concurrency race conditions)
-- 2. Atomic CRM Lead stage synchronization inside commit_fee_workflow transaction
-- 3. Snapshot duplicate admission number check enforcing uniqueness
-- 4. Unique index on admissions (tenant_id, admission_number)
-- ==============================================================================

-- 1. Atomic Admission Sequences Table
CREATE TABLE IF NOT EXISTS public.admission_sequences (
  tenant_id text NOT NULL,
  year integer NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE public.admission_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admission_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admission_sequences TO service_role;

-- 2. Seed existing sequences for default-tenant / 2026
DO $$
DECLARE
  v_tenant text := 'default-tenant';
  v_year integer := 2026;
  v_max_seq integer := 0;
  v_snap_seq integer := 0;
  v_lead_seq integer := 0;
BEGIN
  -- Max from admissions table
  SELECT COALESCE(MAX(SUBSTRING(admission_number FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
  INTO v_max_seq
  FROM public.admissions
  WHERE admission_number LIKE 'ADM-' || v_year || '-%';

  -- Max from fee_workflow_state JSON snapshot
  SELECT COALESCE(MAX(SUBSTRING(elem->>'admission_number' FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
  INTO v_snap_seq
  FROM public.fee_workflow_state fws,
       jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
  WHERE fws.tenant_id = v_tenant
    AND elem->>'admission_number' LIKE 'ADM-' || v_year || '-%';

  -- Max from leads notes (historical conversion references)
  SELECT COALESCE(MAX(SUBSTRING(notes FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
  INTO v_lead_seq
  FROM public.leads
  WHERE notes LIKE '%ADM-' || v_year || '-%';

  v_max_seq := GREATEST(v_max_seq, v_snap_seq, v_lead_seq);

  INSERT INTO public.admission_sequences (tenant_id, year, last_sequence, updated_at)
  VALUES (v_tenant, v_year, v_max_seq, now())
  ON CONFLICT (tenant_id, year) DO UPDATE
    SET last_sequence = GREATEST(public.admission_sequences.last_sequence, EXCLUDED.last_sequence),
        updated_at = now();
END $$;

-- 3. Atomic Admission Number Allocation Function
CREATE OR REPLACE FUNCTION public.allocate_admission_number(p_tenant text, p_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq integer;
  v_adm_num text;
BEGIN
  IF p_tenant IS NULL OR p_tenant = '' THEN
    p_tenant := 'default-tenant';
  END IF;
  IF p_year IS NULL OR p_year < 2000 THEN
    p_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  END IF;

  -- Ensure row exists
  INSERT INTO public.admission_sequences (tenant_id, year, last_sequence, updated_at)
  VALUES (p_tenant, p_year, 0, now())
  ON CONFLICT (tenant_id, year) DO NOTHING;

  -- Lock row exclusively and atomically increment
  UPDATE public.admission_sequences
  SET last_sequence = last_sequence + 1,
      updated_at = now()
  WHERE tenant_id = p_tenant AND year = p_year
  RETURNING last_sequence INTO v_seq;

  v_adm_num := 'ADM-' || p_year::text || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_adm_num;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_admission_number(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_admission_number(text, integer) TO service_role;

-- 4. Atomic fee workflow commit including CRM lead sync and uniqueness checks
CREATE OR REPLACE FUNCTION public.commit_fee_workflow(p_tenant text, p_revision bigint, p_snapshot jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_revision bigint;
  student jsonb;
  case_record jsonb;
  enabled boolean;
  r_lead record;
BEGIN
  -- Check for duplicate admission numbers within the incoming snapshot
  IF EXISTS (
    SELECT 1 
    FROM (
      SELECT elem->>'admission_number' AS adm_num, count(*) 
      FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' IS NOT NULL
      GROUP BY elem->>'admission_number'
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Snapshot contains duplicate admission numbers' USING ERRCODE = '23505';
  END IF;

  -- Compare-and-swap update on fee_workflow_state
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot) ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state 
    SET revision = revision + 1, 
        snapshot = p_snapshot, 
        updated_at = now()
    WHERE tenant_id = p_tenant AND revision = p_revision 
    RETURNING revision INTO new_revision;
  END IF;

  IF new_revision IS NULL THEN 
    RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001'; 
  END IF;

  -- Maintain student_lms_access gates
  FOR student IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    IF student->>'onboarding_required' = 'true' AND student->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = student->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false);
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES (student->>'user_id', p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;

  -- Atomically synchronize converted CRM Leads in the same database transaction
  FOR r_lead IN
    SELECT 
      (elem->>'lead_id')::uuid AS lead_id,
      elem->>'admission_number' AS admission_number
    FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS elem
    WHERE (elem->>'lead_id') IS NOT NULL 
      AND (elem->>'lead_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  LOOP
    UPDATE public.leads
    SET 
      stage = 'Converted',
      notes = CASE 
        WHEN notes IS NULL OR notes = '' THEN 'Converted to Admission: ' || r_lead.admission_number
        WHEN notes NOT LIKE '%' || r_lead.admission_number || '%' THEN notes || E'\n' || 'Converted to Admission: ' || r_lead.admission_number
        ELSE notes
      END,
      updated_at = now()
    WHERE id = r_lead.lead_id;
  END LOOP;

  RETURN new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;

-- 5. Unique Index on Admissions (tenant_id, admission_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_admissions_tenant_admission_number'
  ) THEN
    -- Check if tenant_id column exists on admissions
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'admissions' AND column_name = 'tenant_id'
    ) THEN
      CREATE UNIQUE INDEX idx_admissions_tenant_admission_number ON public.admissions(tenant_id, admission_number);
    ELSE
      CREATE UNIQUE INDEX idx_admissions_tenant_admission_number ON public.admissions(admission_number);
    END IF;
  END IF;
END $$;
