import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Smartphone, Upload, LogOut, Library } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard – Kobo ePub" },
      { name: "description", content: "La tua libreria ePub ottimizzata per Kobo." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [counts, setCounts] = useState({ ebooks: 0, devices: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    Promise.all([
      supabase.from("ebooks").select("id", { count: "exact", head: true }),
      supabase.from("kobo_devices").select("id", { count: "exact", head: true }),
    ]).then(([e, d]) => {
      setCounts({ ebooks: e.count ?? 0, devices: d.count ?? 0 });
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Kobo ePub</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{email}</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={signOut} aria-label="Esci">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        <section>
          <h1 className="text-2xl font-bold tracking-tight">La tua libreria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Carica, ottimizza e invia ePub al tuo Kobo.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <Library className="h-5 w-5 text-primary mb-2" />
            <p className="text-2xl font-bold">{counts.ebooks}</p>
            <p className="text-xs text-muted-foreground">ePub in libreria</p>
          </Card>
          <Card className="p-4">
            <Smartphone className="h-5 w-5 text-primary mb-2" />
            <p className="text-2xl font-bold">{counts.devices}</p>
            <p className="text-xs text-muted-foreground">Kobo associati</p>
          </Card>
        </div>

        <Card className="p-5 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Carica un ePub</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ripara encoding, sostituisci la copertina e prepara il file per Kobo.
            </p>
          </div>
          <Link to="/optimizer">
            <Button className="w-full">Apri l'ottimizzatore</Button>
          </Link>
        </Card>

        <Card className="p-5 text-center space-y-2 border-dashed">
          <Smartphone className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Accoppia il tuo Kobo</p>
          <p className="text-xs text-muted-foreground">
            Funzionalità in arrivo: genera un PIN e collega il browser del Kobo.
          </p>
        </Card>
      </main>
    </div>
  );
}
