import { EsploraClient } from './esplora';
import { identifyChain, normalizeEsploraUrl, type ChainName } from './networks';

export type ProbeResult =
  | { ok: true; url: string; chain: ChainName; height: number }
  | { ok: false; reason: 'invalid' | 'mainnet' | 'unreachable' };

/**
 * Prova un server Esplora inserito a mano: deve rispondere e NON essere di mainnet
 * (si riconosce dal blocco genesi).
 */
export async function probeEsploraServer(input: string, fetchImpl?: typeof fetch): Promise<ProbeResult> {
  const url = normalizeEsploraUrl(input);
  if (!url) return { ok: false, reason: 'invalid' };
  const client = new EsploraClient({ endpoints: [url], timeoutMs: 8_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  try {
    const chain = identifyChain(await client.getBlockHash(0));
    if (chain === 'mainnet') return { ok: false, reason: 'mainnet' };
    const tip = await client.getBlock(await client.getTipHash());
    return { ok: true, url, chain, height: tip.height };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
