import { computed, signal } from '@preact/signals';
import type { EsploraTx, EsploraUtxo } from '../esplora';
import { EsploraClient } from '../esplora';
import { buildHistory } from '../history';
import { getNetworkInfo, NETWORK_IDS, type NetworkId } from '../networks';
import { loadPending, mergeUtxos, savePending, type PendingTx } from '../pending';
import { KEYS, readJson, requestPersistentStorage, store, writeJson } from '../storage';
import { clearStoredWallet, keysFromStored, loadStoredWallet, saveStoredWallet, type StoredWallet } from '../wallet';
import { settings, updateSettings } from './settings';

// ---------------------------------------------------------------------------
// Wallet e chiavi
// ---------------------------------------------------------------------------

export const storedWallet = signal<StoredWallet | null>(loadStoredWallet(store));

/** Chiavi derivate (calcolate una volta sola per wallet: la derivazione BIP39 è lenta). */
export const keys = computed(() => (storedWallet.value ? keysFromStored(storedWallet.value) : null));

// ---------------------------------------------------------------------------
// Rete e client Esplora
// ---------------------------------------------------------------------------

export const networkInfo = computed(() => getNetworkInfo(settings.value.network, settings.value.customUrl));

/** Chiave dello stato locale per rete. */
export const networkKey = computed<NetworkId>(() => settings.value.network);

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

function loadChainCache(net: NetworkId, address: string | null): ChainState {
  const cached = readJson<ChainState>(store, KEYS.cache(net));
  if (!cached || !address || cached.address !== address) return { ...EMPTY_CHAIN, address };
  return { ...EMPTY_CHAIN, ...cached };
}

export const chain = signal<ChainState>(loadChainCache(networkKey.value, keys.value?.address ?? null));

export function setChain(next: ChainState): void {
  chain.value = next;
  writeJson(store, KEYS.cache(networkKey.value), next);
}

export const pending = signal<PendingTx[]>(loadPending(store, networkKey.value));

export function setPending(next: PendingTx[]): void {
  pending.value = next;
  savePending(store, networkKey.value, next);
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

function clearAllNetworkState(): void {
  for (const net of NETWORK_IDS) {
    savePending(store, net, []);
    store.remove(KEYS.cache(net));
  }
}

function reloadChainState(): void {
  chain.value = loadChainCache(networkKey.value, keys.value?.address ?? null);
  pending.value = loadPending(store, networkKey.value);
  resetListeners.forEach((l) => l());
}

/** Salva un nuovo wallet (creato o ripristinato) e azzera i dati del precedente. */
export function installWallet(wallet: StoredWallet): void {
  clearAllNetworkState();
  saveStoredWallet(store, wallet);
  storedWallet.value = wallet;
  void requestPersistentStorage();
  reloadChainState();
}

export function deleteWallet(): void {
  clearAllNetworkState();
  clearStoredWallet(store);
  storedWallet.value = null;
  reloadChainState();
}

/** Cambio rete: si azzera lo stato locale delle transazioni pendenti e si ricarica il saldo (spec §3). */
export function changeNetwork(network: NetworkId, customUrl?: string): void {
  const previous = networkKey.value;
  savePending(store, previous, []);
  updateSettings(customUrl === undefined ? { network } : { network, customUrl });
  savePending(store, network, []);
  reloadChainState();
}
