import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// PIN: 4 alphanumeric chars, unambiguous (no 0/O/1/I).
const PIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePin(): string {
  let p = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 4; i++) p += PIN_ALPHABET[bytes[i] % PIN_ALPHABET.length];
  return p;
}

function publicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export interface KoboPin {
  id: string;
  pin: string;
  expiresAt: string;
}

// ----- Authenticated: create / list / revoke pairings -----

export const createKoboPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KoboPin> => {
    const { supabase, userId } = context;

    // Try up to 5 times in case of unlikely PIN collision among active pins.
    for (let attempt = 0; attempt < 5; attempt++) {
      const pin = generatePin();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("kobo_devices")
        .insert({
          user_id: userId,
          kobo_pin: pin,
          pin_scadenza: expiresAt,
        })
        .select("id, kobo_pin, pin_scadenza")
        .single();
      if (!error && data) {
        return { id: data.id, pin: data.kobo_pin, expiresAt: data.pin_scadenza! };
      }
    }
    throw new Error("Impossibile generare un PIN, riprova.");
  });

export interface KoboDevice {
  id: string;
  pin: string;
  paired: boolean;
  expiresAt: string | null;
  associatedAt: string;
}

export const listKoboDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KoboDevice[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("kobo_devices")
      .select("id, kobo_pin, session_token, pin_scadenza, associato_il")
      .order("associato_il", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((d) => ({
      id: d.id,
      pin: d.kobo_pin,
      paired: !!d.session_token,
      expiresAt: d.pin_scadenza,
      associatedAt: d.associato_il,
    }));
  });

export const revokeKoboDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("kobo_devices").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ----- Public (Kobo browser): redeem PIN, fetch books -----

export const redeemKoboPin = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string }) => ({
    pin: String(d.pin ?? "").trim().toUpperCase().slice(0, 4),
  }))
  .handler(async ({ data }): Promise<{ token: string } | { error: string }> => {
    if (data.pin.length !== 4) return { error: "PIN non valido" };
    const sb = publicClient();
    const { data: token, error } = await sb.rpc("redeem_kobo_pin", { _pin: data.pin });
    if (error) return { error: "Errore durante la verifica del PIN" };
    if (!token) return { error: "PIN non valido o scaduto" };
    return { token: token as string };
  });

export interface KoboSession {
  email: string | null;
  displayName: string | null;
  books: Array<{
    id: string;
    titolo: string;
    autore: string | null;
    coverUrl: string | null;
    status: string;
  }>;
}

export const getKoboSession = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }): Promise<KoboSession | { error: string }> => {
    if (!data.token) return { error: "Sessione non valida" };
    const sb = publicClient();
    const { data: owner, error: e1 } = await sb
      .rpc("kobo_session_owner", { _token: data.token })
      .maybeSingle();
    if (e1 || !owner) return { error: "Sessione non valida" };
    const { data: books, error: e2 } = await sb.rpc("kobo_session_books", {
      _token: data.token,
    });
    if (e2) return { error: "Errore caricamento libreria" };
    return {
      email: owner.email,
      displayName: owner.display_name,
      books: (books ?? []).map((b) => ({
        id: b.id,
        titolo: b.titolo,
        autore: b.autore,
        coverUrl: b.cover_url,
        status: b.status,
      })),
    };
  });
