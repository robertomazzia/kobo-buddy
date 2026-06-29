# Kobo: pagina 100% statica ES5 + endpoint pubblici

## Problema
Il browser del Kobo Aura HD / Clara BW ha un WebKit antico: non esegue React/ES6, e la pagina `/kobo` attuale (React + TanStack Router) resta bianca. Inoltre va rimosso il badge "Edit with Lovable" visibile sul Kobo.

## Strategia
Una singola pagina statica `public/kobo.html` (HTML4 + CSS inline + JS ES5 + `XMLHttpRequest`). Tutta la logica autenticazione/libreria/download è esposta via endpoint pubblici JSON sotto `/api/public/kobo/*`, così l'HTML non dipende più da `createServerFn` (che richiede payload/headers TanStack non banali da chiamare in ES5).

## Modifiche

### 1. Rimuovere badge Lovable
- Tramite `publish_settings--set_badge_visibility` → nascosto.

### 2. Eliminare la route React /kobo
- `rm src/routes/kobo.tsx` (il route tree si rigenera). Così `/kobo.html` non viene intercettato dal router SPA, e i vecchi link a `/kobo` reindirizzeranno tramite un redirect server route → `/kobo.html`.
- Aggiungere `src/routes/kobo.tsx` minimale che fa solo `<meta http-equiv="refresh" content="0;url=/kobo.html">` lato server, così chi digita `/kobo` finisce comunque sulla pagina statica. (In alternativa: server route `/api/public/kobo-redirect`. Scelta: meta refresh in una route SSR senza JS client.)

### 3. Endpoint pubblici JSON (`src/routes/api/public/kobo.*.ts`)
Tre server routes raw, tutte POST JSON, CORS aperto, nessuna middleware auth:

- `POST /api/public/kobo/redeem` — body `{pin}` → `{token}` o `{error}`. Usa la RPC esistente `redeem_kobo_pin` via client publishable.
- `POST /api/public/kobo/library` — body `{token}` → `{email, books:[{id,titolo,autore}]}`. Usa `kobo_session_owner` + `kobo_session_books`.
- `POST /api/public/kobo/download` — body `{token, ebookId}` → `{url, fileName}`. Riusa la logica di `getKoboDownloadUrl` (validazione token → signed URL via admin client, caricato con `await import("@/integrations/supabase/client.server")` dentro l'handler).

Queste route sostituiscono le chiamate client a `createServerFn` per il Kobo. Le server functions esistenti restano per eventuali altri usi ma non sono più sulla strada critica.

### 4. `public/kobo.html` — singola pagina ES5

Struttura:
```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>La tua libreria</title>
  <style>
    body { background:#fff; color:#000; font-family: serif; font-size:20px;
           margin:0; padding:20px; }
    h1 { font-size:28px; margin:0 0 20px 0; }
    .err { border:2px solid #000; padding:14px; margin-top:20px; }
    input.pin { font-family: monospace; font-size:32px; width:100%;
                padding:14px; border:2px solid #000; text-align:center;
                box-sizing:border-box; }
    button, a.btn { display:block; width:100%; padding:18px;
                    background:#000; color:#fff; border:2px solid #000;
                    font-size:22px; font-weight:bold; text-align:center;
                    text-decoration:none; margin-top:14px; box-sizing:border-box; }
    table.books { width:100%; border-collapse:collapse; }
    table.books td { border-top:2px solid #000; padding:14px 0;
                     vertical-align:middle; font-size:20px; }
    td.dl { width:140px; text-align:right; }
    a.dl { display:inline-block; padding:14px 18px; background:#000;
           color:#fff; text-decoration:none; font-weight:bold; }
  </style>
</head>
<body>
  <div id="root">Caricamento...</div>
  <script>/* ES5 only — see below */</script>
</body>
</html>
```

Logica JS (solo `var`, `function`, `XMLHttpRequest`, niente `Promise`/`fetch`/template literals):

- Variabile globale `var sessionToken = null;` — niente `localStorage` (alcuni browser Kobo lo disabilitano in modalità privacy).
- Bonus: tenta `try { sessionToken = localStorage.getItem('kobo_t'); } catch(e){}` in un blocco protetto; se non funziona, resta in memoria.
- `function render()` decide cosa mostrare in `#root`:
  - se `!sessionToken` → form PIN.
  - altrimenti → richiama `loadLibrary()` che mostra "Caricamento..." e poi la tabella o "Nessun libro disponibile".
- `function handlePin()` legge il valore, fa XHR POST a `/api/public/kobo/redeem`, su success salva token + tenta `localStorage.setItem`, ri-renderizza. Su errore valorizza `#error`. Ritorna `false` per bloccare il submit.
- `function loadLibrary()` XHR POST a `/api/public/kobo/library`. Per ogni libro genera una `<tr>` con titolo/autore e un link `a.dl` che chiama `requestDownload(id, this)`. Su token non valido → reset token, render PIN.
- `function requestDownload(id, anchor)` XHR POST a `/api/public/kobo/download`, alla risposta imposta `window.location.href = url`. Niente modali.
- Una piccola helper `function xhr(url, body, cb)` con `xhr.open('POST', url, true)`, `setRequestHeader('Content-Type','application/json')`, `xhr.onreadystatechange = function(){ if (xhr.readyState===4) cb(xhr.status, xhr.responseText) }`.
- `render()` viene chiamato `window.onload`.

### 5. Compatibilità hosting
- Vite serve `public/` come asset statici, e in produzione Cloudflare Workers serve gli asset statici prima del fallback SSR — quindi `/kobo.html` viene servito direttamente come file. Niente catch-all SPA da modificare (TanStack Start non ha un SPA fallback aggressivo: l'HTML statico vince).

## Dettagli tecnici
- Il bucket `ebooks` è privato (RLS per `auth.uid()`); non si può listare via REST anon. Per questo la lista passa dal nostro endpoint che valida `session_token` via RPC `SECURITY DEFINER` esistente.
- Il download usa una **signed URL** generata server-side: il browser del Kobo apre direttamente l'URL firmato (5 min) → download nativo del `.epub`, nessun JS coinvolto.
- Le RPC `redeem_kobo_pin`, `kobo_session_owner`, `kobo_session_books` sono già `SECURITY DEFINER` con grant a `anon` (lavoro fatto nei turni precedenti). Nessuna migrazione DB necessaria.
- Nessuna modifica a `App.tsx`/router config: solo aggiunta/eliminazione di file in `src/routes/`.
- `src/lib/kobo.functions.ts` e `src/lib/library.functions.ts` restano invariati; gli endpoint pubblici duplicano la logica essenziale (poche righe) per non passare per il transformer dei server fn.

## File toccati
- ❌ `src/routes/kobo.tsx` (rimosso, poi ricreato come redirect statico a `/kobo.html`)
- ➕ `public/kobo.html`
- ➕ `src/routes/api/public/kobo.redeem.ts`
- ➕ `src/routes/api/public/kobo.library.ts`
- ➕ `src/routes/api/public/kobo.download.ts`
- ⚙️ Badge Lovable nascosto tramite tool publish_settings.

## Non toccato
- Dashboard mobile, optimizer, schema DB, RLS, server functions esistenti.
