
REVOKE EXECUTE ON FUNCTION public.is_email_allowed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_allowed(TEXT) TO authenticated;
