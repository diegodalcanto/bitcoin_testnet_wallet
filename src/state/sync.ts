import { signal } from '@preact/signals';
import { CONFIG } from '../config';
import { EsploraError, type EsploraTx, type EsploraUtxo } from '../esplora';
import { outpointKey, prunePending } from '../pending';
import { chooseFeeRate } from '../tx';
import { chain, client, keys, networkKey, onChainReset, pending, setChain, setPending, type TipInfo } from './wallet';

export interface SyncStatus {
  loading: boolean;
  /** Ultimo errore, se l'ultimo tentativo è fallito. */
  error: 'network' | 'rate-limit' | null;
  /** Prossimo tentativo dopo un errore (ms). */
  retryAt: number | null;
}

export const syncStatus = signal<SyncStatus>({ loading: false, error: null, retryAt: null });

/** Ultimo pagamento in arrivo rilevato (per l'avviso nella schermata Ricevi). */
export const lastIncoming = signal<{ amount: number; at: number } | null>(null);

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let fullRequested = false;
let cycle = 0;
let failures = 0;
let retryAfterMs: number | null = null;
/** Cambia a ogni cambio di rete/wallet: le risposte vecchie vengono scartate. */
let generation = 0;
let lastRefreshAt = 0;

function jitter(): number {
  return Math.round((Math.random() * 2 - 1) * CONFIG.POLL_JITTER_MS);
}

/** 15 s ± variazione casuale; dopo un errore l'attesa raddoppia (30 s, 60 s, 120 s). */
function nextDelay(): number {
  if (failures === 0) return CONFIG.POLL_INTERVAL_MS + jitter();
  const backoff = Math.min(CONFIG.BACKOFF_MAX_MS, CONFIG.POLL_INTERVAL_MS * 2 ** failures);
  return Math.max(backoff, retryAfterMs ?? 0) + Math.abs(jitter());
}

function utxoFingerprint(utxos: EsploraUtxo[] | null): string {
  if (!utxos) return '';
  return utxos
    .map((u) => `${outpointKey(u)}:${u.value}:${u.status.confirmed ? 1 : 0}`)
    .sort()
    .join('|');
}

function confirmationsChanged(before: EsploraUtxo[] | null, after: EsploraUtxo[]): boolean {
  if (!before) return false;
  const status = new Map(before.map((u) => [outpointKey(u), u.status.confirmed]));
  return after.some((u) => status.get(outpointKey(u)) === false && u.status.confirmed);
}

function isOwnSpend(tx: EsploraTx | undefined, address: string): boolean {
  return Boolean(tx?.vin.some((v) => v.prevout?.scriptpubkey_address === address));
}

function stopTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(delay: number): void {
  stopTimer();
  if (!running || document.visibilityState === 'hidden') return;
  timer = setTimeout(() => void refresh(), delay);
}

/**
 * Un aggiornamento = una chiamata (`/utxo`). Lo storico si scarica solo se le monete cambiano,
 * l'ultimo blocco ogni TIP_CHECK_EVERY aggiornamenti o quando una moneta riceve la prima conferma.
 */
