
CREATE TABLE public.reservation_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, table_id)
);
CREATE INDEX reservation_tables_reservation_id_idx ON public.reservation_tables(reservation_id);
CREATE INDEX reservation_tables_table_id_idx ON public.reservation_tables(table_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_tables TO authenticated;
GRANT ALL ON public.reservation_tables TO service_role;

ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservation_tables_admin_all ON public.reservation_tables
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE POLICY reservation_tables_member_all ON public.reservation_tables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_tables.reservation_id
        AND r.restaurant_id = public.current_restaurant_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_tables.reservation_id
        AND r.restaurant_id = public.current_restaurant_id()
    )
  );

CREATE TABLE public.table_combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.restaurant_zones(id) ON DELETE SET NULL,
  name text NOT NULL,
  min_capacity integer,
  max_capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX table_combinations_restaurant_id_idx ON public.table_combinations(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_combinations TO authenticated;
GRANT ALL ON public.table_combinations TO service_role;

ALTER TABLE public.table_combinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY table_combinations_admin_all ON public.table_combinations
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE POLICY table_combinations_member_all ON public.table_combinations
  FOR ALL USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE TRIGGER table_combinations_set_updated_at
  BEFORE UPDATE ON public.table_combinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.table_combination_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combination_id uuid NOT NULL REFERENCES public.table_combinations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (combination_id, table_id)
);
CREATE INDEX table_combination_tables_combination_id_idx ON public.table_combination_tables(combination_id);
CREATE INDEX table_combination_tables_table_id_idx ON public.table_combination_tables(table_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_combination_tables TO authenticated;
GRANT ALL ON public.table_combination_tables TO service_role;

ALTER TABLE public.table_combination_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY tct_admin_all ON public.table_combination_tables
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE POLICY tct_member_all ON public.table_combination_tables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.table_combinations c
      WHERE c.id = table_combination_tables.combination_id
        AND c.restaurant_id = public.current_restaurant_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.table_combinations c
      WHERE c.id = table_combination_tables.combination_id
        AND c.restaurant_id = public.current_restaurant_id()
    )
  );

-- Clean orphaned table_id refs on reservations before backfill
UPDATE public.reservations r
SET table_id = NULL
WHERE r.table_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.restaurant_tables t WHERE t.id = r.table_id);

INSERT INTO public.reservation_tables (reservation_id, table_id)
SELECT r.id, r.table_id
FROM public.reservations r
WHERE r.table_id IS NOT NULL
ON CONFLICT (reservation_id, table_id) DO NOTHING;
