import { describe, expect, it } from 'vitest';
import { btcToSats, checkAddress, parsePaymentRequest, paymentUri, shortAddress } from './address';
import { MAINNET_ADDRESSES, REGTEST_ADDRESS, TESTNET_ADDRESSES } from './test/fixtures';

describe('checkAddress', () => {
  it.each(Object.entries(TESTNET_ADDRESSES))('accetta un indirizzo di rete test %s', (type, address) => {
    const result = checkAddress(address);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.type).toBe(type);
  });

  it.each(Object.entries(MAINNET_ADDRESSES))('rifiuta un indirizzo di mainnet %s', (_type, address) => {
    expect(checkAddress(address)).toEqual({ ok: false, error: 'mainnet' });
  });

  it('rifiuta gli indirizzi regtest', () => {
    expect(checkAddress(REGTEST_ADDRESS)).toEqual({ ok: false, error: 'regtest' });
  });

  it('accetta un indirizzo bech32 tutto maiuscolo (QR) e lo normalizza', () => {
    const result = checkAddress(TESTNET_ADDRESSES.p2wpkh.toUpperCase());
    expect(result).toMatchObject({ ok: true, address: TESTNET_ADDRESSES.p2wpkh });
  });

  it('ignora gli spazi attorno', () => {
    expect(checkAddress(`  ${TESTNET_ADDRESSES.p2wpkh}\n`).ok).toBe(true);
  });

  it('rifiuta un indirizzo con un carattere sbagliato (checksum)', () => {
    const typo = TESTNET_ADDRESSES.p2wpkh.slice(0, -1) + (TESTNET_ADDRESSES.p2wpkh.endsWith('x') ? 'y' : 'x');
    expect(checkAddress(typo)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rifiuta maiuscole e minuscole mescolate', () => {
    const mixed = 'tb1qW508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
    expect(checkAddress(mixed).ok).toBe(false);
  });

  it('riconosce le fatture Lightning', () => {
    expect(checkAddress('lntb10u1pjexample')).toEqual({ ok: false, error: 'lightning' });
    expect(checkAddress('lnbc1500n1pexample')).toEqual({ ok: false, error: 'lightning' });
  });

  it('segnala il campo vuoto', () => {
    expect(checkAddress('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rifiuta testo qualsiasi', () => {
    expect(checkAddress('ciao')).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('btcToSats', () => {
  it('converte senza errori di arrotondamento', () => {
    expect(btcToSats('0.0001')).toBe(10_000);
    expect(btcToSats('1')).toBe(100_000_000);
    expect(btcToSats('0.00000001')).toBe(1);
    expect(btcToSats('0.1')).toBe(10_000_000);
    expect(btcToSats('21000000')).toBe(2_100_000_000_000_000);
    expect(btcToSats('1.')).toBe(100_000_000);
  });

  it('rifiuta più di 8 decimali e testo non numerico', () => {
    expect(btcToSats('0.123456789')).toBeNull();
    expect(btcToSats('abc')).toBeNull();
    expect(btcToSats('-1')).toBeNull();
    expect(btcToSats('1e-5')).toBeNull();
    expect(btcToSats('')).toBeNull();
  });
});

describe('parsePaymentRequest', () => {
  const addr = TESTNET_ADDRESSES.p2wpkh;

  it('indirizzo semplice', () => {
    expect(parsePaymentRequest(addr)).toEqual({ address: addr });
  });

  it('URI BIP21 con importo, etichetta e messaggio', () => {
    expect(parsePaymentRequest(`bitcoin:${addr}?amount=0.00012&label=Risposta%20A&message=Quiz`)).toEqual({
      address: addr,
      amountSats: 12_000,
      label: 'Risposta A',
      message: 'Quiz',
    });
  });

  it('URI tutto maiuscolo (QR alfanumerico)', () => {
    expect(parsePaymentRequest(`BITCOIN:${addr.toUpperCase()}?AMOUNT=0.001`)).toEqual({ address: addr, amountSats: 100_000 });
  });

  it('ignora un importo non valido', () => {
    expect(parsePaymentRequest(`bitcoin:${addr}?amount=abc`)).toEqual({ address: addr });
    expect(parsePaymentRequest(`bitcoin:${addr}?amount=0`)).toEqual({ address: addr });
  });

  it('accetta la forma bitcoin://', () => {
    expect(parsePaymentRequest(`bitcoin://${addr}`)).toEqual({ address: addr });
  });

  it('URI senza indirizzo', () => {
    expect(parsePaymentRequest('bitcoin:?amount=1')).toEqual({ address: '', amountSats: 100_000_000 });
  });
});

describe('paymentUri e shortAddress', () => {
  it('URI di ricezione nel formato bitcoin:tb1q…', () => {
    expect(paymentUri(TESTNET_ADDRESSES.p2wpkh)).toBe(`bitcoin:${TESTNET_ADDRESSES.p2wpkh}`);
  });

  it('abbrevia', () => {
    expect(shortAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe('tb1qw508…xpjzsx');
    expect(shortAddress('corto')).toBe('corto');
  });
});
