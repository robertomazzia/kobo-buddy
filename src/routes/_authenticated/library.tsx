import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  listEbooks,
  deleteEbook,
  getOwnEbookDownloadUrl,
  shareEbook,
  type EbookListItem,
} from "@/lib/library.functions";
import { BottomNav } from "@/components/bottom-nav";
import {
  ChevronLeft,
  Download,
  Trash2,
  Share2,
  Loader2,
  X,
  Library as LibraryIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Libreria – Kobo ePub" },
      { name: "description", content: "Tutti i tuoi ePub, scarica o condividi." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listEbooks);
  const deleteFn = useServerFn(deleteEbook);
  const downloadFn = useServerFn(getOwnEbookDownloadUrl);
  const shareFn = useServerFn(shareEbook);

  const [ebooks, setEbooks] = useState<EbookListItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<{ id: string; kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listFn();
      setEbooks(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
    }
  }, [listFn]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDownload(id: string) {
    setBusyId(id);
    try {
      const res = await downloadFn({ data: { id } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download fallito");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Eliminare "${title}"?`)) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Libro eliminato");
      setEbooks((prev) => (prev ? prev.filter((b) => b.id !== id) : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eliminazione fallita");
    }
  }

  function openShare(id: string) {
    setShareOpen(id);
    setShareEmail("");
    setShareMsg(null);
  }

  async function submitShare(id: string) {
    if (!shareEmail.trim()) return;
    setShareBusy(true);
    setShareMsg(null);
    try {
      const res = await shareFn({ data: { id, email: shareEmail.trim() } });
      setShareMsg({ id, kind: "ok", text: `Condiviso con ${res.recipient}` });
      setShareEmail("");
      setTimeout(() => {
        setShareOpen((cur) => (cur === id ? null : cur));
        setShareMsg(null);
      }, 1800);
    } catch (err) {
      setShareMsg({
        id,
        kind: "err",
        text: err instanceof Error ? err.message : "Condivisione fallita",
      });
    } finally {
      setShareBusy(false);
    }
  }

  const sorted = ebooks
    ? [...ebooks].sort(
        (a, b) => new Date(b.caricato_il).getTime() - new Date(a.caricato_il).getTime(),
      )
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted pb-24">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate({ to: "/dashboard" })}
            aria-label="Indietro"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <LibraryIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Libreria</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {sorted ? `${sorted.length} ePub` : "…"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        <Card className="p-2">
          {sorted === null ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nessun libro ancora. Carica il tuo primo ePub.
            </p>
          ) : (
            <ul className="divide-y">
              {sorted.map((b) => {
                const isOpen = shareOpen === b.id;
                const msg = shareMsg?.id === b.id ? shareMsg : null;
                return (
                  <li key={b.id} className="px-2 py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{b.titolo}</p>
                        {b.autore && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {b.autore}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Caricato il {formatDate(b.caricato_il)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDownload(b.id)}
                          disabled={busyId === b.id}
                          aria-label="Scarica"
                        >
                          {busyId === b.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => (isOpen ? setShareOpen(null) : openShare(b.id))}
                          aria-label="Condividi"
                          className={isOpen ? "text-primary" : ""}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(b.id, b.titolo)}
                          aria-label="Elimina"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-3 rounded-lg border bg-muted/40 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium">Condividi con un altro utente</p>
                          <button
                            onClick={() => setShareOpen(null)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Chiudi"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void submitShare(b.id);
                          }}
                          className="flex gap-2"
                        >
                          <Input
                            type="email"
                            required
                            placeholder="email@esempio.com"
                            value={shareEmail}
                            onChange={(e) => setShareEmail(e.target.value)}
                            className="h-9 text-sm"
                            disabled={shareBusy}
                          />
                          <Button type="submit" size="sm" disabled={shareBusy}>
                            {shareBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Invia"
                            )}
                          </Button>
                        </form>
                        {msg && (
                          <p
                            className={
                              msg.kind === "ok"
                                ? "text-xs text-emerald-600"
                                : "text-xs text-destructive"
                            }
                          >
                            {msg.text}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          Il destinatario deve avere già un account. Riceverà una copia del libro.
                        </p>
                      </div>
                    )}
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
