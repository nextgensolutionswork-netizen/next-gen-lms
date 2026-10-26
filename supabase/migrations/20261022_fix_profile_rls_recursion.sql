-- Fix RLS Infinite Recursion on Profiles and Workflow Tables

CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS profile_tenant_boundary ON public.profiles;

CREATE POLICY profile_tenant_boundary ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR get_current_user_role() = 'super_admin'
    OR tenant_id = get_current_user_tenant_id()
  );

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'admissions', 'student_fee_accounts', 'installments', 'payments', 'receipts', 'onboarding_cases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS workflow_tenant_boundary ON public.%I', t);
    EXECUTE format('CREATE POLICY workflow_tenant_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = get_current_user_tenant_id()) WITH CHECK (tenant_id = get_current_user_tenant_id())', t);
  END LOOP;
END $$;
