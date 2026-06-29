import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const STATUS_READY = "Pronto per Kobo";

export interface SaveEbookInput {
  titolo: string;
  autore: string;
  fileBase64: string;
  fileName: string;
  coverDataUrl?: string | null;
}

export const saveProcessedEpub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SaveEbookInput) => ({
    titolo: String(d.titolo ?? "").slice(0, 300) || "Senza titolo",
    autore: String(d.autore ?? "").slice(0, 300),
    fileBase64: String(d.fileBase64 ?? ""),
    fileName: String(d.fileName ?? "book.epub").slice(0, 200),
    coverDataUrl: d.coverDataUrl ? String(d.coverDataUrl).slice(0, 2_000_000) : null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const bin = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("ebooks")
      .upload(storagePath, new Blob([bin as BlobPart], { type: "application/epub+zip" }), {
        contentType: "application/epub+zip",
        upsert: false,
      });
    if (upErr) throw new Error(`Upload fallito: ${upErr.message}`);

    const { data: row, error: insErr } = await supabase
      .from("ebooks")
      .insert({
        user_id: userId,
        titolo: data.titolo,
        autore: data.autore,
        file_path: storagePath,
        cover_url: data.coverDataUrl ?? null,
        status: STATUS_READY,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`Salvataggio fallito: ${insErr.message}`);
    return { id: row.id, storagePath };
  });

/** Public: Kobo browser asks for a signed download URL for one of its books. */
export const getKoboDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; ebookId: string }) => ({
    token: String(d.token ?? ""),
    ebookId: String(d.ebookId ?? ""),
  }))
  .handler(async ({ data }): Promise<{ url: string; fileName: string } | { error: string }> => {
    if (!data.token || !data.ebookId) return { error: "Parametri mancanti" };

    const sb = publicClient();
    const { data: owner, error: e1 } = await sb
      .rpc("kobo_session_owner", { _token: data.token })
      .maybeSingle();
    if (e1 || !owner) return { error: "Sessione non valida" };

    // Load admin only after validating the caller.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ebook, error: e2 } = await supabaseAdmin
      .from("ebooks")
      .select("id, user_id, file_path, titolo, status")
      .eq("id", data.ebookId)
      .maybeSingle();
    if (e2 || !ebook) return { error: "ePub non trovato" };
    if (ebook.user_id !== owner.user_id) return { error: "Accesso negato" };
    if (!ebook.file_path) return { error: "File non disponibile" };
    if (ebook.status !== STATUS_READY) return { error: "ePub non pronto" };

    const { data: signed, error: e3 } = await supabaseAdmin.storage
      .from("ebooks")
      .createSignedUrl(ebook.file_path, 300, {
        download: `${(ebook.titolo || "book").replace(/[^a-zA-Z0-9._-]+/g, "_")}.epub`,
      });
    if (e3 || !signed?.signedUrl) return { error: "Impossibile generare il link" };
    return {
      url: signed.signedUrl,
      fileName: `${ebook.titolo}.epub`,
    };
  });
