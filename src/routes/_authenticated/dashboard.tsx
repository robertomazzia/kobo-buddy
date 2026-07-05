import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  ShieldCheck,
} from "lucide-react";
import {
  createKoboPin,
  listKoboDevices,
  revokeKoboDevice,
  type KoboDevice,
} from "@/lib/kobo.functions";
import { listEbooks, type EbookListItem } from "@/lib/library.functions";
import { setPendingEpub } from "@/lib/pending-upload";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { BottomNav } from "@/components/bottom-nav";

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
  const [isAdmin, setIsAdmin] = useState(false);

  const createPin = useServerFn(createKoboPin);
  const listDevicesFn = useServerFn(listKoboDevices);
  const revoke = useServerFn(revokeKoboDevice);
  const listFn = useServerFn(listEbooks);

  const [devices, setDevices] = useState<KoboDevice[]>([]);
  const [ebooks, setEbooks] = useState<EbookListItem[]>([]);
  const [activePin, setActivePin] = useState<{ pin: string; expiresAt: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([listDevicesFn(), listFn()]);
      setDevices(d);
      setEbooks(e);
    } catch {
      /* noop */
    }
  }, [listDevicesFn, listFn]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? "");
      if (data.user) {
        const { data: r } = await supabase.rpc("has_role", {
          _user_id: data.user.id,
          _role: "admin",
        });
        setIsAdmin(r === true);
      }
    });
    refresh();
  }, [refresh]);

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

  function handleFile(file: File) {
    if (!/\.epub$/i.test(file.name) && file.type !== "application/epub+zip") {
      toast.error("Seleziona un file .epub");
      return;
    }
    setPendingEpub(file);
    navigate({ to: "/optimizer" });
  }

  const activeExpiryMs = activePin ? new Date(activePin.expiresAt).getTime() - now : 0;
  const activeExpired = activePin ? activeExpiryMs <= 0 : false;


  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted pb-24">
      <Toaster richColors position="top-center" />
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
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate({ to: "/admin/whitelist" })}
                aria-label="Whitelist"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={signOut} aria-label="Esci">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        <section>
          <h1 className="text-2xl font-bold tracking-tight">La tua libreria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Carica un ePub: l'anteprima si apre con copertina, encoding e capitoli a portata di mano.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/library" })}
            className="text-left"
            aria-label="Vai alla libreria"
          >
            <Card className="p-4 transition-colors hover:bg-accent/40 active:scale-[0.98]">
              <Library className="h-5 w-5 text-primary mb-2" />
              <p className="text-2xl font-bold">{ebooks.length}</p>
              <p className="text-xs text-muted-foreground">ePub in libreria</p>
            </Card>
          </button>
          <Card className="p-4">
            <Smartphone className="h-5 w-5 text-primary mb-2" />
            <p className="text-2xl font-bold">{devices.length}</p>
            <p className="text-xs text-muted-foreground">Kobo associati</p>
          </Card>
        </div>


        {/* Unified upload */}
        <Card
          className={`p-6 text-center space-y-3 transition-colors border-2 border-dashed ${
            dragOver ? "border-primary bg-accent/40" : "border-input"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Carica un ePub</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Trascina qui un file oppure seleziona dal telefono.
            </p>
          </div>
          <Button className="w-full" onClick={() => inputRef.current?.click()}>
            Scegli file .epub
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".epub,application/epub+zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </Card>


        {/* Kobo devices */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">I tuoi dispositivi Kobo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vai su kobo.zemazzialab.it dal browser del tuo Kobo e associa la libreria utilizzando il PIN di 4 caratteri.
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
      <BottomNav />
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

