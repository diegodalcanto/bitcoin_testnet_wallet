import { networks, type Network } from 'bitcoinjs-lib';

/**
 * Tutte le reti di test usano i parametri `testnet` di bitcoinjs-lib e indirizzi `tb1…`:
 * la stessa chiave funziona su ogni rete, cambia solo il saldo (spec §3).
 */
export const BITCOIN_NETWORK: Network = networks.testnet;

export type NetworkId = 'signet' | 'testnet4' | 'testnet3' | 'custom';
export type PresetNetworkId = Exclude<NetworkId, 'custom'>;

export interface NetworkInfo {
  id: NetworkId;
  /** Nome mostrato nel badge, es. "Signet". */
  name: string;
  /** Endpoint Esplora: il primo è il primario, gli altri sono di riserva. */
  endpoints: string[];
  /** Base dell'explorer per i link (`/tx/:txid`), se nota. */
  explorerUrl?: string;
  /** Colore del badge della rete. */
  color: string;
}

export const NETWORK_IDS: NetworkId[] = ['signet', 'testnet4', 'testnet3', 'custom'];
export const DEFAULT_NETWORK: PresetNetworkId = 'signet';

export const PRESET_NETWORKS: Record<PresetNetworkId, NetworkInfo> = {
  signet: {
    id: 'signet',
    name: 'Signet',
    endpoints: ['https://mempool.space/signet/api', 'https://blockstream.info/signet/api'],
    explorerUrl: 'https://mempool.space/signet',
    color: '#7c3aed',
  },
  testnet4: {
    id: 'testnet4',
    name: 'Testnet4',
    endpoints: ['https://mempool.space/testnet4/api', 'https://blockstream.info/testnet4/api'],
    explorerUrl: 'https://mempool.space/testnet4',
    color: '#0f766e',
  },
  testnet3: {
    id: 'testnet3',
    name: 'Testnet3',
    endpoints: ['https://mempool.space/testnet/api', 'https://blockstream.info/testnet/api'],
    explorerUrl: 'https://mempool.space/testnet',
    color: '#b91c1c',
  },
};

const CUSTOM_COLOR = '#475569';

/** Hash del blocco genesi di ogni catena, per riconoscere a quale rete punta un server. */
export const GENESIS_HASHES = {
  mainnet: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
  testnet3: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
  testnet4: '00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043',
  signet: '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6',
  regtest: '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206',
} as const;

export type ChainName = keyof typeof GENESIS_HASHES | 'unknown';

/** Riconosce la catena dal blocco genesi. Un signet personalizzato risulta "unknown". */
export function identifyChain(genesisHash: string): ChainName {
  const h = genesisHash.trim().toLowerCase();
  for (const [name, hash] of Object.entries(GENESIS_HASHES)) {
    if (hash === h) return name as ChainName;
  }
  return 'unknown';
}

/**
 * Normalizza l'URL di un server Esplora inserito a mano.
 * Restituisce null se non è un URL http(s) valido.
 */
export function normalizeEsploraUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

/** Per un URL tipo `https://host/signet/api` l'explorer è `https://host/signet`. */
export function explorerFromEsploraUrl(esploraUrl: string): string | undefined {
  const m = /^(https?:\/\/.+?)\/api$/i.exec(esploraUrl);
  return m ? m[1] : undefined;
}

export function getNetworkInfo(id: NetworkId, customUrl?: string | null): NetworkInfo {
  if (id !== 'custom') return PRESET_NETWORKS[id];
  const url = customUrl ? normalizeEsploraUrl(customUrl) : null;
  return {
    id: 'custom',
    name: 'Personalizzata',
    endpoints: url ? [url] : [],
    explorerUrl: url ? explorerFromEsploraUrl(url) : undefined,
    color: CUSTOM_COLOR,
  };
}

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === 'string' && (NETWORK_IDS as string[]).includes(value);
}

export function txExplorerUrl(net: NetworkInfo, txid: string): string | undefined {
  return net.explorerUrl ? `${net.explorerUrl}/tx/${txid}` : undefined;
}

export function addressExplorerUrl(net: NetworkInfo, address: string): string | undefined {
  return net.explorerUrl ? `${net.explorerUrl}/address/${address}` : undefined;
}
