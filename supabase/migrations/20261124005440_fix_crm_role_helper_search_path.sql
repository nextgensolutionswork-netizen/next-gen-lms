-- Preserve existing role lookup semantics while making nested RLS calls safe.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;
NOTIFY pgrst, 'reload schema';
