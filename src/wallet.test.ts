import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { describe, expect, it } from 'vitest';
import { memoryStore } from './storage';
import {
  ABANDON_ADDRESS,
  ABANDON_ADDRESS_1,
  ABANDON_ADDRESS_2,
  ABANDON_CHANGE_0,
  ABANDON_CHANGE_1,
  ABANDON_CHANGE_2,
  ABANDON_MNEMONIC,
  ABANDON_W2_CHANGE_0,
  ABANDON_TPRV,
  ABANDON_TPUB,
  ABANDON_VPUB,
  ABANDON_XPRV,
  KEY_ONE_ADDRESS,
  KEY_ONE_WIF_MAINNET,
  KEY_ONE_WIF_MAINNET_UNCOMPRESSED,
  KEY_ONE_WIF_TESTNET,
  KEY_ONE_WIF_TESTNET_UNCOMPRESSED,
} from './test/fixtures';
import { CONFIG } from './config';
import { BITCOIN_NETWORK } from './networks';
import {
  activeIndex,
  canAddWallet,
  changeAddress,
  changePath,
  changeUsed,
  clearStoredWallet,
  completeWord,
  confirmOptions,
  ECPair,
  generateMnemonic,
  keysFromMnemonic,
  keysFromStored,
  keysFromWif,
  loadStoredWallet,
  parseImport,
  pickConfirmIndices,
  saveStoredWallet,
  walletAddress,
  walletCount,
  withActiveWallet,
  withChangeUsed,
  withNewWallet,
  withWalletCount,
  type RandomInt,
  type StoredWallet,
} from './wallet';

/** Generatore pseudo-casuale deterministico per i test. */
function seededRandom(seed = 1): RandomInt {
  let s = seed;
  return (max) => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s % max;
  };
}

describe('vettori noti', () => {
  it('frase BIP39 → indirizzo BIP84 di rete test (m/84\'/1\'/0\'/0/0)', () => {
    const keys = keysFromMnemonic(ABANDON_MNEMONIC);
    expect(keys.address).toBe(ABANDON_ADDRESS);
    expect(keys.path).toBe("m/84'/1'/0'/0/0");
    expect(keys.tpub).toBe(ABANDON_TPUB);
    expect(keys.vpub).toBe(ABANDON_VPUB);
    expect(keys.publicKey).toHaveLength(33);
    expect(keys.wif.startsWith('c')).toBe(true);
  });

  it('da una WIF fissa esce l\'indirizzo atteso (vettore BIP173)', () => {
    const keys = keysFromWif(KEY_ONE_WIF_TESTNET);
    expect(keys.address).toBe(KEY_ONE_ADDRESS);
    expect(keys.wif).toBe(KEY_ONE_WIF_TESTNET);
    expect(keys.mnemonic).toBeNull();
    expect(keys.tpub).toBeNull();
  });

  it('la WIF esportata da una frase si reimporta con lo stesso indirizzo', () => {
    const fromMnemonic = keysFromMnemonic(ABANDON_MNEMONIC);
    expect(keysFromWif(fromMnemonic.wif).address).toBe(fromMnemonic.address);
  });

  it('dalla stessa frase si ottiene sempre lo stesso indirizzo', () => {
    const mnemonic = generateMnemonic();
    expect(keysFromMnemonic(mnemonic).address).toBe(keysFromMnemonic(mnemonic).address);
  });
});

describe('generateMnemonic', () => {
  it('128 bit di entropia → 12 parole valide', () => {
    const words = generateMnemonic().split(' ');
    expect(words).toHaveLength(12);
    expect(validateMnemonic(words.join(' '), wordlist)).toBe(true);
  });

  it('usa l\'entropia fornita (entropia zero → abandon … about)', () => {
    expect(generateMnemonic((n) => new Uint8Array(n))).toBe(ABANDON_MNEMONIC);
  });

  it('due frasi generate sono diverse', () => {
    expect(generateMnemonic()).not.toBe(generateMnemonic());
  });
});

