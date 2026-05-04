ALTER TABLE public.restaurant_schedule
ADD COLUMN IF NOT EXISTS service_period text NOT NULL DEFAULT 'lunch'
CHECK (service_period IN ('lunch', 'dinner'));