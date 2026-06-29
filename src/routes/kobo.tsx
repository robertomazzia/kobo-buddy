import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  redeemKoboPin,
  getKoboSession,
  type KoboSession,
} from "@/lib/kobo.functions";
import { getKoboDownloadUrl, STATUS_READY } from "@/lib/library.functions";

const STORAGE_KEY = "kobo_session_token";

export const Route = createFileRoute("/kobo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kobo – La tua libreria" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: KoboPage,
});

function KoboPage() {
  const redeem = useServerFn(redeemKoboPin);
  const fetchSession = useServerFn(getKoboSession);
  const fetchDownload = useServerFn(getKoboDownloadUrl);

  const [token, setToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<KoboSession | null>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (t) {
      setToken(t);
      loadSession(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSession(t: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetchSession({ data: { token: t } });
      if ("error" in res) {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setError(res.error);
      } else {
        setSession(res);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await redeem({ data: { pin } });
      if ("error" in res) {
        setError(res.error);
      } else {
        localStorage.setItem(STORAGE_KEY, res.token);
        setToken(res.token);
        await loadSession(res.token);
      }
    } catch {
      setError("Errore di rete");
    } finally {
      setBusy(false);
    }
  }

  function unpair() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setSession(null);
    setPin("");
  }

  async function downloadBook(id: string) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetchDownload({ data: { token, ebookId: id } });
      if ("error" in res) {
        setError(res.error);
      } else {
        // Trigger download on the Kobo browser
        window.location.href = res.url;
      }
    } catch {
      setError("Errore durante il download");
    } finally {
      setBusy(false);
    }
  }

  // E-Ink rules: pure white background, pure black text, no gradients/animations.
  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "#ffffff",
    color: "#000000",
    fontFamily: "Georgia, 'Times New Roman', serif",
    padding: "40px 24px",
    maxWidth: 900,
    margin: "0 auto",
  };

  if (!token) {
    return (
      <div style={page}>
        <h1 style={{ fontSize: 44, fontWeight: 700, marginBottom: 24, margin: 0 }}>
          Accoppia il Kobo
        </h1>
        <p style={{ fontSize: 22, lineHeight: 1.4, margin: "20px 0 32px" }}>
          Inserisci il codice PIN mostrato sul tuo telefono per collegare questo
          dispositivo alla tua libreria.
        </p>
        <form onSubmit={submitPin}>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase())}
            maxLength={4}
            autoFocus
            placeholder="XC54"
            style={{
              width: "100%",
              fontSize: 64,
              padding: "20px 24px",
              border: "3px solid #000",
              background: "#fff",
              color: "#000",
              letterSpacing: 12,
              textAlign: "center",
              fontFamily: "monospace",
              marginBottom: 24,
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            style={{
              width: "100%",
              fontSize: 28,
              padding: "20px 24px",
              background: "#000",
              color: "#fff",
              border: "3px solid #000",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {busy ? "Verifica in corso..." : "Conferma PIN"}
          </button>
        </form>
        {error && (
          <p style={{ fontSize: 22, marginTop: 24, border: "2px solid #000", padding: 16 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const readyBooks = (session?.books ?? []).filter((b) => b.status === STATUS_READY);

  return (
    <div style={page}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 24,
          borderBottom: "3px solid #000",
          paddingBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 38, fontWeight: 700, margin: 0 }}>La tua libreria</h1>
        <button
          onClick={unpair}
          style={{
            fontSize: 18,
            background: "#fff",
            color: "#000",
            border: "2px solid #000",
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          Disconnetti
        </button>
      </div>

      {session?.email && (
        <p style={{ fontSize: 18, margin: "0 0 24px 0" }}>
          Collegato come <strong>{session.displayName || session.email}</strong>
        </p>
      )}

      {busy && <p style={{ fontSize: 22 }}>Caricamento...</p>}

      {session && readyBooks.length === 0 && !busy && (
        <p style={{ fontSize: 22 }}>
          Nessun ePub pronto. Ottimizza un libro dal telefono e tornerà qui in stato
          "{STATUS_READY}".
        </p>
      )}

      {readyBooks.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {readyBooks.map((b) => (
            <li
              key={b.id}
              style={{
                borderTop: "2px solid #000",
                padding: "24px 0",
                display: "flex",
                gap: 20,
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {b.titolo}
                  {b.autore ? (
                    <span style={{ fontWeight: 400 }}> — {b.autore}</span>
                  ) : null}
                </p>
              </div>
              <button
                onClick={() => downloadBook(b.id)}
                disabled={busy}
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  background: "#000",
                  color: "#fff",
                  border: "3px solid #000",
                  padding: "20px 32px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  letterSpacing: 2,
                }}
              >
                DOWNLOAD
              </button>
            </li>
          ))}
          <li style={{ borderTop: "2px solid #000" }} />
        </ul>
      )}

      {error && (
        <p style={{ fontSize: 20, marginTop: 24, border: "2px solid #000", padding: 16 }}>
          {error}
        </p>
      )}
    </div>
  );
}
