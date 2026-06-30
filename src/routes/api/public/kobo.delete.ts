import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/kobo/delete")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let token = "";
        let ebookId = "";
        try {
          const body = (await request.json()) as { token?: string; ebookId?: string };
          token = String(body.token ?? "");
          ebookId = String(body.ebookId ?? "");
        } catch {
          return json({ error: "Richiesta non valida" }, 400);
        }
        if (!token) return json({ error: "Sessione mancante" }, 401);
        if (!ebookId) return json({ error: "Libro mancante" }, 400);

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data, error } = await supabaseAdmin.rpc(
            "kobo_session_delete_book",
            { _token: token, _ebook_id: ebookId },
          );
          if (error) {
            console.error("[kobo.delete] rpc error", error);
            return json({ error: "Errore durante l'eliminazione" }, 500);
          }
          const rows = (data ?? []) as Array<{ file_path: string | null }>;
          if (rows.length === 0) {
            return json({ error: "Libro non trovato" }, 404);
          }
          const path = rows[0].file_path;
          if (path) {
            await supabaseAdmin.storage.from("ebooks").remove([path]);
          }
          return json({ ok: true });
        } catch (err) {
          console.error("[kobo.delete] unexpected", err);
          return json({ error: "Errore durante l'eliminazione" }, 500);
        }
      },
    },
  },
});
