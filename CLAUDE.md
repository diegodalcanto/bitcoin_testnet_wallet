# CLAUDE.md – Wallet Testnet per laboratorio Bitcoin

PWA statica (Vite + TypeScript + Preact) pubblicata su GitHub Pages: un wallet Bitcoin minimale **solo
per reti di test**, usato nei laboratori nelle scuole (Bitcoin Meetup Pisa + Internet Festival).
I ragazzi la installano dal link, ricevono sats di test e li "puntano" sulle risposte dei quiz.

- Specifica completa: [`docs/SPEC.md`](docs/SPEC.md) – è la fonte di verità, leggila prima di cambiare
  comportamenti.
- Contenuti della presentazione usata in aula: [`docs/PRESENTAZIONE.md`](docs/PRESENTAZIONE.md) – i testi
  didattici dell'app devono restare coerenti con questa.

## Regole non negoziabili

1. **Mai mainnet.** Parametri `bitcoin.networks.testnet`, indirizzi `tb1q…` (BIP84, `m/84'/1'/0'/0/0`).
   Rifiutare indirizzi `bc1…`/`1…`/`3…`, WIF mainnet, `xprv`/`yprv`/`zprv`, server Esplora di mainnet
   (controllo del blocco genesi in `src/probe.ts`).
2. **Nessun backend proprio.** Chiavi, firma e costruzione delle transazioni avvengono solo nel
   browser; in rete si parla solo con API Esplora pubbliche via `fetch` (nessun SDK, nessun analytics).
3. **Fondi non confermati spendibili** (requisito critico, spec §5): UTXO dell'API (confermati e no)
   + output locali verso il proprio indirizzo − outpoint spesi localmente; voci locali eliminate quando
   l'API le riflette o dopo 30 minuti; stato separato per rete. Logica pura in `src/pending.ts`.
4. **Transazioni** (`src/tx.ts`): input = tutti gli UTXO spendibili (consolidamento), output =
   destinatario + resto allo stesso indirizzo; resto sotto la soglia dust (294 sat) → in fee; "Tutto" =
   un solo output; fee = `max(fastestFee, 2)` sat/vB; `nSequence = 0xffffffff`, niente RBF; firma PSBT
   con `witnessUtxo`.
5. **Testi in un solo posto.** Tutte le stringhe dell'interfaccia e le spiegazioni didattiche stanno in
   `src/i18n/it.ts` (italiano, linguaggio adatto alle superiori, niente gergo nei messaggi d'errore).
   Non scrivere testi per l'utente dentro i componenti.
6. **Parametri in un solo posto.** Fee minima, polling, soglia dust, timeout, scadenza delle voci locali
   ecc. stanno in `src/config.ts`.
7. **Importi in sats** come numeri interi; tBTC solo come equivalente piccolo. Formattazione in
   `src/format.ts` (locale `it-IT`).
8. **Rispetto dei limiti delle API:** una chiamata (`/utxo`) per aggiornamento, storico e blocco solo
   quando cambia qualcosa, polling 15 s con variazione casuale e solo con app in primo piano, attesa
   crescente dopo 429/errori, endpoint di riserva.
9. **Badge della rete sempre visibile** ("SIGNET – soldi finti"); loghi Meetup Pisa e Internet Festival
   (in `public/brand/`) nel benvenuto, nel piè di pagina della Home e in Info.
10. Su iOS il wallet si crea **solo nell'app installata** (Safari e app sulla Home hanno memorie
    separate).

## Comandi

```bash
npm ci              # installa le dipendenze (Node 22+)
npm run dev         # server di sviluppo (base /bitcoin_testnet_wallet/)
npm test            # unit test (Vitest)
npm run typecheck   # controllo dei tipi (TypeScript 7, tsc --noEmit)
npm run build       # build statica in dist/
npm run preview     # serve dist/ in locale
npm run test:e2e    # build + smoke test Playwright con API Esplora simulate (screenshot in e2e/screenshots/)
```

