import { address as bitcoinAddress, networks, type Network } from 'bitcoinjs-lib';
import './ecc';
import { BITCOIN_NETWORK } from './networks';

export type AddressType = 'p2wpkh' | 'p2wsh' | 'p2tr' | 'p2pkh' | 'p2sh' | 'other';
export type AddressError = 'empty' | 'mainnet' | 'regtest' | 'lightning' | 'invalid';

export type AddressCheck =
  | { ok: true; address: string; type: AddressType; script: Uint8Array }
  | { ok: false; error: AddressError };

/** Gli indirizzi bech32 possono essere tutti maiuscoli (QR in modalità alfanumerica). */
export function normalizeAddress(input: string): string {
  const s = input.trim();
  if (/^(tb1|bc1|bcrt1)/i.test(s) && s === s.toUpperCase()) return s.toLowerCase();
  return s;
}

function isValidOn(address: string, network: Network): boolean {
  try {
    bitcoinAddress.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}

/** Tipo di output dallo script (serve per stimare dimensione e soglia dust). */
export function scriptType(script: Uint8Array): AddressType {
  const n = script.length;
  if (n === 22 && script[0] === 0x00 && script[1] === 0x14) return 'p2wpkh';
  if (n === 34 && script[0] === 0x00 && script[1] === 0x20) return 'p2wsh';
  if (n === 34 && script[0] === 0x51 && script[1] === 0x20) return 'p2tr';
  if (n === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac) {
    return 'p2pkh';
  }
  if (n === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) return 'p2sh';
  return 'other';
}

/**
 * Controlla un indirizzo destinatario. Accetta solo indirizzi di rete test
 * (`tb1…`, `m…`/`n…`, `2…`) e rifiuta esplicitamente quelli di mainnet (spec §3).
 */
export function checkAddress(input: string): AddressCheck {
  const address = normalizeAddress(input);
  if (!address) return { ok: false, error: 'empty' };
  if (/^(ln(bc|tb|tbs|bcrt)\d*|lnurl)/i.test(address)) return { ok: false, error: 'lightning' };
  try {
    const script = bitcoinAddress.toOutputScript(address, BITCOIN_NETWORK);
    return { ok: true, address, type: scriptType(script), script };
  } catch {
    // non è un indirizzo di rete test: capiamo perché
  }
  if (isValidOn(address, networks.bitcoin)) return { ok: false, error: 'mainnet' };
  if (isValidOn(address, networks.regtest)) return { ok: false, error: 'regtest' };
  return { ok: false, error: 'invalid' };
}

/** Converte un importo in BTC scritto come testo (es. "0.0005") in sats, senza errori di arrotondamento. */
export function btcToSats(value: string): number | null {
  const s = value.trim();
  const m = /^(\d+)(?:\.(\d{0,8}))?$/.exec(s);
  if (!m) return null;
  const sats = BigInt(m[1] ?? '0') * 100_000_000n + BigInt((m[2] ?? '').padEnd(8, '0'));
  if (sats > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(sats);
}

export interface PaymentRequest {
  address: string;
  amountSats?: number;
  label?: string;
  message?: string;
}

/**
 * Interpreta il contenuto di un QR o di un testo incollato: indirizzo semplice
 * oppure URI BIP21 (`bitcoin:tb1…?amount=0.0001&label=…`).
 */
export function parsePaymentRequest(input: string): PaymentRequest {
  const s = input.trim();
  const m = /^bitcoin:(?:\/\/)?([^?]*)(?:\?(.*))?$/i.exec(s);
  if (!m) return { address: normalizeAddress(s) };
  let rawAddress = m[1] ?? '';
  try {
    rawAddress = decodeURIComponent(rawAddress);
  } catch {
    // lasciamo il testo com'è: la validazione dirà che non è un indirizzo
  }
  const request: PaymentRequest = { address: normalizeAddress(rawAddress) };
  const params = new URLSearchParams(m[2] ?? '');
  for (const [rawKey, value] of params) {
    const key = rawKey.toLowerCase();
    if (key === 'amount') {
      const sats = btcToSats(value);
      if (sats !== null && sats > 0) request.amountSats = sats;
    } else if (key === 'label') {
      request.label = value;
    } else if (key === 'message') {
      request.message = value;
    }
  }
  return request;
}

/** URI BIP21 da mostrare nel QR di ricezione (spec §6: formato `bitcoin:tb1q…`). */
export function paymentUri(address: string): string {
  return `bitcoin:${address}`;
}

/** Indirizzo abbreviato per i riepiloghi: `tb1qxy…wxyz`. */
export function shortAddress(address: string, head = 8, tail = 6): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
