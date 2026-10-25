import { CONFIG } from './config';
import type { EsploraTx } from './esplora';
import type { PendingTx } from './pending';

/** Una riga dello storico, vista dal proprio indirizzo. */
export interface HistoryItem {
  txid: string;
  /** Entrata, uscita o trasferimento a sé stessi. */
  direction: 'in' | 'out' | 'self';
  /** Importo da mostrare: ricevuto (in), inviato ad altri (out), 0 (self). */
  amount: number;
  /** Variazione netta del saldo (fee compresa). */
  net: number;
  /** Fee pagata da noi (solo uscite e trasferimenti a sé). */
  fee: number | null;
  confirmed: boolean;
  blockHeight?: number;
  /** Secondi Unix: orario del blocco o dell'invio locale. */
  time?: number;
  /** Nota solo localmente (l'API non l'ha ancora vista). */
  local: boolean;
  /** Indirizzo dell'altra parte, se ricavabile. */
  counterparty?: string;
}

export function summarizeTx(tx: EsploraTx, myAddress: string): HistoryItem {
  let received = 0;
  let toOthers = 0;
  let counterpartyOut: string | undefined;
  for (const out of tx.vout) {
    if (out.scriptpubkey_address === myAddress) received += out.value;
    else {
      toOthers += out.value;
      counterpartyOut ??= out.scriptpubkey_address;
    }
  }
  let spent = 0;
  let counterpartyIn: string | undefined;
  for (const input of tx.vin) {
    if (input.prevout?.scriptpubkey_address === myAddress) spent += input.prevout.value;
    else counterpartyIn ??= input.prevout?.scriptpubkey_address;
  }
  const net = received - spent;
  const isOutgoing = spent > 0;
  const direction: HistoryItem['direction'] = !isOutgoing ? 'in' : toOthers === 0 ? 'self' : 'out';
  const item: HistoryItem = {
    txid: tx.txid,
    direction,
    amount: direction === 'in' ? received : direction === 'out' ? toOthers : 0,
    net,
    fee: isOutgoing ? tx.fee : null,
    confirmed: tx.status.confirmed,
    local: false,
  };
  if (tx.status.block_height !== undefined) item.blockHeight = tx.status.block_height;
  if (tx.status.block_time !== undefined) item.time = tx.status.block_time;
  const counterparty = direction === 'in' ? counterpartyIn : counterpartyOut;
  if (counterparty) item.counterparty = counterparty;
  return item;
}

export function summarizePending(p: PendingTx, myAddress: string): HistoryItem {
  const self = p.recipient === myAddress;
  return {
    txid: p.txid,
    direction: self ? 'self' : 'out',
    amount: self ? 0 : p.amount,
    net: self ? -p.fee : -(p.amount + p.fee),
    fee: p.fee,
    confirmed: false,
    time: Math.floor(p.createdAt / 1000),
    local: true,
    counterparty: p.recipient,
  };
}

/**
 * Storico = transazioni inviate localmente non ancora viste dall'API (le più recenti, in cima)
 * + storico dell'API (prima quelle in mempool, poi le confermate dalla più recente).
 */
export function buildHistory(apiTxs: EsploraTx[], pending: PendingTx[], myAddress: string): HistoryItem[] {
  const known = new Set(apiTxs.map((t) => t.txid));
  const localOnly = pending
    .filter((p) => !known.has(p.txid))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => summarizePending(p, myAddress));
  const fromApi = apiTxs.map((t) => summarizeTx(t, myAddress));
  const unconfirmed = fromApi.filter((t) => !t.confirmed);
  const confirmed = fromApi.filter((t) => t.confirmed).sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0));
  return [...localOnly, ...unconfirmed, ...confirmed];
}

/** Numero di conferme: 0 se in mempool, altrimenti blocchi dall'inclusione (compreso). */
export function confirmationsOf(blockHeight: number | undefined, tipHeight: number | null | undefined): number {
  if (blockHeight === undefined) return 0;
  if (!tipHeight || tipHeight < blockHeight) return 1;
  return tipHeight - blockHeight + 1;
}

/** "0", "1", … fino a "6+". */
export function confirmationsLabel(count: number): string {
  return count >= CONFIG.MAX_CONFIRMATIONS_SHOWN ? `${CONFIG.MAX_CONFIRMATIONS_SHOWN}+` : String(count);
}
