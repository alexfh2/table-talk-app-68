
CREATE TABLE public.restaurant_zones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY zones_admin_all ON public.restaurant_zones
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY zones_member_all ON public.restaurant_zones
  FOR ALL USING (restaurant_id = current_restaurant_id())
  WITH CHECK (restaurant_id = current_restaurant_id());

CREATE TRIGGER set_zones_updated_at BEFORE UPDATE ON public.restaurant_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_zones_restaurant ON public.restaurant_zones(restaurant_id);

CREATE TABLE public.restaurant_tables (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  label text NOT NULL,
  min_capacity integer NOT NULL DEFAULT 1,
  max_capacity integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  internal_notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY tables_admin_all ON public.restaurant_tables
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY tables_member_all ON public.restaurant_tables
  FOR ALL USING (restaurant_id = current_restaurant_id())
  WITH CHECK (restaurant_id = current_restaurant_id());

CREATE TRIGGER set_tables_updated_at BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tables_restaurant ON public.restaurant_tables(restaurant_id);
CREATE INDEX idx_tables_zone ON public.restaurant_tables(zone_id);

ALTER TABLE public.reservations ADD COLUMN table_id uuid;
