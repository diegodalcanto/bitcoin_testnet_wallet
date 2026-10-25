import { address as bitcoinAddress, Transaction } from 'bitcoinjs-lib';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { shortAddress } from '../../address';
import type { EsploraTx } from '../../esplora';
import { formatDateTime, formatSats, groupChars } from '../../format';
import { confirmationsLabel, confirmationsOf, summarizePending, summarizeTx, type HistoryItem } from '../../history';
import { t } from '../../i18n/it';
import { BITCOIN_NETWORK, txExplorerUrl } from '../../networks';
import type { PendingTx } from '../../pending';
import { chain, client, keys, networkInfo, pending } from '../../state/wallet';
import { CopyButton, Message } from '../common';
import { Explainable, SectionTitle } from '../explain';
import { Icon } from '../icons';

interface IoRow {
  address?: string;
  value?: number;
  note?: string;
  mine: boolean;
}

interface TxView {
  summary: HistoryItem;
  inputs: IoRow[];
  outputs: IoRow[];
  fee: number | null;
  vsize: number | null;
  /** Transazione grezza già nota (per quelle inviate da qui). */
  hex?: string;
}

function fromEsplora(tx: EsploraTx, me: string): TxView {
  return {
    summary: summarizeTx(tx, me),
    inputs: tx.vin.map((vin) =>
      vin.is_coinbase
        ? { note: t.tx.coinbase, mine: false }
        : {
            address: vin.prevout?.scriptpubkey_address,
            value: vin.prevout?.value,
            mine: vin.prevout?.scriptpubkey_address === me,
          },
    ),
    outputs: tx.vout.map((out) => ({ address: out.scriptpubkey_address, value: out.value, mine: out.scriptpubkey_address === me })),
    fee: tx.fee,
    vsize: Math.ceil(tx.weight / 4),
  };
}

function fromPending(p: PendingTx, me: string): TxView {
  let outputs: IoRow[] = [];
  try {
    const tx = Transaction.fromHex(p.hex);
    outputs = tx.outs.map((out) => {
      let address: string | undefined;
      try {
        address = bitcoinAddress.fromOutputScript(out.script, BITCOIN_NETWORK);
      } catch {
        address = undefined;
      }
      return { address, value: Number(out.value), mine: address === me };
    });
  } catch {
    outputs = [];
  }
  return {
    summary: summarizePending(p, me),
    inputs: p.spent.map((o) => ({ address: me, value: o.value, mine: true })),
    outputs,
    fee: p.fee,
    vsize: p.vsize,
    hex: p.hex,
  };
}

function IoList({ rows }: { rows: IoRow[] }): JSX.Element {
  return (
    <ul class="io-list">
      {rows.map((row, i) => (
        <li class={`io-item${row.mine ? ' mine' : ''}`} key={i}>
          <span class="addr">
            {row.note ?? <span class="mono">{row.address ? shortAddress(row.address, 10, 8) : t.tx.unknownAddress}</span>}
            {row.mine && <span class="tag">{t.tx.yours}</span>}
          </span>
          <span class="val">{row.value !== undefined ? formatSats(row.value) : '–'}</span>
        </li>
      ))}
    </ul>
  );
}

function RawTx({ txid, knownHex }: { txid: string; knownHex?: string }): JSX.Element {
  const [hex, setHex] = useState<string | null>(knownHex ?? null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  return (
    <details
      class="details"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || hex || state === 'loading') return;
        setState('loading');
        client.value
          .getTxHex(txid)
          .then((value) => {
            setHex(value);
            setState('idle');
          })
          .catch(() => setState('error'));
      }}
    >
      <summary>
        {t.tx.raw}
        <Icon name="chevronDown" class="chev" />
      </summary>
      <SectionTitle topic="rawTx" level={3}>
        {t.tx.raw}
      </SectionTitle>
      {hex ? <div class="raw-hex">{hex}</div> : state === 'error' ? <Message kind="error">{t.tx.rawError}</Message> : <p class="muted">{t.tx.rawLoading}</p>}
    </details>
  );
}

