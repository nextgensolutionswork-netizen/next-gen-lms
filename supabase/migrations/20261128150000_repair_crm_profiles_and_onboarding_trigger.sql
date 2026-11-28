-- Repair CRM profile role/team mappings and ensure new Supabase Auth users receive a profile automatically.
BEGIN;

-- 1. Repair Radhika's role to counsellor_lead (if her profile exists)
UPDATE public.profiles
SET role = 'counsellor_lead',
    is_active = true,
    tenant_id = COALESCE(NULLIF(tenant_id, ''), 'default'),
    updated_at = NOW()
WHERE LOWER(email) = 'nextgen.radhika@gmail.com'
  AND role <> 'counsellor_lead';

-- 2. Backfill any auth.users missing a public.profiles row
INSERT INTO public.profiles (id, email, full_name, role, tenant_id, is_active, created_at, updated_at)
SELECT
  u.id,
  LOWER(u.email),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    SPLIT_PART(u.email, '@', 1)
  ),
  CASE
    WHEN (u.raw_app_meta_data->>'role') IN ('super_admin','admin','accountant','counsellor','counsellor_lead','trainer','placement_coordinator','support','onboarding_team','student')
      THEN u.raw_app_meta_data->>'role'
    WHEN (u.raw_user_meta_data->>'role') IN ('super_admin','admin','accountant','counsellor','counsellor_lead','trainer','placement_coordinator','support','onboarding_team','student')
      THEN u.raw_user_meta_data->>'role'
    ELSE 'student'
  END,
  COALESCE(NULLIF(u.raw_app_meta_data->>'tenant_id', ''), NULLIF(u.raw_user_meta_data->>'tenant_id', ''), 'default'),
  true,
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id OR LOWER(p.email) = LOWER(u.email))
ON CONFLICT (id) DO NOTHING;

-- 3. Ensure Radhika's CRM team and team members (Amulya & Sandhya) are mapped in crm_teams / crm_team_members
DO $$
DECLARE
  v_leader_id uuid;
  v_leader_tenant text;
  v_team_id uuid;
  v_member_id uuid;
  v_member_email text;
BEGIN
  SELECT id, COALESCE(NULLIF(tenant_id, ''), 'default')
  INTO v_leader_id, v_leader_tenant
  FROM public.profiles
  WHERE LOWER(email) = 'nextgen.radhika@gmail.com'
    AND role = 'counsellor_lead'
    AND is_active IS TRUE
  LIMIT 1;

  IF v_leader_id IS NOT NULL THEN
    SELECT id INTO v_team_id
    FROM public.crm_teams
    WHERE tenant_id = v_leader_tenant AND leader_id = v_leader_id
    LIMIT 1;

    IF v_team_id IS NULL THEN
      INSERT INTO public.crm_teams (tenant_id, name, leader_id)
      VALUES (v_leader_tenant, 'Radhika Sales Team', v_leader_id)
      RETURNING id INTO v_team_id;
    END IF;

    FOREACH v_member_email IN ARRAY ARRAY['amulya.sapficobhub@gmail.com', 'sandhya.erphub@gmail.com'] LOOP
      SELECT id INTO v_member_id
      FROM public.profiles
      WHERE LOWER(email) = v_member_email
        AND tenant_id = v_leader_tenant
        AND is_active IS TRUE
      LIMIT 1;

      IF v_member_id IS NOT NULL THEN
        INSERT INTO public.crm_team_members (team_id, tenant_id, member_id)
        VALUES (v_team_id, v_leader_tenant, v_member_id)
        ON CONFLICT (team_id, member_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END $$;

-- 4. Automatic profile provisioning trigger for newly created auth.users
CREATE OR REPLACE FUNCTION crm_private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_tenant text;
  v_full_name text;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := COALESCE(
    NULLIF(NEW.raw_app_meta_data->>'role', ''),
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'student'
  );
  IF v_role NOT IN (
    'super_admin','admin','accountant','counsellor','counsellor_lead',
    'trainer','placement_coordinator','support','onboarding_team','student'
  ) THEN
    v_role := 'student';
  END IF;

  v_tenant := COALESCE(
    NULLIF(NEW.raw_app_meta_data->>'tenant_id', ''),
    NULLIF(NEW.raw_user_meta_data->>'tenant_id', ''),
    'default'
  );

  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, role, tenant_id, is_active, created_at, updated_at)
  VALUES (NEW.id, LOWER(NEW.email), v_full_name, v_role, v_tenant, true, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION crm_private.handle_new_auth_user();

NOTIFY pgrst, 'reload schema';
COMMIT;
