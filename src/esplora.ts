import { CONFIG } from './config';

// ---------------------------------------------------------------------------
// Tipi delle risposte Esplora (solo i campi che usiamo)
// ---------------------------------------------------------------------------

export interface EsploraStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

export interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: EsploraStatus;
}

export interface EsploraVout {
  scriptpubkey: string;
  scriptpubkey_address?: string;
  scriptpubkey_type?: string;
  value: number;
}

export interface EsploraVin {
  txid: string;
  vout: number;
  prevout: EsploraVout | null;
  is_coinbase?: boolean;
  sequence?: number;
}

export interface EsploraTx {
  txid: string;
  version?: number;
  locktime?: number;
  vin: EsploraVin[];
  vout: EsploraVout[];
  size: number;
  weight: number;
  fee: number;
  status: EsploraStatus;
}

export interface EsploraBlock {
  id: string;
  height: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Errori
// ---------------------------------------------------------------------------

export type EsploraErrorKind = 'network' | 'timeout' | 'rate-limit' | 'http' | 'parse' | 'no-endpoint';

export class EsploraError extends Error {
  readonly kind: EsploraErrorKind;
  readonly status: number | undefined;
  /** Testo restituito dal server (per il broadcast contiene il motivo del rifiuto). */
  readonly body: string;
  readonly retryAfterMs: number | undefined;

  constructor(kind: EsploraErrorKind, message: string, opts: { status?: number; body?: string; retryAfterMs?: number } = {}) {
    super(message);
    this.name = 'EsploraError';
    this.kind = kind;
    this.status = opts.status;
    this.body = opts.body ?? '';
    this.retryAfterMs = opts.retryAfterMs;
  }

  /** Errori per cui ha senso provare l'endpoint di riserva. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'rate-limit' || (this.kind === 'http' && (this.status ?? 0) >= 500);
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface EsploraClientOptions {
  /** Endpoint in ordine di preferenza: primario, poi riserve. */
  endpoints: string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Dopo un passaggio alla riserva, per quanto restarci prima di riprovare il primario. */
  stickyMs?: number;
  now?: () => number;
}

type Parse = 'json' | 'text';

/**
 * Client minimale per le API Esplora (mempool.space, Blockstream o un server proprio).
 * Se il primario non risponde (rete, timeout, 429, 5xx) riprova sugli endpoint di riserva;
 * gli errori 4xx sono definitivi (es. transazione rifiutata) e non si ripetono altrove.
 */
export class EsploraClient {
  readonly endpoints: string[];
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly stickyMs: number;
  private readonly now: () => number;
  private preferred = 0;
  private stickyUntil = 0;

  constructor(opts: EsploraClientOptions) {
    this.endpoints = opts.endpoints.map((e) => e.replace(/\/+$/, ''));
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? CONFIG.REQUEST_TIMEOUT_MS;
    this.stickyMs = opts.stickyMs ?? CONFIG.FALLBACK_STICKY_MS;
    this.now = opts.now ?? Date.now;
  }

  /** Endpoint che ha risposto per ultimo (quello "in uso"). */
  get activeEndpoint(): string | undefined {
    return this.endpoints[this.currentStart()];
  }

  private currentStart(): number {
    if (this.preferred !== 0 && this.now() >= this.stickyUntil) this.preferred = 0;
    return this.preferred;
  }

  private async fetchOnce(url: string, init: RequestInit, parse: Parse): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: controller.signal, cache: 'no-store' });
    } catch (err) {
      const aborted = controller.signal.aborted;
      throw new EsploraError(aborted ? 'timeout' : 'network', aborted ? 'Timeout' : String((err as Error)?.message ?? err));
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
        throw new EsploraError('rate-limit', 'Troppe richieste', { status: 429, body, retryAfterMs });
      }
      throw new EsploraError('http', `HTTP ${res.status}`, { status: res.status, body });
    }
    try {
      return parse === 'json' ? await res.json() : (await res.text()).trim();
    } catch {
      throw new EsploraError('parse', 'Risposta non valida');
    }
  }

  private async request<T>(path: string, parse: Parse, init: RequestInit = {}): Promise<T> {
    const count = this.endpoints.length;
    if (count === 0) throw new EsploraError('no-endpoint', 'Nessun server configurato');
    const start = this.currentStart();
    let lastError: EsploraError | undefined;
    for (let i = 0; i < count; i++) {
      const index = (start + i) % count;
      try {
        const result = await this.fetchOnce(`${this.endpoints[index]}${path}`, init, parse);
        if (index !== this.preferred) {
          this.preferred = index;
          this.stickyUntil = this.now() + this.stickyMs;
        }
        return result as T;
      } catch (err) {
        const e = err instanceof EsploraError ? err : new EsploraError('network', String(err));
        if (!e.retryable) throw e;
        lastError = e;
      }
    }
    throw lastError ?? new EsploraError('network', 'Nessun server raggiungibile');
  }

  getUtxos(address: string): Promise<EsploraUtxo[]> {
    return this.request<EsploraUtxo[]>(`/address/${address}/utxo`, 'json');
  }

  /** Storico: transazioni in mempool + prime 25 confermate. */
  getAddressTxs(address: string): Promise<EsploraTx[]> {
    return this.request<EsploraTx[]>(`/address/${address}/txs`, 'json');
  }

  getTx(txid: string): Promise<EsploraTx> {
    return this.request<EsploraTx>(`/tx/${txid}`, 'json');
  }

  getTxHex(txid: string): Promise<string> {
    return this.request<string>(`/tx/${txid}/hex`, 'text');
  }

  getTipHash(): Promise<string> {
    return this.request<string>('/blocks/tip/hash', 'text');
  }

  getBlock(hash: string): Promise<EsploraBlock> {
    return this.request<EsploraBlock>(`/block/${hash}`, 'json');
  }

  getBlockHash(height: number): Promise<string> {
    return this.request<string>(`/block-height/${height}`, 'text');
  }

  /**
   * Fee "più veloce" in sat/vB: `/v1/fees/recommended` (mempool.space) oppure
   * `/fee-estimates` (Esplora standard). null se nessuno dei due risponde.
   */
  async getFastestFee(): Promise<number | null> {
    try {
      const fees = await this.request<{ fastestFee?: unknown }>('/v1/fees/recommended', 'json');
      if (typeof fees.fastestFee === 'number' && fees.fastestFee > 0) return fees.fastestFee;
    } catch {
      // endpoint specifico di mempool.space: proviamo quello standard
    }
    try {
      const estimates = await this.request<Record<string, unknown>>('/fee-estimates', 'json');
      const next = estimates['1'] ?? estimates['2'];
      if (typeof next === 'number' && next > 0) return next;
    } catch {
      // nessuna stima disponibile
    }
    return null;
  }

  /** Trasmette una transazione (hex) e restituisce il txid. */
  broadcast(hex: string): Promise<string> {
    return this.request<string>('/tx', 'text', {
      method: 'POST',
      body: hex,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
