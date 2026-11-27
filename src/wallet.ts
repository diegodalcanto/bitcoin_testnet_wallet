import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { networks, payments } from 'bitcoinjs-lib';
import { ECPairFactory, type ECPairInterface } from 'ecpair';
import { CONFIG } from './config';
import { ecc } from './ecc';
import { BITCOIN_NETWORK } from './networks';
import { KEYS, readJson, writeJson, type KeyValueStore } from './storage';

export const ECPair = ECPairFactory(ecc);

/** Byte di versione delle chiavi estese di rete test: tprv/tpub (BIP32) e vprv/vpub (BIP84). */
const TPUB_VERSIONS = { private: 0x04358394, public: 0x043587cf };
const VPUB_VERSIONS = { private: 0x045f18bc, public: 0x045f1cf6 };

export const WORDLIST: readonly string[] = wordlist;
const WORDSET = new Set(wordlist);
const VALID_WORD_COUNTS = [12, 15, 18, 21, 24];

/** Come il wallet è salvato in localStorage: la frase in chiaro va bene solo perché è una rete di test. */
export type StoredWallet =
  | {
      v: 1;
      kind: 'mnemonic';
      mnemonic: string;
      createdAt: number;
      /** Quanti wallet (indirizzi m/84'/1'/0'/0/n) sono stati ricavati da questa frase; se manca, 1. */
      count?: number;
      /** Indice del wallet in uso, da 0; se manca, 0. */
      active?: number;
    }
  | { v: 1; kind: 'wif'; wif: string; createdAt: number };

export interface WalletKeys {
  kind: StoredWallet['kind'];
  /** Frase di recupero (solo per wallet creati o ripristinati da 12 parole). */
  mnemonic: string | null;
  /** Percorso di derivazione dell'indirizzo, es. m/84'/1'/0'/0/0. */
  path: string | null;
  /** Indice del wallet ricavato dalla frase (null per una WIF importata). */
  index: number | null;
  privateKey: Uint8Array;
  /** Chiave pubblica compressa (33 byte). */
  publicKey: Uint8Array;
  /** Chiave privata in formato WIF di rete test (inizia con "c"). */
  wif: string;
  /** Indirizzo P2WPKH `tb1q…`, unico e riusato. */
  address: string;
  /** Script di output dell'indirizzo (serve per firmare con witnessUtxo). */
  outputScript: Uint8Array;
  /** Chiave pubblica estesa dell'account m/84'/1'/0' (tpub e vpub). */
  tpub: string | null;
  vpub: string | null;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** 128 bit casuali da crypto.getRandomValues → 12 parole BIP39 (lista inglese). */
export function generateMnemonic(random: (length: number) => Uint8Array = randomBytes): string {
  return entropyToMnemonic(random(16), wordlist);
}

function keysFromPrivateKey(privateKey: Uint8Array): Pick<WalletKeys, 'privateKey' | 'publicKey' | 'wif' | 'address' | 'outputScript'> {
  const pair = ECPair.fromPrivateKey(privateKey, { network: BITCOIN_NETWORK, compressed: true });
  const payment = payments.p2wpkh({ pubkey: pair.publicKey, network: BITCOIN_NETWORK });
  if (!payment.address || !payment.output) throw new Error('Impossibile calcolare l’indirizzo');
  return {
    privateKey,
    publicKey: pair.publicKey,
    wif: pair.toWIF(),
    address: payment.address,
    outputScript: payment.output,
  };
}

/** Percorso del wallet n (da 0): stesso account BIP84, indirizzo di ricezione n. */
export function walletPath(index: number): string {
  return `${CONFIG.RECEIVE_PATH}/${index}`;
}

/** La derivazione BIP39 (2048 giri di PBKDF2) è lenta: si ricorda l'ultima frase usata. */
let derivationCache: { mnemonic: string; account: HDKey; receive: HDKey } | null = null;

function accountNodes(mnemonic: string): { account: HDKey; receive: HDKey } {
  if (derivationCache?.mnemonic !== mnemonic) {
    const account = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic), TPUB_VERSIONS).derive(CONFIG.ACCOUNT_PATH);
    derivationCache = { mnemonic, account, receive: account.deriveChild(0) };
  }
  return derivationCache;
}

/**
 * Frase → seme (BIP39) → account BIP84 m/84'/1'/0' → indirizzo di ricezione `index`.
 * Wallet gerarchico: dalla stessa frase si ricavano tutti i wallet, uno per indice.
 */
