import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookOpen,
  Smartphone,
  Upload,
  LogOut,
  Library,
  Plus,
  Trash2,
  Check,
  Clock,
} from "lucide-react";
import {
  createKoboPin,
  listKoboDevices,
  revokeKoboDevice,
  type KoboDevice,
} from "@/lib/kobo.functions";
import { QuickUpload } from "@/components/QuickUpload";
import { Toaster } from "@/components/ui/sonner";

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

  const createPin = useServerFn(createKoboPin);
  const listDevices = useServerFn(listKoboDevices);
  const revoke = useServerFn(revokeKoboDevice);

  const [devices, setDevices] = useState<KoboDevice[]>([]);
  const [activePin, setActivePin] = useState<{ pin: string; expiresAt: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const d = await listDevices();
      setDevices(d);
      setCounts((c) => ({ ...c, devices: d.length }));
    } catch {
      /* noop */
    }
  }, [listDevices]);

  const refreshCounts = useCallback(() => {
    supabase
      .from("ebooks")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setCounts((c) => ({ ...c, ebooks: count ?? 0 })));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    refreshCounts();
    refresh();
  }, [refresh, refreshCounts]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function generatePin() {
    setPinBusy(true);
    try {
      const res = await createPin();
      setActivePin({ pin: res.pin, expiresAt: res.expiresAt });
      await refresh();
    } finally {
      setPinBusy(false);
    }
  }

  async function removeDevice(id: string) {
    await revoke({ data: { id } });
    if (activePin && devices.find((d) => d.id === id && d.pin === activePin.pin)) {
      setActivePin(null);
    }
    await refresh();
  }

  const activeExpiryMs = activePin ? new Date(activePin.expiresAt).getTime() - now : 0;
  const activeExpired = activePin ? activeExpiryMs <= 0 : false;

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
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                {email}
              </p>
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

        <QuickUpload onUploaded={refreshCounts} />

        {/* Kobo devices */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">I tuoi dispositivi Kobo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Associa il browser del Kobo con un PIN di 4 caratteri.
              </p>
            </div>
            <Smartphone className="h-5 w-5 text-muted-foreground" />
          </div>

          {activePin && !activeExpired && (
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 text-center space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Inserisci questo PIN su <span className="font-mono">/kobo</span>
              </p>
              <p className="text-4xl font-mono font-bold tracking-[0.4em] pl-[0.4em]">
                {activePin.pin}
              </p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                Scade tra {formatRemaining(activeExpiryMs)}
              </p>
            </div>
          )}

          {activePin && activeExpired && (
            <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
              PIN scaduto. Generane uno nuovo.
            </div>
          )}

          <Button
            onClick={generatePin}
            disabled={pinBusy}
            className="w-full"
            variant={activePin && !activeExpired ? "outline" : "default"}
          >
            <Plus className="h-4 w-4" />
            {pinBusy ? "Genero PIN..." : "Associa nuovo Kobo"}
          </Button>

          {devices.length > 0 && (
            <ul className="divide-y -mx-1">
              {devices.map((d) => {
                const expMs = d.expiresAt ? new Date(d.expiresAt).getTime() - now : 0;
                const expired = !d.paired && expMs <= 0;
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-1 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold tracking-widest">
                          {d.pin}
                        </span>
                        {d.paired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            <Check className="h-3 w-3" /> Accoppiato
                          </span>
                        ) : expired ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Scaduto
                          </span>
                        ) : (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            In attesa · {formatRemaining(expMs)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(d.associatedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeDevice(d.id)}
                      aria-label="Rimuovi"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}
