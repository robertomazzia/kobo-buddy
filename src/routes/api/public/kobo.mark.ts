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

export const Route = createFileRoute("/api/public/kobo/mark")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let token = "";
        let ebookId = "";
        let downloaded = true;
        try {
          const body = (await request.json()) as {
            token?: string;
            ebookId?: string;
            downloaded?: boolean;
          };
          token = String(body.token ?? "");
          ebookId = String(body.ebookId ?? "");
          downloaded = body.downloaded !== false;
        } catch {
          return json({ error: "Richiesta non valida" }, 400);
        }
        if (!token) return json({ error: "Sessione mancante" }, 401);
        if (!ebookId) return json({ error: "Libro mancante" }, 400);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("kobo_session_mark_downloaded", {
            _token: token,
            _ebook_id: ebookId,
            _downloaded: downloaded,
          });
          if (error) {
            console.error("[kobo.mark] rpc error", error);
            return json({ error: "Operazione fallita" }, 500);
          }
          if (data !== true) return json({ error: "Sessione non valida" }, 401);
          return json({ ok: true });
        } catch (err) {
          console.error("[kobo.mark] unexpected", err);
          return json({ error: "Operazione fallita" }, 500);
        }
      },
    },
  },
});
