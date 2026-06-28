import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { searchCovers, fetchCoverBytes, type CoverResult } from "@/lib/covers.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/optimizer")({
  head: () => ({
    meta: [
      { title: "Kobo ePub Optimizer" },
      {
        name: "description",
        content:
          "Carica, ottimizza e ripara i tuoi ePub per Kobo: correzione encoding e copertine da Open Library e Google Books.",
      },
      { property: "og:title", content: "Kobo ePub Optimizer" },
      {
        property: "og:description",
        content: "Correggi accenti, sostituisci copertine e prepara i tuoi ePub per Kobo.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [epub, setEpubState] = useState<LoadedEpub | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [encodingFixed, setEncodingFixed] = useState<number | null>(null);
  const [covers, setCovers] = useState<CoverResult[] | null>(null);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchCoversFn = useServerFn(searchCovers);
  const fetchCoverFn = useServerFn(fetchCoverBytes);

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
      try {
        const loaded = await loadEpub(file);
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
      toast.success("Copertina aggiornata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile applicare la copertina");
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    if (!epub) return;
    setBusy("Generazione ePub…");
    try {
      const blob = await packEpub(epub);
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = epub.fileName.replace(/\.epub$/i, "") + ".kobo.epub";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Kobo ePub Optimizer</h1>
          <p className="text-xs text-muted-foreground">
            Correggi encoding, sostituisci copertine, pronto per Kobo.
          </p>
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
                  <div className="truncate text-sm font-semibold">{epub.meta.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{epub.meta.author}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant={epub.meta.coverPath ? "default" : "destructive"}>
                      {epub.meta.coverPath ? "Cover presente" : "Cover mancante"}
                    </Badge>
                    <Badge variant={epub.encodingIssues.length ? "destructive" : "secondary"}>
                      {epub.encodingIssues.length
                        ? `${epub.encodingIssues.length} file con problemi`
                        : "Encoding OK"}
                    </Badge>
                    {epub.meta.language && (
                      <Badge variant="outline">{epub.meta.language}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Encoding</div>
                  <div className="text-xs text-muted-foreground">
                    Converte tutto in UTF-8 e ripara mojibake (perchÃ© → perché).
                  </div>
                </div>
                <Button size="sm" onClick={onFixEncoding} disabled={!!busy}>
                  Ripara
                </Button>
              </div>
              {epub.encodingIssues.length > 0 && encodingFixed === null && (
                <div className="rounded-md bg-muted/50 p-2 text-xs">
                  <div className="mb-1 font-medium">Esempi rilevati:</div>
                  <ul className="space-y-0.5">
                    {epub.encodingIssues.slice(0, 4).map((i) => (
                      <li key={i.path} className="truncate">
                        <span className="text-muted-foreground">{i.path.split("/").pop()}:</span>{" "}
                        <code className="text-destructive">{i.samples.join(", ")}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {encodingFixed !== null && (
                <div className="text-xs text-green-600">
                  ✓ {encodingFixed} file riscritti in UTF-8
                </div>
              )}
            </Card>

            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">Copertina</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label htmlFor="t" className="text-xs">
                    Titolo
                  </Label>
                  <Input
                    id="t"
                    value={searchTitle}
                    onChange={(e) => setSearchTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="a" className="text-xs">
                    Autore
                  </Label>
                  <Input
                    id="a"
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={onSearchCovers} disabled={!!busy} className="w-full">
                    Cerca
                  </Button>
                </div>
              </div>

              {covers && covers.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
            </Card>

            <div className="sticky bottom-3 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setEpubState(null);
                  setCoverUrl(null);
                  setCovers(null);
                  setEncodingFixed(null);
                }}
                disabled={!!busy}
              >
                Nuovo file
              </Button>
              <Button className="flex-1" onClick={onDownload} disabled={!!busy}>
                Scarica .epub
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

// silence unused warning
void useRouter;