async function doRefresh(full: boolean): Promise<void> {
  const k = keys.value;
  if (!k) return;
  const api = client.value;
  const gen = generation;
  syncStatus.value = { ...syncStatus.value, loading: true };
  try {
    const utxos = await api.getUtxos(k.address);
    if (gen !== generation) return;
    const prev = chain.value.address === k.address ? chain.value : null;
    const prevUtxos = prev?.utxos ?? null;
    const utxosChanged = utxoFingerprint(utxos) !== utxoFingerprint(prevUtxos);

    let tip: TipInfo | null = prev?.tip ?? null;
    let tipChanged = false;
    if (full || !tip || cycle % CONFIG.TIP_CHECK_EVERY === 0 || confirmationsChanged(prevUtxos, utxos)) {
      const hash = await api.getTipHash();
      if (!tip || tip.hash !== hash) {
        const block = await api.getBlock(hash);
        tipChanged = tip !== null;
        tip = { hash, height: block.height, time: block.timestamp };
      }
    }

    let txs = prev?.txs ?? null;
    const hasUnconfirmed = (txs ?? []).some((tx) => !tx.status.confirmed);
    if (full || utxosChanged || txs === null || (tipChanged && hasUnconfirmed)) {
      txs = await api.getAddressTxs(k.address);
    }
    if (gen !== generation) return;

    // Avviso per i pagamenti in arrivo (non al primo caricamento).
    if (prevUtxos) {
      const known = new Set(prevUtxos.map(outpointKey));
      const ownTxids = new Set(pending.value.map((p) => p.txid));
      const txById = new Map((txs ?? []).map((tx) => [tx.txid, tx]));
      const incoming = utxos
        .filter((u) => !known.has(outpointKey(u)) && !ownTxids.has(u.txid) && !isOwnSpend(txById.get(u.txid), k.address))
        .reduce((sum, u) => sum + u.value, 0);
      if (incoming > 0) lastIncoming.value = { amount: incoming, at: Date.now() };
    }

    const pruned = prunePending(pending.value, { utxos, txids: (txs ?? []).map((tx) => tx.txid) }, Date.now());
    if (pruned.length !== pending.value.length) setPending(pruned);

    setChain({ address: k.address, utxos, txs, tip, updatedAt: Date.now() });
    failures = 0;
    retryAfterMs = null;
    cycle++;
    syncStatus.value = { loading: false, error: null, retryAt: null };
  } catch (err) {
    if (gen !== generation) return;
    failures++;
    const rateLimited = err instanceof EsploraError && err.kind === 'rate-limit';
    retryAfterMs = rateLimited ? ((err as EsploraError).retryAfterMs ?? null) : null;
    syncStatus.value = { loading: false, error: rateLimited ? 'rate-limit' : 'network', retryAt: null };
  }
}

/**
 * Aggiorna subito. Le richieste concorrenti si uniscono a quella in corso; con `full` la promessa
 * si risolve solo dopo un aggiornamento completo partito dopo la chiamata.
 */
export function refresh(opts: { full?: boolean } = {}): Promise<void> {
  if (inFlight) {
    if (!opts.full) return inFlight;
    fullRequested = true;
    // finita quella in corso, parte subito quella completa (vedi finally): aspettiamo anche lei
    return inFlight.then(() => inFlight ?? undefined);
  }
  if (opts.full) fullRequested = true;
  const full = fullRequested;
  fullRequested = false;
  inFlight = doRefresh(full).finally(() => {
    inFlight = null;
    lastRefreshAt = Date.now();
    const delay = nextDelay();
    if (syncStatus.value.error) syncStatus.value = { ...syncStatus.value, retryAt: Date.now() + delay };
    if (fullRequested) void refresh();
    else schedule(delay);
  });
  return inFlight;
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    stopTimer(); // niente richieste con l'app in background
    return;
  }
  if (Date.now() - lastRefreshAt > 5_000) void refresh();
  else schedule(nextDelay());
}

function onOnline(): void {
  failures = 0;
  void refresh();
}

let unsubscribeReset: (() => void) | null = null;

/** Avvia l'aggiornamento automatico (solo con app in primo piano). */
export function startSync(): void {
  if (running) return;
  running = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  unsubscribeReset = onChainReset(() => {
    generation++;
    cycle = 0;
    failures = 0;
    retryAfterMs = null;
    syncStatus.value = { loading: false, error: null, retryAt: null };
    void refresh({ full: true });
  });
  void refresh({ full: true });
}

export function stopSync(): void {
  running = false;
  stopTimer();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('online', onOnline);
  unsubscribeReset?.();
  unsubscribeReset = null;
}

// ---------------------------------------------------------------------------
// Fee consigliata
// ---------------------------------------------------------------------------

export interface FeeInfo {
  rate: number;
  fromApi: boolean;
  fetchedAt: number;
  network: string;
}

export const feeInfo = signal<FeeInfo | null>(null);

/** fee = max(fastestFee, 2) sat/vB; 2 sat/vB se l'endpoint non risponde. In cache per un minuto. */
export async function loadFeeRate(force = false): Promise<FeeInfo> {
  const current = feeInfo.value;
  const net = networkKey.value;
  if (!force && current && current.network === net && Date.now() - current.fetchedAt < CONFIG.FEE_CACHE_MS) return current;
  const fastest = await client.value.getFastestFee().catch(() => null);
  const info: FeeInfo = { rate: chooseFeeRate(fastest), fromApi: fastest !== null, fetchedAt: Date.now(), network: net };
  feeInfo.value = info;
  return info;
}
