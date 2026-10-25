import { signal } from '@preact/signals';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { KEYS, readJson, store, writeJson } from '../storage';

/**
 * PIN facoltativo per aprire l'app. È solo un deterrente: salviamo un hash con sale,
 * ma la frase di recupero resta in chiaro (lo spieghiamo nell'app).
 */
interface StoredPin {
  salt: string;
  hash: string;
}

function loadPin(): StoredPin | null {
  const value = readJson<StoredPin>(store, KEYS.pin);
  return value && typeof value.salt === 'string' && typeof value.hash === 'string' ? value : null;
}

function hashPin(pin: string, salt: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}:${pin}`)));
}

export const pinEnabled = signal(loadPin() !== null);

/** All'apertura l'app è bloccata se c'è un PIN. */
export const locked = signal(pinEnabled.value);

export function verifyPin(pin: string): boolean {
  const stored = loadPin();
  return stored !== null && hashPin(pin, stored.salt) === stored.hash;
}

export function unlock(pin: string): boolean {
  if (!verifyPin(pin)) return false;
  locked.value = false;
  return true;
}

export function setPin(pin: string): void {
  const salt = bytesToHex(randomBytes(16));
  writeJson(store, KEYS.pin, { salt, hash: hashPin(pin, salt) } satisfies StoredPin);
  pinEnabled.value = true;
}

export function removePin(): void {
  store.remove(KEYS.pin);
  pinEnabled.value = false;
  locked.value = false;
}
