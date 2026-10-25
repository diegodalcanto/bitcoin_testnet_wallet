/**
 * TUTTI i testi dell'app, in italiano.
 *
 * Volontari: potete correggere qui spiegazioni e messaggi senza toccare il codice.
 * - `**parola**` diventa grassetto;
 * - ogni elemento di `body` è un paragrafo;
 * - le funzioni (es. `(n) => ...`) ricevono numeri o testi già formattati: cambiate solo le frasi.
 * I contenuti seguono la presentazione "Alla scoperta di Bitcoin" (vedi docs/PRESENTAZIONE.md).
 */

export interface Explanation {
  title: string;
  body: string[];
}

/** Box "i": 2–4 frasi per ogni elemento importante dell'interfaccia. */
export const explain = {
  balance: {
    title: 'Il saldo',
    body: [
      'Il saldo non è un numero scritto da qualche parte: è la **somma delle monete (UTXO)** che la tua chiave può spendere. Il wallet lo calcola leggendo la blockchain.',
      'È espresso in **sats**: 1 bitcoin = 100.000.000 sats. Tocca il saldo per nasconderlo o mostrarlo.',
    ],
  },
  pending: {
    title: 'In attesa di conferma',
    body: [
      'Sono sats arrivati (o resti tuoi) con transazioni ancora in **mempool**, la "sala d’attesa" della rete: nessun miner le ha ancora inserite in un blocco.',
      'Diventano confermati con il prossimo blocco, in media ogni 10 minuti. In questo laboratorio puoi spenderli subito.',
    ],
  },
  address: {
    title: 'L’indirizzo',
    body: [
      'È come un IBAN che puoi dare a chiunque per **ricevere**. Si ricava dalla chiave pubblica con funzioni a senso unico: dall’indirizzo non si risale alla chiave.',
      'Inizia con **tb1** perché è di una rete di test: su Bitcoin vero inizierebbe con bc1.',
      'Qui usi sempre lo stesso indirizzo per semplicità. I wallet veri ne creano uno nuovo per ogni pagamento, per proteggere la privacy: le transazioni sono pubbliche!',
    ],
  },
  qr: {
    title: 'Il QR code',
    body: [
      'Contiene il tuo indirizzo nel formato **bitcoin:tb1q…**. Chi ti paga lo inquadra con il suo wallet e non deve ricopiarlo a mano.',
      'Un indirizzo contiene anche un codice di controllo: se una lettera è sbagliata il wallet se ne accorge quasi sempre.',
    ],
  },
  recipient: {
    title: 'Il destinatario',
    body: [
      'Incolla o inquadra l’indirizzo di chi deve ricevere: durante il gioco è l’indirizzo della risposta che scegli.',
      'Il wallet controlla l’indirizzo prima di firmare e rifiuta quelli di Bitcoin vero (bc1…, 1…, 3…).',
    ],
  },
  amount: {
    title: 'L’importo in sats',
    body: [
      'Il sat (da Satoshi Nakamoto) è la parte più piccola di un bitcoin: **1 bitcoin = 100 milioni di sats**.',
      'Nel 2010 Laszlo Hanyecz pagò 10.000 bitcoin per due pizze: è stato il primo acquisto di un bene reale in bitcoin.',
    ],
  },
  fee: {
    title: 'La fee',
    body: [
      'È la commissione che paghi al **miner** che inserisce la tua transazione in un blocco. Non va a una banca né a chi ha fatto l’app.',
      'Non dipende da quanti sats invii ma dallo **spazio** che la transazione occupa nel blocco: si misura in sat/vB, cioè sats per byte virtuale.',
    ],
  },
  size: {
    title: 'Dimensione e sat/vB',
    body: [
      'La dimensione si misura in **vbyte (vB)**: ogni moneta spesa (input) pesa circa 68 vB, ogni output circa 31 vB.',
      '**Fee = dimensione × sat/vB.** Quando la mempool è piena i miner scelgono le transazioni che pagano di più per vB; qui la fee minima è 2 sat/vB.',
    ],
  },
  whatHappens: {
    title: 'Cosa succede',
    body: [
      'Prima di firmare puoi vedere la transazione: quali **monete** spendi (input), quali **output** crei e quanto pesa.',
      'Questo wallet spende sempre tutte le monete insieme (consolidamento): il resto torna a te come una sola moneta nuova.',
    ],
  },
  sign: {
    title: 'Firma e invio',
    body: [
      'Quando scorri, il telefono **firma** la transazione con la tua chiave privata e la manda ai nodi della rete, che la controllano e la diffondono.',
      'La chiave non esce mai dal telefono: viaggia solo la firma. Una volta inviata, la transazione non si può annullare.',
    ],
  },
  confirmations: {
    title: 'Le conferme',
    body: [
      '0 conferme: la transazione è in mempool. 1 conferma: è entrata in un blocco. Ogni blocco successivo aggiunge una conferma.',
      'Più conferme ci sono, più è difficile cancellarla: dopo **6 conferme** (circa un’ora) si considera definitiva. Una transazione registrata in un blocco non si può annullare.',
    ],
  },
  block: {
    title: 'Blocchi e altezza',
    body: [
      'I **miner** raccolgono le transazioni in blocchi e competono per aggiungerne uno nuovo: in media ogni 10 minuti, ma è una gara a caso e a volte passa mezz’ora.',
      'L’**altezza** è il numero del blocco, contando dal primo (il blocco genesi). I minuti trascorsi ti dicono da quanto la rete aspetta il prossimo.',
    ],
  },
  mempool: {
    title: 'La mempool',
    body: [
      'È la sala d’attesa delle transazioni: ogni **nodo** tiene quelle valide che ha ricevuto e non sono ancora in un blocco.',
      'I miner scelgono da lì le transazioni da inserire nel prossimo blocco, di solito quelle con la fee più alta.',
    ],
  },
  history: {
    title: 'Ultime transazioni',
    body: [
      'Ogni riga è una transazione che coinvolge il tuo indirizzo: ↓ in entrata, ↑ in uscita, con il numero di conferme.',
      'Toccala per vedere input, output e fee: sono tutti dati pubblici, che chiunque può controllare.',
    ],
  },
  transaction: {
    title: 'La transazione',
    body: [
      'È un messaggio firmato che dice: "spendo queste monete (**input**) e ne creo di nuove per questi indirizzi (**output**)".',
      'La differenza tra il totale degli input e quello degli output è la **fee** per il miner.',
    ],
  },
  txid: {
    title: 'Il txid',
    body: [
      'È il codice della transazione: 64 caratteri calcolati dal suo contenuto con una funzione di hash. Serve per cercarla in un explorer come mempool.space.',
    ],
  },
  rawTx: {
    title: 'La transazione grezza',
    body: [
      'Questa è la transazione come viaggia sulla rete: byte scritti in **esadecimale**. Dentro ci sono versione, input, output, firme (witness) e locktime.',
      'Chiunque può decodificarla e controllarla: **Don’t trust, verify**.',
    ],
  },
  utxo: {
    title: 'Le monete (UTXO)',
    body: [
      'Bitcoin non ha conti con un saldo: ha **monete** di qualsiasi taglio, chiamate UTXO (output non spesi), ognuna bloccata dalla tua chiave.',
      'Quando paghi usi monete intere come input, come banconote, e ne crei di nuove come output.',
    ],
  },
  change: {
    title: 'Il resto',
    body: [
      'Se paghi 3.000 sats con una moneta da 10.000, la moneta si spende tutta: 3.000 vanno al destinatario e il **resto** (meno la fee) torna a te come moneta nuova.',
      'Se il resto è minuscolo (meno di 294 sats, la "polvere") non conviene crearlo: va al miner come fee.',
    ],
  },
  unconfirmed: {
    title: 'Spendere fondi non confermati',
    body: [
      'Qui puoi rispendere sats appena ricevuti, prima che siano in un blocco: serve per giocare senza aspettare.',
      'Su Bitcoin vero è rischioso: finché non c’è almeno una conferma, chi ti ha pagato potrebbe sostituire la transazione e riprendersi i soldi (**doppia spesa**). Per somme importanti si aspettano più conferme.',
    ],
  },
  recoveryPhrase: {
    title: 'La frase di recupero',
    body: [
      'Le 12 parole contengono **tutto il wallet**: da queste si ricava la chiave privata. Chi le conosce può spendere i tuoi sats, da qualsiasi app.',
      'Scrivile su carta, mai in foto o in chat. **Not your keys, not your bitcoin**: se le perdi nessuno può recuperarle per te.',
    ],
  },
  privateKey: {
    title: 'La chiave privata',
    body: [
      'È un numero segreto enorme (256 bit) con cui **firmi** le transazioni: la firma dimostra che puoi spendere quelle monete senza rivelare la chiave.',
      'Il formato **WIF** è solo un modo di scriverla (sulle reti di test inizia con c). Chi la conosce controlla i fondi.',
    ],
  },
  publicKey: {
    title: 'La chiave pubblica',
    body: [
      'Si calcola dalla chiave privata con la crittografia a curve ellittiche (secp256k1). Il contrario è praticamente impossibile.',
      'Serve agli altri per verificare le tue firme. L’indirizzo è un "riassunto" (hash) della chiave pubblica.',
    ],
  },
  xpub: {
    title: 'La chiave pubblica estesa',
    body: [
      'La **tpub/vpub** permette di calcolare tutte le chiavi pubbliche e tutti gli indirizzi del wallet, ma non di spendere: si usa per wallet "solo lettura".',
      'Attenzione: chi ce l’ha vede tutti i tuoi movimenti. vpub e tpub sono la stessa chiave scritta con due prefissi diversi.',
    ],
  },
  derivationPath: {
    title: 'Il percorso di derivazione',
    body: [
      "Dalle 12 parole si possono ricavare infinite chiavi, organizzate ad albero. **m/84'/1'/0'/0/0** indica il ramo usato:",
      '84 = indirizzi SegWit nativi (BIP84), 1 = reti di test, 0 = primo conto, 0 = indirizzi per ricevere, 0 = primo indirizzo.',
    ],
  },
  keysDiagram: {
    title: 'Una strada a senso unico',
    body: [
      'Frase → chiave privata → chiave pubblica → indirizzo: ogni passaggio si calcola in un attimo, ma **non si può tornare indietro**.',
      'Per questo puoi mostrare a tutti l’indirizzo, mentre la frase e la chiave privata devono restare segrete.',
    ],
  },
  network: {
    title: 'Reti di test',
    body: [
      'Signet e Testnet sono copie di Bitcoin per fare prove: stesse regole, ma le monete **non valgono nulla** e si ottengono gratis.',
      'Questo wallet funziona solo lì: rifiuta indirizzi e chiavi di Bitcoin vero (mainnet).',
    ],
  },
  servers: {
    title: 'I server pubblici',
    body: [
      'L’app non ha un nodo suo: chiede saldo e transazioni a server pubblici (mempool.space o Blockstream) e li usa per trasmettere le transazioni già firmate.',
      'I server vedono il tuo indirizzo ma **non hanno mai la tua chiave**: non possono spendere i tuoi sats. Con un nodo tuo potresti verificare tutto da solo: **Don’t trust, verify**.',
    ],
  },
  storage: {
    title: 'Dove è salvato il wallet',
    body: [
      'La frase è salvata **in chiaro** nella memoria di questa app sul telefono: va bene solo perché sono soldi finti.',
      'Se cancelli i dati del browser o disinstalli l’app, il wallet sparisce: per recuperarlo servono le 12 parole.',
    ],
  },
  pin: {
    title: 'Il PIN',
    body: [
      'Il PIN evita che qualcuno apra l’app dal tuo telefono, ma qui è **solo un deterrente**: non cifra le 12 parole, che restano salvate nel telefono.',
      'I wallet veri usano il PIN o la biometria per cifrare la chiave.',
    ],
  },
} satisfies Record<string, Explanation>;

