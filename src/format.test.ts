import { describe, expect, it } from 'vitest';
import { formatBtc, formatMinutes, formatSats, formatSignedSats, groupChars, minutesSince, parseSatsInput, shortTxid } from './format';

describe('formatSats / formatBtc', () => {
  it('separatore delle migliaia sempre presente', () => {
    expect(formatSats(0)).toBe('0');
    expect(formatSats(999)).toBe('999');
    expect(formatSats(1_234)).toBe('1.234');
    expect(formatSats(12_345_678)).toBe('12.345.678');
    expect(formatSats(-5_000)).toBe('−5.000');
  });

  it('tBTC con 8 decimali e virgola', () => {
    expect(formatBtc(12_345)).toBe('0,00012345');
    expect(formatBtc(100_000_000)).toBe('1,00000000');
    expect(formatBtc(2_100_000_000_000_000)).toBe('21.000.000,00000000');
    expect(formatBtc(-1)).toBe('−0,00000001');
  });

  it('segno esplicito', () => {
    expect(formatSignedSats(1_000)).toBe('+1.000');
    expect(formatSignedSats(-1_000)).toBe('−1.000');
  });
});

describe('parseSatsInput', () => {
  it('accetta numeri interi con o senza separatori', () => {
    expect(parseSatsInput('10000')).toBe(10_000);
    expect(parseSatsInput('10.000')).toBe(10_000);
    expect(parseSatsInput(' 10 000 ')).toBe(10_000);
  });

  it('rifiuta decimali, negativi e testo', () => {
    expect(parseSatsInput('10,5')).toBeNull();
    expect(parseSatsInput('-3')).toBeNull();
    expect(parseSatsInput('abc')).toBeNull();
    expect(parseSatsInput('')).toBeNull();
  });
});

describe('tempi e testi', () => {
  it('minuti trascorsi, mai negativi', () => {
    expect(minutesSince(1_000, 1_000_000 + 5 * 60_000)).toBe(5);
    expect(minutesSince(2_000, 1_000_000)).toBe(0);
  });

  it('durate brevi', () => {
    expect(formatMinutes(0)).toBe('meno di 1 min');
    expect(formatMinutes(4)).toBe('4 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(65)).toBe('1 h 5 min');
  });

  it('raggruppa e abbrevia', () => {
    expect(groupChars('tb1qabcdefgh')).toBe('tb1q abcd efgh');
    expect(shortTxid('a'.repeat(64))).toBe('aaaaaaaa…aaaaaa');
  });
});
