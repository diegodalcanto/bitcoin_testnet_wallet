import type { JSX } from 'preact';
import { CONFIG } from '../../config';
import { t } from '../../i18n/it';
import { client, networkInfo } from '../../state/wallet';
import { Logos, RichMessage } from '../common';
import { Icon } from '../icons';
import { Rich } from '../text';

export function Info(): JSX.Element {
  const net = networkInfo.value;
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.info.title}</h1>
      <section class="card center stack">
        <Logos size="large" />
        <p class="hero" style={{ margin: 0 }}>
          <span class="lab">{t.app.lab}</span>
        </p>
        <p>
          <Rich text={t.info.about} />
        </p>
      </section>
      <section class="card">
        <dl class="kv">
          <dt>{t.info.version}</dt>
          <dd data-testid="app-version">
            {__APP_VERSION__} ({__BUILD_SHA__})
          </dd>
          <dt>{t.info.network}</dt>
          <dd>{net.name}</dd>
        </dl>
        <dl class="kv-block">
          <dt>{t.info.endpoint}</dt>
          <dd class="mono small">{client.value.activeEndpoint ?? '–'}</dd>
        </dl>
        <dl class="kv-block">
          <dt>{t.info.endpoints}</dt>
          <dd class="mono small">
            {net.endpoints.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </dd>
        </dl>
      </section>
      <p class="small">{t.info.privacy}</p>
      <RichMessage kind="warning" text={t.info.notMainnet} />
      <section class="card">
        <h2 style={{ marginBottom: '6px' }}>{t.info.credits}</h2>
        <p class="small">{t.info.creditsText}</p>
      </section>
      <a class="btn btn-outline btn-block" href={CONFIG.REPO_URL} target="_blank" rel="noopener noreferrer">
        <Icon name="external" />
        {t.info.source}
      </a>
    </div>
  );
}
