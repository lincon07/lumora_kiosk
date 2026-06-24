-- Device setup state for the kiosk startup flow.
--
-- Adds the persisted setup fields to kiosk_devices, extends kiosk_get_state to
-- return them, and adds kiosk_save_setup so a device can write its setup
-- (name, language, timezone) keyed by its device_token. Mirrors the local
-- device-state object: { setupComplete, language, timezone, deviceName }.

-- 1. Setup columns
ALTER TABLE public.kiosk_devices
  ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- 2. Extend kiosk_get_state to surface setup fields to the device.
CREATE OR REPLACE FUNCTION public.kiosk_get_state(p_device_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dev public.kiosk_devices%ROWTYPE;
  v_hname text;
BEGIN
  SELECT * INTO v_dev FROM public.kiosk_devices WHERE device_token = p_device_token;
  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  IF v_dev.household_id IS NOT NULL THEN
    SELECT name INTO v_hname FROM public.households WHERE id = v_dev.household_id;
  END IF;

  RETURN json_build_object(
    'found', true,
    'device_id', v_dev.id,
    'device_name', v_dev.device_name,
    'paired', v_dev.household_id IS NOT NULL,
    'pairing_code', v_dev.pairing_code,
    'household_id', v_dev.household_id,
    'household_name', v_hname,
    'setup_complete', v_dev.setup_complete,
    'language', v_dev.language,
    'timezone', v_dev.timezone
  );
END;
$function$;

-- 3. Persist device setup keyed by device_token, then mark setup complete.
CREATE OR REPLACE FUNCTION public.kiosk_save_setup(
  p_device_token text,
  p_device_name text,
  p_language text,
  p_timezone text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dev public.kiosk_devices%ROWTYPE;
BEGIN
  SELECT * INTO v_dev FROM public.kiosk_devices WHERE device_token = p_device_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown device token.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.kiosk_devices
     SET device_name        = COALESCE(NULLIF(btrim(p_device_name), ''), device_name),
         language           = COALESCE(NULLIF(btrim(p_language), ''), language),
         timezone           = COALESCE(NULLIF(btrim(p_timezone), ''), timezone),
         setup_complete     = true,
         setup_completed_at = now()
   WHERE device_token = p_device_token
  RETURNING * INTO v_dev;

  RETURN json_build_object(
    'ok', true,
    'device_id', v_dev.id,
    'device_name', v_dev.device_name,
    'language', v_dev.language,
    'timezone', v_dev.timezone,
    'setup_complete', v_dev.setup_complete
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kiosk_save_setup(text, text, text, text) TO anon, authenticated;
