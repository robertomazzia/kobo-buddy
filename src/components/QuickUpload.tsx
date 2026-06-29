import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Check } from "lucide-react";
import { toast } from "sonner";
import { loadEpub } from "@/lib/epub";
import { saveProcessedEpub } from "@/lib/library.functions";

interface Props {
  onUploaded?: () => void;
}

export function QuickUpload({ onUploaded }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const save = useServerFn(saveProcessedEpub);

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.epub$/i.test(file.name) && file.type !== "application/epub+zip") {
        toast.error("Seleziona un file .epub");
        return;
      }
      setBusy("Lettura metadati…");
      try {
        // Extract title/author without modifying the file
        let titolo = file.name.replace(/\.epub$/i, "");
        let autore = "";
        try {
          const loaded = await loadEpub(file);
          titolo = loaded.meta.title || titolo;
          autore = loaded.meta.author || "";
        } catch {
          /* ignore metadata failure, keep filename */
        }

        setBusy("Caricamento…");
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          bin += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        const fileBase64 = btoa(bin);

        await save({
          data: {
            titolo,
            autore,
            fileName: file.name,
            fileBase64,
            coverDataUrl: null,
          },
        });
        setDoneName(titolo);
        toast.success("ePub caricato e pronto per Kobo");
        onUploaded?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Caricamento fallito");
      } finally {
        setBusy(null);
      }
    },
    [save, onUploaded],
  );

  return (
    <Card
      className={`p-5 text-center space-y-3 transition-colors ${
        dragOver ? "border-primary bg-accent/40" : ""
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
        if (f) void handleFile(f);
      }}
    >
      <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
        {doneName ? (
          <Check className="h-6 w-6 text-primary" />
        ) : (
          <Upload className="h-6 w-6 text-primary" />
        )}
      </div>
      <div>
        <h2 className="font-semibold">Carica così com'è</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Aggiungi un ePub alla libreria senza modifiche, pronto per il Kobo.
        </p>
      </div>
      <Button
        className="w-full"
        variant="outline"
        disabled={!!busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ?? "Scegli file .epub"}
      </Button>
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
      {doneName && (
        <p className="text-xs text-muted-foreground">
          Ultimo caricato: <span className="font-medium">{doneName}</span>
        </p>
      )}
    </Card>
  );
}
