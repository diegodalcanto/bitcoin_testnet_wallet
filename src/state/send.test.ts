import { Transaction } from 'bitcoinjs-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error modulo JavaScript dello smoke test, senza tipi
import { MockEsplora } from '../../e2e/mock-esplora.mjs';
import { checkAddress } from '../address';
import { ABANDON_ADDRESS, KEY_ONE_WIF_TESTNET } from '../test/fixtures';
import { planTransaction, signPlan } from '../tx';
import { sendPayment } from './send';
import { refresh } from './sync';
import { balance, installWallet, keys, pending, spendable } from './wallet';

interface Mock {
  fund(address: string, value: number, opts?: { confirmed?: boolean }): string;
  drop(txid: string): void;
  broadcast(hex: string): { status: number; body: string };
  handle(method: string, path: string, body?: string): { status?: number; body?: string; json?: unknown; text?: string };
  broadcasts: string[];
  rateLimitNext: number;
}

/** Primario e riserva della Signet puntano allo stesso server finto. */
const BASES = ['https://mempool.space/signet/api', 'https://blockstream.info/signet/api'];

const recipient = (() => {
  const r = checkAddress(ABANDON_ADDRESS);
  if (!r.ok) throw new Error('indirizzo');
  return { address: r.address, script: r.script };
})();

let mock: Mock;
/** La prossima POST /tx arriva al server, ma la risposta si perde. */
let loseNextBroadcastResponse = false;
/** Quante POST /tx falliscono per rete assente (senza arrivare al server). */
let offlineBroadcasts = 0;

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const base = BASES.find((b) => url.startsWith(b));
  if (!base) throw new TypeError('Failed to fetch');
  const method = init?.method ?? 'GET';
  if (method === 'POST' && offlineBroadcasts > 0) {
    offlineBroadcasts--;
    throw new TypeError('Failed to fetch');
  }
  const res = mock.handle(method, url.slice(base.length), typeof init?.body === 'string' ? init.body : undefined);
  if (method === 'POST' && loseNextBroadcastResponse) {
    loseNextBroadcastResponse = false;
    throw new TypeError('Network connection was lost');
  }
  if (res.json !== undefined) return new Response(JSON.stringify(res.json));
  if (res.text !== undefined) return new Response(res.text);
  return new Response(res.body ?? '', { status: res.status ?? 500 });
}

const txidsOf = (hexes: string[]) => hexes.map((hex) => Transaction.fromHex(hex).getId());

beforeEach(async () => {
  mock = new MockEsplora() as Mock;
  loseNextBroadcastResponse = false;
  offlineBroadcasts = 0;
  vi.stubGlobal('fetch', fakeFetch);
  installWallet({ v: 1, kind: 'wif', wif: KEY_ONE_WIF_TESTNET, createdAt: 0 });
  mock.fund(keys.value!.address, 50_000);
  await refresh({ full: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendPayment', () => {
  it('invia e aggiorna subito lo stato locale: il resto è subito spendibile', async () => {
    expect(balance.value.total).toBe(50_000);
    const result = await sendPayment({ recipient, amount: 10_000, feeRate: 2 });
    if (!result.ok) throw new Error(result.error.code);
    expect(pending.value.map((p) => p.txid)).toEqual([result.txid]);
    expect(spendable.value).toEqual([{ txid: result.txid, vout: 1, value: 50_000 - 10_000 - result.signed.fee, confirmed: false, local: true }]);
  });

  it('il server non conosce la transazione precedente: la ritrasmette e riprova', async () => {
    const first = await sendPayment({ recipient, amount: 10_000, feeRate: 2 });
    if (!first.ok) throw new Error(first.error.code);
    mock.drop(first.txid); // il server "perde" il primo invio
    const second = await sendPayment({ recipient, amount: 5_000, feeRate: 2 });
    if (!second.ok) throw new Error(second.error.code);
    // primo invio, secondo rifiutato (resto sconosciuto), ritrasmissione del primo, secondo accettato
    expect(txidsOf(mock.broadcasts)).toEqual([first.txid, second.txid, first.txid, second.txid]);
  });

  it('una transazione locale in conflitto viene scartata e si riparte dalle monete vere', async () => {
    const first = await sendPayment({ recipient, amount: 10_000, feeRate: 2 });
    if (!first.ok) throw new Error(first.error.code);
    // Il primo invio sparisce e la stessa moneta viene spesa da un'altra transazione (stesso wallet altrove).
    mock.drop(first.txid);
    const k = keys.value!;
    const other = planTransaction({
      utxos: [{ ...first.plan.inputs[0]!, local: false }],
      recipient,
      change: { address: k.address, script: k.outputScript },
      feeRate: 3,
      amount: 7_000,
    });
    if (!other.ok) throw new Error('piano');
    const otherSigned = signPlan(other.plan, k);
    expect(mock.broadcast(otherSigned.hex).status).toBe(200);
    await refresh({ full: true });
    expect(pending.value.map((p) => p.txid)).toEqual([first.txid]); // l'API non la conosce: resta locale

    const third = await sendPayment({ recipient, amount: 1_000, feeRate: 2 });
    if (!third.ok) throw new Error(third.error.code);
    expect(pending.value.map((p) => p.txid)).not.toContain(first.txid);
    const spentByThird = Transaction.fromHex(third.signed.hex).ins.map((i) => Buffer.from(i.hash).reverse().toString('hex'));
    expect(spentByThird).toEqual([otherSigned.txid]);
  });

  it('risposta persa durante l\'invio: nessun doppio pagamento', async () => {
    loseNextBroadcastResponse = true;
    const result = await sendPayment({ recipient, amount: 10_000, feeRate: 2 });
    if (!result.ok) throw new Error(result.error.code);
    expect(new Set(txidsOf(mock.broadcasts))).toEqual(new Set([result.txid]));
    expect(pending.value).toHaveLength(1);
  });

  it('rete assente: errore chiaro e nessuno stato locale', async () => {
    offlineBroadcasts = 2; // primario e riserva
    const result = await sendPayment({ recipient, amount: 10_000, feeRate: 2 });
    expect(result).toEqual({ ok: false, error: { code: 'network' } });
    expect(pending.value).toHaveLength(0);
  });

  it('troppe richieste (429) su tutti i server', async () => {
    mock.rateLimitNext = 2;
    const result = await sendPayment({ recipient, amount: 10_000, feeRate: 2 });
    expect(result).toEqual({ ok: false, error: { code: 'rate-limit' } });
  });

  it('saldo insufficiente: errore prima di firmare', async () => {
    const result = await sendPayment({ recipient, amount: 60_000, feeRate: 2 });
    expect(result).toMatchObject({ ok: false, error: { code: 'plan', error: { code: 'insufficient-funds' } } });
    expect(mock.broadcasts).toHaveLength(0);
  });
});
