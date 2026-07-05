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
  isModified?: boolean;
}

export const saveProcessedEpub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SaveEbookInput) => ({
    titolo: String(d.titolo ?? "").slice(0, 300) || "Senza titolo",
    autore: String(d.autore ?? "").slice(0, 300),
    fileBase64: String(d.fileBase64 ?? ""),
    fileName: String(d.fileName ?? "book.epub").slice(0, 200),
    coverDataUrl: d.coverDataUrl ? String(d.coverDataUrl).slice(0, 2_000_000) : null,
    isModified: !!d.isModified,
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
        is_modified: data.isModified,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`Salvataggio fallito: ${insErr.message}`);
    return { id: row.id, storagePath };
  });

export interface EbookListItem {
  id: string;
  titolo: string;
  autore: string | null;
  status: string;
  caricato_il: string;
  is_modified: boolean;
  cover_url: string | null;
}

export const listEbooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EbookListItem[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("ebooks")
      .select("id, titolo, autore, status, caricato_il, is_modified, cover_url")
      .order("caricato_il", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EbookListItem[];
  });

export const deleteEbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: e1 } = await supabase
      .from("ebooks")
      .select("id, file_path, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw e1;
    if (!row || row.user_id !== userId) throw new Error("Libro non trovato");
    if (row.file_path) {
      await supabase.storage.from("ebooks").remove([row.file_path]);
    }
    const { error: e2 } = await supabase.from("ebooks").delete().eq("id", data.id);
    if (e2) throw e2;
    return { ok: true };
  });

/** Get a signed download URL for one of the current user's own ebooks. */
export const getOwnEbookDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }): Promise<{ url: string; fileName: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ebooks")
      .select("id, user_id, file_path, titolo")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.user_id !== userId) throw new Error("Libro non trovato");
    if (!row.file_path) throw new Error("File non disponibile");
    const safe = (row.titolo || "book").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const { data: signed, error: e2 } = await supabase.storage
      .from("ebooks")
      .createSignedUrl(row.file_path, 300, { download: `${safe}.epub` });
    if (e2 || !signed?.signedUrl) throw new Error("Impossibile generare il link");
    return { url: signed.signedUrl, fileName: `${safe}.epub` };
  });

/** Share (copy) one of the user's ebooks to another registered user by email. */
export const shareEbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; email: string }) => ({
    id: String(d.id ?? ""),
    email: String(d.email ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; recipient: string }> => {
    const { supabase, userId } = context;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("Email non valida");
    }

    // Load source ebook via user's RLS-scoped client (guarantees ownership).
    const { data: src, error: e1 } = await supabase
      .from("ebooks")
      .select("id, user_id, file_path, titolo, autore, cover_url, is_modified, status")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw e1;
    if (!src || src.user_id !== userId) throw new Error("Libro non trovato");
    if (!src.file_path) throw new Error("File non disponibile");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up recipient in profiles.
    const { data: recipient, error: e2 } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (e2) throw e2;
    if (!recipient) throw new Error("Nessun utente registrato con questa email");
    if (recipient.id === userId) throw new Error("Non puoi condividere con te stesso");

    // Copy storage object into recipient's folder.
    const originalName = src.file_path.split("/").pop() ?? "book.epub";
    const destPath = `${recipient.id}/${crypto.randomUUID()}-${originalName}`;

    const { data: dl, error: e3 } = await supabaseAdmin.storage
      .from("ebooks")
      .download(src.file_path);
    if (e3 || !dl) throw new Error("Impossibile leggere il file sorgente");

    const bytes = new Uint8Array(await dl.arrayBuffer());
    const { error: e4 } = await supabaseAdmin.storage
      .from("ebooks")
      .upload(destPath, new Blob([bytes as BlobPart], { type: "application/epub+zip" }), {
        contentType: "application/epub+zip",
        upsert: false,
      });
    if (e4) throw new Error(`Copia fallita: ${e4.message}`);

    const { error: e5 } = await supabaseAdmin.from("ebooks").insert({
      user_id: recipient.id,
      titolo: src.titolo,
      autore: src.autore,
      file_path: destPath,
      cover_url: src.cover_url,
      status: src.status,
      is_modified: src.is_modified,
    });
    if (e5) {
      await supabaseAdmin.storage.from("ebooks").remove([destPath]);
      throw new Error(`Salvataggio fallito: ${e5.message}`);
    }

    return { ok: true, recipient: recipient.email ?? data.email };
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
