import type { JSX } from 'preact';
import { shortAddress } from '../address';
import { formatSats, formatShortDateTime } from '../format';
import { confirmationsLabel, confirmationsOf, type HistoryItem } from '../history';
import { t } from '../i18n/it';
import { txExplorerUrl } from '../networks';
import { paths } from '../state/router';
import { networkInfo } from '../state/wallet';
import { Icon } from './icons';

export function TxRow({ item, tipHeight }: { item: HistoryItem; tipHeight: number | null }): JSX.Element {
  const confirmations = item.confirmed ? confirmationsOf(item.blockHeight, tipHeight) : 0;
  const title = item.direction === 'in' ? t.home.received : item.direction === 'out' ? t.home.sent : t.home.self;
  const sub = [
    item.local ? t.home.localOnly : item.time ? formatShortDateTime(item.time) : null,
    item.counterparty ? shortAddress(item.counterparty) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const amount =
    item.direction === 'in' ? `+${formatSats(item.amount)}` : item.direction === 'out' ? `−${formatSats(item.amount)}` : formatSats(item.net);
  // Toccando la riga si apre la transazione nel block explorer; il pulsante "i" apre i dettagli nell'app.
  const explorer = txExplorerUrl(networkInfo.value, item.txid);
  return (
    <li class="tx-item tx-split">
      <a
        class="tx-link"
        href={explorer ?? paths.tx(item.txid)}
        target={explorer ? '_blank' : undefined}
        rel={explorer ? 'noopener noreferrer' : undefined}
        title={explorer ? t.home.openInExplorer : undefined}
        data-testid="tx-row"
      >
        <span class={`tx-icon ${item.direction}`}>
          <Icon name={item.direction === 'in' ? 'arrowDown' : item.direction === 'out' ? 'arrowUp' : 'swap'} />
        </span>
        <span class="tx-main">
          <span class="tx-title">
            {title}
            {explorer && <Icon name="external" class="tx-ext" />}
          </span>
          <span class="tx-sub" style={{ display: 'block' }}>
            {sub}
          </span>
        </span>
        <span class={`tx-amount ${item.direction}`}>
          {amount}
          <span class="small muted" style={{ fontWeight: 600 }}>
            {' '}
            {t.common.sats}
          </span>
          <br />
          <span class={`conf-pill${confirmations > 0 ? ' ok' : ''}`}>
            <Icon name={confirmations > 0 ? 'check' : 'clock'} class="chev" />
            {t.home.confirmationsShort(confirmationsLabel(confirmations))}
          </span>
          {item.fee !== null && item.direction !== 'in' && (
            <span class="tx-sub" style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              {t.home.fee(formatSats(item.fee))}
            </span>
          )}
        </span>
      </a>
      {explorer && (
        <a class="tx-more" href={paths.tx(item.txid)} aria-label={t.home.txDetails} title={t.home.txDetails} data-testid="tx-details">
          <Icon name="info" />
        </a>
      )}
    </li>
  );
}