describe('parseImport', () => {
  it('accetta 12 parole valide', () => {
    const result = parseImport(ABANDON_MNEMONIC, 1000);
    expect(result).toEqual({ ok: true, wallet: { v: 1, kind: 'mnemonic', mnemonic: ABANDON_MNEMONIC, createdAt: 1000 } });
  });

  it('ripulisce maiuscole, spazi, virgole e numerazione', () => {
    const messy = ABANDON_MNEMONIC.split(' ')
      .map((w, i) => `${i + 1}. ${w.toUpperCase()}`)
      .join(',\n  ');
    const result = parseImport(messy);
    expect(result.ok && result.wallet.kind === 'mnemonic' && result.wallet.mnemonic).toBe(ABANDON_MNEMONIC);
  });

  it('completa le parole scritte con le prime 4 lettere', () => {
    const short = ABANDON_MNEMONIC.split(' ')
      .map((w) => w.slice(0, 4))
      .join(' ');
    const result = parseImport(short);
    expect(result.ok && result.wallet.kind === 'mnemonic' && result.wallet.mnemonic).toBe(ABANDON_MNEMONIC);
  });

  it('segnala il numero di parole sbagliato', () => {
    const eleven = ABANDON_MNEMONIC.split(' ').slice(1).join(' ');
    expect(parseImport(eleven)).toEqual({ ok: false, error: { code: 'word-count', count: 11 } });
    expect(parseImport('abandon')).toEqual({ ok: false, error: { code: 'word-count', count: 1 } });
  });

  it('elenca le parole sconosciute', () => {
    const typo = ABANDON_MNEMONIC.replace('about', 'abuot').replace(/^abandon/, 'pisa');
    expect(parseImport(typo)).toEqual({ ok: false, error: { code: 'unknown-words', words: ['pisa', 'abuot'] } });
  });

  it('segnala una frase con checksum sbagliato', () => {
    expect(parseImport(Array(12).fill('abandon').join(' '))).toEqual({ ok: false, error: { code: 'checksum' } });
  });

  it('accetta una WIF di rete test', () => {
    expect(parseImport(KEY_ONE_WIF_TESTNET, 5)).toEqual({
      ok: true,
      wallet: { v: 1, kind: 'wif', wif: KEY_ONE_WIF_TESTNET, createdAt: 5 },
    });
  });

  it('rifiuta le chiavi di mainnet', () => {
    for (const key of [KEY_ONE_WIF_MAINNET, KEY_ONE_WIF_MAINNET_UNCOMPRESSED, ABANDON_XPRV, 'zprvAWgYBBk7JR8Gj', 'xpub661MyMwAqRbcF']) {
      expect(parseImport(key)).toEqual({ ok: false, error: { code: 'mainnet-key' } });
    }
  });

  it('non accetta chiavi estese di rete test né WIF non compresse', () => {
    expect(parseImport(ABANDON_TPRV)).toEqual({ ok: false, error: { code: 'extended-key' } });
    expect(parseImport(KEY_ONE_WIF_TESTNET_UNCOMPRESSED)).toEqual({ ok: false, error: { code: 'uncompressed-wif' } });
  });

  it('rifiuta testo vuoto o casuale', () => {
    expect(parseImport('  ')).toEqual({ ok: false, error: { code: 'empty' } });
    expect(parseImport('cNotAValidWif123')).toEqual({ ok: false, error: { code: 'invalid' } });
  });
});

describe('completeWord', () => {
  it('riconosce parole intere e prefissi univoci', () => {
    expect(completeWord('zoo')).toBe('zoo');
    expect(completeWord('abou')).toBe('about');
    expect(completeWord('abo')).toBeNull();
    expect(completeWord('aboutt')).toBeNull();
  });
});

describe('persistenza', () => {
  it('salva e rilegge il wallet', () => {
    const kv = memoryStore();
    expect(loadStoredWallet(kv)).toBeNull();
    const result = parseImport(ABANDON_MNEMONIC, 42);
    if (!result.ok) throw new Error('import fallito');
    saveStoredWallet(kv, result.wallet);
    const loaded = loadStoredWallet(kv);
    expect(loaded).toEqual(result.wallet);
    expect(keysFromStored(loaded!).address).toBe(ABANDON_ADDRESS);
    clearStoredWallet(kv);
    expect(loadStoredWallet(kv)).toBeNull();
  });

  it('ignora dati corrotti', () => {
    expect(loadStoredWallet(memoryStore({ 'tw.wallet': '{not json' }))).toBeNull();
    expect(loadStoredWallet(memoryStore({ 'tw.wallet': '{"v":1,"kind":"mnemonic"}' }))).toBeNull();
  });
});

