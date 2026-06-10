-- Restore EXECUTE on helpers used inside RLS policies. Revoking them broke profile reads.
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_restaurant_id() TO authenticated;