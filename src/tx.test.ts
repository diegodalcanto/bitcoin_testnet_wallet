import * as ecc from '@bitcoinerlab/secp256k1';
import { payments, script as bscript, Transaction } from 'bitcoinjs-lib';
import { describe, expect, it } from 'vitest';
import { checkAddress } from './address';
import { BITCOIN_NETWORK } from './networks';
import { ABANDON_ADDRESS, fakeTxid, KEY_ONE_WIF_TESTNET, TESTNET_ADDRESSES } from './test/fixtures';
import {
  chooseFeeRate,
  classifyBroadcastError,
  dustThreshold,
  estimateVsize,
  maxSendable,
  outputVbytes,
  planTransaction,
  signPlan,
  type SpendableUtxo,
} from './tx';
import { keysFromWif } from './wallet';

const keys = keysFromWif(KEY_ONE_WIF_TESTNET);
const change = { address: keys.address, script: keys.outputScript };

function target(address: string) {
  const result = checkAddress(address);
  if (!result.ok) throw new Error(`indirizzo non valido: ${address}`);
  return { address: result.address, script: result.script };
}

const recipient = target(ABANDON_ADDRESS);

function utxo(n: number, value: number, confirmed = true): SpendableUtxo {
  return { txid: fakeTxid(n), vout: n % 3, value, confirmed, local: false };
}

describe('dimensioni e fee', () => {
  it('stima P2WPKH = 11 + 68·input + 31·output', () => {
    const p2wpkh = recipient.script;
    for (const [inputs, outputs] of [
      [1, 1],
      [1, 2],
      [3, 2],
      [10, 1],
    ] as const) {
      expect(estimateVsize(inputs, Array(outputs).fill(p2wpkh))).toBe(11 + 68 * inputs + 31 * outputs);
    }
  });

  it('dimensione degli output per tipo di indirizzo', () => {
    expect(outputVbytes(target(TESTNET_ADDRESSES.p2wpkh).script)).toBe(31);
    expect(outputVbytes(target(TESTNET_ADDRESSES.p2tr).script)).toBe(43);
    expect(outputVbytes(target(TESTNET_ADDRESSES.p2wsh).script)).toBe(43);
    expect(outputVbytes(target(TESTNET_ADDRESSES.p2pkh).script)).toBe(34);
    expect(outputVbytes(target(TESTNET_ADDRESSES.p2sh).script)).toBe(32);
  });

  it('soglie dust come Bitcoin Core', () => {
    expect(dustThreshold(target(TESTNET_ADDRESSES.p2wpkh).script)).toBe(294);
    expect(dustThreshold(target(TESTNET_ADDRESSES.p2tr).script)).toBe(330);
    expect(dustThreshold(target(TESTNET_ADDRESSES.p2wsh).script)).toBe(330);
    expect(dustThreshold(target(TESTNET_ADDRESSES.p2pkh).script)).toBe(546);
    expect(dustThreshold(target(TESTNET_ADDRESSES.p2sh).script)).toBe(540);
  });

  it('fee = max(fastestFee, 2), 2 se l\'endpoint non risponde', () => {
    expect(chooseFeeRate(null)).toBe(2);
    expect(chooseFeeRate(undefined)).toBe(2);
    expect(chooseFeeRate(1)).toBe(2);
    expect(chooseFeeRate(0)).toBe(2);
    expect(chooseFeeRate(5)).toBe(5);
    expect(chooseFeeRate(3.2)).toBe(4);
    expect(chooseFeeRate(Number.NaN)).toBe(2);
  });
});

