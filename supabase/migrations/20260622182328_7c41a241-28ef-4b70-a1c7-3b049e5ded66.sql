
-- Enable pgcrypto for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Make email nullable (phone-first users may not have one)
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- Add new columns for phone-first auth
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'email';

-- Backfill phone_e164 from existing phone field (strip non-digits, keep +)
UPDATE public.profiles
SET phone_e164 = '+' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL AND phone_e164 IS NULL;

-- Unique index on phone_e164 (allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_key
  ON public.profiles(phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Recovery codes table for forgot-PIN flow
CREATE TABLE IF NOT EXISTS public.pin_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pin_recovery_codes TO service_role;

ALTER TABLE public.pin_recovery_codes ENABLE ROW LEVEL SECURITY;

-- No client policies — only edge functions (service_role) touch this table.

CREATE INDEX IF NOT EXISTS idx_pin_recovery_phone ON public.pin_recovery_codes(phone_e164, created_at DESC);

-- Update handle_new_user to also populate phone_e164 + auth_method when metadata provides them
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta_phone text;
  meta_phone_e164 text;
  meta_country text;
  meta_auth_method text;
  meta_pin_hash text;
BEGIN
  meta_phone := NULLIF(NEW.raw_user_meta_data->>'phone', '');
  meta_phone_e164 := NULLIF(NEW.raw_user_meta_data->>'phone_e164', '');
  meta_country := NULLIF(NEW.raw_user_meta_data->>'country_code', '');
  meta_auth_method := COALESCE(NULLIF(NEW.raw_user_meta_data->>'auth_method', ''), 'email');
  meta_pin_hash := NULLIF(NEW.raw_user_meta_data->>'pin_hash', '');

  INSERT INTO public.profiles (user_id, email, phone, phone_e164, country_code, auth_method, pin_hash)
  VALUES (
    NEW.id,
    NEW.email,
    meta_phone,
    meta_phone_e164,
    meta_country,
    meta_auth_method,
    meta_pin_hash
  )
  ON CONFLICT (user_id) DO UPDATE
    SET phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        phone_e164 = COALESCE(EXCLUDED.phone_e164, public.profiles.phone_e164),
        country_code = COALESCE(EXCLUDED.country_code, public.profiles.country_code),
        auth_method = COALESCE(EXCLUDED.auth_method, public.profiles.auth_method),
        pin_hash = COALESCE(EXCLUDED.pin_hash, public.profiles.pin_hash),
        email = COALESCE(EXCLUDED.email, public.profiles.email);
  RETURN NEW;
END;
$function$;
