import { describe, expect, it } from 'vitest';
import {
  BITCOIN_NETWORK,
  explorerFromEsploraUrl,
  GENESIS_HASHES,
  getNetworkInfo,
  identifyChain,
  isNetworkId,
  normalizeEsploraUrl,
  PRESET_NETWORKS,
  txExplorerUrl,
} from './networks';

describe('reti', () => {
  it('tutte le reti usano i parametri testnet (tb1…)', () => {
    expect(BITCOIN_NETWORK.bech32).toBe('tb');
    expect(BITCOIN_NETWORK.wif).toBe(0xef);
  });

  it('Signet è la predefinita, ogni rete ha un endpoint di riserva e un colore', () => {
    expect(PRESET_NETWORKS.signet.endpoints[0]).toBe('https://mempool.space/signet/api');
    for (const net of Object.values(PRESET_NETWORKS)) {
      expect(net.endpoints.length).toBeGreaterThanOrEqual(2);
      expect(net.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const colors = new Set(Object.values(PRESET_NETWORKS).map((n) => n.color));
    expect(colors.size).toBe(3);
  });

  it('rete personalizzata dall\'URL', () => {
    const net = getNetworkInfo('custom', 'https://esplora.scuola.it/signet/api/');
    expect(net.endpoints).toEqual(['https://esplora.scuola.it/signet/api']);
    expect(net.explorerUrl).toBe('https://esplora.scuola.it/signet');
    expect(getNetworkInfo('custom', 'non è un url').endpoints).toEqual([]);
  });

  it('link all\'explorer', () => {
    expect(txExplorerUrl(PRESET_NETWORKS.testnet4, 'abc')).toBe('https://mempool.space/testnet4/tx/abc');
    expect(txExplorerUrl(getNetworkInfo('custom', 'https://host.example/esplora'), 'abc')).toBeUndefined();
  });

  it('isNetworkId', () => {
    expect(isNetworkId('signet')).toBe(true);
    expect(isNetworkId('mainnet')).toBe(false);
    expect(isNetworkId(3)).toBe(false);
  });
});

describe('normalizeEsploraUrl', () => {
  it('accetta http(s), toglie barre finali, query e frammenti', () => {
    expect(normalizeEsploraUrl(' https://mempool.space/signet/api/ ')).toBe('https://mempool.space/signet/api');
    expect(normalizeEsploraUrl('http://192.168.1.10:3002/api?x=1#y')).toBe('http://192.168.1.10:3002/api');
  });

  it('rifiuta altro', () => {
    expect(normalizeEsploraUrl('')).toBeNull();
    expect(normalizeEsploraUrl('ftp://host/api')).toBeNull();
    expect(normalizeEsploraUrl('mempool.space')).toBeNull();
    expect(normalizeEsploraUrl('https://user:pass@host/api')).toBeNull();
  });

  it('explorer dall\'URL dell\'API', () => {
    expect(explorerFromEsploraUrl('https://mempool.space/testnet4/api')).toBe('https://mempool.space/testnet4');
    expect(explorerFromEsploraUrl('https://host/esplora')).toBeUndefined();
  });
});

describe('identifyChain', () => {
  it('riconosce mainnet e le reti di test dal blocco genesi', () => {
    expect(identifyChain(GENESIS_HASHES.mainnet)).toBe('mainnet');
    expect(identifyChain(GENESIS_HASHES.signet)).toBe('signet');
    expect(identifyChain(GENESIS_HASHES.testnet4.toUpperCase())).toBe('testnet4');
    expect(identifyChain('00'.repeat(32))).toBe('unknown');
  });
});
