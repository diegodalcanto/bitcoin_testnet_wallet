/**
 * Server Esplora finto, in memoria, per i test nel browser: decodifica davvero le transazioni
 * (bitcoinjs-lib), controlla che gli input esistano e non siano già spesi, tiene una mempool.
 * Può fingere un'API "in ritardo" (stale) che non vede ancora le ultime transazioni.
 */
import * as ecc from '@bitcoinerlab/secp256k1';
import { address as bitcoinAddress, initEccLib, networks, Transaction } from 'bitcoinjs-lib';
import { createHash, randomBytes } from 'node:crypto';

initEccLib(ecc);
const NET = networks.testnet;
const SIGNET_GENESIS = '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6';

const toHex = (u8) => Buffer.from(u8).toString('hex');

function addressOf(script) {
  try {
    return bitcoinAddress.fromOutputScript(script, NET);
  } catch {
    return undefined;
  }
}

export class MockEsplora {
  constructor({ height = 327_953, minutesSinceBlock = 4 } = {}) {
    this.height = height;
    this.tipTime = Math.floor(Date.now() / 1000) - minutesSinceBlock * 60;
    /** key "txid:vout" → { txid, vout, value, address, height|null } */
    this.utxos = new Map();
    /** txid → { tx (esplora json), hex, spends: [key] } */
    this.txs = new Map();
    this.stale = false;
    this.staleUtxos = null;
    this.staleTxs = null;
    /** Errori da restituire ai prossimi broadcast (messaggi RPC). */
    this.failNextBroadcast = [];
    this.broadcasts = [];
    this.requests = [];
    this.rateLimitNext = 0;
  }

  tipHash() {
    return createHash('sha256').update(`block-${this.height}`).digest('hex');
  }

  /** Simula i volontari che mandano la dotazione iniziale (transazione di un altro wallet). */
  fund(address, value, { confirmed = true } = {}) {
    const txid = toHex(randomBytes(32));
    const status = confirmed ? { confirmed: true, block_height: this.height, block_hash: this.tipHash(), block_time: this.tipTime } : { confirmed: false };
    const volunteer = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
    const tx = {
      txid,
      version: 2,
      locktime: 0,
      vin: [{ txid: toHex(randomBytes(32)), vout: 0, prevout: { scriptpubkey: '', scriptpubkey_address: volunteer, value: value + 10_000 }, is_coinbase: false, sequence: 0xffffffff }],
      vout: [
        { scriptpubkey: '', scriptpubkey_address: address, value },
        { scriptpubkey: '', scriptpubkey_address: volunteer, value: 9_800 },
      ],
      size: 222,
      weight: 561,
      fee: 200,
      status,
    };
    this.txs.set(txid, { tx, hex: '02000000000000000000', spends: [] });
    this.utxos.set(`${txid}:0`, { txid, vout: 0, value, address, height: confirmed ? this.height : null });
    return txid;
  }

  /** Nuovo blocco: tutte le transazioni in mempool vengono confermate. */
  mine() {
    this.height += 1;
    this.tipTime = Math.floor(Date.now() / 1000);
    for (const entry of this.txs.values()) {
      if (!entry.tx.status.confirmed) {
        entry.tx.status = { confirmed: true, block_height: this.height, block_hash: this.tipHash(), block_time: this.tipTime };
      }
    }
    for (const u of this.utxos.values()) if (u.height === null) u.height = this.height;
  }

  /** Il server "dimentica" una transazione in mempool (come un nodo che non l'ha mai ricevuta). */
  drop(txid) {
    const entry = this.txs.get(txid);
    if (!entry || entry.tx.status.confirmed) return;
    this.txs.delete(txid);
    entry.tx.vout.forEach((_, i) => this.utxos.delete(`${txid}:${i}`));
    entry.tx.vin.forEach((vin) =>
      this.utxos.set(`${vin.txid}:${vin.vout}`, { txid: vin.txid, vout: vin.vout, value: vin.prevout.value, address: vin.prevout.scriptpubkey_address, height: this.height }),
    );
  }

  /** Da qui in poi l'API "non vede" le novità (come un server in ritardo). */
  freeze() {
    this.stale = true;
    this.staleUtxos = new Map([...this.utxos].map(([k, v]) => [k, { ...v }]));
    this.staleTxs = new Set(this.txs.keys());
  }

  unfreeze() {
    this.stale = false;
    this.staleUtxos = null;
    this.staleTxs = null;
  }

  utxoJson(u) {
    return {
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      status: u.height === null ? { confirmed: false } : { confirmed: true, block_height: u.height, block_hash: this.tipHash(), block_time: this.tipTime },
    };
  }

