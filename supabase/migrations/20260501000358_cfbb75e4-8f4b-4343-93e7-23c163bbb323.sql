
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.user_role AS ENUM ('platform_admin', 'restaurant_admin');
CREATE TYPE public.restaurant_status AS ENUM ('draft', 'active', 'paused');
CREATE TYPE public.calendar_type AS ENUM ('internal', 'external');
CREATE TYPE public.reservation_status AS ENUM ('pending','confirmed','modified','cancelled','requires_human','no_show');
CREATE TYPE public.reservation_channel AS ENUM ('manual','whatsapp','future_voice','external_calendar');
CREATE TYPE public.handoff_status AS ENUM ('pending','in_review','resolved');
CREATE TYPE public.integration_status AS ENUM ('pending','connected','needs_review');
CREATE TYPE public.summary_frequency AS ENUM ('every_12_hours','daily');

-- =========================
-- updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- RESTAURANTS
-- =========================
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  main_phone TEXT,
  whatsapp_number TEXT,
  contact_email TEXT,
  manager_name TEXT,
  manager_email TEXT,
  manager_whatsapp TEXT,
  status public.restaurant_status NOT NULL DEFAULT 'draft',
  calendar_type public.calendar_type NOT NULL DEFAULT 'internal',
  notes_internal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role public.user_role NOT NULL DEFAULT 'restaurant_admin',
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'restaurant_admin')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helpers
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_role() = 'platform_admin';
$$;

-- =========================
-- RESERVATIONS
-- =========================
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  status public.reservation_status NOT NULL DEFAULT 'pending',
  channel public.reservation_channel NOT NULL DEFAULT 'manual',
  customer_notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_restaurant_date ON public.reservations(restaurant_id, reservation_date);
CREATE TRIGGER trg_reservations_updated BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- RESTAURANT_SCHEDULE
-- =========================
CREATE TABLE public.restaurant_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  opening_time TIME,
  closing_time TIME,
  service_name TEXT,
  max_guests_per_slot INTEGER DEFAULT 30,
  max_reservations_per_slot INTEGER DEFAULT 10,
  slot_duration_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_schedule_updated BEFORE UPDATE ON public.restaurant_schedule
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- BLOCKED_DATES
-- =========================
CREATE TABLE public.blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  is_full_day BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- FAQS
-- =========================
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_faqs_updated BEFORE UPDATE ON public.faqs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- AGENT_SETTINGS
-- =========================
CREATE TABLE public.agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  main_language TEXT DEFAULT 'es',
  tone_style TEXT DEFAULT 'cercano_casual',
  formality_level TEXT DEFAULT 'medio',
  welcome_message TEXT,
  confirmation_message TEXT,
  cancellation_message TEXT,
  human_handoff_message TEXT,
  additional_instructions TEXT,
  max_party_size_auto INTEGER DEFAULT 8,
  min_notice_hours INTEGER DEFAULT 2,
  max_advance_days INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_agent_updated BEFORE UPDATE ON public.agent_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- NOTIFICATION_SETTINGS
-- =========================
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  notify_by_email BOOLEAN NOT NULL DEFAULT true,
  notify_by_whatsapp BOOLEAN NOT NULL DEFAULT false,
  manager_email TEXT,
  manager_whatsapp TEXT,
  notify_new_reservation BOOLEAN NOT NULL DEFAULT true,
  notify_modified_reservation BOOLEAN NOT NULL DEFAULT true,
  notify_cancelled_reservation BOOLEAN NOT NULL DEFAULT true,
  notify_human_required BOOLEAN NOT NULL DEFAULT true,
  send_summary BOOLEAN NOT NULL DEFAULT false,
  summary_frequency public.summary_frequency NOT NULL DEFAULT 'daily',
  summary_time TIME DEFAULT '09:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_notif_updated BEFORE UPDATE ON public.notification_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- HUMAN_HANDOFF_REQUESTS
-- =========================
CREATE TABLE public.human_handoff_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  source_channel public.reservation_channel NOT NULL DEFAULT 'whatsapp',
  reason TEXT,
  customer_message TEXT,
  status public.handoff_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_handoff_updated BEFORE UPDATE ON public.human_handoff_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- EXTERNAL_CALENDAR_SETTINGS
-- =========================
CREATE TABLE public.external_calendar_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider_name TEXT,
  connection_type TEXT,
  connection_url TEXT,
  api_key_placeholder TEXT,
  webhook_url_placeholder TEXT,
  integration_status public.integration_status NOT NULL DEFAULT 'pending',
  technical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_extcal_updated BEFORE UPDATE ON public.external_calendar_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ENABLE RLS
-- =========================
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_handoff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_calendar_settings ENABLE ROW LEVEL SECURITY;

-- =========================
-- RLS POLICIES (simple)
-- =========================

-- profiles: user reads own; platform admin reads/edits all
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_platform_admin());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- restaurants
CREATE POLICY "restaurants_admin_all" ON public.restaurants FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "restaurants_member_read" ON public.restaurants FOR SELECT
  USING (id = public.current_restaurant_id());
CREATE POLICY "restaurants_member_update" ON public.restaurants FOR UPDATE
  USING (id = public.current_restaurant_id()) WITH CHECK (id = public.current_restaurant_id());

-- Generic policy generator pattern per table (reservations, schedule, blocked, faqs, agent, notif, handoff, external)
CREATE POLICY "reservations_admin_all" ON public.reservations FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "reservations_member_all" ON public.reservations FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "schedule_admin_all" ON public.restaurant_schedule FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "schedule_member_all" ON public.restaurant_schedule FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "blocked_admin_all" ON public.blocked_dates FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "blocked_member_all" ON public.blocked_dates FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "faqs_admin_all" ON public.faqs FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "faqs_member_all" ON public.faqs FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "agent_admin_all" ON public.agent_settings FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "agent_member_all" ON public.agent_settings FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "notif_admin_all" ON public.notification_settings FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "notif_member_all" ON public.notification_settings FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "handoff_admin_all" ON public.human_handoff_requests FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "handoff_member_all" ON public.human_handoff_requests FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE POLICY "extcal_admin_all" ON public.external_calendar_settings FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "extcal_member_all" ON public.external_calendar_settings FOR ALL
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
