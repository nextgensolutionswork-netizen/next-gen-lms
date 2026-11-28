-- Restore the profile relation required by password login.
-- Does not seed demo users or business records.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'super_admin', 'admin', 'accountant', 'counsellor', 'counsellor_lead',
    'trainer', 'placement_coordinator', 'support', 'onboarding_team', 'student'
  )),
  phone text,
  avatar_url text,
  is_active boolean DEFAULT true,
  branch_id uuid,
  assigned_course_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE POLICY profiles_read_own_login ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
NOTIFY pgrst, 'reload schema';
