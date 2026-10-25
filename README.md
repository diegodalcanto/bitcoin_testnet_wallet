# Testnet Wallet – Laboratorio Bitcoin

Wallet Bitcoin minimale **solo per reti di test** (Signet, Testnet4, Testnet3), per i laboratori didattici
nelle scuole del **Bitcoin Meetup Pisa** e dell'**Internet Festival**. È una Progressive Web App statica:
si apre da un link, si installa sulla schermata Home di iPhone e Android, non ha server propri e non chiede
configurazioni ai ragazzi. Le chiavi restano sul telefono; per leggere la blockchain e trasmettere le
transazioni usa API Esplora pubbliche (mempool.space, con Blockstream come riserva).

**App:** <https://diegodalcanto.github.io/bitcoin_testnet_wallet/> (attiva dopo la prima pubblicazione su `main`)

> I bitcoin di test non valgono nulla. Questo wallet rifiuta indirizzi e chiavi di Bitcoin vero e non va
> mai usato per custodire bitcoin veri: la frase di recupero è salvata in chiaro sul telefono.

Specifica completa: [`docs/SPEC.md`](docs/SPEC.md). Contenuti della lezione: [`docs/PRESENTAZIONE.md`](docs/PRESENTAZIONE.md).

---

## Per i ragazzi

1. **Installa l'app** dal link che ti danno i volontari.
   - **iPhone**: apri il link in **Safari** → tocca **Condividi** (il quadrato con la freccia) → **Aggiungi
     alla schermata Home** → apri *Testnet Wallet* dalla Home. Crea il wallet **dall'app installata**: su
     iPhone Safari e l'app hanno memorie separate.
   - **Android**: apri il link in **Chrome** → **Installa app** (oppure menu **⋮** → *Installa app*) → apri
     *Testnet Wallet* dalla Home.
