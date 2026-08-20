import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CreateUserInput {
  email: string;
  note?: string | null;
}

export const createWhitelistedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateUserInput) => ({
    email: String(d.email ?? "").trim().toLowerCase().slice(0, 320),
    note: d.note ? String(d.note).slice(0, 500) : null,
  }))
  .handler(async ({ data, context }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("Email non valida");
    }

    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr || isAdmin !== true) throw new Error("Non autorizzato");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) whitelist (idempotente)
    const { error: wlErr } = await supabaseAdmin
      .from("allowed_users")
      .insert({ email: data.email, note: data.note });
    if (wlErr && wlErr.code !== "23505") throw new Error("Impossibile aggiornare la whitelist");
    const alreadyWhitelisted = wlErr?.code === "23505";

    // 2) crea l'utente auth già confermato
    const password = crypto.randomUUID() + crypto.randomUUID();
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
    });

    let alreadyRegistered = false;
    if (createErr) {
      const msg = (createErr.message ?? "").toLowerCase();
      if (msg.includes("already") || (createErr as { status?: number }).status === 422) {
        alreadyRegistered = true;
      } else {
        throw new Error("Impossibile creare l'utente");
      }
    }

    return { ok: true, email: data.email, alreadyWhitelisted, alreadyRegistered };
  });
