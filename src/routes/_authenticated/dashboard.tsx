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
  ArrowUpDown,
} from "lucide-react";
import {
  createKoboPin,
  listKoboDevices,
  revokeKoboDevice,
  type KoboDevice,
} from "@/lib/kobo.functions";
import {
  listEbooks,
  deleteEbook,
  type EbookListItem,
} from "@/lib/library.functions";
import { setPendingEpub } from "@/lib/pending-upload";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard – Kobo ePub" },
      { name: "description", content: "La tua libreria ePub ottimizzata per Kobo." },
    ],
  }),
  component: Dashboard,
});

type SortKey = "recent" | "oldest" | "title-asc" | "title-desc";

function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  const createPin = useServerFn(createKoboPin);
  const listDevicesFn = useServerFn(listKoboDevices);
  const revoke = useServerFn(revokeKoboDevice);
  const listFn = useServerFn(listEbooks);
  const deleteFn = useServerFn(deleteEbook);

  const [devices, setDevices] = useState<KoboDevice[]>([]);
  const [ebooks, setEbooks] = useState<EbookListItem[]>([]);
  const [sort, setSort] = useState<SortKey>("recent");
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
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
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

  async function handleDeleteEbook(id: string, title: string) {
    if (!window.confirm(`Eliminare "${title}"?`)) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Libro eliminato");
      setEbooks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eliminazione fallita");
    }
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

  const sortedEbooks = [...ebooks].sort((a, b) => {
    switch (sort) {
      case "recent":
        return new Date(b.caricato_il).getTime() - new Date(a.caricato_il).getTime();
      case "oldest":
        return new Date(a.caricato_il).getTime() - new Date(b.caricato_il).getTime();
      case "title-asc":
        return a.titolo.localeCompare(b.titolo, "it", { sensitivity: "base" });
      case "title-desc":
        return b.titolo.localeCompare(a.titolo, "it", { sensitivity: "base" });
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
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
          <Button size="icon" variant="ghost" onClick={signOut} aria-label="Esci">
            <LogOut className="h-4 w-4" />
          </Button>
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
          <Card className="p-4">
            <Library className="h-5 w-5 text-primary mb-2" />
            <p className="text-2xl font-bold">{ebooks.length}</p>
            <p className="text-xs text-muted-foreground">ePub in libreria</p>
          </Card>
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

        {/* Library list */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">I tuoi ePub</h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-transparent text-xs focus:outline-none"
                aria-label="Ordina"
              >
                <option value="recent">Più recenti</option>
                <option value="oldest">Più vecchi</option>
                <option value="title-asc">Titolo A→Z</option>
                <option value="title-desc">Titolo Z→A</option>
              </select>
            </div>
          </div>

          {sortedEbooks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nessun libro ancora. Carica il tuo primo ePub qui sopra.
            </p>
          ) : (
            <ul className="divide-y -mx-1">
              {sortedEbooks.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.titolo}</p>
                    {b.autore && (
                      <p className="truncate text-[11px] text-muted-foreground">{b.autore}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDate(b.caricato_il)} ·{" "}
                      <span className={b.is_modified ? "text-primary" : ""}>
                        {b.is_modified ? "Modificato" : "Originale"}
                      </span>
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteEbook(b.id, b.titolo)}
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
