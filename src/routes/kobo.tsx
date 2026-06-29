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
      { title: "Kobo - La tua libreria" },
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (t) {
      setToken(t);
      loadSession(t);
    } else {
      setReady(true);
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
    } catch {
      setError("Errore di rete");
    } finally {
      setBusy(false);
      setReady(true);
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
    setError("");
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
        window.location.href = res.url;
      }
    } catch {
      setError("Errore durante il download");
    } finally {
      setBusy(false);
    }
  }

  // Schermata A: inserimento PIN
  if (!token) {
    return (
      <div className="bg-white text-black min-h-screen p-6">
        <h1 className="text-4xl font-bold mb-6">Accoppia il Kobo</h1>
        <p className="text-2xl mb-6">
          Inserisci il codice PIN mostrato sul telefono per collegare questo
          dispositivo alla tua libreria.
        </p>
        <form onSubmit={submitPin}>
          <label htmlFor="pin" className="block text-2xl mb-2">
            Codice PIN
          </label>
          <input
            id="pin"
            name="pin"
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase())}
            maxLength={4}
            autoFocus
            placeholder="XC54"
            className="block w-full text-5xl p-4 border-2 border-black bg-white text-black text-center mb-6"
            style={{ letterSpacing: "0.5em", fontFamily: "monospace" }}
          />
          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="block w-full text-3xl font-bold p-5 border-2 border-black bg-black text-white"
          >
            {busy ? "Verifica..." : "Conferma PIN"}
          </button>
        </form>
        {error && (
          <p className="text-2xl mt-6 border-2 border-black p-4">{error}</p>
        )}
      </div>
    );
  }

  // Schermata B: libreria
  const readyBooks = (session?.books ?? []).filter(
    (b) => b.status === STATUS_READY,
  );

  return (
    <div className="bg-white text-black min-h-screen p-6">
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-4xl font-bold mb-2">La tua libreria</h1>
        {session?.email && (
          <p className="text-xl">
            Collegato come {session.displayName || session.email}
          </p>
        )}
        <p className="mt-3">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              unpair();
            }}
            className="text-xl underline"
          >
            [Esci]
          </a>
        </p>
      </div>

      {!ready || busy ? (
        <p className="text-2xl">Caricamento...</p>
      ) : null}

      {ready && session && readyBooks.length === 0 && !busy && (
        <p className="text-2xl">
          Nessun ePub pronto. Ottimizza un libro dal telefono e tornera qui in
          stato "{STATUS_READY}".
        </p>
      )}

      {readyBooks.length > 0 && (
        <ul className="list-none p-0 m-0">
          {readyBooks.map((b) => (
            <li
              key={b.id}
              className="border-t-2 border-black py-5 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold m-0">
                  {b.titolo}
                  {b.autore ? (
                    <span className="font-normal"> - {b.autore}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadBook(b.id)}
                disabled={busy}
                className="text-2xl font-bold bg-black text-white border-2 border-black px-6 py-4"
              >
                DOWNLOAD
              </button>
            </li>
          ))}
          <li className="border-t-2 border-black" />
        </ul>
      )}

      {error && (
        <p className="text-xl mt-6 border-2 border-black p-4">{error}</p>
      )}
    </div>
  );
}
