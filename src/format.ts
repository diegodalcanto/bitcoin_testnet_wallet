/** Formattazione di importi e tempi in italiano. Gli importi sono sempre sats interi. */

const MINUS = '−';

/** 1234567 → "1.234.567" (separatore delle migliaia sempre presente). */
export function formatSats(sats: number): string {
  const sign = sats < 0 ? MINUS : '';
  const digits = Math.abs(Math.trunc(sats)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 12345 sats → "0,00012345" (tBTC, sempre 8 decimali). */
export function formatBtc(sats: number): string {
  const sign = sats < 0 ? MINUS : '';
  const abs = Math.abs(Math.trunc(sats));
  const whole = Math.floor(abs / 100_000_000);
  const fraction = (abs % 100_000_000).toString().padStart(8, '0');
  return `${sign}${formatSats(whole)},${fraction}`;
}

/** Importo con segno esplicito: +1.000 / −1.000. */
export function formatSignedSats(sats: number): string {
  return sats > 0 ? `+${formatSats(sats)}` : formatSats(sats);
}

/**
 * Interpreta l'importo scritto dall'utente in sats: accetta "10000", "10.000", "10 000".
 * Restituisce null se non è un numero intero.
 */
export function parseSatsInput(input: string): number | null {
  const s = input.trim().replace(/[\s.'’_]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

const dateTimeFormat = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

/** Timestamp in secondi (come nei blocchi) → "25 ott 2026, 14:05". */
export function formatDateTime(unixSeconds: number): string {
  return dateTimeFormat.format(new Date(unixSeconds * 1000));
}

export function formatTime(ms: number): string {
  return timeFormat.format(new Date(ms));
}

/** Minuti interi trascorsi (mai negativi: l'orario dei blocchi può essere un po' avanti). */
export function minutesSince(unixSeconds: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - unixSeconds * 1000) / 60_000));
}

/** Testo breve per una durata in minuti: "adesso", "4 min", "1 h 5 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'meno di 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Raggruppa un indirizzo o un txid a blocchi di 4 caratteri per leggerlo meglio. */
export function groupChars(text: string, size = 4): string {
  return text.match(new RegExp(`.{1,${size}}`, 'g'))?.join(' ') ?? text;
}

/** txid abbreviato: "a1b2c3d4…e5f6". */
export function shortTxid(txid: string): string {
  return txid.length > 16 ? `${txid.slice(0, 8)}…${txid.slice(-6)}` : txid;
}
