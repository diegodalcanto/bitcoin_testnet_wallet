import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatSats } from '../../format';
import { t } from '../../i18n/it';
import { goBack, navigate, paths } from '../../state/router';
import { showToast } from '../../state/toasts';
import { balance, installWallet } from '../../state/wallet';
import { Dialog, Message } from '../common';
import { Icon } from '../icons';
import { CreateWallet } from './CreateWallet';

type Phase = 'intro' | 'confirm' | 'create';

/**
 * Nuovo wallet con doppia conferma (pulsante + "Sei proprio sicuro?"), poi subito le 12 parole nuove.
 * Il wallet attuale viene sostituito solo alla fine: con "Indietro" non si perde niente.
 */
export function NewWallet(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  useEffect(() => window.scrollTo(0, 0), [phase === 'create']);
  const remaining = balance.value.total;

  if (phase === 'create') {
    return (
      <CreateWallet
        onCancel={() => setPhase('intro')}
        onCreated={(wallet) => {
          navigate(paths.home, { replace: true });
          installWallet(wallet);
          showToast(t.newWallet.done, 'success');
        }}
      />
    );
  }

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.newWallet.title}</h1>
      <Message kind="error" icon="alert">
        {t.newWallet.text}
        {remaining > 0 && (
          <>
            <br />
            <strong data-testid="new-wallet-balance">{t.newWallet.balanceWarning(formatSats(remaining))}</strong>
          </>
        )}
      </Message>
      <p class="small muted">{t.newWallet.saveFirst}</p>
      <button type="button" class="btn btn-outline btn-block" onClick={() => navigate(paths.keys)}>
        <Icon name="key" />
        {t.settings.keys}
      </button>
      <button type="button" class="btn btn-danger btn-lg btn-block" onClick={() => setPhase('confirm')}>
        {t.newWallet.button}
      </button>
      <button type="button" class="btn btn-ghost" onClick={() => goBack(paths.settings)}>
        {t.common.cancel}
      </button>
      {phase === 'confirm' && (
        <Dialog
          title={t.newWallet.confirmTitle}
          confirmLabel={t.newWallet.confirmButton}
          danger
          onCancel={() => setPhase('intro')}
          onConfirm={() => setPhase('create')}
        >
          <p>{t.newWallet.confirmText}</p>
        </Dialog>
      )}
    </div>
  );
}
