import { CONFIG } from './config';
import type { EsploraUtxo } from './esplora';
import { KEYS, readJson, writeJson, type KeyValueStore } from './storage';
import type { SignedTx, SpendableUtxo, TxPlan } from './tx';

/**
 * Stato locale delle transazioni appena inviate (spec §5): serve a ripuntare subito,
 * anche se l'API non ha ancora visto l'invio precedente.
 */
export interface PendingTx {
  txid: string;
  /** Momento dell'invio (ms). */
  createdAt: number;
  /** Transazione grezza: serve per ritrasmetterla se un server non la conosce. */
  hex: string;
  /** Monete spese da questa transazione. */
  spent: Outpoint[];
  /** Output verso il proprio indirizzo (di solito il resto). */
  ownOutputs: { vout: number; value: number }[];
  /** Per lo storico: destinatario, importo, fee, dimensione. */
  recipient: string;
  amount: number;
  fee: number;
  vsize: number;
}

export interface Outpoint {
  txid: string;
  vout: number;
}

export function outpointKey(o: Outpoint): string {
  return `${o.txid}:${o.vout}`;
}

/** Voce locale per una transazione appena trasmessa. */
export function pendingFromPlan(plan: TxPlan, signed: SignedTx, ownAddress: string, now: number): PendingTx {
  const recipient = plan.outputs.find((o) => o.kind === 'recipient');
  return {
    txid: signed.txid,
    createdAt: now,
    hex: signed.hex,
    spent: plan.inputs.map(({ txid, vout }) => ({ txid, vout })),
    ownOutputs: plan.outputs.flatMap((o, vout) => (o.address === ownAddress ? [{ vout, value: o.value }] : [])),
    recipient: recipient?.address ?? '',
    amount: plan.amount,
    fee: signed.fee,
    vsize: signed.vsize,
  };
}

/**
 * Monete spendibili = UTXO dell'API (confermati e no)
 *   + output verso di sé delle transazioni inviate localmente (non confermati)
 *   − monete già spese da transazioni inviate localmente.
 */
export function mergeUtxos(apiUtxos: EsploraUtxo[], pending: PendingTx[]): SpendableUtxo[] {
  const spentLocally = new Set(pending.flatMap((p) => p.spent.map(outpointKey)));
  const byKey = new Map<string, SpendableUtxo>();
  for (const u of apiUtxos) {
    byKey.set(outpointKey(u), {
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status.confirmed,
      local: false,
      blockHeight: u.status.block_height,
    });
  }
  for (const p of pending) {
    for (const o of p.ownOutputs) {
      const key = outpointKey({ txid: p.txid, vout: o.vout });
      if (!byKey.has(key)) byKey.set(key, { txid: p.txid, vout: o.vout, value: o.value, confirmed: false, local: true });
    }
  }
  return [...byKey.entries()]
    .filter(([key]) => !spentLocally.has(key))
    .map(([, utxo]) => utxo)
    .sort(compareUtxos);
}

/** Ordine stabile: prima le confermate (più vecchie prima), poi le altre. */
function compareUtxos(a: SpendableUtxo, b: SpendableUtxo): number {
  if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
  const ha = a.blockHeight ?? Number.MAX_SAFE_INTEGER;
  const hb = b.blockHeight ?? Number.MAX_SAFE_INTEGER;
  if (ha !== hb) return ha - hb;
  if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
  return a.vout - b.vout;
}

export interface ApiView {
  utxos: EsploraUtxo[];
  /** txid presenti nello storico dell'API (se disponibile). */
  txids?: Iterable<string>;
}

/**
 * L'API "riflette" una transazione locale quando la conosce (nello storico o tra gli UTXO)
 * e nessuna delle monete che ha speso risulta ancora non spesa nella stessa vista.
 */
export function isReflected(p: PendingTx, view: ApiView): boolean {
  const apiTxids = new Set(view.txids ?? []);
  const knows = apiTxids.has(p.txid) || view.utxos.some((u) => u.txid === p.txid);
  if (!knows) return false;
  const unspent = new Set(view.utxos.map(outpointKey));
  return !p.spent.some((o) => unspent.has(outpointKey(o)));
}

/** Elimina le voci locali riflesse dall'API o più vecchie di 30 minuti. */
export function prunePending(pending: PendingTx[], view: ApiView, now: number, expiryMs: number = CONFIG.PENDING_EXPIRY_MS): PendingTx[] {
  return pending.filter((p) => now - p.createdAt < expiryMs && !isReflected(p, view));
}

/** Rimuove una transazione locale e tutte quelle che ne spendono gli output (catena). */
export function dropWithDescendants(pending: PendingTx[], txid: string): PendingTx[] {
  const dropped = new Set([txid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of pending) {
      if (!dropped.has(p.txid) && p.spent.some((o) => dropped.has(o.txid))) {
        dropped.add(p.txid);
        changed = true;
      }
    }
  }
  return pending.filter((p) => !dropped.has(p.txid));
}

/** Transazioni locali in ordine di invio (i genitori prima dei figli). */
export function inBroadcastOrder(pending: PendingTx[]): PendingTx[] {
  return [...pending].sort((a, b) => a.createdAt - b.createdAt);
}

function isPendingTx(value: unknown): value is PendingTx {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.txid === 'string' &&
    typeof p.createdAt === 'number' &&
    typeof p.hex === 'string' &&
    Array.isArray(p.spent) &&
    Array.isArray(p.ownOutputs)
  );
}

/** Lo stato locale sta in localStorage, separato per rete. */
export function loadPending(kv: KeyValueStore, networkKey: string): PendingTx[] {
  const value = readJson<unknown>(kv, KEYS.pending(networkKey));
  return Array.isArray(value) ? value.filter(isPendingTx) : [];
}

export function savePending(kv: KeyValueStore, networkKey: string, pending: PendingTx[]): void {
  if (pending.length === 0) kv.remove(KEYS.pending(networkKey));
  else writeJson(kv, KEYS.pending(networkKey), pending);
}
