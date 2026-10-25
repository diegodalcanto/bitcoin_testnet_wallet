import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { checkAddress, parsePaymentRequest, type PaymentRequest } from '../address';
import { t } from '../i18n/it';
import { Message } from './common';
import { Icon } from './icons';

type ScannerState = 'starting' | 'running' | 'denied' | 'no-camera' | 'failed';

interface ScannerInstance {
  start(): Promise<void>;
  stop(): void;
  destroy(): void;
  hasFlash(): Promise<boolean>;
  toggleFlash(): Promise<void>;
  isFlashOn(): boolean;
}

function errorState(err: unknown): ScannerState {
  const text = String((err as Error)?.name ?? '') + ' ' + String((err as Error)?.message ?? err);
  if (/NotAllowed|Permission|denied|SecurityError/i.test(text)) return 'denied';
  if (/not found|NotFound|OverconstrainedError|no camera/i.test(text)) return 'no-camera';
  return 'failed';
}

/**
 * Lettura QR con la fotocamera posteriore (qr-scanner funziona anche su Safari iOS, dove
 * BarcodeDetector non c'è). Torcia se disponibile; permesso negato → ripiego su Incolla.
 */
export function Scanner({ onResult, onClose }: { onResult: (request: PaymentRequest) => void; onClose: () => void }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<ScannerInstance | null>(null);
  const [state, setState] = useState<ScannerState>('starting');
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: QrScanner } = await import('qr-scanner');
        if (cancelled || !videoRef.current) return;
        if (!(await QrScanner.hasCamera())) {
          setState('no-camera');
          return;
        }
        const scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (done.current) return;
            const request = parsePaymentRequest(result.data);
            const check = checkAddress(request.address);
            if (check.ok) {
              done.current = true;
              scanner.stop();
              onResult({ ...request, address: check.address });
            } else {
              setRejected(check.error === 'mainnet' ? t.errors.address.mainnet : check.error === 'lightning' ? t.errors.address.lightning : t.scanner.notAddress);
            }
          },
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 8,
            returnDetailedScanResult: true,
          },
        );
        scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) {
          scanner.destroy();
          return;
        }
        setState('running');
        setHasFlash(await scanner.hasFlash().catch(() => false));
      } catch (err) {
        if (!cancelled) setState(errorState(err));
      }
    })();
    return () => {
      cancelled = true;
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [onResult]);

  const failure =
    state === 'denied' ? t.scanner.denied : state === 'no-camera' ? t.scanner.noCamera : state === 'failed' ? t.scanner.failed : null;

  return (
    <div class="overlay" onClick={onClose}>
      <div class="sheet stack" role="dialog" aria-modal="true" aria-labelledby="scanner-title" onClick={(e) => e.stopPropagation()}>
        <div class="spread">
          <h2 id="scanner-title">{t.scanner.title}</h2>
          <button type="button" class="icon-btn" aria-label={t.common.close} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {failure ? (
          <Message kind="warning">{failure}</Message>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <video ref={videoRef} class="scanner-video" muted playsInline />
            </div>
            <p class="muted small center">{t.scanner.hint}</p>
            {rejected && <Message kind="error">{rejected}</Message>}
            {hasFlash && (
              <button
                type="button"
                class="btn btn-outline"
                onClick={async () => {
                  await scannerRef.current?.toggleFlash();
                  setFlashOn(Boolean(scannerRef.current?.isFlashOn()));
                }}
              >
                <Icon name="torch" />
                {flashOn ? t.scanner.torchOff : t.scanner.torchOn}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
