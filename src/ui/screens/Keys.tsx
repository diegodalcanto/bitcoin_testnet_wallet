import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { bytesToHex } from '@noble/hashes/utils.js';
import { explain, t, type ExplainTopic } from '../../i18n/it';
import { keys } from '../../state/wallet';
import { CopyButton, Message, RichMessage } from '../common';
import { Explainable, SectionTitle } from '../explain';
import { Icon } from '../icons';
import { QrCode } from '../QrCode';

/** Contenuto segreto sfocato finché non si tocca "Mostra". */
function Secret({ children, testId }: { children: ComponentChildren; testId?: string }): JSX.Element {
  const [shown, setShown] = useState(false);
  return (
    <div class="secret-box" data-testid={testId}>
      <div class={shown ? '' : 'blur'} aria-hidden={!shown}>
        {children}
      </div>
      {shown ? (
        <button type="button" class="btn btn-ghost" onClick={() => setShown(false)}>
          <Icon name="eyeOff" />
          {t.common.hide}
        </button>
      ) : (
        <div class="reveal">
          <button type="button" class="btn btn-primary" onClick={() => setShown(true)}>
            <Icon name="eye" />
            {t.keys.reveal}
          </button>
        </div>
      )}
    </div>
  );
}

function KeyField({ label, topic, value, secret = false, qr = false }: { label: string; topic: ExplainTopic; value: string; secret?: boolean; qr?: boolean }): JSX.Element {
  const body = (
    <>
      <div class="key-value">
        <span class="mono">{value}</span>
      </div>
      {qr && (
        <div style={{ marginTop: '12px' }}>
          <QrCode text={value} label={label} />
        </div>
      )}
      <div style={{ marginTop: '8px' }}>
        <CopyButton text={value} class="btn btn-sm btn-outline" />
      </div>
    </>
  );
  return (
    <div class="key-field">
      <Explainable topic={topic} label={label}>
        {secret ? <Secret>{body}</Secret> : body}
      </Explainable>
    </div>
  );
}

/** Schema frase → chiave privata → chiave pubblica → indirizzo, con frecce a senso unico. */
function Diagram({ fromPhrase }: { fromPhrase: boolean }): JSX.Element {
  const steps = fromPhrase ? t.keys.diagram : t.keys.diagramWif;
  return (
    <div class="diagram" aria-label={steps.join(' → ')}>
      {steps.map((step, i) => (
        <div key={step}>
          <div class={`diagram-step ${i < steps.length - 2 ? 'secret' : 'public'}`}>{step}</div>
          {i < steps.length - 1 && (
            <div class="diagram-arrow">
              <Icon name="oneWay" />
              {t.keys.oneWay}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Keys(): JSX.Element | null {
  const k = keys.value;
  if (!k) return null;
  const words = k.mnemonic?.split(' ') ?? [];
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.keys.title}</h1>
      <Message kind="warning" icon="lock">
        {t.keys.warning}
      </Message>

      <section class="card">
        <SectionTitle topic="keysDiagram">{explain.keysDiagram.title}</SectionTitle>
        <Diagram fromPhrase={k.kind === 'mnemonic'} />
      </section>

      <section class="card">
        <div class="key-field">
          <Explainable topic="recoveryPhrase" label={t.keys.phrase}>
            {k.mnemonic ? (
              <Secret testId="keys-phrase">
                <ol class="words" style={{ marginTop: '8px' }}>
                  {words.map((word, i) => (
                    <li key={i}>
                      <span class="n">{i + 1}</span>
                      {word}
                    </li>
                  ))}
                </ol>
              </Secret>
            ) : (
              <p class="muted">{t.keys.phraseNone}</p>
            )}
          </Explainable>
        </div>
        {k.path && (
          <div class="key-field">
            <Explainable topic="derivationPath" label={t.keys.path}>
              <p class="mono" style={{ marginTop: '6px' }}>
                {k.path}
              </p>
            </Explainable>
          </div>
        )}
        <KeyField label={t.keys.privateKey} topic="privateKey" value={k.wif} secret qr />
        <KeyField label={t.keys.publicKey} topic="publicKey" value={bytesToHex(k.publicKey)} />
        {k.vpub && <KeyField label={`${t.keys.xpub} (vpub)`} topic="xpub" value={k.vpub} />}
        {k.tpub && <KeyField label={`${t.keys.xpub} (tpub)`} topic="xpub" value={k.tpub} />}
        <KeyField label={t.keys.address} topic="address" value={k.address} />
      </section>

      <RichMessage kind="warning" text={t.home.mainnetWarning} />
      <section class="card">
        <SectionTitle topic="storage">{explain.storage.title}</SectionTitle>
      </section>
    </div>
  );
}
