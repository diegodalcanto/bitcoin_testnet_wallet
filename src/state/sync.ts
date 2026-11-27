import { signal } from '@preact/signals';
import {
  afterBlockTargets,
  baseTargets,
  coldTargets,
  emptyChain,
  staleTargets,
  updateSeen,
  type AddressChain,
  type ChainState,
  type RefreshMode,
  type TargetParams,
  type TipInfo,
} from '../chain';
import { CONFIG } from '../config';
import { EsploraError, type EsploraTx, type EsploraUtxo } from '../esplora';
import { outpointKey, prunePending, type AddressSet } from '../pending';
import { chooseFeeRate } from '../tx';
import { chain, client, keys, markChangeUsed, networkKey, onChainReset, pending, setChain, setPending } from './wallet';

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
let sweepRequested = false;
let cycle = 0;
/** Turno dei controlli degli indirizzi che di solito non si leggono. */
let coldTurn = 0;
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

function utxoFingerprint(utxos: EsploraUtxo[] | null | undefined): string {
  if (!utxos) return '';
  return utxos
    .map((u) => `${outpointKey(u)}:${u.value}:${u.status.confirmed ? 1 : 0}`)
    .sort()
    .join('|');
}

function confirmationsChanged(before: EsploraUtxo[] | undefined, after: EsploraUtxo[]): boolean {
  if (!before) return false;
  const status = new Map(before.map((u) => [outpointKey(u), u.status.confirmed]));
  return after.some((u) => status.get(outpointKey(u)) === false && u.status.confirmed);
}

