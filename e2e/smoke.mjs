/**
 * Smoke test nel browser (Chromium) con API Esplora simulate.
 * Uso: npm run test:e2e   (compila e avvia `vite preview` da solo)
 * Screenshot in e2e/screenshots/ per il controllo visivo.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { Transaction } from 'bitcoinjs-lib';
import { chromium } from 'playwright';
import { MockEsplora } from './mock-esplora.mjs';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE = `http://localhost:${PORT}/bitcoin_testnet_wallet/`;
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEVICE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'it-IT' };
const RECIPIENT = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

let failures = 0;
/** Pagina in uso: in caso di errore se ne salva uno screenshot. */
let currentPage = null;
function check(condition, message) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

async function startPreview() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return server;
    } catch {
      // non ancora pronto
    }
    await sleep(200);
  }
  server.kill();
  throw new Error('vite preview non si avvia');
}

async function newContext(browser, mock, { ua = ANDROID_UA, colorScheme = 'light', serviceWorkers = 'block' } = {}) {
  const context = await browser.newContext({ ...DEVICE, userAgent: ua, colorScheme, serviceWorkers });
  await context.route(/^https:\/\/(mempool\.space|blockstream\.info)\//, async (route) => {
    const request = route.request();
    if (mock.offline) return route.abort('internetdisconnected');
    const url = new URL(request.url());
    const m = /^\/(signet|testnet4|testnet)\/api(\/.*)$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, body: 'not found' });
    mock.lastBase = `${url.origin}/${m[1]}/api`;
    const res = mock.handle(request.method(), m[2], request.postData());
    const headers = { 'access-control-allow-origin': '*' };
    if (res.json !== undefined) return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(res.json) });
    if (res.text !== undefined) return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'text/plain' }, body: res.text });
    return route.fulfill({ status: res.status, headers, body: res.body });
  });
  const page = await context.newPage();
  currentPage = page;
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(msg.text()) && page.errors.push(msg.text()));
  return { context, page };
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });

/** Forza un aggiornamento (l'app riaggiorna quando torna la connessione). */
const poke = (page) => page.evaluate(() => window.dispatchEvent(new Event('online')));

async function readWords(page) {
  return page.$$eval('[data-testid="mnemonic-words"] li', (items) => items.map((li) => li.lastChild?.textContent?.trim() ?? ''));
}

async function createWallet(page) {
  await page.getByRole('button', { name: 'Crea nuovo wallet' }).click();
  await page.waitForSelector('[data-testid="mnemonic-words"]');
  const words = await readWords(page);
  await shot(page, '03-words');
  await page.getByRole('button', { name: 'Le ho scritte' }).click();
  for (let i = 0; i < 2; i++) {
    const question = await page.getByText(/Qual è la parola n\. \d+\?/).textContent();
    const n = Number(/n\. (\d+)/.exec(question)[1]);
    if (i === 0) await shot(page, '03b-confirm');
    await page.getByRole('button', { name: words[n - 1], exact: true }).click();
  }
  await page.waitForSelector('[data-testid="balance"]');
  return words;
}

async function receiveAddress(page) {
  await page.getByRole('button', { name: 'Ricevi' }).click();
  const text = await page.locator('[data-testid="receive-address"]').textContent();
  return text.replace(/\s+/g, '');
}

async function slide(page) {
  const thumb = page.locator('.slider-thumb');
  const track = page.locator('.slider');
  await track.scrollIntoViewIfNeeded();
  const tb = await thumb.boundingBox();
  const kb = await track.boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(tb.x + tb.width / 2 + ((kb.width - tb.width) * i) / 10, tb.y + tb.height / 2);
  await page.mouse.up();
}

async function fillSend(page, address, amount) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Invia', exact: true }).click();
  await page.fill('[data-testid="send-address"]', address);
  await page.locator('[data-testid="send-address"]').blur();
  if (amount === 'all') await page.getByRole('button', { name: 'Tutto' }).click();
  else await page.fill('[data-testid="send-amount"]', String(amount));
}

async function send(page, address, amount, { drag = false } = {}) {
  await fillSend(page, address, amount);
  await page.waitForSelector('[data-testid="send-summary"]');
  if (drag) await slide(page);
  else {
    await page.locator('.slider-thumb').focus();
    await page.keyboard.press('Enter');
  }
}

