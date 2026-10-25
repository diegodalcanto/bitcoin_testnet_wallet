import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n/it';
import { navigate, paths } from '../../state/router';
import { showToast } from '../../state/toasts';
import { installWallet, storedWallet } from '../../state/wallet';
import { parseImport, type ImportError, type StoredWallet } from '../../wallet';
import { Dialog, RichMessage } from '../common';
import { Rich } from '../text';

function importErrorText(error: ImportError): string {
  switch (error.code) {
    case 'empty':
      return t.errors.import.empty;
    case 'mainnet-key':
      return t.errors.import.mainnetKey;
    case 'extended-key':
      return t.errors.import.extendedKey;
    case 'uncompressed-wif':
      return t.errors.import.uncompressedWif;
    case 'word-count':
      return t.errors.import.wordCount(error.count);
    case 'unknown-words':
      return t.errors.import.unknownWords(error.words.join(', '));
    case 'checksum':
      return t.errors.import.checksum;
    case 'invalid':
      return t.errors.import.invalid;
  }
}

/** Ripristino da 12 parole o da WIF di rete test, con conferma prima di sovrascrivere. */
export function RestoreForm({ onCancel }: { onCancel?: () => void }): JSX.Element {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toConfirm, setToConfirm] = useState<StoredWallet | null>(null);

  const apply = (wallet: StoredWallet) => {
    installWallet(wallet);
    showToast(t.restore.success, 'success');
    navigate(paths.home, { replace: true });
  };

  return (
    <form
      class="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const result = parseImport(text);
        if (!result.ok) {
          setError(importErrorText(result.error));
          return;
        }
        setError(null);
        if (storedWallet.value) setToConfirm(result.wallet);
        else apply(result.wallet);
      }}
    >
      <p>
        <Rich text={t.restore.text} />
      </p>
      <textarea
        class="textarea mono"
        value={text}
        placeholder={t.restore.placeholder}
        autocomplete="off"
        autocapitalize="none"
        spellcheck={false}
        aria-label={t.restore.title}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      {error && <RichMessage kind="error" text={error} />}
      <button type="submit" class="btn btn-primary btn-lg btn-block">
        {t.restore.button}
      </button>
      {onCancel && (
        <button type="button" class="btn btn-ghost" onClick={onCancel}>
          {t.common.back}
        </button>
      )}
      {toConfirm && (
        <Dialog
          title={t.restore.overwriteTitle}
          confirmLabel={t.restore.overwriteConfirm}
          danger
          onCancel={() => setToConfirm(null)}
          onConfirm={() => apply(toConfirm)}
        >
          <p>{t.restore.overwriteText}</p>
        </Dialog>
      )}
    </form>
  );
}

export function RestoreScreen(): JSX.Element {
  return (
    <div class="stack">
      <h1 class="page-title">{t.restore.title}</h1>
      <RestoreForm />
    </div>
  );
}
