import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

/**
 * GitHub Pages pubblica il sito in /<nome-repo>/. Con un dominio personalizzato
 * si può compilare con BASE_PATH=/ npm run build.
 */
const base = process.env.BASE_PATH ?? '/bitcoin_testnet_wallet/';

const THEME_COLOR = '#f7931a';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(gitSha()),
  },
  build: {
    // iPhone con iOS 15 e Android recenti: BigInt è necessario (bitcoinjs-lib 7).
    target: ['es2020', 'safari15', 'chrome100', 'firefox100', 'edge100'],
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      // Mai aggiornare in silenzio a metà laboratorio: l'app mostra "Nuova versione disponibile".
      registerType: 'prompt',
      injectRegister: false,
      // Icone e favicon sono già comprese nei globPatterns qui sotto.
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'Testnet Wallet – Laboratorio Bitcoin',
        short_name: 'Testnet Wallet',
        description: 'Wallet Bitcoin solo per reti di test, per i laboratori didattici del Bitcoin Meetup Pisa e dell’Internet Festival.',
        lang: 'it',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: '#0b1430',
        categories: ['education', 'finance'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache di tutti i file dell'app per l'apertura offline; le chiamate API non vanno in cache.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Il PNG originale del Meetup (310 KB) non è usato: l'app mostra la versione WebP.
        globIgnores: ['**/brand/meetup-pisa.png', '**/brand/README.md'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
