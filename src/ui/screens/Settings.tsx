import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n/it';
import { getNetworkInfo, NETWORK_IDS, type NetworkId } from '../../networks';
import { probeEsploraServer } from '../../probe';
import { pinEnabled } from '../../state/pin';
import { navigate, paths } from '../../state/router';
import { settings, updateSettings, type ThemeSetting } from '../../state/settings';
import { showToast } from '../../state/toasts';
import { changeNetwork, client, networkInfo } from '../../state/wallet';
import { formatSats } from '../../format';
import { Message } from '../common';
import { Explainable, SectionTitle } from '../explain';
import { Icon } from '../icons';

function NetworkSection(): JSX.Element {
  const current = settings.value.network;
  const [customUrl, setCustomUrl] = useState(settings.value.customUrl);
  const [selected, setSelected] = useState<NetworkId>(current);
  const [probe, setProbe] = useState<{ state: 'idle' | 'testing' } | { state: 'done'; ok: boolean; text: string }>({ state: 'idle' });

  const choose = (id: NetworkId) => {
    setSelected(id);
    if (id === 'custom') return;
    if (id !== current) {
      changeNetwork(id);
      showToast(t.settings.networkChanged(getNetworkInfo(id).name), 'success');
    }
  };

  const testCustom = async () => {
    setProbe({ state: 'testing' });
    const result = await probeEsploraServer(customUrl);
    if (!result.ok) {
      const text = result.reason === 'invalid' ? t.settings.customInvalid : result.reason === 'mainnet' ? t.settings.customMainnet : t.settings.customUnreachable;
      setProbe({ state: 'done', ok: false, text });
      return;
    }
    setCustomUrl(result.url);
    setProbe({ state: 'done', ok: true, text: t.settings.customOk(t.settings.chains[result.chain], formatSats(result.height)) });
    changeNetwork('custom', result.url);
    showToast(t.settings.networkChanged(t.settings.networks.custom.name), 'success');
  };

  return (
    <section class="card">
      <SectionTitle topic="network">{t.settings.network}</SectionTitle>
      <div role="radiogroup" aria-label={t.settings.network}>
        {NETWORK_IDS.map((id) => {
          const info = getNetworkInfo(id, id === 'custom' ? settings.value.customUrl : undefined);
          const texts = t.settings.networks[id];
          return (
            <label class="radio-row" key={id}>
              <input type="radio" name="network" value={id} checked={selected === id} onChange={() => choose(id)} />
              <span>
                <span style={{ fontWeight: 700 }}>
                  <span class="swatch" style={{ background: info.color }} />
                  {texts.name}
                </span>
                <span class="muted small" style={{ display: 'block' }}>
                  {texts.note}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {selected === 'custom' && (
        <div class="stack" style={{ marginTop: '8px' }}>
          <label class="field">
            <span class="label-row">{t.settings.customUrl}</span>
            <input
              class="input mono"
              type="url"
              inputMode="url"
              autocomplete="off"
              autocapitalize="none"
              spellcheck={false}
              placeholder={t.settings.customPlaceholder}
              value={customUrl}
              onInput={(e) => setCustomUrl((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          {customUrl.trim().startsWith('http://') && <Message kind="warning">{t.settings.customHttp}</Message>}
          <button type="button" class="btn btn-primary" disabled={probe.state === 'testing' || !customUrl.trim()} onClick={() => void testCustom()}>
            {probe.state === 'testing' ? t.settings.customTesting : t.settings.customTest}
          </button>
          {probe.state === 'done' && <Message kind={probe.ok ? 'success' : 'error'}>{probe.text}</Message>}
        </div>
      )}
      <div style={{ marginTop: '12px' }}>
        <Explainable topic="servers" label={t.settings.endpointInUse}>
          <p class="mono small" style={{ marginTop: '4px' }} data-testid="endpoint-in-use">
            {client.value.activeEndpoint ?? '–'}
          </p>
        </Explainable>
      </div>
    </section>
  );
}

const THEMES: ThemeSetting[] = ['auto', 'light', 'dark'];

export function Settings(): JSX.Element {
  const s = settings.value;
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <div>
        <h1 class="page-title" style={{ marginBottom: '4px' }}>
          {t.settings.title}
        </h1>
        <p class="muted small">{t.settings.forVolunteers}</p>
      </div>

      <NetworkSection />

      <section class="card">
        <h2 style={{ marginBottom: '8px' }}>{t.settings.display}</h2>
        <div class="switch-row">
          <label for="toggle-explanations" style={{ fontWeight: 600 }}>
            {t.settings.showExplanations}
          </label>
          <span class="switch">
            <input
              id="toggle-explanations"
              type="checkbox"
              role="switch"
              checked={s.showExplanations}
              onChange={(e) => updateSettings({ showExplanations: (e.currentTarget as HTMLInputElement).checked })}
            />
            <span class="track" />
          </span>
        </div>
        <p class="muted small">{t.settings.showExplanationsNote}</p>
        <div style={{ marginTop: '16px' }}>
          <div class="label-row" style={{ marginBottom: '8px' }}>
            {t.settings.theme}
          </div>
          <div class="segmented" role="group" aria-label={t.settings.theme}>
            {THEMES.map((theme) => (
              <button type="button" key={theme} aria-pressed={s.theme === theme} onClick={() => updateSettings({ theme })}>
                {t.settings.themes[theme]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section class="card">
        <SectionTitle topic="pin">{t.settings.security}</SectionTitle>
        <ul class="list">
          <li>
            <a class="list-btn" href={paths.pin}>
              <span>
                {t.settings.pin}
                <span class="muted small" style={{ display: 'block', fontWeight: 500 }}>
                  {pinEnabled.value ? t.settings.pinOn : t.settings.pinOff}
                </span>
              </span>
              <span class="row muted small">
                {pinEnabled.value ? t.settings.pinChange : t.settings.pinSet}
                <Icon name="chevronRight" />
              </span>
            </a>
          </li>
          {pinEnabled.value && (
            <li>
              <a class="list-btn danger" href={paths.pinRemove}>
                {t.settings.pinRemove}
                <Icon name="chevronRight" />
              </a>
            </li>
          )}
        </ul>
      </section>

      <section class="card">
        <h2 style={{ marginBottom: '4px' }}>{t.settings.wallet}</h2>
        <ul class="list">
          <li>
            <a class="list-btn" href={paths.keys}>
              <span class="row">
                <Icon name="key" />
                {t.settings.keys}
              </span>
              <Icon name="chevronRight" />
            </a>
          </li>
          <li>
            <a class="list-btn" href={paths.restore}>
              <span class="row">
                <Icon name="download" />
                {t.settings.restore}
              </span>
              <Icon name="chevronRight" />
            </a>
          </li>
          <li>
            <a class="list-btn danger" href={paths.newWallet}>
              <span class="row">
                <Icon name="refresh" />
                {t.settings.newWallet}
              </span>
              <Icon name="chevronRight" />
            </a>
          </li>
        </ul>
      </section>

      <button type="button" class="btn btn-outline btn-block" onClick={() => navigate(paths.info)}>
        <Icon name="info" />
        {t.settings.info}
      </button>
      <p class="muted small center">{networkInfo.value.name}</p>
    </div>
  );
}