  broadcast(hex) {
    let tx;
    try {
      tx = Transaction.fromHex(hex);
    } catch {
      return { status: 400, body: 'sendrawtransaction RPC error: {"code":-22,"message":"TX decode failed"}' };
    }
    this.broadcasts.push(hex);
    const forced = this.failNextBroadcast.shift();
    if (forced) return { status: 400, body: `sendrawtransaction RPC error: {"code":-26,"message":"${forced}"}` };
    const txid = tx.getId();
    if (this.txs.has(txid)) return { status: 400, body: 'sendrawtransaction RPC error: {"code":-27,"message":"txn-already-in-mempool"}' };
    const spends = [];
    const vin = [];
    let totalIn = 0;
    for (const input of tx.ins) {
      const key = `${toHex(Buffer.from(input.hash).reverse())}:${input.index}`;
      const utxo = this.utxos.get(key);
      if (!utxo) return { status: 400, body: 'sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}' };
      if (input.sequence !== 0xffffffff) return { status: 400, body: 'test: nSequence diverso da 0xffffffff' };
      spends.push(key);
      totalIn += utxo.value;
      vin.push({ txid: utxo.txid, vout: utxo.vout, prevout: { scriptpubkey: '', scriptpubkey_address: utxo.address, value: utxo.value }, is_coinbase: false, sequence: input.sequence });
    }
    const vout = tx.outs.map((out) => ({ scriptpubkey: toHex(out.script), scriptpubkey_address: addressOf(out.script), value: Number(out.value) }));
    const totalOut = vout.reduce((s, o) => s + o.value, 0);
    const fee = totalIn - totalOut;
    if (fee < 0) return { status: 400, body: 'sendrawtransaction RPC error: {"code":-26,"message":"bad-txns-in-belowout"}' };
    if (fee < tx.virtualSize()) return { status: 400, body: `sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met, ${fee} < ${tx.virtualSize()}"}` };
    for (const key of spends) this.utxos.delete(key);
    vout.forEach((o, i) => this.utxos.set(`${txid}:${i}`, { txid, vout: i, value: o.value, address: o.scriptpubkey_address, height: null }));
    this.txs.set(txid, {
      hex,
      spends,
      tx: { txid, version: tx.version, locktime: tx.locktime, vin, vout, size: tx.byteLength(), weight: tx.weight(), fee, status: { confirmed: false } },
    });
    return { status: 200, body: txid };
  }

  /** Gestisce una richiesta all'API (path relativo alla base, es. "/address/tb1…/utxo"). */
  handle(method, path, body) {
    this.requests.push(`${method} ${path}`);
    if (this.rateLimitNext > 0) {
      this.rateLimitNext -= 1;
      return { status: 429, body: 'Too Many Requests' };
    }
    if (method === 'POST' && path === '/tx') return this.broadcast(String(body ?? '').trim());
    let m;
    if ((m = /^\/address\/([^/]+)\/utxo$/.exec(path))) {
      const source = this.stale ? this.staleUtxos : this.utxos;
      return { json: [...source.values()].filter((u) => u.address === m[1]).map((u) => this.utxoJson(u)) };
    }
    if ((m = /^\/address\/([^/]+)\/txs$/.exec(path))) {
      const address = m[1];
      const list = [...this.txs.values()]
        .filter(({ tx }) => !this.stale || this.staleTxs.has(tx.txid))
        .map(({ tx }) => tx)
        .filter((tx) => tx.vout.some((o) => o.scriptpubkey_address === address) || tx.vin.some((i) => i.prevout?.scriptpubkey_address === address));
      const mempool = list.filter((tx) => !tx.status.confirmed).reverse();
      const confirmed = list.filter((tx) => tx.status.confirmed).sort((a, b) => b.status.block_height - a.status.block_height);
      return { json: [...mempool, ...confirmed].map((tx) => ({ ...tx, status: { ...tx.status } })) };
    }
    if (path === '/blocks/tip/hash') return { text: this.tipHash() };
    if (path === '/blocks/tip/height') return { text: String(this.height) };
    if ((m = /^\/block\/([0-9a-f]+)$/.exec(path))) return { json: { id: m[1], height: this.height, timestamp: this.tipTime } };
    if (path === '/block-height/0') return { text: SIGNET_GENESIS };
    if (path === '/v1/fees/recommended') return { json: { fastestFee: 1, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 } };
    if ((m = /^\/tx\/([0-9a-f]{64})\/hex$/.exec(path))) {
      const entry = this.txs.get(m[1]);
      return entry ? { text: entry.hex } : { status: 404, body: 'Transaction not found' };
    }
    if ((m = /^\/tx\/([0-9a-f]{64})$/.exec(path))) {
      const entry = this.txs.get(m[1]);
      return entry ? { json: entry.tx } : { status: 404, body: 'Transaction not found' };
    }
    return { status: 404, body: 'Not found' };
  }
}