const decode = (hex) => Transaction.fromHex(hex);
const outpoint = (input) => `${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`;

async function main() {
  const server = await startPreview();
  const browser = await chromium.launch();
  try {
    // ------------------------------------------------------------------ onboarding + invii
    console.log('Onboarding, ricezione e 5 invii consecutivi non confermati');
    const mock = new MockEsplora();
    const { context, page } = await newContext(browser, mock);
    await page.goto(BASE);
    await page.getByText('Prima installa l’app').waitFor();
    await shot(page, '01-install-android');
    check(await page.getByTestId('network-badge').textContent().then((t) => /Signet.*soldi finti/.test(t)), 'badge "Signet – soldi finti" visibile anche nella guida');
    await page.getByRole('button', { name: 'Continua nel browser' }).click();
    await page.getByText('Benvenuto nel laboratorio Bitcoin').waitFor();
    check(await page.getByText('Laboratorio didattico – Internet Festival, Pisa').isVisible(), 'dicitura del laboratorio nel benvenuto');
    check((await page.locator('img[alt="Bitcoin Meetup Pisa"]').count()) > 0 && (await page.locator('img[alt^="Internet Festival"]').count()) > 0, 'loghi nel benvenuto');
    await shot(page, '02-welcome');

    const words = await createWallet(page);
    check(words.length === 12, 'frase di 12 parole');
    await shot(page, '04-home-empty');
    check((await page.locator('.footer-logos img').count()) === 2, 'loghi nel piè di pagina della Home');

    const address = await receiveAddress(page);
    check(/^tb1q[0-9a-z]{38}$/.test(address), `indirizzo tb1q… (${address})`);
    await shot(page, '05-receive');

    const t0 = Date.now();
    mock.fund(address, 100_000, { confirmed: false });
    await poke(page);
    await page.getByText(/Pagamento in arrivo: \+100\.000 sats/).waitFor({ timeout: 20_000 });
    check(Date.now() - t0 < 20_000, `pagamento non confermato visto in ${Date.now() - t0} ms`);
    await shot(page, '06-receive-arrived');

    await page.goto(BASE);
    await page.getByTestId('balance').getByText('100.000').waitFor();
    check(/100\.000 sats in attesa/.test(await page.getByTestId('pending-line').textContent()), 'saldo "di cui in attesa di conferma"');
    await shot(page, '07-home-funded');

    // API "in ritardo": non vedrà nessuno dei 5 invii.
    mock.freeze();
    const started = Date.now();
    const txids = [];
    for (let i = 0; i < 5; i++) {
      await send(page, RECIPIENT, 5_000 + i, { drag: i === 0 });
      await page.getByRole('heading', { name: 'Inviato!' }).waitFor({ timeout: 15_000 });
      txids.push((await page.getByTestId('success-txid').textContent()).trim());
      if (i === 0) await shot(page, '10-send-success');
    }
    const elapsed = Date.now() - started;
    check(elapsed < 120_000, `5 invii consecutivi in ${Math.round(elapsed / 1000)} s (< 2 minuti)`);
    check(mock.broadcasts.length === 5, '5 transazioni trasmesse');
    const decoded = mock.broadcasts.map(decode);
    let chained = true;
    for (let i = 1; i < decoded.length; i++) {
      const prevId = decoded[i - 1].getId();
      chained &&= decoded[i].ins.length === 1 && outpoint(decoded[i].ins[0]) === `${prevId}:1`;
    }
    check(chained, 'ogni invio spende il resto del precedente (catena lineare)');
    check(decoded.every((tx) => tx.ins.every((input) => input.sequence === 0xffffffff)), 'nSequence 0xffffffff (niente RBF)');
    check(txids.every((id, i) => id === decoded[i].getId()), 'txid mostrati = txid trasmessi');

    // Riepilogo e "Cosa succede" prima dell'invio
    await fillSend(page, RECIPIENT, 2_000);
    await page.waitForSelector('[data-testid="send-summary"]');
    await shot(page, '08-send-summary');
    await page.locator('summary', { hasText: 'Cosa succede' }).click();
    await shot(page, '09-send-details');
    check(await page.getByText('resto, torna a te').isVisible(), '"Cosa succede" mostra il resto');

    mock.unfreeze();
    await page.goto(BASE);
    await poke(page);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="tx-row"]').length >= 6, null, { timeout: 20_000 });
    const balanceText = await page.getByTestId('balance').textContent();
    check(balanceText.includes(String(Number(decoded.at(-1).outs[1].value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')), `saldo = ultimo resto (${balanceText.trim()})`);
    await shot(page, '11-home-history');

    // Nuovo blocco: tutto confermato
    mock.mine();
    await poke(page);
    await page.getByText('tutto confermato').waitFor({ timeout: 20_000 });
    check(true, 'dopo un blocco il saldo risulta confermato');

    // ------------------------------------------------------------------ errori
    console.log('Errori e ritentativi');
    mock.failNextBroadcast.push('too-long-mempool-chain, too many unconfirmed ancestors [limit: 25]');
    await send(page, RECIPIENT, 1_000);
    await page.getByText(/Troppe transazioni in attesa/).waitFor();
    check(await page.getByText(/L’ultimo blocco è arrivato/).isVisible(), 'catena troppo lunga: messaggio con il tempo dall’ultimo blocco');
    await shot(page, '12-send-chain-limit');

    const before = mock.broadcasts.length;
    mock.failNextBroadcast.push('min relay fee not met, 100 < 141');
    await send(page, RECIPIENT, 1_000);
    await page.getByRole('heading', { name: 'Inviato!' }).waitFor({ timeout: 15_000 });
    const [rejected, retried] = mock.broadcasts.slice(before).map(decode);
    const outsSum = (tx) => tx.outs.reduce((s, o) => s + Number(o.value), 0);
    check(retried && outsSum(retried) < outsSum(rejected), 'fee troppo bassa: ritentato una volta con fee doppia');

    await fillSend(page, 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 1_000);
    await page.getByText(/indirizzo di Bitcoin vero \(mainnet\)/).waitFor();
    check(true, 'indirizzo mainnet rifiutato prima di firmare');
    await shot(page, '13-send-mainnet');

    await fillSend(page, RECIPIENT, 10_000_000);
    await page.getByText(/Saldo insufficiente/).waitFor();
    check(true, 'saldo insufficiente segnalato prima di firmare');

    // ------------------------------------------------------------------ altre schermate
    console.log('Dettaglio, chiavi, monete, impara, impostazioni');
    await page.goto(BASE);
    await page.locator('[data-testid="tx-row"]').first().click();
    await page.getByTestId('tx-detail-txid').waitFor();
    await page.getByText('Transazione grezza').first().click();
    await page.locator('.raw-hex').waitFor();
    check(/^0200000000010/.test((await page.locator('.raw-hex').textContent()).trim()), 'transazione grezza segwit in esadecimale');
    await shot(page, '14-tx-detail');

    await page.goto(`${BASE}#/chiavi`);
    await page.getByTestId('keys-phrase').getByRole('button', { name: 'Mostra' }).click();
    const shownWords = await page.$$eval('[data-testid="keys-phrase"] li', (items) => items.map((li) => li.lastChild?.textContent?.trim()));
    check(shownWords.join(' ') === words.join(' '), 'Le mie chiavi mostra la stessa frase');
    check(await page.locator('p.mono', { hasText: "m/84'/1'/0'/0/0" }).isVisible(), 'percorso di derivazione');
    check((await page.getByText(/^vpub/).count()) > 0 && (await page.getByText(/^tpub/).count()) > 0, 'vpub e tpub');
    await shot(page, '15-keys');

    await page.goto(`${BASE}#/monete`);
    await page.getByTestId('coins-summary').waitFor();
    check(/1 moneta/.test(await page.getByTestId('coins-summary').textContent()), 'dopo il consolidamento resta una sola moneta');
    await shot(page, '16-coins');

    await page.goto(`${BASE}#/impara`);
    check((await page.getByTestId('learn-card').count()) >= 6, 'guida Impara con almeno 6 schede');
    await shot(page, '17-learn');
    await page.getByRole('button', { name: 'Successiva' }).click();
    await page.getByText('2 di 8').waitFor();

    await page.goto(`${BASE}#/impostazioni`);
    await shot(page, '18-settings');
    await page.getByLabel(/Testnet4/).check();
    await page.getByTestId('network-badge').getByText('Testnet4').waitFor();
    await poke(page);
    await page.waitForTimeout(800);
    check(mock.lastBase === 'https://mempool.space/testnet4/api', 'cambio rete: le richieste vanno a Testnet4');
    await page.getByLabel(/Signet/).check();
    await page.getByTestId('network-badge').getByText('Signet').waitFor();

    await page.getByRole('button', { name: 'Scuro' }).click();
    await page.goto(BASE);
    await page.getByTestId('balance').waitFor();
    await shot(page, '19-home-dark');
    await page.goto(`${BASE}#/info`);
    check(await page.getByText('Laboratorio didattico – Internet Festival, Pisa').isVisible(), 'dicitura e loghi in Info');
    await shot(page, '20-info-dark');
    check(page.errors.length === 0, `nessun errore JavaScript (${page.errors.join(' | ')})`);
    await context.close();

    // ------------------------------------------------------------------ ripristino + PIN + offline
    console.log('Ripristino, PIN e apertura offline');
    const mock2 = new MockEsplora();
    const second = await newContext(browser, mock2, { serviceWorkers: 'allow', colorScheme: 'dark' });
    const p2 = second.page;
    await p2.goto(BASE);
    await p2.getByRole('button', { name: 'Continua nel browser' }).click();
    await p2.getByRole('button', { name: 'Ripristina wallet' }).click();
    await p2.getByRole('textbox').fill('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn');
    await p2.getByRole('button', { name: 'Ripristina' }).click();
    await p2.getByText(/chiave di Bitcoin vero \(mainnet\)/).waitFor();
    check(true, 'WIF mainnet rifiutata');
    await p2.getByRole('textbox').fill(ABANDON);
    await p2.getByRole('button', { name: 'Ripristina' }).click();
    await p2.getByTestId('balance').waitFor();
    const restored = await receiveAddress(p2);
    check(restored === 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl', 'dalla frase nota si ottiene l’indirizzo atteso');
    mock2.fund(restored, 42_000);
    await p2.goto(BASE);
    await p2.getByTestId('balance').getByText('42.000').waitFor({ timeout: 20_000 });
    await shot(p2, '21-home-restored-dark');

    await p2.goto(`${BASE}#/pin`);
    const typePin = async (pin) => {
      for (const d of pin) await p2.locator('.keypad').getByRole('button', { name: d, exact: true }).click();
    };
    await typePin('1234');
    await p2.getByText('Ripeti il PIN').waitFor();
    await typePin('1234');
    await p2.getByTestId('balance').waitFor();
    await p2.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active);
    });
    await p2.reload();
    await p2.getByText('Inserisci il PIN').waitFor();
    await shot(p2, '22-lock');
    await typePin('0000');
    await p2.getByText('PIN sbagliato').waitFor();
    await typePin('1234');
    await p2.getByTestId('balance').waitFor();
    check(true, 'PIN: sbagliato rifiutato, giusto accettato');

    // Offline: l'app si apre dalla cache del service worker e mostra l'ultimo saldo noto.
    mock2.offline = true;
    await second.context.setOffline(true);
    await p2.reload();
    await typePin('1234');
    await p2.getByTestId('balance').getByText('42.000').waitFor();
    await p2.getByText(/Offline – ultimo saldo noto|Server non raggiungibile/).waitFor({ timeout: 10_000 });
    await shot(p2, '23-offline');
    check(true, 'offline: si apre e mostra l’ultimo saldo noto');
    await second.context.close();

    // ------------------------------------------------------------------ iPhone in Safari
    console.log('iPhone in Safari (non installata)');
    const third = await newContext(browser, new MockEsplora(), { ua: IPHONE_UA });
    await third.page.goto(BASE);
    await third.page.getByText(/Aggiungi alla schermata Home/).first().waitFor();
    check(await third.page.getByText(/memoria separata da Safari/).isVisible(), 'iOS: spiega perché creare il wallet nell’app installata');
    await shot(third.page, '24-install-ios');
    await third.context.close();
  } catch (err) {
    if (currentPage) {
      await currentPage.screenshot({ path: `${SHOTS}failure.png`, fullPage: true }).catch(() => undefined);
      console.error('Errori nella pagina:', currentPage.errors);
    }
    throw err;
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures === 0 ? '\nTutto ok' : `\n${failures} controlli falliti`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
