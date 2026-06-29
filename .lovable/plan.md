## Diagnosi

I log server mostrano la causa esatta dell'errore con PIN corretto:

```text
function gen_random_bytes(integer) does not exist
```

Quindi il PIN è valido, ma la funzione database `redeem_kobo_pin` fallisce quando prova a generare il `session_token`. Per questo la pagina Kobo riceve il messaggio generico "Errore durante la verifica".

## Piano di correzione

1. **Correggere la funzione database `redeem_kobo_pin`**
   - Sostituire la generazione token basata su `gen_random_bytes(32)` con una generazione compatibile con il database attuale.
   - Mantenere invariato il comportamento: PIN 4 caratteri, scadenza, uso una sola volta, aggiornamento di `session_token`, azzeramento `pin_scadenza`.

2. **Rendere l'endpoint `/api/public/kobo/redeem` più robusto**
   - Lasciare messaggi utente semplici per Kobo.
   - Migliorare il log tecnico lato server per eventuali errori futuri senza mostrare dettagli sensibili al Kobo.
   - Verificare che un PIN vecchio continui a restituire "PIN non valido o scaduto".

3. **Verificare il flusso reale end-to-end**
   - Testare l'endpoint con PIN non valido.
   - Generare/identificare un PIN valido nel database di test e verificare che l'endpoint ritorni un `token`.
   - Verificare che `/api/public/kobo/library` accetti il token e non fallisca subito.

4. **Non modificare la UI Kobo salvo necessità**
   - La pagina statica ES5 `public/kobo.html` è coerente con il requisito Kobo; il problema attuale è lato backend/database, non React o JavaScript moderno.

## Risultato atteso

- PIN scaduto/errato: messaggio chiaro "PIN non valido o scaduto".
- PIN valido: pairing completato, token salvato, passaggio automatico alla lista libri.
- Nessun nuovo errore generico durante la verifica.