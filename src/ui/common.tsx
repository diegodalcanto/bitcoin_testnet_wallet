import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BRAND } from '../brand';
import { formatBtc, formatSats } from '../format';
import { t } from '../i18n/it';
import { applyUpdate, updateAvailable } from '../state/pwa';
import { effectiveTheme } from '../state/settings';
import { dismissToast, showToast, toasts } from '../state/toasts';
import { networkInfo } from '../state/wallet';
import { Icon, type IconName } from './icons';
import { Rich } from './text';

const BASE = import.meta.env.BASE_URL;

/** Badge della rete, sempre visibile: realistico, ma mai scambiabile per bitcoin veri. */
export function NetworkBadge(): JSX.Element {
  const net = networkInfo.value;
  return (
    <span class="net-badge" style={{ background: net.color }} data-testid="network-badge">
      <span class="dot" aria-hidden="true" />
      {net.name} <span aria-hidden="true">–</span> <span class="fake">{t.app.fakeMoney}</span>
    </span>
  );
}

/** Loghi del Bitcoin Meetup Pisa e dell'Internet Festival (versione per tema chiaro o scuro). */
export function Logos({ size = 'large', variant = 'auto' }: { size?: 'large' | 'small'; variant?: 'auto' | 'light' }): JSX.Element {
  const dark = variant === 'auto' && effectiveTheme.value === 'dark';
  const festival = dark ? BRAND.festivalDark : BRAND.festival;
  return (
    <div class={`logos logos-${size}`}>
      <img class="meetup" src={`${BASE}${BRAND.meetup.file}`} alt={BRAND.meetup.alt} width={BRAND.meetup.width} height={BRAND.meetup.height} />
      <img class="festival" src={`${BASE}${festival.file}`} alt={festival.alt} width={festival.width} height={festival.height} />
    </div>
  );
}

export function Sats({ value, signed = false }: { value: number; signed?: boolean }): JSX.Element {
  const text = signed && value > 0 ? `+${formatSats(value)}` : formatSats(value);
  return (
    <span class="sats">
      {text} {t.common.sats}
    </span>
  );
}

export function Btc({ value }: { value: number }): JSX.Element {
  return (
    <span class="btc">
      {formatBtc(value)} {t.common.tbtc}
    </span>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // vecchio metodo, per browser che non permettono l'API degli appunti
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function CopyButton({ text, label = t.common.copy, class: className = 'btn btn-outline' }: { text: string; label?: string; class?: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      class={className}
      onClick={async () => {
        const ok = await copyText(text);
        if (!ok) {
          showToast(t.common.copyFailed, 'error');
          return;
        }
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1_800);
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} />
      <span aria-live="polite">{copied ? t.common.copied : label}</span>
    </button>
  );
}

export function Message({ kind, icon, children }: { kind: 'error' | 'warning' | 'success' | 'info'; icon?: IconName; children: ComponentChildren }): JSX.Element {
  const fallback: IconName = kind === 'success' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return (
    <div class={`message ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={icon ?? fallback} />
      <div>{children}</div>
    </div>
  );
}

export function RichMessage({ kind, text }: { kind: 'error' | 'warning' | 'success' | 'info'; text: string }): JSX.Element {
  return (
    <Message kind={kind}>
      <Rich text={text} />
    </Message>
  );
}

/** Finestra di conferma (usata per le azioni che cancellano il wallet). */
export function Dialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  children: ComponentChildren;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div class="overlay dialog-wrap" onClick={onCancel}>
      <div class="dialog stack" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="dialog-title">{title}</h2>
        <div>{children}</div>
        <div class="btn-row">
          <button type="button" class="btn" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="button" ref={confirmRef} class={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts(): JSX.Element {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((toast) => (
        <button type="button" key={toast.id} class={`toast ${toast.kind}`} onClick={() => dismissToast(toast.id)}>
          <Icon name={toast.kind === 'success' ? 'arrowDown' : toast.kind === 'error' ? 'alert' : 'info'} />
          <span>{toast.text}</span>
        </button>
      ))}
    </div>
  );
}

/** "Nuova versione disponibile": l'aggiornamento parte solo se l'utente lo chiede. */
export function UpdateBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (!updateAvailable.value || dismissed) return null;
  return (
    <div class="banner" role="status">
      <Icon name="download" />
      <span class="grow">{t.pwa.updateAvailable}</span>
      <button type="button" class="btn btn-sm btn-primary" onClick={applyUpdate}>
        {t.pwa.updateNow}
      </button>
      <button type="button" class="icon-btn" style={{ color: '#fff' }} aria-label={t.pwa.later} onClick={() => setDismissed(true)}>
        <Icon name="close" />
      </button>
    </div>
  );
}