describe('planTransaction', () => {
  it('spende tutte le monete (anche non confermate) e rimanda il resto a sé', () => {
    const result = planTransaction({
      utxos: [utxo(1, 10_000), utxo(2, 5_000, false)],
      recipient,
      change,
      feeRate: 2,
      amount: 3_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { plan } = result;
    expect(plan.inputs).toHaveLength(2);
    expect(plan.vsize).toBe(209);
    expect(plan.fee).toBe(418);
    expect(plan.change).toBe(11_582);
    expect(plan.balanceAfter).toBe(11_582);
    expect(plan.outputs.map((o) => [o.kind, o.address, o.value])).toEqual([
      ['recipient', ABANDON_ADDRESS, 3_000],
      ['change', keys.address, 11_582],
    ]);
    expect(plan.totalIn).toBe(plan.amount + plan.fee + plan.change);
  });

  it('un resto sotto i 294 sat va in fee', () => {
    const result = planTransaction({ utxos: [utxo(1, 10_000)], recipient, change, feeRate: 2, amount: 9_500 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.outputs).toHaveLength(1);
    expect(result.plan.change).toBe(0);
    expect(result.plan.fee).toBe(500);
    expect(result.plan.dustToFee).toBe(280);
    expect(result.plan.vsize).toBe(110);
  });

  it('un resto di esattamente 294 sat resta un output', () => {
    // 10.000 − 282 (fee con 2 output) − 294 = 9.424
    const result = planTransaction({ utxos: [utxo(1, 10_000)], recipient, change, feeRate: 2, amount: 9_424 });
    expect(result.ok && result.plan.change).toBe(294);
  });

  it('importo pari al massimo: un solo output e nessun resto', () => {
    const result = planTransaction({ utxos: [utxo(1, 10_000)], recipient, change, feeRate: 2, amount: 9_780 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.outputs).toHaveLength(1);
    expect(result.plan.fee).toBe(220);
    expect(result.plan.dustToFee).toBe(0);
  });

  it('"Tutto": un solo output, importo = saldo − fee', () => {
    const utxos = [utxo(1, 10_000), utxo(2, 5_000, false)];
    const result = planTransaction({ utxos, recipient, change, feeRate: 2, sendAll: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.outputs).toHaveLength(1);
    expect(result.plan.vsize).toBe(178);
    expect(result.plan.fee).toBe(356);
    expect(result.plan.amount).toBe(14_644);
    expect(result.plan.balanceAfter).toBe(0);
    expect(maxSendable(utxos, recipient.script, 2)).toBe(14_644);
  });

  it('saldo insufficiente: indica il massimo inviabile', () => {
    const result = planTransaction({ utxos: [utxo(1, 10_000)], recipient, change, feeRate: 2, amount: 9_781 });
    expect(result).toEqual({ ok: false, error: { code: 'insufficient-funds', max: 9_780 } });
  });

  it('"Tutto" con un saldo più piccolo della fee', () => {
    const result = planTransaction({ utxos: [utxo(1, 500)], recipient, change, feeRate: 2, sendAll: true });
    expect(result).toEqual({ ok: false, error: { code: 'insufficient-funds', max: 0 } });
  });

  it('importo sotto la soglia dust del destinatario', () => {
    const utxos = [utxo(1, 10_000)];
    expect(planTransaction({ utxos, recipient, change, feeRate: 2, amount: 293 })).toEqual({
      ok: false,
      error: { code: 'below-dust', min: 294 },
    });
    const taproot = target(TESTNET_ADDRESSES.p2tr);
    expect(planTransaction({ utxos, recipient: taproot, change, feeRate: 2, amount: 329 })).toEqual({
      ok: false,
      error: { code: 'below-dust', min: 330 },
    });
  });

  it('nessuna moneta', () => {
    expect(planTransaction({ utxos: [], recipient, change, feeRate: 2, amount: 1_000 })).toEqual({
      ok: false,
      error: { code: 'no-funds' },
    });
  });

  it('importi non validi', () => {
    for (const amount of [0, -5, 1.5, Number.NaN]) {
      expect(planTransaction({ utxos: [utxo(1, 10_000)], recipient, change, feeRate: 2, amount })).toEqual({
        ok: false,
        error: { code: 'invalid-amount' },
      });
    }
  });
});

describe('signPlan', () => {
  const utxos = [utxo(1, 10_000), utxo(2, 5_000, false)];
  const planned = planTransaction({ utxos, recipient, change, feeRate: 2, amount: 3_000 });
  if (!planned.ok) throw new Error('piano non valido');
  const { plan } = planned;

  it('crea una transazione valida senza RBF', () => {
    const signed = signPlan(plan, keys);
    const tx = Transaction.fromHex(signed.hex);
    expect(tx.getId()).toBe(signed.txid);
    expect(tx.version).toBe(2);
    expect(tx.locktime).toBe(0);
    expect(tx.ins).toHaveLength(2);
    tx.ins.forEach((input, i) => {
      expect(input.sequence).toBe(0xffffffff);
      expect(Buffer.from(input.hash).reverse().toString('hex')).toBe(utxos[i]!.txid);
      expect(input.index).toBe(utxos[i]!.vout);
      expect(input.witness).toHaveLength(2);
    });
    expect(tx.outs.map((o) => o.value)).toEqual([3_000n, 11_582n]);
    expect(signed.fee).toBe(plan.fee);
    expect(signed.vsize).toBeLessThanOrEqual(plan.vsize);
    expect(signed.vsize).toBeGreaterThanOrEqual(plan.vsize - 2);
  });

  it('le firme sono valide (BIP143) e deterministiche', () => {
    const signed = signPlan(plan, keys);
    expect(signPlan(plan, keys).hex).toBe(signed.hex);
    const tx = Transaction.fromHex(signed.hex);
    const scriptCode = payments.p2pkh({ pubkey: keys.publicKey, network: BITCOIN_NETWORK }).output!;
    tx.ins.forEach((input, i) => {
      const [sigWithHashType, pubkey] = input.witness as [Uint8Array, Uint8Array];
      expect(Buffer.from(pubkey).equals(Buffer.from(keys.publicKey))).toBe(true);
      const { signature, hashType } = bscript.signature.decode(sigWithHashType);
      expect(hashType).toBe(Transaction.SIGHASH_ALL);
      const hash = tx.hashForWitnessV0(i, scriptCode, BigInt(utxos[i]!.value), hashType);
      expect(ecc.verify(hash, keys.publicKey, signature)).toBe(true);
    });
  });
});

describe('classifyBroadcastError', () => {
  it.each([
    ['sendrawtransaction RPC error: {"code":-26,"message":"too-long-mempool-chain, too many unconfirmed ancestors [limit: 25]"}', 'chain-limit'],
    ['too-long-mempool-chain, too many descendants for tx abc [limit: 25]', 'chain-limit'],
    ['sendrawtransaction RPC error: {"code":-26,"message":"too-large-cluster"}', 'chain-limit'],
    ['sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met, 100 < 141"}', 'fee-too-low'],
    ['mempool min fee not met, 120 < 300', 'fee-too-low'],
    ['insufficient fee, rejecting replacement', 'fee-too-low'],
    ['sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}', 'inputs-spent'],
    ['sendrawtransaction RPC error -26: txn-mempool-conflict', 'inputs-spent'],
    ['sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}', 'already-known'],
    ['sendrawtransaction RPC error: {"code":-26,"message":"txn-already-in-mempool"}', 'already-known'],
    ['sendrawtransaction RPC error: {"code":-27,"message":"Transaction outputs already in utxo set"}', 'already-known'],
    ['sendrawtransaction RPC error: {"code":-26,"message":"dust"}', 'dust'],
    ['sendrawtransaction RPC error -22: TX decode failed', 'unknown'],
  ])('%s → %s', (message, kind) => {
    expect(classifyBroadcastError(message)).toBe(kind);
  });
});
