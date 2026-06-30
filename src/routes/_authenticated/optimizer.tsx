import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadEpub,
  normalizeEncoding,
  packEpub,
  setCover,
  getCoverDataUrl,
  type LoadedEpub,
} from "@/lib/epub";
import {
  detectChapters,
  applyChapters,
  type DetectedChapter,
} from "@/lib/chapters";
import { searchCovers, fetchCoverBytes, type CoverResult } from "@/lib/covers.functions";
import { saveProcessedEpub } from "@/lib/library.functions";
import { takePendingEpub } from "@/lib/pending-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ChevronLeft, ChevronDown, ChevronRight, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/optimizer")({
  head: () => ({
    meta: [
      { title: "Kobo ePub Optimizer" },
      {
        name: "description",
        content: "Anteprima ePub con opzioni di copertina, encoding e capitoli.",
      },
    ],
  }),
  component: Optimizer,
});

function Optimizer() {
  const navigate = useNavigate();
  const [epub, setEpubState] = useState<LoadedEpub | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // collapsible sections
  const [openCover, setOpenCover] = useState(false);
  const [openEncoding, setOpenEncoding] = useState(false);
  const [openChapters, setOpenChapters] = useState(false);

  // modification tracking
  const [coverChanged, setCoverChanged] = useState(false);
  const [encodingFixed, setEncodingFixed] = useState<number | null>(null);
  const [chaptersApplied, setChaptersApplied] = useState(false);

  const [covers, setCovers] = useState<CoverResult[] | null>(null);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [chapters, setChapters] = useState<DetectedChapter[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchCoversFn = useServerFn(searchCovers);
  const fetchCoverFn = useServerFn(fetchCoverBytes);
  const saveFn = useServerFn(saveProcessedEpub);

  useEffect(() => {
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    };
  }, [coverUrl]);

  const refreshCover = useCallback(async (e: LoadedEpub) => {
    const url = await getCoverDataUrl(e);
    setCoverUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy("Ispezione ePub…");
      setEncodingFixed(null);
      setCovers(null);
      setChapters(null);
      setCoverChanged(false);
      setChaptersApplied(false);
      setOpenCover(false);
      setOpenEncoding(false);
      setOpenChapters(false);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setOriginalBytes(bytes);
        setOriginalFile(file);
        const loaded = await loadEpub(new File([bytes as BlobPart], file.name, { type: file.type || "application/epub+zip" }));
        setEpubState(loaded);
        setSearchTitle(loaded.meta.title);
        setSearchAuthor(loaded.meta.author);
        await refreshCover(loaded);
        toast.success(`Caricato: ${loaded.meta.title}`);
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "ePub non valido");
      } finally {
        setBusy(null);
      }
    },
    [refreshCover],
  );

  // Pick up file passed from dashboard drop zone
  useEffect(() => {
    const pending = takePendingEpub();
    if (pending) void handleFile(pending);
  }, [handleFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const onFixEncoding = async () => {
    if (!epub) return;
    setBusy("Conversione in UTF-8…");
    try {
      const n = await normalizeEncoding(epub);
      setEncodingFixed(n);
      toast.success(`${n} file convertiti in UTF-8`);
    } finally {
      setBusy(null);
    }
  };

  const onDetectChapters = async () => {
    if (!epub) return;
    setBusy("Analisi capitoli…");
    try {
      const detected = await detectChapters(epub);
      setChapters(detected);
      toast.success(`${detected.filter((c) => c.selected).length}/${detected.length} capitoli pre-selezionati`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analisi fallita");
    } finally {
      setBusy(null);
    }
  };

  const toggleChapter = (id: string) => {
    setChapters((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)) : prev,
    );
  };

  const renameChapter = (id: string, title: string) => {
    setChapters((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, title } : c)) : prev,
    );
  };

  const onSearchCovers = async () => {
    setBusy("Ricerca copertine…");
    try {
      const res = await searchCoversFn({
        data: { title: searchTitle, author: searchAuthor },
      });
      setCovers(res);
      if (res.length === 0) toast.info("Nessuna copertina trovata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ricerca fallita");
    } finally {
      setBusy(null);
    }
  };

  const onPickCover = async (c: CoverResult) => {
    if (!epub) return;
    setBusy("Applicazione copertina…");
    try {
      const { base64, mime } = await fetchCoverFn({ data: { url: c.full } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await setCover(epub, bytes, mime);
      await refreshCover(epub);
      setCoverChanged(true);
      toast.success("Copertina aggiornata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile applicare la copertina");
    } finally {
      setBusy(null);
    }
  };

  const hasChanges =
    coverChanged || encodingFixed !== null || chaptersApplied;

  const onSave = async () => {
    if (!epub || !originalBytes || !originalFile) return;
    setBusy(hasChanges ? "Generazione ePub finale…" : "Caricamento…");
    try {
      let bytes: Uint8Array = originalBytes;

      if (hasChanges) {
        // Apply selected chapters now if the user picked any
        if (chapters) {
          const selected = chapters.filter((c) => c.selected);
          if (selected.length > 0) {
            await applyChapters(epub, selected);
          }
        }
        const blob = await packEpub(epub);
        bytes = new Uint8Array(await blob.arrayBuffer());
      }

      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const fileBase64 = btoa(bin);

      await saveFn({
        data: {
          titolo: searchTitle || epub.meta.title,
          autore: searchAuthor || epub.meta.author,
          fileName: originalFile.name,
          fileBase64,
          coverDataUrl: null,
          isModified: hasChanges,
        },
      });
      toast.success(hasChanges ? "ePub modificato salvato" : "ePub salvato così com'è");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Salvataggio fallito");
    } finally {
      setBusy(null);
    }
  };

  const applyChaptersNow = () => {
    setChaptersApplied(true);
    toast.success("Indice pronto: verrà applicato al salvataggio");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link to="/dashboard">
            <Button size="icon" variant="ghost" aria-label="Indietro">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Anteprima ePub</h1>
            <p className="text-xs text-muted-foreground">
              Salva così com'è oppure modifica copertina, encoding e indice.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {!epub && (
          <Card
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-accent/40" : "border-input"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="text-4xl">📚</div>
            <div className="font-medium">Trascina qui un file .epub</div>
            <div className="text-xs text-muted-foreground">oppure</div>
            <Button onClick={() => inputRef.current?.click()}>Scegli file</Button>
            <input
              ref={inputRef}
              type="file"
              accept=".epub,application/epub+zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </Card>
        )}

        {epub && (
          <>
            <Card className="p-4">
              <div className="flex gap-4">
                <div className="h-32 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                  {coverUrl ? (
                    <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No cover
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={searchTitle}
                    onChange={(e) => setSearchTitle(e.target.value)}
                    className="h-8 text-sm font-semibold"
                  />
                  <Input
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                    className="h-7 text-xs text-muted-foreground"
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {hasChanges ? (
                      <Badge>Modificato</Badge>
                    ) : (
                      <Badge variant="secondary">Originale</Badge>
                    )}
                    {epub.encodingIssues.length > 0 && encodingFixed === null && (
                      <Badge variant="destructive">
                        {epub.encodingIssues.length} file mojibake
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Collapsible: Cover */}
            <CollapsibleCard
              title="Copertina"
              hint={coverChanged ? "Sostituita" : "Mantieni l'originale"}
              open={openCover}
              onToggle={() => setOpenCover((v) => !v)}
              changed={coverChanged}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label htmlFor="t" className="text-xs">Titolo</Label>
                  <Input id="t" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="a" className="text-xs">Autore</Label>
                  <Input id="a" value={searchAuthor} onChange={(e) => setSearchAuthor(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={onSearchCovers} disabled={!!busy} className="w-full">
                    Cerca
                  </Button>
                </div>
              </div>
              {covers && covers.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 mt-3">
                  {covers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onPickCover(c)}
                      disabled={!!busy}
                      className="group relative overflow-hidden rounded-md border bg-muted transition active:scale-95"
                    >
                      <img
                        src={c.thumbnail}
                        alt={c.title ?? "cover"}
                        loading="lazy"
                        className="aspect-[2/3] w-full object-cover"
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1 text-[10px] uppercase">
                        {c.source === "openlibrary" ? "OL" : "GB"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CollapsibleCard>

            {/* Collapsible: Encoding */}
            <CollapsibleCard
              title="Encoding UTF-8"
              hint={
                encodingFixed !== null
                  ? `${encodingFixed} file riparati`
                  : epub.encodingIssues.length
                    ? `${epub.encodingIssues.length} file da riparare`
                    : "Encoding OK"
              }
              open={openEncoding}
              onToggle={() => setOpenEncoding((v) => !v)}
              changed={encodingFixed !== null}
            >
              <p className="text-xs text-muted-foreground mb-3">
                Riscrive tutto in UTF-8 e ripara mojibake (es. "perchÃ©" → "perché").
              </p>
              <Button size="sm" onClick={onFixEncoding} disabled={!!busy}>
                Ripara encoding
              </Button>
              {encodingFixed !== null && (
                <p className="mt-2 text-xs text-green-600">✓ {encodingFixed} file riscritti</p>
              )}
            </CollapsibleCard>

            {/* Collapsible: Chapters */}
            <CollapsibleCard
              title="Indice dei capitoli"
              hint={
                chapters
                  ? `${chapters.filter((c) => c.selected).length}/${chapters.length} selezionati`
                  : "Non analizzato"
              }
              open={openChapters}
              onToggle={() => setOpenChapters((v) => !v)}
              changed={chaptersApplied}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">
                  Le voci con 0 pagine (indice, sommario) sono pre-deselezionate.
                </p>
                <Button size="sm" onClick={onDetectChapters} disabled={!!busy}>
                  {chapters ? "Rianalizza" : "Analizza"}
                </Button>
              </div>

              {chapters && chapters.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessun capitolo individuato.</p>
              )}

              {chapters && chapters.length > 0 && (
                <>
                  <ul className="divide-y rounded-md border max-h-96 overflow-y-auto">
                    {chapters.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 p-2.5">
                        <input
                          type="checkbox"
                          checked={c.selected}
                          onChange={() => toggleChapter(c.id)}
                          className="mt-1.5 h-4 w-4 shrink-0 accent-primary"
                          aria-label="Seleziona capitolo"
                        />
                        <div className="min-w-0 flex-1">
                          {editingId === c.id ? (
                            <Input
                              autoFocus
                              value={c.title}
                              onChange={(e) => renameChapter(c.id, e.target.value)}
                              onBlur={() => setEditingId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") setEditingId(null);
                              }}
                              className="h-8 text-sm"
                            />
                          ) : (
                            <button
                              onClick={() => setEditingId(c.id)}
                              className="block w-full text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium">{c.title}</span>
                                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
                              </div>
                            </button>
                          )}
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span
                              className={`rounded px-1.5 py-0.5 ${
                                c.pageCount === 0 ? "bg-muted" : "bg-primary/10 text-primary"
                              }`}
                            >
                              {c.pageCount === 0 ? "0 pagine" : `~${c.pageCount} pag.`}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 uppercase">
                              {labelFor(c.source)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={applyChaptersNow}
                    disabled={chaptersApplied}
                  >
                    {chaptersApplied ? "Indice confermato ✓" : "Conferma indice"}
                  </Button>
                </>
              )}
            </CollapsibleCard>

            <div className="sticky bottom-3 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setEpubState(null);
                  setOriginalBytes(null);
                  setOriginalFile(null);
                  setCoverUrl(null);
                  setCovers(null);
                  setEncodingFixed(null);
                  setChapters(null);
                  setCoverChanged(false);
                  setChaptersApplied(false);
                }}
                disabled={!!busy}
              >
                Nuovo file
              </Button>
              <Button
                className="flex-1"
                onClick={onSave}
                disabled={!!busy}
              >
                {hasChanges ? "Salva modificato" : "Salva così com'è"}
              </Button>
            </div>
          </>
        )}

        {busy && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Card className="px-4 py-3 text-sm">{busy}</Card>
          </div>
        )}
      </main>
    </div>
  );
}

interface CollapsibleProps {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  changed: boolean;
  children: React.ReactNode;
}

function CollapsibleCard({ title, hint, open, onToggle, changed, children }: CollapsibleProps) {
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {changed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">
                modificato
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

function labelFor(source: DetectedChapter["source"]): string {
  switch (source) {
    case "heading": return "H";
    case "bold": return "B";
    case "keyword": return "KW";
    case "break": return "BR";
    case "toc": return "TOC";
    case "fallback": return "—";
  }
}
