ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS visual_x numeric,
  ADD COLUMN IF NOT EXISTS visual_y numeric,
  ADD COLUMN IF NOT EXISTS visual_width numeric,
  ADD COLUMN IF NOT EXISTS visual_height numeric,
  ADD COLUMN IF NOT EXISTS visual_shape text NOT NULL DEFAULT 'round',
  ADD COLUMN IF NOT EXISTS visual_rotation numeric NOT NULL DEFAULT 0;

ALTER TABLE public.restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_visual_shape_check;
ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_visual_shape_check
  CHECK (visual_shape IN ('round','square','rectangle'));