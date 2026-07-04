import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Trash2, Loader2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/whitelist")({
  head: () => ({
    meta: [
      { title: "Whitelist – Amministrazione" },
      { name: "description", content: "Gestione degli utenti autorizzati." },
    ],
  }),
  component: AdminWhitelist,
});

type AllowedUser = {
  id: string;
  email: string;
  note: string | null;
  created_at: string;
};

function AdminWhitelist() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("allowed_users")
      .select("id, email, note, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Errore nel caricamento della whitelist");
    } else {
      setRows((data ?? []) as AllowedUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      const ok = !error && data === true;
      setIsAdmin(ok);
      setChecking(false);
      if (ok) await load();
    })();
  }, [navigate, load]);

  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast.error("Inserisci un'email valida");
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from("allowed_users")
      .insert({ email: clean, note: note.trim() || null });
    setAdding(false);
    if (error) {
      if (error.code === "23505") toast.error("Email già in whitelist");
      else toast.error("Impossibile aggiungere l'email");
      return;
    }
    toast.success("Email aggiunta alla whitelist");
    setEmail("");
    setNote("");
    await load();
  }

  async function remove(id: string, mail: string) {
    if (!window.confirm(`Rimuovere ${mail} dalla whitelist?`)) return;
    const { error } = await supabase.from("allowed_users").delete().eq("id", id);
    if (error) {
      toast.error("Impossibile rimuovere");
      return;
    }
    toast.success("Email rimossa");
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center px-4">
        <Card className="max-w-sm w-full p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold">Area riservata</h1>
          <p className="text-sm text-muted-foreground">
            Questa pagina è accessibile solo agli amministratori.
          </p>
          <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            Torna alla dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => navigate({ to: "/dashboard" })}
              aria-label="Indietro"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <p className="text-sm font-semibold leading-none">Whitelist</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        <section>
          <h1 className="text-2xl font-bold tracking-tight">Utenti autorizzati</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Solo le email in questa lista possono accedere all'app dopo il login.
          </p>
        </section>

        <Card className="p-4">
          <form onSubmit={addEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Nota (opzionale)</Label>
              <Input
                id="note"
                type="text"
                placeholder="es. famiglia, amico…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={adding}>
              {adding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Aggiungi alla whitelist
            </Button>
          </form>
        </Card>

        <Card className="p-2">
          {loading ? (
            <div className="p-6 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nessuna email in whitelist.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.email}</p>
                    {r.note && (
                      <p className="text-xs text-muted-foreground truncate">{r.note}</p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(r.id, r.email)}
                    aria-label={`Rimuovi ${r.email}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}
