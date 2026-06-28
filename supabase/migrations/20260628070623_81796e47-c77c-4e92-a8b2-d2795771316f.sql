
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_email_allowed(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_allowed(TEXT) TO authenticated;
