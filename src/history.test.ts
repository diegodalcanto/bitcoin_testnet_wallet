import { describe, expect, it } from 'vitest';
import type { EsploraTx, EsploraVout } from './esplora';
import { buildHistory, confirmationsLabel, confirmationsOf, summarizeTx } from './history';
import type { PendingTx } from './pending';
import { fakeTxid } from './test/fixtures';

const ME = 'tb1qme';
/** Indirizzi di resto dello stesso wallet. */
const CHANGE_1 = 'tb1qchange1';
const CHANGE_2 = 'tb1qchange2';
const OTHER = 'tb1qother';
const VOLUNTEER = 'tb1qvolunteer';
const MINE = new Set([ME]);
const WALLET = new Set([ME, CHANGE_1, CHANGE_2]);

function out(address: string, value: number): EsploraVout {
  return { scriptpubkey: '', scriptpubkey_address: address, value };
}

/** Transazione finta: ogni input spende l'output 0 di `parents[i]` (se dato) o di una transazione esterna. */
function tx(n: number, vin: [string, number][], vout: [string, number][], confirmedAt?: number, parents: number[] = []): EsploraTx {
  return {
    txid: fakeTxid(n),
    vin: vin.map(([address, value], i) => ({ txid: fakeTxid(parents[i] ?? 1000 + i), vout: 0, prevout: out(address, value) })),
    vout: vout.map(([address, value]) => out(address, value)),
    size: 222,
    weight: 561,
    fee: vin.reduce((s, [, v]) => s + v, 0) - vout.reduce((s, [, v]) => s + v, 0),
    status: confirmedAt === undefined ? { confirmed: false } : { confirmed: true, block_height: confirmedAt, block_time: 1_700_000_000 + confirmedAt },
  };
}

