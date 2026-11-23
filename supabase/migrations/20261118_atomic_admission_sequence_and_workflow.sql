-- ==============================================================================
-- Migration: 20261118_atomic_admission_sequence_and_workflow.sql
-- Description:
-- 1. Database-backed atomic sequence allocator for admission numbers with
--    cross-tenant uniqueness guarantees, collision skipping, and advisory transaction locks
-- 2. Atomic CRM Lead stage synchronization inside commit_fee_workflow transaction
--    with strict cross-tenant isolation and foreign key validation
-- 3. Snapshot duplicate admission number check enforcing global uniqueness
-- 4. Dynamic baseline calculation across all applicable years, tenants, admissions, snapshots, and lead notes
-- 5. Strict service_role RPC privileges and SECURITY DEFINER search_path isolation
-- ==============================================================================

-- 1. Atomic Admission Sequences Table & Lead Tenant Boundary
CREATE TABLE IF NOT EXISTS public.admission_sequences (
  tenant_id text NOT NULL,
  year integer NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE public.admission_sequences ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.admission_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admission_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admission_sequences TO service_role, postgres;

-- Ensure leads table has tenant_id for cross-tenant isolation
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenant_id text DEFAULT 'default';
CREATE INDEX IF NOT EXISTS leads_tenant_idx ON public.leads(tenant_id);

-- 2. Dynamically calculate and seed existing sequences across all applicable years and tenants
DO $$
DECLARE
  r_year record;
  r_tenant record;
  v_max_seq integer := 0;
  v_snap_seq integer := 0;
  v_lead_seq integer := 0;
BEGIN
  -- Discover all active years across admissions, fee_workflow_state, leads notes, and current year
  FOR r_year IN (
    SELECT DISTINCT yr FROM (
      SELECT (SUBSTRING(admission_number FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.admissions
      WHERE admission_number ~ '^ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT (SUBSTRING(elem->>'admission_number' FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.fee_workflow_state fws,
           jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' ~ '^ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT (SUBSTRING(notes FROM 'ADM-([0-9]{4})-[0-9]+'))::integer AS yr
      FROM public.leads
      WHERE notes ~ 'ADM-[0-9]{4}-[0-9]+'
      UNION
      SELECT EXTRACT(YEAR FROM CURRENT_DATE)::integer AS yr
    ) y
    WHERE yr IS NOT NULL AND yr >= 2000
    ORDER BY yr
  ) LOOP

    -- Discover all active tenants
    FOR r_tenant IN (
      SELECT DISTINCT t.tenant_id FROM (
        SELECT fws.tenant_id FROM public.fee_workflow_state fws
        UNION
        SELECT 'default' AS tenant_id
      ) t
      WHERE t.tenant_id IS NOT NULL AND t.tenant_id <> ''
    ) LOOP
      -- Max sequence from admissions table for this tenant and year
      v_max_seq := 0;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admissions' AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format(
          'SELECT COALESCE(MAX(SUBSTRING(admission_number FROM ''ADM-[0-9]+-([0-9]+)'')::integer), 0)
           FROM public.admissions
           WHERE tenant_id = %L AND admission_number LIKE %L',
          r_tenant.tenant_id, 'ADM-' || r_year.yr || '-%'
        ) INTO v_max_seq;
      ELSE
        SELECT COALESCE(MAX(SUBSTRING(admission_number FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
        INTO v_max_seq
        FROM public.admissions
        WHERE admission_number LIKE 'ADM-' || r_year.yr || '-%';
      END IF;

      -- Max sequence from fee_workflow_state snapshot for this tenant and year
      SELECT COALESCE(MAX(SUBSTRING(elem->>'admission_number' FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
      INTO v_snap_seq
      FROM public.fee_workflow_state fws,
           jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE fws.tenant_id = r_tenant.tenant_id
        AND elem->>'admission_number' LIKE 'ADM-' || r_year.yr || '-%';

      -- For 'default' tenant, also include conversion references from leads notes
      IF r_tenant.tenant_id = 'default' THEN
        SELECT COALESCE(MAX(SUBSTRING(notes FROM 'ADM-[0-9]+-([0-9]+)')::integer), 0)
        INTO v_lead_seq
        FROM public.leads
        WHERE notes LIKE '%ADM-' || r_year.yr || '-%';

        v_max_seq := GREATEST(v_max_seq, v_snap_seq, v_lead_seq);
      ELSE
        v_max_seq := GREATEST(v_max_seq, v_snap_seq);
      END IF;

      INSERT INTO public.admission_sequences (tenant_id, year, last_sequence, updated_at)
      VALUES (r_tenant.tenant_id, r_year.yr, v_max_seq, now())
      ON CONFLICT (tenant_id, year) DO UPDATE
        SET last_sequence = GREATEST(public.admission_sequences.last_sequence, EXCLUDED.last_sequence),
            updated_at = now();
    END LOOP;
  END LOOP;
END $$;

-- 3. Atomic Admission Number Allocation Function with Collision Skipping
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
    p_tenant := 'default';
  END IF;
  IF p_year IS NULL OR p_year < 2000 THEN
    p_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  END IF;

  -- Acquire an advisory transaction lock scoped to the year.
  -- Serializes allocation requests across concurrent callers to prevent race conditions.
  PERFORM pg_advisory_xact_lock(hashtext('admission_sequence_' || p_year::text));

  -- Ensure sequence record exists
  INSERT INTO public.admission_sequences (tenant_id, year, last_sequence, updated_at)
  VALUES (p_tenant, p_year, 0, now())
  ON CONFLICT (tenant_id, year) DO NOTHING;

  -- Increment sequence and verify candidate number against global unique constraints.
  -- If candidate number is already taken anywhere (admissions table or fee_workflow_state snapshots),
  -- loop forward to the next available sequence.
  LOOP
    UPDATE public.admission_sequences
    SET last_sequence = last_sequence + 1,
        updated_at = now()
    WHERE tenant_id = p_tenant AND year = p_year
    RETURNING last_sequence INTO v_seq;

    v_adm_num := 'ADM-' || p_year::text || '-' || LPAD(v_seq::text, 4, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.admissions WHERE admission_number = v_adm_num
      UNION
      SELECT 1 FROM public.fee_workflow_state fws,
        jsonb_array_elements(COALESCE(fws.snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE elem->>'admission_number' = v_adm_num
    );
  END LOOP;

  RETURN v_adm_num;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_admission_number(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_admission_number(text, integer) TO service_role, postgres;

-- 4. Atomic Fee Workflow Commit with Differential CRM Lead Synchronization
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
  v_lead_tenant text;
  v_prev_snapshot jsonb;
BEGIN
  IF p_tenant IS NULL OR p_tenant = '' THEN
    p_tenant := 'default';
  END IF;

  -- 1. Check for duplicate admission numbers within the incoming snapshot
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

  -- 2. Check for cross-tenant duplicate admission numbers in other workflow states
  IF EXISTS (
    SELECT 1 
    FROM public.fee_workflow_state other_fws,
         jsonb_array_elements(COALESCE(other_fws.snapshot->'admissions', '[]'::jsonb)) AS other_elem,
         jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS incoming_elem
    WHERE other_fws.tenant_id <> p_tenant
      AND other_elem->>'admission_number' IS NOT NULL
      AND other_elem->>'admission_number' = incoming_elem->>'admission_number'
  ) THEN
    RAISE EXCEPTION 'Admission number already exists in another tenant fee workflow' USING ERRCODE = '23505';
  END IF;

  -- 3. Capture previous snapshot for differential change detection
  IF p_revision > 0 THEN
    SELECT snapshot INTO v_prev_snapshot
    FROM public.fee_workflow_state
    WHERE tenant_id = p_tenant AND revision = p_revision;

    IF v_prev_snapshot IS NULL THEN
      RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001';
    END IF;
  ELSE
    v_prev_snapshot := '{}'::jsonb;
  END IF;

  -- 4. Compare-and-swap update on fee_workflow_state
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

  -- 5. Maintain student_lms_access gates
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

  -- 6. Atomically synchronize ONLY new or changed CRM Lead conversions
  -- Differential comparison prevents missing historical test leads from blocking unrelated
  -- accountant approvals, receipt generations, or ledger modifications.
  FOR r_lead IN
    WITH incoming_admissions AS (
      SELECT 
        COALESCE(elem->>'id', elem->>'admission_number') AS adm_key,
        (elem->>'lead_id')::uuid AS lead_id,
        elem->>'admission_number' AS admission_number
      FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE (elem->>'lead_id') IS NOT NULL 
        AND (elem->>'lead_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ),
    previous_admissions AS (
      SELECT 
        COALESCE(elem->>'id', elem->>'admission_number') AS adm_key,
        elem->>'lead_id' AS lead_id
      FROM jsonb_array_elements(COALESCE(v_prev_snapshot->'admissions', '[]'::jsonb)) AS elem
      WHERE COALESCE(elem->>'id', elem->>'admission_number') IS NOT NULL
    )
    SELECT 
      inc.adm_key,
      inc.lead_id,
      inc.admission_number
    FROM incoming_admissions inc
    LEFT JOIN previous_admissions prev ON inc.adm_key = prev.adm_key
    WHERE prev.adm_key IS NULL -- Brand new admission submitted
       OR prev.lead_id IS DISTINCT FROM inc.lead_id::text -- Existing admission changed lead reference
  LOOP
    -- Verify lead existence for newly submitted conversions
    SELECT tenant_id INTO v_lead_tenant 
    FROM public.leads 
    WHERE id = r_lead.lead_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced lead % does not exist', r_lead.lead_id 
        USING ERRCODE = '23503';
    END IF;

    -- Enforce canonical tenant ownership (reject cross-tenant lead mutations)
    IF COALESCE(v_lead_tenant, 'default') <> COALESCE(p_tenant, 'default') THEN
      RAISE EXCEPTION 'Cross-tenant violation: Lead % belongs to tenant "%", but fee workflow is for tenant "%"', 
        r_lead.lead_id, COALESCE(v_lead_tenant, 'default'), COALESCE(p_tenant, 'default')
        USING ERRCODE = '42501';
    END IF;

    -- Update lead stage and notes atomically
    UPDATE public.leads
    SET 
      stage = 'Converted',
      notes = CASE 
        WHEN notes IS NULL OR notes = '' THEN 'Converted to Admission: ' || r_lead.admission_number
        WHEN notes NOT LIKE '%' || r_lead.admission_number || '%' THEN notes || E'\n' || 'Converted to Admission: ' || r_lead.admission_number
        ELSE notes
      END,
      updated_at = now()
    WHERE id = r_lead.lead_id
      AND COALESCE(tenant_id, 'default') = COALESCE(p_tenant, 'default');
  END LOOP;

  RETURN new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role, postgres;

-- 5. Unique Index on Admissions (tenant_id, admission_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_admissions_tenant_admission_number'
  ) THEN
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

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
