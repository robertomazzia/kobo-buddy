
ALTER TABLE public.ebooks
  ADD COLUMN IF NOT EXISTS caricato_il timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_modified boolean NOT NULL DEFAULT false;

UPDATE public.ebooks SET caricato_il = creato_il WHERE caricato_il > creato_il + interval '1 minute' OR caricato_il < creato_il - interval '1 minute';

DROP FUNCTION IF EXISTS public.kobo_session_books(text);

CREATE FUNCTION public.kobo_session_books(_token text)
 RETURNS TABLE(id uuid, titolo text, autore text, cover_url text, status text, caricato_il timestamptz, is_modified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.titolo, e.autore, e.cover_url, e.status, e.caricato_il, e.is_modified
  FROM public.ebooks e
  JOIN public.kobo_devices d ON d.user_id = e.user_id
  WHERE d.session_token = _token
  ORDER BY e.caricato_il DESC;
$function$;

REVOKE ALL ON FUNCTION public.kobo_session_books(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kobo_session_books(text) FROM anon;
REVOKE ALL ON FUNCTION public.kobo_session_books(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kobo_session_books(text) TO service_role;

CREATE OR REPLACE FUNCTION public.kobo_session_delete_book(_token text, _ebook_id uuid)
 RETURNS TABLE(file_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _path text;
BEGIN
  SELECT d.user_id INTO _user_id
  FROM public.kobo_devices d
  WHERE d.session_token = _token
  LIMIT 1;

  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.ebooks e
  WHERE e.id = _ebook_id AND e.user_id = _user_id
  RETURNING e.file_path INTO _path;

  IF FOUND THEN
    file_path := _path;
    RETURN NEXT;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.kobo_session_delete_book(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kobo_session_delete_book(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.kobo_session_delete_book(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kobo_session_delete_book(text, uuid) TO service_role;
