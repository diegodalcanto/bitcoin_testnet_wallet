import { computed, signal } from '@preact/signals';
import { CONFIG } from '../config';
import type { EsploraTx, EsploraUtxo } from '../esplora';
import { EsploraClient } from '../esplora';
import { buildHistory } from '../history';
import { getNetworkInfo, type NetworkId } from '../networks';
import { loadPending, mergeUtxos, savePending, type PendingTx } from '../pending';
import { KEYS, readJson, removeByPrefix, requestPersistentStorage, store, writeJson } from '../storage';
import {
  activeIndex,
  clearStoredWallet,
  keysFromStored,
  loadStoredWallet,
  saveStoredWallet,
  walletAddress,
  walletCount,
  withActiveWallet,
  withNewWallet,
  withWalletCount,
  type StoredWallet,
} from '../wallet';
import { settings, updateSettings } from './settings';

// ---------------------------------------------------------------------------
// Wallet e chiavi
// ---------------------------------------------------------------------------

export const storedWallet = signal<StoredWallet | null>(loadStoredWallet(store));

/** Chiavi del wallet in uso (la derivazione BIP39, lenta, è ricordata in src/wallet.ts). */
export const keys = computed(() => (storedWallet.value ? keysFromStored(storedWallet.value) : null));

/** Wallet in uso (da 0) e quanti ne sono stati ricavati dalla stessa frase. */
export const walletIndex = computed(() => (storedWallet.value ? activeIndex(storedWallet.value) : 0));
export const walletTotal = computed(() => (storedWallet.value ? walletCount(storedWallet.value) : 0));

// ---------------------------------------------------------------------------
// Rete e client Esplora
// ---------------------------------------------------------------------------

export const networkInfo = computed(() => getNetworkInfo(settings.value.network, settings.value.customUrl));

export const networkKey = computed<NetworkId>(() => settings.value.network);

/** Stato locale e cache sono separati per rete e per indirizzo: ogni wallet ha i suoi. */
export const scope = computed(() => `${networkKey.value}.${keys.value?.address ?? '-'}`);

const endpointsKey = computed(() => networkInfo.value.endpoints.join('\n'));

/** Un client per rete: cambia solo quando cambiano gli endpoint. */
export const client = computed(() => new EsploraClient({ endpoints: endpointsKey.value ? endpointsKey.value.split('\n') : [] }));

// ---------------------------------------------------------------------------
// Dati letti dalla blockchain (con cache per l'apertura offline)
// ---------------------------------------------------------------------------

export interface TipInfo {
  hash: string;
  height: number;
  /** Orario del blocco in secondi. */
  time: number;
}

export interface ChainState {
  /** Indirizzo a cui si riferiscono i dati. */
  address: string | null;
  utxos: EsploraUtxo[] | null;
  txs: EsploraTx[] | null;
  tip: TipInfo | null;
  /** Ultimo aggiornamento riuscito (ms). */
  updatedAt: number | null;
}

const EMPTY_CHAIN: ChainState = { address: null, utxos: null, txs: null, tip: null, updatedAt: null };

function loadChainCache(scopeKey: string, address: string | null): ChainState {
  const cached = readJson<ChainState>(store, KEYS.cache(scopeKey));
  if (!cached || !address || cached.address !== address) return { ...EMPTY_CHAIN, address };
  return { ...EMPTY_CHAIN, ...cached };
}

export const chain = signal<ChainState>(loadChainCache(scope.value, keys.value?.address ?? null));

export function setChain(next: ChainState): void {
  chain.value = next;
  writeJson(store, KEYS.cache(scope.value), next);
}

export const pending = signal<PendingTx[]>(loadPending(store, scope.value));

export function setPending(next: PendingTx[]): void {
  pending.value = next;
  savePending(store, scope.value, next);
}

/** Ultimo saldo noto di un indirizzo sulla rete in uso, dalla cache (null se mai letto). */
export function cachedBalance(address: string): number | null {
  const scopeKey = `${networkKey.value}.${address}`;
  const cached = readJson<ChainState>(store, KEYS.cache(scopeKey));
  if (!cached?.utxos || cached.address !== address) return null;
  return mergeUtxos(cached.utxos, loadPending(store, scopeKey)).reduce((sum, u) => sum + u.value, 0);
}

