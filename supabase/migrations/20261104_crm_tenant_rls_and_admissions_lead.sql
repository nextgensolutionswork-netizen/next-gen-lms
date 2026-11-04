-- Migration: CRM Tenant RLS & Admissions Lead Linkage
-- Date: 2026-11-04
-- Description: Adds admissions.lead_id and lead_followups.tenant_id, then enforces
--              RESTRICTIVE tenant boundary and PERMISSIVE role/counsellor ownership policies on leads and lead_followups.

BEGIN;

-- 1. Add lead_id relationship to admissions if not exists
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admissions_lead_id ON public.admissions(lead_id);

-- 2. Add tenant_id to lead_followups if not exists
ALTER TABLE public.lead_followups ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_lead_followups_tenant_id ON public.lead_followups(tenant_id);

-- 3. Enable RLS on leads and lead_followups
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;

-- 4. Drop legacy unconstrained policies
DROP POLICY IF EXISTS "CRM staff manage leads" ON public.leads;
DROP POLICY IF EXISTS "Super Admin, Admin, Counsellor manage leads" ON public.leads;
DROP POLICY IF EXISTS "CRM staff manage followups" ON public.lead_followups;
DROP POLICY IF EXISTS "leads_tenant_boundary" ON public.leads;
DROP POLICY IF EXISTS "admin_all_leads" ON public.leads;
DROP POLICY IF EXISTS "counsellor_select_leads" ON public.leads;
DROP POLICY IF EXISTS "counsellor_insert_leads" ON public.leads;
DROP POLICY IF EXISTS "counsellor_update_assigned_leads" ON public.leads;
DROP POLICY IF EXISTS "lead_followups_tenant_boundary" ON public.lead_followups;
DROP POLICY IF EXISTS "admin_all_followups" ON public.lead_followups;
DROP POLICY IF EXISTS "counsellor_select_followups" ON public.lead_followups;
DROP POLICY IF EXISTS "counsellor_insert_followups" ON public.lead_followups;
DROP POLICY IF EXISTS "counsellor_update_own_followups" ON public.lead_followups;

-- 5. Leads Tenant Boundary (Mandatory RESTRICTIVE Filter)
CREATE POLICY "leads_tenant_boundary" ON public.leads
  AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    COALESCE(tenant_id, 'default') = get_current_user_tenant_id()
    OR get_current_user_role() = 'super_admin'
  )
  WITH CHECK (
    COALESCE(tenant_id, 'default') = get_current_user_tenant_id()
    OR get_current_user_role() = 'super_admin'
  );

-- 6. Leads Role & Ownership Policies (PERMISSIVE)
CREATE POLICY "admin_all_leads" ON public.leads
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]));

CREATE POLICY "counsellor_select_leads" ON public.leads
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND (counsellor_id = auth.uid() OR counsellor_id IS NULL)
  );

CREATE POLICY "counsellor_insert_leads" ON public.leads
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND (counsellor_id IS NULL OR counsellor_id = auth.uid())
  );

CREATE POLICY "counsellor_update_assigned_leads" ON public.leads
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  )
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  );

-- 7. Lead Followups Tenant Boundary (RESTRICTIVE)
CREATE POLICY "lead_followups_tenant_boundary" ON public.lead_followups
  AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    COALESCE(tenant_id, 'default') = get_current_user_tenant_id()
    OR get_current_user_role() = 'super_admin'
  )
  WITH CHECK (
    COALESCE(tenant_id, 'default') = get_current_user_tenant_id()
    OR get_current_user_role() = 'super_admin'
  );

-- 8. Lead Followups Role Policies (PERMISSIVE)
CREATE POLICY "admin_all_followups" ON public.lead_followups
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]));

CREATE POLICY "counsellor_select_followups" ON public.lead_followups
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND (
      counsellor_id = auth.uid()
      OR lead_id IN (SELECT id FROM public.leads WHERE counsellor_id = auth.uid() OR counsellor_id IS NULL)
    )
  );

CREATE POLICY "counsellor_insert_followups" ON public.lead_followups
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  );

CREATE POLICY "counsellor_update_own_followups" ON public.lead_followups
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  )
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  );

COMMIT;
