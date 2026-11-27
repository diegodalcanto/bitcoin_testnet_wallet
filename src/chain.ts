import type { EsploraTx, EsploraUtxo } from './esplora';
import { outpointKey, pendingAddresses, type AddressedUtxo, type AddressSet, type PendingTx } from './pending';

/**
 * Dati letti dalla blockchain per un wallet: un indirizzo di ricezione fisso e gli indirizzi di resto
 * (uno nuovo a ogni invio). Logica pura: cache, migrazione e scelta degli indirizzi da leggere.
 */

export interface TipInfo {
  hash: string;
  height: number;
  /** Orario del blocco in secondi. */
  time: number;
}

/** Dati letti dall'API per un indirizzo del wallet. */
export interface AddressChain {
  utxos: EsploraUtxo[];
  /** Storico dell'indirizzo (null finché non è stato scaricato). */
  txs: EsploraTx[] | null;
  /** Ultimo aggiornamento riuscito (ms). */
  updatedAt: number;
}

export interface ChainState {
  /** Indirizzo di ricezione del wallet a cui si riferiscono i dati. */
  address: string | null;
  /** Dati di ogni indirizzo del wallet (ricezione e resti) già letto dall'API. */
  addresses: Record<string, AddressChain>;
  tip: TipInfo | null;
  /** Quando il wallet ha visto arrivare ogni transazione (ms): serve a ordinare lo storico. */
  seen: Record<string, number>;
  /** Ultimo aggiornamento riuscito (ms). */
  updatedAt: number | null;
}

