# Specifica – Wallet Testnet per laboratorio Bitcoin

@Diego

## 1. Contesto e obiettivi

Costruire un wallet Bitcoin minimale, solo per reti di test, da usare nei laboratori educativi nelle scuole. Deve funzionare su iOS e Android senza store, senza server propri e senza configurazione da parte dei ragazzi.

**Come si svolge il gioco**

1. I volontari spiegano cos'è Bitcoin e come funziona.
2. Ogni ragazzo apre il link, installa l'app sulla schermata Home e ottiene subito un wallet con il suo indirizzo.
3. I volontari inviano a ogni ragazzo una dotazione iniziale di bitcoin di test.
4. Per ogni domanda vengono mostrate più risposte, ciascuna con un proprio indirizzo e QR code.
5. Il ragazzo punta tutto o parte del saldo inviando sats all'indirizzo della risposta scelta, inquadrando il QR o incollando l'indirizzo.
6. Chi indovina si divide il totale delle puntate. Le domande si susseguono a pochi minuti di distanza.

**Requisito critico:** ricevere e rispendere fondi **non ancora confermati**, perché tra una domanda e l'altra non c'è tempo di aspettare un blocco.

**Fuori ambito:** mainnet, multi-account, Lightning, sicurezza di livello produttivo. Il wallet deve essere impossibile da usare su mainnet.

## 2. Architettura e stack

Progressive Web App (PWA) completamente statica, pubblicata su GitHub Pages. Nessun backend proprio: chiavi, firma e costruzione delle transazioni avvengono sul telefono; per leggere la blockchain e trasmettere le transazioni si usano API Esplora pubbliche, configurabili.

| Componente | Scelta | Note |
| --- | --- | --- |
| Build | Vite + TypeScript | Output statico in `dist/` |
| UI | Preact o vanilla TS | Bundle piccolo, nessun framework pesante |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, cache offline dell'app |
| Bitcoin | `bitcoinjs-lib` + `ecpair` + `@bitcoinerlab/secp256k1` | secp256k1 in puro JS, niente WASM; @scure/bip39 e @scure/bip32 per frase di recupero e derivazione; aggiungere polyfill `Buffer` solo se la versione di bitcoinjs-lib lo richiede |
| QR lettura | `qr-scanner` (Nimiq) | Funziona su Safari iOS; `BarcodeDetector` nativo non c'è su iOS |
| QR generazione | `qrcode` | Rendering su canvas o SVG |
| Rete | `fetch` verso API Esplora | Nessun SDK esterno |
| Deploy | GitHub Actions → GitHub Pages | Impostare `base` di Vite sul nome del repository |

**Struttura proposta del codice**

- `src/networks.ts` – definizione delle reti e degli endpoint
- `src/wallet.ts` – generazione chiave, indirizzo, persistenza
- `src/esplora.ts` – client API (saldo, UTXO, broadcast, fee)
- `src/tx.ts` – selezione UTXO, costruzione e firma transazioni
- `src/pending.ts` – stato locale delle transazioni appena inviate
- `src/ui/` – schermate
- `src/i18n/it.ts` – testi dell'interfaccia e spiegazioni didattiche, centralizzati; loghi nella cartella public/brand/

## 3. Reti e backend

Signet è la rete predefinita; le altre si scelgono da un menu Impostazioni nascosto (vedi sezione 6). Tutte usano i parametri `bitcoin.networks.testnet` di bitcoinjs-lib e indirizzi `tb1…`, quindi la stessa chiave funziona su ogni rete: cambia solo il saldo.

| Rete | Endpoint Esplora predefinito | Ruolo |
| --- | --- | --- |
| Signet | `https://mempool.space/signet/api` | Predefinita: blocchi regolari, niente riorganizzazioni |
| Testnet4 | `https://mempool.space/testnet4/api` | Alternativa |
| Testnet3 | `https://mempool.space/testnet/api` | Solo emergenza, rete deprecata e instabile |
| Personalizzata | URL inserito a mano | Per un nodo/mempool proprio o un altro provider |

**Requisiti**

