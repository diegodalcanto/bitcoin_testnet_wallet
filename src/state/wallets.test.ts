import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error modulo JavaScript dello smoke test, senza tipi
import { MockEsplora } from '../../e2e/mock-esplora.mjs';
import { checkAddress } from '../address';
import { store } from '../storage';
import {
  ABANDON_ADDRESS,
  ABANDON_ADDRESS_1,
  ABANDON_ADDRESS_2,
  ABANDON_CHANGE_0,
  ABANDON_CHANGE_1,
  ABANDON_MNEMONIC,
  ABANDON_W2_CHANGE_0,
  KEY_ONE_ADDRESS,
} from '../test/fixtures';
import { changeAddress, walletAddress } from '../wallet';
import { sendPayment } from './send';
import { refresh } from './sync';
import {
  addWallet,
  balance,
  cachedBalance,
  changeNetwork,
  discoverWallets,
  installWallet,
  keys,
  pending,
  selectWallet,
  spendable,
  storedWallet,
  walletIndex,
  walletTotal,
} from './wallet';

interface Mock {
  fund(address: string, value: number, opts?: { confirmed?: boolean }): string;
  handle(method: string, path: string, body?: string): { status?: number; body?: string; json?: unknown; text?: string };
  requests: string[];
}

const BASES = ['https://mempool.space/signet/api', 'https://blockstream.info/signet/api', 'https://mempool.space/testnet4/api', 'https://blockstream.info/testnet4/api'];
let mock: Mock;

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const base = BASES.find((b) => url.startsWith(b));
  if (!base) throw new TypeError('Failed to fetch');
  const res = mock.handle(init?.method ?? 'GET', url.slice(base.length), typeof init?.body === 'string' ? init.body : undefined);
  if (res.json !== undefined) return new Response(JSON.stringify(res.json));
  if (res.text !== undefined) return new Response(res.text);
  return new Response(res.body ?? '', { status: res.status ?? 500 });
}

const recipient = (() => {
  const r = checkAddress(KEY_ONE_ADDRESS);
  if (!r.ok) throw new Error('indirizzo');
  return { address: r.address, script: r.script };
})();

beforeEach(async () => {
  mock = new MockEsplora() as Mock;
  vi.stubGlobal('fetch', fakeFetch);
  changeNetwork('signet');
  installWallet({ v: 1, kind: 'mnemonic', mnemonic: ABANDON_MNEMONIC, createdAt: 0 });
  await refresh({ full: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('più wallet dalla stessa frase', () => {
  it('ogni wallet ha il suo indirizzo, le sue monete e le sue transazioni in attesa', async () => {
    mock.fund(ABANDON_ADDRESS, 30_000);
    await refresh({ full: true });
    expect(balance.value.total).toBe(30_000);
    const sent = await sendPayment({ recipient, amount: 5_000, feeRate: 2 });
    if (!sent.ok) throw new Error(sent.error.code);
    expect(pending.value).toHaveLength(1);

    expect(addWallet()).toBe(1);
    expect(walletTotal.value).toBe(2);
    expect(keys.value?.address).toBe(ABANDON_ADDRESS_1);
    // niente resti né transazioni del wallet 1 nel wallet 2
    expect(pending.value).toEqual([]);
    expect(spendable.value).toEqual([]);
    await refresh({ full: true });
    expect(balance.value.total).toBe(0);

    selectWallet(0);
    expect(keys.value?.address).toBe(ABANDON_ADDRESS);
    expect(pending.value.map((p) => p.txid)).toEqual([sent.txid]);
    expect(balance.value.total).toBe(30_000 - 5_000 - sent.signed.fee);
    // l'ultimo saldo noto resta disponibile per l'elenco dei wallet
    expect(cachedBalance(ABANDON_ADDRESS_1)).toBe(0);
  });

  it('dopo un ripristino ritrova i wallet già usati, fermandosi dopo 3 indirizzi mai usati', async () => {
    mock.fund(ABANDON_ADDRESS_1, 1_000);
    mock.fund(walletAddress(ABANDON_MNEMONIC, 3), 2_000); // il wallet 3 (indice 2) resta mai usato
    await expect(discoverWallets()).resolves.toBe(4);
    expect(walletIndex.value).toBe(0); // resta in uso il primo
    const probed = mock.requests.filter((r) => /^GET \/address\/[^/]+$/.test(r)).map((r) => r.slice('GET /address/'.length));
    // indici 1, 2, 3 e poi 4, 5, 6 mai usati; poi i primi 3 resti di ognuno dei 4 wallet, tutti mai usati
    expect(probed.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6].map((i) => walletAddress(ABANDON_MNEMONIC, i)));
    expect(probed[1]).toBe(ABANDON_ADDRESS_2);
    expect(probed.slice(6)).toEqual([0, 1, 2, 3].flatMap((w) => [0, 1, 2].map((k) => changeAddress(ABANDON_MNEMONIC, w, k))));
  });

  it('dopo un ripristino ritrova anche gli indirizzi di resto, dove sono i sats', async () => {
    // Prima del ripristino: due invii dal Wallet 1 (resti /1/0 e /1/1) e uno dal Wallet 2.
    mock.fund(ABANDON_CHANGE_0, 1_000);
    mock.fund(ABANDON_CHANGE_1, 40_000);
    mock.fund(ABANDON_ADDRESS_1, 500);
    mock.fund(ABANDON_W2_CHANGE_0, 7_000);
    await expect(discoverWallets()).resolves.toBe(2);
    expect(storedWallet.value).toMatchObject({ count: 2, change: [2, 1] });
    expect(keys.value?.nextChange.address).toBe(changeAddress(ABANDON_MNEMONIC, 0, 2));
    await refresh({ full: true });
    expect(balance.value.total).toBe(41_000);
    selectWallet(1);
    await refresh({ full: true });
    expect(balance.value.total).toBe(7_500);
  });

  it('il cambio rete azzera le transazioni in attesa di tutti i wallet', async () => {
    mock.fund(ABANDON_ADDRESS, 30_000);
    await refresh({ full: true });
    await sendPayment({ recipient, amount: 5_000, feeRate: 2 });
    addWallet();
    expect(store.keys().some((k) => k.startsWith('tw.pending.'))).toBe(true);
    changeNetwork('testnet4');
    expect(store.keys().some((k) => k.startsWith('tw.pending.'))).toBe(false);
    expect(storedWallet.value).toMatchObject({ count: 2, active: 1 });
  });
});
