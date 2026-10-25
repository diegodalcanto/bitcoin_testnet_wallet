import { signal } from '@preact/signals';

/** Router minimale basato sull'hash: funziona su GitHub Pages senza configurazioni. */
export type Route =
  | { name: 'home' }
  | { name: 'receive' }
  | { name: 'send' }
  | { name: 'tx'; txid: string }
  | { name: 'keys' }
  | { name: 'coins' }
  | { name: 'learn'; card: number }
  | { name: 'settings' }
  | { name: 'info' }
  | { name: 'restore' }
  | { name: 'new-wallet' }
  | { name: 'pin'; remove: boolean };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('/');
  switch (path[0]) {
    case 'ricevi':
      return { name: 'receive' };
    case 'invia':
      return { name: 'send' };
    case 'tx':
      return /^[0-9a-f]{64}$/i.test(path[1] ?? '') ? { name: 'tx', txid: (path[1] as string).toLowerCase() } : { name: 'home' };
    case 'chiavi':
      return { name: 'keys' };
    case 'monete':
      return { name: 'coins' };
    case 'impara':
      return { name: 'learn', card: Math.max(0, Number.parseInt(path[1] ?? '0', 10) || 0) };
    case 'impostazioni':
      return { name: 'settings' };
    case 'info':
      return { name: 'info' };
    case 'ripristina':
      return { name: 'restore' };
    case 'nuovo-wallet':
      return { name: 'new-wallet' };
    case 'pin':
      return { name: 'pin', remove: path[1] === 'rimuovi' };
    default:
      return { name: 'home' };
  }
}

export const paths = {
  home: '#/',
  receive: '#/ricevi',
  send: '#/invia',
  tx: (txid: string) => `#/tx/${txid}`,
  keys: '#/chiavi',
  coins: '#/monete',
  learn: (card = 0) => (card > 0 ? `#/impara/${card}` : '#/impara'),
  settings: '#/impostazioni',
  info: '#/info',
  restore: '#/ripristina',
  newWallet: '#/nuovo-wallet',
  pin: '#/pin',
  pinRemove: '#/pin/rimuovi',
} as const;

export const route = signal<Route>(parseRoute(location.hash));

/** Quante navigazioni interne abbiamo fatto: "Indietro" non deve uscire dall'app. */
let depth = 0;

window.addEventListener('hashchange', () => {
  route.value = parseRoute(location.hash);
  window.scrollTo(0, 0);
});

export function navigate(hash: string, opts: { replace?: boolean } = {}): void {
  if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) {
    route.value = parseRoute(hash);
    return;
  }
  if (opts.replace) {
    history.replaceState(null, '', hash);
    route.value = parseRoute(hash);
    window.scrollTo(0, 0);
  } else {
    depth++;
    location.hash = hash;
  }
}

export function goBack(fallback: string = paths.home): void {
  if (depth > 0) {
    depth--;
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}
