-- ==============================================================================
-- Migration 011: Synchronize Lead Conversion and Enforce Duplicate Protection in commit_fee_workflow
-- STATUS: UNVERIFIED / PENDING APPLICATION (Live staging database offline)
-- SAFETY: Idempotent function definition; never modifies production database.
-- ==============================================================================

-- Replaces public.commit_fee_workflow to atomically:
-- 1. Validate that p_snapshot->'admissions' contains no duplicate lead conversions (raises 23505).
-- 2. Execute compare-and-swap on fee_workflow_state.revision (raises 40001 on conflict).
-- 3. Synchronize student_lms_access for newly admitted students.
-- 4. Atomically synchronize public.leads (stage = 'Converted') within the same PostgreSQL transaction.

CREATE OR REPLACE FUNCTION public.commit_fee_workflow(p_tenant text, p_revision bigint, p_snapshot jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  new_revision bigint;
  student jsonb;
  case_record jsonb;
  admission_record jsonb;
  lead_id_val text;
  enabled boolean;
BEGIN
  -- 1. Enforce uniqueness of lead conversions within admissions snapshot
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) a
    WHERE (a->>'lead_id' IS NOT NULL AND a->>'lead_id' <> '')
    GROUP BY a->>'lead_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate conversion detected: Snapshot contains multiple admissions for the same lead.' USING ERRCODE = '23505';
  END IF;

  -- 2. Optimistic concurrency check and revision increment (CAS)
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot) ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state SET revision = revision + 1, snapshot = p_snapshot, updated_at = now()
      WHERE tenant_id = p_tenant AND revision = p_revision RETURNING revision INTO new_revision;
  END IF;

  IF new_revision IS NULL THEN
    RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001';
  END IF;

  -- 3. Synchronize student LMS access
  FOR student IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    IF student->>'onboarding_required' = 'true' AND student->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = student->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false
        );
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES (student->>'user_id', p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;

  -- 4. Atomically synchronize converted leads in relational public.leads
  FOR admission_record IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) LOOP
    lead_id_val := admission_record->>'lead_id';
    IF lead_id_val IS NOT NULL AND lead_id_val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      UPDATE public.leads
      SET stage = 'Converted', updated_at = now()
      WHERE id = lead_id_val::uuid AND stage <> 'Converted';
    END IF;
  END LOOP;

  RETURN new_revision;
END $$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;
