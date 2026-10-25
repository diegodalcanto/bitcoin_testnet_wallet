import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n/it';
import { goBack, navigate, paths } from '../../state/router';
import { deleteWallet } from '../../state/wallet';
import { Dialog, Message } from '../common';
import { Icon } from '../icons';

/**
 * Nuovo wallet con doppia conferma: pulsante + finestra "Sei proprio sicuro?".
 * Poi si torna al benvenuto, dove si creano (e si mostrano) le nuove 12 parole.
 */
export function NewWallet(): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.newWallet.title}</h1>
      <Message kind="error" icon="alert">
        {t.newWallet.text}
      </Message>
      <button type="button" class="btn btn-outline btn-block" onClick={() => navigate(paths.keys)}>
        <Icon name="key" />
        {t.settings.keys}
      </button>
      <button type="button" class="btn btn-danger btn-lg btn-block" onClick={() => setConfirming(true)}>
        {t.newWallet.button}
      </button>
      <button type="button" class="btn btn-ghost" onClick={() => goBack(paths.settings)}>
        {t.common.cancel}
      </button>
      {confirming && (
        <Dialog
          title={t.newWallet.confirmTitle}
          confirmLabel={t.newWallet.confirmButton}
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            navigate(paths.home, { replace: true });
            deleteWallet();
          }}
        >
          <p>{t.newWallet.confirmText}</p>
        </Dialog>
      )}
    </div>
  );
}
