import { describe, expect, it } from 'vitest';
import type { EsploraTx, EsploraVout } from './esplora';
import { buildHistory, confirmationsLabel, confirmationsOf, summarizeTx } from './history';
import type { PendingTx } from './pending';
import { fakeTxid } from './test/fixtures';

const ME = 'tb1qme';
const OTHER = 'tb1qother';
const VOLUNTEER = 'tb1qvolunteer';

function out(address: string, value: number): EsploraVout {
  return { scriptpubkey: '', scriptpubkey_address: address, value };
}

function tx(n: number, vin: [string, number][], vout: [string, number][], confirmedAt?: number): EsploraTx {
  return {
    txid: fakeTxid(n),
    vin: vin.map(([address, value], i) => ({ txid: fakeTxid(1000 + i), vout: 0, prevout: out(address, value) })),
    vout: vout.map(([address, value]) => out(address, value)),
    size: 222,
    weight: 561,
    fee: vin.reduce((s, [, v]) => s + v, 0) - vout.reduce((s, [, v]) => s + v, 0),
    status: confirmedAt === undefined ? { confirmed: false } : { confirmed: true, block_height: confirmedAt, block_time: 1_700_000_000 + confirmedAt },
  };
}

describe('summarizeTx', () => {
  it('entrata', () => {
    const item = summarizeTx(tx(1, [[VOLUNTEER, 50_000]], [[ME, 10_000], [VOLUNTEER, 39_800]], 100), ME);
    expect(item).toMatchObject({ direction: 'in', amount: 10_000, net: 10_000, fee: null, confirmed: true, blockHeight: 100, counterparty: VOLUNTEER });
  });

  it('uscita con resto', () => {
    const item = summarizeTx(tx(2, [[ME, 10_000]], [[OTHER, 3_000], [ME, 6_800]]), ME);
    expect(item).toMatchObject({ direction: 'out', amount: 3_000, net: -3_200, fee: 200, confirmed: false, counterparty: OTHER });
  });

  it('trasferimento a sé stessi', () => {
    const item = summarizeTx(tx(3, [[ME, 10_000]], [[ME, 9_800]]), ME);
    expect(item).toMatchObject({ direction: 'self', amount: 0, net: -200, fee: 200 });
  });
});

describe('buildHistory', () => {
  it('prima gli invii locali, poi la mempool, poi le confermate dalla più recente', () => {
    const local: PendingTx = {
      txid: fakeTxid(99),
      createdAt: 5_000,
      hex: '',
      spent: [],
      ownOutputs: [],
      recipient: OTHER,
      amount: 1_000,
      fee: 150,
      vsize: 110,
    };
    const known: PendingTx = { ...local, txid: fakeTxid(2), createdAt: 4_000 };
    const items = buildHistory(
      [tx(1, [[VOLUNTEER, 50_000]], [[ME, 10_000]], 100), tx(2, [[ME, 10_000]], [[OTHER, 3_000], [ME, 6_800]]), tx(3, [[VOLUNTEER, 9_000]], [[ME, 5_000]], 120)],
      [local, known],
      ME,
    );
    expect(items.map((i) => [i.txid, i.local])).toEqual([
      [fakeTxid(99), true],
      [fakeTxid(2), false],
      [fakeTxid(3), false],
      [fakeTxid(1), false],
    ]);
    expect(items[0]).toMatchObject({ direction: 'out', amount: 1_000, net: -1_150, fee: 150, confirmed: false, time: 5 });
  });
});

describe('conferme', () => {
  it('calcolo e etichetta fino a 6+', () => {
    expect(confirmationsOf(undefined, 200)).toBe(0);
    expect(confirmationsOf(200, 200)).toBe(1);
    expect(confirmationsOf(195, 200)).toBe(6);
    expect(confirmationsOf(200, null)).toBe(1);
    expect(confirmationsLabel(0)).toBe('0');
    expect(confirmationsLabel(5)).toBe('5');
    expect(confirmationsLabel(6)).toBe('6+');
    expect(confirmationsLabel(120)).toBe('6+');
  });
});