export type ExplainTopic = keyof typeof explain;

export interface LearnCard {
  id: string;
  /** Simbolo grande in cima alla scheda. */
  icon: string;
  title: string;
  body: string[];
  /** Curiosità presa dalla presentazione. */
  funFact?: string;
}

/** Guida "Impara": stesse idee dei box, in ordine per la spiegazione iniziale. */
export const learnCards: LearnCard[] = [
  {
    id: 'bitcoin',
    icon: '₿',
    title: 'Cos’è Bitcoin',
    body: [
      'Bitcoin è una **moneta digitale** e una **rete peer to peer**: nessuna banca o azienda la controlla. È nato dal white paper pubblicato da Satoshi Nakamoto il 31 ottobre 2008.',
      'Le regole sono scritte in un software **open source** e applicate da migliaia di nodi: ci saranno al massimo **21 milioni** di bitcoin.',
      'Non serve aprire un conto: ognuno gestisce i propri bitcoin con un programma chiamato **wallet**, come questo.',
    ],
    funFact: 'La rete è attiva dal 3 gennaio 2009 e le sue regole di base da allora non sono cambiate.',
  },
  {
    id: 'keys',
    icon: '🔑',
    title: 'Chiavi e indirizzo',
    body: [
      'Il wallet non contiene monete: contiene **chiavi**. La chiave privata firma i pagamenti, la chiave pubblica serve a verificare le firme, l’indirizzo serve a ricevere.',
      'Si passa dalla chiave privata alla pubblica e poi all’indirizzo con funzioni **a senso unico**: l’indirizzo si può dare a tutti, la chiave privata mai.',
      '**Not your keys, not your bitcoin**: chi ha la chiave controlla i fondi.',
    ],
  },
  {
    id: 'phrase',
    icon: '📝',
    title: 'La frase di recupero',
    body: [
      'Le **12 parole** sono il backup di tutto il wallet: con quelle puoi ricreare le chiavi su qualsiasi telefono e in qualsiasi app compatibile.',
      'Nei wallet **custodial** (exchange, app che ti chiedono un account) le chiavi le tiene il servizio: comodo, ma se fallisce o viene attaccato i fondi possono sparire. Il caso Mt. Gox lo ha insegnato nel 2014.',
      'Scrivi le parole su carta e non mostrarle a nessuno.',
    ],
  },
  {
    id: 'utxo',
    icon: '🪙',
    title: 'Transazioni, monete e resto',
    body: [
      'Il saldo è fatto di **monete** (UTXO) di qualsiasi taglio. Una transazione spende monete intere (**input**) e ne crea di nuove (**output**).',
      'Se la moneta è più grande del pagamento, il **resto** torna a te come una moneta nuova: come quando paghi un caffè con una banconota da 10 euro.',
      'Totale degli input − totale degli output = **fee** per il miner.',
    ],
  },
  {
    id: 'fees',
    icon: '⛏️',
    title: 'Fee, mempool e miner',
    body: [
      'Una transazione appena inviata entra nella **mempool**, la sala d’attesa dei nodi.',
      'I **miner** scelgono le transazioni da mettere nel prossimo blocco, di solito quelle che pagano più **sat/vB**: la fee dipende dallo spazio occupato, non dall’importo.',
      'Ai miner vanno le fee e la ricompensa per il blocco; i **nodi** invece conservano il registro e diffondono transazioni e blocchi senza essere pagati.',
    ],
  },
  {
    id: 'blocks',
    icon: '🧱',
    title: 'Blocchi e conferme',
    body: [
      'Un nuovo **blocco** arriva in media ogni 10 minuti. Quando la tua transazione entra in un blocco ha **1 conferma**; ogni blocco successivo ne aggiunge una.',
      'Dopo circa **6 conferme** una transazione si considera definitiva: cancellarla richiederebbe di rifare tutto il lavoro dei miner da quel blocco in poi.',
      'Per questo una transazione registrata non si può annullare.',
    ],
    funFact: 'I miner usano computer specializzati (ASIC) e consumano molta energia: è il costo che rende difficile riscrivere la storia.',
  },
  {
    id: 'unconfirmed',
    icon: '⏳',
    title: 'Fondi non ancora confermati',
    body: [
      'In questo gioco puoi **rispendere subito** i sats appena ricevuti, anche con 0 conferme: tra una domanda e l’altra non c’è tempo di aspettare un blocco.',
      'Su Bitcoin vero è un rischio: finché non c’è una conferma, chi ti ha pagato può ancora sostituire la transazione (**doppia spesa**). Per cifre importanti si aspettano più conferme.',
      'La rete accetta solo un numero limitato di transazioni non confermate collegate tra loro: se lo superi, aspetta il prossimo blocco.',
    ],
  },
  {
    id: 'testnet',
    icon: '🧪',
    title: 'Reti di test e server pubblici',
    body: [
      '**Signet** e **Testnet** funzionano come Bitcoin, ma le monete non valgono nulla: servono per imparare e fare prove. Questo wallet rifiuta indirizzi e chiavi di Bitcoin vero.',
      'Per leggere la blockchain l’app usa **server pubblici**: vedono il tuo indirizzo, ma la chiave resta sul telefono e la firma avviene qui.',
      'Chiunque può far girare un nodo e controllare da solo le regole: **Don’t trust, verify**.',
    ],
    funFact: 'Le stesse 12 parole funzionerebbero anche su Bitcoin vero: per questo non vanno mai usate per bitcoin veri.',
  },
];

