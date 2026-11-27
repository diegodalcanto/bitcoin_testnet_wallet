import { Transaction } from 'bitcoinjs-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error modulo JavaScript dello smoke test, senza tipi
import { MockEsplora } from '../../e2e/mock-esplora.mjs';
import { checkAddress } from '../address';
import {
  ABANDON_ADDRESS,
  ABANDON_CHANGE_0,
  ABANDON_CHANGE_1,
  ABANDON_CHANGE_2,
  ABANDON_MNEMONIC,
  KEY_ONE_ADDRESS,
  KEY_ONE_WIF_TESTNET,
} from '../test/fixtures';
import { planTransaction, signPlan } from '../tx';
import { sendPayment } from './send';
import { refresh } from './sync';
import { balance, history, installWallet, keys, pending, spendable, storedWallet } from './wallet';

interface Mock {
  fund(address: string, value: number, opts?: { confirmed?: boolean }): string;
  drop(txid: string): void;
  broadcast(hex: string): { status: number; body: string };
  handle(method: string, path: string, body?: string): { status?: number; body?: string; json?: unknown; text?: string };
  broadcasts: string[];
  requests: string[];
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
/** Le richieste GET /tx/:txid falliscono per rete assente (non si può controllare se un invio è partito). */
let offlineLookups = false;
/** Esito delle prossime POST /tx: arriva al server ma la risposta si perde, oppure rete assente. */
let nextPosts: ('lost' | 'offline')[] = [];

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const base = BASES.find((b) => url.startsWith(b));
  if (!base) throw new TypeError('Failed to fetch');
  const method = init?.method ?? 'GET';
  const post = method === 'POST' ? nextPosts.shift() : undefined;
  if (post === 'offline' || (method === 'POST' && offlineBroadcasts > 0)) {
    if (post !== 'offline') offlineBroadcasts--;
    throw new TypeError('Failed to fetch');
  }
  if (method === 'GET' && offlineLookups && url.slice(base.length).startsWith('/tx/')) throw new TypeError('Failed to fetch');
  const res = mock.handle(method, url.slice(base.length), typeof init?.body === 'string' ? init.body : undefined);
  if (post === 'lost' || (method === 'POST' && loseNextBroadcastResponse)) {
    if (post !== 'lost') loseNextBroadcastResponse = false;
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
  offlineLookups = false;
  nextPosts = [];
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
    // chiave WIF importata: un solo indirizzo, il resto torna lì
    expect(spendable.value).toEqual([
      { txid: result.txid, vout: 1, value: 50_000 - 10_000 - result.signed.fee, confirmed: false, local: true, address: KEY_ONE_ADDRESS },
    ]);
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

describe('wallet da 12 parole: il resto va a un indirizzo nuovo a ogni invio', () => {
  const answerA = (() => {
    const r = checkAddress(KEY_ONE_ADDRESS);
    if (!r.ok) throw new Error('indirizzo');
    return { address: r.address, script: r.script };
  })();
  const utxoReads = () => mock.requests.filter((r) => r.endsWith('/utxo')).map((r) => r.split('/')[2]);
  const changeCount = () => (storedWallet.value?.kind === 'mnemonic' ? (storedWallet.value.change ?? []) : []);

  beforeEach(async () => {
    installWallet({ v: 1, kind: 'mnemonic', mnemonic: ABANDON_MNEMONIC, createdAt: 0 });
    mock.fund(ABANDON_ADDRESS, 100_000);
    await refresh({ full: true });
  });

  it('tre invii: ogni resto su un indirizzo nuovo, il saldo li somma e lo storico mostra le uscite in cima', async () => {
    expect(keys.value!.nextChange.address).toBe(ABANDON_CHANGE_0);
    const first = await sendPayment({ recipient: answerA, amount: 10_000, feeRate: 2 });
    if (!first.ok) throw new Error(first.error.code);
    expect(first.plan.outputs.map((o) => [o.kind, o.address])).toEqual([
      ['recipient', KEY_ONE_ADDRESS],
      ['change', ABANDON_CHANGE_0],
    ]);
    expect(changeCount()).toEqual([1]);
    expect(keys.value!.nextChange.address).toBe(ABANDON_CHANGE_1);
    expect(spendable.value).toMatchObject([{ txid: first.txid, address: ABANDON_CHANGE_0, local: true }]);

    // il secondo invio spende il resto (sull'indirizzo di resto) senza aspettare l'API
    const second = await sendPayment({ recipient: answerA, amount: 5_000, feeRate: 2 });
    if (!second.ok) throw new Error(second.error.code);
    expect(second.plan.inputs.map((i) => i.address)).toEqual([ABANDON_CHANGE_0]);
    expect(second.plan.outputs[1]!.address).toBe(ABANDON_CHANGE_1);

    await refresh({ full: true });
    expect(pending.value).toEqual([]); // l'API le vede entrambe
    const third = await sendPayment({ recipient: answerA, amount: 1_000, feeRate: 2 });
    if (!third.ok) throw new Error(third.error.code);
    expect(third.plan.outputs[1]!.address).toBe(ABANDON_CHANGE_2);
    await refresh({ full: true });

    const fees = first.signed.fee + second.signed.fee + third.signed.fee;
    expect(balance.value.total).toBe(100_000 - 16_000 - fees);
    expect(spendable.value.map((u) => u.address)).toEqual([ABANDON_CHANGE_2]);
    expect(history.value.map((h) => [h.txid, h.direction, h.amount])).toEqual([
      [third.txid, 'out', 1_000],
      [second.txid, 'out', 5_000],
      [first.txid, 'out', 10_000],
      [expect.any(String), 'in', 100_000],
    ]);
    // nessun resto è mai tornato all'indirizzo per ricevere
    for (const r of [first, second, third]) expect(r.plan.outputs.some((o) => o.address === ABANDON_ADDRESS)).toBe(false);
  });

  it('a regime un aggiornamento legge solo l\'indirizzo per ricevere', async () => {
    const sent = await sendPayment({ recipient: answerA, amount: 10_000, feeRate: 2 });
    if (!sent.ok) throw new Error(sent.error.code);
    mock.requests.length = 0;
    await refresh({ full: true }); // dopo l'invio: anche l'indirizzo del resto (il prossimo resto no: è vuoto)
    expect(utxoReads()).toEqual([ABANDON_ADDRESS, ABANDON_CHANGE_0]);
    expect(pending.value).toEqual([]);
    mock.requests.length = 0;
    for (let i = 0; i < 3; i++) await refresh();
    expect(utxoReads()).toEqual([ABANDON_ADDRESS, ABANDON_ADDRESS, ABANDON_ADDRESS]);
    expect(mock.requests.some((r) => r.endsWith('/txs'))).toBe(false);
  });

  it('"trascina per aggiornare" trova anche i sats mandati a un vecchio indirizzo di resto', async () => {
    const first = await sendPayment({ recipient: answerA, amount: 10_000, feeRate: 2 });
    const second = await sendPayment({ recipient: answerA, amount: 10_000, feeRate: 2 });
    if (!first.ok || !second.ok) throw new Error('invio');
    await refresh({ full: true });
    const before = balance.value.total;
    mock.fund(ABANDON_CHANGE_0, 3_000); // qualcuno paga al primo indirizzo di resto, ormai vuoto
    await refresh();
    expect(balance.value.total).toBe(before);
    await refresh({ sweep: true });
    expect(balance.value.total).toBe(before + 3_000);
  });

  it('se il prossimo indirizzo di resto risulta già usato, il prossimo invio usa quello dopo', async () => {
    mock.fund(ABANDON_CHANGE_0, 2_000); // per esempio un invio fatto da questo wallet su un altro telefono
    await refresh({ sweep: true });
    expect(changeCount()).toEqual([1]);
    expect(balance.value.total).toBe(102_000);
    const sent = await sendPayment({ recipient: answerA, amount: 1_000, feeRate: 2 });
    if (!sent.ok) throw new Error(sent.error.code);
    expect(sent.plan.inputs.map((i) => i.address).sort()).toEqual([ABANDON_ADDRESS, ABANDON_CHANGE_0].sort());
    expect(sent.plan.outputs[1]!.address).toBe(ABANDON_CHANGE_1);
  });

  it.each([
    ['mai letto', false],
    ['già letto quando era vuoto', true],
  ])('esito incerto (rete persa e controllo impossibile): quell\'indirizzo di resto (%s) non si riusa e si ritrova', async (_, sweepFirst) => {
    if (sweepFirst) await refresh({ sweep: true }); // il prossimo resto finisce in cache, vuoto
    nextPosts = ['lost', 'offline']; // arriva al primo server ma la risposta si perde; il secondo è irraggiungibile
    offlineLookups = true;
    const result = await sendPayment({ recipient: answerA, amount: 10_000, feeRate: 2 });
    expect(result).toEqual({ ok: false, error: { code: 'uncertain' } });
    expect(changeCount()).toEqual([1]);
    offlineLookups = false;
    // la transazione era partita: il wallet ritrova il resto sull'indirizzo segnato come usato
    await refresh({ full: true });
    const [sentTxid] = txidsOf(mock.broadcasts);
    expect(spendable.value).toMatchObject([{ txid: sentTxid, address: ABANDON_CHANGE_0 }]);
    expect(keys.value!.nextChange.address).toBe(ABANDON_CHANGE_1);
  });
});
