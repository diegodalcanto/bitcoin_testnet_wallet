import { useEffect, useRef, useState } from 'preact/hooks';

/** Ora corrente che si aggiorna da sola (per "x minuti fa"). */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing';

const THRESHOLD = 70;

/** Trascina verso il basso dalla cima della pagina per aggiornare (pull-to-refresh). */
export function usePullToRefresh(onRefresh: () => Promise<void>): { distance: number; state: PullState } {
  const [distance, setDistance] = useState(0);
  const [state, setState] = useState<PullState>('idle');
  const startY = useRef<number | null>(null);
  const busy = useRef(false);
  const latest = useRef({ distance: 0, onRefresh });
  latest.current.onRefresh = onRefresh;

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (busy.current || window.scrollY > 0 || e.touches.length !== 1) return;
      startY.current = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const delta = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        latest.current.distance = 0;
        setDistance(0);
        setState('idle');
        return;
      }
      const d = Math.min(120, delta * 0.5);
      latest.current.distance = d;
      setDistance(d);
      setState(d >= THRESHOLD ? 'ready' : 'pulling');
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (latest.current.distance >= THRESHOLD) {
        busy.current = true;
        setState('refreshing');
        setDistance(48);
        latest.current
          .onRefresh()
          .catch(() => undefined)
          .finally(() => {
            busy.current = false;
            setDistance(0);
            setState('idle');
          });
      } else {
        setDistance(0);
        setState('idle');
      }
      latest.current.distance = 0;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return { distance, state };
}
