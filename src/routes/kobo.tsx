import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { redeemKoboPin, getKoboSession, type KoboSession } from "@/lib/kobo.functions";

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

  // E-Ink styles: white bg, black text, large, no animations.
  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "#ffffff",
    color: "#000000",
    fontFamily: "Georgia, 'Times New Roman', serif",
    padding: "40px 32px",
    maxWidth: 900,
    margin: "0 auto",
  };

  if (!token) {
    return (
      <div style={page}>
        <h1 style={{ fontSize: 44, fontWeight: 700, marginBottom: 24 }}>Accoppia il Kobo</h1>
        <p style={{ fontSize: 24, lineHeight: 1.4, marginBottom: 32 }}>
          Inserisci il codice PIN mostrato sul tuo telefono per collegare questo dispositivo
          alla tua libreria.
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

  return (
    <div style={page}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 32,
          borderBottom: "3px solid #000",
          paddingBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 40, fontWeight: 700, margin: 0 }}>La tua libreria</h1>
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
        <p style={{ fontSize: 20, marginBottom: 32 }}>
          Collegato come <strong>{session.displayName || session.email}</strong>
        </p>
      )}

      {busy && <p style={{ fontSize: 22 }}>Caricamento...</p>}

      {session && session.books.length === 0 && (
        <p style={{ fontSize: 24 }}>Nessun ePub nella tua libreria.</p>
      )}

      {session && session.books.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {session.books.map((b) => (
            <li
              key={b.id}
              style={{
                borderTop: "1px solid #000",
                padding: "20px 0",
                display: "flex",
                gap: 20,
              }}
            >
              {b.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.coverUrl}
                  alt=""
                  style={{ width: 80, height: 120, objectFit: "cover", border: "1px solid #000" }}
                />
              ) : (
                <div
                  style={{
                    width: 80,
                    height: 120,
                    border: "1px solid #000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  ePub
                </div>
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{b.titolo}</p>
                {b.autore && (
                  <p style={{ fontSize: 20, margin: "6px 0 0 0" }}>{b.autore}</p>
                )}
                <p style={{ fontSize: 16, margin: "8px 0 0 0" }}>Stato: {b.status}</p>
              </div>
            </li>
          ))}
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