/** La transazione spende monete del wallet (quindi non è un pagamento in arrivo). */
function isOwnSpend(tx: EsploraTx | undefined, own: AddressSet): boolean {
  return Boolean(tx?.vin.some((v) => v.prevout?.scriptpubkey_address !== undefined && own.has(v.prevout.scriptpubkey_address)));
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

class Stale extends Error {}

/**
 * Un aggiornamento normale = una chiamata (`/utxo` dell'indirizzo di ricezione). Gli indirizzi di resto
 * si leggono solo quando possono essere cambiati (vedi src/chain.ts): dopo un invio, dopo un nuovo
 * blocco, a turno ogni COLD_CHECK_EVERY aggiornamenti, tutti con "trascina per aggiornare".
 * Lo storico di un indirizzo si scarica solo se le sue monete cambiano; l'ultimo blocco ogni
 * TIP_CHECK_EVERY aggiornamenti o quando una moneta riceve la prima conferma.
 */
async function doRefresh(mode: RefreshMode): Promise<void> {
  const k = keys.value;
  if (!k) return;
  const api = client.value;
  const gen = generation;
  const check = () => {
    if (gen !== generation) throw new Stale();
  };
  syncStatus.value = { ...syncStatus.value, loading: true };
  try {
    const prev: ChainState = chain.value.address === k.address ? chain.value : emptyChain(k.address);
    const pendingBefore = pending.value;
    const params: TargetParams = {
      owned: [...k.owned.keys()],
      receive: k.address,
      nextChange: k.nextChange.address,
      chain: prev,
      pending: pendingBefore,
      mode,
    };
    const fresh = new Map<string, EsploraUtxo[]>();
    const read = async (addresses: Iterable<string>) => {
      for (const address of addresses) {
        if (fresh.has(address)) continue;
        fresh.set(address, await api.getUtxos(address));
        check();
      }
    };

    const targets = baseTargets(params);
    const stale = new Set(staleTargets(prev, params.owned, k.address));
    targets.push(...[...stale].filter((a) => !targets.includes(a)));
    if (mode === 'cycle' && cycle > 0 && cycle % CONFIG.COLD_CHECK_EVERY === 0) {
      const cold = coldTargets(params, new Set(targets));
      if (cold.length > 0) targets.push(cold[coldTurn++ % cold.length]!);
    }
    await read(targets);

    let tip: TipInfo | null = prev.tip;
    let tipChanged = false;
    const firstConfirmation = [...fresh].some(([a, utxos]) => confirmationsChanged(prev.addresses[a]?.utxos, utxos));
    if (mode !== 'cycle' || !tip || cycle % CONFIG.TIP_CHECK_EVERY === 0 || firstConfirmation) {
      const hash = await api.getTipHash();
      check();
      if (!tip || tip.hash !== hash) {
        const block = await api.getBlock(hash);
        check();
        tipChanged = tip !== null;
        tip = { hash, height: block.height, time: block.timestamp };
      }
    }
    // Nuovo blocco: le monete e le transazioni non confermate degli altri indirizzi possono essere cambiate.
    if (tipChanged) await read(afterBlockTargets(params, new Set(fresh.keys())));

    const forced = mode === 'cycle' ? new Set(stale) : new Set([...baseTargets({ ...params, mode: 'full' }), ...stale]);
    const now = Date.now();
    const addresses: Record<string, AddressChain> = { ...prev.addresses };
    const done = new Set<string>();
    const readTxs = async () => {
      for (const [address, utxos] of fresh) {
        if (done.has(address)) continue;
        done.add(address);
        const before = prev.addresses[address];
        let txs = before?.txs ?? null;
        const hasUnconfirmed = (txs ?? []).some((tx) => !tx.status.confirmed);
        if (forced.has(address) || txs === null || utxoFingerprint(utxos) !== utxoFingerprint(before?.utxos) || (tipChanged && hasUnconfirmed)) {
          txs = await api.getAddressTxs(address);
          check();
        }
        addresses[address] = { utxos, txs, updatedAt: now };
      }
    };
    await readTxs();
    // Gli storici appena letti possono mostrare transazioni che toccano altri resti (per esempio il resto
    // di un invio di cui non si è saputo l'esito): si leggono subito anche quelli.
    const nowStale = staleTargets({ ...prev, addresses }, params.owned, k.address, new Set(fresh.keys()));
    if (nowStale.length > 0) {
      nowStale.forEach((a) => forced.add(a));
      await read(nowStale);
      await readTxs();
    }

    // Avviso per i pagamenti in arrivo (non alla prima lettura di un indirizzo).
    const ownTxids = new Set(pendingBefore.map((p) => p.txid));
    const txById = new Map(Object.values(addresses).flatMap((d) => (d.txs ?? []).map((tx) => [tx.txid, tx] as const)));
    let incoming = 0;
    for (const [address, utxos] of fresh) {
      const before = prev.addresses[address];
      if (!before) continue;
      const known = new Set(before.utxos.map(outpointKey));
      for (const u of utxos) {
        if (!known.has(outpointKey(u)) && !ownTxids.has(u.txid) && !isOwnSpend(txById.get(u.txid), k.owned)) incoming += u.value;
      }
    }
    if (incoming > 0) lastIncoming.value = { amount: incoming, at: now };

    const seen = updateSeen(prev, addresses, pendingBefore, now);
    const view = {
      utxos: Object.values(addresses).flatMap((d) => d.utxos),
      txids: [...txById.keys()],
      spentOutpoints: [...txById.values()].flatMap((tx) => tx.vin.map(outpointKey)),
    };
    const pruned = prunePending(pending.value, view, now);
    if (pruned.length !== pending.value.length) setPending(pruned);

    setChain({ address: k.address, addresses, tip, seen, updatedAt: now });

    // Il prossimo indirizzo di resto risulta già usato (un invio di cui non si è saputo l'esito, un
    // ripristino senza rete…): il prossimo invio userà quello dopo, che si legge subito.
    const next = addresses[k.nextChange.address];
    if (k.nextChange.role === 'change' && next && (next.utxos.length > 0 || (next.txs ?? []).length > 0)) {
      markChangeUsed(k, k.nextChange.index + 1);
      fullRequested = true;
    }

    failures = 0;
    retryAfterMs = null;
    cycle++;
    syncStatus.value = { loading: false, error: null, retryAt: null };
  } catch (err) {
    if (err instanceof Stale || gen !== generation) return;
    failures++;
    const rateLimited = err instanceof EsploraError && err.kind === 'rate-limit';
    retryAfterMs = rateLimited ? ((err as EsploraError).retryAfterMs ?? null) : null;
    syncStatus.value = { loading: false, error: rateLimited ? 'rate-limit' : 'network', retryAt: null };
  }
}

/**
 * Aggiorna subito. Le richieste concorrenti si uniscono a quella in corso; con `full` (o `sweep`) la
 * promessa si risolve solo dopo un aggiornamento completo partito dopo la chiamata.
 * `sweep` legge tutti gli indirizzi del wallet: si usa solo con "trascina per aggiornare".
 */
export function refresh(opts: { full?: boolean; sweep?: boolean } = {}): Promise<void> {
  const complete = Boolean(opts.full || opts.sweep);
  if (inFlight) {
    if (!complete) return inFlight;
    fullRequested = true;
    if (opts.sweep) sweepRequested = true;
    // finita quella in corso, parte subito quella completa (vedi finally): aspettiamo anche lei
    return inFlight.then(() => inFlight ?? undefined);
  }
  if (complete) fullRequested = true;
  if (opts.sweep) sweepRequested = true;
  const mode: RefreshMode = sweepRequested ? 'sweep' : fullRequested ? 'full' : 'cycle';
  fullRequested = false;
  sweepRequested = false;
  inFlight = doRefresh(mode).finally(() => {
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
    coldTurn = 0;
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
