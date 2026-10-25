import * as ecc from '@bitcoinerlab/secp256k1';
import { initEccLib } from 'bitcoinjs-lib';

/**
 * Curva secp256k1 in JavaScript puro (niente WASM). bitcoinjs-lib la richiede per
 * validare gli indirizzi Taproot (tb1p…), ecpair per firmare.
 */
initEccLib(ecc);

export { ecc };
