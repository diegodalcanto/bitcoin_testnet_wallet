/** Vettori noti usati nei test. */

/** Frase di prova standard (entropia tutta a zero): MAI usarla per fondi veri. */
export const ABANDON_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** BIP84 su rete test (m/84'/1'/0'/0/0) per ABANDON_MNEMONIC. */
export const ABANDON_ADDRESS = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';
export const ABANDON_TPUB =
  'tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M';
export const ABANDON_VPUB =
  'vpub5Y6cjg78GGuNLsaPhmYsiw4gYX3HoQiRBiSwDaBXKUafCt9bNwWQiitDk5VZ5BVxYnQdwoTyXSs2JHRPAgjAvtbBrf8ZhDYe2jWAqvZVnsc';
export const ABANDON_TPRV =
  'tprv8fSjiqEQ8YG7Ro7gw2ScwcvweYuuWi1ZzGUtrPz918HvDtBzL5s2voFTrN4y3yUwj5cYD54pLhxk6NKCzHUjcka3zbKjbTEcsuAnkzbjhkL';
export const ABANDON_XPRV =
  'xprv9ybY78BftS5UGANki6oSifuQEjkpyAC8ZmBvBNTshQnCBcxnefjHS7buPMkkqhcRzmoGZ5bokx7GuyDAiktd5HemohAU4wV1ZPMDRmLpBMm';

/** Chiave privata = 1: WIF di rete test e indirizzo P2WPKH del vettore BIP173. */
export const KEY_ONE_WIF_TESTNET = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
export const KEY_ONE_WIF_TESTNET_UNCOMPRESSED = '91avARGdfge8E4tZfYLoxeJ5sGBdNJQH4kvjJoQFacbgwmaKkrx';
export const KEY_ONE_WIF_MAINNET = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
export const KEY_ONE_WIF_MAINNET_UNCOMPRESSED = '5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf';
export const KEY_ONE_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

/** Indirizzi di rete test di vari tipi. */
export const TESTNET_ADDRESSES = {
  p2wpkh: KEY_ONE_ADDRESS,
  p2wsh: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
  p2tr: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
  p2pkh: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r',
  p2sh: '2NAUYAHhujozruyzpsFRP63mbrdaU5wnEpN',
};

/** Indirizzi di mainnet: vanno sempre rifiutati. */
export const MAINNET_ADDRESSES = {
  p2wpkh: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  p2tr: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  p2pkh: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  p2sh: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
};

export const REGTEST_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

/** txid fittizi ma ben formati. */
export function fakeTxid(n: number): string {
  return n.toString(16).padStart(64, '0');
}
