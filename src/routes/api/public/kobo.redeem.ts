import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

export const Route = createFileRoute("/api/public/kobo/redeem")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let pin = "";
        try {
          const body = (await request.json()) as { pin?: string };
          pin = String(body.pin ?? "").trim().toUpperCase().slice(0, 4);
        } catch {
          return json({ error: "Richiesta non valida" }, 400);
        }
        if (pin.length !== 4) return json({ error: "PIN non valido" }, 400);

        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await sb.rpc("redeem_kobo_pin", { _pin: pin });
        if (error) return json({ error: "Errore durante la verifica" }, 500);
        if (!data) return json({ error: "PIN non valido o scaduto" }, 404);
        return json({ token: data as string });
      },
    },
  },
});
