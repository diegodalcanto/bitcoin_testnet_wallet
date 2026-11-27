import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error modulo JavaScript dello smoke test, senza tipi
import { MockEsplora } from '../../e2e/mock-esplora.mjs';
import { checkAddress } from '../address';
import { store } from '../storage';
import { ABANDON_ADDRESS, ABANDON_ADDRESS_1, ABANDON_ADDRESS_2, ABANDON_MNEMONIC, KEY_ONE_ADDRESS } from '../test/fixtures';
import { walletAddress } from '../wallet';
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
    const probed = mock.requests.filter((r) => /^GET \/address\/[^/]+$/.test(r));
    expect(probed).toHaveLength(6); // indici 1, 2, 3 e poi 4, 5, 6 mai usati
    expect(probed[1]).toBe(`GET /address/${ABANDON_ADDRESS_2}`);
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
