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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let pin = "";
  try {
    const body = (await req.json()) as { pin?: string };
    pin = String(body.pin ?? "").trim().toUpperCase().slice(0, 4);
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  if (pin.length !== 4) return json({ error: "PIN non valido" }, 400);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabaseAdmin.rpc("redeem_kobo_pin", { _pin: pin });
    if (error) {
      console.error("[kobo-redeem] rpc error", error);
      return json({ error: "Errore durante la verifica" }, 500);
    }
    if (!data) return json({ error: "PIN non valido o scaduto" }, 404);
    return json({ token: data as string });
  } catch (err) {
    console.error("[kobo-redeem] unexpected", err);
    return json({ error: "Errore durante la verifica" }, 500);
  }
});
