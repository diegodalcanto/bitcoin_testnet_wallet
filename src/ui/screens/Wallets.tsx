import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { shortAddress } from '../../address';
import { CONFIG } from '../../config';
import { formatSats } from '../../format';
import { explain, t } from '../../i18n/it';
import { navigate, paths } from '../../state/router';
import { showToast } from '../../state/toasts';
import { addWallet, cachedBalance, networkKey, selectWallet, storedWallet, walletIndex, walletTotal } from '../../state/wallet';
import { canAddWallet, walletAddress, walletPath } from '../../wallet';
import { Message } from '../common';
import { SectionTitle } from '../explain';
import { Icon } from '../icons';

/**
 * "I miei wallet": tutti i wallet ricavati dalla stessa frase (wallet gerarchico).
 * Ognuno ha il suo indirizzo m/84'/1'/0'/0/n, il suo saldo e il suo stato locale.
 */
export function Wallets(): JSX.Element | null {
  const wallet = storedWallet.value;
  const active = walletIndex.value;
  const total = walletTotal.value;
  const net = networkKey.value;
  const rows = useMemo(() => {
    if (wallet?.kind !== 'mnemonic') return [];
    return Array.from({ length: total }, (_, index) => {
      const address = walletAddress(wallet.mnemonic, index);
      return { index, address, balance: cachedBalance(address) };
    });
  }, [wallet, total, net]);

  if (!wallet) return null;

  const go = (index: number) => {
    selectWallet(index);
    showToast(t.wallets.switched(t.wallets.name(index + 1)), 'success');
    navigate(paths.home, { replace: true });
  };

  const create = () => {
    const index = addWallet();
    if (index === null) return;
    showToast(t.wallets.created(t.wallets.name(index + 1)), 'success');
    navigate(paths.home, { replace: true });
  };

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.wallets.title}</h1>
      <section class="card">
        <SectionTitle topic="hdWallet">{explain.hdWallet.title}</SectionTitle>
        {wallet.kind === 'wif' ? (
          <Message kind="info">{t.wallets.wifOnly}</Message>
        ) : (
          <ul class="tx-list" data-testid="wallet-list">
            {rows.map((row) => (
              <li class="tx-item" key={row.index}>
                <button
                  type="button"
                  class="tx-link"
                  aria-current={row.index === active ? 'true' : undefined}
                  onClick={() => (row.index === active ? navigate(paths.home, { replace: true }) : go(row.index))}
                  data-testid="wallet-row"
                >
                  <span class={`tx-icon ${row.index === active ? 'out' : 'self'}`}>
                    <Icon name="wallet" />
                  </span>
                  <span class="tx-main">
                    <span class="tx-title">
                      {t.wallets.name(row.index + 1)}
                      {row.index === active && <span class="tag">{t.wallets.inUse}</span>}
                    </span>
                    <span class="tx-sub mono" style={{ display: 'block' }}>
                      {shortAddress(row.address)}
                    </span>
                    <span class="tx-sub mono" style={{ display: 'block' }}>
                      {t.wallets.path(walletPath(row.index))}
                    </span>
                    <span class="tx-sub" style={{ display: 'block', fontWeight: 600 }}>
                      {row.balance === null ? t.wallets.noBalance : t.wallets.lastBalance(formatSats(row.balance))}
                    </span>
                  </span>
                  {row.index === active ? <Icon name="check" class="chev" /> : <Icon name="chevronRight" class="chev" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {wallet.kind === 'mnemonic' &&
        (canAddWallet(wallet) ? (
          <div class="stack">
            <button type="button" class="btn btn-primary btn-lg btn-block" onClick={create} data-testid="add-wallet">
              <Icon name="plusSquare" />
              {t.wallets.create}
            </button>
            <p class="muted small center">{t.wallets.createNote}</p>
          </div>
        ) : (
          <Message kind="info">{t.wallets.max(CONFIG.MAX_WALLETS)}</Message>
        ))}

      <section class="card stack">
        <p class="small muted">{t.wallets.resetTitle}</p>
        <a class="btn btn-outline-danger btn-block" href={paths.newPhrase} data-testid="new-phrase-link">
          {t.wallets.resetLink}
        </a>
      </section>
    </div>
  );
}
