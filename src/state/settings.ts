import { computed, effect, signal } from '@preact/signals';
import { DEFAULT_NETWORK, isNetworkId, type NetworkId } from '../networks';
import { KEYS, readJson, store, writeJson } from '../storage';

export type ThemeSetting = 'auto' | 'light' | 'dark';

export interface Settings {
  network: NetworkId;
  customUrl: string;
  /** Box "i" già aperti (modalità didattica). */
  showExplanations: boolean;
  theme: ThemeSetting;
  hideBalance: boolean;
}

const DEFAULTS: Settings = {
  network: DEFAULT_NETWORK,
  customUrl: '',
  showExplanations: true,
  theme: 'auto',
  hideBalance: false,
};

function loadSettings(): Settings {
  const raw = readJson<Partial<Settings>>(store, KEYS.settings) ?? {};
  return {
    network: isNetworkId(raw.network) ? raw.network : DEFAULTS.network,
    customUrl: typeof raw.customUrl === 'string' ? raw.customUrl : DEFAULTS.customUrl,
    showExplanations: typeof raw.showExplanations === 'boolean' ? raw.showExplanations : DEFAULTS.showExplanations,
    theme: raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'auto' ? raw.theme : DEFAULTS.theme,
    hideBalance: typeof raw.hideBalance === 'boolean' ? raw.hideBalance : DEFAULTS.hideBalance,
  };
}

/** Impostazioni salvate in localStorage. */
export const settings = signal<Settings>(loadSettings());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  writeJson(store, KEYS.settings, settings.value);
}

// ---------------------------------------------------------------------------
// Tema chiaro/scuro
// ---------------------------------------------------------------------------

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const systemDark = signal(darkQuery?.matches ?? false);
darkQuery?.addEventListener?.('change', (e) => (systemDark.value = e.matches));

/** Tema effettivo, tenendo conto della preferenza del telefono se "Automatico". */
export const effectiveTheme = computed<'light' | 'dark'>(() => {
  const theme = settings.value.theme;
  if (theme === 'auto') return systemDark.value ? 'dark' : 'light';
  return theme;
});

/** Applica il tema alla pagina (attributo data-theme e colore della barra di sistema). */
export function initTheme(): void {
  effect(() => {
    const root = document.documentElement;
    const theme = settings.value.theme;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    meta?.setAttribute('content', effectiveTheme.value === 'dark' ? '#0a1230' : '#f7931a');
  });
}