- Ogni rete può avere un endpoint di riserva (es. Blockstream per Testnet3 e Signet, da verificare). Se il primario fallisce, il client riprova sul secondario.
- La rete scelta e l'eventuale URL personalizzato si salvano in `localStorage`.
- Al cambio rete si azzera lo stato locale delle transazioni pendenti (sezione 5) e si ricarica il saldo.
- Rifiutare qualsiasi indirizzo che non sia di rete test (`bc1`, `1…`, `3…`), con messaggio chiaro.
- Il nome della rete attiva è sempre visibile in alto, con un colore diverso per rete.

**Endpoint Esplora usati**

- `GET /address/:addr` – saldo confermato (`chain_stats`) e in mempool (`mempool_stats`)
- `GET /address/:addr/utxo` – UTXO, inclusi quelli non confermati (`status.confirmed: false`)
- `GET /address/:addr/txs` – storico (prime 25 transazioni, comprese quelle in mempool)
- `GET /tx/:txid/hex` – transazione grezza, se servisse
- `POST /tx` – broadcast, corpo = hex della transazione, risposta = txid
- `GET /v1/fees/recommended` – fee consigliate (specifico mempool.space, opzionale; fallback a valore fisso)

## 4. Chiave e indirizzo

Le chiavi si gestiscono come in un wallet vero (frase di recupero BIP39, derivazione BIP84), ma con un solo indirizzo di ricezione `tb1q…`, riusato. Il riuso è voluto: semplifica tutto e permette ai volontari di pagare i vincitori all'indirizzo da cui è arrivata la puntata.

