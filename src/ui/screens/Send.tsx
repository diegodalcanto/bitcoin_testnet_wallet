import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { checkAddress, parsePaymentRequest, shortAddress, type AddressCheck, type PaymentRequest } from '../../address';
import { formatMinutes, formatSats, minutesSince, parseSatsInput, shortTxid } from '../../format';
import { explain, t } from '../../i18n/it';
import { txExplorerUrl } from '../../networks';
import { navigate, paths } from '../../state/router';
import { sendPayment, type SendError } from '../../state/send';
import { feeInfo, loadFeeRate } from '../../state/sync';
import { showToast } from '../../state/toasts';
import { balance, chain, keys, networkInfo, spendable } from '../../state/wallet';
import { maxSendable, planTransaction, type PlanError, type TxPlan } from '../../tx';
import { Btc, CopyButton, Message, RichMessage } from '../common';
import { Explainable, InlineExplain, SectionTitle } from '../explain';
import { Icon } from '../icons';
import { Scanner } from '../Scanner';
import { SlideToConfirm } from '../SlideToConfirm';

type Quick = '25' | '50' | 'all' | null;

type Phase = { name: 'form' } | { name: 'sending' } | { name: 'success'; txid: string; amount: number; fee: number } | { name: 'error'; error: SendError };

export function addressErrorText(check: AddressCheck): string | null {
  if (check.ok) return null;
  return t.errors.address[check.error];
}

export function planErrorText(error: PlanError): string {
  switch (error.code) {
    case 'no-funds':
      return t.errors.plan.noFunds;
    case 'invalid-amount':
      return t.errors.plan.invalidAmount;
    case 'below-dust':
      return t.errors.plan.belowDust(formatSats(error.min));
    case 'insufficient-funds':
      return error.max > 0 ? t.errors.plan.insufficient(formatSats(error.max)) : t.errors.plan.insufficientNone;
  }
}

function sendErrorText(error: SendError): string {
  switch (error.code) {
    case 'no-wallet':
      return t.errors.send.noWallet;
    case 'plan':
      return planErrorText(error.error);
    case 'chain-limit': {
      const tip = chain.value.tip;
      return tip ? `${t.errors.send.chainLimit} ${t.errors.send.chainLimitSince(formatMinutes(minutesSince(tip.time)))}` : t.errors.send.chainLimit;
    }
    case 'fee-too-low':
      return t.errors.send.feeTooLow;
    case 'inputs-spent':
      return t.errors.send.inputsSpent;
    case 'rate-limit':
      return t.errors.send.rateLimit;
    case 'network':
      return t.errors.send.network;
    case 'uncertain':
      return t.errors.send.uncertain;
    case 'rejected':
      return t.errors.send.rejected;
  }
}

