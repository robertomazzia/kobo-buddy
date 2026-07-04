## Contesto

- Esiste una whitelist (`allowed_users`) verificata dopo il login tramite `is_email_allowed`. Se l'email non è presente, l'utente vede "Accesso non autorizzato" — è quello che sta succedendo a `ilaria.solaini@gmail.com`.
- Ogni utente ha già la propria libreria isolata (RLS su `ebooks`, `profiles`, `kobo_devices` scopato a `auth.uid()`). Nessun cambiamento necessario lato multi-utente.

## Piano

### 1. Sblocca Ilaria
Inserisco `ilaria.solaini@gmail.com` nella tabella `allowed_users`. Al prossimo caricamento della pagina entrerà nell'app senza modifiche di codice.

### 2. Ruolo admin
- Creo enum `app_role` (`admin`, `user`) e tabella `user_roles(user_id, role)` con RLS e la funzione `has_role(_user_id, _role)` SECURITY DEFINER (pattern anti-recursione).
- Assegno il ruolo `admin` al tuo account (mi serve la tua email per il seed — vedi domanda sotto).
- Aggiungo GRANT corretti (`authenticated` SELECT su `user_roles`, `service_role` ALL).

### 3. Policy sulla whitelist
- `allowed_users` oggi non ha nessuna policy SELECT/INSERT/DELETE (accesso solo via RPC SECURITY DEFINER).
- Aggiungo policy scoped agli admin:
  - SELECT/INSERT/DELETE su `allowed_users` **solo se** `has_role(auth.uid(), 'admin')`.
- Aggiungo GRANT `SELECT, INSERT, DELETE ON allowed_users TO authenticated` (le policy limitano comunque ai soli admin).

### 4. Pagina admin `/admin/whitelist`
- Nuovo file `src/routes/_authenticated/admin.whitelist.tsx` (protetto dal layout esistente).
- `beforeLoad` extra: chiama `has_role` via RPC; se non admin → redirect a `/dashboard` (o mostra "Non autorizzato").
- UI minima coerente col design attuale (shadcn `Card`, `Input`, `Button`, `Table`):
  - Lista email autorizzate con pulsante "Rimuovi".
  - Form "Aggiungi email" + campo opzionale nota.
  - Toast di conferma/errore.
- Link discreto alla pagina admin nel menu utente / dashboard, visibile solo se `has_role('admin')`.

### 5. Nessuna modifica a
- Logica Kobo, edge functions, RLS di `ebooks`/`profiles`/`kobo_devices`.
- Flusso auth Google e layout `_authenticated`.

## Domanda prima di procedere
Qual è la tua email admin da seedare in `user_roles`? (immagino l'owner attuale del progetto — confermami l'indirizzo esatto così faccio partire la migration corretta).