- **Creazione:** 128 bit casuali da `crypto.getRandomValues` → frase di recupero di 12 parole BIP39 (lista inglese standard).
- **Derivazione:** BIP84 per reti di test, percorso `m/84'/1'/0'/0/0` → chiave privata, chiave pubblica, indirizzo P2WPKH.
- **Onboarding:** scelta tra "Crea nuovo wallet" e "Ripristina". Alla creazione si mostrano le 12 parole con la spiegazione di cosa sono, poi si chiede di confermarne 2 a caso. Un pulsante "Salta" consente ai volontari di accelerare in aula.
- **Persistenza:** frase in `localStorage` in chiaro (accettabile per reti di test, spiegato nell'app); `navigator.storage.persist()` per ridurre il rischio di cancellazione.
- **PIN facoltativo** a 4 cifre per aprire l'app: dà realismo, ma nell'app si spiega che qui è solo dissuasivo e non cifra i dati.
- **Ripristino** da 12 parole o da WIF di rete test; conferma prima di sovrascrivere. **Nuovo wallet** con doppia conferma.
- **Esportazione:** frase, WIF e chiave pubblica estesa (`tpub`/`vpub`) visibili nella schermata "Le mie chiavi" (sezione 6).
- Rifiutare chiavi di mainnet (WIF mainnet, `xprv`/`zprv`).
- Avviso educativo fisso: le stesse 12 parole funzionerebbero anche su mainnet, quindi non vanno mai usate per bitcoin veri.

## 5. Spesa di fondi non confermati (requisito critico)

Il wallet considera spendibili tutti gli UTXO, confermati o no, e tiene uno stato locale delle proprie transazioni appena inviate, così una nuova puntata parte subito anche se l'API non si è ancora aggiornata.

**Saldo**

- Saldo mostrato = somma degli UTXO spendibili (vedi sotto), con dettaglio "confermati" e "in attesa di conferma".
- Calcolarlo dalla lista UTXO, non da `/address`, per fare una sola chiamata per aggiornamento.

**Insieme degli UTXO spendibili**

1. UTXO restituiti da `GET /address/:addr/utxo` (confermati e non).
2. Più gli output verso il proprio indirizzo delle transazioni inviate localmente (tipicamente il resto), marcati come non confermati.
3. Meno gli outpoint già spesi da transazioni inviate localmente.
4. Le voci locali si eliminano quando l'API le riflette o dopo 30 minuti.
5. Lo stato locale sta in `localStorage`, separato per rete.

**Costruzione della transazione**

- Input: tutti gli UTXO spendibili (consolidamento a ogni invio). Mantiene un solo UTXO di resto e una catena lineare, semplice da gestire.
- Output: destinatario + resto allo stesso indirizzo. Se il resto è sotto 294 sat (soglia dust P2WPKH) va in fee.
- Pulsante **Tutto**: un solo output al destinatario, importo = saldo − fee.
- Fee: `max(fastestFee da /v1/fees/recommended, 2)` sat/vB; fallback 2 sat/vB se l'endpoint non risponde. Stima vsize P2WPKH ≈ 11 + 68·input + 31·output.
- Firma con `Psbt` di bitcoinjs-lib usando `witnessUtxo` (valore + script), senza scaricare le transazioni precedenti.
- `nSequence = 0xffffffff`. Nessuna funzione di sostituzione (RBF) o accelerazione nell'interfaccia.

**Dopo l'invio**

- Aggiornare subito lo stato locale (input spesi, nuovo resto), mostrare il txid con link all'explorer della rete, ricaricare dall'API dopo 2 s.
- Se il broadcast fallisce per input già spesi o mancanti: ricaricare gli UTXO, ricostruire e riprovare una volta.

**Limiti delle catene non confermate**

I nodi rifiutano gruppi troppo grandi di transazioni non confermate collegate tra loro. Fino a Bitcoin Core 30 il limite era 25 antenati e 25 discendenti per transazione. Dalla 31.0 (aprile 2026) vale invece un limite per cluster: 64 transazioni e 101 kvB per ogni insieme di transazioni collegate. Le reti di test hanno nodi con versioni miste, quindi vanno rispettati entrambi.

Il rischio non è la catena del singolo ragazzo (poche transazioni tra un blocco e l'altro), ma le transazioni che collegano tutta la classe in un unico cluster. Regole per i volontari, da riportare anche nel README:

1. La transazione che distribuisce i fondi iniziali deve essere **confermata** prima della prima domanda: inviarla all'inizio della spiegazione.
2. I fondi arrivati agli indirizzi delle risposte **non si spendono** finché non sono confermati.
3. I premi si pagano da un wallet "banca" separato, con **una transazione per vincitore**, ciascuna da un UTXO confermato preparato prima del laboratorio. Una sola transazione con molti vincitori unirebbe le loro catene in un cluster unico.

Con queste regole ogni ragazzo resta in un cluster suo, di poche transazioni.

**Messaggi di errore** (in italiano, senza gergo):

- `too-long-mempool-chain` o errori di cluster → "Troppe transazioni in attesa, riprova dopo il prossimo blocco" + tempo dall'ultimo blocco.
- `min relay fee not met` / `insufficient fee` → ricalcolare la fee al doppio e riprovare una volta.
- Saldo insufficiente, indirizzo non valido, indirizzo mainnet → messaggi dedicati prima ancora di firmare.

## 6. Interfaccia

L'app deve sembrare e comportarsi come un wallet vero, ma ogni elemento è anche un'occasione per spiegare come funziona Bitcoin. Tutto in italiano, importi in **sats** con equivalente in tBTC in piccolo.

**Identità visiva**

- Loghi del Bitcoin Meetup Pisa e dell'Internet Festival nella schermata di benvenuto, nella pagina Info e in piccolo nel piè di pagina della Home. I file (SVG o PNG, versione per tema chiaro e scuro) li forniscono gli organizzatori e vanno in `public/brand/`.
- Dicitura "Laboratorio didattico – Internet Festival, Pisa" nel benvenuto e in Info.
- Aspetto da wallet moderno: tema chiaro e scuro, arancio Bitcoin come colore principale, tipografia leggibile, animazioni leggere. Nessuna grafica presa da wallet commerciali esistenti.
- Il badge della rete ("SIGNET – soldi finti") resta sempre visibile: realistico sì, ma mai scambiabile per un wallet con bitcoin veri.

**Modalità didattica**

- Ogni elemento importante (saldo, indirizzo, fee, conferme, frase di recupero…) ha un'icona "i" che apre una spiegazione di 2–4 frasi, con linguaggio adatto alle superiori.
- Interruttore "Mostra spiegazioni" in Impostazioni: se attivo i box sono già aperti; durante il gioco si può spegnere per una vista più pulita.
- I testi didattici stanno in file separati (`src/content/*.md` o `src/i18n/it.ts`), così i volontari li correggono senza toccare il codice.
- Argomenti minimi: chiave privata e pubblica, frase di recupero, indirizzo, transazione, input e output (UTXO), resto, fee e sat/vB, mempool, blocchi e conferme, spesa di fondi non confermati e i suoi rischi su mainnet, differenza tra reti di test e mainnet, ruolo dei server pubblici e perché non hanno mai accesso alle chiavi.

**Home**

- Saldo grande, sotto "di cui in attesa di conferma"; tocco sul saldo per nasconderlo o mostrarlo.
- Pulsanti grandi: **Ricevi** e **Invia**.
- Stato della rete: altezza dell'ultimo blocco e minuti trascorsi, con spiegazione.
- Ultime transazioni: entrata/uscita, importo, conferme (0, 1, 2… fino a "6+"); tocco → dettaglio transazione.
- Badge della rete sempre visibile; piè di pagina con i loghi.
- Aggiornamento automatico ogni 15 s con piccola variazione casuale, solo con app in primo piano; pull-to-refresh.

**Ricevi**

- QR code grande dell'indirizzo (formato `bitcoin:tb1q…`).
- Indirizzo in testo, pulsante **Copia** e **Condividi** (Web Share API se disponibile).
- Avviso visivo appena arriva un pagamento in mempool.

**Invia**

- Campo indirizzo con pulsanti **Incolla** e **Scansiona QR**.
- Lo scanner accetta indirizzo semplice o URI BIP21 (`bitcoin:…?amount=…`); se c'è un importo lo precompila.
- Campo importo in sats, pulsanti rapidi **25%**, **50%**, **Tutto**.
- Riepilogo prima dell'invio: destinatario abbreviato, importo, fee, saldo che resta. Una sezione espandibile "Cosa succede" mostra quali UTXO vengono spesi, gli output (destinatario e resto), dimensione in vB e fee in sat/vB.
- Conferma con gesto di scorrimento, come nei wallet reali.
- Esito: schermata di successo con txid e link explorer, oppure errore comprensibile (sezione 5).

**Impostazioni** (accessibili da un'icona discreta, per i volontari)

- Selezione rete: Signet, Testnet4, Testnet3, Personalizzata (URL Esplora).
- Mostra spiegazioni sì/no, tema chiaro/scuro, PIN facoltativo.
- Accesso a Le mie chiavi, ripristino, nuovo wallet.
- Info: loghi, crediti, versione, rete e endpoint in uso, link al codice su GitHub.

**Dettaglio transazione**

- txid con copia e link explorer, stato, conferme, data e ora.
- Input e output con importi, evidenziando quelli del proprio indirizzo; fee totale, sat/vB, dimensione.
- Sezione espandibile "Transazione grezza" in esadecimale, con spiegazione.

**Le mie chiavi**

- Frase di recupero nascosta finché non si tocca "Mostra", percorso di derivazione, chiave pubblica, `tpub`/`vpub`, indirizzo, WIF esportabile come testo e QR.
- Schema semplice frase → chiave privata → chiave pubblica → indirizzo, con frecce a senso unico per spiegare che non si può tornare indietro.

**Le mie monete (UTXO)**

- Elenco degli UTXO con importo, stato di conferma e transazione d'origine; spiega che il saldo è la somma di questi pezzi e perché nasce il resto.

**Impara**

- Guida a schede (6–8), sempre consultabile, con lo stesso materiale dei box. Utilizzabile anche dai volontari per la spiegazione iniziale.

**Fase 2, opzionale: modalità organizzatore**

Non necessaria per il primo rilascio, ma utile per automatizzare le regole della sezione 5: creare gli indirizzi delle risposte e mostrarne i QR a schermo intero, preparare il wallet banca dividendo i fondi in UTXO confermati, leggere le puntate per indirizzo, calcolare la ripartizione e pagare ogni vincitore con una transazione separata all'indirizzo da cui ha puntato.

## 7. iOS, Android e pubblicazione

Un solo codice per entrambe le piattaforme; le differenze riguardano installazione e memoria.

**PWA**

- `manifest.webmanifest` con `display: standalone`, icone 192/512 px e icona maskable, `theme_color`, nome breve "Testnet Wallet" (nome definitivo da scegliere).
- Meta tag Apple: `apple-mobile-web-app-capable`, `apple-touch-icon`, gestione safe area (`viewport-fit=cover`).
- Service worker: cache di tutti i file dell'app, così si apre anche offline; le chiamate API non vanno in cache.
- Aggiornamenti: avviso "Nuova versione disponibile" con pulsante per ricaricare, mai aggiornamento silenzioso a metà laboratorio.

**Installazione guidata**

- Al primo avvio nel browser, schermata con istruzioni illustrate: su iPhone Condividi → "Aggiungi alla schermata Home"; su Android menu → "Installa app" (o prompt `beforeinstallprompt`).
- **Su iOS la chiave va creata solo dopo l'installazione**: l'app sulla Home ha una memoria separata da Safari, quindi un wallet creato in Safari non comparirebbe nell'app. Se l'app rileva di essere aperta in Safari (non standalone), mostra le istruzioni e rimanda la creazione del wallet.

**Fotocamera**

- Richiede HTTPS (GitHub Pages lo fornisce). Gestire il permesso negato con un messaggio e il ripiego su Incolla.
- Usare la fotocamera posteriore, con torcia se disponibile.

**Deploy**

- Workflow GitHub Actions su push a `main`: `npm ci`, `npm run build`, pubblicazione di `dist/` su GitHub Pages.
- `base` di Vite impostato su `/<nome-repo>/`, oppure `/` con dominio personalizzato.
- README con: link all'app, istruzioni per i ragazzi, regole per i volontari (sezione 5), come cambiare rete.

## 8. Rischi, test e istruzioni per Claude Code

**Rischi principali**

| Rischio | Mitigazione |
| --- | --- |
| Limiti di richieste di mempool.space: tutta la classe esce dallo stesso IP della scuola | Polling 15 s con variazione casuale, una chiamata per aggiornamento, stop quando l'app è in background, attesa crescente dopo un errore 429, endpoint di riserva e URL personalizzato |
| Cluster di transazioni non confermate troppo grande | Regole per i volontari (sezione 5) e messaggio d'errore chiaro |
| Una rete di test diventa instabile | Cambio rete dalle Impostazioni |
| Dati del browser cancellati | Chiave persa: accettabile; esporta/importa chiave disponibile |
| Fotocamera non disponibile | Ripiego su Incolla |

**Test**

- Unit test (Vitest) per: validazione indirizzi e rifiuto mainnet, stima fee, selezione UTXO, gestione dust, unione stato locale + API.
- Test con vettori noti: da un WIF fisso deve uscire l'indirizzo atteso.
- Prova manuale su Signet: ricevere da faucet, inviare 5 transazioni consecutive senza aspettare conferme, verificarle tutte nell'explorer.
- Prova su iPhone (Safari, app installata) e Android (Chrome, app installata).

**Criteri di accettazione**

- [ ] Installabile su iOS e Android da link GitHub Pages, si apre a schermo intero
- [ ] Al primo avvio da app installata ha già un indirizzo `tb1q…`, senza configurazioni
- [ ] Riceve fondi e mostra il saldo non confermato entro 20 s
- [ ] Invia con indirizzo incollato o QR, anche spendendo fondi non confermati
- [ ] 5 invii consecutivi in meno di 2 minuti vanno tutti a buon fine
- [ ] Rifiuta indirizzi e chiavi mainnet
- [ ] Cambio rete funzionante tra Signet e Testnet4
- [ ] Si apre offline (mostra l'ultimo saldo noto)

* [ ] Loghi del Bitcoin Meetup Pisa e dell'Internet Festival visibili in benvenuto, Home e Info
* [ ] Creazione e ripristino da 12 parole funzionanti; dalla stessa frase si ottiene sempre lo stesso indirizzo
* [ ] Ogni concetto elencato nella Modalità didattica ha la sua spiegazione nell'app
* [ ] Dettaglio transazione mostra input, output, fee e conferme

**Istruzioni per Claude Code**

1. Creare il progetto Vite + TypeScript con la struttura della sezione 2 e il workflow di deploy.
2. Implementare prima `networks`, `wallet`, `esplora`, `tx`, `pending` con i loro test, poi l'interfaccia.
3. Controllare le versioni correnti delle librerie e adattare il codice alle loro API (in particolare bitcoinjs-lib e la necessità di `Buffer`).
4. Tenere tutti i testi in `src/i18n/it.ts` e i parametri (fee minima, intervallo di polling, soglia dust) in un unico file di configurazione.
5. Commit piccoli e descrittivi; aggiornare il README con istruzioni per ragazzi e volontari.

**Fonti:** [note di rilascio Bitcoin Core 31.0](https://bitcoin.org/en/releases/31.0/) per i limiti cluster della mempool.