function Summary({ plan }: { plan: TxPlan }): JSX.Element {
  const recipient = plan.outputs.find((o) => o.kind === 'recipient');
  const rate = String(plan.feeRate);
  return (
    <section class="card" data-testid="send-summary">
      <h2 style={{ marginBottom: '12px' }}>{t.send.summary}</h2>
      <dl class="kv">
        <dt>{t.send.to}</dt>
        <dd class="mono">{recipient ? shortAddress(recipient.address) : ''}</dd>
        <dt>{t.send.toSend}</dt>
        <dd>
          {formatSats(plan.amount)} {t.common.sats}
        </dd>
        <dt>{t.send.feeLabel}</dt>
        <dd>
          {formatSats(plan.fee)} {t.common.sats}
          <div class="small muted" style={{ fontWeight: 500 }}>
            {t.send.feeRate(rate)}
          </div>
        </dd>
        <dt>{t.send.remaining}</dt>
        <dd>
          {formatSats(plan.balanceAfter)} {t.common.sats}
        </dd>
      </dl>
      <InlineExplain topic="fee">
        <span class="small muted">{t.send.feeFormula(plan.vsize, rate, formatSats(plan.fee - plan.dustToFee))}</span>
      </InlineExplain>
      <details class="details">
        <summary>
          {t.send.whatHappens}
          <Icon name="chevronDown" class="chev" />
        </summary>
        <SectionTitle topic="whatHappens" level={3}>
          {t.send.inputs(plan.inputs.length)}
        </SectionTitle>
        <ul class="io-list">
          {plan.inputs.map((input) => (
            <li class="io-item mine" key={`${input.txid}:${input.vout}`}>
              <span class="addr mono">
                {shortTxid(input.txid)}:{input.vout}
                {!input.confirmed && <span class="tag">{t.send.unconfirmedCoin}</span>}
              </span>
              <span class="val">{formatSats(input.value)}</span>
            </li>
          ))}
        </ul>
        <SectionTitle topic="change" level={3}>
          {t.send.outputs(plan.outputs.length)}
        </SectionTitle>
        <ul class="io-list">
          {plan.outputs.map((output, i) => (
            <li class={`io-item${output.kind === 'change' ? ' mine' : ''}`} key={i}>
              <span class="addr">
                <span class="mono">{shortAddress(output.address)}</span>
                <span class="tag">{output.kind === 'change' ? t.send.outputChange : t.send.outputRecipient}</span>
              </span>
              <span class="val">{formatSats(output.value)}</span>
            </li>
          ))}
        </ul>
        {plan.dustToFee > 0 && <p class="small">{t.send.dustToFee(formatSats(plan.dustToFee))}</p>}
        {plan.change === 0 && plan.dustToFee === 0 && <p class="small">{t.send.noChange}</p>}
        <SectionTitle topic="size" level={3}>
          {t.send.size(plan.vsize)}
        </SectionTitle>
        <p class="small muted">{t.send.feeFormula(plan.vsize, rate, formatSats(plan.fee - plan.dustToFee))}</p>
        {plan.inputs.some((i) => !i.confirmed) && (
          <SectionTitle topic="unconfirmed" level={3}>
            {explain.unconfirmed.title}
          </SectionTitle>
        )}
      </details>
    </section>
  );
}

function Success({ txid, amount, fee, onNew }: { txid: string; amount: number; fee: number; onNew: () => void }): JSX.Element {
  const url = txExplorerUrl(networkInfo.value, txid);
  return (
    <div class="stack" style={{ gap: '16px' }}>
      <div class="result">
        <div class="result-icon ok">
          <Icon name="check" />
        </div>
        <h1>{t.send.successTitle}</h1>
        <p style={{ marginTop: '8px', fontWeight: 700 }}>{t.send.successAmount(formatSats(amount))}</p>
        <p class="muted small">{t.home.fee(`${formatSats(fee)} ${t.common.sats}`)}</p>
        <p>{t.send.successText}</p>
      </div>
      <section class="card">
        <Explainable topic="txid" label={t.tx.txid}>
          <p class="mono" data-testid="success-txid" style={{ marginTop: '6px' }}>
            {txid}
          </p>
        </Explainable>
        <div class="btn-row" style={{ marginTop: '12px' }}>
          <CopyButton text={txid} class="btn btn-outline btn-block" />
          {url ? (
            <a class="btn btn-outline btn-block" href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" />
              {t.common.explorer}
            </a>
          ) : (
            <a class="btn btn-outline btn-block" href={paths.tx(txid)}>
              <Icon name="info" />
              {t.tx.title}
            </a>
          )}
        </div>
      </section>
      <button type="button" class="btn btn-primary btn-lg btn-block" onClick={() => navigate(paths.home, { replace: true })}>
        {t.send.backHome}
      </button>
      <button type="button" class="btn btn-ghost" onClick={onNew}>
        {t.send.newSend}
      </button>
    </div>
  );
}