/** Monete spendibili: UTXO dell'API + resti locali − monete spese localmente. */
export const spendable = computed(() => mergeUtxos(chain.value.utxos ?? [], pending.value));

export const balance = computed(() => {
  let confirmed = 0;
  let unconfirmed = 0;
  for (const u of spendable.value) {
    if (u.confirmed) confirmed += u.value;
    else unconfirmed += u.value;
  }
  return { total: confirmed + unconfirmed, confirmed, unconfirmed, count: spendable.value.length };
});

export const history = computed(() => {
  const address = keys.value?.address;
  return address ? buildHistory(chain.value.txs ?? [], pending.value, address) : [];
});

/** true finché non è arrivata nessuna risposta dall'API per questo indirizzo. */
export const neverLoaded = computed(() => chain.value.utxos === null);

// ---------------------------------------------------------------------------
// Azioni
// ---------------------------------------------------------------------------

type Listener = () => void;
const resetListeners = new Set<Listener>();

/** La sincronizzazione si registra qui per ripartire da zero dopo un cambio di rete o di wallet. */
export function onChainReset(listener: Listener): () => void {
  resetListeners.add(listener);
  return () => resetListeners.delete(listener);
}

function clearAllLocalState(): void {
  removeByPrefix(store, KEYS.pendingPrefix);
  removeByPrefix(store, KEYS.cachePrefix);
}

function reloadChainState(): void {
  chain.value = loadChainCache(scope.value, keys.value?.address ?? null);
  pending.value = loadPending(store, scope.value);
  resetListeners.forEach((l) => l());
}

function saveWallet(wallet: StoredWallet): void {
  saveStoredWallet(store, wallet);
  storedWallet.value = wallet;
}

/** Salva una frase nuova (creata o ripristinata) e azzera i dati di quella precedente. */
export function installWallet(wallet: StoredWallet): void {
  clearAllLocalState();
  saveWallet(wallet);
  void requestPersistentStorage();
  reloadChainState();
}

export function deleteWallet(): void {
  clearAllLocalState();
  clearStoredWallet(store);
  storedWallet.value = null;
  reloadChainState();
}

/** Passa a un altro wallet ricavato dalla stessa frase (ognuno ha saldo e stato locale suoi). */
export function selectWallet(index: number): void {
  const current = storedWallet.value;
  if (!current || index === activeIndex(current)) return;
  saveWallet(withActiveWallet(current, index));
  reloadChainState();
}

/** Ricava dalla stessa frase il wallet successivo e lo mette in uso. Restituisce il suo indice, o null. */
export function addWallet(): number | null {
  const current = storedWallet.value;
  const next = current ? withNewWallet(current) : null;
  if (!next) return null;
  saveWallet(next);
  reloadChainState();
  return activeIndex(next);
}

/**
 * Dopo un ripristino da 12 parole: cerca gli altri wallet già usati (indirizzi m/84'/1'/0'/0/1, /2…)
 * finché ne trova DISCOVERY_GAP di fila mai usati. Restituisce quanti wallet risultano in tutto.
 */
export async function discoverWallets(): Promise<number> {
  const start = storedWallet.value;
  if (!start || start.kind !== 'mnemonic') return walletTotal.value;
  const api = client.value;
  let used = walletCount(start);
  let gap = 0;
  for (let i = walletCount(start); i < CONFIG.MAX_WALLETS && gap < CONFIG.DISCOVERY_GAP; i++) {
    const stats = await api.getAddressStats(walletAddress(start.mnemonic, i));
    if (stats.chain_stats.tx_count + stats.mempool_stats.tx_count > 0) {
      used = i + 1;
      gap = 0;
    } else {
      gap++;
    }
  }
  const latest = storedWallet.value;
  // Se nel frattempo la frase è cambiata, non si tocca niente.
  if (latest?.kind === 'mnemonic' && latest.mnemonic === start.mnemonic && used > walletCount(latest)) {
    saveWallet(withWalletCount(latest, used));
  }
  return walletTotal.value;
}

/** Cambio rete: si azzera lo stato locale delle transazioni pendenti e si ricarica il saldo (spec §3). */
export function changeNetwork(network: NetworkId, customUrl?: string): void {
  removeByPrefix(store, KEYS.pendingPrefix);
  updateSettings(customUrl === undefined ? { network } : { network, customUrl });
  reloadChainState();
}
