import { describe, expect, it } from 'vitest';
import { EsploraClient, EsploraError } from './esplora';

const PRIMARY = 'https://primary.example/signet/api';
const BACKUP = 'https://backup.example/signet/api';

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function setup(handler: Handler, opts: { timeoutMs?: number; stickyMs?: number } = {}) {
  const calls: string[] = [];
  let clock = 0;
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return handler(String(input), init);
  }) as typeof fetch;
  const client = new EsploraClient({
    endpoints: [PRIMARY, BACKUP],
    fetch: fetchMock,
    timeoutMs: opts.timeoutMs ?? 1_000,
    stickyMs: opts.stickyMs ?? 60_000,
    now: () => clock,
  });
  return { client, calls, advance: (ms: number) => (clock += ms) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const text = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers });

const UTXOS = [{ txid: 'aa', vout: 0, value: 1000, status: { confirmed: false } }];

describe('EsploraClient', () => {
  it('legge gli UTXO dal primario', async () => {
    const { client, calls } = setup(() => json(UTXOS));
    await expect(client.getUtxos('tb1qxyz')).resolves.toEqual(UTXOS);
    expect(calls).toEqual([`GET ${PRIMARY}/address/tb1qxyz/utxo`]);
    expect(client.activeEndpoint).toBe(PRIMARY);
  });

  it('se il primario fallisce (502) passa alla riserva e ci resta per un po\'', async () => {
    const { client, calls, advance } = setup((url) => (url.startsWith(PRIMARY) ? text('Bad Gateway', 502) : json(UTXOS)));
    await expect(client.getUtxos('tb1q')).resolves.toEqual(UTXOS);
    expect(calls).toEqual([`GET ${PRIMARY}/address/tb1q/utxo`, `GET ${BACKUP}/address/tb1q/utxo`]);
    expect(client.activeEndpoint).toBe(BACKUP);

    calls.length = 0;
    await client.getUtxos('tb1q');
    expect(calls).toEqual([`GET ${BACKUP}/address/tb1q/utxo`]);

    advance(60_001);
    calls.length = 0;
    await client.getUtxos('tb1q');
    expect(calls[0]).toBe(`GET ${PRIMARY}/address/tb1q/utxo`);
  });

  it('errore di rete sul primario → riserva', async () => {
    const { client } = setup((url) => {
      if (url.startsWith(PRIMARY)) throw new TypeError('Failed to fetch');
      return json(UTXOS);
    });
    await expect(client.getUtxos('tb1q')).resolves.toEqual(UTXOS);
  });

  it('429 su tutti gli endpoint → errore "rate-limit" con il tempo di attesa suggerito', async () => {
    const { client, calls } = setup(() => text('Too Many Requests', 429, { 'Retry-After': '30' }));
    const err = await client.getUtxos('tb1q').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsploraError);
    expect((err as EsploraError).kind).toBe('rate-limit');
    expect((err as EsploraError).retryAfterMs).toBe(30_000);
    expect(calls).toHaveLength(2);
  });

  it('429 sul primario e riserva irraggiungibile → resta "rate-limit"', async () => {
    const { client } = setup((url) => {
      if (url.startsWith(PRIMARY)) return text('Too Many Requests', 429);
      throw new TypeError('Failed to fetch');
    });
    const err = (await client.getUtxos('tb1q').catch((e: unknown) => e)) as EsploraError;
    expect(err.kind).toBe('rate-limit');
  });

  it('un rifiuto del broadcast (400) non si ripete sulla riserva', async () => {
    const reason = 'sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met"}';
    const { client, calls } = setup(() => text(reason, 400));
    const err = (await client.broadcast('0200').catch((e: unknown) => e)) as EsploraError;
    expect(err.kind).toBe('http');
    expect(err.status).toBe(400);
    expect(err.body).toBe(reason);
    expect(err.retryable).toBe(false);
    expect(calls).toEqual([`POST ${PRIMARY}/tx`]);
  });

  it('broadcast: invia l\'hex e restituisce il txid', async () => {
    let body: unknown;
    const { client } = setup((_url, init) => {
      body = init?.body;
      return text('abcd1234\n');
    });
    await expect(client.broadcast('0200deadbeef')).resolves.toBe('abcd1234');
    expect(body).toBe('0200deadbeef');
  });

  it('timeout', async () => {
    const { client } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      { timeoutMs: 10 },
    );
    const err = (await client.getTipHash().catch((e: unknown) => e)) as EsploraError;
    expect(err.kind).toBe('timeout');
  });

  it('fee: /v1/fees/recommended di mempool.space', async () => {
    const { client } = setup((url) => (url.endsWith('/v1/fees/recommended') ? json({ fastestFee: 3, halfHourFee: 2 }) : text('', 404)));
    await expect(client.getFastestFee()).resolves.toBe(3);
  });

  it('fee: ripiego su /fee-estimates (Esplora standard)', async () => {
    const { client } = setup((url) => (url.endsWith('/fee-estimates') ? json({ '1': 1.5, '6': 1 }) : text('Not Found', 404)));
    await expect(client.getFastestFee()).resolves.toBe(1.5);
  });

  it('fee: null se nessun endpoint risponde', async () => {
    const { client } = setup(() => text('down', 503));
    await expect(client.getFastestFee()).resolves.toBeNull();
  });

  it('risposte di testo ripulite (hash, altezza)', async () => {
    const { client } = setup(() => text('  0000abc\n'));
    await expect(client.getTipHash()).resolves.toBe('0000abc');
  });

  it('senza endpoint configurati', async () => {
    const client = new EsploraClient({ endpoints: [] });
    const err = (await client.getUtxos('tb1q').catch((e: unknown) => e)) as EsploraError;
    expect(err.kind).toBe('no-endpoint');
  });
});
