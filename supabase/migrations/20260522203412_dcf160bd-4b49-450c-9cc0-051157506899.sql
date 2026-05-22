-- Revoke ability for end users to update sensitive columns on profiles
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, email) ON public.profiles TO authenticated;

-- Ensure no INSERT path is open to clients (inserts only happen via the
-- handle_new_user SECURITY DEFINER trigger). No INSERT policy = denied by RLS.
REVOKE INSERT ON public.profiles FROM anon, authenticated;