export function keysFromMnemonic(mnemonic: string, index = 0): WalletKeys {
  const { account, receive } = accountNodes(mnemonic);
  const node = receive.deriveChild(index);
  if (!node.privateKey || !account.publicKey || !account.chainCode) throw new Error('Derivazione non riuscita');
  const vpubNode = new HDKey({
    versions: VPUB_VERSIONS,
    depth: account.depth,
    index: account.index,
    parentFingerprint: account.parentFingerprint,
    chainCode: account.chainCode,
    publicKey: account.publicKey,
  });
  return {
    kind: 'mnemonic',
    mnemonic,
    path: walletPath(index),
    index,
    ...keysFromPrivateKey(node.privateKey),
    tpub: account.publicExtendedKey,
    vpub: vpubNode.publicExtendedKey,
  };
}

/** Chiave singola importata come WIF di rete test: niente frase, niente derivazione. */
export function keysFromWif(wif: string): WalletKeys {
  const pair = ECPair.fromWIF(wif, BITCOIN_NETWORK);
  if (!pair.privateKey) throw new Error('WIF senza chiave privata');
  return {
    kind: 'wif',
    mnemonic: null,
    path: null,
    index: null,
    ...keysFromPrivateKey(pair.privateKey),
    tpub: null,
    vpub: null,
  };
}

export function keysFromStored(wallet: StoredWallet): WalletKeys {
  return wallet.kind === 'mnemonic' ? keysFromMnemonic(wallet.mnemonic, activeIndex(wallet)) : keysFromWif(wallet.wif);
}

// ---------------------------------------------------------------------------
// Più wallet dalla stessa frase
// ---------------------------------------------------------------------------

function clampIndex(value: number, max: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), max) : 0;
}

/** Quanti wallet sono stati ricavati dalla frase (una WIF importata ne ha sempre uno solo). */
export function walletCount(wallet: StoredWallet): number {
  if (wallet.kind !== 'mnemonic') return 1;
  const count = wallet.count ?? 1;
  return Number.isInteger(count) ? Math.min(Math.max(count, 1), CONFIG.MAX_WALLETS) : 1;
}

/** Indice del wallet in uso. */
export function activeIndex(wallet: StoredWallet): number {
  return wallet.kind === 'mnemonic' ? clampIndex(wallet.active ?? 0, walletCount(wallet) - 1) : 0;
}

/** Si può ricavare un altro wallet? Serve una frase (non una WIF) e un posto libero. */
export function canAddWallet(wallet: StoredWallet): boolean {
  return wallet.kind === 'mnemonic' && walletCount(wallet) < CONFIG.MAX_WALLETS;
}

/** Aggiunge il wallet successivo (indirizzo m/84'/1'/0'/0/n) e lo rende quello in uso. */
export function withNewWallet(wallet: StoredWallet): StoredWallet | null {
  if (wallet.kind !== 'mnemonic' || !canAddWallet(wallet)) return null;
  const count = walletCount(wallet) + 1;
  return { ...wallet, count, active: count - 1 };
}

export function withActiveWallet(wallet: StoredWallet, index: number): StoredWallet {
  if (wallet.kind !== 'mnemonic') return wallet;
  return { ...wallet, active: clampIndex(index, walletCount(wallet) - 1) };
}

/** Dopo un ripristino: quanti wallet risultano già usati (senza cambiare quello in uso). */
export function withWalletCount(wallet: StoredWallet, count: number): StoredWallet {
  if (wallet.kind !== 'mnemonic') return wallet;
  return { ...wallet, count: Math.min(Math.max(count, 1), CONFIG.MAX_WALLETS) };
}

/** Indirizzo del wallet `index` ricavato dalla frase. */
export function walletAddress(mnemonic: string, index: number): string {
  return keysFromMnemonic(mnemonic, index).address;
}

/** Firmatario per bitcoinjs-lib. */
export function signerFor(keys: WalletKeys): ECPairInterface {
  return ECPair.fromPrivateKey(keys.privateKey, { network: BITCOIN_NETWORK, compressed: true });
}

// ---------------------------------------------------------------------------
// Ripristino
// ---------------------------------------------------------------------------

export type ImportError =
  | { code: 'empty' }
  | { code: 'mainnet-key' }
  | { code: 'extended-key' }
  | { code: 'uncompressed-wif' }
  | { code: 'word-count'; count: number }
  | { code: 'unknown-words'; words: string[] }
  | { code: 'checksum' }
  | { code: 'invalid' };

export type ImportResult = { ok: true; wallet: StoredWallet } | { ok: false; error: ImportError };

/** Le parole BIP39 inglesi sono identificate dalle prime 4 lettere: "abou" → "about". */
export function completeWord(token: string): string | null {
  if (WORDSET.has(token)) return token;
  if (token.length < 4) return null;
  const prefix = token.slice(0, 4);
  const matches = wordlist.filter((w) => w.startsWith(prefix));
  if (matches.length !== 1) return null;
  const [match] = matches;
  return match && match.startsWith(token) ? match : null;
}

/** Ripulisce una frase scritta a mano: minuscole, spazi singoli, niente numerazione "1." "2)". */
export function normalizeMnemonicWords(input: string): string[] {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^\d+[.)]?$/, ''))
    .map((t) => t.replace(/^\d+[.)]/, ''))
    .filter((t) => t.length > 0);
}

