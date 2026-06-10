
-- Seasons table
CREATE TABLE public.schedule_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_seasons_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX schedule_seasons_restaurant_idx ON public.schedule_seasons(restaurant_id);
CREATE INDEX schedule_seasons_range_idx ON public.schedule_seasons(restaurant_id, start_date, end_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_seasons TO authenticated;
GRANT ALL ON public.schedule_seasons TO service_role;

ALTER TABLE public.schedule_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seasons_member_all" ON public.schedule_seasons
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "seasons_admin_all" ON public.schedule_seasons
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE TRIGGER trg_seasons_updated
  BEFORE UPDATE ON public.schedule_seasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend restaurant_schedule with season_id (NULL = base schedule)
ALTER TABLE public.restaurant_schedule
  ADD COLUMN season_id uuid NULL REFERENCES public.schedule_seasons(id) ON DELETE CASCADE;

CREATE INDEX restaurant_schedule_season_idx ON public.restaurant_schedule(restaurant_id, season_id);

-- Extend blocked_dates to act as exceptions
ALTER TABLE public.blocked_dates
  ADD COLUMN kind text NOT NULL DEFAULT 'closed',
  ADD COLUMN service_period text NULL,
  ADD COLUMN max_guests_per_slot integer NULL,
  ADD COLUMN max_reservations_per_slot integer NULL,
  ADD COLUMN slot_duration_minutes integer NULL,
  ADD COLUMN shift_times time[] NULL,
  ADD COLUMN booking_mode text NULL,
  ADD CONSTRAINT blocked_dates_kind_chk
    CHECK (kind IN ('closed','special_hours','private_event','extra_service')),
  ADD CONSTRAINT blocked_dates_service_period_chk
    CHECK (service_period IS NULL OR service_period IN ('lunch','dinner','both')),
  ADD CONSTRAINT blocked_dates_booking_mode_chk
    CHECK (booking_mode IS NULL OR booking_mode IN ('slots','shifts'));

CREATE INDEX blocked_dates_restaurant_date_idx ON public.blocked_dates(restaurant_id, date);