2. Tocca **Crea nuovo wallet** e scrivi le **12 parole** su un foglio: sono la chiave del tuo wallet.
3. Tocca **Ricevi** e mostra il QR ai volontari: riceverai i sats di test per giocare.
4. A ogni domanda del quiz ogni risposta ha un suo QR. Per rispondere: **Invia** → **Scansiona QR** (o
   **Incolla** l'indirizzo) → scegli quanto puntare (**25%**, **50%**, **Tutto** o un importo) → **scorri per
   inviare**.
5. Puoi puntare subito anche i sats "in attesa di conferma": non serve aspettare il blocco.

Tocca le icone **i** per le spiegazioni e apri **Impara** per la guida a schede.

## Per i volontari

### Prima del laboratorio

- Preparate un wallet **"banca"** separato (ad esempio Sparrow o Electrum su Signet) con i sats presi dai
  faucet della rete scelta.
- Dividete in anticipo i fondi in tanti **UTXO confermati** quanti sono i premi da pagare.
- Preparate gli indirizzi delle risposte (A, B, C, D per ogni domanda) e i loro QR da mostrare a schermo intero.
- Controllate che tutti (ragazzi e volontari) siano sulla **stessa rete**: il badge in alto la mostra sempre
  (`SIGNET – soldi finti`).

### Regole per le transazioni non confermate

I nodi rifiutano gruppi troppo grandi di transazioni non confermate collegate tra loro: fino a Bitcoin Core 30
25 antenati e 25 discendenti per transazione, dalla 31.0 al massimo 64 transazioni e 101 kvB per ogni
"cluster" di transazioni collegate. Le reti di test hanno nodi con versioni miste, quindi vanno rispettati
entrambi. Il rischio non è la catena del singolo ragazzo, ma le transazioni che collegano tutta la classe in un
unico cluster. Per questo:

1. La transazione che distribuisce i fondi iniziali deve essere **confermata** prima della prima domanda:
   inviatela all'inizio della spiegazione.
2. I fondi arrivati agli indirizzi delle risposte **non si spendono** finché non sono confermati.
3. I premi si pagano dal wallet "banca", con **una transazione per vincitore**, ciascuna da un UTXO confermato
   preparato prima del laboratorio. Una sola transazione con molti vincitori unirebbe le loro catene in un
   cluster unico.

Con queste regole ogni ragazzo resta in un cluster suo, di poche transazioni.

### Durante il laboratorio

- Il wallet spende sempre **tutte** le monete insieme e rimanda il resto allo stesso indirizzo: ogni ragazzo
  ha una catena lineare e i premi si pagano all'indirizzo da cui è arrivata la puntata.
- Se un ragazzo vede **"Troppe transazioni in attesa"**, deve aspettare il prossimo blocco (l'app mostra da
  quanti minuti è arrivato l'ultimo).
- **Impostazioni → Mostra spiegazioni**: se attivo i box "i" sono già aperti; durante il gioco si può spegnere
  per una vista più pulita.
- La guida **Impara** (8 schede) segue la presentazione e si può usare per la spiegazione iniziale.

### Cambiare rete

Dalla Home, icona delle **Impostazioni** in alto a destra → **Rete**:

| Rete | Server | Quando usarla |
| --- | --- | --- |
| Signet (predefinita) | mempool.space/signet, riserva Blockstream | Sempre: blocchi regolari, niente riorganizzazioni |
| Testnet4 | mempool.space/testnet4, riserva Blockstream | Alternativa |
| Testnet3 | mempool.space/testnet, riserva Blockstream | Solo emergenza: rete deprecata e instabile |
| Personalizzata | URL Esplora inserito a mano (es. `https://…/signet/api`) | Un nodo/mempool vostro o un altro provider |

Per la rete personalizzata l'app prova il server e rifiuta quelli di mainnet. La chiave è la stessa su tutte le
reti di test (stesso indirizzo `tb1q…`), cambia solo il saldo. Cambiare rete azzera lo stato locale delle
transazioni in attesa.

### Problemi comuni

| Problema | Soluzione |
| --- | --- |
| La fotocamera non parte o il permesso è negato | Usare **Incolla**, oppure abilitare la fotocamera nelle impostazioni del browser |
| PIN dimenticato | "Ho dimenticato il PIN" cancella il wallet: si ripristina con le 12 parole |
| Dati del browser cancellati / app disinstallata | Il wallet si recupera solo con le 12 parole (Impostazioni → Ripristina wallet) |
| Su iPhone il wallet "è sparito" dopo l'installazione | Era stato creato in Safari: l'app installata ha una memoria separata |
| "Server non raggiungibile" o "Troppe richieste" | Tutta la classe esce dallo stesso IP: l'app rallenta da sola e usa il server di riserva; in caso estremo usare una rete personalizzata con un server vostro |
| "Nuova versione disponibile" | Aggiornare solo a fine laboratorio: l'app non si aggiorna mai da sola |

## Sviluppo

Requisiti: Node 22 o successivo.

```bash
npm ci              # dipendenze
npm run dev         # server di sviluppo: http://localhost:5173/bitcoin_testnet_wallet/
npm test            # unit test (Vitest)
npm run typecheck   # controllo dei tipi
npm run build       # build statica in dist/
npm run preview     # serve dist/
npm run test:e2e    # build + smoke test in Chromium con API Esplora simulate (serve `npx playwright install chromium`)
```

| Percorso | Contenuto |
| --- | --- |
| `src/config.ts` | Parametri: fee minima, soglia dust, polling, timeout, scadenze |
| `src/networks.ts`, `src/address.ts` | Reti, endpoint, validazione indirizzi (rifiuto mainnet), BIP21 |
| `src/wallet.ts` | Frase BIP39, derivazione BIP84 `m/84'/1'/0'/0/0`, WIF, tpub/vpub |
| `src/esplora.ts` | Client Esplora con endpoint di riserva |
| `src/tx.ts`, `src/pending.ts` | Costruzione e firma delle transazioni, stato locale delle transazioni non confermate |
| `src/state/`, `src/ui/` | Stato dell'app e interfaccia (Preact) |
| `src/i18n/it.ts` | **Tutti i testi**, comprese le spiegazioni didattiche: si correggono qui |
| `public/brand/`, `src/brand.ts` | Loghi (vedi `public/brand/README.md`) |
| `e2e/` | Smoke test nel browser |

## Pubblicazione su GitHub Pages

Ogni push su `main` esegue test e build e pubblica `dist/` su GitHub Pages
(`.github/workflows/deploy.yml`). La prima volta bisogna abilitare Pages nel repository:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

Il sito è pubblicato in `/<nome-repo>/`. Con un dominio personalizzato impostate la variabile del repository
`BASE_PATH` a `/` (Settings → Secrets and variables → Actions → Variables).
