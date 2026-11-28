-- Preserve policy dependencies by moving the existing function OIDs.
-- Role lookups are RLS internals, not public REST RPC endpoints.
BEGIN;
ALTER POLICY "Super Admin manage settings" ON public.system_settings TO authenticated;
ALTER FUNCTION public.get_current_user_role() SET SCHEMA crm_private;
ALTER FUNCTION public.get_current_user_tenant_id() SET SCHEMA crm_private;
CREATE OR REPLACE FUNCTION crm_private.get_current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS TRUE;
$$;
REVOKE ALL ON FUNCTION crm_private.get_current_user_role(), crm_private.get_current_user_tenant_id() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA crm_private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION crm_private.get_current_user_role(), crm_private.get_current_user_tenant_id() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
