-- 1. Private schema for internal helper functions (not exposed via the Data API)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 2. Recreate has_role inside the private schema so signed-in users cannot call it via the API
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3. Recreate the policies that referenced the old public function
DROP POLICY "Profiles: update own or admin" ON public.profiles;
CREATE POLICY "Profiles: update own or admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "Profiles: view own or admin views all" ON public.profiles;
CREATE POLICY "Profiles: view own or admin views all" ON public.profiles
  FOR SELECT TO authenticated
  USING ((id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "Roles: view own or admin views all" ON public.user_roles;
CREATE POLICY "Roles: view own or admin views all" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "Tx: update own or admin" ON public.transactions;
CREATE POLICY "Tx: update own or admin" ON public.transactions
  FOR UPDATE TO authenticated
  USING ((cashier_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK ((cashier_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

DROP POLICY "Tx: view own or admin views all" ON public.transactions;
CREATE POLICY "Tx: view own or admin views all" ON public.transactions
  FOR SELECT TO authenticated
  USING ((cashier_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'));

-- 4. Drop the API-exposed function now that nothing references it
DROP FUNCTION public.has_role(uuid, public.app_role);

-- 5. Prevent non-admins from changing the profiles.active flag on their own row.
--    Service-role/server admin context (auth.uid() IS NULL) and admins are allowed.
CREATE OR REPLACE FUNCTION public.enforce_profile_active_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active
     AND auth.uid() IS NOT NULL
     AND NOT private.has_role(auth.uid(), 'admin') THEN
    NEW.active := OLD.active;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_active_admin_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_profile_active ON public.profiles;
CREATE TRIGGER trg_enforce_profile_active
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_active_admin_only();

-- 6. Scoped INSERT policy for profiles (users may create only their own row)
CREATE POLICY "Profiles: insert own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 7. Admin-only DELETE policy for transactions
CREATE POLICY "Tx: admin deletes" ON public.transactions
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));