describe('conferma delle parole', () => {
  it('sceglie 2 posizioni distinte e ordinate', () => {
    const rnd = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      const picked = pickConfirmIndices(12, 2, rnd);
      expect(picked).toHaveLength(2);
      expect(picked[0]!).toBeLessThan(picked[1]!);
      expect(picked.every((n) => n >= 0 && n < 12)).toBe(true);
    }
  });

  it('propone 4 opzioni diverse, tra cui quella giusta', () => {
    const options = confirmOptions('zoo', 3, seededRandom(3));
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain('zoo');
  });
});

describe('più wallet dalla stessa frase (wallet gerarchico)', () => {
  const base: StoredWallet = { v: 1, kind: 'mnemonic', mnemonic: ABANDON_MNEMONIC, createdAt: 0 };

  it('il wallet n usa l\'indirizzo m/84\'/1\'/0\'/0/n', () => {
    const second = keysFromMnemonic(ABANDON_MNEMONIC, 1);
    expect(second.address).toBe(ABANDON_ADDRESS_1);
    expect(second.path).toBe("m/84'/1'/0'/0/1");
    expect(second.index).toBe(1);
    expect(walletAddress(ABANDON_MNEMONIC, 2)).toBe(ABANDON_ADDRESS_2);
    // stesso account: stessa chiave pubblica estesa per tutti i wallet
    expect(second.tpub).toBe(ABANDON_TPUB);
    expect(second.vpub).toBe(ABANDON_VPUB);
  });

  it('senza campi in più è il wallet 1 di 1 (compatibile con i wallet già salvati)', () => {
    expect(walletCount(base)).toBe(1);
    expect(activeIndex(base)).toBe(0);
    expect(keysFromStored(base).address).toBe(ABANDON_ADDRESS);
  });

  it('crea il wallet successivo e lo mette in uso', () => {
    const two = withNewWallet(base)!;
    expect(two).toMatchObject({ count: 2, active: 1 });
    expect(keysFromStored(two).address).toBe(ABANDON_ADDRESS_1);
    const three = withNewWallet(two)!;
    expect(keysFromStored(three).address).toBe(ABANDON_ADDRESS_2);
    expect(keysFromStored(withActiveWallet(three, 0)).address).toBe(ABANDON_ADDRESS);
  });

  it('limiti: massimo MAX_WALLETS wallet, indici fuori intervallo corretti', () => {
    const full = withWalletCount(base, 999);
    expect(walletCount(full)).toBe(CONFIG.MAX_WALLETS);
    expect(canAddWallet(full)).toBe(false);
    expect(withNewWallet(full)).toBeNull();
    expect(activeIndex(withActiveWallet(withWalletCount(base, 3), 7))).toBe(2);
    expect(activeIndex({ ...base, count: 2, active: -4 })).toBe(0);
    expect(walletCount({ ...base, count: 0 })).toBe(1);
  });

  it('una WIF importata non ha altri wallet', () => {
    const wif: StoredWallet = { v: 1, kind: 'wif', wif: KEY_ONE_WIF_TESTNET, createdAt: 0 };
    expect(walletCount(wif)).toBe(1);
    expect(canAddWallet(wif)).toBe(false);
    expect(withNewWallet(wif)).toBeNull();
    expect(keysFromStored(wif).index).toBeNull();
  });

  it('salva e rilegge numero e wallet in uso; rifiuta valori non interi', () => {
    const kv = memoryStore();
    const two = withNewWallet(base)!;
    saveStoredWallet(kv, two);
    expect(loadStoredWallet(kv)).toEqual(two);
    expect(loadStoredWallet(memoryStore({ 'tw.wallet': JSON.stringify({ ...base, count: 'due' }) }))).toBeNull();
    expect(loadStoredWallet(memoryStore({ 'tw.wallet': JSON.stringify({ ...base, active: 1.5 }) }))).toBeNull();
  });
});

