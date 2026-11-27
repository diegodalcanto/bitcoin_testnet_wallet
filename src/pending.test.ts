import { Transaction } from 'bitcoinjs-lib';
import { describe, expect, it } from 'vitest';
import { checkAddress } from './address';
import {
  dropWithDescendants,
  inBroadcastOrder,
  isReflected,
  loadPending,
  mergeUtxos,
  outpointKey,
  pendingAddresses,
  pendingFromPlan,
  prunePending,
  savePending,
  type AddressedUtxo,
  type PendingTx,
} from './pending';
import { memoryStore } from './storage';
import {
  ABANDON_ADDRESS,
  ABANDON_CHANGE_0,
  ABANDON_MNEMONIC,
  fakeTxid,
  KEY_ONE_ADDRESS,
  KEY_ONE_WIF_TESTNET,
  TESTNET_ADDRESSES,
} from './test/fixtures';
import { planTransaction, signPlan } from './tx';
import { keysFromMnemonic, keysFromWif } from './wallet';

const A = fakeTxid(0xa);
const B = fakeTxid(0xb);
/** Indirizzo di ricezione del wallet dei test e uno dei suoi resti. */
const ME = KEY_ONE_ADDRESS;
const CHANGE = ABANDON_CHANGE_0;

function apiUtxo(txid: string, vout: number, value: number, confirmed = true, height = 100, address = ME): AddressedUtxo {
  return { txid, vout, value, status: confirmed ? { confirmed: true, block_height: height } : { confirmed: false }, address };
}

function pendingTx(txid: string, spent: [string, number][], ownOutputs: [number, number][], createdAt = 0, changeAddress = ME): PendingTx {
  return {
    txid,
    createdAt,
    hex: '',
    spent: spent.map(([t, vout]) => ({ txid: t, vout, address: ME })),
    ownOutputs: ownOutputs.map(([vout, value]) => ({ vout, value, address: changeAddress })),
    recipient: ABANDON_ADDRESS,
    amount: 1_000,
    fee: 200,
    vsize: 141,
  };
}

const P1 = fakeTxid(0x101);
const P2 = fakeTxid(0x102);
const P3 = fakeTxid(0x103);

describe('mergeUtxos', () => {
  it('senza voci locali restituisce gli UTXO dell\'API (confermati e no)', () => {
    const merged = mergeUtxos([apiUtxo(A, 0, 10_000), apiUtxo(B, 1, 2_000, false)], []);
    expect(merged.map((u) => [u.txid, u.vout, u.value, u.confirmed, u.local])).toEqual([
      [A, 0, 10_000, true, false],
      [B, 1, 2_000, false, false],
    ]);
  });

  it('aggiunge il resto locale e toglie le monete spese localmente', () => {
    const merged = mergeUtxos([apiUtxo(A, 0, 10_000)], [pendingTx(P1, [[A, 0]], [[1, 6_000]])]);
    expect(merged).toEqual([{ txid: P1, vout: 1, value: 6_000, confirmed: false, local: true, address: ME }]);
  });

  it('il resto locale su un indirizzo nuovo porta con sé il suo indirizzo (per firmarlo con la chiave giusta)', () => {
    const merged = mergeUtxos([apiUtxo(A, 0, 10_000), apiUtxo(B, 0, 700, true, 90, CHANGE)], [pendingTx(P1, [[A, 0]], [[1, 6_000]], 0, CHANGE)]);
    expect(merged.map((u) => [u.txid, u.address, u.local])).toEqual([
      [B, CHANGE, false],
      [P1, CHANGE, true],
    ]);
  });

  it('non conta due volte un resto che l\'API ha già visto', () => {
    const merged = mergeUtxos([apiUtxo(P1, 1, 6_000, false)], [pendingTx(P1, [[A, 0]], [[1, 6_000]])]);
    expect(merged).toEqual([{ txid: P1, vout: 1, value: 6_000, confirmed: false, local: false, blockHeight: undefined, address: ME }]);
  });

  it('catena di invii con l\'API ferma: resta solo l\'ultimo resto', () => {
    const pending = [pendingTx(P1, [[A, 0]], [[1, 6_000]]), pendingTx(P2, [[P1, 1]], [[1, 3_000]])];
    const merged = mergeUtxos([apiUtxo(A, 0, 10_000), apiUtxo(B, 0, 500, false)], pending);
    expect(merged.map((u) => outpointKey(u))).toEqual([`${B}:0`, `${P2}:1`]);
  });

  it('una transazione "Tutto" non lascia resto', () => {
    expect(mergeUtxos([apiUtxo(A, 0, 10_000)], [pendingTx(P1, [[A, 0]], [])])).toEqual([]);
  });

  it('un resto locale già speso da una transazione che l\'API conosce non si conta', () => {
    expect(mergeUtxos([], [pendingTx(P1, [[A, 0]], [[1, 6_000]])], new Set([`${P1}:1`]))).toEqual([]);
  });
});

