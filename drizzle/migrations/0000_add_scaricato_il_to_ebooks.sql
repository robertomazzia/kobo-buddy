ALTER TABLE public.ebooks ADD COLUMN IF NOT EXISTS scaricato_il timestamptz;

DROP FUNCTION IF EXISTS public.kobo_session_books(text);

CREATE FUNCTION public.kobo_session_books(_token text)
 RETURNS TABLE(id uuid, titolo text, autore text, cover_url text, status text, caricato_il timestamp with time zone, is_modified boolean, scaricato_il timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.titolo, e.autore, e.cover_url, e.status, e.caricato_il, e.is_modified, e.scaricato_il
  FROM public.ebooks e
  JOIN public.kobo_devices d ON d.user_id = e.user_id
  WHERE d.session_token = _token
  ORDER BY e.caricato_il DESC;
$function$;

CREATE OR REPLACE FUNCTION public.kobo_session_mark_downloaded(_token text, _ebook_id uuid, _downloaded boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
BEGIN
  SELECT d.user_id INTO _user_id
  FROM public.kobo_devices d
  WHERE d.session_token = _token
  LIMIT 1;

  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.ebooks e
  SET scaricato_il = CASE WHEN _downloaded THEN now() ELSE NULL END
  WHERE e.id = _ebook_id AND e.user_id = _user_id;

  RETURN FOUND;
END;
$function$;