export function Send(): JSX.Element | null {
  const k = keys.value;
  const [addressInput, setAddressInput] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [quick, setQuick] = useState<Quick>(null);
  const [fromQr, setFromQr] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'form' });

  useEffect(() => {
    void loadFeeRate();
  }, []);

  const fee = feeInfo.value;
  const feeRate = fee?.rate ?? null;
  const total = balance.value.total;
  const check = useMemo(() => checkAddress(addressInput), [addressInput]);
  const recipient = check.ok ? { address: check.address, script: check.script } : null;
  const sendAll = quick === 'all';
  const amount = sendAll ? undefined : parseSatsInput(amountInput);

  const plan = useMemo(() => {
    if (!recipient || feeRate === null || !k) return null;
    if (!sendAll && amountInput.trim() === '') return null;
    return planTransaction({
      utxos: spendable.value,
      recipient,
      change: { address: k.address, script: k.outputScript },
      feeRate,
      // testo non numerico → NaN → errore "importo non valido"
      amount: amount ?? Number.NaN,
      sendAll,
    });
  }, [recipient?.address, feeRate, amount, sendAll, amountInput, spendable.value, k]);

  // Con "Tutto" mostriamo nel campo l'importo calcolato (saldo − fee).
  const maxForRecipient = useMemo(() => {
    if (feeRate === null || !k) return 0;
    return maxSendable(spendable.value, recipient?.script ?? k.outputScript, feeRate);
  }, [feeRate, spendable.value, recipient?.address, k]);

  const applyRequest = useCallback((request: PaymentRequest) => {
    setAddressInput(request.address);
    setAddressTouched(true);
    if (request.amountSats) {
      setAmountInput(String(request.amountSats));
      setQuick(null);
      setFromQr(request.amountSats);
    }
  }, []);

  const onScan = useCallback(
    (request: PaymentRequest) => {
      setScanning(false);
      applyRequest(request);
    },
    [applyRequest],
  );

  if (!k) return null;

  if (phase.name === 'success') {
    return (
      <Success
        txid={phase.txid}
        amount={phase.amount}
        fee={phase.fee}
        onNew={() => {
          setAddressInput('');
          setAmountInput('');
          setQuick(null);
          setFromQr(null);
          setAddressTouched(false);
          setPhase({ name: 'form' });
        }}
      />
    );
  }

  if (phase.name === 'sending') {
    return (
      <div class="result" role="status">
        <div class="result-icon ok">
          <Icon name="refresh" class="spin" />
        </div>
        <h1>{t.send.sending}</h1>
      </div>
    );
  }

  if (phase.name === 'error') {
    return (
      <div class="stack" style={{ gap: '16px' }}>
        <div class="result">
          <div class="result-icon ko">
            <Icon name="alert" />
          </div>
          <h1>{t.send.errorTitle}</h1>
        </div>
        <Message kind="error">{sendErrorText(phase.error)}</Message>
        {phase.error.code === 'chain-limit' && <SectionTitle topic="unconfirmed">{explain.unconfirmed.title}</SectionTitle>}
        {phase.error.code === 'rejected' && (
          <details class="details">
            <summary>
              {t.send.details}
              <Icon name="chevronDown" class="chev" />
            </summary>
            <p class="mono small">{phase.error.message}</p>
          </details>
        )}
        <button type="button" class="btn btn-primary btn-lg btn-block" onClick={() => setPhase({ name: 'form' })}>
          {t.common.retry}
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => navigate(paths.home, { replace: true })}>
          {t.send.backHome}
        </button>
      </div>
    );
  }

  const addressError = addressInput.trim() !== '' && (addressTouched || addressInput.trim().length >= 40) ? addressErrorText(check) : null;
  const planError = plan && !plan.ok ? planErrorText(plan.error) : null;
  const ready = plan?.ok === true;

  const setPercent = (q: '25' | '50') => {
    const fraction = q === '25' ? 0.25 : 0.5;
    setQuick(q);
    setFromQr(null);
    setAmountInput(String(Math.floor(total * fraction)));
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      applyRequest(parsePaymentRequest(text));
    } catch {
      showToast(t.send.pasteFailed, 'error');
    }
  };

  const confirm = async () => {
    if (!plan?.ok || !recipient || feeRate === null) return;
    setPhase({ name: 'sending' });
    const result = await sendPayment({ recipient, amount: sendAll ? undefined : (amount ?? undefined), sendAll, feeRate });
    if (result.ok) setPhase({ name: 'success', txid: result.txid, amount: result.plan.amount, fee: result.signed.fee });
    else setPhase({ name: 'error', error: result.error });
  };

  return (
    <div class="stack" style={{ gap: '16px' }}>
      <h1 class="page-title">{t.send.title}</h1>

      <section class="card stack">
        <Explainable topic="recipient" label={<label for="send-address">{t.send.recipient}</label>}>
          <textarea
            id="send-address"
            class={`input mono address-input${addressError ? ' invalid' : ''}`}
            style={{ marginTop: '8px' }}
            rows={2}
            value={addressInput}
            placeholder={t.send.recipientPlaceholder}
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            aria-invalid={Boolean(addressError)}
            aria-describedby={addressError ? 'send-address-error' : undefined}
            onInput={(e) => setAddressInput((e.currentTarget as HTMLTextAreaElement).value.replace(/\s+/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
            onBlur={() => setAddressTouched(true)}
            data-testid="send-address"
          />
        </Explainable>
        <div class="btn-row">
          <button type="button" class="btn btn-outline" onClick={() => void paste()}>
            <Icon name="paste" />
            {t.send.paste}
          </button>
          <button type="button" class="btn btn-outline" onClick={() => setScanning(true)}>
            <Icon name="scan" />
            {t.send.scan}
          </button>
        </div>
        {addressError && (
          <div id="send-address-error">
            <RichMessage kind="error" text={addressError} />
          </div>
        )}
        {check.ok && check.address === k.address && <Message kind="info">{t.send.selfWarning}</Message>}
      </section>

      <section class="card stack">
        <Explainable topic="amount" label={<label for="send-amount">{t.send.amount}</label>}>
          <div class="amount-input" style={{ marginTop: '8px' }}>
            <input
              id="send-amount"
              class="input"
              inputMode="numeric"
              pattern="[0-9.]*"
              autocomplete="off"
              placeholder={t.send.amountPlaceholder}
              value={sendAll ? String(maxForRecipient) : amountInput}
              onInput={(e) => {
                setAmountInput((e.currentTarget as HTMLInputElement).value);
                setQuick(null);
                setFromQr(null);
              }}
              data-testid="send-amount"
            />
            <span class="unit">{t.common.sats}</span>
          </div>
        </Explainable>
        <div class="muted small">
          <Btc value={sendAll ? maxForRecipient : (amount ?? 0)} />
        </div>
        <div class="chips">
          <button type="button" class="chip" aria-pressed={quick === '25'} onClick={() => setPercent('25')}>
            {t.send.quick25}
          </button>
          <button type="button" class="chip" aria-pressed={quick === '50'} onClick={() => setPercent('50')}>
            {t.send.quick50}
          </button>
          <button
            type="button"
            class="chip"
            aria-pressed={quick === 'all'}
            onClick={() => {
              setQuick('all');
              setFromQr(null);
            }}
          >
            {t.send.quickAll}
          </button>
        </div>
        <div class="muted small">{t.send.available(formatSats(total))}</div>
        {fromQr !== null && <Message kind="info">{t.send.amountFromQr(formatSats(fromQr))}</Message>}
        {planError && <RichMessage kind="error" text={planError} />}
        {feeRate === null && <p class="muted small">{t.send.feeLoading}</p>}
        {fee && !fee.fromApi && <p class="muted small">{t.send.feeFallback}</p>}
      </section>

      {plan?.ok && <Summary plan={plan.plan} />}

      {ready && (
        <>
          <SlideToConfirm label={t.send.slide} onConfirm={() => void confirm()} />
          <InlineExplain topic="sign">
            <span class="muted small">{explain.sign.title}</span>
          </InlineExplain>
        </>
      )}

      {scanning && <Scanner onResult={onScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

