import { computed, signal } from '@preact/signals';
import { ANY_ADDRESS, chainSpent, chainTxs, chainUtxos, parseChainCache, type ChainState } from '../chain';
import { CONFIG } from '../config';
import { EsploraClient } from '../esplora';
import { buildHistory } from '../history';
import { getNetworkInfo, type NetworkId } from '../networks';
import { loadPending, mergeUtxos, savePending, type PendingTx } from '../pending';
import { KEYS, readJson, removeByPrefix, requestPersistentStorage, store, writeJson } from '../storage';
import {
  activeIndex,
  changeAddress,
  changeUsed,
  clearStoredWallet,
  keysFromStored,
  loadStoredWallet,
  saveStoredWallet,
  walletAddress,
  walletCount,
  withActiveWallet,
  withChangeUsed,
  withNewWallet,
  withWalletCount,
  type StoredWallet,
  type WalletKeys,
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

export type { ChainState, TipInfo } from '../chain';

function loadChainCache(scopeKey: string, address: string | null): ChainState {
  return parseChainCache(readJson<unknown>(store, KEYS.cache(scopeKey)), address);
}

/** Dati letti dall'API per tutti gli indirizzi del wallet in uso (ricezione e resti). */
export const chain = signal<ChainState>(loadChainCache(scope.value, keys.value?.address ?? null));

export function setChain(next: ChainState): void {
  chain.value = next;
  writeJson(store, KEYS.cache(scope.value), next);
}

function loadScopePending(): PendingTx[] {
  const address = keys.value?.address;
  return address ? loadPending(store, scope.value, address) : [];
}

export const pending = signal<PendingTx[]>(loadScopePending());

export function setPending(next: PendingTx[]): void {
  pending.value = next;
  savePending(store, scope.value, next);
}

/**
 * Ultimo saldo noto del wallet con indirizzo di ricezione `address` sulla rete in uso, dalla cache
 * (tutti i suoi indirizzi; null se mai letto).
 */
export function cachedBalance(address: string): number | null {
  const scopeKey = `${networkKey.value}.${address}`;
  const cached = loadChainCache(scopeKey, address);
  if (!cached.addresses[address]) return null;
  const coins = mergeUtxos(chainUtxos(cached, ANY_ADDRESS), loadPending(store, scopeKey, address), chainSpent(cached, ANY_ADDRESS));
  return coins.reduce((sum, u) => sum + u.value, 0);
}

/** Indirizzi del wallet in uso (ricezione, resti usati, prossimo resto). */
const owned = computed<ReadonlyMap<string, unknown>>(() => keys.value?.owned ?? new Map());

/** Monete spendibili su tutti gli indirizzi del wallet: UTXO dell'API + resti locali − monete spese localmente. */
export const spendable = computed(() =>
  mergeUtxos(chainUtxos(chain.value, owned.value), pending.value, chainSpent(chain.value, owned.value)),
);

/** Storico dell'API di tutti gli indirizzi del wallet (una transazione può comparire più volte). */
export const walletTxs = computed(() => chainTxs(chain.value, owned.value));

export const balance = computed(() => {
  let confirmed = 0;
  let unconfirmed = 0;
  for (const u of spendable.value) {
    if (u.confirmed) confirmed += u.value;
    else unconfirmed += u.value;
  }
  return { total: confirmed + unconfirmed, confirmed, unconfirmed, count: spendable.value.length };
});

export const history = computed(() => buildHistory(walletTxs.value, pending.value, owned.value, chain.value.seen));

/** true finché non è arrivata nessuna risposta dall'API per l'indirizzo di ricezione di questo wallet. */
export const neverLoaded = computed(() => {
  const address = keys.value?.address;
  return !address || !chain.value.addresses[address];
});

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
  pending.value = loadScopePending();
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

/**
 * Il wallet `k` ha usato i suoi indirizzi di resto fino a `count` (escluso): il prossimo invio userà
 * il successivo. Non fa nulla se nel frattempo è cambiato il wallet in uso.
 */
export function markChangeUsed(k: WalletKeys, count: number): void {
  const current = storedWallet.value;
  if (!current || current.kind !== 'mnemonic' || k.index === null || keys.value?.address !== k.address) return;
  const next = withChangeUsed(current, k.index, count);
  if (next !== current) saveWallet(next);
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
 * e, per ogni wallet, gli indirizzi di resto già usati (dove possono esserci i suoi sats), fermandosi
 * dopo DISCOVERY_GAP indirizzi di fila mai usati. Restituisce quanti wallet risultano in tutto.
 */
export async function discoverWallets(): Promise<number> {
  const start = storedWallet.value;
  if (!start || start.kind !== 'mnemonic') return walletTotal.value;
  const api = client.value;
  const isUsed = async (address: string) => {
    const stats = await api.getAddressStats(address);
    return stats.chain_stats.tx_count + stats.mempool_stats.tx_count > 0;
  };
  /** Primo indice dopo l'ultimo usato, a partire da `from`, con al massimo `limit` indici. */
  const scan = async (from: number, limit: number, addressAt: (i: number) => string) => {
    let used = from;
    let gap = 0;
    for (let i = from; i < limit && gap < CONFIG.DISCOVERY_GAP; i++) {
      if (await isUsed(addressAt(i))) {
        used = i + 1;
        gap = 0;
      } else {
        gap++;
      }
    }
    return used;
  };

  const wallets = await scan(walletCount(start), CONFIG.MAX_WALLETS, (i) => walletAddress(start.mnemonic, i));
  const changes: number[] = [];
  for (let w = 0; w < wallets; w++) {
    changes.push(await scan(changeUsed(start, w), Number.MAX_SAFE_INTEGER, (k) => changeAddress(start.mnemonic, w, k)));
  }

  const latest = storedWallet.value;
  // Se nel frattempo la frase è cambiata, non si tocca niente.
  if (latest?.kind === 'mnemonic' && latest.mnemonic === start.mnemonic) {
    let next = wallets > walletCount(latest) ? withWalletCount(latest, wallets) : latest;
    changes.forEach((count, w) => (next = withChangeUsed(next, w, count)));
    if (next !== latest) saveWallet(next);
  }
  return walletTotal.value;
}

/** Cambio rete: si azzera lo stato locale delle transazioni pendenti e si ricarica il saldo (spec §3). */
export function changeNetwork(network: NetworkId, customUrl?: string): void {
  removeByPrefix(store, KEYS.pendingPrefix);
  updateSettings(customUrl === undefined ? { network } : { network, customUrl });
  reloadChainState();
}
