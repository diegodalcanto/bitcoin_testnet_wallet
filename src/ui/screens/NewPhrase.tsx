import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatSats } from '../../format';
import { t } from '../../i18n/it';
import { goBack, navigate, paths } from '../../state/router';
import { showToast } from '../../state/toasts';
import { balance, installWallet, walletTotal } from '../../state/wallet';
import { Dialog, Message, RichMessage } from '../common';
import { Icon } from '../icons';
import { Rich } from '../text';
import { CreateWallet } from './CreateWallet';

type Phase = 'intro' | 'confirm' | 'create';

/**
 * Ricominciare da zero con 12 parole nuove (doppia conferma: pulsante + "Sei proprio sicuro?").
 * Per un altro indirizzo basta "I miei wallet"; questo cancella la frase e tutti i suoi wallet,
 * ma solo alla fine: con "Indietro" non si perde niente.
 */
export function NewPhrase(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  useEffect(() => window.scrollTo(0, 0), [phase === 'create']);
  const remaining = balance.value.total;
  const others = walletTotal.value - 1;

  if (phase === 'create') {
    return (
      <CreateWallet
        onCancel={() => setPhase('intro')}
        onCreated={(wallet) => {
          navigate(paths.home, { replace: true });
          installWallet(wallet);
          showToast(t.newPhrase.done, 'success');
        }}
      />
    );
  }

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.newPhrase.title}</h1>
      <RichMessage kind="info" text={t.newPhrase.wantAnother} />
      <a class="btn btn-primary btn-block" href={paths.wallets}>
        <Icon name="wallet" />
        {t.wallets.title}
      </a>
      <Message kind="error" icon="alert">
        <Rich text={t.newPhrase.text} />
        {remaining > 0 && (
          <>
            <br />
            <strong data-testid="new-phrase-balance">{t.newPhrase.balanceWarning(formatSats(remaining))}</strong>
          </>
        )}
        {others > 0 && (
          <>
            <br />
            <strong>{t.newPhrase.otherWallets(others)}</strong>
          </>
        )}
      </Message>
      <p class="small muted">{t.newPhrase.saveFirst}</p>
      <button type="button" class="btn btn-outline btn-block" onClick={() => navigate(paths.keys)}>
        <Icon name="key" />
        {t.settings.keys}
      </button>
      <button type="button" class="btn btn-danger btn-lg btn-block" onClick={() => setPhase('confirm')}>
        {t.newPhrase.button}
      </button>
      <button type="button" class="btn btn-ghost" onClick={() => goBack(paths.settings)}>
        {t.common.cancel}
      </button>
      {phase === 'confirm' && (
        <Dialog
          title={t.newPhrase.confirmTitle}
          confirmLabel={t.newPhrase.confirmButton}
          danger
          onCancel={() => setPhase('intro')}
          onConfirm={() => setPhase('create')}
        >
          <p>{t.newPhrase.confirmText}</p>
        </Dialog>
      )}
    </div>
  );
}