describe('isReflected e prunePending', () => {
  const p1 = pendingTx(P1, [[A, 0]], [[1, 6_000]], 1_000);

  it('riflessa quando lo storico la conosce, le sue monete risultano spese e il suo resto è già stato speso', () => {
    expect(isReflected(p1, { utxos: [], txids: [P1], spentOutpoints: [`${P1}:1`] })).toBe(true);
  });

  it('non riflessa finché il suo resto (su un altro indirizzo) non compare nella vista', () => {
    // l'indirizzo di ricezione dice che la moneta è spesa, ma l'indirizzo del resto non è ancora stato letto
    expect(isReflected(p1, { utxos: [], txids: [P1] })).toBe(false);
    expect(isReflected(p1, { utxos: [apiUtxo(P1, 1, 6_000, false, 100, CHANGE)], txids: [P1] })).toBe(true);
  });

  it('riflessa quando il suo resto compare tra gli UTXO', () => {
    expect(isReflected(p1, { utxos: [apiUtxo(P1, 1, 6_000, false)] })).toBe(true);
  });

  it('non riflessa se la vista degli UTXO mostra ancora non spesa la moneta usata', () => {
    expect(isReflected(p1, { utxos: [apiUtxo(A, 0, 10_000)], txids: [P1] })).toBe(false);
  });

  it('non riflessa se l\'API non la conosce', () => {
    expect(isReflected(p1, { utxos: [], txids: [] })).toBe(false);
  });

  it('elimina le voci riflesse e quelle più vecchie di 30 minuti', () => {
    const p2 = pendingTx(P2, [[P1, 1]], [[1, 3_000]], 1_000);
    const old = pendingTx(P3, [[B, 0]], [], 0);
    const now = 30 * 60_000 + 500;
    expect(prunePending([p1, p2, old], { utxos: [apiUtxo(P1, 1, 6_000, false)], txids: [P1] }, now)).toEqual([p2]);
  });
});

describe('dropWithDescendants e ordine', () => {
  it('toglie una transazione e quelle che ne spendono gli output', () => {
    const p1 = pendingTx(P1, [[A, 0]], [[1, 6_000]], 1);
    const p2 = pendingTx(P2, [[P1, 1]], [[1, 3_000]], 2);
    const p3 = pendingTx(P3, [[P2, 1]], [[1, 1_000]], 3);
    const other = pendingTx(fakeTxid(0x200), [[B, 0]], [[1, 100]], 4);
    expect(dropWithDescendants([p1, p2, p3, other], P2)).toEqual([p1, other]);
    expect(inBroadcastOrder([p3, other, p1, p2]).map((p) => p.txid)).toEqual([P1, P2, P3, other.txid]);
  });
});

describe('persistenza separata per rete', () => {
  it('salva e rilegge; una rete non vede le voci dell\'altra', () => {
    const kv = memoryStore();
    const list = [pendingTx(P1, [[A, 0]], [[1, 6_000]], 0, CHANGE)];
    savePending(kv, 'signet', list);
    expect(loadPending(kv, 'signet', ME)).toEqual(list);
    expect(loadPending(kv, 'testnet4', ME)).toEqual([]);
    savePending(kv, 'signet', []);
    expect(kv.get('tw.pending.signet')).toBeNull();
  });

  it('le voci salvate dalle versioni precedenti (senza indirizzi) riguardano l\'indirizzo di ricezione', () => {
    const old = [{ ...pendingTx(P1, [[A, 0]], [[1, 6_000]]), spent: [{ txid: A, vout: 0, value: 10_000 }], ownOutputs: [{ vout: 1, value: 6_000 }] }];
    const loaded = loadPending(memoryStore({ 'tw.pending.signet.x': JSON.stringify(old) }), 'signet.x', ME);
    expect(loaded[0]!.spent).toEqual([{ txid: A, vout: 0, value: 10_000, address: ME }]);
    expect(loaded[0]!.ownOutputs).toEqual([{ vout: 1, value: 6_000, address: ME }]);
    expect(pendingAddresses(loaded)).toEqual(new Set([ME]));
  });

  it('ignora dati corrotti', () => {
    expect(loadPending(memoryStore({ 'tw.pending.signet': 'boh' }), 'signet', ME)).toEqual([]);
    expect(loadPending(memoryStore({ 'tw.pending.signet': '[{"txid":1}]' }), 'signet', ME)).toEqual([]);
  });
});