describe('indirizzi di resto (uno nuovo a ogni invio)', () => {
  const base: StoredWallet = { v: 1, kind: 'mnemonic', mnemonic: ABANDON_MNEMONIC, createdAt: 0 };

  it('vettori noti: Wallet 1 usa m/84\'/1\'/0\'/1/k, il Wallet 2 m/84\'/1\'/1\'/1/k', () => {
    expect(changePath(0, 0)).toBe("m/84'/1'/0'/1/0");
    expect(changePath(1, 3)).toBe("m/84'/1'/1'/1/3");
    expect(changeAddress(ABANDON_MNEMONIC, 0, 0)).toBe(ABANDON_CHANGE_0);
    expect(changeAddress(ABANDON_MNEMONIC, 0, 1)).toBe(ABANDON_CHANGE_1);
    expect(changeAddress(ABANDON_MNEMONIC, 0, 2)).toBe(ABANDON_CHANGE_2);
    expect(changeAddress(ABANDON_MNEMONIC, 1, 0)).toBe(ABANDON_W2_CHANGE_0);
  });

  it('il wallet conosce tutti i suoi indirizzi: ricezione, resti usati e prossimo resto', () => {
    const keys = keysFromMnemonic(ABANDON_MNEMONIC, 0, 2);
    expect(keys.address).toBe(ABANDON_ADDRESS); // l'indirizzo per ricevere non cambia mai
    expect(keys.change.map((c) => [c.address, c.path, c.role, c.index])).toEqual([
      [ABANDON_CHANGE_0, "m/84'/1'/0'/1/0", 'change', 0],
      [ABANDON_CHANGE_1, "m/84'/1'/0'/1/1", 'change', 1],
    ]);
    expect(keys.nextChange).toMatchObject({ address: ABANDON_CHANGE_2, role: 'change', index: 2 });
    expect([...keys.owned.keys()]).toEqual([ABANDON_ADDRESS, ABANDON_CHANGE_0, ABANDON_CHANGE_1, ABANDON_CHANGE_2]);
    expect(keys.owned.get(ABANDON_ADDRESS)).toMatchObject({ role: 'receive', path: "m/84'/1'/0'/0/0" });
    // la chiave di ogni resto è diversa e corrisponde al suo indirizzo
    expect(keysFromWif(ECPairWif(keys.owned.get(ABANDON_CHANGE_1)!.privateKey)).address).toBe(ABANDON_CHANGE_1);
    // il Wallet 2 ha resti suoi
    expect(keysFromMnemonic(ABANDON_MNEMONIC, 1).nextChange.address).toBe(ABANDON_W2_CHANGE_0);
  });

  it('una WIF importata ha un solo indirizzo: il resto torna lì', () => {
    const keys = keysFromWif(KEY_ONE_WIF_TESTNET);
    expect(keys.change).toEqual([]);
    expect(keys.nextChange.address).toBe(KEY_ONE_ADDRESS);
    expect([...keys.owned.keys()]).toEqual([KEY_ONE_ADDRESS]);
  });

  it('il contatore dei resti è per wallet, cresce soltanto e si salva', () => {
    expect(changeUsed(base, 0)).toBe(0);
    const one = withChangeUsed(base, 0, 1);
    expect(changeUsed(one, 0)).toBe(1);
    expect(keysFromStored(one).nextChange.address).toBe(ABANDON_CHANGE_1);
    expect(withChangeUsed(one, 0, 1)).toBe(one); // niente da cambiare
    expect(withChangeUsed(one, 0, 0)).toBe(one); // non torna mai indietro
    const two = withChangeUsed(withNewWallet(one)!, 1, 3);
    expect(two.kind === 'mnemonic' && two.change).toEqual([1, 3]);
    expect(keysFromStored(two).nextChange.path).toBe("m/84'/1'/1'/1/3");
    expect(keysFromStored(withActiveWallet(two, 0)).nextChange.address).toBe(ABANDON_CHANGE_1);
    const kv = memoryStore();
    saveStoredWallet(kv, two);
    expect(loadStoredWallet(kv)).toEqual(two);
    expect(loadStoredWallet(memoryStore({ 'tw.wallet': JSON.stringify({ ...base, change: [1, -2] }) }))).toBeNull();
    expect(loadStoredWallet(memoryStore({ 'tw.wallet': JSON.stringify({ ...base, change: 'uno' }) }))).toBeNull();
    const wif: StoredWallet = { v: 1, kind: 'wif', wif: KEY_ONE_WIF_TESTNET, createdAt: 0 };
    expect(withChangeUsed(wif, 0, 5)).toBe(wif);
  });
});

/** WIF di rete test di una chiave privata (per controllare che chiave e indirizzo corrispondano). */
function ECPairWif(privateKey: Uint8Array): string {
  return ECPair.fromPrivateKey(privateKey, { network: BITCOIN_NETWORK, compressed: true }).toWIF();
}
