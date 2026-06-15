ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS voice_table_autoassign_mode text NOT NULL DEFAULT 'high_confidence_only',
  ADD COLUMN IF NOT EXISTS voice_no_table_fallback text NOT NULL DEFAULT 'requires_human';

ALTER TABLE public.agent_settings
  DROP CONSTRAINT IF EXISTS agent_settings_voice_table_autoassign_mode_check;
ALTER TABLE public.agent_settings
  ADD CONSTRAINT agent_settings_voice_table_autoassign_mode_check
  CHECK (voice_table_autoassign_mode IN ('off','high_confidence_only','any_available'));

ALTER TABLE public.agent_settings
  DROP CONSTRAINT IF EXISTS agent_settings_voice_no_table_fallback_check;
ALTER TABLE public.agent_settings
  ADD CONSTRAINT agent_settings_voice_no_table_fallback_check
  CHECK (voice_no_table_fallback IN ('requires_human','confirm_without_table','block'));