describe('5 invii consecutivi senza aspettare conferme', () => {
  it('ogni invio spende il resto del precedente anche se l\'API non si aggiorna', () => {
    const keys = keysFromWif(KEY_ONE_WIF_TESTNET);
    const change = { address: keys.address, script: keys.outputScript };
    const destinations = [ABANDON_ADDRESS, TESTNET_ADDRESSES.p2tr, TESTNET_ADDRESSES.p2wsh, TESTNET_ADDRESSES.p2pkh, TESTNET_ADDRESSES.p2sh];
    // L'API vede solo la dotazione iniziale, confermata: non si aggiorna mai durante il test.
    const api = [apiUtxo(A, 0, 100_000)];
    let pending: PendingTx[] = [];
    const spentEver = new Set<string>();
    let expectedBalance = 100_000;
    let previousTxid: string | null = null;

    destinations.forEach((destination, i) => {
      const spendable = mergeUtxos(api, pending);
      expect(spendable).toHaveLength(1);
      expect(spendable.reduce((s, u) => s + u.value, 0)).toBe(expectedBalance);
      if (previousTxid) expect(spendable[0]).toMatchObject({ txid: previousTxid, local: true, confirmed: false });

      const check = checkAddress(destination);
      if (!check.ok) throw new Error('indirizzo non valido');
      const planned = planTransaction({ utxos: spendable, recipient: check, change, feeRate: 2, amount: 5_000 + i });
      if (!planned.ok) throw new Error(`invio ${i + 1} non pianificato: ${planned.error.code}`);
      const signed = signPlan(planned.plan, keys);

      const tx = Transaction.fromHex(signed.hex);
      for (const input of tx.ins) {
        const key = `${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`;
        expect(spentEver.has(key)).toBe(false);
        spentEver.add(key);
      }
      pending = [...pending, pendingFromPlan(planned.plan, signed, keys.owned, i * 1_000)];
      expectedBalance -= 5_000 + i + signed.fee;
      previousTxid = signed.txid;
    });

    const final = mergeUtxos(api, pending);
    expect(final).toHaveLength(1);
    expect(final[0]!.value).toBe(expectedBalance);
    expect(pending).toHaveLength(5);
  });

  it('un invio a sé stessi conta anche l\'output del destinatario come proprio', () => {
    const keys = keysFromWif(KEY_ONE_WIF_TESTNET);
    const self = { address: keys.address, script: keys.outputScript };
    const planned = planTransaction({ utxos: mergeUtxos([apiUtxo(A, 0, 10_000)], []), recipient: self, change: self, feeRate: 2, amount: 2_000 });
    if (!planned.ok) throw new Error('piano non valido');
    const entry = pendingFromPlan(planned.plan, signPlan(planned.plan, keys), keys.owned, 0);
    expect(entry.ownOutputs.map((o) => o.value)).toEqual([2_000, 10_000 - 2_000 - planned.plan.fee]);
  });

  it('wallet da 12 parole: 5 invii di fila, ogni resto su un indirizzo nuovo, ogni moneta firmata con la sua chiave', () => {
    const receive = keysFromMnemonic(ABANDON_MNEMONIC).address;
    const api = [apiUtxo(A, 0, 100_000, true, 100, receive)];
    let pending: PendingTx[] = [];
    const changeAddresses: string[] = [];
    for (let i = 0; i < 5; i++) {
      const keys = keysFromMnemonic(ABANDON_MNEMONIC, 0, i); // i resti già usati
      const spendable = mergeUtxos(api, pending);
      expect(spendable).toHaveLength(1);
      // la moneta da spendere sta sul resto dell'invio precedente (o sull'indirizzo di ricezione)
      expect(spendable[0]!.address).toBe(i === 0 ? receive : changeAddresses[i - 1]);
      const check = checkAddress(TESTNET_ADDRESSES.p2tr);
      if (!check.ok) throw new Error('indirizzo non valido');
      const change = { address: keys.nextChange.address, script: keys.nextChange.outputScript };
      const planned = planTransaction({ utxos: spendable, recipient: check, change, feeRate: 2, amount: 1_000 });
      if (!planned.ok) throw new Error(planned.error.code);
      const signed = signPlan(planned.plan, keys);
      const entry = pendingFromPlan(planned.plan, signed, keys.owned, i);
      expect(entry.spent[0]!.address).toBe(spendable[0]!.address);
      expect(entry.ownOutputs).toEqual([{ vout: 1, value: planned.plan.change, address: keys.nextChange.address }]);
      changeAddresses.push(keys.nextChange.address);
      pending = [...pending, entry];
    }
    expect(new Set(changeAddresses).size).toBe(5);
    expect(changeAddresses[0]).toBe(CHANGE);
    expect(changeAddresses).not.toContain(receive);
    expect(pendingAddresses(pending)).toEqual(new Set([receive, ...changeAddresses]));
  });
});
