import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Icon } from './icons';

const THUMB = 56;
const PADDING = 4;

/** Conferma con gesto di scorrimento, come nei wallet reali. Con la tastiera: Invio. */
export function SlideToConfirm({ label, onConfirm, disabled = false }: { label: string; onConfirm: () => void; disabled?: boolean }): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; pointer: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);

  const maxOffset = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - THUMB - PADDING * 2);

  const finish = (confirmed: boolean) => {
    setAnimate(true);
    if (confirmed) {
      setOffset(maxOffset());
      onConfirm();
    } else {
      setOffset(0);
    }
  };

  return (
    <div class={`slider${animate ? ' animate' : ''}`} ref={trackRef} aria-disabled={disabled}>
      <div class="slider-fill" style={{ width: `${offset + THUMB + PADDING * 2}px` }} />
      <div class="slider-label" style={{ opacity: Math.max(0, 1 - offset / 160) }}>
        {label}
      </div>
      <button
        type="button"
        class="slider-thumb"
        aria-label={label}
        disabled={disabled}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          if (disabled) return;
          setAnimate(false);
          start.current = { x: e.clientX - offset, pointer: e.pointerId };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current || start.current.pointer !== e.pointerId) return;
          setOffset(Math.min(maxOffset(), Math.max(0, e.clientX - start.current.x)));
        }}
        onPointerUp={(e) => {
          if (!start.current || start.current.pointer !== e.pointerId) return;
          start.current = null;
          finish(offset >= maxOffset() * 0.85);
        }}
        onPointerCancel={() => {
          start.current = null;
          finish(false);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            finish(true);
          }
        }}
      >
        <Icon name="arrowRight" />
      </button>
    </div>
  );
}
