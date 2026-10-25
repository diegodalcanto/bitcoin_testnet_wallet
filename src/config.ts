/**
 * Parametri dell'app in un unico posto (spec §8, istruzione 4).
 * Cambiare qui, non nei moduli.
 */
export const CONFIG = {
  /** Fee minima in sat/vB: la fee usata è max(fastestFee, MIN_FEE_RATE). */
  MIN_FEE_RATE: 2,
  /** Fee in sat/vB usata se l'endpoint delle fee non risponde. */
  FALLBACK_FEE_RATE: 2,
  /** Quanto tenere in memoria la fee consigliata prima di richiederla di nuovo. */
  FEE_CACHE_MS: 60_000,

  /** Fee di riferimento per il calcolo del "dust" (Bitcoin Core: 3000 sat/kvB). */
  DUST_RELAY_FEE_RATE: 3,
  /** Soglia dust di un output P2WPKH: un resto più piccolo va in fee. */
  DUST_THRESHOLD_P2WPKH: 294,

  /** Aggiornamento automatico: intervallo base e variazione casuale (±). */
  POLL_INTERVAL_MS: 15_000,
  POLL_JITTER_MS: 3_000,
  /** Ogni quante letture degli UTXO si controlla anche l'ultimo blocco. */
  TIP_CHECK_EVERY: 4,
  /** Attesa massima dopo errori ripetuti (attesa crescente). */
  BACKOFF_MAX_MS: 120_000,
  /** Ricarica dall'API dopo un invio. */
  REFRESH_AFTER_SEND_MS: 2_000,

  /** Timeout di ogni richiesta HTTP. */
  REQUEST_TIMEOUT_MS: 12_000,
  /** Dopo un passaggio all'endpoint di riserva, quanto restarci prima di riprovare il primario. */
  FALLBACK_STICKY_MS: 5 * 60_000,

  /** Le voci locali delle transazioni inviate si eliminano dopo questo tempo. */
  PENDING_EXPIRY_MS: 30 * 60_000,

  /** Oltre questo numero di conferme si mostra "6+". */
  MAX_CONFIRMATIONS_SHOWN: 6,

  /** Derivazione BIP84 per reti di test (coin type 1). */
  ACCOUNT_PATH: "m/84'/1'/0'",
  DERIVATION_PATH: "m/84'/1'/0'/0/0",

  /** Onboarding: quante parole far confermare. */
  WORDS_TO_CONFIRM: 2,
  /** Lunghezza del PIN facoltativo. */
  PIN_LENGTH: 4,

  /** Transazioni mostrate nella Home. */
  HOME_TX_COUNT: 10,

  /** Codice sorgente. */
  REPO_URL: 'https://github.com/diegodalcanto/bitcoin_testnet_wallet',
} as const;
