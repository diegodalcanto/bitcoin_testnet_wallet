import { Psbt } from 'bitcoinjs-lib';
import { CONFIG } from './config';
import { BITCOIN_NETWORK } from './networks';
import { signerFor, type WalletKeys } from './wallet';

/** Una "moneta" che il wallet può spendere (confermata o no, dall'API o dallo stato locale). */
export interface SpendableUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
  /** true se nota solo localmente (resto di una transazione appena inviata). */
  local: boolean;
  blockHeight?: number;
}

// ---------------------------------------------------------------------------
// Dimensioni e fee
// ---------------------------------------------------------------------------

/** vbyte di un input P2WPKH: 41 byte normali + 108 byte di witness / 4. */
export const P2WPKH_INPUT_VBYTES = 68;
/** vbyte fissi: versione, locktime, contatori e marker segwit (10,5 arrotondato). */
export const TX_OVERHEAD_VBYTES = 11;

function varIntSize(n: number): number {
  if (n < 0xfd) return 1;
  if (n <= 0xffff) return 3;
  if (n <= 0xffffffff) return 5;
  return 9;
}

/** vbyte di un output: 8 (importo) + lunghezza dello script + script. P2WPKH = 31. */
export function outputVbytes(script: Uint8Array): number {
  return 8 + varIntSize(script.length) + script.length;
}

/**
 * Stima della dimensione virtuale con input P2WPKH: con soli output P2WPKH è
 * 11 + 68·input + 31·output (spec §5).
 */
export function estimateVsize(inputCount: number, outputScripts: Uint8Array[]): number {
  return TX_OVERHEAD_VBYTES + P2WPKH_INPUT_VBYTES * inputCount + outputScripts.reduce((sum, s) => sum + outputVbytes(s), 0);
}

export function feeForVsize(vsize: number, feeRate: number): number {
  return Math.ceil(vsize * feeRate);
}

/** Fee da usare: max(fastestFee, fee minima); valore fisso se l'endpoint non risponde. */
export function chooseFeeRate(fastestFee: number | null | undefined): number {
  if (typeof fastestFee !== 'number' || !Number.isFinite(fastestFee) || fastestFee <= 0) {
    return Math.max(CONFIG.FALLBACK_FEE_RATE, CONFIG.MIN_FEE_RATE);
  }
  return Math.max(Math.ceil(fastestFee), CONFIG.MIN_FEE_RATE);
}

/**
 * Soglia "dust" di un output, come in Bitcoin Core (GetDustThreshold):
 * costo di creare e poi spendere l'output a 3 sat/vB. P2WPKH = 294, P2TR/P2WSH = 330, P2PKH = 546.
 */
export function dustThreshold(script: Uint8Array, dustRelayFeeRate: number = CONFIG.DUST_RELAY_FEE_RATE): number {
  const spendSize = isWitnessProgram(script) ? 32 + 4 + 1 + Math.floor(107 / 4) + 4 : 32 + 4 + 1 + 107 + 4;
  return (outputVbytes(script) + spendSize) * dustRelayFeeRate;
}

/** Script segwit (P2WPKH, P2WSH, P2TR…): OP_0…OP_16 seguito da un programma di 2–40 byte. */
function isWitnessProgram(script: Uint8Array): boolean {
  const version = script[0] ?? -1;
  return (
    script.length >= 4 &&
    script.length <= 42 &&
    (version === 0x00 || (version >= 0x51 && version <= 0x60)) &&
    script[1] === script.length - 2
  );
}

// ---------------------------------------------------------------------------
// Costruzione
// ---------------------------------------------------------------------------

export interface PlannedOutput {
  kind: 'recipient' | 'change';
  address: string;
  script: Uint8Array;
  value: number;
}

export interface TxPlan {
  inputs: SpendableUtxo[];
  outputs: PlannedOutput[];
  /** Importo che arriva al destinatario. */
  amount: number;
  /** Fee totale pagata (compreso l'eventuale resto troppo piccolo). */
  fee: number;
  /** Fee richiesta in sat/vB. */
  feeRate: number;
  /** Dimensione virtuale stimata. */
  vsize: number;
  /** Resto che torna al proprio indirizzo (0 se non c'è). */
  change: number;
  /** Resto sotto la soglia dust finito in fee. */
  dustToFee: number;
  totalIn: number;
  sendAll: boolean;
  /** Saldo che resta dopo l'invio (= il resto, perché si spendono tutte le monete). */
  balanceAfter: number;
}

export type PlanError =
  | { code: 'no-funds' }
  | { code: 'invalid-amount' }
  | { code: 'below-dust'; min: number }
  | { code: 'insufficient-funds'; max: number };

export type PlanResult = { ok: true; plan: TxPlan } | { ok: false; error: PlanError };

export interface PlanParams {
  utxos: SpendableUtxo[];
  recipient: { address: string; script: Uint8Array };
  change: { address: string; script: Uint8Array };
  feeRate: number;
  /** Importo in sats; ignorato se sendAll. */
  amount?: number;
  /** Pulsante "Tutto": un solo output, importo = saldo − fee. */
  sendAll?: boolean;
}

/** Massimo inviabile a un destinatario: saldo − fee di una transazione con un solo output. */
export function maxSendable(utxos: SpendableUtxo[], recipientScript: Uint8Array, feeRate: number): number {
  if (utxos.length === 0) return 0;
  const total = utxos.reduce((sum, u) => sum + u.value, 0);
  const fee = feeForVsize(estimateVsize(utxos.length, [recipientScript]), feeRate);
  return Math.max(0, total - fee);
}

