
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.allowed_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.allowed_users TO authenticated;
GRANT ALL ON public.allowed_users TO service_role;
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read whitelist" ON public.allowed_users FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.is_email_allowed(_email TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.allowed_users WHERE lower(email) = lower(_email));
$$;

CREATE TABLE public.ebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL,
  autore TEXT,
  file_path TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'Nuovo',
  creato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebooks TO authenticated;
GRANT ALL ON public.ebooks TO service_role;
ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ebooks" ON public.ebooks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ebooks_user_id_idx ON public.ebooks(user_id);

CREATE TABLE public.kobo_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kobo_pin TEXT NOT NULL CHECK (char_length(kobo_pin) = 4),
  pin_scadenza TIMESTAMPTZ,
  session_token TEXT,
  associato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kobo_devices TO authenticated;
GRANT ALL ON public.kobo_devices TO service_role;
ALTER TABLE public.kobo_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own kobo devices" ON public.kobo_devices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX kobo_devices_user_id_idx ON public.kobo_devices(user_id);
CREATE INDEX kobo_devices_pin_idx ON public.kobo_devices(kobo_pin);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
