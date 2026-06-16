
-- Revert helpers to SECURITY DEFINER (required to avoid RLS recursion on profiles_admin_all),
-- but revoke EXECUTE from anon/authenticated/public so signed-in users cannot invoke them directly.
-- RLS policy expressions are evaluated by the database engine, which can still call them.

CREATE OR REPLACE FUNCTION public."current_role"()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.current_role() = 'platform_admin';
$function$;

-- Note: do NOT revoke EXECUTE from authenticated — RLS USING clauses are evaluated
-- as the authenticated role, so they need EXECUTE to call these helpers.
-- We keep EXECUTE for authenticated; the SECURITY DEFINER bodies are scoped to auth.uid()
-- so users can only obtain their own role/restaurant_id, which they could read directly anyway.
GRANT EXECUTE ON FUNCTION public."current_role"() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_restaurant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."current_role"() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_restaurant_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon, public;
