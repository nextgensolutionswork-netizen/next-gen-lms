-- Existing installations are one institute. Provision new memberships explicitly;
-- browser-supplied tenant IDs are never authoritative.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'admissions', 'student_fee_accounts', 'installments', 'payments', 'receipts', 'onboarding_cases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT ''default''', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY workflow_tenant_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))) WITH CHECK (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))', t);
  END LOOP;
END $$;

CREATE POLICY profile_tenant_boundary ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid())) = 'super_admin'
    OR id = (SELECT auth.uid())
    OR tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

CREATE TABLE public.fee_workflow_state (
  tenant_id text PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_workflow_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_workflow_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fee_workflow_state TO service_role;
COMMENT ON TABLE public.fee_workflow_state IS 'Authoritative transactional snapshot for the existing LMS dual-ledger adapter. API validates current profile and tenant before reads or writes. Never accepts browser snapshots.';

CREATE TABLE public.student_lms_access (
  user_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_lms_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.student_lms_access TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.student_lms_access TO service_role;
REVOKE ALL ON public.student_lms_access FROM anon;
CREATE POLICY own_lms_access ON public.student_lms_access FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

-- One database transaction for compare-and-swap plus the middleware access gate.
-- Invoker security, service-only execution: neither authenticated clients nor anonymous
-- callers can insert a forged approval or bypass the application decision checks.
CREATE FUNCTION public.commit_fee_workflow(p_tenant text, p_revision bigint, p_snapshot jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE new_revision bigint; student jsonb; case_record jsonb; enabled boolean;
BEGIN
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot) ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state SET revision = revision + 1, snapshot = p_snapshot, updated_at = now()
      WHERE tenant_id = p_tenant AND revision = p_revision RETURNING revision INTO new_revision;
  END IF;
  IF new_revision IS NULL THEN RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001'; END IF;

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
  RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;

-- Existing profiles policies can allow own-row edits. Do not allow those edits to
-- change the authoritative role, active flag or tenant membership.
CREATE FUNCTION public.protect_profile_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND
    (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'Profile authority fields require a server administrator';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_authority BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;
-- Restrictive policies also block broad pre-existing authenticated storage policies.
CREATE POLICY payment_proofs_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'payment-proofs') WITH CHECK (bucket_id <> 'payment-proofs');
