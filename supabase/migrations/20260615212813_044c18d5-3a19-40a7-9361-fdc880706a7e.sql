
CREATE TYPE public.zone_element_type AS ENUM ('bar', 'door', 'kitchen', 'bathroom', 'reception', 'column', 'custom');
CREATE TYPE public.zone_element_shape AS ENUM ('rectangle', 'square', 'circle');

CREATE TABLE public.restaurant_zone_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES public.restaurant_zones(id) ON DELETE CASCADE,
  element_type public.zone_element_type NOT NULL DEFAULT 'custom',
  label TEXT NOT NULL DEFAULT '',
  visual_x NUMERIC NOT NULL DEFAULT 50,
  visual_y NUMERIC NOT NULL DEFAULT 50,
  visual_width NUMERIC NOT NULL DEFAULT 14,
  visual_height NUMERIC NOT NULL DEFAULT 10,
  shape public.zone_element_shape NOT NULL DEFAULT 'rectangle',
  rotation NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_zone_elements TO authenticated;
GRANT ALL ON public.restaurant_zone_elements TO service_role;

ALTER TABLE public.restaurant_zone_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY zone_elements_admin_all ON public.restaurant_zone_elements
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY zone_elements_member_all ON public.restaurant_zone_elements
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE TRIGGER set_zone_elements_updated_at
  BEFORE UPDATE ON public.restaurant_zone_elements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_zone_elements_zone ON public.restaurant_zone_elements(zone_id);
CREATE INDEX idx_zone_elements_restaurant ON public.restaurant_zone_elements(restaurant_id);
