import type { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n/it';
import { locked } from '../state/pin';
import { isIos, standalone } from '../state/platform';
import { goBack, navigate, paths, route, type Route } from '../state/router';
import { lastIncoming, startSync, stopSync } from '../state/sync';
import { showToast } from '../state/toasts';
import { formatSats } from '../format';
import { storedWallet } from '../state/wallet';
import { NetworkBadge, RichMessage, Toasts, UpdateBanner } from './common';
import { Icon, type IconName } from './icons';
import { Coins } from './screens/Coins';
import { Home } from './screens/Home';
import { Info } from './screens/Info';
import { Keys } from './screens/Keys';
import { Learn } from './screens/Learn';
import { NewWallet } from './screens/NewWallet';
import { Onboarding } from './screens/Onboarding';
import { LockScreen, PinSetupScreen } from './screens/Pin';
import { Receive } from './screens/Receive';
import { RestoreScreen } from './screens/Restore';
import { Send } from './screens/Send';
import { Settings } from './screens/Settings';
import { TxDetail } from './screens/TxDetail';

const TABS: { name: Route['name']; label: string; icon: IconName; href: string }[] = [
  { name: 'home', label: t.nav.wallet, icon: 'wallet', href: paths.home },
  { name: 'coins', label: t.nav.coins, icon: 'coins', href: paths.coins },
  { name: 'learn', label: t.nav.learn, icon: 'book', href: paths.learn() },
];

function isTab(r: Route): boolean {
  return TABS.some((tab) => tab.name === r.name);
}

function Header({ back, settingsLink }: { back: boolean; settingsLink: boolean }): JSX.Element {
  return (
    <header class="header">
      <div class="header-inner">
        <div>
          {back && (
            <button type="button" class="icon-btn" aria-label={t.common.back} onClick={() => goBack()}>
              <Icon name="arrowLeft" />
            </button>
          )}
        </div>
        <div class="header-title">
          <NetworkBadge />
        </div>
        <div>
          {settingsLink && (
            <a class="icon-btn" href={paths.settings} aria-label={t.nav.settings} data-testid="settings-link">
              <Icon name="sliders" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomNav({ current }: { current: Route['name'] }): JSX.Element {
  return (
    <nav class="bottom-nav" aria-label={t.nav.label}>
      <div class="bottom-nav-inner">
        {TABS.map((tab) => (
          <a
            key={tab.name}
            class="nav-item"
            href={tab.href}
            aria-current={current === tab.name ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(tab.href, { replace: isTab(route.value) });
            }}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function Frame({ children }: { children: ComponentChildren }): JSX.Element {
  return (
    <div class="app">
      <Header back={false} settingsLink={false} />
      <main class="main no-nav">{children}</main>
      <Toasts />
    </div>
  );
}

function Screen({ r }: { r: Route }): JSX.Element {
  switch (r.name) {
    case 'home':
      return <Home />;
    case 'receive':
      return <Receive />;
    case 'send':
      return <Send />;
    case 'tx':
      return <TxDetail txid={r.txid} />;
    case 'keys':
      return <Keys />;
    case 'coins':
      return <Coins />;
    case 'learn':
      return <Learn card={r.card} />;
    case 'settings':
      return <Settings />;
    case 'info':
      return <Info />;
    case 'restore':
      return <RestoreScreen />;
    case 'new-wallet':
      return <NewWallet />;
    case 'pin':
      return <PinSetupScreen remove={r.remove} />;
  }
}

/** Avviso per i pagamenti in arrivo (nella schermata Ricevi c'è già il riquadro verde). */
function useIncomingToast(): void {
  const incoming = lastIncoming.value;
  useEffect(() => {
    if (!incoming || route.value.name === 'receive') return;
    showToast(t.home.incomingToast(formatSats(incoming.amount)), 'success', 6_000);
  }, [incoming?.at]);
}

function Shell(): JSX.Element {
  useEffect(() => {
    startSync();
    return stopSync;
  }, []);
  useIncomingToast();
  const r = route.value;
  const tab = isTab(r);
  return (
    <div class="app">
      <Header back={!tab} settingsLink={tab} />
      <main class={`main${tab ? '' : ' no-nav'}`}>
        {isIos && !standalone.value && r.name === 'home' && (
          <div style={{ marginBottom: '12px' }}>
            <RichMessage kind="info" text={t.install.browserBanner} />
          </div>
        )}
        <Screen r={r} />
      </main>
      {tab && <BottomNav current={r.name} />}
      <UpdateBanner />
      <Toasts />
    </div>
  );
}

export function App(): JSX.Element {
  if (!storedWallet.value) {
    return (
      <Frame>
        <Onboarding />
      </Frame>
    );
  }
  if (locked.value) {
    return (
      <Frame>
        <LockScreen />
      </Frame>
    );
  }
  return <Shell />;
}
