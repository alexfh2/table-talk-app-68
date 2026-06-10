
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS voice_reservation_policy text NOT NULL DEFAULT 'auto_if_no_conflict',
  ADD COLUMN IF NOT EXISTS missing_phone_policy text NOT NULL DEFAULT 'allow_confirm',
  ADD COLUMN IF NOT EXISTS out_of_hours_manual_policy text NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS out_of_hours_voice_policy text NOT NULL DEFAULT 'requires_review',
  ADD COLUMN IF NOT EXISTS slot_almost_full_threshold integer NOT NULL DEFAULT 4;
