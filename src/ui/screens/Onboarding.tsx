import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { CONFIG } from '../../config';
import { t } from '../../i18n/it';
import { isAndroid, isInAppBrowser, isIos, isMobile, standalone } from '../../state/platform';
import { installPrompt, promptInstall } from '../../state/pwa';
import { showToast } from '../../state/toasts';
import { installWallet } from '../../state/wallet';
import { KEYS, store } from '../../storage';
import { confirmOptions, generateMnemonic, pickConfirmIndices } from '../../wallet';
import { Logos, RichMessage } from '../common';
import { ExplainBox, InlineExplain } from '../explain';
import { Icon } from '../icons';
import { Rich } from '../text';
import { RestoreForm } from './Restore';

type Step = 'welcome' | 'install' | 'create' | 'restore';

/** Va mostrata la guida all'installazione prima di creare il wallet? */
function needsInstallGuide(): boolean {
  if (standalone.value) return false;
  if (store.get(KEYS.installSeen) === '1') return false;
  return isMobile;
}

export function Onboarding(): JSX.Element {
  const [step, setStep] = useState<Step>(needsInstallGuide() ? 'install' : 'welcome');
  useEffect(() => window.scrollTo(0, 0), [step]);

  if (step === 'install') {
    return (
      <InstallGuide
        onContinue={() => {
          store.set(KEYS.installSeen, '1');
          setStep('welcome');
        }}
      />
    );
  }
  if (step === 'create') return <CreateWallet onCancel={() => setStep('welcome')} />;
  if (step === 'restore') {
    return (
      <div class="stack">
        <h1 class="page-title">{t.restore.title}</h1>
        <RestoreForm onCancel={() => setStep('welcome')} />
      </div>
    );
  }
  return <Welcome onCreate={() => setStep('create')} onRestore={() => setStep('restore')} />;
}

function Welcome({ onCreate, onRestore }: { onCreate: () => void; onRestore: () => void }): JSX.Element {
  return (
    <div class="stack" style={{ gap: '18px' }}>
      <div class="cover">
        <h1>
          <Rich text={t.app.cover} />
        </h1>
        <div class="logo-bubble">
          <Logos size="large" variant="light" />
        </div>
      </div>
      <div class="hero">
        <div class="lab">{t.app.lab}</div>
        <h1>{t.welcome.title}</h1>
        <p>
          <Rich text={t.welcome.text} />
        </p>
      </div>
      <InlineExplain topic="network">
        <span class="muted small">{t.welcome.noAccount}</span>
      </InlineExplain>
      <button type="button" class="btn btn-primary btn-lg btn-block" onClick={onCreate}>
        {t.welcome.create}
      </button>
      <button type="button" class="btn btn-outline btn-block" onClick={onRestore}>
        {t.welcome.restore}
      </button>
    </div>
  );
}

function InstallGuide({ onContinue }: { onContinue: () => void }): JSX.Element {
  const prompt = installPrompt.value;
  return (
    <div class="stack" style={{ gap: '18px' }}>
      <Logos size="small" />
      <div>
        <h1 class="page-title">{t.install.title}</h1>
        <p>{t.install.intro}</p>
      </div>
      {isIos && isInAppBrowser && <RichMessage kind="warning" text={t.install.iosInApp} />}
      <div class="card">
        <ol class="steps">
          {(isIos ? t.install.iosSteps : isAndroid ? t.install.androidSteps : []).map((text, i) => (
            <li key={i}>
              <div>
                <Rich text={text} />
                {isIos && i === 0 && (
                  <div class="step-illustration">
                    <Icon name="share" /> {t.install.shareButton}
                  </div>
                )}
                {isIos && i === 1 && (
                  <div class="step-illustration">
                    <Icon name="plusSquare" /> {t.install.addToHome}
                  </div>
                )}
                {isAndroid && i === 0 && (
                  <div class="step-illustration">
                    <Icon name="dots" /> {t.install.menu}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!isIos && !isAndroid && <p>{t.install.desktop}</p>}
      </div>
      {prompt && (
        <button type="button" class="btn btn-primary btn-lg btn-block" onClick={() => void promptInstall()}>
          <Icon name="download" />
          {t.install.installButton}
        </button>
      )}
      {isIos && <RichMessage kind="info" text={t.install.iosWhy} />}
      <button type="button" class="btn btn-ghost" onClick={onContinue}>
        {isIos ? t.install.continueBrowserIos : t.install.continueBrowser}
      </button>
      {isIos && <p class="muted small center">{t.install.continueWarningIos}</p>}
    </div>
  );
}

type CreateStep = 'words' | 'confirm';

function CreateWallet({ onCancel }: { onCancel: () => void }): JSX.Element {
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

  const finish = () => {
    installWallet({ v: 1, kind: 'mnemonic', mnemonic, createdAt: Date.now() });
    showToast(`${t.create.doneTitle} ${t.create.doneText}`, 'success');
  };

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
