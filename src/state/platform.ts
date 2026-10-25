import { signal } from '@preact/signals';

/** Riconoscimento della piattaforma per la guida all'installazione (spec §7). */
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const isIos =
  /iPad|iPhone|iPod/.test(ua) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

export const isMobile = isIos || isAndroid || /Mobi/i.test(ua);

/** Browser interni di altre app (WhatsApp, Instagram…): da lì non si installa. */
export const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram|TikTok|Snapchat|GSA\//i.test(ua);

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}

export const standalone = signal(isStandalone());
window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => (standalone.value = isStandalone()));
