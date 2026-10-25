import { describe, expect, it } from 'vitest';
import { GENESIS_HASHES } from './networks';
import { probeEsploraServer } from './probe';

function server(genesis: string, height = 1234): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/block-height/0')) return new Response(genesis);
    if (url.endsWith('/blocks/tip/hash')) return new Response('00ff');
    if (url.endsWith('/block/00ff')) return new Response(JSON.stringify({ id: '00ff', height, timestamp: 1 }));
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('probeEsploraServer', () => {
  it('accetta un server signet e riporta l\'altezza', async () => {
    await expect(probeEsploraServer('https://esplora.example/signet/api/', server(GENESIS_HASHES.signet, 99))).resolves.toEqual({
      ok: true,
      url: 'https://esplora.example/signet/api',
      chain: 'signet',
      height: 99,
    });
  });

  it('rifiuta un server di mainnet', async () => {
    await expect(probeEsploraServer('https://mempool.example/api', server(GENESIS_HASHES.mainnet))).resolves.toEqual({
      ok: false,
      reason: 'mainnet',
    });
  });

  it('URL non valido o server che non risponde', async () => {
    await expect(probeEsploraServer('non un url')).resolves.toEqual({ ok: false, reason: 'invalid' });
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(probeEsploraServer('https://down.example/api', down)).resolves.toEqual({ ok: false, reason: 'unreachable' });
  });
});
