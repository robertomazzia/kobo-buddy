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

const STATUS_READY = "Pronto per Kobo";

export const Route = createFileRoute("/api/public/kobo/library")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let token = "";
        try {
          const body = (await request.json()) as { token?: string };
          token = String(body.token ?? "");
        } catch {
          return json({ error: "Richiesta non valida" }, 400);
        }
        if (!token) return json({ error: "Sessione mancante" }, 401);

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data: owner, error: e1 } = await supabaseAdmin
            .rpc("kobo_session_owner", { _token: token })
            .maybeSingle();
          if (e1) {
            console.error("[kobo.library] owner rpc error", e1);
            return json({ error: "Sessione non valida" }, 401);
          }
          if (!owner) return json({ error: "Sessione non valida" }, 401);

          const { data: books, error: e2 } = await supabaseAdmin.rpc(
            "kobo_session_books",
            { _token: token },
          );
          if (e2) {
            console.error("[kobo.library] books rpc error", e2);
            return json({ error: "Errore caricamento libreria" }, 500);
          }

          const ready = (books ?? [])
            .filter((b) => b.status === STATUS_READY)
            .map((b) => ({
              id: b.id,
              titolo: b.titolo,
              autore: b.autore ?? "",
              caricato_il: b.caricato_il,
              is_modified: b.is_modified,
            }));

          return json({
            email: owner.email,
            displayName: owner.display_name,
            books: ready,
          });
        } catch (err) {
          console.error("[kobo.library] unexpected", err);
          return json({ error: "Errore caricamento libreria" }, 500);
        }
      },
    },
  },
});
