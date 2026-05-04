-- Add booking mode and shift fields to restaurant_schedule
ALTER TABLE public.restaurant_schedule
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'slots',
  ADD COLUMN IF NOT EXISTS shift_times time[] DEFAULT NULL;

-- booking_mode values: 'slots' (continuous slots by duration) or 'shifts' (fixed shift start times)
ALTER TABLE public.restaurant_schedule
  DROP CONSTRAINT IF EXISTS restaurant_schedule_booking_mode_check;
ALTER TABLE public.restaurant_schedule
  ADD CONSTRAINT restaurant_schedule_booking_mode_check CHECK (booking_mode IN ('slots','shifts'));