Prima di ogni commit: `npm run typecheck && npm test && npm run build`. Dopo modifiche all'interfaccia o
al flusso di invio: `npm run test:e2e` e guardare gli screenshot.

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `src/config.ts` | Parametri (fee, dust, polling, timeout, scadenza delle voci locali…) |
| `src/networks.ts` | Reti, endpoint con riserva, colori del badge, riconoscimento della catena dal blocco genesi |
| `src/address.ts` | Validazione indirizzi (rifiuto mainnet/regtest/Lightning) e URI BIP21 |
| `src/wallet.ts` | Frase BIP39, derivazione BIP84, WIF, `tpub`/`vpub`, ripristino, persistenza |
| `src/esplora.ts` | Client Esplora: riserva su rete/timeout/429/5xx, errori 4xx definitivi |
| `src/tx.ts` | Stima vsize/fee, dust, consolidamento, firma PSBT, classificazione errori di broadcast |
| `src/pending.ts` | Stato locale delle transazioni appena inviate e unione con gli UTXO dell'API |
| `src/history.ts`, `src/format.ts` | Storico visto dal proprio indirizzo, formattazione it-IT |
| `src/probe.ts` | Prova di un server Esplora personalizzato (rifiuta mainnet) |
| `src/storage.ts`, `src/ecc.ts`, `src/brand.ts` | localStorage sicuro, init secp256k1, elenco loghi |
| `src/state/` | Signals: impostazioni, wallet e dati di rete (`wallet.ts`), polling (`sync.ts`), invio con ritentativi (`send.ts`), PIN, PWA, router a hash, piattaforma |
| `src/ui/` | `App.tsx` (shell, header con badge, navigazione), `screens/` (una schermata per file), componenti comuni, `styles.css` |
| `src/i18n/it.ts` | Tutti i testi: `explain` (box "i"), `learnCards` (Impara), `t` (interfaccia) |
| `public/brand/` | Loghi (versione chiara e scura) |
| `public/icons/`, `public/favicon.svg` | Icone della PWA |
| `e2e/` | `mock-esplora.mjs` (Esplora finto che decodifica le tx) e `smoke.mjs` |

## Note di implementazione

- Polling: una chiamata `/address/:a/utxo` per aggiornamento; `/address/:a/txs` solo se le monete cambiano,
  ultimo blocco ogni 4 aggiornamenti o quando una moneta riceve la prima conferma (`src/state/sync.ts`).
- Invio (`src/state/send.ts`): fee troppo bassa → una volta con fee doppia; input spesi → ritrasmette le
  transazioni locali, scarta quelle in conflitto, ricarica e riprova una volta; errore di rete → controlla
  `/tx/:txid` prima di dire che è fallito (per non pagare due volte).
- Una voce locale è "riflessa" dall'API solo se l'API la conosce **e** nella stessa vista nessuna delle sue
  monete risulta ancora non spesa (protegge da server di riserva in ritardo).
- Su iOS non installata si mostra la guida all'installazione prima di creare il wallet.
- Messaggio d'errore del limite cluster di Core 31: la stringa esatta non è documentata; si riconosce
  `too-long-mempool-chain` o qualsiasi testo che contenga "cluster".

## Librerie (versioni verificate a ottobre 2026)

- `bitcoinjs-lib` 7 usa `Uint8Array` e importi `bigint` (`witnessUtxo.value` è `bigint`): **nessun
  polyfill `Buffer`**. Convertire sempre con `BigInt(sats)` / `Number(value)`.
- `ecpair` 3 + `@bitcoinerlab/secp256k1` 2 (JS puro, niente WASM).
- `@scure/bip39` / `@scure/bip32` 2 (solo ESM).
- `qr-scanner` per leggere i QR (funziona su Safari iOS), `qrcode` per generarli.
- `vite-plugin-pwa` 2 con `registerType: 'prompt'`: mai aggiornare l'app in silenzio a metà laboratorio.
- Preact 11 + `@preact/signals` 2, JSX trasformato da Vite 8 (Oxc) leggendo `jsxImportSource` dal tsconfig
  (nessun `@preact/preset-vite`). `useRef` richiede sempre un valore iniziale.
- Target di build: Safari 15 / Chrome 100 (iPhone non recentissimi): niente API più nuove senza ripiego.

## Convenzioni

- Commit piccoli e descrittivi, in italiano.
- Test Vitest accanto ai moduli (`src/*.test.ts`); la logica Bitcoin va sempre coperta da test,
  inclusi vettori noti (WIF/frase → indirizzo atteso).
- Niente grafica presa da wallet commerciali; colore principale arancio Bitcoin, tema chiaro e scuro.
- Deploy: push su `main` → GitHub Actions → GitHub Pages (`base` di Vite = `/bitcoin_testnet_wallet/`,
  sovrascrivibile con la variabile `BASE_PATH`).
