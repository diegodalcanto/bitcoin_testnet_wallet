import { describe, expect, it } from 'vitest';
import { KEYS, memoryStore, removeByPrefix } from './storage';

describe('storage', () => {
  it('stato locale e cache separati per rete e indirizzo', () => {
    expect(KEYS.pending('signet.tb1qabc')).toBe('tw.pending.signet.tb1qabc');
    expect(KEYS.cache('testnet4.tb1qabc')).toBe('tw.cache.testnet4.tb1qabc');
  });

  it('removeByPrefix cancella solo le chiavi con quel prefisso', () => {
    const kv = memoryStore({ 'tw.pending.signet.a': '[]', 'tw.pending.testnet4.b': '[]', 'tw.cache.signet.a': '{}', 'tw.wallet': '{}' });
    removeByPrefix(kv, KEYS.pendingPrefix);
    expect(kv.keys().sort()).toEqual(['tw.cache.signet.a', 'tw.wallet']);
  });
});
