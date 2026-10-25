import type { JSX } from 'preact';
import { formatSats, shortTxid } from '../../format';
import { explain, t } from '../../i18n/it';
import { paths } from '../../state/router';
import { balance, spendable } from '../../state/wallet';
import { Btc } from '../common';
import { SectionTitle } from '../explain';
import { Icon } from '../icons';

/** "Le mie monete": il saldo è la somma di questi pezzi (UTXO). */
export function Coins(): JSX.Element {
  const coins = spendable.value;
  const b = balance.value;
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.coins.title}</h1>
      <section class="card">
        <SectionTitle topic="utxo">{explain.utxo.title}</SectionTitle>
        <p style={{ fontWeight: 700 }} data-testid="coins-summary">
          {t.coins.summary(coins.length, formatSats(b.total))}
        </p>
        <p class="muted small">
          <Btc value={b.total} />
        </p>
      </section>

      <section class="card">
        {coins.length === 0 ? (
          <p class="empty">{t.coins.empty}</p>
        ) : (
          <ul class="tx-list" data-testid="coins-list">
            {coins.map((coin) => (
              <li class="tx-item" key={`${coin.txid}:${coin.vout}`}>
                <a class="tx-link" href={paths.tx(coin.txid)}>
                  <span class={`tx-icon ${coin.confirmed ? 'in' : 'self'}`}>
                    <Icon name="coins" />
                  </span>
                  <span class="tx-main">
                    <span class="tx-title">
                      {formatSats(coin.value)} {t.common.sats}
                    </span>
                    <span class="tx-sub" style={{ display: 'block' }}>
                      {coin.local
                        ? t.coins.localChange
                        : coin.confirmed
                          ? coin.blockHeight !== undefined
                            ? `${t.coins.confirmed}, ${t.coins.inBlock(formatSats(coin.blockHeight))}`
                            : t.coins.confirmed
                          : t.coins.unconfirmed}
                    </span>
                    <span class="tx-sub mono" style={{ display: 'block' }}>
                      {t.coins.origin} {shortTxid(coin.txid)}:{coin.vout}
                    </span>
                  </span>
                  <Icon name="chevronRight" class="chev" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="card">
        <SectionTitle topic="change">{explain.change.title}</SectionTitle>
        <p class="small">{t.coins.consolidation}</p>
      </section>
    </div>
  );
}