function parseMnemonic(input: string, now: number): ImportResult {
  const tokens = normalizeMnemonicWords(input);
  if (!VALID_WORD_COUNTS.includes(tokens.length)) {
    return { ok: false, error: { code: 'word-count', count: tokens.length } };
  }
  const words: string[] = [];
  const unknown: string[] = [];
  for (const token of tokens) {
    const word = completeWord(token);
    if (word) words.push(word);
    else unknown.push(token);
  }
  if (unknown.length > 0) return { ok: false, error: { code: 'unknown-words', words: unknown } };
  const mnemonic = words.join(' ');
  if (!validateMnemonic(mnemonic, wordlist)) return { ok: false, error: { code: 'checksum' } };
  return { ok: true, wallet: { v: 1, kind: 'mnemonic', mnemonic, createdAt: now } };
}

function parseSingleKey(token: string, now: number): ImportResult {
  if (/^[xyzXYZ](prv|pub)/.test(token)) return { ok: false, error: { code: 'mainnet-key' } };
  if (/^[tuvTUV](prv|pub)/.test(token)) return { ok: false, error: { code: 'extended-key' } };
  try {
    const pair = ECPair.fromWIF(token, BITCOIN_NETWORK);
    if (!pair.compressed) return { ok: false, error: { code: 'uncompressed-wif' } };
    return { ok: true, wallet: { v: 1, kind: 'wif', wif: token, createdAt: now } };
  } catch {
    // non è una WIF di rete test
  }
  try {
    ECPair.fromWIF(token, networks.bitcoin);
    return { ok: false, error: { code: 'mainnet-key' } };
  } catch {
    // non è nemmeno una WIF di mainnet
  }
  return { ok: false, error: { code: 'invalid' } };
}

/**
 * Riconosce cosa ha incollato l'utente: frase di 12 (o più) parole oppure WIF di rete test.
 * Le chiavi di mainnet vengono rifiutate con un errore dedicato (spec §4).
 */
export function parseImport(input: string, now = Date.now()): ImportResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: { code: 'empty' } };
  if (!/\s/.test(trimmed)) {
    const single = parseSingleKey(trimmed, now);
    if (single.ok || single.error.code !== 'invalid') return single;
    // una sola parola: probabilmente una frase incompleta
    if (/^[a-z]+$/i.test(trimmed)) return { ok: false, error: { code: 'word-count', count: 1 } };
    return single;
  }
  return parseMnemonic(trimmed, now);
}

// ---------------------------------------------------------------------------
// Persistenza
// ---------------------------------------------------------------------------

function isStoredWallet(value: unknown): value is StoredWallet {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  if (w.v !== 1 || typeof w.createdAt !== 'number') return false;
  if (w.kind === 'mnemonic') {
    const optionalInt = (n: unknown) => n === undefined || Number.isInteger(n);
    return typeof w.mnemonic === 'string' && optionalInt(w.count) && optionalInt(w.active);
  }
  if (w.kind === 'wif') return typeof w.wif === 'string';
  return false;
}

export function loadStoredWallet(kv: KeyValueStore): StoredWallet | null {
  const value = readJson<unknown>(kv, KEYS.wallet);
  return isStoredWallet(value) ? value : null;
}

export function saveStoredWallet(kv: KeyValueStore, wallet: StoredWallet): void {
  writeJson(kv, KEYS.wallet, wallet);
}

export function clearStoredWallet(kv: KeyValueStore): void {
  kv.remove(KEYS.wallet);
}

// ---------------------------------------------------------------------------
// Conferma della frase all'onboarding
// ---------------------------------------------------------------------------

/** Numero intero casuale in [0, max). */
export type RandomInt = (max: number) => number;

export const randomInt: RandomInt = (max) => {
  if (max <= 0) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
};

/** Sceglie `count` posizioni distinte (0-based, in ordine crescente) da far confermare. */
export function pickConfirmIndices(wordCount: number, count: number = CONFIG.WORDS_TO_CONFIRM, rnd: RandomInt = randomInt): number[] {
  const picked = new Set<number>();
  while (picked.size < Math.min(count, wordCount)) picked.add(rnd(wordCount));
  return [...picked].sort((a, b) => a - b);
}

/** Opzioni tra cui scegliere la parola giusta: quella corretta più `decoys` parole a caso. */
export function confirmOptions(correct: string, decoys = 3, rnd: RandomInt = randomInt): string[] {
  const options = new Set<string>([correct]);
  while (options.size < decoys + 1) options.add(wordlist[rnd(wordlist.length)] ?? correct);
  const list = [...options];
  for (let i = list.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [list[i], list[j]] = [list[j] as string, list[i] as string];
  }
  return list;
}