describe('summarizeTx', () => {
  it('entrata', () => {
    const item = summarizeTx(tx(1, [[VOLUNTEER, 50_000]], [[ME, 10_000], [VOLUNTEER, 39_800]], 100), MINE);
    expect(item).toMatchObject({ direction: 'in', amount: 10_000, net: 10_000, fee: null, confirmed: true, blockHeight: 100, counterparty: VOLUNTEER });
  });

  it('uscita con resto', () => {
    const item = summarizeTx(tx(2, [[ME, 10_000]], [[OTHER, 3_000], [ME, 6_800]]), MINE);
    expect(item).toMatchObject({ direction: 'out', amount: 3_000, net: -3_200, fee: 200, confirmed: false, counterparty: OTHER });
  });

  it('trasferimento a sé stessi', () => {
    const item = summarizeTx(tx(3, [[ME, 10_000]], [[ME, 9_800]]), MINE);
    expect(item).toMatchObject({ direction: 'self', amount: 0, net: -200, fee: 200 });
  });

  it('uscita con il resto su un indirizzo nuovo dello stesso wallet', () => {
    const send = tx(4, [[ME, 10_000], [CHANGE_1, 5_000]], [[OTHER, 3_000], [CHANGE_2, 11_700]]);
    expect(summarizeTx(send, WALLET)).toMatchObject({ direction: 'out', amount: 3_000, net: -3_300, fee: 300, counterparty: OTHER });
    // vista dal solo indirizzo di ricezione sembrerebbe un pagamento di tutto: per questo serve l'insieme
    expect(summarizeTx(send, MINE)).toMatchObject({ direction: 'out', amount: 14_700 });
  });

  it('pagamento ricevuto su un indirizzo di resto', () => {
    expect(summarizeTx(tx(5, [[VOLUNTEER, 9_000]], [[CHANGE_1, 2_000], [VOLUNTEER, 6_800]]), WALLET)).toMatchObject({
      direction: 'in',
      amount: 2_000,
      counterparty: VOLUNTEER,
    });
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
      MINE,
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

describe('buildHistory con più indirizzi e ordine di arrivo', () => {
  const incoming = (n: number) => tx(n, [[VOLUNTEER, 2_000_000]], [[ME, 1_000_000], [VOLUNTEER, 999_800]]);

  it('un invio fatto dopo dieci pagamenti in mempool compare in cima, anche se l\'API lo elenca per ultimo', () => {
    // L'API mette la mempool in un ordine non cronologico: qui l'invio (n. 50) è in fondo.
    const api = [...Array.from({ length: 10 }, (_, i) => incoming(i + 1)), tx(50, [[ME, 1_000_000]], [[OTHER, 300_000], [CHANGE_1, 699_800]], undefined, [1])];
    const seen = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [fakeTxid(i + 1), 1_000 + i]));
    const pendingSend: PendingTx = {
      txid: fakeTxid(50),
      createdAt: 9_000,
      hex: '',
      spent: [{ txid: fakeTxid(1), vout: 0, address: ME }],
      ownOutputs: [{ vout: 1, value: 699_800, address: CHANGE_1 }],
      recipient: OTHER,
      amount: 300_000,
      fee: 200,
      vsize: 141,
    };
    const items = buildHistory(api, [pendingSend], WALLET, seen);
    expect(items[0]).toMatchObject({ txid: fakeTxid(50), direction: 'out', amount: 300_000, time: 9 });
    expect(items.slice(1, 4).map((i) => i.txid)).toEqual([fakeTxid(10), fakeTxid(9), fakeTxid(8)]);
    // anche dopo che la voce locale è stata eliminata, l'orario di arrivo resta in `seen`
    const later = buildHistory(api, [], WALLET, { ...seen, [fakeTxid(50)]: 9_000 });
    expect(later[0]!.txid).toBe(fakeTxid(50));
  });

  it('una transazione presente nello storico di due indirizzi compare una volta (la copia confermata)', () => {
    const send = tx(7, [[ME, 10_000]], [[OTHER, 3_000], [CHANGE_1, 6_800]]);
    const confirmed = tx(7, [[ME, 10_000]], [[OTHER, 3_000], [CHANGE_1, 6_800]], 130);
    const items = buildHistory([send, incoming(1), confirmed], [], WALLET);
    expect(items.filter((i) => i.txid === fakeTxid(7))).toHaveLength(1);
    expect(items.find((i) => i.txid === fakeTxid(7))).toMatchObject({ confirmed: true, blockHeight: 130, direction: 'out', amount: 3_000 });
  });

  it('a parità di arrivo (o nello stesso blocco) la transazione figlia viene prima della madre', () => {
    // catena di puntate: 21 → 22 → 23, tutte viste nello stesso aggiornamento, elencate al contrario
    const a = tx(21, [[ME, 10_000]], [[OTHER, 1_000], [CHANGE_1, 8_800]]);
    const b = tx(22, [[CHANGE_1, 8_800]], [[OTHER, 1_000], [CHANGE_2, 7_600]], undefined, [21]);
    const c = tx(23, [[CHANGE_2, 7_600]], [[OTHER, 1_000]], undefined, [22]);
    expect(buildHistory([a, b, c], [], WALLET).map((i) => i.txid)).toEqual([fakeTxid(23), fakeTxid(22), fakeTxid(21)]);
    const inBlock = [tx(21, [[ME, 10_000]], [[CHANGE_1, 9_800]], 140), tx(22, [[CHANGE_1, 9_800]], [[OTHER, 9_600]], 140, [21])];
    expect(buildHistory(inBlock, [], WALLET).map((i) => i.txid)).toEqual([fakeTxid(22), fakeTxid(21)]);
  });

  it('una transazione figlia non può risultare più vecchia della madre', () => {
    const parent = tx(31, [[VOLUNTEER, 5_000]], [[ME, 4_000]]);
    const child = tx(32, [[ME, 4_000]], [[OTHER, 3_800]], undefined, [31]);
    // orario della figlia sconosciuto (prima lettura), della madre noto
    const items = buildHistory([child, incoming(1), parent], [], WALLET, { [fakeTxid(31)]: 5_000, [fakeTxid(1)]: 4_000 });
    expect(items.map((i) => i.txid)).toEqual([fakeTxid(32), fakeTxid(31), fakeTxid(1)]);
    expect(items[1]!.time).toBe(5);
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
