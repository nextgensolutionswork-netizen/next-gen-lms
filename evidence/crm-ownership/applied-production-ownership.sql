-- Prepared locally only. No historical ownership inference or data backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS crm_private;
REVOKE ALL ON SCHEMA crm_private FROM PUBLIC;
GRANT USAGE ON SCHEMA crm_private TO authenticated;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
-- Set default AFTER adding column: historical rows must remain NULL.
ALTER TABLE public.leads ALTER COLUMN created_by SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS leads_creator_scope_idx ON public.leads(tenant_id, created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_followups_parent_idx ON public.lead_followups(lead_id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN
 ('super_admin','admin','accountant','counsellor','counsellor_lead','trainer','placement_coordinator','support','onboarding_team','student'));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_tenant_unique ON public.profiles(id, tenant_id);
CREATE TABLE public.crm_teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
 name text NOT NULL, leader_id uuid NOT NULL,
 UNIQUE(id, tenant_id), FOREIGN KEY(leader_id, tenant_id) REFERENCES public.profiles(id, tenant_id)
);
CREATE TABLE public.crm_team_members (
 team_id uuid NOT NULL, tenant_id text NOT NULL, member_id uuid NOT NULL,
 PRIMARY KEY(team_id, member_id),
 FOREIGN KEY(team_id, tenant_id) REFERENCES public.crm_teams(id, tenant_id),
 FOREIGN KEY(member_id, tenant_id) REFERENCES public.profiles(id, tenant_id)
);
CREATE INDEX crm_team_leader_idx ON public.crm_teams(tenant_id, leader_id);
CREATE INDEX crm_team_member_idx ON public.crm_team_members(tenant_id, member_id);
ALTER TABLE public.crm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_teams, public.crm_team_members TO authenticated;
GRANT ALL ON public.crm_teams, public.crm_team_members TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.crm_teams, public.crm_team_members FROM anon, authenticated;

CREATE FUNCTION crm_private.can_manage(t text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS TRUE
 AND p.tenant_id = t AND p.role IN ('super_admin','admin'));
$$;
CREATE FUNCTION crm_private.can_access(t text, creator uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS TRUE
 AND p.tenant_id = t AND (p.role IN ('super_admin','admin') OR
 (p.role IN ('counsellor','counsellor_lead') AND (creator = p.id OR
 (p.role = 'counsellor_lead' AND EXISTS(SELECT 1 FROM public.crm_teams teams
 JOIN public.crm_team_members members ON members.team_id = teams.id AND members.tenant_id = teams.tenant_id
 WHERE teams.tenant_id = t AND teams.leader_id = p.id AND members.member_id = creator))))));
$$;
REVOKE ALL ON FUNCTION crm_private.can_manage(text), crm_private.can_access(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_private.can_manage(text), crm_private.can_access(text,uuid) TO authenticated;
CREATE POLICY crm_teams_read ON public.crm_teams FOR SELECT TO authenticated
 USING (crm_private.can_manage(tenant_id) OR (leader_id = auth.uid() AND crm_private.can_access(tenant_id, auth.uid())));
CREATE POLICY crm_members_read ON public.crm_team_members FOR SELECT TO authenticated
 USING (crm_private.can_manage(tenant_id) OR EXISTS(SELECT 1 FROM public.crm_teams t WHERE t.id = team_id AND t.leader_id = auth.uid()));

CREATE FUNCTION crm_private.protect_lead_creator() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'New leads require a verified creator'; END IF;
   IF current_user IN ('authenticated','anon') AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Cannot impersonate lead creator';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = NEW.created_by AND p.tenant_id = NEW.tenant_id
     AND p.is_active IS TRUE AND p.role IN ('super_admin','admin','counsellor','counsellor_lead')) THEN
     RAISE EXCEPTION 'Invalid creator membership';
   END IF;
 ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Lead creator, tenant and creation time are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER protect_lead_creator BEFORE INSERT OR UPDATE ON public.leads
 FOR EACH ROW EXECUTE FUNCTION crm_private.protect_lead_creator();

