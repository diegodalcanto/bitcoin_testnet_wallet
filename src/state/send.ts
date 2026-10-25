import { CONFIG } from '../config';
import { EsploraError, type EsploraClient } from '../esplora';
import { dropWithDescendants, inBroadcastOrder, pendingFromPlan } from '../pending';
import { classifyBroadcastError, planTransaction, signPlan, type PlanError, type SignedTx, type TxPlan } from '../tx';
import { refresh } from './sync';
import { client, keys, pending, setPending, spendable } from './wallet';

export type SendError =
  | { code: 'no-wallet' }
  | { code: 'plan'; error: PlanError }
  | { code: 'chain-limit' }
  | { code: 'fee-too-low' }
  | { code: 'inputs-spent' }
  | { code: 'rate-limit' }
  | { code: 'network' }
  | { code: 'uncertain' }
  | { code: 'rejected'; message: string };

export type SendResult = { ok: true; txid: string; plan: TxPlan; signed: SignedTx } | { ok: false; error: SendError };

export interface SendRequest {
  recipient: { address: string; script: Uint8Array };
  amount?: number;
  sendAll?: boolean;
  feeRate: number;
}

/** Dopo un errore di rete: la transazione è arrivata comunque? null = non si sa. */
async function wasBroadcast(api: EsploraClient, txid: string): Promise<boolean | null> {
  try {
    await api.getTx(txid);
    return true;
  } catch (err) {
    if (err instanceof EsploraError && err.kind === 'http' && err.status === 404) return false;
    return null;
  }
}

/**
 * Input mancanti o già spesi: ritrasmette le transazioni locali (un server di riserva potrebbe non
 * conoscerle), scarta quelle in conflitto e ricarica le monete dall'API.
 */
async function recoverInputs(api: EsploraClient): Promise<void> {
  for (const p of inBroadcastOrder(pending.value)) {
    try {
      await api.broadcast(p.hex);
    } catch (err) {
      if (err instanceof EsploraError && err.kind === 'http' && classifyBroadcastError(err.body) === 'inputs-spent') {
        setPending(dropWithDescendants(pending.value, p.txid));
      }
    }
  }
  await refresh({ full: true });
}

/**
 * Costruisce, firma e trasmette. Ritenta una volta con fee doppia se la fee è troppo bassa e una volta
 * dopo aver ricaricato le monete se risultano già spese (spec §5).
 */
export async function sendPayment(request: SendRequest): Promise<SendResult> {
  const k = keys.value;
  if (!k) return { ok: false, error: { code: 'no-wallet' } };
  const api = client.value;
  const change = { address: k.address, script: k.outputScript };
  let feeRate = request.feeRate;
  let feeRetried = false;
  let inputsRetried = false;

  const commit = (plan: TxPlan, signed: SignedTx): SendResult => {
    const entry = pendingFromPlan(plan, signed, k.address, Date.now());
    setPending([...pending.value.filter((p) => p.txid !== entry.txid), entry]);
    setTimeout(() => void refresh({ full: true }), CONFIG.REFRESH_AFTER_SEND_MS);
    return { ok: true, txid: signed.txid, plan, signed };
  };

  for (;;) {
    const planned = planTransaction({
      utxos: spendable.value,
      recipient: request.recipient,
      change,
      feeRate,
      amount: request.amount,
      sendAll: request.sendAll,
    });
    if (!planned.ok) return { ok: false, error: { code: 'plan', error: planned.error } };
    const signed = signPlan(planned.plan, k);

    try {
      await api.broadcast(signed.hex);
      return commit(planned.plan, signed);
    } catch (err) {
      if (!(err instanceof EsploraError)) throw err;
      if (err.kind === 'rate-limit') return { ok: false, error: { code: 'rate-limit' } };

      if (err.kind === 'http' && (err.status ?? 0) < 500) {
        const message = err.body || err.message;
        switch (classifyBroadcastError(message)) {
          case 'already-known':
            return commit(planned.plan, signed);
          case 'fee-too-low':
            if (feeRetried) return { ok: false, error: { code: 'fee-too-low' } };
            feeRetried = true;
            feeRate *= 2;
            continue;
          case 'inputs-spent':
            if (inputsRetried) return { ok: false, error: { code: 'inputs-spent' } };
            inputsRetried = true;
            await recoverInputs(api);
            continue;
          case 'chain-limit':
            return { ok: false, error: { code: 'chain-limit' } };
          default:
            return { ok: false, error: { code: 'rejected', message } };
        }
      }

      // Rete assente, timeout o errore del server: controlliamo se la transazione è partita lo stesso.
      const known = await wasBroadcast(api, signed.txid);
      if (known) return commit(planned.plan, signed);
      return { ok: false, error: { code: known === false ? 'network' : 'uncertain' } };
    }
  }
}
