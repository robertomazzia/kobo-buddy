REVOKE ALL ON FUNCTION public.redeem_kobo_pin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kobo_session_owner(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kobo_session_books(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.redeem_kobo_pin(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kobo_session_owner(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kobo_session_books(text) TO service_role;