/**
 * Prepara una transazione. Input: tutte le monete spendibili (consolidamento a ogni invio, così resta
 * un solo resto e una catena lineare). Output: destinatario + resto allo stesso indirizzo; un resto
 * sotto la soglia dust va in fee.
 */
export function planTransaction(params: PlanParams): PlanResult {
  const { utxos, recipient, change, feeRate } = params;
  if (utxos.length === 0) return { ok: false, error: { code: 'no-funds' } };
  const inputs = [...utxos];
  const totalIn = inputs.reduce((sum, u) => sum + u.value, 0);
  const minAmount = dustThreshold(recipient.script);
  const vsizeOne = estimateVsize(inputs.length, [recipient.script]);
  const feeOne = feeForVsize(vsizeOne, feeRate);
  const max = Math.max(0, totalIn - feeOne);

  const base = { inputs, feeRate, totalIn, sendAll: Boolean(params.sendAll) };

  if (params.sendAll) {
    if (max < minAmount) return { ok: false, error: { code: 'insufficient-funds', max: 0 } };
    return {
      ok: true,
      plan: {
        ...base,
        outputs: [{ kind: 'recipient', address: recipient.address, script: recipient.script, value: max }],
        amount: max,
        fee: totalIn - max,
        vsize: vsizeOne,
        change: 0,
        dustToFee: 0,
        balanceAfter: 0,
      },
    };
  }

  const amount = params.amount ?? 0;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: { code: 'invalid-amount' } };
  if (amount < minAmount) return { ok: false, error: { code: 'below-dust', min: minAmount } };
  if (amount > max) return { ok: false, error: { code: 'insufficient-funds', max: max >= minAmount ? max : 0 } };

  const vsizeTwo = estimateVsize(inputs.length, [recipient.script, change.script]);
  const feeTwo = feeForVsize(vsizeTwo, feeRate);
  const changeValue = totalIn - amount - feeTwo;
  const recipientOutput: PlannedOutput = { kind: 'recipient', address: recipient.address, script: recipient.script, value: amount };

  if (changeValue >= dustThreshold(change.script)) {
    return {
      ok: true,
      plan: {
        ...base,
        outputs: [recipientOutput, { kind: 'change', address: change.address, script: change.script, value: changeValue }],
        amount,
        fee: feeTwo,
        vsize: vsizeTwo,
        change: changeValue,
        dustToFee: 0,
        balanceAfter: changeValue,
      },
    };
  }

  // Resto troppo piccolo (o negativo con due output): un solo output, la differenza va in fee.
  const fee = totalIn - amount;
  return {
    ok: true,
    plan: {
      ...base,
      outputs: [recipientOutput],
      amount,
      fee,
      vsize: vsizeOne,
      change: 0,
      dustToFee: fee - feeOne,
      balanceAfter: 0,
    },
  };
}

export interface SignedTx {
  txid: string;
  hex: string;
  vsize: number;
  fee: number;
}

/**
 * Firma con Psbt usando witnessUtxo (valore + script), senza scaricare le transazioni precedenti.
 * nSequence = 0xffffffff: nessuna sostituzione (RBF).
 */
export function signPlan(plan: TxPlan, keys: WalletKeys): SignedTx {
  const psbt = new Psbt({ network: BITCOIN_NETWORK });
  psbt.setVersion(2);
  psbt.setLocktime(0);
  for (const input of plan.inputs) {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      sequence: 0xffffffff,
      witnessUtxo: { script: keys.outputScript, value: BigInt(input.value) },
    });
  }
  for (const output of plan.outputs) {
    psbt.addOutput({ script: output.script, value: BigInt(output.value) });
  }
  psbt.signAllInputs(signerFor(keys));
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { txid: tx.getId(), hex: tx.toHex(), vsize: tx.virtualSize(), fee: Number(psbt.getFee()) };
}

// ---------------------------------------------------------------------------
// Errori del broadcast
// ---------------------------------------------------------------------------

export type BroadcastErrorKind =
  | 'chain-limit'
  | 'fee-too-low'
  | 'inputs-spent'
  | 'already-known'
  | 'dust'
  | 'unknown';

/** Classifica il messaggio d'errore di un nodo (via Esplora) per mostrare un messaggio comprensibile. */
export function classifyBroadcastError(message: string): BroadcastErrorKind {
  const m = message.toLowerCase();
  if (/txn-already-in-mempool|txn-already-known|transaction already in block chain|already in utxo set|already have transaction/.test(m)) {
    return 'already-known';
  }
  if (/too-long-mempool-chain|too many unconfirmed (ancestors|descendants)|exceeds (ancestor|descendant)|cluster/.test(m)) {
    return 'chain-limit';
  }
  if (/min relay fee not met|mempool min fee not met|insufficient fee|min-fee-not-met|fee not met/.test(m)) {
    return 'fee-too-low';
  }
  if (/missingorspent|missing-inputs|missing inputs|inputs-spent|txn-mempool-conflict|bad-txns-spends-conflicting-tx/.test(m)) {
    return 'inputs-spent';
  }
  if (/\bdust\b/.test(m)) return 'dust';
  return 'unknown';
}