// ---------------------------------------------------------------------------
// Testi dell'interfaccia
// ---------------------------------------------------------------------------

export const t = {
  app: {
    name: 'Testnet Wallet',
    lab: 'Laboratorio didattico – Internet Festival, Pisa',
    fakeMoney: 'soldi finti',
    /** Titolo della copertina, come nella prima slide: la parte tra ** è in grassetto. */
    cover: 'Alla scoperta di **Bitcoin**',
  },
  common: {
    back: 'Indietro',
    close: 'Chiudi',
    cancel: 'Annulla',
    copy: 'Copia',
    copied: 'Copiato!',
    copyFailed: 'Copia non riuscita: tieni premuto il testo per copiarlo.',
    share: 'Condividi',
    hide: 'Nascondi',
    retry: 'Riprova',
    sats: 'sats',
    tbtc: 'tBTC',
    explainOpen: 'Mostra spiegazione',
    explainClose: 'Nascondi spiegazione',
    explorer: 'Explorer',
    loading: 'Caricamento…',
  },
  nav: {
    label: 'Navigazione',
    wallet: 'Wallet',
    coins: 'Monete',
    learn: 'Impara',
    settings: 'Impostazioni',
  },
  welcome: {
    title: 'Benvenuto nel laboratorio Bitcoin',
    text: 'Questo è un wallet Bitcoin vero, ma funziona solo su **reti di test**: i bitcoin che riceverai non valgono nulla e servono per giocare e imparare.',
    create: 'Crea nuovo wallet',
    restore: 'Ripristina wallet',
    noAccount: 'Nessun account, nessuna email: il wallet è sul tuo telefono.',
  },
  install: {
    title: 'Prima installa l’app',
    intro: 'Aggiungi Testnet Wallet alla schermata Home: si aprirà a schermo intero, come un’app vera.',
    iosSteps: [
      'Tocca il pulsante **Condividi** (il quadrato con la freccia verso l’alto), in basso nella barra di Safari.',
      'Scorri e scegli **Aggiungi alla schermata Home**.',
      'Tocca **Aggiungi**, poi apri **Testnet Wallet** dalla schermata Home.',
    ],
    iosWhy: 'Su iPhone il wallet va creato **nell’app installata**: l’app sulla Home ha una memoria separata da Safari, quindi un wallet creato qui non comparirebbe.',
    iosInApp: 'Hai aperto il link da WhatsApp, Instagram o un’altra app? Aprilo prima in **Safari**.',
    androidSteps: [
      'Tocca **Installa app** qui sotto oppure apri il menu **⋮** del browser in alto a destra.',
      'Scegli **Installa app** (o **Aggiungi a schermata Home**) e conferma.',
      'Apri **Testnet Wallet** dalla schermata Home.',
    ],
    installButton: 'Installa app',
    shareButton: 'Condividi',
    addToHome: 'Aggiungi alla schermata Home',
    menu: 'Menu',
    desktop: 'Questa app è pensata per il telefono: apri lo stesso link dal tuo smartphone e installala sulla schermata Home.',
    continueBrowser: 'Continua nel browser',
    continueBrowserIos: 'Continua in Safari (sconsigliato)',
    continueWarningIos: 'Se poi installi l’app, avrà un wallet diverso da questo.',
    browserBanner: 'Stai usando il wallet dentro Safari: l’app installata sulla Home avrebbe un wallet diverso.',
  },
  create: {
    introText: 'Ora il telefono genera 128 bit casuali e li trasforma in **12 parole**: sono la chiave del tuo wallet.',
    wordsTitle: 'Scrivi queste 12 parole',
    wordsHint: 'In ordine, su un foglio. Non fare foto e non mandarle in chat.',
    written: 'Le ho scritte',
    skip: 'Salta',
    confirmTitle: 'Controlliamo',
    confirmQuestion: (position: number) => `Qual è la parola n. ${position}?`,
    confirmWrong: 'Non è quella giusta: controlla il foglio e riprova.',
    confirmBack: 'Rivedi le parole',
    doneTitle: 'Wallet pronto!',
    doneText: 'Il tuo indirizzo è pronto per ricevere i sats di test.',
  },
  restore: {
    title: 'Ripristina wallet',
    text: 'Scrivi le **12 parole** separate da spazi, oppure incolla una chiave privata **WIF di rete test** (inizia con c).',
    placeholder: 'parola1 parola2 parola3 …',
    button: 'Ripristina',
    overwriteTitle: 'Sostituire il wallet attuale?',
    overwriteText: 'Il wallet attuale verrà cancellato da questo telefono. Se non hai le sue 12 parole, i suoi sats andranno persi.',
    overwriteConfirm: 'Sì, sostituisci',
    success: 'Wallet ripristinato',
  },
  newWallet: {
    title: 'Nuovo wallet',
    text: 'Creare un nuovo wallet cancella quello attuale da questo telefono. Senza le sue 12 parole i suoi sats andranno persi per sempre.',
    button: 'Crea un nuovo wallet',
    confirmTitle: 'Sei proprio sicuro?',
    confirmText: 'Ultima conferma: il wallet attuale verrà cancellato.',
    confirmButton: 'Cancella e crea nuovo',
  },
  home: {
    balance: 'Saldo',
    hiddenBalance: '•••••',
    tapToHide: 'Tocca per nascondere',
    tapToShow: 'Tocca per mostrare',
    pending: (amount: string) => `di cui ${amount} sats in attesa di conferma`,
    allConfirmed: 'tutto confermato',
    receive: 'Ricevi',
    send: 'Invia',
    networkStatus: 'Stato della rete',
    lastBlock: (height: string) => `Ultimo blocco #${height}`,
    minutesAgo: (duration: string) => `${duration} fa`,
    noBlockYet: 'Ultimo blocco: in caricamento…',
    history: 'Ultime transazioni',
    empty: 'Nessuna transazione per ora. Mostra il tuo QR (Ricevi) ai volontari per ricevere i primi sats di test!',
    received: 'Ricevuti',
    sent: 'Inviati',
    self: 'A te stesso',
    fee: (amount: string) => `fee ${amount}`,
    localOnly: 'appena inviata',
    confirmationsShort: (label: string) => `${label} conf.`,
    pull: 'Trascina per aggiornare',
    release: 'Rilascia per aggiornare',
    refreshing: 'Aggiornamento…',
    updatedAt: (time: string) => `Aggiornato alle ${time}`,
    offline: (time: string) => `Offline – ultimo saldo noto delle ${time}`,
    offlineNever: 'Offline – nessun dato ancora',
    errorRetry: (seconds: number) => `Server non raggiungibile, nuovo tentativo tra ${seconds} s`,
    rateLimited: (seconds: number) => `Troppe richieste da questa rete: nuovo tentativo tra ${seconds} s`,
    incomingToast: (amount: string) => `Ricevuti ${amount} sats! In attesa di conferma.`,
    mainnetWarning: 'Le stesse 12 parole funzionerebbero anche su Bitcoin vero: non usarle mai per bitcoin veri.',
  },
  receive: {
    title: 'Ricevi',
    instructions: 'Mostra questo QR a chi ti deve pagare, oppure condividi l’indirizzo.',
    addressLabel: 'Il tuo indirizzo',
    qrLabel: (address: string) => `QR code dell’indirizzo ${address}`,
    shareTitle: 'Il mio indirizzo Testnet',
    arrived: (amount: string) => `Pagamento in arrivo: +${amount} sats`,
    arrivedSub: 'È in mempool, in attesa di conferma.',
  },
  send: {
    title: 'Invia',
    recipient: 'Destinatario',
    recipientPlaceholder: 'Indirizzo tb1…',
    paste: 'Incolla',
    scan: 'Scansiona QR',
    pasteFailed: 'Non riesco a leggere gli appunti: tieni premuto nel campo e scegli Incolla.',
    amount: 'Importo',
    amountPlaceholder: '0',
    quick25: '25%',
    quick50: '50%',
    quickAll: 'Tutto',
    available: (amount: string) => `Disponibili: ${amount} sats`,
    selfWarning: 'Stai inviando al tuo stesso indirizzo.',
    amountFromQr: (amount: string) => `Importo letto dal QR: ${amount} sats`,
    summary: 'Riepilogo',
    to: 'A',
    toSend: 'Importo',
    feeLabel: 'Fee',
    feeRate: (rate: string) => `${rate} sat/vB`,
    remaining: 'Saldo che resta',
    whatHappens: 'Cosa succede',
    inputs: (n: number) => (n === 1 ? '1 moneta spesa (input)' : `${n} monete spese (input)`),
    outputs: (n: number) => (n === 1 ? '1 output' : `${n} output`),
    outputRecipient: 'destinatario',
    outputChange: 'resto, torna a te',
    unconfirmedCoin: 'non confermata',
    size: (vsize: number) => `Dimensione stimata: ${vsize} vB`,
    feeFormula: (vsize: number, rate: string, fee: string) => `${vsize} vB × ${rate} sat/vB = ${fee} sats di fee`,
    dustToFee: (amount: string) => `Il resto di ${amount} sats è sotto la soglia "polvere": va al miner come fee.`,
    noChange: 'Nessun resto: spendi tutto.',
    slide: 'Scorri per inviare',
    sending: 'Firma e invio…',
    successTitle: 'Inviato!',
    successText: 'La transazione è nella mempool: tra poco un miner la metterà in un blocco.',
    successAmount: (amount: string) => `${amount} sats inviati`,
    backHome: 'Torna al wallet',
    newSend: 'Nuovo invio',
    errorTitle: 'Invio non riuscito',
    details: 'Dettagli tecnici',
    feeLoading: 'Calcolo della fee…',
    feeFallback: 'Fee consigliata non disponibile: uso 2 sat/vB.',
  },
  scanner: {
    title: 'Inquadra il QR',
    hint: 'Inquadra il QR dell’indirizzo (ad esempio quello di una risposta del quiz).',
    torchOn: 'Accendi la torcia',
    torchOff: 'Spegni la torcia',
    denied: 'Non hai dato il permesso di usare la fotocamera. Puoi copiare l’indirizzo e usare Incolla, oppure abilitare la fotocamera nelle impostazioni del telefono.',
    noCamera: 'Nessuna fotocamera disponibile su questo dispositivo: usa Incolla.',
    failed: 'Non riesco ad avviare la fotocamera: usa Incolla.',
    notAddress: 'Questo QR non contiene un indirizzo di rete test.',
  },
  errors: {
    address: {
      empty: 'Inserisci l’indirizzo di chi deve ricevere.',
      invalid: 'Questo non è un indirizzo valido: controlla di averlo copiato tutto e senza errori.',
      mainnet: 'Questo è un indirizzo di Bitcoin vero (mainnet)! Qui puoi usare solo indirizzi di rete test, che iniziano con tb1, m, n o 2.',
      regtest: 'Questo indirizzo è di una rete di sviluppo (regtest): qui non è supportato.',
      lightning: 'Questa è una fattura Lightning: questo wallet non usa Lightning. Serve un indirizzo che inizia con tb1.',
    },
    plan: {
      noFunds: 'Non hai ancora sats da spendere.',
      invalidAmount: 'Scrivi un importo in sats (un numero intero, senza virgola).',
      belowDust: (min: string) => `L’importo minimo per questo indirizzo è ${min} sats: sotto questa soglia ("polvere") la rete rifiuta il pagamento.`,
      insufficient: (max: string) => `Saldo insufficiente: puoi inviare al massimo ${max} sats, il resto serve per la fee.`,
      insufficientNone: 'Saldo insufficiente per pagare anche la fee.',
    },
    send: {
      chainLimit: 'Troppe transazioni in attesa: riprova dopo il prossimo blocco.',
      chainLimitSince: (duration: string) => `L’ultimo blocco è arrivato ${duration} fa.`,
      feeTooLow: 'La rete chiede una fee più alta di quella offerta. Riprova tra poco.',
      inputsSpent: 'Alcune monete risultano già spese. Ho aggiornato il saldo: controlla e riprova.',
      network: 'Connessione assente o server non raggiungibile. Controlla la rete e riprova.',
      uncertain: 'La connessione si è interrotta durante l’invio: controlla le ultime transazioni prima di riprovare, per non pagare due volte.',
      rateLimit: 'Il server ha ricevuto troppe richieste dalla rete della scuola. Aspetta qualche secondo e riprova.',
      rejected: 'La rete ha rifiutato la transazione.',
      noWallet: 'Nessun wallet su questo telefono.',
    },
    import: {
      empty: 'Scrivi le 12 parole oppure incolla una chiave WIF.',
      mainnetKey: 'Questa è una chiave di Bitcoin vero (mainnet)! Non usarla qui e non mostrarla a nessuno.',
      extendedKey: 'Le chiavi estese (tprv, vprv) non sono supportate: usa le 12 parole o una chiave WIF.',
      uncompressedWif: 'Questa chiave WIF è in un formato vecchio (non compresso) che questo wallet non supporta.',
      wordCount: (n: number) => `Servono 12 parole (o 24): ne hai scritte ${n}.`,
      unknownWords: (words: string) => `Queste parole non sono nella lista delle 2048 parole BIP39: ${words}. Controlla come sono scritte.`,
      checksum: 'Le parole esistono, ma la frase non è valida: forse una parola è sbagliata o fuori posto.',
      invalid: 'Non riconosco questo testo: scrivi le 12 parole separate da spazi oppure incolla una chiave WIF di rete test (inizia con c).',
    },
  },
  tx: {
    title: 'Transazione',
    incoming: 'Ricevuti',
    outgoing: 'Inviati',
    self: 'Trasferimento a te stesso',
    status: 'Stato',
    unconfirmed: 'In attesa di conferma',
    confirmed: 'Confermata',
    localOnly: 'Appena inviata: il server non l’ha ancora vista',
    confirmations: 'Conferme',
    date: 'Data e ora',
    sentAt: 'Inviata alle',
    block: 'Blocco',
    txid: 'txid',
    inputs: 'Input',
    outputs: 'Output',
    unknownAddress: 'indirizzo sconosciuto',
    coinbase: 'nuovi bitcoin (coinbase)',
    fee: 'Fee',
    feeRate: 'Fee per vbyte',
    size: 'Dimensione',
    raw: 'Transazione grezza',
    rawLoading: 'Caricamento…',
    rawError: 'Non riesco a scaricare la transazione grezza.',
    notFound: 'Transazione non trovata.',
    loadError: 'Non riesco a caricare la transazione.',
    yours: 'tuo',
  },
  keys: {
    title: 'Le mie chiavi',
    warning: 'Chi conosce la frase o la chiave privata può spendere i tuoi sats. Non mostrarle a nessuno (in aula sono soldi finti, ma è un’ottima abitudine).',
    diagram: ['Frase di recupero', 'Chiave privata', 'Chiave pubblica', 'Indirizzo'],
    diagramWif: ['Chiave privata', 'Chiave pubblica', 'Indirizzo'],
    oneWay: 'senso unico',
    phrase: 'Frase di recupero',
    phraseNone: 'Questo wallet è stato importato da una chiave WIF: non ha una frase di recupero.',
    path: 'Percorso di derivazione',
    privateKey: 'Chiave privata (WIF)',
    publicKey: 'Chiave pubblica',
    xpub: 'Chiave pubblica estesa',
    address: 'Indirizzo',
    reveal: 'Mostra',
  },
  coins: {
    title: 'Le mie monete',
    summary: (count: number, total: string) =>
      count === 1 ? `1 moneta, in totale ${total} sats` : `${count} monete, in totale ${total} sats`,
    empty: 'Nessuna moneta: ricevi dei sats per vederle qui.',
    confirmed: 'confermata',
    unconfirmed: 'in attesa di conferma',
    localChange: 'resto appena creato',
    inBlock: (height: string) => `nel blocco #${height}`,
    origin: 'Da',
    consolidation: 'Quando invii, questo wallet usa tutte le monete insieme: dopo ogni invio ne resta una sola, il resto.',
  },
  learn: {
    title: 'Impara',
    card: 'scheda',
    of: (n: number, total: number) => `${n} di ${total}`,
    prev: 'Precedente',
    next: 'Successiva',
    funFact: 'Lo sapevi?',
  },
  settings: {
    title: 'Impostazioni',
    forVolunteers: 'Per i volontari',
    network: 'Rete',
    networks: {
      signet: { name: 'Signet', note: 'Predefinita: blocchi regolari, niente riorganizzazioni' },
      testnet4: { name: 'Testnet4', note: 'Alternativa' },
      testnet3: { name: 'Testnet3', note: 'Solo emergenza: rete deprecata e instabile' },
      custom: { name: 'Personalizzata', note: 'Un nodo o un server Esplora vostro' },
    },
    customUrl: 'URL del server Esplora',
    customPlaceholder: 'https://…/signet/api',
    customTest: 'Prova e usa',
    customTesting: 'Prova in corso…',
    customOk: (chain: string, height: string) => `Funziona: rete ${chain}, blocco #${height}.`,
    customInvalid: 'Scrivi un URL completo, ad esempio https://mempool.space/signet/api',
    customMainnet: 'Questo server è di Bitcoin vero (mainnet): non si può usare.',
    customUnreachable: 'Il server non risponde (o non permette l’accesso dal browser).',
    customHttp: 'Attenzione: un indirizzo http:// potrebbe essere bloccato dal browser, meglio https://.',
    chains: {
      signet: 'Signet',
      testnet4: 'Testnet4',
      testnet3: 'Testnet3',
      regtest: 'Regtest',
      mainnet: 'Mainnet',
      unknown: 'sconosciuta (signet personalizzato?)',
    },
    endpointInUse: 'Server in uso',
    networkChanged: (name: string) => `Rete cambiata: ${name}`,
    display: 'Visualizzazione',
    showExplanations: 'Mostra spiegazioni',
    showExplanationsNote: 'Se attivo, i box "i" sono già aperti. Durante il gioco puoi spegnerlo per una vista più pulita.',
    theme: 'Tema',
    themes: { auto: 'Automatico', light: 'Chiaro', dark: 'Scuro' },
    security: 'Sicurezza',
    pin: 'PIN per aprire l’app',
    pinOn: 'Attivo',
    pinOff: 'Non attivo',
    pinSet: 'Imposta PIN',
    pinChange: 'Cambia PIN',
    pinRemove: 'Rimuovi PIN',
    pinRemoved: 'PIN rimosso',
    pinSaved: 'PIN salvato',
    wallet: 'Wallet',
    keys: 'Le mie chiavi',
    restore: 'Ripristina wallet',
    newWallet: 'Nuovo wallet',
    info: 'Info',
  },
  pin: {
    enter: 'Inserisci il PIN',
    choose: 'Scegli un PIN di 4 cifre',
    repeat: 'Ripeti il PIN',
    current: 'Inserisci il PIN attuale',
    mismatch: 'I due PIN non coincidono: riprova.',
    wrong: 'PIN sbagliato',
    forgot: 'Ho dimenticato il PIN',
    forgotTitle: 'PIN dimenticato',
    forgotText: 'Il PIN non si può recuperare. Puoi cancellare il wallet da questo telefono e ripristinarlo con le 12 parole.',
    forgotConfirm: 'Cancella il wallet',
    delete: 'Cancella',
  },
  info: {
    title: 'Info',
    about: 'Testnet Wallet è un wallet minimale per i laboratori didattici su Bitcoin nelle scuole, a cura del **Bitcoin Meetup Pisa** per l’**Internet Festival**.',
    privacy: 'Nessun server nostro e nessun dato raccolto: le chiavi restano sul telefono, l’app parla solo con i server Esplora pubblici della rete scelta.',
    version: 'Versione',
    network: 'Rete',
    endpoint: 'Server in uso',
    endpoints: 'Server configurati',
    source: 'Codice sorgente su GitHub',
    credits: 'Crediti',
    creditsText: 'Organizzazione: Bitcoin Meetup Pisa e Internet Festival. Librerie open source: bitcoinjs-lib, @scure/bip39 e bip32, @bitcoinerlab/secp256k1, qr-scanner, qrcode, Preact.',
    notMainnet: 'Questo wallet non funziona con bitcoin veri e non va mai usato per custodirli.',
  },
  pwa: {
    updateAvailable: 'Nuova versione disponibile',
    updateNow: 'Aggiorna',
    later: 'Più tardi',
  },
} as const;
