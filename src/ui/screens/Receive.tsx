import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { paymentUri } from '../../address';
import { formatSats, groupChars } from '../../format';
import { explain, t } from '../../i18n/it';
import { lastIncoming } from '../../state/sync';
import { keys } from '../../state/wallet';
import { CopyButton, Message } from '../common';
import { Explainable, InlineExplain } from '../explain';
import { Icon } from '../icons';
import { QrCode } from '../QrCode';

export function Receive(): JSX.Element | null {
  const k = keys.value;
  const [openedAt] = useState(Date.now());
  if (!k) return null;
  const incoming = lastIncoming.value;
  const canShare = typeof navigator.share === 'function';
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.receive.title}</h1>
      {incoming && incoming.at >= openedAt && (
        <div class="arrival" key={incoming.at}>
          <Message kind="success" icon="arrowDown">
            <strong>{t.receive.arrived(formatSats(incoming.amount))}</strong>
            <br />
            {t.receive.arrivedSub}
          </Message>
        </div>
      )}
      <p class="muted center">{t.receive.instructions}</p>
      <QrCode text={paymentUri(k.address)} label={t.receive.qrLabel(k.address)} />
      <div class="center-row">
        <InlineExplain topic="qr">
          <span class="muted small">{explain.qr.title}</span>
        </InlineExplain>
      </div>
      <section class="card">
        <Explainable topic="address" label={t.receive.addressLabel}>
          <p class="address-text" data-testid="receive-address" style={{ marginTop: '8px' }}>
            {groupChars(k.address)}
          </p>
        </Explainable>
        <div class={canShare ? 'btn-row' : ''} style={{ marginTop: '12px' }}>
          <CopyButton text={k.address} class="btn btn-outline btn-block" />
          {canShare && (
            <button
              type="button"
              class="btn btn-outline btn-block"
              onClick={() => {
                navigator.share({ title: t.receive.shareTitle, text: k.address }).catch(() => undefined);
              }}
            >
              <Icon name="share" />
              {t.common.share}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
