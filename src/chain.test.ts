import { describe, expect, it } from 'vitest';
import {
  afterBlockTargets,
  ANY_ADDRESS,
  baseTargets,
  chainTxs,
  chainUtxos,
  coldTargets,
  emptyChain,
  findTx,
  parseChainCache,
  staleTargets,
  updateSeen,
  type AddressChain,
  type ChainState,
  type TargetParams,
} from './chain';
import type { EsploraTx, EsploraUtxo } from './esplora';
import type { PendingTx } from './pending';
import { fakeTxid } from './test/fixtures';

const R = 'tb1qreceive';
const C0 = 'tb1qchange0';
const C1 = 'tb1qchange1';
const NEXT = 'tb1qchange2';
const OWNED = [R, C0, C1, NEXT];

function utxo(n: number, value: number, confirmed = true): EsploraUtxo {
  return { txid: fakeTxid(n), vout: 0, value, status: confirmed ? { confirmed: true, block_height: 100 } : { confirmed: false } };
}

function tx(n: number, confirmed = true): EsploraTx {
  return {
    txid: fakeTxid(n),
    vin: [],
    vout: [],
    size: 0,
    weight: 0,
    fee: 0,
    status: confirmed ? { confirmed: true, block_height: 100 } : { confirmed: false },
  };
}

function data(utxos: EsploraUtxo[], txs: EsploraTx[] | null = []): AddressChain {
  return { utxos, txs, updatedAt: 1 };
}

function chainOf(addresses: Record<string, AddressChain>, seen: Record<string, number> = {}): ChainState {
  return { ...emptyChain(R), addresses, seen };
}

function params(chain: ChainState, mode: TargetParams['mode'] = 'cycle', pending: PendingTx[] = []): TargetParams {
  return { owned: OWNED, receive: R, nextChange: NEXT, chain, pending, mode };
}

describe('cache dei dati della blockchain', () => {
  it('converte la cache delle versioni precedenti (un solo indirizzo)', () => {
    const old = { address: R, utxos: [utxo(1, 5_000)], txs: [tx(1)], tip: { hash: 'h', height: 10, time: 1 }, updatedAt: 42 };
    expect(parseChainCache(old, R)).toEqual({
      address: R,
      addresses: { [R]: { utxos: [utxo(1, 5_000)], txs: [tx(1)], updatedAt: 42 } },
      tip: { hash: 'h', height: 10, time: 1 },
      seen: {},
      updatedAt: 42,
    });
  });

  it('rilegge il formato nuovo e scarta cache di un altro wallet o rovinate', () => {
    const state = chainOf({ [R]: data([utxo(1, 5_000)]), [C0]: data([], null) }, { [fakeTxid(1)]: 7 });
    expect(parseChainCache(JSON.parse(JSON.stringify(state)), R)).toEqual(state);
    expect(parseChainCache(state, 'tb1qaltro')).toEqual(emptyChain('tb1qaltro'));
    expect(parseChainCache('boh', R)).toEqual(emptyChain(R));
    expect(parseChainCache({ address: R, addresses: { [R]: { utxos: 'x' } }, seen: { a: 'x' } }, R)).toEqual({ ...emptyChain(R), addresses: {} });
  });

  it('monete e storico di tutti gli indirizzi del wallet, ognuna con il suo indirizzo', () => {
    const state = chainOf({ [R]: data([utxo(1, 5_000)], [tx(1), tx(2)]), [C0]: data([utxo(2, 700)], [tx(2, false)]), 'tb1qestraneo': data([utxo(9, 1)]) });
    const own = new Set(OWNED);
    expect(chainUtxos(state, own).map((u) => [u.txid, u.address])).toEqual([
      [fakeTxid(1), R],
      [fakeTxid(2), C0],
    ]);
    expect(chainUtxos(state, ANY_ADDRESS)).toHaveLength(3);
    expect(chainTxs(state, own).map((t) => t.txid)).toEqual([fakeTxid(1), fakeTxid(2), fakeTxid(2)]);
    expect(findTx(state, own, fakeTxid(2))?.status.confirmed).toBe(true);
  });
});