export function TxDetail({ txid }: { txid: string }): JSX.Element | null {
  const k = keys.value;
  const known = chain.value.txs?.find((tx) => tx.txid === txid);
  const local = pending.value.find((p) => p.txid === txid);
  const [fetched, setFetched] = useState<EsploraTx | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'not-found'>('idle');

  useEffect(() => {
    if (known || local || fetched) return;
    setLoadState('loading');
    client.value
      .getTx(txid)
      .then((tx) => {
        setFetched(tx);
        setLoadState('idle');
      })
      .catch((err: { status?: number }) => setLoadState(err?.status === 404 ? 'not-found' : 'error'));
  }, [txid, Boolean(known), Boolean(local)]);

  if (!k) return null;
  const source = known ?? fetched;
  const view = source ? fromEsplora(source, k.address) : local ? fromPending(local, k.address) : null;

  if (!view) {
    return (
      <div class="stack">
        <h1 class="page-title">{t.tx.title}</h1>
        {loadState === 'loading' || loadState === 'idle' ? (
          <p class="muted">{t.common.loading}</p>
        ) : (
          <Message kind="error">{loadState === 'not-found' ? t.tx.notFound : t.tx.loadError}</Message>
        )}
      </div>
    );
  }

  const s = view.summary;
  const confirmations = s.confirmed ? confirmationsOf(s.blockHeight, chain.value.tip?.height) : 0;
  const url = txExplorerUrl(networkInfo.value, txid);
  const heading = s.direction === 'in' ? t.tx.incoming : s.direction === 'out' ? t.tx.outgoing : t.tx.self;
  const amountText = s.direction === 'in' ? `+${formatSats(s.amount)}` : s.direction === 'out' ? `−${formatSats(s.amount)}` : formatSats(s.net);

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <section class="card center">
        <div class="row" style={{ justifyContent: 'center' }}>
          <span class={`tx-icon ${s.direction}`}>
            <Icon name={s.direction === 'in' ? 'arrowDown' : s.direction === 'out' ? 'arrowUp' : 'swap'} />
          </span>
        </div>
        <h1 style={{ marginTop: '10px' }}>{heading}</h1>
        <p class="balance" style={{ fontSize: '2rem', cursor: 'default' }}>
          {amountText}
          <span class="unit">{t.common.sats}</span>
        </p>
        <span class={`conf-pill${confirmations > 0 ? ' ok' : ''}`}>
          <Icon name={confirmations > 0 ? 'check' : 'clock'} class="chev" />
          {s.local ? t.tx.localOnly : s.confirmed ? t.tx.confirmed : t.tx.unconfirmed}
        </span>
      </section>

      <section class="card">
        <Explainable topic="confirmations" label={t.tx.confirmations}>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', margin: '4px 0 12px' }} data-testid="tx-confirmations">
            {confirmationsLabel(confirmations)}
          </p>
        </Explainable>
        <dl class="kv">
          {s.blockHeight !== undefined && (
            <>
              <dt>{t.tx.block}</dt>
              <dd>#{formatSats(s.blockHeight)}</dd>
            </>
          )}
          {s.time !== undefined && (
            <>
              <dt>{s.local ? t.tx.sentAt : t.tx.date}</dt>
              <dd>{formatDateTime(s.time)}</dd>
            </>
          )}
          {view.fee !== null && (
            <>
              <dt>{t.tx.fee}</dt>
              <dd>
                {formatSats(view.fee)} {t.common.sats}
              </dd>
            </>
          )}
          {view.fee !== null && view.vsize && (
            <>
              <dt>{t.tx.feeRate}</dt>
              <dd>{(view.fee / view.vsize).toLocaleString('it-IT', { maximumFractionDigits: 1 })} sat/vB</dd>
            </>
          )}
          {view.vsize && (
            <>
              <dt>{t.tx.size}</dt>
              <dd>{view.vsize} vB</dd>
            </>
          )}
        </dl>
      </section>

      <section class="card">
        <Explainable topic="txid" label={t.tx.txid}>
          <p class="mono" style={{ marginTop: '6px' }} data-testid="tx-detail-txid">
            {groupChars(txid, 8)}
          </p>
        </Explainable>
        <div class="btn-row" style={{ marginTop: '12px' }}>
          <CopyButton text={txid} class="btn btn-outline btn-block" />
          {url && (
            <a class="btn btn-outline btn-block" href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" />
              {t.common.explorer}
            </a>
          )}
        </div>
      </section>

      <section class="card">
        <SectionTitle topic="transaction">{`${t.tx.inputs} (${view.inputs.length})`}</SectionTitle>
        <IoList rows={view.inputs} />
        <SectionTitle topic="change">{`${t.tx.outputs} (${view.outputs.length})`}</SectionTitle>
        <IoList rows={view.outputs} />
        <RawTx txid={txid} knownHex={view.hex} />
      </section>
    </div>
  );
}