-- Replace only known permissive legacy policies. Keep all restrictive tenant policies.
DROP POLICY IF EXISTS "CRM staff manage leads" ON public.leads;
DROP POLICY IF EXISTS "Super Admin, Admin, Counsellor manage leads" ON public.leads;
DROP POLICY IF EXISTS admin_all_leads ON public.leads;
DROP POLICY IF EXISTS counsellor_select_leads ON public.leads;
DROP POLICY IF EXISTS counsellor_insert_leads ON public.leads;
DROP POLICY IF EXISTS counsellor_update_assigned_leads ON public.leads;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_creator_select ON public.leads FOR SELECT TO authenticated
 USING(crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_creator_insert ON public.leads FOR INSERT TO authenticated
 WITH CHECK(created_by = auth.uid() AND crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_creator_update ON public.leads FOR UPDATE TO authenticated
 USING(crm_private.can_access(tenant_id, created_by)) WITH CHECK(crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_management_delete ON public.leads FOR DELETE TO authenticated
 USING(crm_private.can_manage(tenant_id));
-- Defense against an unrecognized permissive policy from another schema version.
CREATE POLICY leads_creator_boundary ON public.leads AS RESTRICTIVE FOR ALL TO authenticated
 USING(crm_private.can_access(tenant_id, created_by)) WITH CHECK(crm_private.can_access(tenant_id, created_by));
CREATE POLICY leads_delete_boundary ON public.leads AS RESTRICTIVE FOR DELETE TO authenticated USING(crm_private.can_manage(tenant_id));
CREATE POLICY leads_anon_boundary ON public.leads AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);

DROP POLICY IF EXISTS "CRM staff manage followups" ON public.lead_followups;
DROP POLICY IF EXISTS admin_all_followups ON public.lead_followups;
DROP POLICY IF EXISTS counsellor_select_followups ON public.lead_followups;
DROP POLICY IF EXISTS counsellor_insert_followups ON public.lead_followups;
DROP POLICY IF EXISTS counsellor_update_own_followups ON public.lead_followups;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY followups_parent_boundary ON public.lead_followups AS RESTRICTIVE FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.tenant_id = lead_followups.tenant_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.tenant_id = lead_followups.tenant_id));
CREATE POLICY followups_select ON public.lead_followups FOR SELECT TO authenticated USING(true);
CREATE POLICY followups_insert ON public.lead_followups FOR INSERT TO authenticated WITH CHECK(counsellor_id = auth.uid());
CREATE POLICY followups_update ON public.lead_followups FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY followups_delete ON public.lead_followups FOR DELETE TO authenticated USING(crm_private.can_manage(tenant_id));
CREATE POLICY followups_delete_boundary ON public.lead_followups AS RESTRICTIVE FOR DELETE TO authenticated USING(crm_private.can_manage(tenant_id));
CREATE POLICY followups_anon_boundary ON public.lead_followups AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY followups_author_boundary ON public.lead_followups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(counsellor_id = auth.uid());

CREATE FUNCTION crm_private.protect_authority() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role
   OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
   RAISE EXCEPTION 'Authority changes require a server administrator';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER crm_profile_authority BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION crm_private.protect_authority();
REVOKE ALL ON FUNCTION crm_private.protect_authority() FROM PUBLIC;

-- CRM telemetry cannot be forged against an inaccessible lead, even via direct REST.
CREATE POLICY crm_audit_boundary ON public.audit_logs AS RESTRICTIVE FOR ALL TO authenticated
 USING(upper(module) <> 'CRM' OR EXISTS(SELECT 1 FROM public.leads l WHERE l.id::text = record_id))
 WITH CHECK(upper(module) <> 'CRM' OR (user_id = auth.uid() AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id::text = record_id)));
CREATE POLICY crm_audit_read ON public.audit_logs FOR SELECT TO authenticated
 USING(upper(module) = 'CRM' AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id::text = record_id));
CREATE POLICY crm_audit_anon_boundary ON public.audit_logs AS RESTRICTIVE FOR ALL TO anon
 USING(upper(module) <> 'CRM') WITH CHECK(upper(module) <> 'CRM');

CREATE FUNCTION crm_private.check_admission_lead() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.lead_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.lead_id IS DISTINCT FROM OLD.lead_id)
   AND current_user IN ('authenticated','anon') AND NOT EXISTS
   (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.tenant_id = NEW.tenant_id) THEN
   RAISE EXCEPTION 'Lead conversion access denied';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER admission_lead_access BEFORE INSERT OR UPDATE ON public.admissions
 FOR EACH ROW EXECUTE FUNCTION crm_private.check_admission_lead();
REVOKE ALL ON FUNCTION crm_private.protect_lead_creator(), crm_private.check_admission_lead() FROM PUBLIC;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.leads) <> 8 OR
 (SELECT md5(coalesce(string_agg((to_jsonb(l) - 'created_by')::text,'' ORDER BY id),'')) FROM public.leads l) <> '25e7bba321ab438de5d5c5ee44338958'
 OR EXISTS(SELECT 1 FROM public.leads WHERE created_by IS NOT NULL) THEN
 RAISE EXCEPTION 'Historical lead preservation check failed';
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
