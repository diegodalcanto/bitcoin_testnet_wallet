import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { CONFIG } from '../../config';
import { t } from '../../i18n/it';
import { confirmOptions, generateMnemonic, pickConfirmIndices, type StoredWallet } from '../../wallet';
import { RichMessage } from '../common';
import { ExplainBox } from '../explain';
import { Rich } from '../text';

type CreateStep = 'words' | 'confirm';

/**
 * Nuova frase: 12 parole da scrivere, poi conferma di 2 parole a caso (o "Salta").
 * Il wallet viene passato a `onCreated` solo alla fine: chi chiama decide quando salvarlo.
 */
export function CreateWallet({ onCancel, onCreated }: { onCancel: () => void; onCreated: (wallet: StoredWallet) => void }): JSX.Element {
  // 128 bit casuali → 12 parole (una sola volta per questa schermata).
  const mnemonic = useMemo(() => generateMnemonic(), []);
  const words = mnemonic.split(' ');
  const [step, setStep] = useState<CreateStep>('words');
  const indices = useMemo(() => pickConfirmIndices(words.length, CONFIG.WORDS_TO_CONFIRM), [mnemonic]);
  const [current, setCurrent] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const position = indices[current] ?? 0;
  const options = useMemo(() => confirmOptions(words[position] ?? ''), [position, mnemonic]);
  useEffect(() => window.scrollTo(0, 0), [step]);

  const finish = () => onCreated({ v: 1, kind: 'mnemonic', mnemonic, createdAt: Date.now() });

  if (step === 'words') {
    return (
      <div class="stack" style={{ gap: '16px' }}>
        <div>
          <h1 class="page-title">{t.create.wordsTitle}</h1>
          <p>
            <Rich text={t.create.introText} />
          </p>
          <p class="muted small">{t.create.wordsHint}</p>
        </div>
        <ol class="words" data-testid="mnemonic-words">
          {words.map((word, i) => (
            <li key={i}>
              <span class="n">{i + 1}</span>
              {word}
            </li>
          ))}
        </ol>
        <ExplainBox topic="recoveryPhrase" id="explain-phrase" />
        <RichMessage kind="warning" text={t.home.mainnetWarning} />
        <button type="button" class="btn btn-primary btn-lg btn-block" onClick={() => setStep('confirm')}>
          {t.create.written}
        </button>
        <div class="spread">
          <button type="button" class="btn btn-ghost" onClick={onCancel}>
            {t.common.back}
          </button>
          <button type="button" class="btn btn-ghost" onClick={finish}>
            {t.create.skip}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.create.confirmTitle}</h1>
      <p class="center" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
        {t.create.confirmQuestion(position + 1)}
      </p>
      <div class="choices">
        {options.map((option) => (
          <button
            type="button"
            key={`${position}-${option}`}
            class={`btn btn-outline${wrong === option ? ' wrong' : ''}`}
            onClick={() => {
              if (option !== words[position]) {
                setWrong(option);
                return;
              }
              setWrong(null);
              if (current + 1 < indices.length) setCurrent(current + 1);
              else finish();
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {wrong && <RichMessage kind="error" text={t.create.confirmWrong} />}
      <div class="spread">
        <button
          type="button"
          class="btn btn-ghost"
          onClick={() => {
            setStep('words');
            setCurrent(0);
            setWrong(null);
          }}
        >
          {t.create.confirmBack}
        </button>
        <button type="button" class="btn btn-ghost" onClick={finish}>
          {t.create.skip}
        </button>
      </div>
    </div>
  );
}
