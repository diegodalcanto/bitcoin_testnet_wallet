import { CONFIG } from './config';
import type { EsploraTx } from './esplora';
import type { AddressSet, PendingTx } from './pending';

/** Una riga dello storico, vista dal wallet (tutti i suoi indirizzi). */
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
  /** Secondi Unix: orario del blocco, dell'invio da qui o di quando il wallet l'ha vista arrivare. */
  time?: number;
  /** Nota solo localmente (l'API non l'ha ancora vista). */
  local: boolean;
  /** Indirizzo dell'altra parte, se ricavabile. */
  counterparty?: string;
}

/** Riga dello storico vista dal wallet: `own` = tutti i suoi indirizzi (ricezione e resti). */
export function summarizeTx(tx: EsploraTx, own: AddressSet): HistoryItem {
  let received = 0;
  let toOthers = 0;
  let counterpartyOut: string | undefined;
  for (const out of tx.vout) {
    if (out.scriptpubkey_address !== undefined && own.has(out.scriptpubkey_address)) received += out.value;
    else {
      toOthers += out.value;
      counterpartyOut ??= out.scriptpubkey_address;
    }
  }
  let spent = 0;
  let counterpartyIn: string | undefined;
  for (const input of tx.vin) {
    const from = input.prevout?.scriptpubkey_address;
    if (from !== undefined && own.has(from)) spent += input.prevout?.value ?? 0;
    else counterpartyIn ??= from;
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

export function summarizePending(p: PendingTx, own: AddressSet): HistoryItem {
  const self = own.has(p.recipient);
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

interface Row {
  item: HistoryItem;
  /** txid delle transazioni di cui spende le monete. */
  parents: string[];
  /** Quando il wallet l'ha vista per la prima volta (ms), se si sa. */
  seenAt: number | undefined;
  /** Posizione nella risposta dell'API (ultimo criterio, per un ordine stabile). */
  order: number;
}

/**
 * Storico del wallet su tutti i suoi indirizzi, dalla transazione più recente:
 * - prima quelle non confermate (comprese quelle inviate da qui che l'API non ha ancora visto), in
 *   ordine di arrivo (`seen`, `createdAt` per quelle inviate da qui): l'API elenca la mempool in un
 *   ordine che non è cronologico, e così un invio poteva finire sotto dieci pagamenti ricevuti;
 * - poi le confermate, dal blocco più recente.
 * Una transazione che spende le monete di un'altra viene sempre prima di lei (è successiva).
 * Una transazione presente nello storico di più indirizzi compare una volta sola.
 */
export function buildHistory(
  apiTxs: EsploraTx[],
  pending: PendingTx[],
  own: AddressSet,
  seen: Readonly<Record<string, number>> = {},
): HistoryItem[] {
  const createdAt = new Map(pending.map((p) => [p.txid, p.createdAt]));
  const rows = new Map<string, Row>();
  apiTxs.forEach((tx, order) => {
    const existing = rows.get(tx.txid);
    // Copie della stessa transazione da indirizzi diversi: si tiene la più aggiornata (confermata).
    if (existing && (existing.item.confirmed || !tx.status.confirmed)) return;
    rows.set(tx.txid, {
      item: summarizeTx(tx, own),
      parents: tx.vin.map((v) => v.txid),
      seenAt: createdAt.get(tx.txid) ?? seen[tx.txid],
      order: existing?.order ?? order,
    });
  });
  pending.forEach((p) => {
    if (rows.has(p.txid)) return;
    rows.set(p.txid, { item: summarizePending(p, own), parents: p.spent.map((o) => o.txid), seenAt: p.createdAt, order: -1 });
  });

  // Profondità nella catena di transazioni dello storico e "arrivo" coerente con la catena
  // (una transazione non può essere più vecchia di quelle di cui spende le monete).
  const rank = new Map<string, { depth: number; seenAt: number }>();
  const rankOf = (txid: string, visiting: Set<string>): { depth: number; seenAt: number } | null => {
    const known = rank.get(txid);
    if (known) return known;
    const row = rows.get(txid);
    if (!row || visiting.has(txid)) return null;
    visiting.add(txid);
    let depth = 0;
    let seenAt = row.seenAt ?? 0;
    for (const parent of row.parents) {
      const r = rankOf(parent, visiting);
      if (!r) continue;
      depth = Math.max(depth, r.depth + 1);
      seenAt = Math.max(seenAt, r.seenAt);
    }
    visiting.delete(txid);
    const result = { depth, seenAt };
    rank.set(txid, result);
    return result;
  };
  const sorted = [...rows.values()].map((row) => ({ row, ...rankOf(row.item.txid, new Set())! }));
  sorted.sort((a, b) => {
    const ca = a.row.item.confirmed;
    const cb = b.row.item.confirmed;
    if (ca !== cb) return ca ? 1 : -1;
    if (ca) {
      const height = (b.row.item.blockHeight ?? 0) - (a.row.item.blockHeight ?? 0);
      if (height !== 0) return height;
      if (a.depth !== b.depth) return b.depth - a.depth;
      if (a.seenAt !== b.seenAt) return b.seenAt - a.seenAt;
    } else {
      if (a.seenAt !== b.seenAt) return b.seenAt - a.seenAt;
      if (a.depth !== b.depth) return b.depth - a.depth;
    }
    return a.row.order - b.row.order;
  });
  return sorted.map(({ row }) => {
    const { item } = row;
    // Per quelle in mempool l'orario è quello in cui il wallet le ha viste arrivare.
    if (!item.confirmed && item.time === undefined && row.seenAt !== undefined) return { ...item, time: Math.floor(row.seenAt / 1000) };
    return item;
  });
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