describe('quali indirizzi leggere', () => {
  // Situazione tipica dopo qualche puntata: il resto attuale (C1) ha l'unica moneta, C0 è stato svuotato.
  const steady = chainOf({
    [R]: data([], [tx(1)]),
    [C0]: data([], [tx(1), tx(2)]),
    [C1]: data([utxo(2, 6_000)], [tx(2)]),
    [NEXT]: data([], []),
  });

  it('di solito solo l\'indirizzo di ricezione: una chiamata per aggiornamento', () => {
    expect(baseTargets(params(steady))).toEqual([R]);
  });

  it('all\'apertura anche gli indirizzi con monete o con transazioni non confermate', () => {
    expect(baseTargets(params(steady, 'full'))).toEqual([R, C1]);
    const unconfirmed = chainOf({ ...steady.addresses, [C0]: data([], [tx(3, false)]) });
    expect(baseTargets(params(unconfirmed, 'full'))).toEqual([R, C0, C1]);
  });

  it('con "trascina per aggiornare" tutti gli indirizzi, compreso il prossimo resto', () => {
    expect(baseTargets(params(steady, 'sweep'))).toEqual(OWNED);
  });

  it('gli indirizzi toccati da un invio appena fatto, finché l\'API non lo vede', () => {
    const send: PendingTx = {
      txid: fakeTxid(5),
      createdAt: 0,
      hex: '',
      spent: [{ txid: fakeTxid(2), vout: 0, address: C1 }],
      ownOutputs: [{ vout: 1, value: 5_000, address: NEXT }],
      recipient: 'tb1qrisposta',
      amount: 800,
      fee: 200,
      vsize: 141,
    };
    expect(baseTargets(params(steady, 'cycle', [send]))).toEqual([R, C1, NEXT]);
  });

  it('gli indirizzi mai letti (dopo un ripristino), ma non il prossimo resto ancora vuoto', () => {
    expect(baseTargets(params(chainOf({})))).toEqual([R, C0, C1]);
    expect(baseTargets(params(chainOf({}), 'full'))).toEqual([R, C0, C1]);
  });

  it('un resto da rileggere: una transazione nota lo tocca, ma il suo storico non la contiene', () => {
    const send: EsploraTx = {
      ...tx(9, false),
      vin: [{ txid: fakeTxid(2), vout: 0, prevout: { scriptpubkey: '', scriptpubkey_address: C1, value: 6_000 } }],
      vout: [
        { scriptpubkey: '', scriptpubkey_address: 'tb1qrisposta', value: 1_000 },
        { scriptpubkey: '', scriptpubkey_address: NEXT, value: 4_800 },
      ],
    };
    // C1 ha speso la sua moneta (lo dice il suo storico), ma il prossimo resto era stato letto vuoto
    const state = chainOf({ ...steady.addresses, [C1]: data([], [tx(2), send]) });
    expect(staleTargets(state, OWNED, R)).toEqual([NEXT]);
    expect(staleTargets(state, OWNED, R, new Set([NEXT]))).toEqual([]);
    // quando anche il suo storico la contiene, la lettura è coerente
    const consistent = chainOf({ ...state.addresses, [NEXT]: data([utxo(9, 4_800, false)], [send]) });
    expect(staleTargets(consistent, OWNED, R)).toEqual([]);
    expect(staleTargets(steady, OWNED, R)).toEqual([]);
  });

  it('dopo un nuovo blocco quelli con monete o transazioni non confermate', () => {
    const state = chainOf({ ...steady.addresses, [C1]: data([utxo(2, 6_000, false)], [tx(2, false)]), [C0]: data([], [tx(2, false)]) });
    expect(afterBlockTargets(params(state), new Set([R]))).toEqual([C0, C1]);
    expect(afterBlockTargets(params(steady), new Set([R]))).toEqual([]);
  });

  it('a turno, uno degli indirizzi che non si leggono mai', () => {
    expect(coldTargets(params(steady), new Set([R]))).toEqual([C0, C1, NEXT]);
  });
});

describe('orari di arrivo delle transazioni', () => {
  it('alla prima lettura non si sa quando sono arrivate; dopo, quelle nuove prendono l\'ora attuale', () => {
    const first = updateSeen(emptyChain(R), { [R]: data([], [tx(1, false), tx(2)]) }, [], 1_000);
    expect(first).toEqual({});
    const before = chainOf({ [R]: data([], [tx(1, false), tx(2)]) });
    const next = updateSeen(before, { [R]: data([], [tx(3, false), tx(1, false), tx(2)]) }, [], 2_000);
    expect(next).toEqual({ [fakeTxid(3)]: 2_000 });
  });

  it('una transazione partita da qui prende l\'orario dell\'invio; si tengono solo quelle ancora nello storico', () => {
    const before = chainOf({ [R]: data([], [tx(1)]), [C0]: data([], null) }, { [fakeTxid(1)]: 500, [fakeTxid(8)]: 600 });
    const send = { txid: fakeTxid(4), createdAt: 1_500 } as PendingTx;
    const next = updateSeen(before, { [R]: data([], [tx(4, false), tx(1)]), [C0]: data([], [tx(4, false)]) }, [send], 3_000);
    expect(next).toEqual({ [fakeTxid(4)]: 1_500, [fakeTxid(1)]: 500 });
  });
});
