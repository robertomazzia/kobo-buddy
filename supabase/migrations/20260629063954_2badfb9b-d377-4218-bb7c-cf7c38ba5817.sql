
-- Redeem a PIN: returns a session_token if valid (not expired, not yet redeemed).
CREATE OR REPLACE FUNCTION public.redeem_kobo_pin(_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  _token := encode(gen_random_bytes(32), 'hex');

  UPDATE public.kobo_devices
  SET session_token = _token,
      pin_scadenza = NULL,
      associato_il = now()
  WHERE id = _id;

  RETURN _token;
END;
$$;

-- Return the owner (email/display_name) for a given session_token.
CREATE OR REPLACE FUNCTION public.kobo_session_owner(_token text)
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.display_name
  FROM public.kobo_devices d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.session_token = _token
  LIMIT 1;
$$;

-- Return the books for a given session_token.
CREATE OR REPLACE FUNCTION public.kobo_session_books(_token text)
RETURNS TABLE(id uuid, titolo text, autore text, cover_url text, status text, creato_il timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.titolo, e.autore, e.cover_url, e.status, e.creato_il
  FROM public.ebooks e
  JOIN public.kobo_devices d ON d.user_id = e.user_id
  WHERE d.session_token = _token
  ORDER BY e.creato_il DESC;
$$;

REVOKE ALL ON FUNCTION public.redeem_kobo_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kobo_session_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kobo_session_books(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.redeem_kobo_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kobo_session_owner(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kobo_session_books(text) TO anon, authenticated;
