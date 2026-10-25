/**
 * Accesso a localStorage che non lancia mai eccezioni (navigazione privata, memoria piena,
 * dati del sito bloccati). Se localStorage non è disponibile si usa una mappa in memoria.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

function browserStore(): KeyValueStore {
  const fallback = memoryStore();
  let ls: Storage | null = null;
  try {
    ls = globalThis.localStorage ?? null;
    ls?.getItem('tw.probe');
  } catch {
    ls = null;
  }
  if (!ls) return fallback;
  const storage = ls;
  return {
    get(key) {
      try {
        return storage.getItem(key);
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
      } catch {
        fallback.remove(key);
      }
    },
  };
}

export const store: KeyValueStore = browserStore();

export function readJson<T>(kv: KeyValueStore, key: string): T | null {
  const raw = kv.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(kv: KeyValueStore, key: string, value: unknown): void {
  kv.set(key, JSON.stringify(value));
}

/** Chiavi usate in localStorage (prefisso `tw.` = testnet wallet). */
export const KEYS = {
  wallet: 'tw.wallet',
  settings: 'tw.settings',
  pin: 'tw.pin',
  installSeen: 'tw.installSeen',
  pending: (networkKey: string) => `tw.pending.${networkKey}`,
  cache: (networkKey: string) => `tw.cache.${networkKey}`,
} as const;

/** Chiede al browser di non cancellare i dati del sito (spec §4). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // non supportato
  }
  return false;
}
