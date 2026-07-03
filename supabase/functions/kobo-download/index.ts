import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const STATUS_READY = "Pronto per Kobo";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token = "";
  let ebookId = "";
  try {
    const body = (await req.json()) as { token?: string; ebookId?: string };
    token = String(body.token ?? "");
    ebookId = String(body.ebookId ?? "");
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  if (!token || !ebookId) return json({ error: "Parametri mancanti" }, 400);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: owner, error: e1 } = await supabaseAdmin
      .rpc("kobo_session_owner", { _token: token })
      .maybeSingle();
    if (e1 || !owner) return json({ error: "Sessione non valida" }, 401);

    const { data: ebook, error: e2 } = await supabaseAdmin
      .from("ebooks")
      .select("id, user_id, file_path, titolo, status")
      .eq("id", ebookId)
      .maybeSingle();
    if (e2 || !ebook) return json({ error: "ePub non trovato" }, 404);
    if (ebook.user_id !== owner.user_id) return json({ error: "Accesso negato" }, 403);
    if (!ebook.file_path) return json({ error: "File non disponibile" }, 404);
    if (ebook.status !== STATUS_READY) return json({ error: "ePub non pronto" }, 409);

    const safe = (ebook.titolo || "book").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const { data: signed, error: e3 } = await supabaseAdmin.storage
      .from("ebooks")
      .createSignedUrl(ebook.file_path, 300, { download: `${safe}.epub` });
    if (e3 || !signed?.signedUrl) return json({ error: "Impossibile generare il link" }, 500);

    return json({ url: signed.signedUrl, fileName: `${safe}.epub` });
  } catch (err) {
    console.error("[kobo-download] unexpected", err);
    return json({ error: "Errore durante il download" }, 500);
  }
});
