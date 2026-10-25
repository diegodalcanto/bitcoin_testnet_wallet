import type { JSX } from 'preact';
import { CONFIG } from '../../config';
import { formatMinutes, formatSats, formatTime, minutesSince } from '../../format';
import { t } from '../../i18n/it';
import { navigate, paths } from '../../state/router';
import { settings, updateSettings } from '../../state/settings';
import { refresh, syncStatus } from '../../state/sync';
import { balance, chain, history, neverLoaded } from '../../state/wallet';
import { Btc, Logos } from '../common';
import { Explainable, InlineExplain, SectionTitle } from '../explain';
import { useNow, usePullToRefresh } from '../hooks';
import { Icon } from '../icons';
import { TxRow } from '../TxRow';

function BalanceCard(): JSX.Element {
  const b = balance.value;
  const hidden = settings.value.hideBalance;
  return (
    <section class="card balance-card" aria-labelledby="balance-label">
      <Explainable topic="balance" label={<span id="balance-label">{t.home.balance}</span>} class="balance-label-wrap">
        <button
          type="button"
          class="balance"
          data-testid="balance"
          aria-label={hidden ? t.home.tapToShow : `${formatSats(b.total)} ${t.common.sats}. ${t.home.tapToHide}`}
          onClick={() => updateSettings({ hideBalance: !hidden })}
        >
          {hidden ? t.home.hiddenBalance : formatSats(b.total)}
          <span class="unit">{t.common.sats}</span>
        </button>
        <div class="balance-btc">{hidden ? '' : <Btc value={b.total} />}</div>
      </Explainable>
      {!hidden && b.total > 0 && (
        <InlineExplain topic="pending">
          <span class={`pending-line${b.unconfirmed === 0 ? ' done' : ''}`} data-testid="pending-line">
            <Icon name={b.unconfirmed === 0 ? 'check' : 'clock'} class="chev" />
            {b.unconfirmed === 0 ? t.home.allConfirmed : t.home.pending(formatSats(b.unconfirmed))}
          </span>
        </InlineExplain>
      )}
    </section>
  );
}

function SyncLine(): JSX.Element {
  const now = useNow(1_000);
  const status = syncStatus.value;
  const updatedAt = chain.value.updatedAt;
  if (status.error) {
    const seconds = status.retryAt ? Math.max(0, Math.ceil((status.retryAt - now) / 1000)) : 0;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const text = offline
      ? updatedAt
        ? t.home.offline(formatTime(updatedAt))
        : t.home.offlineNever
      : status.error === 'rate-limit'
        ? t.home.rateLimited(seconds)
        : t.home.errorRetry(seconds);
    return (
      <p class="status-line error" role="status">
        <Icon name="alert" class="chev" />
        {text}
      </p>
    );
  }
  // Il testo cambia solo con l'orario dell'ultimo aggiornamento: niente lampeggio ogni 15 s.
  return (
    <p class="status-line" role="status">
      <Icon name="refresh" class={`chev${status.loading ? ' spin' : ''}`} />
      {updatedAt ? t.home.updatedAt(formatTime(updatedAt)) : t.common.loading}
    </p>
  );
}

function NetworkStatus(): JSX.Element {
  const now = useNow(15_000);
  const tip = chain.value.tip;
  return (
    <section class="card">
      <Explainable topic="block" label={t.home.networkStatus}>
        <div class="net-status" style={{ marginTop: '8px' }}>
          <span class="cube">
            <Icon name="cube" />
          </span>
          <div class="grow">
            {tip ? (
              <>
                <div style={{ fontWeight: 700 }} data-testid="tip-height">
                  {t.home.lastBlock(formatSats(tip.height))}
                </div>
                <div class="muted small">{t.home.minutesAgo(formatMinutes(minutesSince(tip.time, now)))}</div>
              </>
            ) : (
              <div class="muted">{t.home.noBlockYet}</div>
            )}
          </div>
        </div>
      </Explainable>
    </section>
  );
}

function History(): JSX.Element {
  const items = history.value.slice(0, CONFIG.HOME_TX_COUNT);
  const tipHeight = chain.value.tip?.height ?? null;
  return (
    <section class="card">
      <SectionTitle topic="history">{t.home.history}</SectionTitle>
      {items.length === 0 ? (
        <p class="empty">{neverLoaded.value ? t.common.loading : t.home.empty}</p>
      ) : (
        <ul class="tx-list">
          {items.map((item) => (
            <TxRow key={item.txid} item={item} tipHeight={tipHeight} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Home(): JSX.Element {
  const pull = usePullToRefresh(() => refresh({ full: true }));
  return (
    <div>
      <div class="ptr" style={{ height: `${pull.distance}px` }} aria-hidden={pull.state === 'idle'}>
        <Icon name="refresh" class={pull.state === 'refreshing' ? 'spin' : ''} />
        {pull.state === 'refreshing' ? t.home.refreshing : pull.state === 'ready' ? t.home.release : t.home.pull}
      </div>
      <BalanceCard />
      <div class="btn-row actions">
        <button type="button" class="btn btn-primary btn-lg" onClick={() => navigate(paths.receive)}>
          <Icon name="arrowDown" />
          {t.home.receive}
        </button>
        <button type="button" class="btn btn-primary btn-lg" onClick={() => navigate(paths.send)}>
          <Icon name="arrowUp" />
          {t.home.send}
        </button>
      </div>
      <SyncLine />
      <div class="section">
        <NetworkStatus />
      </div>
      <div class="section">
        <History />
      </div>
      <footer class="footer-logos">
        <Logos size="small" />
        <div>{t.app.lab}</div>
        <p class="footer-warning">{t.home.mainnetWarning}</p>
      </footer>
    </div>
  );
}