export function emptyChain(address: string | null): ChainState {
  return { address, addresses: {}, tip: null, seen: {}, updatedAt: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAddressChain(value: unknown): value is AddressChain {
  return (
    isRecord(value) &&
    Array.isArray(value.utxos) &&
    (value.txs === null || Array.isArray(value.txs)) &&
    typeof value.updatedAt === 'number'
  );
}

/**
 * Cache salvata → stato del wallet con indirizzo di ricezione `address`. Converte anche il formato
 * delle versioni precedenti, con un solo indirizzo: `{ address, utxos, txs, tip, updatedAt }`.
 */
export function parseChainCache(value: unknown, address: string | null): ChainState {
  if (!address || !isRecord(value) || value.address !== address) return emptyChain(address);
  const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : null;
  const addresses: Record<string, AddressChain> = {};
  if (isRecord(value.addresses)) {
    for (const [a, data] of Object.entries(value.addresses)) if (isAddressChain(data)) addresses[a] = data;
  } else if (Array.isArray(value.utxos)) {
    addresses[address] = {
      utxos: value.utxos as EsploraUtxo[],
      txs: Array.isArray(value.txs) ? (value.txs as EsploraTx[]) : null,
      updatedAt: updatedAt ?? 0,
    };
  }
  const seen: Record<string, number> = {};
  if (isRecord(value.seen)) for (const [txid, at] of Object.entries(value.seen)) if (typeof at === 'number') seen[txid] = at;
  const tip = isRecord(value.tip) ? (value.tip as unknown as TipInfo) : null;
  return { address, addresses, tip, seen, updatedAt };
}

/** Qualsiasi indirizzo: per leggere la cache di un wallet diverso da quello in uso. */
export const ANY_ADDRESS: AddressSet = { has: () => true };

/** UTXO di tutti gli indirizzi del wallet letti dall'API, ognuno con il suo indirizzo. */
export function chainUtxos(chain: ChainState, own: AddressSet): AddressedUtxo[] {
  return Object.entries(chain.addresses).flatMap(([address, data]) =>
    own.has(address) ? data.utxos.map((u) => ({ ...u, address })) : [],
  );
}

/** Storico di tutti gli indirizzi del wallet (con doppioni: buildHistory li unisce). */
export function chainTxs(chain: ChainState, own: AddressSet): EsploraTx[] {
  return Object.entries(chain.addresses).flatMap(([address, data]) => (own.has(address) ? (data.txs ?? []) : []));
}

/** Monete ("txid:vout") spese dalle transazioni dello storico del wallet che l'API conosce. */
export function chainSpent(chain: ChainState, own: AddressSet): Set<string> {
  return new Set(chainTxs(chain, own).flatMap((tx) => tx.vin.map((v) => outpointKey(v))));
}

/** Una transazione dello storico del wallet; se compare in più indirizzi, la copia confermata. */
export function findTx(chain: ChainState, own: AddressSet, txid: string): EsploraTx | undefined {
  let found: EsploraTx | undefined;
  for (const tx of chainTxs(chain, own)) {
    if (tx.txid !== txid) continue;
    if (tx.status.confirmed) return tx;
    found ??= tx;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Quali indirizzi leggere
// ---------------------------------------------------------------------------

export type RefreshMode =
  /** Aggiornamento periodico (ogni 15 s). */
  | 'cycle'
  /** All'avvio, dopo un cambio di wallet o di rete, dopo un invio. */
  | 'full'
  /** "Trascina per aggiornare": tutti gli indirizzi del wallet. */
  | 'sweep';

export interface TargetParams {
  /** Indirizzi del wallet in ordine: ricezione, resti già usati, prossimo resto. */
  owned: string[];
  receive: string;
  /** Prossimo indirizzo di resto: non è ancora stato usato. */
  nextChange: string;
  chain: ChainState;
  pending: PendingTx[];
  mode: RefreshMode;
}

function hasUnconfirmedTx(data: AddressChain): boolean {
  return (data.txs ?? []).some((tx) => !tx.status.confirmed);
}

/**
 * Indirizzi da leggere subito. Per rispettare i limiti delle API se ne leggono il meno possibile: le
 * monete di un indirizzo di resto cambiano solo quando le spende questo wallet o quando arriva un blocco.
 * - sempre: l'indirizzo di ricezione (i pagamenti arrivano lì), quelli toccati da una transazione appena
 *   inviata da qui (finché l'API non la vede) e quelli mai letti (tranne il prossimo resto, ancora vuoto);
 * - con `full`: anche quelli con monete o con transazioni non confermate;
 * - con `sweep`: tutti.
 * Vedi anche staleTargets (letture non coerenti tra loro).
 */
export function baseTargets(p: TargetParams): string[] {
  const owned = new Set(p.owned);
  const wanted = new Set<string>([p.receive]);
  for (const a of pendingAddresses(p.pending)) wanted.add(a);
  for (const a of p.owned) {
    const data = p.chain.addresses[a];
    if (p.mode === 'sweep') wanted.add(a);
    else if (!data) {
      if (a !== p.nextChange) wanted.add(a);
    } else if (p.mode === 'full' && (data.utxos.length > 0 || hasUnconfirmedTx(data))) wanted.add(a);
  }
  return p.owned.filter((a) => wanted.has(a) && owned.has(a));
}

/** Dopo un nuovo blocco: gli indirizzi con monete o transazioni ancora non confermate. */
export function afterBlockTargets(p: TargetParams, already: ReadonlySet<string>): string[] {
  return p.owned.filter((a) => {
    if (already.has(a)) return false;
    const data = p.chain.addresses[a];
    return Boolean(data && (data.utxos.some((u) => !u.status.confirmed) || hasUnconfirmedTx(data)));
  });
}

/**
 * Indirizzi di resto da rileggere perché la loro lettura non è coerente con il resto del wallet: una
 * transazione nello storico di un altro indirizzo li tocca, ma il loro storico non la contiene (un invio
 * di cui non si è saputo l'esito, un resto letto quando era ancora vuoto, lo stesso wallet usato su un
 * altro telefono…). Si rileggono monete e storico. L'indirizzo di ricezione si legge già sempre.
 */
export function staleTargets(chain: ChainState, owned: readonly string[], receive: string, already: ReadonlySet<string> = new Set()): string[] {
  const own = new Set(owned);
  const listed = new Map(Object.entries(chain.addresses).map(([a, d]) => [a, new Set((d.txs ?? []).map((tx) => tx.txid))]));
  const stale = new Set<string>();
  for (const [address, data] of Object.entries(chain.addresses)) {
    if (!own.has(address)) continue;
    for (const tx of data.txs ?? []) {
      const touched = [...tx.vin.map((v) => v.prevout?.scriptpubkey_address), ...tx.vout.map((o) => o.scriptpubkey_address)];
      for (const other of touched) {
        if (!other || other === address || other === receive || !own.has(other) || already.has(other)) continue;
        if (!listed.get(other)?.has(tx.txid)) stale.add(other);
      }
    }
  }
  return owned.filter((a) => stale.has(a));
}

/**
 * Indirizzi che di solito non si leggono (resti già spesi, prossimo resto): ogni tanto se ne controlla
 * uno a turno, nel caso qualcuno ci abbia mandato dei sats.
 */
export function coldTargets(p: TargetParams, already: ReadonlySet<string>): string[] {
  return p.owned.filter((a) => !already.has(a));
}

/**
 * Orari di arrivo delle transazioni dello storico. Una transazione mai vista prende `now` (o l'orario
 * dell'invio, se è partita da qui); quelle trovate alla prima lettura del wallet restano senza orario
 * (non si sa quando sono arrivate). Si tengono solo le transazioni ancora nello storico.
 */
export function updateSeen(
  prev: ChainState,
  addresses: Record<string, AddressChain>,
  pending: PendingTx[],
  now: number,
): Record<string, number> {
  const createdAt = new Map(pending.map((p) => [p.txid, p.createdAt]));
  const before = new Set(Object.values(prev.addresses).flatMap((d) => (d.txs ?? []).map((tx) => tx.txid)));
  const firstLoad = Object.values(prev.addresses).every((d) => d.txs === null);
  const seen: Record<string, number> = {};
  for (const data of Object.values(addresses)) {
    for (const { txid } of data.txs ?? []) {
      if (seen[txid] !== undefined) continue;
      const at = prev.seen[txid] ?? createdAt.get(txid) ?? (before.has(txid) || firstLoad ? undefined : now);
      if (at !== undefined) seen[txid] = at;
    }
  }
  return seen;
}
