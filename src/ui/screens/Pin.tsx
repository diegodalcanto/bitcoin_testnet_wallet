import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { CONFIG } from '../../config';
import { t } from '../../i18n/it';
import { locked, pinEnabled, removePin, setPin, unlock, verifyPin } from '../../state/pin';
import { goBack } from '../../state/router';
import { showToast } from '../../state/toasts';
import { deleteWallet } from '../../state/wallet';
import { Dialog } from '../common';
import { ExplainBox } from '../explain';
import { Icon } from '../icons';

/** Tastierino numerico per il PIN di 4 cifre. */
function Keypad({ title, error, onComplete, footer }: { title: string; error?: string | null; onComplete: (pin: string) => boolean; footer?: JSX.Element }): JSX.Element {
  const [digits, setDigits] = useState('');
  const [shake, setShake] = useState(false);

  const press = (d: string) => {
    if (digits.length >= CONFIG.PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === CONFIG.PIN_LENGTH) {
      setTimeout(() => {
        const ok = onComplete(next);
        setDigits('');
        if (!ok) {
          setShake(true);
          setTimeout(() => setShake(false), 400);
        }
      }, 120);
    }
  };

  return (
    <div class="pin-screen">
      <div class="stack" style={{ alignItems: 'center' }}>
        <Icon name="lock" class="chev" />
        <h1>{title}</h1>
        <p class="small" style={{ color: 'var(--danger)', minHeight: '1.4em' }} role="alert">
          {error ?? ''}
        </p>
      </div>
      <div class={`pin-dots${shake ? ' shake' : ''}`} aria-label={`${digits.length} / ${CONFIG.PIN_LENGTH}`}>
        {Array.from({ length: CONFIG.PIN_LENGTH }, (_, i) => (
          <span key={i} class={i < digits.length ? 'filled' : ''} />
        ))}
      </div>
      <div class="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button type="button" key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="button" class="plain" aria-label={t.pin.delete} onClick={() => setDigits(digits.slice(0, -1))}>
          <Icon name="backspace" />
        </button>
      </div>
      {footer}
    </div>
  );
}

/** Schermata di blocco all'apertura dell'app. */
export function LockScreen(): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  return (
    <>
      <Keypad
        title={t.pin.enter}
        error={error}
        onComplete={(pin) => {
          const ok = unlock(pin);
          setError(ok ? null : t.pin.wrong);
          return ok;
        }}
        footer={
          <button type="button" class="btn btn-ghost" onClick={() => setForgot(true)}>
            {t.pin.forgot}
          </button>
        }
      />
      {forgot && (
        <Dialog
          title={t.pin.forgotTitle}
          confirmLabel={t.pin.forgotConfirm}
          danger
          onCancel={() => setForgot(false)}
          onConfirm={() => {
            removePin();
            deleteWallet();
            locked.value = false;
          }}
        >
          <p>{t.pin.forgotText}</p>
        </Dialog>
      )}
    </>
  );
}

/** Impostazione, cambio o rimozione del PIN (dalle Impostazioni). */
export function PinSetupScreen({ remove = false }: { remove?: boolean }): JSX.Element {
  const [phase, setPhase] = useState<'current' | 'choose' | 'repeat'>(pinEnabled.value ? 'current' : 'choose');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);

  const titles = { current: t.pin.current, choose: t.pin.choose, repeat: t.pin.repeat };

  return (
    <>
      <Keypad
        key={phase}
        title={remove ? t.settings.pinRemove : titles[phase]}
        error={error}
        onComplete={(pin) => {
          if (phase === 'current') {
            if (!verifyPin(pin)) {
              setError(t.pin.wrong);
              return false;
            }
            setError(null);
            if (remove) {
              removePin();
              showToast(t.settings.pinRemoved, 'success');
              goBack();
            } else {
              setPhase('choose');
            }
            return true;
          }
          if (phase === 'choose') {
            setFirst(pin);
            setError(null);
            setPhase('repeat');
            return true;
          }
          if (pin !== first) {
            setError(t.pin.mismatch);
            setPhase('choose');
            return false;
          }
          setPin(pin);
          showToast(t.settings.pinSaved, 'success');
          goBack();
          return true;
        }}
      />
      <ExplainBox topic="pin" id="explain-pin" />
    </>
  );
}
