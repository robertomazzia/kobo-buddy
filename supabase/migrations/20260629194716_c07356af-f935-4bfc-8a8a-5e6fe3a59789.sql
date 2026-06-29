CREATE OR REPLACE FUNCTION public.redeem_kobo_pin(_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _token text;
  _id uuid;
BEGIN
  IF _pin IS NULL OR length(_pin) <> 4 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO _id
  FROM public.kobo_devices
  WHERE upper(kobo_pin) = upper(_pin)
    AND session_token IS NULL
    AND pin_scadenza IS NOT NULL
    AND pin_scadenza > now()
  ORDER BY associato_il DESC
  LIMIT 1;

  IF _id IS NULL THEN
    RETURN NULL;
  END IF;

  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.kobo_devices
  SET session_token = _token,
      pin_scadenza = NULL,
      associato_il = now()
  WHERE id = _id;

  RETURN _token;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.redeem_kobo_pin(text) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_kobo_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_kobo_pin(text) TO service_role;