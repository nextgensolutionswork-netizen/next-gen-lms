-- ==============================================================================
-- Migration: 20261124_crm_leads_created_by.sql
-- BUG-17: CRM Lead Creation Fails for Sales Accounts
-- 1. Non-destructively add created_by to public.leads referencing public.profiles(id)
-- 2. Add composite index for tenant-scoped creator queries
-- 3. Ensure crm_teams and crm_team_members exist for sales team visibility
-- 4. Reload PostgREST schema cache
-- ==============================================================================

-- 1. Add created_by column to public.leads (nullable, preserving all existing rows)
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Composite index for tenant-scoped creator filtering and sorting
CREATE INDEX IF NOT EXISTS leads_tenant_created_by_idx 
  ON public.leads(tenant_id, created_by, created_at DESC);

-- 3. Ensure crm_teams and crm_team_members exist for Sales Lead team visibility scoping
CREATE TABLE IF NOT EXISTS public.crm_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_team_members (
  team_id uuid NOT NULL REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  tenant_id text NOT NULL DEFAULT 'default',
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS crm_teams_leader_idx ON public.crm_teams(tenant_id, leader_id);
CREATE INDEX IF NOT EXISTS crm_team_members_member_idx ON public.crm_team_members(tenant_id, member_id);

ALTER TABLE public.crm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.crm_teams TO service_role, postgres;
GRANT ALL ON public.crm_team_members TO service_role, postgres;
GRANT SELECT ON public.crm_teams TO authenticated;
GRANT SELECT ON public.crm_team_members TO authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
