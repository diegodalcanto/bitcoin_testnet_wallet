import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';

/** QR code in SVG (nitido a qualsiasi dimensione), moduli blu notte su bianco. */
export function QrCode({ text, label }: { text: string; label: string }): JSX.Element {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0b1430', light: '#ffffff' } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(''));
    return () => {
      cancelled = true;
    };
  }, [text]);
  // Il markup è generato dalla libreria a partire dal nostro testo: nessun contenuto esterno.
  return <div class="qr-box" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
