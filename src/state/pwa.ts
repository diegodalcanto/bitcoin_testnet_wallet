import { signal } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';

/** C'è una nuova versione pronta: si aggiorna solo quando l'utente lo chiede (mai a metà laboratorio). */
export const updateAvailable = signal(false);

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Evento Android/Chrome per mostrare il nostro pulsante "Installa app". */
export const installPrompt = signal<BeforeInstallPromptEvent | null>(null);

let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null;

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt.value = event as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => (installPrompt.value = null));

  if (!('serviceWorker' in navigator)) return;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable.value = true;
    },
    onRegisteredSW(_url, registration) {
      // Controlla aggiornamenti ogni ora (solo con l'app aperta).
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}

export function applyUpdate(): void {
  void updateServiceWorker?.(true);
}

export async function promptInstall(): Promise<void> {
  const event = installPrompt.value;
  if (!event) return;
  await event.prompt();
  await event.userChoice.catch(() => undefined);
  installPrompt.value = null;
}
