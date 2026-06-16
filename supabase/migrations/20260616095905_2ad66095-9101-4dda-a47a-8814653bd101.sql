
-- 1) Scope all RLS policies to authenticated role only (not public/anon)
-- Recreate each policy with TO authenticated

-- agent_settings
DROP POLICY IF EXISTS agent_member_all ON public.agent_settings;
DROP POLICY IF EXISTS agent_admin_all ON public.agent_settings;
CREATE POLICY agent_member_all ON public.agent_settings TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY agent_admin_all ON public.agent_settings TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- blocked_dates
DROP POLICY IF EXISTS blocked_member_all ON public.blocked_dates;
DROP POLICY IF EXISTS blocked_admin_all ON public.blocked_dates;
CREATE POLICY blocked_member_all ON public.blocked_dates TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY blocked_admin_all ON public.blocked_dates TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- external_calendar_settings
DROP POLICY IF EXISTS extcal_member_all ON public.external_calendar_settings;
DROP POLICY IF EXISTS extcal_admin_all ON public.external_calendar_settings;
CREATE POLICY extcal_member_all ON public.external_calendar_settings TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY extcal_admin_all ON public.external_calendar_settings TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- faqs
DROP POLICY IF EXISTS faqs_member_all ON public.faqs;
DROP POLICY IF EXISTS faqs_admin_all ON public.faqs;
CREATE POLICY faqs_member_all ON public.faqs TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY faqs_admin_all ON public.faqs TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- human_handoff_requests
DROP POLICY IF EXISTS handoff_member_all ON public.human_handoff_requests;
DROP POLICY IF EXISTS handoff_admin_all ON public.human_handoff_requests;
CREATE POLICY handoff_member_all ON public.human_handoff_requests TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY handoff_admin_all ON public.human_handoff_requests TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- notification_settings
DROP POLICY IF EXISTS notif_member_all ON public.notification_settings;
DROP POLICY IF EXISTS notif_admin_all ON public.notification_settings;
CREATE POLICY notif_member_all ON public.notification_settings TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY notif_admin_all ON public.notification_settings TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- profiles: tighten self_update to disallow role/restaurant_id/id changes at policy level too
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles TO authenticated
  USING (id = auth.uid());
CREATE POLICY profiles_self_update ON public.profiles TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND restaurant_id IS NOT DISTINCT FROM (SELECT p.restaurant_id FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY profiles_admin_all ON public.profiles TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- reservation_tables
DROP POLICY IF EXISTS reservation_tables_member_all ON public.reservation_tables;
DROP POLICY IF EXISTS reservation_tables_admin_all ON public.reservation_tables;
CREATE POLICY reservation_tables_member_all ON public.reservation_tables TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_tables.reservation_id AND r.restaurant_id = public.current_restaurant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_tables.reservation_id AND r.restaurant_id = public.current_restaurant_id()));
CREATE POLICY reservation_tables_admin_all ON public.reservation_tables TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- reservations
DROP POLICY IF EXISTS reservations_member_all ON public.reservations;
DROP POLICY IF EXISTS reservations_admin_all ON public.reservations;
CREATE POLICY reservations_member_all ON public.reservations TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY reservations_admin_all ON public.reservations TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- restaurant_schedule
DROP POLICY IF EXISTS schedule_member_all ON public.restaurant_schedule;
DROP POLICY IF EXISTS schedule_admin_all ON public.restaurant_schedule;
CREATE POLICY schedule_member_all ON public.restaurant_schedule TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY schedule_admin_all ON public.restaurant_schedule TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- restaurant_tables
DROP POLICY IF EXISTS tables_member_all ON public.restaurant_tables;
DROP POLICY IF EXISTS tables_admin_all ON public.restaurant_tables;
CREATE POLICY tables_member_all ON public.restaurant_tables TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY tables_admin_all ON public.restaurant_tables TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- restaurant_zones
DROP POLICY IF EXISTS zones_member_all ON public.restaurant_zones;
DROP POLICY IF EXISTS zones_admin_all ON public.restaurant_zones;
CREATE POLICY zones_member_all ON public.restaurant_zones TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY zones_admin_all ON public.restaurant_zones TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- restaurants
DROP POLICY IF EXISTS restaurants_member_read ON public.restaurants;
DROP POLICY IF EXISTS restaurants_member_update ON public.restaurants;
DROP POLICY IF EXISTS restaurants_admin_all ON public.restaurants;
CREATE POLICY restaurants_member_read ON public.restaurants FOR SELECT TO authenticated
  USING (id = public.current_restaurant_id());
CREATE POLICY restaurants_member_update ON public.restaurants FOR UPDATE TO authenticated
  USING (id = public.current_restaurant_id())
  WITH CHECK (id = public.current_restaurant_id());
CREATE POLICY restaurants_admin_all ON public.restaurants TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- table_combination_tables
DROP POLICY IF EXISTS tct_member_all ON public.table_combination_tables;
DROP POLICY IF EXISTS tct_admin_all ON public.table_combination_tables;
CREATE POLICY tct_member_all ON public.table_combination_tables TO authenticated
  USING (EXISTS (SELECT 1 FROM public.table_combinations tc WHERE tc.id = table_combination_tables.combination_id AND tc.restaurant_id = public.current_restaurant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.table_combinations tc WHERE tc.id = table_combination_tables.combination_id AND tc.restaurant_id = public.current_restaurant_id()));
CREATE POLICY tct_admin_all ON public.table_combination_tables TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- table_combinations
DROP POLICY IF EXISTS table_combinations_member_all ON public.table_combinations;
DROP POLICY IF EXISTS table_combinations_admin_all ON public.table_combinations;
CREATE POLICY table_combinations_member_all ON public.table_combinations TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY table_combinations_admin_all ON public.table_combinations TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 2) Lock down SECURITY DEFINER helper functions: revoke EXECUTE from PUBLIC/authenticated/anon.
-- Policies will still evaluate them because policy expressions are evaluated as the table owner
-- via the planner's row-security path, but to be safe we grant EXECUTE only where needed (RLS
-- uses these in member checks). Postgres requires EXECUTE for the calling role.
-- Therefore, instead of revoking, switch helper functions to SECURITY INVOKER where safe.
-- current_role, current_restaurant_id and is_platform_admin only read the caller's own profile row,
-- which the profiles_self_read policy allows. Switch them to INVOKER to satisfy the linter.

CREATE OR REPLACE FUNCTION public."current_role"()
 RETURNS user_role
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT public.current_role() = 'platform_admin';
$function$;
